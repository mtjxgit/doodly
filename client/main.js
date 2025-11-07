import DrawingCanvas from './canvas.js';
import SocketService from './websocket.js';

class App {
  constructor() {
    this.canvas = null;
    this.socketService = null;
    this.init();
  }

  init() {
    document.addEventListener('DOMContentLoaded', () => {
      this.canvas = new DrawingCanvas('main-canvas');
      this.socketService = new SocketService();
      
      this.socketService.connect();
    });
  }
}

new App();