class SocketService {
  constructor() {
    this.socket = null;
    this.pingInterval = null;
    this.lastPingTime = 0;
    this.latencyHistory = [];
    
    // Callbacks
    this.onHistoryLoad = null;
    this.onOperationAdd = null;
    this.onDrawStream = null;
    this.onShapePreview = null;
    this.onUsersLoad = null;
    this.onUserJoined = null;
    this.onUserLeft = null;
    this.onCursorMove = null;
    this.onLatencyUpdate = null;
    this.onRoomsList = null;
  }

  connect(roomName, userDetails) {
    this.socket = io({
      query: {
        roomName: roomName,
        username: userDetails.name,
        color: userDetails.color
      }
    });

    this.setupListeners();
    this.startPing();
  }

  setupListeners() {
    // History load (for new users)
    this.socket.on('server:history:load', (history) => {
      if (this.onHistoryLoad) {
        this.onHistoryLoad(history);
      }
    });

    // New operation from another user
    this.socket.on('server:operation:add', (operation) => {
      if (this.onOperationAdd) {
        this.onOperationAdd(operation);
      }
    });

    // Real-time drawing stream
    this.socket.on('server:draw:stream', (data) => {
      if (this.onDrawStream) {
        this.onDrawStream(data);
      }
    });

    // Shape preview
    this.socket.on('server:shape:preview', (data) => {
      if (this.onShapePreview) {
        this.onShapePreview(data);
      }
    });

    // User list updates
    this.socket.on('users:load', (users) => {
      if (this.onUsersLoad) {
        this.onUsersLoad(users);
      }
    });

    // User joined notification
    this.socket.on('user:joined', (user) => {
      if (this.onUserJoined) {
        this.onUserJoined(user);
      }
    });

    // User left notification
    this.socket.on('user:left', (user) => {
      if (this.onUserLeft) {
        this.onUserLeft(user);
      }

      // Remove cursor
      const cursor = document.getElementById(`cursor-${user.id}`);
      if (cursor) {
        cursor.remove();
      }
    });

    // Remote cursor movement
    this.socket.on('server:cursor:move', (data) => {
      if (this.onCursorMove) {
        this.onCursorMove(data);
      }
    });

    // Rooms list
    this.socket.on('server:rooms:list', (rooms) => {
      if (this.onRoomsList) {
        this.onRoomsList(rooms);
      }
    });

    // Pong for latency measurement
    this.socket.on('server:pong', (timestamp) => {
      const latency = Date.now() - timestamp;
      
      // Keep history for smoothing
      this.latencyHistory.push(latency);
      if (this.latencyHistory.length > 10) {
        this.latencyHistory.shift();
      }
      
      // Calculate average
      const avgLatency = Math.round(
        this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length
      );
      
      if (this.onLatencyUpdate) {
        this.onLatencyUpdate(avgLatency);
      }
    });

    // Connection error
    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });

    // Disconnection
    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
      }
    });
  }

  startPing() {
    // Wait for connection
    if (this.socket.connected) {
      this.doPing();
    } else {
      this.socket.once('connect', () => {
        this.doPing();
      });
    }
  }

  doPing() {
    this.pingInterval = setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('client:ping', Date.now());
      }
    }, 1000); // Ping every second for more accurate latency
  }

  sendOperation(operation) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('client:operation:add', operation);
    }
  }

  sendDrawStream(data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('client:draw:stream', data);
    }
  }

  sendShapePreview(data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('client:shape:preview', data);
    }
  }

  updateOperation(operation) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('client:operation:update', operation);
    }
  }

  sendUndo() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('client:undo');
    }
  }

  sendRedo() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('client:redo');
    }
  }

  sendClear() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('client:clear');
    }
  }

  sendCursorMove(x, y) {
    if (this.socket && this.socket.connected) {
      // Throttle cursor updates
      this.socket.volatile.emit('client:cursor:move', { x, y });
    }
  }

  requestRoomsList() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('client:rooms:request');
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
  }
}

export default SocketService;