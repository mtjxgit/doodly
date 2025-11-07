import DrawingCanvas from './canvas.js';
import SocketService from './websocket.js';

// Main application class
class App {
  constructor() {
    this.localUser = null;
    this.currentRoom = null;
    this.canvas = null;
    this.socketService = null;
    
    // Start by setting up modal handlers
    document.addEventListener('DOMContentLoaded', () => {
      this.setupModalHandlers();
    });
  }

  setupModalHandlers() {
    const usernameInput = document.getElementById('username');
    const userColorGrid = document.getElementById('user-color-grid');
    const loginBtn = document.getElementById('login-btn');
    let selectedColor = null;

    // Handle color selection
    userColorGrid.addEventListener('click', (e) => {
      if (e.target.classList.contains('color-option')) {
        // remove selected from all
        userColorGrid.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
        // add selected to clicked
        e.target.classList.add('selected');
        selectedColor = e.target.dataset.color;
      }
    });

    // Handle user login
    loginBtn.addEventListener('click', () => {
      const username = usernameInput.value.trim();
      if (!username) { alert('Please enter a username'); return; }
      if (!selectedColor) { alert('Please select a color'); return; }
      
      this.localUser = { name: username, color: selectedColor };
      
      // Hide user modal, show room modal
      document.getElementById('modal-user').classList.remove('active');
      document.getElementById('modal-room').classList.add('active');
    });

    const roomnameInput = document.getElementById('roomname');
    const joinRoomBtn = document.getElementById('join-room-btn');

    // Handle room joining
    joinRoomBtn.addEventListener('click', () => {
      const roomName = roomnameInput.value.trim();
      if (!roomName) { alert('Please enter a room name'); return; }
      
      this.currentRoom = roomName;
      this.initializeApp(roomName);
    });
  }

  // This was the old 'init' logic
  initializeApp(roomName) {
    // Hide modal, show app
    document.getElementById('modal-room').classList.remove('active');
    document.getElementById('main-app').classList.remove('hidden');

    this.canvas = new DrawingCanvas('main-canvas');
    this.socketService = new SocketService();
    
    // Wire up the callbacks
    this.canvas.onDraw = (data) => {
      this.socketService.sendDraw(data);
    };
    
    this.socketService.onDraw = (data) => {
      this.canvas.remoteDraw(data);
    };

    // Connect with user details
    this.socketService.connect(roomName, this.localUser);
  }
}

new App();