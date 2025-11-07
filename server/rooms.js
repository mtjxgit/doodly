const DrawingState = require('./drawing-state');

class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
  }

  handleConnection(socket) {
    // ... (This function remains unchanged)
    const { roomName, username, color } = socket.handshake.query;

    if (!roomName || !username || !color) {
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

    
    // Send drawing history to the new user
    socket.emit('server:history:load', room.state.getHistory());
    // --- END OF FIX ---

    // Notify others of join
    socket.to(roomName).emit('user:joined', user);

    console.log(`✅ ${user.name} joined room: ${roomName}`);
  }

  leaveRoom(socket, roomName, user) {
    // ... (This function remains unchanged)
    const room = this.rooms.get(roomName);
    if (!room) return;

    room.users.delete(socket.id);

    socket.to(roomName).emit('user:left', user);

    const userList = Array.from(room.users.values());
    this.io.to(roomName).emit('users:load', userList);

    if (room.users.size === 0) {
      this.rooms.delete(roomName);
      console.log(`🧹 Room ${roomName} deleted (empty)`);
    }

    console.log(`❌ ${user.name} left room: ${roomName}`);
  }

  setupSocketHandlers(socket, roomName, user) {
    const room = this.rooms.get(roomName);
    if (!room) return; 

    // MODIFIED 'draw' to 'client:operation:add'
    // This makes 'draw' just one type of operation
    socket.on('client:operation:add', (operation) => {
      room.state.addOperation(operation);
      // Broadcast to others
      socket.to(roomName).emit('server:operation:add', operation);
    });

    socket.on('client:clear', () => {
      room.state.clear();
      // Use 'history:load' to force all clients to redraw the empty state
      this.io.to(roomName).emit('server:history:load', []);
    });

    socket.on('client:ping', (timestamp) => {
      socket.emit('server:pong', timestamp);
    });

    socket.on('client:cursor:move', (cursorData) => {
      socket.to(roomName).emit('server:cursor:move', {
        ...cursorData,
        userId: user.id,
        userName: user.name,
        userColor: user.color
      });
    });

    socket.on('disconnect', () => {
      this.leaveRoom(socket, roomName, user);
    });
  }
}

module.exports = RoomManager;