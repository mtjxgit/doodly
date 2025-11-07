// Manages the connection to the server
class SocketService {
  constructor() {
    this.socket = null;
    this.onDraw = null; // Callback for remote draw events
  }

  connect() {
    // Get room name from URL
    const roomName = new URLSearchParams(window.location.search).get('room') || 'default';

    // Pass the room name in the connection query
    this.socket = io({
      query: { room: roomName }
    });

    this.socket.on('connect', () => {
      console.log('Connected to server with ID:', this.socket.id);
      document.querySelector('p').textContent = `Connected! Room: ${roomName}`;
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      document.querySelector('p').textContent = 'Disconnected. Attempting to reconnect...';
    });

    // Listen for 'draw' events from the server
    this.socket.on('draw', (data) => {
      if (this.onDraw) {
        this.onDraw(data);
      }
    });
  }

  // Send drawing data to the server
  sendDraw(data) {
    if (this.socket) {
      this.socket.emit('draw', data);
    }
  }
}

export default SocketService;