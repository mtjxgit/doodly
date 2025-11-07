import DrawingCanvas from './canvas.js';
import SocketService from './websocket.js';

// Main application class
class App {
  constructor() {
    this.localUser = null;
    this.currentRoom = null;
    this.canvas = null;
    this.socketService = null;
    
    document.addEventListener('DOMContentLoaded', () => {
      this.setupModalHandlers();
    });
  }

  setupModalHandlers() {
    const usernameInput = document.getElementById('username');
    const userColorGrid = document.getElementById('user-color-grid');
    const loginBtn = document.getElementById('login-btn');
    let selectedColor = null;

    userColorGrid.addEventListener('click', (e) => {
      if (e.target.classList.contains('color-option')) {
        userColorGrid.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
        e.target.classList.add('selected');
        selectedColor = e.target.dataset.color;
      }
    });

    loginBtn.addEventListener('click', () => {
      const username = usernameInput.value.trim();
      if (!username) { alert('Please enter a username'); return; }
      if (!selectedColor) { alert('Please select a color'); return; }
      
      this.localUser = { name: username, color: selectedColor };
      
      document.getElementById('modal-user').classList.remove('active');
      document.getElementById('modal-room').classList.add('active');
    });

    const roomnameInput = document.getElementById('roomname');
    const joinRoomBtn = document.getElementById('join-room-btn');

    joinRoomBtn.addEventListener('click', () => {
      const roomName = roomnameInput.value.trim();
      if (!roomName) { alert('Please enter a room name'); return; }
      
      this.currentRoom = roomName;
      this.initializeApp(roomName);
    });
  }

  initializeApp(roomName) {
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

    this.socketService.onLatencyUpdate = (latency) => {
      const el = document.getElementById('latency');
      if (el) el.textContent = latency;
    };
    
    // Connect before adding listeners socket
    this.socketService.connect(roomName, this.localUser);

    
    this.socketService.socket.on('server:clear', () => {
      this.canvas.clear();
    });
    
    this.setupUI();
  }

  setupUI() {
    // Sidebar
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const menuBtn = document.getElementById('menu-btn');
    const closeBtn = document.getElementById('sidebar-close');
    const leaveBtn = document.getElementById('leave-room-btn');

    const openSidebar = () => { sidebar.classList.add('open'); overlay.classList.add('active'); };
    const closeSidebar = () => { sidebar.classList.remove('open'); overlay.classList.remove('active'); };

    menuBtn.addEventListener('click', openSidebar);
    closeBtn.addEventListener('click', closeSidebar);
    overlay.addEventListener('click', closeSidebar);

    leaveBtn.addEventListener('click', () => {
      if (confirm('Leave this room?')) {
        this.socketService.socket.disconnect();
        location.reload();
      }
    });

    // Fill sidebar info
    document.getElementById('current-room-name').textContent = this.currentRoom;
    document.getElementById('sidebar-user-avatar').style.background = this.localUser.color;
    document.getElementById('sidebar-user-name').textContent = this.localUser.name;

    // Clear button
    document.getElementById('clear-btn').addEventListener('click', () => {
      if (confirm('Clear the entire canvas? This affects all users.')) {
        this.socketService.sendClear();
      }
    });
  }
}

new App();