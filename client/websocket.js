// Manages the connection to the server
class SocketService {
  constructor() {
    this.socket = null;
    this.onDraw = null; // Callback for remote draw events
  }

  // UPDATED connect method
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
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    this.socket.on('draw', (data) => {
      if (this.onDraw) {
        this.onDraw(data);
      }
    });
  }

  sendDraw(data) {
    if (this.socket) {
      this.socket.emit('draw', data);
    }
  }
}

export default SocketService;