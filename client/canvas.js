import ShapeTool from './tools/shape-tool.js';

/**
 * DrawingCanvas - Dual-layer canvas implementation with optimized rendering
 * - Background layer: Committed operations (rarely redrawn)
 * - Foreground layer: Local preview and remote previews (frequently redrawn)
 * - Smooth curves using quadratic interpolation
 * - Throttled event handling for performance
 */
class DrawingCanvas {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    
    // Create background layer for committed operations
    this.backgroundCanvas = document.createElement('canvas');
    this.backgroundCtx = this.backgroundCanvas.getContext('2d', { alpha: false });
    
    // Callbacks
    this.onOperationAdd = null;
    this.onCursorMove = null;
    this.onDrawStream = null;
    this.onShapePreview = null;
    
    // Drawing state
    this.isDrawing = false;
    this.currentTool = 'brush';
    this.currentColor = '#000000';
    this.brushWidth = 5;
    this.eraserWidth = 20;
    this.shapeWidth = 5; // Separate thickness for shapes
    this.startX = 0;
    this.startY = 0;
    this.points = [];
    this.currentOperationId = null;
    
    // Remote previews (userId -> preview data)
    this.remotePreviews = new Map();
    
    // Operation history (committed operations only)
    this.history = [];
    
    // Pending operations (optimistic updates)
    this.pendingOperations = new Map();
    
    // Performance tracking
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.fps = 60;
    
    // Mouse event throttling
    this.lastCursorEmit = 0;
    this.cursorThrottle = 50; // ms
    
    // Stroke point batching
    this.strokeBatchSize = 3;
    this.strokeBatchBuffer = [];
    
    // Initialize shape tool
    this.shapeTool = new ShapeTool(this.canvas, this.ctx);
    
    this.setupCanvas();
    this.bindEvents();
    this.startRenderLoop();
  }

  setupCanvas() {
    const container = this.canvas.parentElement;
    this.resizeCanvas(container.clientWidth, container.clientHeight);
    
    window.addEventListener('resize', () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      
      // Preserve both layers during resize
      const tempBg = document.createElement('canvas');
      const tempBgCtx = tempBg.getContext('2d');
      tempBg.width = this.backgroundCanvas.width;
      tempBg.height = this.backgroundCanvas.height;
      tempBgCtx.drawImage(this.backgroundCanvas, 0, 0);
      
      this.resizeCanvas(width, height);
      this.backgroundCtx.drawImage(tempBg, 0, 0);
      this.composeLayers();
    });
  }

  resizeCanvas(width, height) {
    // Resize both canvases
    this.canvas.width = width;
    this.canvas.height = height;
    this.backgroundCanvas.width = width;
    this.backgroundCanvas.height = height;
    
    // Initialize background
    this.backgroundCtx.fillStyle = '#ffffff';
    this.backgroundCtx.fillRect(0, 0, width, height);
  }

  bindEvents() {
    // Use pointer events for better touch support
    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.canvas.addEventListener('pointerleave', (e) => this.onPointerUp(e));
    this.canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));
  }

  getPointerPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { 
      x: e.clientX - rect.left, 
      y: e.clientY - rect.top 
    };
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
    this.currentOperationId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (this.currentTool === 'shape') {
      this.shapeTool.startDrawing(pos.x, pos.y);
      this.shapeTool.setColor(this.currentColor);
      this.shapeTool.setWidth(this.shapeWidth);
    }
  }

  onPointerMove(e) {
    const pos = this.getPointerPos(e);
    
    // Throttled cursor position updates
    const now = Date.now();
    if (this.onCursorMove && now - this.lastCursorEmit > this.cursorThrottle) {
      this.onCursorMove(pos.x, pos.y);
      this.lastCursorEmit = now;
    }

    if (this.currentTool === 'shape' && this.isDrawing) {
      this.shapeTool.updateDrawing(pos.x, pos.y);
      
      const previewData = this.shapeTool.getPreviewData();
      if (previewData) {
        // Draw local preview
        this.drawLocalShapePreview(previewData);
        
        // Send to others
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
      
      // Draw locally with smooth curves
      this.drawSmoothStroke(this.points, isEraser);
      
      // Batch stroke points before emitting
      this.strokeBatchBuffer.push(pos);
      if (this.strokeBatchBuffer.length >= this.strokeBatchSize) {
        if (this.onDrawStream) {
          this.onDrawStream({
            tool: this.currentTool,
            points: [...this.strokeBatchBuffer],
            color: this.currentColor,
            width: isEraser ? this.eraserWidth : this.brushWidth,
            operationId: this.currentOperationId
          });
        }
        this.strokeBatchBuffer = [];
      }
    }
  }

  onPointerUp(e) {
    if (this.currentTool === 'shape' && this.isDrawing) {
      const finalOperation = this.shapeTool.finishDrawing();
      if (finalOperation) {
        finalOperation.id = this.currentOperationId;
        finalOperation.timestamp = Date.now();
        
        // Add to pending operations (optimistic update)
        this.pendingOperations.set(finalOperation.id, finalOperation);
        
        // Clear previews and commit to background
        this.remotePreviews.clear();
        this.commitOperationToBackground(finalOperation);
        this.composeLayers();
        
        // Send to server
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
    
    // Flush remaining batched points
    if (this.strokeBatchBuffer.length > 0 && this.onDrawStream) {
      this.onDrawStream({
        tool: this.currentTool,
        points: [...this.strokeBatchBuffer],
        color: this.currentColor,
        width: this.currentTool === 'eraser' ? this.eraserWidth : this.brushWidth,
        operationId: this.currentOperationId
      });
      this.strokeBatchBuffer = [];
    }
    
    let operation = null;

    switch (this.currentTool) {
      case 'brush':
        this.points.push(pos);
        operation = { 
          type: 'stroke', 
          points: this.simplifyPath(this.points), // Optimize path
          color: this.currentColor, 
          width: this.brushWidth, 
          id: this.currentOperationId,
          timestamp: Date.now()
        };
        break;
      case 'eraser':
        this.points.push(pos);
        operation = { 
          type: 'stroke', 
          points: this.simplifyPath(this.points),
          color: '#ffffff', 
          width: this.eraserWidth, 
          id: this.currentOperationId,
          timestamp: Date.now()
        };
        break;
    }

    if (operation) {
      // Optimistic update
      this.pendingOperations.set(operation.id, operation);
      this.commitOperationToBackground(operation);
      this.composeLayers();
      
      if (this.onOperationAdd) {
        this.onOperationAdd(operation);
      }
    }
    
    this.points = [];
    this.currentOperationId = null;
  }

  /**
   * Simplify path using Douglas-Peucker algorithm
   * Reduces number of points while maintaining shape
   */
  simplifyPath(points, tolerance = 2) {
    if (points.length < 3) return points;
    
    const sqTolerance = tolerance * tolerance;
    
    const sqDistance = (p1, p2) => {
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      return dx * dx + dy * dy;
    };
    
    const sqSegmentDistance = (p, p1, p2) => {
      let x = p1.x, y = p1.y;
      let dx = p2.x - x, dy = p2.y - y;
      
      if (dx !== 0 || dy !== 0) {
        const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
        if (t > 1) {
          x = p2.x;
          y = p2.y;
        } else if (t > 0) {
          x += dx * t;
          y += dy * t;
        }
      }
      
      dx = p.x - x;
      dy = p.y - y;
      return dx * dx + dy * dy;
    };
    
    const simplifyDouglasPeucker = (points, first, last, sqTolerance, simplified) => {
      let maxSqDist = sqTolerance;
      let index = 0;
      
      for (let i = first + 1; i < last; i++) {
        const sqDist = sqSegmentDistance(points[i], points[first], points[last]);
        if (sqDist > maxSqDist) {
          index = i;
          maxSqDist = sqDist;
        }
      }
      
      if (maxSqDist > sqTolerance) {
        if (index - first > 1) simplifyDouglasPeucker(points, first, index, sqTolerance, simplified);
        simplified.push(points[index]);
        if (last - index > 1) simplifyDouglasPeucker(points, index, last, sqTolerance, simplified);
      }
    };
    
    const last = points.length - 1;
    const simplified = [points[0]];
    simplifyDouglasPeucker(points, 0, last, sqTolerance, simplified);
    simplified.push(points[last]);
    
    return simplified;
  }

  /**
   * Draw stroke with quadratic curves for smoothness
   */
  drawSmoothStroke(points, isEraser = false) {
    if (points.length < 2) return;
    
    const ctx = this.ctx;
    ctx.strokeStyle = isEraser ? '#ffffff' : this.currentColor;
    ctx.lineWidth = isEraser ? this.eraserWidth : this.brushWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Redraw everything to avoid artifacts
    this.composeLayers();
    
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    
    if (points.length === 2) {
      ctx.lineTo(points[1].x, points[1].y);
    } else {
      // Use quadratic curves for smoothness
      for (let i = 1; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
      }
      // Last segment
      const last = points[points.length - 1];
      const secondLast = points[points.length - 2];
      ctx.quadraticCurveTo(secondLast.x, secondLast.y, last.x, last.y);
    }
    
    ctx.stroke();
  }

  /**
   * Handle remote drawing stream with batched points
   */
  handleRemoteDrawStream(data) {
    if (!data.operationId) return;
    
    if (!this.remotePreviews.has(data.operationId)) {
      this.remotePreviews.set(data.operationId, {
        points: [],
        tool: data.tool,
        color: data.color,
        width: data.width
      });
    }
    
    const preview = this.remotePreviews.get(data.operationId);
    
    // Handle batched points
    if (Array.isArray(data.points)) {
      preview.points.push(...data.points);
    } else {
      preview.points.push(data.point);
    }
    
    // Redraw with updated preview
    this.composeLayers();
    this.drawRemotePreviewStrokes();
  }

  drawRemotePreviewStrokes() {
    const ctx = this.ctx;
    
    for (let [id, preview] of this.remotePreviews) {
      if (preview.points.length < 2) continue;
      
      ctx.strokeStyle = preview.tool === 'eraser' ? '#ffffff' : preview.color;
      ctx.lineWidth = preview.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      ctx.beginPath();
      ctx.moveTo(preview.points[0].x, preview.points[0].y);
      
      for (let i = 1; i < preview.points.length; i++) {
        ctx.lineTo(preview.points[i].x, preview.points[i].y);
      }
      
      ctx.stroke();
    }
  }

  handleRemoteShapePreview(data) {
    if (!data.userId) return;
    this.remotePreviews.set(data.userId, data);
    this.drawRemoteShapePreviews();
  }

  drawLocalShapePreview(previewData) {
    this.composeLayers();
    this.drawShape(previewData, true, this.ctx);
    this.drawRemoteShapePreviews();
  }

  drawRemoteShapePreviews() {
    const ctx = this.ctx;
    for (let [userId, preview] of this.remotePreviews) {
      if (preview.shape) {
        this.drawShape(preview, true, ctx);
      }
    }
  }

  drawShape(operation, isPreview = false, ctx = this.backgroundCtx) {
    ctx.save();
    
    if (isPreview) {
      ctx.setLineDash([5, 5]);
    }
    
    ctx.strokeStyle = operation.color;
    ctx.lineWidth = operation.width;
    ctx.fillStyle = 'transparent';
    
    const width = operation.endX - operation.startX;
    const height = operation.endY - operation.startY;
    
    ctx.beginPath();

    switch (operation.shape) {
      case 'rectangle':
        ctx.rect(operation.startX, operation.startY, width, height);
        break;
      case 'circle':
        const radiusX = Math.abs(width) / 2;
        const radiusY = Math.abs(height) / 2;
        const centerX = operation.startX + width / 2;
        const centerY = operation.startY + height / 2;
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        break;
      case 'triangle':
        const centerTX = operation.startX + width / 2;
        ctx.moveTo(centerTX, operation.startY);
        ctx.lineTo(operation.endX, operation.endY);
        ctx.lineTo(operation.startX, operation.endY);
        ctx.closePath();
        break;
    }
    
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Commit operation to background layer (rarely redrawn)
   */
  commitOperationToBackground(operation) {
    const ctx = this.backgroundCtx;
    
    switch (operation.type) {
      case 'stroke':
        ctx.strokeStyle = operation.color;
        ctx.lineWidth = operation.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(operation.points[0].x, operation.points[0].y);
        
        for (let i = 1; i < operation.points.length; i++) {
          ctx.lineTo(operation.points[i].x, operation.points[i].y);
        }
        
        ctx.stroke();
        break;
        
      case 'shape':
        this.drawShape(operation, false, ctx);
        break;
    }
  }

  /**
   * Composite background and foreground layers
   */
  composeLayers() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.backgroundCanvas, 0, 0);
  }

  /**
   * Redraw background layer from history
   */
  redrawBackground() {
    this.backgroundCtx.fillStyle = '#ffffff';
    this.backgroundCtx.fillRect(0, 0, this.backgroundCanvas.width, this.backgroundCanvas.height);
    
    this.history.forEach(operation => {
      this.commitOperationToBackground(operation);
    });
  }

  /**
   * Add confirmed operation from server
   */
  addOperationToHistory(operation) {
    // Remove from pending if exists
    if (operation.id) {
      this.pendingOperations.delete(operation.id);
      this.remotePreviews.delete(operation.operationId);
    }
    
    // Check if already exists (deduplicate)
    const exists = this.history.some(op => op.id === operation.id);
    if (exists) return;
    
    // Add to history in order by timestamp
    this.history.push(operation);
    this.history.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
    // Redraw background
    this.redrawBackground();
    this.composeLayers();
  }

  loadHistoryFromServer(history) {
    this.history = history;
    this.pendingOperations.clear();
    this.remotePreviews.clear();
    this.redrawBackground();
    this.composeLayers();
  }

  setTool(tool) {
    if (this.currentTool === 'shape') this.shapeTool.reset();
    this.currentTool = tool;
  }

  setColor(color) {
    this.currentColor = color;
    this.shapeTool.setColor(color);
  }

  setBrushWidth(width) { 
    this.brushWidth = width; 
  }
  
  setEraserWidth(width) { 
    this.eraserWidth = width; 
  }
  
  setShapeWidth(width) { 
    this.shapeWidth = width;
    this.shapeTool.setWidth(width);
  }
  
  setShape(shape) { 
    this.shapeTool.setShape(shape); 
  }
}

export default DrawingCanvas;