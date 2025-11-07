import DrawingCanvas from './canvas.js';
import SocketService from './websocket.js';

/**
 * App - Main application controller
 */
class App {
  constructor() {
    this.localUser = null;
    this.currentRoom = null;
    this.socketService = null;
    this.canvas = null;
    this.currentColor = '#000000';
    this.sessionId = this.getOrCreateSessionId();
    this.listenersInitialized = false;

    this.init();
  }

  init() {
    this.setupModalHandlers();
  }

  getOrCreateSessionId() {
    let sessionId = sessionStorage.getItem('doodly_session_id');
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      sessionStorage.setItem('doodly_session_id', sessionId);
    }
    return sessionId;
  }

  getUserColors() {
    if (!this.localUser) return [];
    const key = `doodly_custom_colors_${this.localUser.name}_${this.localUser.color}`;
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  saveUserColors(colors) {
    if (!this.localUser) return;
    const key = `doodly_custom_colors_${this.localUser.name}_${this.localUser.color}`;
    try {
      localStorage.setItem(key, JSON.stringify(colors));
    } catch {
      // ignore
    }
  }

  setupModalHandlers() {
    const usernameInput = document.getElementById('username');
    const userColorGrid = document.getElementById('user-color-grid');
    const loginBtn = document.getElementById('login-btn');
    const roomnameInput = document.getElementById('roomname');
    const joinRoomBtn = document.getElementById('join-room-btn');

    let selectedColor = null;

    userColorGrid.addEventListener('click', (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.classList.contains('color-option')) {
        userColorGrid.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
        target.classList.add('selected');
        selectedColor = target.dataset.color || null;
      }
    });

    const tryLogin = () => {
      const username = usernameInput.value.trim();
      if (!username) return this.showError('Please enter a username');
      if (!selectedColor) return this.showError('Please select a color');
      this.localUser = { name: username, color: selectedColor };
      document.getElementById('modal-user').classList.remove('active');
      document.getElementById('modal-room').classList.add('active');
    };

    loginBtn.addEventListener('click', tryLogin);
    usernameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') tryLogin(); });

    const tryJoin = () => {
      const roomName = roomnameInput.value.trim();
      if (!roomName) return this.showError('Please enter a room name');
      this.currentRoom = roomName;
      this.initializeApp(roomName, true);
    };

    joinRoomBtn.addEventListener('click', tryJoin);
    roomnameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') tryJoin(); });
  }

  initializeApp(roomName, isFirstInit = false) {
    try {
      document.getElementById('modal-room').classList.remove('active');
      document.getElementById('main-app').classList.remove('hidden');

      this.canvas = new DrawingCanvas('main-canvas');
      this.socketService = new SocketService();

      // Socket -> Canvas wiring
      this.socketService.onHistoryLoad = (history) => this.canvas.loadHistoryFromServer(history);
      this.socketService.onOperationAdd = (op) => this.canvas.addOperationToHistory(op);
      this.socketService.onDrawStream = (data) => this.canvas.handleRemoteDrawStream(data);
      this.socketService.onShapePreview = (data) => this.canvas.handleRemoteShapePreview(data);
      this.socketService.onShapePreviewClear = (data) => this.canvas.handleRemoteShapePreviewClear(data);
      this.socketService.onUsersLoad = (users) => this.updateUserList(users);
      this.socketService.onUserJoined = (user) => this.showToast(`${user.name} joined`);
      this.socketService.onUserLeft = (user) => this.showToast(`${user.name} left`);
      this.socketService.onCursorMove = (data) => this.updateRemoteCursor(data);
      this.socketService.onLatencyUpdate = (latency) => {
        const el = document.getElementById('latency');
        if (el) el.textContent = String(latency);
      };
      this.socketService.onRoomsList = (rooms) => this.updateRoomsList(rooms);
      this.socketService.onError = (error) => this.handleSocketError(error);
      this.socketService.onReconnected = () => this.showToast('Reconnected to server');

      // Canvas -> Socket wiring
      this.canvas.onOperationAdd = (operation) => this.socketService.sendOperation(operation);
      this.canvas.onCursorMove = (x, y) => this.socketService.sendCursorMove(x, y);
      this.canvas.onDrawStream = (data) => this.socketService.sendDrawStream(data);
      this.canvas.onShapePreview = (data) => this.socketService.sendShapePreview(data);

      this.socketService.connect(roomName, this.localUser, this.sessionId);

      if (isFirstInit && !this.listenersInitialized) {
        this.setupToolbar();
        this.setupColorPicker();
        this.setupSidebar();
        this.setupKeyboardShortcuts();
        this.listenersInitialized = true;
      } else {
        this.updateContextBar('brush');
        this.updateCustomColors();
        this.updateSidebarInfo();
      }

      this.socketService.requestRoomsList();
    } catch (error) {
      console.error('Error initializing app:', error);
      this.showError('Failed to initialize application');
    }
  }

  setupToolbar() {
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => this.selectTool(btn.dataset.tool));
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
    const toolBtn = document.querySelector(`[data-tool="${tool}"]`);
    if (toolBtn) toolBtn.classList.add('active');

    this.canvas.setTool(tool);
    this.updateContextBar(tool);
  }

  updateContextBar(tool) {
    const contextContent = document.getElementById('context-content');
    contextContent.innerHTML = '';

    if (tool === 'brush') {
      const val = this.canvas.brushWidth;
      contextContent.innerHTML = `
        <div class="context-control">
          <label>Brush Width</label>
          <input type="range" id="brush-width" min="1" max="50" value="${val}">
          <span id="brush-width-value">${val}px</span>
        </div>
      `;
      document.getElementById('brush-width').addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        this.canvas.setBrushWidth(v);
        document.getElementById('brush-width-value').textContent = `${v}px`;
      });
      return;
    }

    if (tool === 'eraser') {
      const val = this.canvas.eraserWidth;
      contextContent.innerHTML = `
        <div class="context-control">
          <label>Eraser Width</label>
          <input type="range" id="eraser-width" min="5" max="100" value="${val}">
          <span id="eraser-width-value">${val}px</span>
        </div>
      `;
      document.getElementById('eraser-width').addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        this.canvas.setEraserWidth(v);
        document.getElementById('eraser-width-value').textContent = `${v}px`;
      });
      return;
    }

    if (tool === 'shape') {
      const val = this.canvas.shapeWidth;
      contextContent.innerHTML = `
        <div class="context-control">
          <label>Shape</label>
          <div class="shape-options">
            <button class="shape-btn active" data-shape="rectangle">▭</button>
            <button class="shape-btn" data-shape="circle">●</button>
            <button class="shape-btn" data-shape="triangle">▲</button>
          </div>
        </div>
        <div class="context-control">
          <label>Shape Width</label>
          <input type="range" id="shape-width" min="1" max="20" value="${val}">
          <span id="shape-width-value">${val}px</span>
        </div>
      `;
      document.querySelectorAll('.shape-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.canvas.setShape(btn.dataset.shape);
        });
      });
      document.getElementById('shape-width').addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        this.canvas.setShapeWidth(v);
        document.getElementById('shape-width-value').textContent = `${v}px`;
      });
      this.canvas.setShape('rectangle');
    }
  }

  setupColorPicker() {
    const colorBtn = document.getElementById('color-btn');
    const colorPicker = document.getElementById('color-picker');
    const previewEl = colorBtn.querySelector('.color-preview');

    const hidePicker = (e) => {
      if (!colorPicker.contains(e.target) && e.target !== colorBtn) {
        colorPicker.classList.add('hidden');
      }
    };

    colorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      colorPicker.classList.toggle('hidden');
    });

    document.addEventListener('click', hidePicker);

    colorPicker.addEventListener('click', (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.classList.contains('color-option') &&
          !target.classList.contains('empty-slot') &&
          !target.classList.contains('add-custom')) {
        this.setColor(target.dataset.color);
      }
    });

    this.updateCustomColors();
  }

  setColor(color) {
    if (!color) return;
    this.currentColor = color;
    this.canvas.setColor(color);
    const preview = document.querySelector('#color-btn .color-preview');
    if (preview) preview.style.background = color;
  }

  addCustomColor(color) {
    const colors = this.getUserColors();
    if (colors.includes(color)) {
      this.setColor(color);
      return;
    }
    if (colors.length >= 7) colors.shift();
    colors.push(color);
    this.saveUserColors(colors);
    this.updateCustomColors();
    this.setColor(color);
  }

  updateCustomColors() {
    const grid = document.getElementById('custom-colors');
    const colors = this.getUserColors();
    const parts = [];

    colors.forEach(color => {
      const border = color === '#FFFFFF' ? 'border: 1px solid #555;' : '';
      parts.push(`<div class="color-option" data-color="${color}" style="background: ${color}; ${border}"></div>`);
    });

    while (parts.length < 7) {
      parts.push('<div class="color-option empty-slot" style="background: transparent; border: 2px dashed #555;"></div>');
    }

    parts.push(`
      <div class="color-option add-custom" style="position: relative;">
        <input type="color" id="custom-color-picker" style="position: absolute; width: 100%; height: 100%; opacity: 0; cursor: pointer;">
        +
      </div>
    `);

    grid.innerHTML = parts.join('');

    const colorInput = document.getElementById('custom-color-picker');
    if (colorInput) {
      colorInput.addEventListener('change', (e) => {
        this.addCustomColor(e.target.value.toUpperCase());
      });
    }
  }

  updateSidebarInfo() {
    document.getElementById('current-room-name').textContent = this.currentRoom;
    document.getElementById('sidebar-user-avatar').style.background = this.localUser.color;
    document.getElementById('sidebar-user-name').textContent = this.localUser.name;
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

    this.updateSidebarInfo();

    document.getElementById('shortcuts-btn').addEventListener('click', () => {
      closeSidebar();
      document.getElementById('shortcuts-modal').classList.add('active');
    });

    document.getElementById('shortcuts-close').addEventListener('click', () => {
      document.getElementById('shortcuts-modal').classList.remove('active');
    });

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
  }

  updateUserList(users) {
    document.getElementById('current-user-count').textContent = users.length;
    document.getElementById('user-count').textContent = users.length;
    const userListContent = document.getElementById('user-list-content');
    userListContent.innerHTML = users.map(user => `
      <div class="user-item">
        <div class="user-dot" style="background: ${user.color};"></div>
        <div class="user-name">${this.escapeHtml(user.name)}</div>
      </div>
    `).join('');
  }

  updateRoomsList(rooms) {
    const list = document.getElementById('other-rooms-list');
    const otherRooms = rooms.filter(room => room.name !== this.currentRoom);

    if (otherRooms.length === 0) {
      list.innerHTML = '<p class="empty-state">No other rooms available</p>';
      return;
    }

    list.innerHTML = otherRooms.map(room =>
      `<div class="room-item" data-room="${this.escapeHtml(room.name)}">
         <span>${this.escapeHtml(room.name)}</span>
         <span class="room-user-count">${room.userCount}</span>
       </div>`
    ).join('');

    list.querySelectorAll('.room-item').forEach(item => {
      item.addEventListener('click', () => {
        if (confirm(`Switch to room "${item.dataset.room}"?`)) {
          this.socketService.disconnect();
          this.currentRoom = item.dataset.room;
          this.initializeApp(item.dataset.room, false);
        }
      });
    });
  }

  updateRemoteCursor(data) {
    const cursorsContainer = document.getElementById('cursors-container');
    let cursor = document.getElementById(`cursor-${data.userId}`);

    if (!cursor) {
      cursor = document.createElement('div');
      cursor.id = `cursor-${data.userId}`;
      cursor.className = 'remote-cursor';
      cursor.style.color = data.userColor;
      cursor.innerHTML = `
        <div class="cursor-pointer"></div>
        <div class="cursor-label">${this.escapeHtml(data.userName)}</div>
      `;
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

  showError(message) {
    alert(message);
  }

  handleSocketError(error) {
    console.error('Socket error:', error);
    this.showToast(`Error: ${error.message || 'Connection issue'}`);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault(); this.socketService.sendUndo();
      } else if (cmdOrCtrl && (e.key === 'z' || e.key === 'Z') && e.shiftKey) {
        e.preventDefault(); this.socketService.sendRedo();
      } else if (cmdOrCtrl && e.key.toLowerCase() === 'd') {
        e.preventDefault(); if (confirm('Clear canvas?')) this.socketService.sendClear();
      } else if (cmdOrCtrl && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        document.getElementById('sidebar').classList.toggle('open');
        document.getElementById('sidebar-overlay').classList.toggle('active');
      } else if (!cmdOrCtrl && e.key.toLowerCase() === 'b') {
        e.preventDefault(); this.selectTool('brush');
      } else if (!cmdOrCtrl && e.key.toLowerCase() === 'e') {
        e.preventDefault(); this.selectTool('eraser');
      } else if (!cmdOrCtrl && e.key.toLowerCase() === 's') {
        e.preventDefault(); this.selectTool('shape');
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
