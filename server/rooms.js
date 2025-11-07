const DrawingState = require('./drawing-state');

/**
 * RoomManager - Manages rooms and handles socket connections
 * - Implements operation ordering by timestamp
 * - Handles conflict resolution for global undo/redo
 * - Manages user sessions and reconnections
 */
class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    
    // Track user sessions for reconnection
    this.userSessions = new Map(); // sessionId -> { roomName, user }
  }

  handleConnection(socket) {
    const { roomName, username, color, sessionId } = socket.handshake.query;

    if (!roomName || !username || !color) {
      socket.emit('error', { message: 'Missing connection parameters' });
      socket.disconnect();
      return;
    }

    const user = {
      id: socket.id,
      name: username,
      color: color,
      sessionId: sessionId || socket.id
    };

    // Check for reconnection
    const existingSession = this.userSessions.get(user.sessionId);
    if (existingSession && existingSession.roomName === roomName) {
      console.log(`🔄 ${user.name} reconnected to room: ${roomName}`);
      socket.emit('server:reconnected', { message: 'Reconnected successfully' });
    }

    // Store session
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
        // Track last operation time for conflict resolution
        lastOperationTime: Date.now()
      });
    }

    const room = this.rooms.get(roomName);
    room.users.set(socket.id, user);
    socket.join(roomName);

    // Send full user list to all clients in room
    const userList = Array.from(room.users.values());
    this.io.to(roomName).emit('users:load', userList);

    // Send drawing history to new user only
    const history = room.state.getHistory();
    socket.emit('server:history:load', history);

    // Send available rooms list
    socket.emit('server:rooms:list', this.getRoomList());

    // Notify others of join
    socket.to(roomName).emit('user:joined', user);

    console.log(`✅ ${user.name} joined room: ${roomName} (${userList.length} users)`);
  }

  leaveRoom(socket, roomName, user) {
    const room = this.rooms.get(roomName);
    if (!room) return;

    room.users.delete(socket.id);

    // Notify others of leave
    socket.to(roomName).emit('user:left', user);

    // Send updated user list
    const userList = Array.from(room.users.values());
    this.io.to(roomName).emit('users:load', userList);

    // Clean up empty rooms after delay (allow for reconnection)
    if (room.users.size === 0) {
      setTimeout(() => {
        const currentRoom = this.rooms.get(roomName);
        if (currentRoom && currentRoom.users.size === 0) {
          this.rooms.delete(roomName);
          // Also update room list for all clients
          this.io.emit('server:rooms:list', this.getRoomList());
          console.log(`🧹 Room ${roomName} deleted (empty)`);
        }
      }, 30000); // 30 second grace period
    } else {
      // Broadcast updated room list with new user count
      this.io.emit('server:rooms:list', this.getRoomList());
    }

    console.log(`❌ ${user.name} left room: ${roomName}`);
  }

  /**
   * Get list of all rooms (both active and saved) with user counts.
   */
  getRoomList() {
    const allRoomNames = new DrawingState('temp').getAllRooms();
    const roomMap = new Map();

    // Add all saved rooms with 0 users
    for (const roomName of allRoomNames) {
      roomMap.set(roomName, { name: roomName, userCount: 0 });
    }

    // Add/update active rooms with current user count
    for (const [roomName, roomData] of this.rooms.entries()) {
      roomMap.set(roomName, { name: roomName, userCount: roomData.users.size });
    }

    return Array.from(roomMap.values());
  }

  setupSocketHandlers(socket, roomName, user) {
    const room = this.rooms.get(roomName);

    // Drawing operations with validation
    socket.on('client:operation:add', (operation) => {
      try {
        // Validate operation
        if (!this.validateOperation(operation)) {
          socket.emit('server:error', { message: 'Invalid operation data' });
          return;
        }

        // Ensure operation has required fields
        if (!operation.id) {
          operation.id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        if (!operation.timestamp) {
          operation.timestamp = Date.now();
        }

        // Add user info for tracking
        operation.userId = socket.id;
        operation.userName = user.name;

        // Check for updates vs new operations
        const existingOp = room.state.findOperationById(operation.id);
        
        if (existingOp) {
          // Update existing operation
          room.state.updateOperationById(operation);
        } else {
          // Add new operation with ordering
          room.state.addOperation(operation);
        }

        // Broadcast to all clients (including sender for confirmation)
        this.io.to(roomName).emit('server:operation:add', operation);
        
        // If this was a shape, tell clients to clear the preview for this user
        if (operation.type === 'shape') {
          this.io.to(roomName).emit('server:shape:preview_clear', { userId: socket.id });
        }
        
        // Update room timestamp
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
        
        // Add metadata
        data.userId = socket.id;
        data.userName = user.name;
        data.timestamp = Date.now();
        
        // Broadcast to others only
        socket.to(roomName).emit('server:draw:stream', data);
      } catch (error) {
        console.error(`❌ Error processing draw stream:`, error);
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
        console.error(`❌ Error processing shape preview:`, error);
      }
    });

    // Global undo with conflict resolution
    socket.on('client:undo', () => {
      try {
        const result = room.state.undo();
        
        if (result.success) {
          // Broadcast updated history to all users
          this.io.to(roomName).emit('server:history:load', room.state.getHistory());
          
          // Notify about what was undone
          this.io.to(roomName).emit('server:operation:undone', {
            operationId: result.undoneOperation?.id,
            userId: socket.id,
            userName: user.name
          });
          
          console.log(`⏪ ${user.name} undid operation in ${roomName}`);
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
          
          console.log(`⏩ ${user.name} redid operation in ${roomName}`);
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
        
        console.log(`🗑️ ${user.name} cleared canvas in ${roomName}`);
      } catch (error) {
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
        // Silently fail for cursor movements
      }
    });

    // Ping for latency
    socket.on('client:ping', (timestamp) => {
      try {
        socket.emit('server:pong', timestamp);
      } catch (error) {
        console.error(`❌ Error processing ping:`, error);
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
      
      // Don't immediately remove from room - wait for reconnection
      setTimeout(() => {
        const currentRoom = this.rooms.get(roomName);
        if (currentRoom && currentRoom.users.has(socket.id)) {
          this.leaveRoom(socket, roomName, user);
        }
      }, 5000); // 5 second grace period for reconnection
    });
  }

  /**
   * Validate operation data structure
   */
  validateOperation(operation) {
    if (!operation || typeof operation !== 'object') return false;
    
    // Check required fields based on operation type
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