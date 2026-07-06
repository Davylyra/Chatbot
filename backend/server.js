import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { connectDB } from './src/config/db.js';
import authRoutes from './src/middleware/routes/auth.js';
import profileRoutes from './src/middleware/routes/profile.js';
import chatRoutes from './src/middleware/routes/chats.js';
import paymentRoutes from './src/middleware/routes/payments.js';
import paystackWebhookRoutes from './src/middleware/routes/paystackWebhook.js';
import formRoutes from './src/middleware/routes/forms.js';
import { createSystemNotification } from './src/controllers/notificationController.js';
import notificationService from './src/utils/notificationService.js';

dotenv.config();

let isDBConnected = false;

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

const app = express();
const server = createServer(app);
const io = new Server(server, {
  path: '/socket.io/',
  cors: {
    origin: (process.env.FRONTEND_URL).split(',').map(url => url.trim()).filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

notificationService.setIO(io);

global.io = io;

const allowedOrigins = (process.env.FRONTEND_URL )
  .split(',')
  .map(url => url.trim())
  .filter(Boolean);

console.log(' Allowed CORS Origins:', allowedOrigins);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-paystack-signature']
}));

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const PORT = process.env.PORT || 5000;

app.get('/health', (req, res) => res.send('OK'));
app.get('/api/health', (req, res) => res.send('OK'));

app.use('/api/content', (req, res) => {
  res.json({
    success: true,
    data: {
      hero: { title: "Welcome", subtitle: "Ask me anything about universities" },
      sections: []
    }
  });
});

app.get('/api/universities', (req, res) => {
  res.json({ success: true, data: [] });
});

app.get('/api/config/:key', (req, res) => {
  res.json({ success: false, message: 'Not configured server-side' });
});

app.get('/api/config', (req, res) => {
  res.json({ success: false, message: 'Not configured server-side' });
});

import assessmentRoutes from './src/middleware/routes/assessments.js';
import notificationRoutes from './src/middleware/routes/notifications.js';
import { scheduleAdmissionChecks } from './src/utils/notificationTriggers.js';
import { startCleanupSchedule } from './src/scripts/cleanupNotifications.js';
import { startAdmissionNotificationsScheduler } from './src/scripts/admissionNotificationsScheduler.js';

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/payments/webhook', paystackWebhookRoutes);

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Socket.io client connected:', socket.id);

  socket.emit('connection-success', { 
    socketId: socket.id, 
    timestamp: new Date().toISOString(),
    dbConnected: isDBConnected 
  });

  socket.on('join-user-room', (userId) => {
    if (!userId) {
      console.warn('Attempted to join room without userId');
      return;
    }
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined room (Socket: ${socket.id})`);
    socket.emit('room-joined', { userId, room: `user_${userId}` });
  });

  socket.on('leave-user-room', (userId) => {
    if (!userId) return;
    socket.leave(`user_${userId}`);
    console.log(`User ${userId} left room`);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', socket.id, 'Reason:', reason);
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

io.engine.on('connection_error', (err) => {
  console.error('Socket.io connection error:', err.message);
});

global.io = io;

export const sendRealTimeNotification = (userId, notification) => {
  if (global.io) {
    global.io.to(`user_${userId}`).emit('notification', notification);
    console.log(`Notification sent to user ${userId}: ${notification.title}`);
  }
};

app.use('/api/forms', formRoutes);
app.use('/api/notifications', notificationRoutes);

server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.io listening at ws://localhost:${PORT}/socket.io/`);
  
  
  try {
    await connectDB();
    isDBConnected = true;
    console.log('MongoDB connected');
    
    startCleanupSchedule();
    startAdmissionNotificationsScheduler();
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    console.log('Server running in limited mode (DB features disabled)');
    isDBConnected = false;
    
    // Retry DB connection in background
    setTimeout(async () => {
      try {
        await connectDB();
        isDBConnected = true;
        console.log('MongoDB reconnected');
        startCleanupSchedule();
        startAdmissionNotificationsScheduler();
      } catch (retryError) {
        console.error('MongoDB retry failed:', retryError.message);
      }
    }, 5000);
  }
});
