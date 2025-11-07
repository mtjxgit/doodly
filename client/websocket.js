// Manages the connection to the server
class SocketService {
  constructor() {
    this.socket = null;
  }

  connect() {
    // The 'io' function is available globally from the socket.io.js script
    this.socket = io();

    this.socket.on('connect', () => {
      console.log('Connected to server with ID:', this.socket.id);
      document.querySelector('p').textContent = 'Connected! Ready to draw.';
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      document.querySelector('p').textContent = 'Disconnected. Attempting to reconnect...';
    });
  }
}

export default SocketService;