const DrawingState = require('./drawing-state');

class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
  }

  handleConnection(socket) {
    const { roomName, username, color } = socket.handshake.query;

    if (!roomName || !username || !color) {
      socket.emit('error', { message: 'Missing connection parameters' });
      socket.disconnect();
      return;
    }

    const user = {
      id: socket.id,
      name: username,
      color: color
    };

    this.joinRoom(socket, roomName, user);
    this.setupSocketHandlers(socket, roomName, user);
  }

  joinRoom(socket, roomName, user) {
    // Find or create room
    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, {
        name: roomName,
        users: new Map(),
        state: new DrawingState(roomName)
      });
    }

    const room = this.rooms.get(roomName);
    room.users.set(socket.id, user);
    socket.join(roomName);

    // Send full user list to all clients in room
    const userList = Array.from(room.users.values());
    this.io.to(roomName).emit('users:load', userList);

    // Send drawing history to new user only
    socket.emit('server:history:load', room.state.getHistory());

    // Send available rooms list
    socket.emit('server:rooms:list', this.getAllRoomNames());

    // Notify others of join
    socket.to(roomName).emit('user:joined', user);

    console.log(`✅ ${user.name} joined room: ${roomName}`);
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

    // Clean up empty rooms
    if (room.users.size === 0) {
      this.rooms.delete(roomName);
      console.log(`🧹 Room ${roomName} deleted (empty)`);
    }

    console.log(`❌ ${user.name} left room: ${roomName}`);
  }

  getAllRoomNames() {
    const activeRooms = Array.from(this.rooms.keys());
    const allRooms = new DrawingState('temp').getAllRooms();
    return [...new Set([...activeRooms, ...allRooms])];
  }

  setupSocketHandlers(socket, roomName, user) {
    const room = this.rooms.get(roomName);

    // Drawing operations
    socket.on('client:operation:add', (operation) => {
      // Fix: Handle updates (like text) vs new ops
      if (operation.id) {
        room.state.updateOperationById(operation);
      } else {
        // This should not happen for text, but good for strokes
        operation.id = Date.now() + '_' + Math.random();
        room.state.addOperation(operation);
      }
      // Broadcast as 'add' - client will handle update/add
      this.io.to(roomName).emit('server:operation:add', operation);
    });

    // Streaming draw updates (real-time)
    socket.on('client:draw:stream', (data) => {
      socket.to(roomName).emit('server:draw:stream', data);
    });

    // Shape preview (real-time)
    socket.on('client:shape:preview', (data) => {
      // Fix: Add user data to preview
      const previewData = {
        ...data,
        userId: socket.id,
        userName: user.name,
        userColor: user.color
      };
      socket.to(roomName).emit('server:shape:preview', previewData);
    });

    // This is now handled by 'client:operation:add'
    // socket.on('client:operation:update', (operation) => {
    //   room.state.updateOperationById(operation);
    //   socket.to(roomName).emit('server:operation:add', operation);
    // });

    // Undo/Redo
    socket.on('client:undo', () => {
      const success = room.state.undo();
      if (success) {
        this.io.to(roomName).emit('server:history:load', room.state.getHistory());
      }
    });

    socket.on('client:redo', () => {
      const success = room.state.redo();
      if (success) {
        this.io.to(roomName).emit('server:history:load', room.state.getHistory());
      }
    });

    // Clear canvas
    socket.on('client:clear', () => {
      room.state.clear();
      this.io.to(roomName).emit('server:history:load', []);
    });

    // Cursor movement
    socket.on('client:cursor:move', (cursorData) => {
      socket.to(roomName).emit('server:cursor:move', {
        ...cursorData,
        userId: socket.id,
        userName: user.name,
        userColor: user.color
      });
    });

    // Ping for latency
    socket.on('client:ping', (timestamp) => {
      socket.emit('server:pong', timestamp);
    });

    // Request room list
    socket.on('client:rooms:request', () => {
      socket.emit('server:rooms:list', this.getAllRoomNames());
    });

    // Disconnect
    socket.on('disconnect', () => {
      this.leaveRoom(socket, roomName, user);
    });
  }
}

module.exports = RoomManager;