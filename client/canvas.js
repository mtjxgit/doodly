import ShapeTool from './tools/shape-tool.js';

/**
 * DrawingCanvas - Dual-layer canvas with optimized rendering
 * - Background: committed operations only
 * - Foreground: local and remote previews only
 * - Smooth brush strokes with quadratic interpolation
 * - Coalesced cursor updates and throttled streaming
 */
class DrawingCanvas {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d', { alpha: false });

    // Background layer for committed operations
    this.backgroundCanvas = document.createElement('canvas');
    this.backgroundCtx = this.backgroundCanvas.getContext('2d', { alpha: false });

    // Callbacks (wired by main.js)
    this.onOperationAdd = null;
    this.onCursorMove = null;
    this.onDrawStream = null;
    this.onShapePreview = null;

    // State
    this.isDrawing = false;
    this.currentTool = 'brush';
    this.currentColor = '#000000';
    this.brushWidth = 5;
    this.eraserWidth = 20;
    this.shapeWidth = 5;
    this.points = [];
    this.currentOperationId = null;

    // Previews
    this.remoteStrokePreviews = new Map(); // operationId -> {points, tool, color, width}
    this.remoteShapePreviews = new Map();  // userId -> previewData

    // History and pending
    this.history = [];
    this.pendingOperations = new Map();

    // Cursor emit throttling via rAF coalescing
    this.cursorPendingPos = null;
    this.cursorRafId = null;
    this.cursorEmitIntervalMs = 50;
    this.lastCursorEmit = 0;

    // Stroke streaming
    this.strokeBatchSize = 3;
    this.strokeBatchBuffer = [];

    // Preview redraw coalescing
    this.previewRafId = null;

    // Limits to avoid memory growth for in-flight streams
    this.maxPreviewPoints = 4000;

    // Shape tool
    this.shapeTool = new ShapeTool(this.canvas, this.ctx);

    this.setupCanvas();
    this.bindEvents();
    this.startFpsCounter();
  }

  setupCanvas() {
    const container = this.canvas.parentElement;
    this.resizeCanvas(container.clientWidth, container.clientHeight);

    window.addEventListener('resize', () => {
      const width = container.clientWidth;
      const height = container.clientHeight;

      // Preserve background during resize using a single temp canvas
      const tempBg = document.createElement('canvas');
      tempBg.width = this.backgroundCanvas.width;
      tempBg.height = this.backgroundCanvas.height;
      const tctx = tempBg.getContext('2d', { alpha: false });
      tctx.drawImage(this.backgroundCanvas, 0, 0);

      this.resizeCanvas(width, height);
      this.backgroundCtx.drawImage(tempBg, 0, 0);
      this.composeLayers();
    }, { passive: true });
  }

  resizeCanvas(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.backgroundCanvas.width = width;
    this.backgroundCanvas.height = height;

    // Initialize background as white
    this.backgroundCtx.fillStyle = '#ffffff';
    this.backgroundCtx.fillRect(0, 0, width, height);
  }

  bindEvents() {
    // Use pointer events for mouse/touch/pen
    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    // Treat up/leave/cancel uniformly
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => {
      this.canvas.addEventListener(type, (e) => this.onPointerUp(e));
    });
  }

  getPointerPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  startFpsCounter() {
    let lastTime = performance.now();
    let frames = 0;
    const fpsEl = document.getElementById('fps');

    const loop = () => {
      const now = performance.now();
      frames++;
      if (now - lastTime >= 1000) {
        if (fpsEl) fpsEl.textContent = String(frames);
        frames = 0;
        lastTime = now;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  emitCursorCoalesced(x, y) {
    this.cursorPendingPos = { x, y };
    if (this.cursorRafId) return;

    this.cursorRafId = requestAnimationFrame(() => {
      const now = performance.now();
      if (this.onCursorMove && this.cursorPendingPos && (now - this.lastCursorEmit) >= this.cursorEmitIntervalMs) {
        this.onCursorMove(this.cursorPendingPos.x, this.cursorPendingPos.y);
        this.lastCursorEmit = now;
      }
      this.cursorPendingPos = null;
      this.cursorRafId = null;
    });
  }

  onPointerDown(e) {
    e.preventDefault();
    const pos = this.getPointerPos(e);
    this.isDrawing = true;
    this.points = [pos];
    this.currentOperationId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    if (this.currentTool === 'shape') {
      this.shapeTool.startDrawing(pos.x, pos.y);
      this.shapeTool.setColor(this.currentColor);
      this.shapeTool.setWidth(this.shapeWidth);
    }
  }

  onPointerMove(e) {
    const pos = this.getPointerPos(e);

    // Coalesced cursor updates
    this.emitCursorCoalesced(pos.x, pos.y);

    if (this.currentTool === 'shape' && this.isDrawing) {
      this.shapeTool.updateDrawing(pos.x, pos.y);
      const previewData = this.shapeTool.getPreviewData();
      if (previewData) {
        this.drawLocalShapePreview(previewData);
        if (this.onShapePreview) this.onShapePreview(previewData);
      }
      return;
    }

    if (!this.isDrawing) return;

    if (this.currentTool === 'brush' || this.currentTool === 'eraser') {
      this.points.push(pos);
      const isEraser = (this.currentTool === 'eraser');

      // Draw locally with smooth curves on foreground
      this.drawSmoothStroke(this.points, isEraser);

      // Batch points for streaming
      this.strokeBatchBuffer.push(pos);
      if (this.strokeBatchBuffer.length >= this.strokeBatchSize) {
        if (this.onDrawStream) {
          this.onDrawStream({
            tool: this.currentTool,
            points: this.strokeBatchBuffer.slice(),
            color: this.currentColor,
            width: isEraser ? this.eraserWidth : this.brushWidth,
            operationId: this.currentOperationId
          });
        }
        this.strokeBatchBuffer.length = 0;
      }
    }
  }

  onPointerUp(e) {
    if (this.currentTool === 'shape' && this.isDrawing) {
      const finalOperation = this.shapeTool.finishDrawing();
      this.isDrawing = false;

      if (finalOperation) {
        finalOperation.id = this.currentOperationId;
        finalOperation.timestamp = Date.now();

        // Optimistic commit
        this.pendingOperations.set(finalOperation.id, finalOperation);
        this.commitOperationToBackground(finalOperation);
        this.composeLayers();

        // Redraw previews (they might have been cleared by compose)
        this.redrawPreviews();

        if (this.onOperationAdd) this.onOperationAdd(finalOperation);
      }
      this.currentOperationId = null;
      return;
    }

    if (!this.isDrawing) return;

    this.isDrawing = false;

    // Flush remaining batched points
    if (this.strokeBatchBuffer.length > 0 && this.onDrawStream) {
      this.onDrawStream({
        tool: this.currentTool,
        points: this.strokeBatchBuffer.slice(),
        color: this.currentColor,
        width: this.currentTool === 'eraser' ? this.eraserWidth : this.brushWidth,
        operationId: this.currentOperationId
      });
      this.strokeBatchBuffer.length = 0;
    }

    let operation = null;
    if (this.currentTool === 'brush' || this.currentTool === 'eraser') {
      operation = {
        type: 'stroke',
        // --- CHANGE: Do not simplify. Send raw points. ---
        points: this.points,
        color: this.currentTool === 'eraser' ? '#ffffff' : this.currentColor,
        width: this.currentTool === 'eraser' ? this.eraserWidth : this.brushWidth,
        id: this.currentOperationId,
        timestamp: Date.now()
      };
    }

    if (operation) {
      this.pendingOperations.set(operation.id, operation);
      this.commitOperationToBackground(operation);
      this.composeLayers();
      if (this.onOperationAdd) this.onOperationAdd(operation);
    }

    this.points = [];
    this.currentOperationId = null;
  }

  // --- REMOVED simplifyPath FUNCTION ---
  // It was the cause of the problem.

  /**
   * --- HELPER FUNCTION (Updated for sharp angles) ---
   * A single, reusable function to draw a smooth line.
   * This uses a midpoint technique that respects sharp corners.
   */
  _drawSmoothLine(ctx, points, color, width, isEraser = false) {
    if (points.length < 2) return;

    ctx.save();
    ctx.strokeStyle = isEraser ? '#ffffff' : color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    if (points.length === 2) {
      ctx.lineTo(points[1].x, points[1].y);
    } else {
      // Draw midpoints
      let i = 1;
      for (; i < points.length - 2; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
      }
      // Draw the last two points
      ctx.quadraticCurveTo(
        points[i].x,
        points[i].y,
        points[i + 1].x,
        points[i + 1].y
      );
    }
    ctx.stroke();
    ctx.restore();
  }

  // Smooth stroke drawing on foreground (UPDATED)
  drawSmoothStroke(points, isEraser = false) {
    // Redraw background first
    this.composeLayers();

    const color = isEraser ? '#ffffff' : this.currentColor;
    const width = isEraser ? this.eraserWidth : this.brushWidth;

    // Use the new helper on the main context
    this._drawSmoothLine(this.ctx, points, color, width, isEraser);
  }

  // Remote draw stream with batched points
  handleRemoteDrawStream(data) {
    if (!data.operationId) return;

    let preview = this.remoteStrokePreviews.get(data.operationId);
    if (!preview) {
      preview = { points: [], tool: data.tool, color: data.color, width: data.width };
      this.remoteStrokePreviews.set(data.operationId, preview);
    }

    const incoming = Array.isArray(data.points) ? data.points : [data.point];
    preview.points.push(...incoming);

    // Cap buffer to avoid memory growth
    if (preview.points.length > this.maxPreviewPoints) {
      preview.points.splice(0, preview.points.length - this.maxPreviewPoints);
    }

    this.requestPreviewRedraw();
  }

  // Coalesced preview redraw for both strokes and shapes
  requestPreviewRedraw() {
    if (this.previewRafId) return;
    this.previewRafId = requestAnimationFrame(() => {
      this.composeLayers();
      this.drawRemotePreviewStrokes();
      this.drawRemoteShapePreviews();
      this.previewRafId = null;
    });
  }

  // UPDATED
  drawRemotePreviewStrokes() {
    const ctx = this.ctx;
    for (const preview of this.remoteStrokePreviews.values()) {
      if (preview.points.length < 2) continue;

      const isEraser = preview.tool === 'eraser';
      
      // Use the new helper
      this._drawSmoothLine(ctx, preview.points, preview.color, preview.width, isEraser);
    }
  }

  // Remote shape preview handling
  handleRemoteShapePreview(data) {
    if (!data.userId) return;
    this.remoteShapePreviews.set(data.userId, data);
    this.requestPreviewRedraw();
  }

  handleRemoteShapePreviewClear(data) {
    if (!data.userId) return;
    this.remoteShapePreviews.delete(data.userId);
    this.requestPreviewRedraw();
  }

  // Local shape preview
  drawLocalShapePreview(previewData) {
    this.composeLayers();
    this.drawRemotePreviewStrokes();
    this.drawRemoteShapePreviews();
    this.drawShape(previewData, true, this.ctx);
  }

  drawRemoteShapePreviews() {
    const ctx = this.ctx;
    for (const preview of this.remoteShapePreviews.values()) {
      if (preview.shape) this.drawShape(preview, true, ctx);
    }
  }

  drawShape(operation, isPreview = false, ctx = this.backgroundCtx) {
    ctx.save();
    if (isPreview) ctx.setLineDash([5, 5]);
    ctx.strokeStyle = operation.color;
    ctx.lineWidth = operation.width;

    const width = operation.endX - operation.startX;
    const height = operation.endY - operation.startY;

    ctx.beginPath();
    switch (operation.shape) {
      case 'rectangle':
        ctx.rect(operation.startX, operation.startY, width, height);
        break;
      case 'circle': {
        const radiusX = Math.abs(width) / 2;
        const radiusY = Math.abs(height) / 2;
        const centerX = operation.startX + width / 2;
        const centerY = operation.startY + height / 2;
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        break;
      }
      case 'triangle': {
        const centerTX = operation.startX + width / 2;
        ctx.moveTo(centerTX, operation.startY);
        ctx.lineTo(operation.endX, operation.endY);
        ctx.lineTo(operation.startX, operation.endY);
        ctx.closePath();
        break;
      }
      default:
        break;
    }
    ctx.stroke();
    ctx.restore();
  }

  // UPDATED
  commitOperationToBackground(operation) {
    const ctx = this.backgroundCtx;

    if (operation.type === 'stroke') {
      if (!operation.points || operation.points.length === 0) return;

      const isEraser = operation.color === '#ffffff';
      
      // Use the new helper on the background context
      this._drawSmoothLine(
        ctx, 
        operation.points, 
        operation.color, 
        operation.width, 
        isEraser
      );
      return;
    }

    if (operation.type === 'shape') {
      this.drawShape(operation, false, ctx);
    }
  }

  composeLayers() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.backgroundCanvas, 0, 0);
  }

  redrawBackground() {
    this.backgroundCtx.fillStyle = '#ffffff';
    this.backgroundCtx.fillRect(0, 0, this.backgroundCanvas.width, this.backgroundCanvas.height);
    for (const op of this.history) {
      this.commitOperationToBackground(op);
    }
  }

  addOperationToHistory(operation) {
    if (operation.id) {
      this.pendingOperations.delete(operation.id);
      // Clean corresponding previews
      if (operation.type === 'stroke' && operation.operationId) {
        this.remoteStrokePreviews.delete(operation.operationId);
      }
      // MODIFIED: Check for operation.id, not operation.operationId
      if (operation.type === 'stroke') {
        this.remoteStrokePreviews.delete(operation.id);
      }
      if (operation.type === 'shape' && operation.userId) {
        this.remoteShapePreviews.delete(operation.userId);
      }
    }

    // Deduplicate by id
    if (operation.id && this.history.some(op => op.id === operation.id)) {
      this.redrawBackground();
      this.requestPreviewRedraw();
      return;
    }

    this.history.push(operation);
    this.history.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    this.redrawBackground();
    this.requestPreviewRedraw();
  }

  loadHistoryFromServer(history) {
    this.history = Array.isArray(history) ? history : [];
    this.pendingOperations.clear();
    this.remoteStrokePreviews.clear();
    this.remoteShapePreviews.clear();
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

  // Helper to redraw both preview types
  redrawPreviews() {
    this.composeLayers();
    this.drawRemotePreviewStrokes();
    this.drawRemoteShapePreviews();
  }
}

export default DrawingCanvas;