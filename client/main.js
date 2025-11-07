import DrawingCanvas from './canvas.js';
import SocketService from './websocket.js';

// Main application class
class App {
  constructor() {
    this.canvas = null;
    this.socketService = null;
    this.init();
  }

  init() {
    // Wait for the DOM to be ready
    document.addEventListener('DOMContentLoaded', () => {
      this.canvas = new DrawingCanvas('main-canvas');
      this.socketService = new SocketService();
      
      this.socketService.connect();
    });
  }
}

new App();