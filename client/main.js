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
    this.canvas.onCursorMove = (x, y) => {
      this.socketService.sendCursorMove(x, y);
    };
    
    this.socketService.onDraw = (data) => {
      this.canvas.remoteDraw(data);
    };
    this.socketService.onCursorMove = (data) => {
      this.updateRemoteCursor(data);
    };

    // --- New Listeners ---
    this.socketService.onUsersLoad = (users) => {
      this.updateUserList(users);
    };
    this.socketService.onUserJoined = (user) => {
      this.showToast(`${user.name} joined`);
    };
    this.socketService.onUserLeft = (user) => {
      this.showToast(`${user.name} left`);
    };
    // --- End New Listeners ---

    this.socketService.onLatencyUpdate = (latency) => {
      const el = document.getElementById('latency');
      if (el) el.textContent = latency;
    };
    
    this.socketService.connect(roomName, this.localUser);

    this.socketService.socket.on('server:clear', () => {
      this.canvas.clear();
    });

    this.setupUI();
    this.setupToolbar(); 
    
    this.selectTool('brush');
    this.canvas.setColor('#000000');
  }

  setupUI() {

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

    // --- New Listeners for User List Toggle ---
    const usersToggleBtn = document.getElementById('users-toggle-btn');
    const userList = document.getElementById('user-list');

    usersToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userList.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!userList.contains(e.target) && !usersToggleBtn.contains(e.target)) {
        userList.classList.add('hidden');
      }
    });
    // --- End New Listeners ---
  }

  setupToolbar() {

    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectTool(btn.dataset.tool);
      });
    });

    document.getElementById('clear-btn').addEventListener('click', () => {
      if (confirm('Clear the entire canvas? This affects all users.')) {
        this.socketService.sendClear();
      }
    });

    document.getElementById('color-btn').addEventListener('click', () => {
      const newColor = this.canvas.currentColor === '#000000' ? '#FF0000' : '#000000';
      this.canvas.setColor(newColor);
    });
  }

  selectTool(tool) {

    document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-tool="${tool}"]`).classList.add('active');
    
    this.canvas.setTool(tool);
    
    this.updateContextBar(tool);
  }

  updateContextBar(tool) {

    const contextContent = document.getElementById('context-content');
    contextContent.innerHTML = ''; 

    switch (tool) {
      case 'brush':
        const currentBrushWidth = this.canvas.brushWidth;
        contextContent.innerHTML = `
          <div class="context-control">
            <label>Brush Width</label>
            <input type="range" id="brush-width" min="1" max="50" value="${currentBrushWidth}">
            <span id="brush-width-value">${currentBrushWidth}px</span>
          </div>`;
        
        document.getElementById('brush-width').addEventListener('input', (e) => {
          const val = parseInt(e.target.value);
          this.canvas.setBrushWidth(val);
          document.getElementById('brush-width-value').textContent = val + 'px';
        });
        break;
      
      case 'eraser':
        const currentEraserWidth = this.canvas.eraserWidth;
        contextContent.innerHTML = `
          <div class="context-control">
            <label>Eraser Width</label>
            <input type="range" id="eraser-width" min="5" max="100" value="${currentEraserWidth}">
            <span id="eraser-width-value">${currentEraserWidth}px</span>
          </div>`;
        
        document.getElementById('eraser-width').addEventListener('input', (e) => {
          const val = parseInt(e.target.value);
          this.canvas.setEraserWidth(val);
          document.getElementById('eraser-width-value').textContent = val + 'px';
        });
        break;
      
      default:
        break;
    }
  }

  // --- New Methods ---

  // New function to show notifications
  showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // New function to update the user list UI
  updateUserList(users) {
    // Update counts
    document.getElementById('current-user-count').textContent = users.length;
    document.getElementById('user-count').textContent = users.length;
    
    const userListContent = document.getElementById('user-list-content');
    // Generate new HTML for the list
    userListContent.innerHTML = users.map(user => `
      <div class="user-item">
        <div class="user-dot" style="background: ${user.color};"></div>
        <div class="user-name">${user.name}</div>
      </div>
    `).join('');
  }

  updateRemoteCursor(data) {
    // ... (This function remains unchanged)
    const cursorsContainer = document.getElementById('cursors-container');
    let cursor = document.getElementById(`cursor-${data.userId}`);
    
    if (!cursor) {
      cursor = document.createElement('div');
      cursor.id = `cursor-${data.userId}`;
      cursor.className = 'remote-cursor';
      cursor.style.color = data.userColor; 
      
      cursor.innerHTML = `
        <div class="cursor-pointer"></div>
        <div class="cursor-label">${data.userName}</div>
      `;
      cursorsContainer.appendChild(cursor);
    }
    
    cursor.style.transform = `translate(${data.x}px, ${data.y}px)`;
  }
}

new App();