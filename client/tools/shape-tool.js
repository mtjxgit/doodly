class ShapeTool {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.isDrawing = false;
    this.startX = 0;
    this.startY = 0;
    this.endX = 0;
    this.endY = 0;
    this.currentShape = 'rectangle';
    this.color = '#000000';
    this.width = 5;
  }

  startDrawing(x, y) {
    this.isDrawing = true;
    this.startX = x;
    this.startY = y;
    this.endX = x;
    this.endY = y;
  }

  updateDrawing(x, y) {
    if (!this.isDrawing) return;
    this.endX = x;
    this.endY = y;
  }

  finishDrawing() {
    if (!this.isDrawing) return null;
    
    this.isDrawing = false;
    
    return {
      type: 'shape',
      shape: this.currentShape,
      startX: this.startX,
      startY: this.startY,
      endX: this.endX,
      endY: this.endY,
      color: this.color,
      width: this.width
    };
  }

  getPreviewData() {
    if (!this.isDrawing) return null;
    
    return {
      shape: this.currentShape,
      startX: this.startX,
      startY: this.startY,
      endX: this.endX,
      endY: this.endY,
      color: this.color,
      width: this.width
    };
  }

  setShape(shape) {
    this.currentShape = shape;
  }

  setColor(color) {
    this.color = color;
  }

  setWidth(width) {
    this.width = width;
  }

  reset() {
    this.isDrawing = false;
  }
}

export default ShapeTool;