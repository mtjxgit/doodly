const express = require('express');
const http = require('http');
const path =
require('path');
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
  const { roomName, username, color } = socket.handshake.query;

  if (!roomName || !username || !color) {
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

  socket.on('client:clear', () => {
    io.to(roomName).emit('server:clear');
  });

  socket.on('client:ping', (timestamp) => {
    socket.emit('server:pong', timestamp);
  });

  // New handler for cursor movement
  socket.on('client:cursor:move', (cursorData) => {
    // Broadcast cursor data along with user info
    socket.to(roomName).emit('server:cursor:move', {
      ...cursorData,
      userId: user.id,
      userName: user.name,
      userColor: user.color
    });
  });

  socket.on('disconnect', () => {
    console.log(`❌ ${user.name} (${user.id}) left room: ${roomName}`);
    // Future improvement: tell clients to remove this user's cursor
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});