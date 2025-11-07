const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const RoomManager = require('./rooms'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
const clientPath = path.join(__dirname, '../client');
app.use(express.static(clientPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

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