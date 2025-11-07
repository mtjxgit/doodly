// This class handles all the drawing logic on the canvas
class DrawingCanvas {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    
    this.isDrawing = false;
    this.lastX = 0;
    this.lastY = 0;

    this.setupCanvas();
    this.bindEvents();
  }

  setupCanvas() {
    const container = this.canvas.parentElement;
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;
  }

  bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => this.startDrawing(e));
    this.canvas.addEventListener('pointermove', (e) => this.draw(e));
    this.canvas.addEventListener('pointerup', () => this.stopDrawing());
    this.canvas.addEventListener('pointerleave', () => this.stopDrawing());
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

    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 5;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(pos.x, pos.y);
    this.ctx.stroke();
    
    [this.lastX, this.lastY] = [pos.x, pos.y];
  }

  stopDrawing() {
    this.isDrawing = false;
  }
}

export default DrawingCanvas;