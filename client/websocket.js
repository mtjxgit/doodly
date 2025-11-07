/**
 * SocketService - WebSocket manager with reconnection/backoff and cleanup
 */
class SocketService {
  constructor() {
    this.socket = null;
    this.pingInterval = null;
    this.latencyHistory = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.baseReconnectDelay = 1000; // ms
    this.isIntentionalDisconnect = false;

    // Params for reconnection
    this.roomName = null;
    this.userDetails = null;
    this.sessionId = null;

    // Callbacks
    this.onHistoryLoad = null;
    this.onOperationAdd = null;
    this.onDrawStream = null;
    this.onShapePreview = null;
    this.onShapePreviewClear = null;
    this.onUsersLoad = null;
    this.onUserJoined = null;
    this.onUserLeft = null;
    this.onCursorMove = null;
    this.onLatencyUpdate = null;
    this.onRoomsList = null;
    this.onError = null;
    this.onReconnected = null;
  }

  connect(roomName, userDetails, sessionId) {
    try {
      this.roomName = roomName;
      this.userDetails = userDetails;
      this.sessionId = sessionId;
      this.isIntentionalDisconnect = false;

      // Ensure any previous socket is cleaned up
      if (this.socket) {
        this.cleanupSocket();
      }

      this.socket = io({
        query: {
          roomName,
          username: userDetails.name,
          color: userDetails.color,
          sessionId
        },
        reconnection: false, // manual reconnection
        timeout: 10000
      });

      this.setupListeners();
      this.startPing();
    } catch (error) {
      console.error('Connection error:', error);
      this.onError?.({ message: 'Failed to establish connection' });
    }
  }

  setupListeners() {
    const s = this.socket;

    s.on('connect', () => {
      this.reconnectAttempts = 0;
    });

    s.on('server:history:load', (history) => {
      if (Array.isArray(history)) this.onHistoryLoad?.(history);
    });

    s.on('server:operation:add', (operation) => {
      if (operation) this.onOperationAdd?.(operation);
    });

    s.on('server:draw:stream', (data) => {
      if (data) this.onDrawStream?.(data);
    });

    s.on('server:shape:preview', (data) => {
      if (data) this.onShapePreview?.(data);
    });

    s.on('server:shape:preview_clear', (data) => {
      if (data) this.onShapePreviewClear?.(data);
    });

    s.on('users:load', (users) => {
      if (Array.isArray(users)) this.onUsersLoad?.(users);
    });

    s.on('user:joined', (user) => {
      if (user) this.onUserJoined?.(user);
    });

    s.on('user:left', (user) => {
      if (user) this.onUserLeft?.(user);
      const cursor = document.getElementById(`cursor-${user?.id}`);
      if (cursor) cursor.remove();
    });

    s.on('server:cursor:move', (data) => {
      if (data) this.onCursorMove?.(data);
    });

    s.on('server:rooms:list', (rooms) => {
      if (Array.isArray(rooms)) this.onRoomsList?.(rooms);
    });

    s.on('server:reconnected', () => {
      this.onReconnected?.();
    });

    s.on('server:error', (error) => {
      this.onError?.(error);
    });

    s.on('server:pong', (timestamp) => {
      const latency = Date.now() - timestamp;
      this.latencyHistory.push(latency);
      if (this.latencyHistory.length > 10) this.latencyHistory.shift();
      const avg = Math.round(this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length);
      this.onLatencyUpdate?.(avg);
    });

    s.on('connect_error', () => {
      this.onError?.({ message: 'Connection failed' });
      if (!this.isIntentionalDisconnect) this.attemptReconnect();
    });

    s.on('disconnect', (reason) => {
      if (this.pingInterval) clearInterval(this.pingInterval);
      if (!this.isIntentionalDisconnect && reason !== 'io client disconnect') {
        this.attemptReconnect();
      }
    });
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.onError?.({ message: 'Unable to reconnect to server' });
      return;
    }
    this.reconnectAttempts++;
    const jitter = Math.random() * 250;
    const delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1) + jitter;

    setTimeout(() => {
      if (!this.isIntentionalDisconnect && this.roomName && this.userDetails) {
        this.connect(this.roomName, this.userDetails, this.sessionId);
      }
    }, delay);
  }

  startPing() {
    const start = () => {
      this.pingInterval = setInterval(() => {
        if (this.socket?.connected) {
          this.socket.emit('client:ping', Date.now());
        }
      }, 1000);
    };
    if (this.socket.connected) start();
    else this.socket.once('connect', start);
  }

  sendOperation(operation) {
    if (this.socket?.connected) {
      try { this.socket.emit('client:operation:add', operation); } catch {}
    }
  }

  sendDrawStream(data) {
    if (this.socket?.connected) {
      try { this.socket.volatile.emit('client:draw:stream', data); } catch {}
    }
  }

  sendShapePreview(data) {
    if (this.socket?.connected) {
      try { this.socket.volatile.emit('client:shape:preview', data); } catch {}
    }
  }

  sendUndo() { if (this.socket?.connected) { try { this.socket.emit('client:undo'); } catch {} } }
  sendRedo() { if (this.socket?.connected) { try { this.socket.emit('client:redo'); } catch {} } }
  sendClear() { if (this.socket?.connected) { try { this.socket.emit('client:clear'); } catch {} } }

  sendCursorMove(x, y) {
    if (this.socket?.connected) {
      try { this.socket.volatile.emit('client:cursor:move', { x, y }); } catch {}
    }
  }

  requestRoomsList() {
    if (this.socket?.connected) {
      try { this.socket.emit('client:rooms:request'); } catch {}
    }
  }

  cleanupSocket() {
    try {
      if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.disconnect();
      }
    } catch {}
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = null;
  }

  disconnect() {
    this.isIntentionalDisconnect = true;
    this.cleanupSocket();
  }

  isConnected() {
    return !!(this.socket && this.socket.connected);
  }
}

export default SocketService;
