// Manages the connection to the server
class SocketService {
  constructor() {
    this.socket = null;
    this.pingInterval = null;
    this.latencyHistory = [];

    // Callbacks
    this.onDraw = null; 
    this.onLatencyUpdate = null;
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
      this.startPing(); // Start pinging
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
      }
    });

    this.socket.on('draw', (data) => {
      if (this.onDraw) {
        this.onDraw(data);
      }
    });

    // Pong for latency
    this.socket.on('server:pong', (timestamp) => {
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

  // New ping methods
  startPing() {
    this.pingInterval = setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('client:ping', Date.now());
      }
    }, 1000);
  }

  sendDraw(data) {
    if (this.socket) {
      this.socket.emit('draw', data);
    }
  }

  // New method
  sendClear() {
    if (this.socket) {
      this.socket.emit('client:clear');
    }
  }
}

export default SocketService;