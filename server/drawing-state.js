// A simple in-memory state manager for now.

class DrawingState {
  constructor(roomName) {
    this.roomName = roomName;
    this.drawingHistory = [];
  }

  addOperation(operation) {
    this.drawingHistory.push(operation);
  }

  clear() {
    this.drawingHistory = [];
  }

  getHistory() {
    return this.drawingHistory;
  }
}

module.exports = DrawingState;