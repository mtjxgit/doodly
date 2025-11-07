import DrawingCanvas from './canvas.js';
import SocketService from './websocket.js';

class App {
  constructor() {
    this.localUser = null;
    this.currentRoom = null;
    this.socketService = null;
    this.canvas = null;
    this.customColors = [];
    this.currentColor = '#000000';
    
    // Use DOMContentLoaded to make sure DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        this.init();
    });
  }

  init() {
    this.loadCustomColors();
    this.setupModalHandlers();
  }

  loadCustomColors() {
    const saved = localStorage.getItem('doodly_custom_colors');
    if (saved) {
      try {
        this.customColors = JSON.parse(saved);
      } catch (e) {
        this.customColors = [];
      }
    }
  }

  saveCustomColors() {
    localStorage.setItem('doodly_custom_colors', JSON.stringify(this.customColors));
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
      
      // Hide modal, show app
      document.getElementById('modal-room').classList.remove('active');
      document.getElementById('main-app').classList.remove('hidden');

      // *** FIX: Defer canvas init to next frame ***
      setTimeout(() => {
        this.initializeApp(roomName);
      }, 0);
    });

    usernameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') loginBtn.click(); });
    roomnameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') joinRoomBtn.click(); });
  }

  initializeApp(roomName) {
    this.canvas = new DrawingCanvas('main-canvas');
    this.socketService = new SocketService();

    this.socketService.onHistoryLoad = (history) => this.canvas.loadHistoryFromServer(history);
    this.socketService.onOperationAdd = (operation) => this.canvas.addOperationToHistory(operation);
    this.socketService.onDrawStream = (data) => this.canvas.handleRemoteDrawStream(data);
    this.socketService.onShapePreview = (data) => this.canvas.handleRemoteShapePreview(data);
    this.socketService.onUsersLoad = (users) => this.updateUserList(users);
    this.socketService.onUserJoined = (user) => this.showToast(`${user.name} joined`);
    this.socketService.onUserLeft = (user) => this.showToast(`${user.name} left`);
    this.socketService.onCursorMove = (data) => this.updateRemoteCursor(data);
    this.socketService.onLatencyUpdate = (latency) => { const el = document.getElementById('latency'); if (el) el.textContent = latency; };
    this.socketService.onRoomsList = (rooms) => this.updateRoomsList(rooms);

    this.canvas.onOperationAdd = (operation) => this.socketService.sendOperation(operation);
    this.canvas.onCursorMove = (x, y) => this.socketService.sendCursorMove(x, y);
    this.canvas.onDrawStream = (data) => this.socketService.sendDrawStream(data);
    this.canvas.onShapePreview = (data) => this.socketService.sendShapePreview(data);

    this.socketService.connect(roomName, this.localUser);

    this.setupToolbar();
    this.setupColorPicker();
    this.setupSidebar();
    this.setupKeyboardShortcuts();

    // Set initial tool and color
    this.selectTool('brush');
    this.setColor(this.currentColor);
  }

  setupToolbar() {
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectTool(btn.dataset.tool);
      });
    });

    document.getElementById('undo-btn').addEventListener('click', () => this.socketService.sendUndo());
    document.getElementById('redo-btn').addEventListener('click', () => this.socketService.sendRedo());
    document.getElementById('clear-btn').addEventListener('click', () => {
      if (confirm('Clear the entire canvas? This affects all users.')) this.socketService.sendClear();
    });

    this.updateContextBar('brush');
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
        contextContent.innerHTML = `<div class="context-control"><label>Brush Width</label><input type="range" id="brush-width" min="1" max="50" value="${currentBrushWidth}"><span id="brush-width-value">${currentBrushWidth}px</span></div>`;
        document.getElementById('brush-width').addEventListener('input', (e) => {
          const val = parseInt(e.target.value);
          this.canvas.setBrushWidth(val);
          document.getElementById('brush-width-value').textContent = val + 'px';
        });
        break;
      case 'eraser':
        const currentEraserWidth = this.canvas.eraserWidth;
        contextContent.innerHTML = `<div class="context-control"><label>Eraser Width</label><input type="range" id="eraser-width" min="5" max="100" value="${currentEraserWidth}"><span id="eraser-width-value">${currentEraserWidth}px</span></div>`;
        document.getElementById('eraser-width').addEventListener('input', (e) => {
          const val = parseInt(e.target.value);
          this.canvas.setEraserWidth(val);
          document.getElementById('eraser-width-value').textContent = val + 'px';
        });
        break;
      case 'shape':
        contextContent.innerHTML = `<div class="context-control"><label>Shape</label><div class="shape-options"><button class="shape-btn active" data-shape="rectangle">▭</button><button class="shape-btn" data-shape="circle">●</button><button class="shape-btn" data-shape="triangle">▲</button></div></div>`;
        document.querySelectorAll('.shape-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.canvas.setShape(btn.dataset.shape);
          });
        });
        this.canvas.setShape('rectangle');
        break;
    }
  }

  setupColorPicker() {
    const colorBtn = document.getElementById('color-btn');
    const colorPicker = document.getElementById('color-picker');
    const colorPreview = colorBtn.querySelector('.color-preview');

    colorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      colorPicker.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!colorPicker.contains(e.target) && e.target !== colorBtn) colorPicker.classList.add('hidden');
    });

    colorPicker.addEventListener('click', (e) => {
      if (e.target.classList.contains('color-option') && !e.target.classList.contains('empty-slot') && !e.target.classList.contains('add-custom')) {
        this.setColor(e.target.dataset.color);
      }
    });

    this.updateCustomColors();
  }

  setColor(color) {
    this.currentColor = color;
    this.canvas.setColor(color);
    document.querySelector('#color-btn .color-preview').style.background = color;
  }

  addCustomColor(color) {
    if (this.customColors.length >= 7) {
      this.customColors.shift(); // Remove the oldest
    }
    this.customColors.push(color);
    this.saveCustomColors();
    this.updateCustomColors();
    this.setColor(color);
  }

  updateCustomColors() {
    const customColorsGrid = document.getElementById('custom-colors');
    const slots = [];
    
    this.customColors.forEach(color => {
      const border = color === '#FFFFFF' ? 'border: 1px solid #555;' : '';
      slots.push(`<div class="color-option" data-color="${color}" style="background: ${color}; ${border}"></div>`);
    });
    
    while (slots.length < 7) {
      slots.push(`<div class="color-option empty-slot" style="background: transparent; border: 2px dashed #555;"></div>`);
    }
    
    slots.push(`<div class="color-option add-custom" style="position: relative;"><input type="color" id="custom-color-picker" style="position: absolute; width: 100%; height: 100%; opacity: 0; cursor: pointer;">+</div>`);
    
    customColorsGrid.innerHTML = slots.join('');
    
    const colorInput = document.getElementById('custom-color-picker');
    if (colorInput) {
      colorInput.addEventListener('change', (e) => {
        this.addCustomColor(e.target.value.toUpperCase());
      });
    }
  }

  setupSidebar() {
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
        this.socketService.disconnect();
        location.reload();
      }
    });

    document.getElementById('current-room-name').textContent = this.currentRoom;
    document.getElementById('sidebar-user-avatar').style.background = this.localUser.color;
    document.getElementById('sidebar-user-name').textContent = this.localUser.name;

    document.getElementById('shortcuts-btn').addEventListener('click', () => {
      closeSidebar();
      document.getElementById('shortcuts-modal').classList.add('active');
    });

    document.getElementById('shortcuts-close').addEventListener('click', () => {
      document.getElementById('shortcuts-modal').classList.remove('active');
    });

    // Setup user list toggle
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

    this.socketService.requestRoomsList();
  }

  updateUserList(users) {
    document.getElementById('current-user-count').textContent = users.length;
    document.getElementById('user-count').textContent = users.length;
    
    const userListContent = document.getElementById('user-list-content');
    userListContent.innerHTML = users.map(user => `
      <div class="user-item">
        <div class="user-dot" style="background: ${user.color};"></div>
        <div class="user-name">${user.name}</div>
      </div>
    `).join('');
  }

  updateRoomsList(rooms) {
    const list = document.getElementById('other-rooms-list');
    const otherRooms = rooms.filter(r => r !== this.currentRoom);
    if (otherRooms.length === 0) {
      list.innerHTML = '<p class="empty-state">No other rooms available</p>';
    } else {
      list.innerHTML = otherRooms.map(room => 
        `<div class="room-item" data-room="${room}">${room}</div>`
      ).join('');
      list.querySelectorAll('.room-item').forEach(item => {
        item.addEventListener('click', () => {
          if (confirm(`Switch to room "${item.dataset.room}"?`)) {
            this.socketService.disconnect();
            this.currentRoom = item.dataset.room;
            // Re-init the app
            document.getElementById('main-app').classList.add('hidden');
            document.getElementById('modal-room').classList.add('active');
            document.getElementById('roomname').value = this.currentRoom;
          }
        });
      });
    }
  }

  updateRemoteCursor(data) {
    const cursorsContainer = document.getElementById('cursors-container');
    let cursor = document.getElementById(`cursor-${data.userId}`);
    if (!cursor) {
      cursor = document.createElement('div');
      cursor.id = `cursor-${data.userId}`;
      cursor.className = 'remote-cursor';
      cursor.style.color = data.userColor;
      cursor.innerHTML = `<div class="cursor-pointer"></div><div class="cursor-label">${data.userName}</div>`;
      cursorsContainer.appendChild(cursor);
    }
    cursor.style.transform = `translate(${data.x}px, ${data.y}px)`;
  }

  showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.socketService.sendUndo();
      } else if (cmdOrCtrl && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        this.socketService.sendRedo();
      } else if (cmdOrCtrl && e.key === 'd') {
        e.preventDefault();
        if (confirm('Clear canvas?')) this.socketService.sendClear();
      } else if (cmdOrCtrl && e.key === 'b') {
        e.preventDefault();
        document.getElementById('sidebar').classList.toggle('open');
        document.getElementById('sidebar-overlay').classList.toggle('active');
      } else if (e.key === 'b' && !cmdOrCtrl) {
        e.preventDefault();
        this.selectTool('brush');
      } else if (e.key === 'e' && !cmdOrCtrl) {
        e.preventDefault();
        this.selectTool('eraser');
      } else if (e.key === 's' && !cmdOrCtrl) {
        e.preventDefault();
        this.selectTool('shape');
      } else if (e.key === 'Escape') {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebar-overlay').classList.remove('active');
        document.getElementById('shortcuts-modal').classList.remove('active');
        document.getElementById('color-picker').classList.add('hidden');
      }
    });
  }
}


new App();