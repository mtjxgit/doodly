const DrawingState = require('./drawing-state');

/**
 * RoomManager - Manages rooms and handles socket connections
 * - Implements operation ordering by timestamp
 * - Handles conflict resolution for global undo/redo
 * - Manages user sessions and reconnections
 *
 * --- OPTIMIZATIONS (v2) ---
 * - Fixed: Room-switching bug that left "ghost" users in old rooms.
 * - Perf: Caches room list to avoid expensive disk reads on every request.
 * - Perf: Debounces global room list broadcasts to reduce network spam.
 * - Perf: Optimized shape preview clearing to not send to the sender.
 */
class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    
    // Track user sessions for reconnection
    this.userSessions = new Map(); // sessionId -> { roomName, user }

    // --- OPTIMIZATION: Cache & Debounce ---
    this.roomListCache = null;
    this.roomListCacheTime = 0;
    this.broadcastRoomListTimeout = null;
  }

  handleConnection(socket) {
    const { roomName, username, color, sessionId } = socket.handshake.query;

    if (!roomName || !username || !color) {
      socket.emit('server:error', { message: 'Missing connection parameters' });
      socket.disconnect();
      return;
    }

    const user = {
      id: socket.id,
      name: username,
      color: color,
      sessionId: sessionId || socket.id
    };

    // --- FIX: Handle Room-Switching ---
    const existingSession = this.userSessions.get(user.sessionId);
    if (existingSession) {
      const oldRoomName = existingSession.roomName;
      const oldUser = existingSession.user;
      const oldRoom = this.rooms.get(oldRoomName);

      if (oldRoom && oldRoom.users.has(oldUser.id)) {
        if (oldRoomName === roomName) {
          // This is a simple reconnection to the *same* room
          console.log(`🔄 ${user.name} reconnected to room: ${roomName}`);
          oldRoom.users.delete(oldUser.id); // Clean up old socket
          socket.emit('server:reconnected', { message: 'Reconnected successfully' });
        } else {
          // This is a *room switch*
          console.log(`🏃 ${user.name} switched from '${oldRoomName}' to '${roomName}'`);
          // Immediately remove user from the *old* room
          oldRoom.users.delete(oldUser.id);
          
          // Immediately notify the *old* room
          this.io.to(oldRoomName).emit('user:left', oldUser);
          const oldUserList = Array.from(oldRoom.users.values());
          this.io.to(oldRoomName).emit('users:load', oldUserList);
          
          // Check if old room is now empty
          this.checkEmptyRoom(oldRoomName);
          // Update global room list for everyone
          this.debouncedBroadcastRoomList();
        }
      }
    }
    // --- END FIX ---

    // Store/update session with the new socket ID
    this.userSessions.set(user.sessionId, { roomName, user });

    this.joinRoom(socket, roomName, user);
    this.setupSocketHandlers(socket, roomName, user);
  }

  joinRoom(socket, roomName, user) {
    // Find or create room
    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, {
        name: roomName,
        users: new Map(),
        state: new DrawingState(roomName),
        lastOperationTime: Date.now()
      });
      // --- OPTIMIZATION: Bust cache and update list ---
      this.bustRoomListCache();
      this.debouncedBroadcastRoomList();
      console.log(`🚪 New room created: ${roomName}`);
    }

    const room = this.rooms.get(roomName);
    room.users.set(socket.id, user);
    socket.join(roomName);

    const userList = Array.from(room.users.values());
    this.io.to(roomName).emit('users:load', userList);

    const history = room.state.getHistory();
    socket.emit('server:history:load', history);

    // Send available rooms list (use cache)
    socket.emit('server:rooms:list', this.getRoomList());

    socket.to(roomName).emit('user:joined', user);

    console.log(`✅ ${user.name} joined room: ${roomName} (${userList.length} users)`);
  }

  // Extracted empty room check logic
  checkEmptyRoom(roomName) {
    const room = this.rooms.get(roomName);
    if (room && room.users.size === 0) {
      setTimeout(() => {
        const currentRoom = this.rooms.get(roomName);
        if (currentRoom && currentRoom.users.size === 0) {
          this.rooms.delete(roomName);
          
          this.bustRoomListCache();
          this.debouncedBroadcastRoomList();
          console.log(`🧹 Room ${roomName} deleted (empty)`);
        }
      }, 30000); // 30 second grace period
    } else {
      this.debouncedBroadcastRoomList();
    }
  }

  leaveRoom(socket, roomName, user) {
    const room = this.rooms.get(roomName);
    if (!room) return;

    room.users.delete(socket.id);

    socket.to(roomName).emit('user:left', user);

    const userList = Array.from(room.users.values());
    this.io.to(roomName).emit('users:load', userList);

    this.checkEmptyRoom(roomName); // Use extracted logic

    console.log(`❌ ${user.name} left room: ${roomName}`);
  }

  /**
   * --- OPTIMIZATION: Cache room list ---
   * Get list of all rooms with user counts, using a 5-second cache
   * to prevent blocking disk I/O on every request.
   */
  getRoomList() {
    const now = Date.now();
    if (this.roomListCache && (now - this.roomListCacheTime < 5000)) {
      return this.roomListCache;
    }

    const allRoomNames = new DrawingState('temp').getAllRooms();
    const roomMap = new Map();

    for (const roomName of allRoomNames) {
      roomMap.set(roomName, { name: roomName, userCount: 0 });
    }

    for (const [roomName, roomData] of this.rooms.entries()) {
      roomMap.set(roomName, { name: roomName, userCount: roomData.users.size });
    }

    this.roomListCache = Array.from(roomMap.values());
    this.roomListCacheTime = now;
    return this.roomListCache;
  }

  /**
   * --- OPTIMIZATION: Bust room list cache ---
   */
  bustRoomListCache() {
    this.roomListCache = null;
  }

  /**
   * --- OPTIMIZATION: Debounce global room list broadcast ---
   * Prevents spamming all clients when users rapidly join/leave rooms.
   */
  debouncedBroadcastRoomList() {
    clearTimeout(this.broadcastRoomListTimeout);
    this.broadcastRoomListTimeout = setTimeout(() => {
      this.bustRoomListCache();
      this.io.emit('server:rooms:list', this.getRoomList());
    }, 2000); // Broadcast at most once every 2 seconds
  }

  setupSocketHandlers(socket, roomName, user) {
    const room = this.rooms.get(roomName);
    if (!room) return; // Room might have been cleaned up

    socket.on('client:operation:add', (operation) => {
      try {
        if (!this.validateOperation(operation)) {
          socket.emit('server:error', { message: 'Invalid operation data' });
          return;
        }

        if (!operation.id) {
          operation.id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        if (!operation.timestamp) {
          operation.timestamp = Date.now();
        }

        operation.userId = socket.id;
        operation.userName = user.name;

        const existingOp = room.state.findOperationById(operation.id);
        
        if (existingOp) {
          room.state.updateOperationById(operation);
        } else {
          room.state.addOperation(operation);
        }

        // Broadcast to all (sender needs this for "confirmation")
        this.io.to(roomName).emit('server:operation:add', operation);
        
        if (operation.type === 'shape') {
          // --- OPTIMIZATION: Don't tell sender to clear their own preview ---
          // They already stopped previewing on pointerup.
          socket.to(roomName).emit('server:shape:preview_clear', { userId: socket.id });
        }
        
        room.lastOperationTime = Date.now();

      } catch (error) {
        console.error(`❌ Error processing operation in ${roomName}:`, error);
        socket.emit('server:error', { message: 'Failed to process operation' });
      }
    });

    // Streaming draw updates (real-time) with error handling
    socket.on('client:draw:stream', (data) => {
      try {
        if (!data || !data.operationId) return;
        
        data.userId = socket.id;
        data.userName = user.name;
        data.timestamp = Date.now();
        
        socket.to(roomName).emit('server:draw:stream', data);
      } catch (error) {
        // Silently fail
      }
    });

    // Shape preview (real-time)
    socket.on('client:shape:preview', (data) => {
      try {
        if (!data) return;
        
        const previewData = {
          ...data,
          userId: socket.id,
          userName: user.name,
          userColor: user.color,
          timestamp: Date.now()
        };
        
        socket.to(roomName).emit('server:shape:preview', previewData);
      } catch (error) {
         // Silently fail
      }
    });

    // Global undo with conflict resolution
    socket.on('client:undo', () => {
      try {
        const result = room.state.undo();
        
        if (result.success) {
          this.io.to(roomName).emit('server:history:load', room.state.getHistory());
          this.io.to(roomName).emit('server:operation:undone', {
            operationId: result.undoneOperation?.id,
            userId: socket.id,
            userName: user.name
          });
        } else {
          socket.emit('server:error', { message: 'Nothing to undo' });
        }
      } catch (error) {
        console.error(`❌ Error processing undo:`, error);
        socket.emit('server:error', { message: 'Failed to undo' });
      }
    });

    // Global redo
    socket.on('client:redo', () => {
      try {
        const result = room.state.redo();
        
        if (result.success) {
          this.io.to(roomName).emit('server:history:load', room.state.getHistory());
          this.io.to(roomName).emit('server:operation:redone', {
            operationId: result.redoneOperation?.id,
            userId: socket.id,
            userName: user.name
          });
        } else {
          socket.emit('server:error', { message: 'Nothing to redo' });
        }
      } catch (error) {
        console.error(`❌ Error processing redo:`, error);
        socket.emit('server:error', { message: 'Failed to redo' });
      }
    });

    // Clear canvas
    socket.on('client:clear', () => {
      try {
        room.state.clear();
        this.io.to(roomName).emit('server:history:load', []);
        this.io.to(roomName).emit('server:canvas:cleared', {
          userId: socket.id,
          userName: user.name
        });
      } catch (error)
      {
        console.error(`❌ Error clearing canvas:`, error);
        socket.emit('server:error', { message: 'Failed to clear canvas' });
      }
    });

    // Cursor movement (volatile - not guaranteed delivery)
    socket.on('client:cursor:move', (cursorData) => {
      try {
        socket.volatile.to(roomName).emit('server:cursor:move', {
          ...cursorData,
          userId: socket.id,
          userName: user.name,
          userColor: user.color
        });
      } catch (error) {
        // Silently fail
      }
    });

    // Ping for latency
    socket.on('client:ping', (timestamp) => {
      try {
        socket.emit('server:pong', timestamp);
      } catch (error) {
         // Silently fail
      }
    });

    // Request room list
    socket.on('client:rooms:request', () => {
      try {
        socket.emit('server:rooms:list', this.getRoomList());
      } catch (error) {
        console.error(`❌ Error fetching room list:`, error);
      }
    });

    // Handle socket errors
    socket.on('error', (error) => {
      console.error(`❌ Socket error for ${user.name}:`, error);
    });

    // Disconnect
    socket.on('disconnect', (reason) => {
      console.log(`🔌 ${user.name} disconnected: ${reason}`);
      
      // Grace period for reconnection
      setTimeout(() => {
        // Check if the user is still associated with THIS socket ID
        // If they reconnected, userSessions will have a *new* socket ID
        const currentSession = this.userSessions.get(user.sessionId);
        
        // Only leave if the session wasn't replaced by a new socket
        if ((!currentSession || currentSession.user.id === socket.id)) {
          this.leaveRoom(socket, roomName, user);
          this.userSessions.delete(user.sessionId); // Clean up session
        } else {
          // User already reconnected or switched rooms.
          // The cleanup was handled by `handleConnection`.
          console.log(`... ${user.name}'s old socket cleanup skipped (already reconnected).`);
        }
      }, 5000); // 5 second grace period
    });
  }

  validateOperation(operation) {
    if (!operation || typeof operation !== 'object') return false;
    
    switch (operation.type) {
      case 'stroke':
        return Array.isArray(operation.points) && 
               operation.points.length > 0 &&
               operation.color &&
               typeof operation.width === 'number';
      
      case 'shape':
        return operation.shape &&
               typeof operation.startX === 'number' &&
               typeof operation.startY === 'number' &&
               typeof operation.endX === 'number' &&
               typeof operation.endY === 'number' &&
               operation.color &&
               typeof operation.width === 'number';
      
      default:
        return false;
    }
  }
}

module.exports = RoomManager;