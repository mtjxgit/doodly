/**
 * SocketService - Manages WebSocket connections with reconnection logic
 * - Automatic reconnection on disconnect
 * - Connection state management
 * - Error handling and recovery
 */
class SocketService {
  constructor() {
    this.socket = null;
    this.pingInterval = null;
    this.lastPingTime = 0;
    this.latencyHistory = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1 second
    this.isIntentionalDisconnect = false;
    
    // Connection parameters for reconnection
    this.roomName = null;
    this.userDetails = null;
    this.sessionId = null;
    
    // Callbacks
    this.onHistoryLoad = null;
    this.onOperationAdd = null;
    this.onDrawStream = null;
    this.onShapePreview = null;
    this.onShapePreviewClear = null; // New callback
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

      this.socket = io({
        query: {
          roomName: roomName,
          username: userDetails.name,
          color: userDetails.color,
          sessionId: sessionId
        },
        reconnection: false, // We'll handle reconnection manually
        timeout: 10000
      });

      this.setupListeners();
      this.startPing();
      
    } catch (error) {
      console.error('Connection error:', error);
      if (this.onError) {
        this.onError({ message: 'Failed to establish connection' });
      }
    }
  }

  setupListeners() {
    // Connection established
    this.socket.on('connect', () => {
      console.log('✅ Connected to server');
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
    });

    // History load (for new users)
    this.socket.on('server:history:load', (history) => {
      try {
        if (this.onHistoryLoad && Array.isArray(history)) {
          this.onHistoryLoad(history);
        }
      } catch (error) {
        console.error('Error handling history load:', error);
      }
    });

    // New operation from another user
    this.socket.on('server:operation:add', (operation) => {
      try {
        if (this.onOperationAdd && operation) {
          this.onOperationAdd(operation);
        }
      } catch (error) {
        console.error('Error handling operation add:', error);
      }
    });

    // Real-time drawing stream
    this.socket.on('server:draw:stream', (data) => {
      try {
        if (this.onDrawStream && data) {
          this.onDrawStream(data);
        }
      } catch (error) {
        console.error('Error handling draw stream:', error);
      }
    });

    // Shape preview
    this.socket.on('server:shape:preview', (data) => {
      try {
        if (this.onShapePreview && data) {
          this.onShapePreview(data);
        }
      } catch (error) {
        console.error('Error handling shape preview:', error);
      }
    });

    // Shape preview clear (new)
    this.socket.on('server:shape:preview_clear', (data) => {
      try {
        if (this.onShapePreviewClear && data) {
          this.onShapePreviewClear(data);
        }
      } catch (error) {
        console.error('Error handling shape preview clear:', error);
      }
    });

    // User list updates
    this.socket.on('users:load', (users) => {
      try {
        if (this.onUsersLoad && Array.isArray(users)) {
          this.onUsersLoad(users);
        }
      } catch (error) {
        console.error('Error handling users load:', error);
      }
    });

    // User joined notification
    this.socket.on('user:joined', (user) => {
      try {
        if (this.onUserJoined && user) {
          this.onUserJoined(user);
        }
      } catch (error) {
        console.error('Error handling user joined:', error);
      }
    });

    // User left notification
    this.socket.on('user:left', (user) => {
      try {
        if (this.onUserLeft && user) {
          this.onUserLeft(user);
        }

        // Remove cursor
        const cursor = document.getElementById(`cursor-${user.id}`);
        if (cursor) {
          cursor.remove();
        }
      } catch (error) {
        console.error('Error handling user left:', error);
      }
    });

    // Remote cursor movement
    this.socket.on('server:cursor:move', (data) => {
      try {
        if (this.onCursorMove && data) {
          this.onCursorMove(data);
        }
      } catch (error) {
        // Silently fail for cursor movements
      }
    });

    // Rooms list
    this.socket.on('server:rooms:list', (rooms) => {
      try {
        if (this.onRoomsList && Array.isArray(rooms)) {
          this.onRoomsList(rooms);
        }
      } catch (error) {
        console.error('Error handling rooms list:', error);
      }
    });

    // Reconnection confirmation
    this.socket.on('server:reconnected', (data) => {
      console.log('🔄 Reconnected:', data);
      if (this.onReconnected) {
        this.onReconnected();
      }
    });

    // Server errors
    this.socket.on('server:error', (error) => {
      console.error('Server error:', error);
      if (this.onError) {
        this.onError(error);
      }
    });

    // Pong for latency measurement
    this.socket.on('server:pong', (timestamp) => {
      try {
        const latency = Date.now() - timestamp;
        
        // Keep history for smoothing
        this.latencyHistory.push(latency);
        if (this.latencyHistory.length > 10) {
          this.latencyHistory.shift();
        }
        
        // Calculate average
        const avgLatency = Math.round(
          this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length
        );
        
        if (this.onLatencyUpdate) {
          this.onLatencyUpdate(avgLatency);
        }
      } catch (error) {
        console.error('Error calculating latency:', error);
      }
    });

    // Connection error
    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      if (this.onError) {
        this.onError({ message: 'Connection failed' });
      }
      
      // Attempt reconnection if not intentional disconnect
      if (!this.isIntentionalDisconnect) {
        this.attemptReconnect();
      }
    });

    // Disconnection
    this.socket.on('disconnect', (reason) => {
      console.log('🔌 Disconnected from server:', reason);
      
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
      }
      
      // Attempt reconnection if not intentional
      if (!this.isIntentionalDisconnect && reason !== 'io client disconnect') {
        this.attemptReconnect();
      }
    });
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      if (this.onError) {
        this.onError({ message: 'Unable to reconnect to server' });
      }
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      if (!this.isIntentionalDisconnect && this.roomName && this.userDetails) {
        console.log('🔄 Attempting reconnection...');
        this.connect(this.roomName, this.userDetails, this.sessionId);
      }
    }, delay);
  }

  startPing() {
    // Wait for connection
    if (this.socket.connected) {
      this.doPing();
    } else {
      this.socket.once('connect', () => {
        this.doPing();
      });
    }
  }

  doPing() {
    this.pingInterval = setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('client:ping', Date.now());
      }
    }, 1000);
  }

  sendOperation(operation) {
    if (this.socket && this.socket.connected) {
      try {
        this.socket.emit('client:operation:add', operation);
      } catch (error) {
        console.error('Error sending operation:', error);
      }
    } else {
      console.warn('⚠️ Socket not connected, operation not sent');
    }
  }

  sendDrawStream(data) {
    if (this.socket && this.socket.connected) {
      try {
        // Use volatile for non-critical real-time data
        this.socket.volatile.emit('client:draw:stream', data);
      } catch (error) {
        console.error('Error sending draw stream:', error);
      }
    }
  }

  sendShapePreview(data) {
    if (this.socket && this.socket.connected) {
      try {
        this.socket.volatile.emit('client:shape:preview', data);
      } catch (error) {
        console.error('Error sending shape preview:', error);
      }
    }
  }

  sendUndo() {
    if (this.socket && this.socket.connected) {
      try {
        this.socket.emit('client:undo');
      } catch (error) {
        console.error('Error sending undo:', error);
      }
    }
  }

  sendRedo() {
    if (this.socket && this.socket.connected) {
      try {
        this.socket.emit('client:redo');
      } catch (error) {
        console.error('Error sending redo:', error);
      }
    }
  }

  sendClear() {
    if (this.socket && this.socket.connected) {
      try {
        this.socket.emit('client:clear');
      } catch (error) {
        console.error('Error sending clear:', error);
      }
    }
  }

  sendCursorMove(x, y) {
    if (this.socket && this.socket.connected) {
      try {
        // Use volatile for cursor updates (can be dropped if network busy)
        this.socket.volatile.emit('client:cursor:move', { x, y });
      } catch (error) {
        // Silently fail for cursor movements
      }
    }
  }

  requestRoomsList() {
    if (this.socket && this.socket.connected) {
      try {
        this.socket.emit('client:rooms:request');
      } catch (error) {
        console.error('Error requesting rooms list:', error);
      }
    }
  }

  disconnect() {
    this.isIntentionalDisconnect = true;
    
    if (this.socket) {
      this.socket.disconnect();
    }
    
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
  }

  /**
   * Check if socket is currently connected
   */
  isConnected() {
    return this.socket && this.socket.connected;
  }
}

export default SocketService;