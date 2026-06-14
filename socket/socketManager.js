const { Server } = require('socket.io');

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Join room based on role
    socket.on('join_room', (room) => {
      socket.join(room);
      console.log(`📦 Socket ${socket.id} joined room: ${room}`);
    });

    socket.on('disconnect', () => {
      console.log(`🔴 Client disconnected: ${socket.id}`);
    });
  });

  console.log('✅ Socket.IO initialized');
  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
};

// Emit to admin room
const emitToAdmin = (event, data) => {
  if (io) io.to('admin_room').emit(event, data);
};

// Emit to all connected clients
const emitToAll = (event, data) => {
  if (io) io.emit(event, data);
};

module.exports = { initSocket, getIO, emitToAdmin, emitToAll };
