// This class handles all the drawing logic on the canvas
class DrawingCanvas {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    
    this.history = []; // NEW: Local copy of history
    this.isDrawing = false;
    this.lastX = 0;
    this.lastY = 0;

    this.currentTool = 'brush';
    this.currentColor = '#000000';
    this.brushWidth = 5;
    this.eraserWidth = 20;

    this.onOperationAdd = null; // RENAMED from onDraw
    this.onCursorMove = null;

    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.fps = 0;

    this.setupCanvas();
    this.bindEvents();
    this.startRenderLoop();
  }

  setupCanvas() {
    // ... (This function remains unchanged)
    const container = this.canvas.parentElement;
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;

    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    window.addEventListener('resize', () => {
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      tempCanvas.width = this.canvas.width;
      tempCanvas.height = this.canvas.height;
      tempCtx.drawImage(this.canvas, 0, 0);

      this.canvas.width = container.clientWidth;
      this.canvas.height = container.clientHeight;
      
      this.ctx.drawImage(tempCanvas, 0, 0);
    });
  }

  bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => this.startDrawing(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onPointerUp(e)); // Modified
    this.canvas.addEventListener('pointerleave', (e) => this.onPointerUp(e)); // Modified
  }

  startRenderLoop() {
    // ... (This function remains unchanged)
    const loop = (currentTime) => {
      this.frameCount++;
      if (currentTime >= this.lastFrameTime + 1000) {
        this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastFrameTime));
        this.frameCount = 0;
        this.lastFrameTime = currentTime;
        
        const fpsEl = document.getElementById('fps');
        if (fpsEl) fpsEl.textContent = this.fps;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  getPointerPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { 
      x: e.clientX - rect.left, 
      y: e.clientY - rect.top 
    };
  }

  onPointerMove(e) {
    const pos = this.getPointerPos(e);
    
    if (this.onCursorMove) {
      this.onCursorMove(pos.x, pos.y);
    }

    this.draw(pos);
  }

  startDrawing(e) {
    this.isDrawing = true;
    const pos = this.getPointerPos(e);
    [this.lastX, this.lastY] = [pos.x, pos.y];
  }

  draw(pos) {
    if (!this.isDrawing) return;

    // This is now just for real-time streaming, not for history
    const isEraser = this.currentTool === 'eraser';
    const color = isEraser ? '#FFFFFF' : this.currentColor;
    const width = isEraser ? this.eraserWidth : this.brushWidth;

    const data = {
      x0: this.lastX,
      y0: this.lastY,
      x1: pos.x,
      y1: pos.y,
      color: color,
      width: width
    };
    
    // Draw locally
    this.drawSegment(data);

    // We don't send to history here anymore. We wait for pointerup.
    // We can, however, send a "stream" event for live drawing
    
    [this.lastX, this.lastY] = [pos.x, pos.y];
  }

  // NEW: Handle pointer up
  onPointerUp(e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    
    const pos = this.getPointerPos(e);

    
    const isEraser = this.currentTool === 'eraser';
    const color = isEraser ? '#FFFFFF' : this.currentColor;
    const width = isEraser ? this.eraserWidth : this.brushWidth;
    
   
    
    const operation = {
        type: 'stroke',
        data: {
            x0: this.lastX,
            y0: this.lastY,
            x1: pos.x,
            y1: pos.y,
            color: color,
            width: width
        }
    };
    
    this.history.push(operation); // Save locally
    if (this.onOperationAdd) {
      this.onOperationAdd(operation); // Send to server
    }
  }

  drawSegment(data) {
    this.ctx.strokeStyle = data.color;
    this.ctx.lineWidth = data.width;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.ctx.beginPath();
    this.ctx.moveTo(data.x0, data.y0);
    this.ctx.lineTo(data.x1, data.y1);
    this.ctx.stroke();
  }

  // RENAMED from remoteDraw
  drawOperation(operation) {
    if (operation.type === 'stroke') {
        this.drawSegment(operation.data);
    }
    // We'll add other types (shape, text) later
  }

  clear() {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // --- New History Methods ---
  loadHistoryFromServer(history) {
    this.history = history;
    this.redrawFromHistory();
  }
  
  addOperationToHistory(operation) {
    this.history.push(operation);
    this.drawOperation(operation);
  }
  
  redrawFromHistory() {
    this.clear();
    this.history.forEach(op => this.drawOperation(op));
  }

  // --- Unchanged Methods ---
  setTool(tool) {
    this.currentTool = tool;
  }
  setColor(color) {
    this.currentColor = color;
    document.querySelector('#color-btn .color-preview').style.background = color;
  }
  setBrushWidth(width) {
    this.brushWidth = width;
  }
  setEraserWidth(width) {
    this.eraserWidth = width;
  }
}

export default DrawingCanvas;