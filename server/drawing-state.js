const fs = require('fs');
const path = require('path');

class DrawingState {
  constructor(roomName) {
    this.roomName = roomName;
    this.drawingHistory = [];
    this.redoStack = [];
    this.saveTimeout = null;
    this.dataDir = path.join(__dirname, '../room-data');
    this.filePath = path.join(this.dataDir, `${roomName}.json`);

    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    // Load from disk if exists
    this.loadFromDisk();
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf8');
        this.drawingHistory = JSON.parse(data);
        console.log(`📂 Loaded ${this.drawingHistory.length} operations for room: ${this.roomName}`);
      }
    } catch (err) {
      console.error(`❌ Error loading room data for ${this.roomName}:`, err);
    }
  }

  saveToDisk() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.drawingHistory, null, 2));
      console.log(`💾 Saved ${this.drawingHistory.length} operations for room: ${this.roomName}`);
    } catch (err) {
      console.error(`❌ Error saving room data for ${this.roomName}:`, err);
    }
  }

  debouncedSave() {
    clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.saveToDisk();
    }, 1000);
  }

  addOperation(operation) {
    this.drawingHistory.push(operation);
    this.redoStack = []; // Clear redo stack on new operation
    this.debouncedSave();
  }

  // Fix: Renamed/repurposed for object/text updates
  updateOperationById(operation) {
    if (!operation.id) return;
    const index = this.drawingHistory.findIndex(op => op.id === operation.id);
    if (index > -1) {
      this.drawingHistory[index] = operation; // Update existing
      this.redoStack = []; // Clear redo on update
      this.debouncedSave();
    } else {
      // If not found, just add it as a new operation
      this.addOperation(operation);
    }
  }

  undo() {
    if (this.drawingHistory.length === 0) return false;
    
    // Simple undo, may not work perfectly with text edits
    const operation = this.drawingHistory.pop();
    this.redoStack.push(operation);
    this.debouncedSave();
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    
    const operation = this.redoStack.pop();
    this.drawingHistory.push(operation);
    this.debouncedSave();
    return true;
  }

  clear() {
    this.drawingHistory = [];
    this.redoStack = [];
    this.saveToDisk();
  }

  getHistory() {
    return this.drawingHistory;
  }

  getAllRooms() {
    try {
      const files = fs.readdirSync(this.dataDir);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
    } catch (err) {
      return [];
    }
  }
}

module.exports = DrawingState;