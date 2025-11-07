const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io'); // Import socket.io

const app = express();
const server = http.createServer(app);
const io = new Server(server); // Create a socket.io server

// Serve static files from the 'client' directory
const clientPath = path.join(__dirname, '../client');
app.use(express.static(clientPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

// Handle new socket connections
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});