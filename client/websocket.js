// Manages the connection to the server
class SocketService {
  constructor() {
    this.socket = null;
    this.pingInterval = null;
    this.latencyHistory = [];

    // Callbacks
    this.onHistoryLoad = null; // New
    this.onOperationAdd = null; // New
    this.onLatencyUpdate = null;
    this.onCursorMove = null;
    this.onUsersLoad = null;   
    this.onUserJoined = null;  
    this.onUserLeft = null;    
  }

  connect(roomName, userDetails) {
    this.socket = io({
      query: {
        roomName: roomName,
        username: userDetails.name,
        color: userDetails.color
      }
    });

    this.socket.on('connect', () => {
      console.log('Connected to server with ID:', this.socket.id);
      this.startPing();
    });

    this.socket.on('disconnect', () => {
      // ... (unchanged)
      console.log('Disconnected from server');
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
      }
    });

    // --- New Listeners ---
    this.socket.on('server:history:load', (history) => {
      if (this.onHistoryLoad) {
        this.onHistoryLoad(history);
      }
    });

    this.socket.on('server:operation:add', (operation) => {
      if (this.onOperationAdd) {
        this.onOperationAdd(operation);
      }
    });
    // --- End New Listeners ---

    this.socket.on('users:load', (users) => {
      if (this.onUsersLoad) {
        this.onUsersLoad(users);
      }
    });

    this.socket.on('user:joined', (user) => {
      if (this.onUserJoined) {
        this.onUserJoined(user);
      }
    });

    this.socket.on('user:left', (user) => {
      // ... (unchanged)
      if (this.onUserLeft) {
        this.onUserLeft(user);
      }
      const cursor = document.getElementById(`cursor-${user.id}`);
      if (cursor) {
        cursor.remove();
      }
    });

    this.socket.on('server:cursor:move', (data) => {
      if (this.onCursorMove) {
        this.onCursorMove(data);
      }
    });

    this.socket.on('server:pong', (timestamp) => {
      // ... (unchanged)
      const latency = Date.now() - timestamp;
      this.latencyHistory.push(latency);
      if (this.latencyHistory.length > 10) {
        this.latencyHistory.shift();
      }
      const avgLatency = Math.round(
        this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length
      );
      if (this.onLatencyUpdate) {
        this.onLatencyUpdate(avgLatency);
      }
    });
  }

  startPing() {
    // ... (unchanged)
    this.pingInterval = setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('client:ping', Date.now());
      }
    }, 1000);
  }

  // RENAMED from sendDraw
  sendOperation(operation) {
    if (this.socket) {
      this.socket.emit('client:operation:add', operation);
    }
  }

  sendClear() {
    if (this.socket) {
      this.socket.emit('client:clear');
    }
  }
  
  sendCursorMove(x, y) {
    if (this.socket && this.socket.connected) {
      this.socket.volatile.emit('client:cursor:move', { x, y });
    }
  }
}

export default SocketService;