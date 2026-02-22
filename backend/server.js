import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import fetch from 'node-fetch';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { connectDB } from './src/config/db.js';
import authRoutes from './src/routes/auth.js';
import profileRoutes from './src/routes/profile.js';
import chatRoutes from './src/routes/chats.js';
import paymentRoutes from './src/routes/payments.js';
import paystackWebhookRoutes from './src/routes/paystackWebhook.js';
import formRoutes from './src/routes/forms.js';
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
    origin: true,
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Set io instance for unified notification service
notificationService.setIO(io);

// Make io globally available for notification system
global.io = io;

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  process.env.FRONTEND_URL 
];

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

app.use('/api/config', (req, res) => {
  res.json({
    success: true,
    data: {
      name: "Glinax Chatbot",
      version: "2.1.0",
      description: "AI-powered university admission assistant for Ghana",
      supportEmail: "support@glinax.com",
      supportPhone: "+233 123 456 789",
      website: "https://glinax.com",
      socialMedia: {
        twitter: "@glinax_gh",
        facebook: "Glinax Ghana",
        instagram: "@glinax_gh"
      },
      features: {
        chatEnabled: true,
        formsEnabled: true,
        assessmentEnabled: true,
        paymentsEnabled: true
      },
      maintenance: {
        isActive: false,
        message: "",
        startTime: null,
        endTime: null
      },
      api_base_url: "http://localhost:5000/api",
      timeout: 10000
    }
  });
});

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

import assessmentRoutes from './src/routes/assessments.js';
import notificationRoutes from './src/routes/notifications.js';
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

  // Send connection confirmation
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

// Start server first, then connect to DB
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.io listening at ws://localhost:${PORT}/socket.io/`);
  
  // Connect to MongoDB (non-blocking)
  try {
    await connectDB();
    isDBConnected = true;
    console.log('MongoDB connected');
    
    // Start background jobs only after DB connection
    scheduleAdmissionChecks();
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
        scheduleAdmissionChecks();
        startCleanupSchedule();
        startAdmissionNotificationsScheduler();
      } catch (retryError) {
        console.error('MongoDB retry failed:', retryError.message);
      }
    }, 5000);
  }
});
