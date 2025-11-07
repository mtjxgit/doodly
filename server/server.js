const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the 'client' directory
const clientPath = path.join(__dirname, '../client');
app.use(express.static(clientPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

// Handle new socket connections
io.on('connection', (socket) => {
  // Get room name from the client's handshake query
  const roomName = socket.handshake.query.room || 'default';
  socket.join(roomName);

  console.log(`A user connected: ${socket.id} to room: ${roomName}`);

  // Listen for draw events from a client
  socket.on('draw', (data) => {
    // Broadcast the draw data to everyone else in the same room
    socket.to(roomName).emit('draw', data);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id} from room: ${roomName}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});