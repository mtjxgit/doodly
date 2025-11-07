const fs = require('fs');
const path = require('path');

/**
 * DrawingState - Manages canvas state with proper ordering and conflict resolution
 * - Operations are ordered by timestamp for consistency
 * - Undo/redo maintains operation order across users
 * - Persistent storage with atomic writes
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

    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    // Load from disk if exists
    this.loadFromDisk();
  }

  /**
   * Sanitize room name for safe file system usage
   */
  sanitizeRoomName(name) {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * Load room data from disk with error recovery
   */
  loadFromDisk() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(data);
        
        // Validate loaded data
        if (Array.isArray(parsed)) {
          this.drawingHistory = parsed;
          // Ensure operations are sorted by timestamp
          this.sortOperations();
          console.log(`📂 Loaded ${this.drawingHistory.length} operations for room: ${this.roomName}`);
        } else {
          console.warn(`⚠️ Invalid data format for room ${this.roomName}, starting fresh`);
          this.drawingHistory = [];
        }
      }
    } catch (err) {
      console.error(`❌ Error loading room data for ${this.roomName}:`, err);
      
      // Try to recover from backup if exists
      const backupPath = this.filePath + '.backup';
      if (fs.existsSync(backupPath)) {
        try {
          const backupData = fs.readFileSync(backupPath, 'utf8');
          this.drawingHistory = JSON.parse(backupData);
          console.log(`✅ Recovered from backup for room: ${this.roomName}`);
        } catch (backupErr) {
          console.error(`❌ Backup recovery failed:`, backupErr);
          this.drawingHistory = [];
        }
      }
    }
  }

  /**
   * Save to disk with atomic write operation
   * Uses temporary file and rename for atomic writes
   */
  saveToDisk() {
    try {
      // Create backup of existing file
      if (fs.existsSync(this.filePath)) {
        const backupPath = this.filePath + '.backup';
        fs.copyFileSync(this.filePath, backupPath);
      }

      // Write to temporary file first
      const data = JSON.stringify(this.drawingHistory, null, 2);
      fs.writeFileSync(this.tempFilePath, data, 'utf8');
      
      // Atomic rename
      fs.renameSync(this.tempFilePath, this.filePath);
      
      console.log(`💾 Saved ${this.drawingHistory.length} operations for room: ${this.roomName}`);
    } catch (err) {
      console.error(`❌ Error saving room data for ${this.roomName}:`, err);
    }
  }

  /**
   * Debounced save to reduce disk I/O
   */
  debouncedSave() {
    clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.saveToDisk();
    }, 1000);
  }

  /**
   * Sort operations by timestamp for consistent ordering
   */
  sortOperations() {
    this.drawingHistory.sort((a, b) => {
      const timeA = a.timestamp || 0;
      const timeB = b.timestamp || 0;
      return timeA - timeB;
    });
  }

  /**
   * Add new operation with ordering
   */
  addOperation(operation) {
    // Ensure operation has timestamp
    if (!operation.timestamp) {
      operation.timestamp = Date.now();
    }

    this.drawingHistory.push(operation);
    this.sortOperations(); // Maintain chronological order
    this.redoStack = []; // Clear redo stack on new operation
    this.debouncedSave();
  }

  /**
   * Find operation by ID
   */
  findOperationById(id) {
    return this.drawingHistory.find(op => op.id === id);
  }

  /**
   * Update existing operation or add if not found
   */
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
      this.redoStack = []; // Clear redo on update
      this.debouncedSave();
    } else {
      // Not found, add as new
      this.addOperation(operation);
    }
  }

  /**
   * Global undo - removes last operation regardless of who created it
   * Returns: { success: boolean, undoneOperation?: Operation }
   */
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

  /**
   * Global redo
   * Returns: { success: boolean, redoneOperation?: Operation }
   */
  redo() {
    if (this.redoStack.length === 0) {
      return { success: false };
    }
    
    const operation = this.redoStack.pop();
    this.drawingHistory.push(operation);
    this.sortOperations(); // Maintain order
    this.debouncedSave();
    
    return { 
      success: true, 
      redoneOperation: operation 
    };
  }

  /**
   * Clear all operations
   */
  clear() {
    this.drawingHistory = [];
    this.redoStack = [];
    this.saveToDisk();
  }

  /**
   * Get current history
   */
  getHistory() {
    return [...this.drawingHistory]; // Return copy to prevent external modifications
  }

  /**
   * Get history for specific user
   */
  getHistoryForUser(userId) {
    return this.drawingHistory.filter(op => op.userId === userId);
  }

  /**
   * Get operations count by user
   */
  getUserStats() {
    const stats = new Map();
    
    this.drawingHistory.forEach(op => {
      const userId = op.userId || 'unknown';
      const count = stats.get(userId) || 0;
      stats.set(userId, count + 1);
    });
    
    return Object.fromEntries(stats);
  }

  /**
   * Get all room names from saved files
   */
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

  /**
   * Delete room data (cleanup)
   */
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

  /**
   * Get room statistics
   */
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