const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const RoomManager = require('./rooms');
const fs = require('fs');


const roomDataPath = path.join(__dirname, '../room-data');
fs.mkdirSync(roomDataPath, { recursive: true });

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, '../client')));

// Initialize room manager
const roomManager = new RoomManager(io);

// Handle socket connections
io.on('connection', (socket) => {
  roomManager.handleConnection(socket);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});