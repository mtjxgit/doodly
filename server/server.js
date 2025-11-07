const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const clientPath = path.join(__dirname, '../client');
app.use(express.static(clientPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

io.on('connection', (socket) => {
  // Get user/room details from the handshake
  const { roomName, username, color } = socket.handshake.query;

  if (!roomName || !username || !color) {
    // Basic validation
    console.log('Connection rejected: Missing parameters');
    socket.disconnect();
    return;
  }

  socket.join(roomName);
  
  const user = { id: socket.id, name: username, color: color };
  console.log(`✅ ${user.name} (${user.id}) joined room: ${roomName}`);

  socket.on('draw', (data) => {
    socket.to(roomName).emit('draw', data);
  });

  socket.on('disconnect', () => {
    console.log(`❌ ${user.name} (${user.id}) left room: ${roomName}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});