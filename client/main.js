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
    // ... (This function remains unchanged)
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
    
    this.socketService.connect(roomName, this.localUser);

    this.socketService.socket.on('server:clear', () => {
      this.canvas.clear();
    });

    this.setupUI();
    this.setupToolbar(); // New function call
    
    // Set default tool
    this.selectTool('brush');
    this.canvas.setColor('#000000'); // Set default color
  }

  setupUI() {
    // ... (This function remains unchanged, except for removing the 'clear-btn' listener)
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

    document.getElementById('current-room-name').textContent = this.currentRoom;
    document.getElementById('sidebar-user-avatar').style.background = this.localUser.color;
    document.getElementById('sidebar-user-name').textContent = this.localUser.name;
  }

  // --- New Methods ---

  setupToolbar() {
    // Tool selection
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectTool(btn.dataset.tool);
      });
    });

    // Clear button (moved from setupUI)
    document.getElementById('clear-btn').addEventListener('click', () => {
      if (confirm('Clear the entire canvas? This affects all users.')) {
        this.socketService.sendClear();
      }
    });

    // Color button (for now, just sets a hardcoded color)
    document.getElementById('color-btn').addEventListener('click', () => {
      // This is a placeholder. We'll add a real color picker later.
      const newColor = this.canvas.currentColor === '#000000' ? '#FF0000' : '#000000';
      this.canvas.setColor(newColor);
    });
  }

  selectTool(tool) {
    // Update button active state
    document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-tool="${tool}"]`).classList.add('active');
    
    // Set tool in canvas
    this.canvas.setTool(tool);
    
    // Update the context bar
    this.updateContextBar(tool);
  }

  updateContextBar(tool) {
    const contextContent = document.getElementById('context-content');
    contextContent.innerHTML = ''; // Clear previous controls

    switch (tool) {
      case 'brush':
        const currentBrushWidth = this.canvas.brushWidth;
        // Create brush width slider
        contextContent.innerHTML = `
          <div class="context-control">
            <label>Brush Width</label>
            <input type="range" id="brush-width" min="1" max="50" value="${currentBrushWidth}">
            <span id="brush-width-value">${currentBrushWidth}px</span>
          </div>`;
        
        // Add listener for the new slider
        document.getElementById('brush-width').addEventListener('input', (e) => {
          const val = parseInt(e.target.value);
          this.canvas.setBrushWidth(val);
          document.getElementById('brush-width-value').textContent = val + 'px';
        });
        break;
      
      case 'eraser':
        const currentEraserWidth = this.canvas.eraserWidth;
        // Create eraser width slider
        contextContent.innerHTML = `
          <div class="context-control">
            <label>Eraser Width</label>
            <input type="range" id="eraser-width" min="5" max="100" value="${currentEraserWidth}">
            <span id="eraser-width-value">${currentEraserWidth}px</span>
          </div>`;
        
        // Add listener for the new slider
        document.getElementById('eraser-width').addEventListener('input', (e) => {
          const val = parseInt(e.target.value);
          this.canvas.setEraserWidth(val);
          document.getElementById('eraser-width-value').textContent = val + 'px';
        });
        break;
      
      default:
        // No controls for other tools yet
        break;
    }
  }
}

new App();