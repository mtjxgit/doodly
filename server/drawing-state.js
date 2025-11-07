const fs = require('fs');
const path = require('path');

/**
 * DrawingState - Manages canvas state with proper ordering and conflict resolution
 * - Operations are ordered by timestamp for consistency
 * - Undo/redo maintains operation order across users
 * - Persistent storage with atomic writes
 *
 * --- OPTIMIZATIONS ---
 * - Perf: Replaced expensive O(N log N) `sort()` on every add/redo
 * - with a more efficient O(N) `_insertOperation` (splice).
 */
class DrawingState {
  constructor(roomName) {
    this.roomName = roomName;
    this.drawingHistory = []; // All operations in chronological order
    this.redoStack = [];
    this.saveTimeout = null;
    this.dataDir = path.join(__dirname, '../room-data');
    this.filePath = path.join(this.dataDir, `${this.sanitizeRoomName(roomName)}.json`);
    this.tempFilePath = this.filePath + '.tmp';

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    this.loadFromDisk();
  }

  sanitizeRoomName(name) {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(data);
        
        if (Array.isArray(parsed)) {
          this.drawingHistory = parsed;
          // Ensure operations are sorted on initial load
          this.drawingHistory.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
          console.log(`📂 Loaded ${this.drawingHistory.length} operations for room: ${this.roomName}`);
        } else {
          console.warn(`⚠️ Invalid data format for room ${this.roomName}, starting fresh`);
          this.drawingHistory = [];
        }
      }
    } catch (err) {
      console.error(`❌ Error loading room data for ${this.roomName}:`, err);
      
      const backupPath = this.filePath + '.backup';
      if (fs.existsSync(backupPath)) {
        try {
          const backupData = fs.readFileSync(backupPath, 'utf8');
          this.drawingHistory = JSON.parse(backupData);
          // Also sort backup data
          this.drawingHistory.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
          console.log(`✅ Recovered from backup for room: ${this.roomName}`);
        } catch (backupErr) {
          console.error(`❌ Backup recovery failed:`, backupErr);
          this.drawingHistory = [];
        }
      }
    }
  }

  saveToDisk() {
    try {
      if (fs.existsSync(this.filePath)) {
        const backupPath = this.filePath + '.backup';
        fs.copyFileSync(this.filePath, backupPath);
      }

      const data = JSON.stringify(this.drawingHistory, null, 2);
      fs.writeFileSync(this.tempFilePath, data, 'utf8');
      
      fs.renameSync(this.tempFilePath, this.filePath);
      
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

  /**
   * --- OPTIMIZATION: O(N) Insertion ---
   * Inserts an operation in chronological order without sorting the whole array.
   * This is much faster than O(N log N) for an already-sorted list.
   */
  _insertOperation(operation) {
    const newTime = operation.timestamp || 0;
    
    // Find the correct index to insert at
    // We search from the end for efficiency, as new ops are usually last
    let i = this.drawingHistory.length - 1;
    while (i >= 0 && (this.drawingHistory[i].timestamp || 0) > newTime) {
      i--;
    }
    
    // Insert at the correct position
    this.drawingHistory.splice(i + 1, 0, operation);
  }

  /**
   * Add new operation with ordering
   */
  addOperation(operation) {
    if (!operation.timestamp) {
      operation.timestamp = Date.now();
    }

    // Use efficient insertion instead of push + sort
    this._insertOperation(operation);
    
    this.redoStack = []; // Clear redo stack on new operation
    this.debouncedSave();
  }

  findOperationById(id) {
    return this.drawingHistory.find(op => op.id === id);
  }

  updateOperationById(operation) {
    if (!operation.id) {
      this.addOperation(operation);
      return;
    }

    const index = this.drawingHistory.findIndex(op => op.id === operation.id);
    
    if (index > -1) {
      // Preserve original timestamp for ordering
      const originalTimestamp = this.drawingHistory[index].timestamp;
      operation.timestamp = originalTimestamp || operation.timestamp || Date.now();
      
      this.drawingHistory[index] = operation;
      this.redoStack = [];
      this.debouncedSave();
    } else {
      this.addOperation(operation);
    }
  }

  undo() {
    if (this.drawingHistory.length === 0) {
      return { success: false };
    }
    
    const operation = this.drawingHistory.pop();
    this.redoStack.push(operation);
    this.debouncedSave();
    
    return { 
      success: true, 
      undoneOperation: operation 
    };
  }

  redo() {
    if (this.redoStack.length === 0) {
      return { success: false };
    }
    
    const operation = this.redoStack.pop();
    
    // Use efficient insertion instead of push + sort
    this._insertOperation(operation);
    
    this.debouncedSave();
    
    return { 
      success: true, 
      redoneOperation: operation 
    };
  }

  clear() {
    this.drawingHistory = [];
    this.redoStack = [];
    this.saveToDisk();
  }

  getHistory() {
    return [...this.drawingHistory]; // Return copy
  }

  getHistoryForUser(userId) {
    return this.drawingHistory.filter(op => op.userId === userId);
  }

  getUserStats() {
    const stats = new Map();
    
    this.drawingHistory.forEach(op => {
      const userId = op.userId || 'unknown';
      const count = stats.get(userId) || 0;
      stats.set(userId, count + 1);
    });
    
    return Object.fromEntries(stats);
  }

  getAllRooms() {
    try {
      const files = fs.readdirSync(this.dataDir);
      return files
        .filter(file => file.endsWith('.json') && !file.endsWith('.tmp') && !file.endsWith('.backup'))
        .map(file => file.replace('.json', ''));
    } catch (err) {
      console.error('❌ Error reading room directory:', err);
      return [];
    }
  }

  deleteRoom() {
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
      
      const backupPath = this.filePath + '.backup';
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
      
      const tempPath = this.tempFilePath;
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      
      console.log(`🗑️ Deleted room data for: ${this.roomName}`);
    } catch (err) {
      console.error(`❌ Error deleting room data for ${this.roomName}:`, err);
    }
  }

  getStats() {
    return {
      operationCount: this.drawingHistory.length,
      redoStackSize: this.redoStack.length,
      userStats: this.getUserStats(),
      oldestOperation: this.drawingHistory[0]?.timestamp || null,
      newestOperation: this.drawingHistory[this.drawingHistory.length - 1]?.timestamp || null
    };
  }
}

module.exports = DrawingState;