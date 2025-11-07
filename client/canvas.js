// This class handles all the drawing logic on the canvas
class DrawingCanvas {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    
    this.isDrawing = false;
    this.lastX = 0;
    this.lastY = 0;

    this.onDraw = null; // Callback for local draw events

    // FPS counter
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.fps = 0;

    this.setupCanvas();
    this.bindEvents();
    this.startRenderLoop(); // Start the loop
  }

  setupCanvas() {
    const container = this.canvas.parentElement;
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;

    // Clear canvas to white
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
      
      // Redraw temp canvas
      this.ctx.drawImage(tempCanvas, 0, 0);
    });
  }

  bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => this.startDrawing(e));
    this.canvas.addEventListener('pointermove', (e) => this.draw(e));
    this.canvas.addEventListener('pointerup', () => this.stopDrawing());
    this.canvas.addEventListener('pointerleave', () => this.stopDrawing());
  }

  // New render loop for FPS
  startRenderLoop() {
    const loop = (currentTime) => {
      this.frameCount++;
      if (currentTime >= this.lastFrameTime + 1000) {
        this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastFrameTime));
        this.frameCount = 0;
        this.lastFrameTime = currentTime;
        
        // Update the UI
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

  startDrawing(e) {
    this.isDrawing = true;
    const pos = this.getPointerPos(e);
    [this.lastX, this.lastY] = [pos.x, pos.y];
  }

  draw(e) {
    if (!this.isDrawing) return;

    const pos = this.getPointerPos(e);
    const data = {
      x0: this.lastX,
      y0: this.lastY,
      x1: pos.x,
      y1: pos.y,
      color: '#000000' // Hardcode color for now
    };

    this.drawSegment(data);

    if (this.onDraw) {
      this.onDraw(data);
    }
    
    [this.lastX, this.lastY] = [pos.x, pos.y];
  }

  stopDrawing() {
    this.isDrawing = false;
  }

  drawSegment(data) {
    this.ctx.strokeStyle = data.color || '#000000';
    this.ctx.lineWidth = 5;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.ctx.beginPath();
    this.ctx.moveTo(data.x0, data.y0);
    this.ctx.lineTo(data.x1, data.y1);
    this.ctx.stroke();
  }

  remoteDraw(data) {
    this.drawSegment(data);
  }

  // New method to clear the canvas
  clear() {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

export default DrawingCanvas;