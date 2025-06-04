import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'https://webrtc-1-qf3j.onrender.com',
    methods: ["GET", "POST"],
  },
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('offer', (data) => {
    socket.broadcast.emit('offer', data);
  });

  socket.on('answer', (data) => {
    socket.broadcast.emit('answer', data);
  });

  socket.on('icecandidate', (data) => {
    socket.broadcast.emit('icecandidate', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(3001, () => console.log('Server running on port 3001'));
