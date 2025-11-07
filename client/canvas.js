import ShapeTool from './tools/shape-tool.js';

class DrawingCanvas {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.onOperationAdd = null;
    this.onCursorMove = null;
    this.onDrawStream = null;
    this.onShapePreview = null;
    this.isDrawing = false;
    this.currentTool = 'brush';
    this.currentColor = '#000000';
    this.brushWidth = 5;
    this.eraserWidth = 20;
    this.startX = 0;
    this.startY = 0;
    this.points = [];
    this.currentOperationId = null;
    this.remotePreviews = new Map();
    this.history = [];
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.fps = 60;
    
    // Initialize shape tool
    this.shapeTool = new ShapeTool(this.canvas, this.ctx);
    
    this.setupCanvas();
    this.bindEvents();
    this.startRenderLoop();
  }

  setupCanvas() {
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
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(tempCanvas, 0, 0);
    });
  }

  bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.canvas.addEventListener('pointerleave', (e) => this.onPointerUp(e));
  }

  getPointerPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  startRenderLoop() {
    const loop = () => {
      const currentTime = performance.now();
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
    loop();
  }

  onPointerDown(e) {
    const pos = this.getPointerPos(e);
    this.isDrawing = true;
    this.startX = pos.x;
    this.startY = pos.y;
    this.points = [pos];
    this.currentOperationId = Date.now() + '_' + Math.random();

    if (this.currentTool === 'shape') {
      this.shapeTool.startDrawing(pos.x, pos.y);
      this.shapeTool.setColor(this.currentColor);
      this.shapeTool.setWidth(this.brushWidth);
    }
  }

  onPointerMove(e) {
    const pos = this.getPointerPos(e);
    if (this.onCursorMove) this.onCursorMove(pos.x, pos.y);

    if (this.currentTool === 'shape' && this.isDrawing) {
      this.shapeTool.updateDrawing(pos.x, pos.y);
      
      // Get preview data and draw locally
      const previewData = this.shapeTool.getPreviewData();
      if (previewData) {
        this.drawLocalPreview(previewData);
        
        // Send preview to others
        if (this.onShapePreview) {
          this.onShapePreview(previewData);
        }
      }
      return;
    }

    if (!this.isDrawing) return;

    if (this.currentTool === 'brush' || this.currentTool === 'eraser') {
      this.points.push(pos);
      const isEraser = this.currentTool === 'eraser';
      this.drawStrokeSegment(this.points[this.points.length - 2], this.points[this.points.length - 1], isEraser);
      if (this.onDrawStream) {
        this.onDrawStream({
          tool: this.currentTool,
          point: pos,
          color: this.currentColor,
          width: isEraser ? this.eraserWidth : this.brushWidth,
          operationId: this.currentOperationId
        });
      }
    }
  }

  onPointerUp(e) {
    if (this.currentTool === 'shape' && this.isDrawing) {
      const finalOperation = this.shapeTool.finishDrawing();
      if (finalOperation) {
        finalOperation.id = this.currentOperationId;
        
        // Clear all previews and redraw from history
        this.remotePreviews.clear();
        this.redrawFromHistory();
        
        // Add to history and draw
        this.history.push(finalOperation);
        this.drawShape(finalOperation, false);
        
        // Send final operation to server
        if (this.onOperationAdd) {
          this.onOperationAdd(finalOperation);
        }
      }
      this.isDrawing = false;
      return;
    }

    if (!this.isDrawing) return;
    const pos = this.getPointerPos(e);
    this.isDrawing = false;
    let operation = null;

    switch (this.currentTool) {
      case 'brush':
        this.points.push(pos);
        operation = { type: 'stroke', points: this.points, color: this.currentColor, width: this.brushWidth, id: this.currentOperationId };
        this.history.push(operation);
        break;
      case 'eraser':
        this.points.push(pos);
        operation = { type: 'stroke', points: this.points, color: '#ffffff', width: this.eraserWidth, id: this.currentOperationId };
        this.history.push(operation);
        break;
    }

    if (operation && this.onOperationAdd) this.onOperationAdd(operation);
    this.points = [];
    this.currentOperationId = null;
  }

  drawStrokeSegment(p1, p2, isEraser = false) {
    if (!p1 || !p2) return;
    this.ctx.strokeStyle = isEraser ? '#ffffff' : this.currentColor;
    this.ctx.lineWidth = isEraser ? this.eraserWidth : this.brushWidth;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.beginPath();
    this.ctx.moveTo(p1.x, p1.y);
    this.ctx.lineTo(p2.x, p2.y);
    this.ctx.stroke();
  }

  handleRemoteDrawStream(data) {
    if (!this.remotePreviews.has(data.operationId)) {
      this.remotePreviews.set(data.operationId, []);
    }
    const points = this.remotePreviews.get(data.operationId);
    if (points.length > 0) {
      this.ctx.strokeStyle = data.tool === 'eraser' ? '#ffffff' : data.color;
      this.ctx.lineWidth = data.width;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.beginPath();
      this.ctx.moveTo(points[points.length - 1].x, points[points.length - 1].y);
      this.ctx.lineTo(data.point.x, data.point.y);
      this.ctx.stroke();
    }
    points.push(data.point);
  }

  handleRemoteShapePreview(data) {
    this.remotePreviews.set(data.userId, data);
    this.redrawWithPreviews();
  }

  drawShape(operation, isPreview = false) {
    this.ctx.save();
    
    if (isPreview) {
      this.ctx.setLineDash([5, 5]);
    }
    
    this.ctx.strokeStyle = operation.color;
    this.ctx.lineWidth = operation.width;
    this.ctx.fillStyle = 'transparent';
    const width = operation.endX - operation.startX;
    const height = operation.endY - operation.startY;
    this.ctx.beginPath();

    switch (operation.shape) {
      case 'rectangle':
        this.ctx.rect(operation.startX, operation.startY, width, height);
        break;
      case 'circle':
        const radiusX = Math.abs(width) / 2;
        const radiusY = Math.abs(height) / 2;
        const centerX = operation.startX + width / 2;
        const centerY = operation.startY + height / 2;
        this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        break;
      case 'triangle':
        const centerTX = operation.startX + width / 2;
        this.ctx.moveTo(centerTX, operation.startY);
        this.ctx.lineTo(operation.endX, operation.endY);
        this.ctx.lineTo(operation.startX, operation.endY);
        this.ctx.closePath();
        break;
    }
    
    this.ctx.stroke();
    
    if (isPreview) {
      this.ctx.setLineDash([]);
    }
    
    this.ctx.restore();
  }

  drawLocalPreview(previewData) {
    this.redrawWithPreviews();
    this.drawShape(previewData, true);
  }

  redrawFromHistory() {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.history.forEach(operation => this.drawOperation(operation));
  }

  redrawWithPreviews() {
    this.redrawFromHistory();
    for (let [userId, preview] of this.remotePreviews) {
      if (userId !== 'local') {
        this.drawShape(preview, true);
      }
    }
  }

  drawOperation(operation) {
    switch (operation.type) {
      case 'stroke':
        this.ctx.strokeStyle = operation.color;
        this.ctx.lineWidth = operation.width;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.beginPath();
        this.ctx.moveTo(operation.points[0].x, operation.points[0].y);
        for (let i = 1; i < operation.points.length; i++) {
          this.ctx.lineTo(operation.points[i].x, operation.points[i].y);
        }
        this.ctx.stroke();
        break;
      case 'shape':
        this.drawShape(operation, false);
        break;
    }
  }

  addOperationToHistory(operation) {
    this.history.push(operation);
    this.drawOperation(operation);
  }

  loadHistoryFromServer(history) {
    this.history = history;
    this.redrawFromHistory();
  }

  setTool(tool) {
    if (this.currentTool === 'shape') this.shapeTool.reset();
    this.currentTool = tool;
  }

  setColor(color) {
    this.currentColor = color;
    this.shapeTool.setColor(color);
  }

  setBrushWidth(width) { this.brushWidth = width; }
  setEraserWidth(width) { this.eraserWidth = width; }
  setShape(shape) { this.shapeTool.setShape(shape); }
}

export default DrawingCanvas;