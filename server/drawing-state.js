const fs = require('fs');
const path = require('path');

class DrawingState {
  constructor(roomName) {
    this.roomName = roomName;
    this.drawingHistory = [];
    this.saveTimeout = null;
    this.dataDir = path.join(__dirname, '../room-data');
    this.filePath = path.join(this.dataDir, `${roomName}.json`);

    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

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
    } catch (err) {
      console.error(`❌ Error saving room data for ${this.roomName}:`, err);
    }
  }

  // Debounce save to avoid spamming the disk
  debouncedSave() {
    clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.saveToDisk();
    }, 1000); // Save 1 second after last operation
  }

  addOperation(operation) {
    this.drawingHistory.push(operation);
    this.debouncedSave();
  }

  clear() {
    this.drawingHistory = [];
    this.saveToDisk(); // Clear immediately
  }

  getHistory() {
    return this.drawingHistory;
  }
}

module.exports = DrawingState;