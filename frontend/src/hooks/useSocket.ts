/**
 * Socket.io Hook for Real-Time Notifications
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import type { Notification } from '../types';

// TODO: add retry logic for failed connections
export type NotificationData = Notification;

export const useSocket = () => {
  const { user, isAuthenticated } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [readMessages, setReadMessages] = useState<NotificationData[]>([]);
  const [readMessagesCount, setReadMessagesCount] = useState(0);
  const reconnectAttemptsRef = useRef(0);
  const isConnectingRef = useRef(false);

  // Connect to Socket.io server
  const connect = useCallback(() => {
    if (!isAuthenticated || !user?.id) {
      console.log('Socket: Not connecting - user not authenticated');
      return;
    }

    // Prevent multiple simultaneous connection attempts
    if (isConnectingRef.current || (socketRef.current && socketRef.current.connected)) {
      console.log('Socket: Already connecting or connected');
      return;
    }

    isConnectingRef.current = true;
    // Remove /api path from base URL for Socket.io connection
    const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
    const API_BASE_URL = apiUrl.replace(/\/api$/, '');

    console.log('Connecting to Socket.io server...', { 
      url: API_BASE_URL, 
      userId: user.id,
      attempt: reconnectAttemptsRef.current + 1 
    });

    // Cleanup existing socket if any
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    try {
      socketRef.current = io(API_BASE_URL, {
        path: '/socket.io/',
        transports: ['websocket', 'polling'],
        upgrade: true,
        rememberUpgrade: true,
        timeout: 20000,
        forceNew: false,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000),
        reconnectionDelayMax: 10000,
        autoConnect: true,
      });

      const socket = socketRef.current;

      // Connection events
      socket.on('connect', () => {
        console.log('Socket connected:', socket.id);
        setIsConnected(true);
        isConnectingRef.current = false;
        reconnectAttemptsRef.current = 0;

        // Join user-specific room for notifications
        socket.emit('join-user-room', user.id);
        console.log(`Joining user room: ${user.id}`);
      });

      // New: Handle connection success confirmation from server
      socket.on('connection-success', (data: any) => {
        console.log('Socket.io connection confirmed:', data);
        if (data.dbConnected === false) {
          console.warn('Server running in limited mode (DB not connected)');
        }
      });

      // Handle room join confirmation
      socket.on('room-joined', (data: any) => {
        console.log('Successfully joined user room:', data);
      });

    socket.on('disconnect', (reason: string) => {
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
      isConnectingRef.current = false;

      // Don't attempt reconnection if disconnected by client
      if (reason === 'io client disconnect') {
        reconnectAttemptsRef.current = 0;
      }
    });

    socket.on('connect_error', (error: Error) => {
      console.error('Socket connection error:', error.message || error);
      setIsConnected(false);
      isConnectingRef.current = false;
      reconnectAttemptsRef.current++;

      // Stop trying after 10 attempts
      if (reconnectAttemptsRef.current >= 10) {
        console.error('Max reconnection attempts reached');
        if (socketRef.current) {
          socketRef.current.disconnect();
        }
      }
    });

    socket.on('reconnect', (attemptNumber: number) => {
      console.log(`Socket reconnected after ${attemptNumber} attempts`);
      setIsConnected(true);
      isConnectingRef.current = false;
      reconnectAttemptsRef.current = 0;
      
      // Re-join user room after reconnect
      if (user?.id) {
        socket.emit('join-user-room', user.id);
      }
    });

    socket.on('reconnect_attempt', (attemptNumber: number) => {
      console.log(`Socket reconnection attempt ${attemptNumber}...`);
    });

    socket.on('reconnect_failed', () => {
      console.error('Socket reconnection failed after all attempts');
      setIsConnected(false);
      isConnectingRef.current = false;
    });

    socket.on('error', (error: Error) => {
      console.error('Socket error:', error);
    });

    // User-specific notification events
    socket.on('notification', (notificationData: any) => {
      console.log('Real-time notification received:', notificationData);

      const notification: NotificationData = {
        id: notificationData.id || `notif_${Date.now()}`,
        title: notificationData.title,
        message: notificationData.message,
        type: notificationData.type || 'info',
        category: notificationData.category || 'general',
        priority: notificationData.priority || 'normal',
        actionUrl: notificationData.actionUrl,
        link: notificationData.link || notificationData.actionUrl, // Only real URLs, no fake links
        linkText: notificationData.linkText,
        metadata: notificationData.metadata,
        createdAt: new Date(notificationData.createdAt || Date.now()),
        timestamp: notificationData.timestamp || new Date(notificationData.createdAt || Date.now()).toISOString(),
        isRead: false,
        isRealTime: true
      };

      // Add to notifications state with duplicate prevention
      setNotifications(prev => {
        // Check if notification already exists
        const exists = prev.some(n => 
          n.id === notification.id || 
          (n.title === notification.title && n.message === notification.message)
        );
        
        if (exists) {
          console.log('Skipped duplicate real-time notification:', notification.title);
          return prev;
        }
        
        return [notification, ...prev];
      });
      
      setUnreadCount(prev => prev + 1);

      // Show browser notification if permission granted
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/glinax-icon.png',
          tag: notification.category,
          requireInteraction: notification.priority === 'urgent'
        });
      }
    });

    // Broadcast notification events (for system announcements)
    socket.on('broadcast-notification', (notificationData: any) => {
      console.log('Broadcast notification received:', notificationData);

      const notification: NotificationData = {
        id: notificationData.id || `broadcast_${Date.now()}`,
        title: notificationData.title,
        message: notificationData.message,
        type: notificationData.type || 'info',
        category: notificationData.category || 'general',
        priority: notificationData.priority || 'normal',
        actionUrl: notificationData.actionUrl,
        link: notificationData.link || notificationData.actionUrl,
        linkText: notificationData.linkText,
        metadata: notificationData.metadata,
        createdAt: new Date(notificationData.createdAt || Date.now()),
        timestamp: notificationData.timestamp || new Date(notificationData.createdAt || Date.now()).toISOString(),
        isRead: false,
        isRealTime: true
      };

      // Add to notifications state with duplicate prevention
      setNotifications(prev => {
        // Check if notification already exists
        const exists = prev.some(n => 
          n.id === notification.id || 
          (n.title === notification.title && n.message === notification.message)
        );
        
        if (exists) {
          console.log('Skipped duplicate broadcast notification:', notification.title);
          return prev;
        }
        
        return [notification, ...prev];
      });
      
      setUnreadCount(prev => prev + 1);

      // Show browser notification for broadcast
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/glinax-icon.png',
          badge: '/glinax-badge.png'
        });
      }
    });

    // Listen for notification deletion events from backend
    socket.on('notification_deleted', async (data: any) => {
      console.log('Notification deleted event received:', data);
      const { notificationId } = data;
      
      // Remove from local state
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      
      // Fetch replacement notification to fill the gap
      await fetchReplacementNotification();
    });
  } catch (error) {
    console.error('❌ Failed to create Socket.io connection:', error);
    isConnectingRef.current = false;
    setIsConnected(false);
  }
  }, [user?.id, isAuthenticated]);

  // Fetch a replacement notification to fill the gap
  const fetchReplacementNotification = useCallback(async () => {
    try {
      const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const token = localStorage.getItem('token');
      if (!token) return;

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      headers['Authorization'] = `Bearer ${token}`;

      const resp = await fetch(`${API_BASE_URL}/notifications?limit=1&unreadOnly=true`, {
        method: 'GET',
        headers,
        credentials: 'include'
      });

      if (!resp.ok) return;

      const data = await resp.json();
      if (data.success && data.notifications && data.notifications.length > 0) {
        const newNotif = data.notifications[0];
        const notification: NotificationData = {
          id: newNotif.id,
          title: newNotif.title,
          message: newNotif.message,
          type: newNotif.type,
          category: newNotif.category,
          priority: newNotif.priority,
          actionUrl: newNotif.actionUrl,
          link: newNotif.link || newNotif.actionUrl, // Only real URLs
          linkText: newNotif.linkText,
          metadata: newNotif.metadata,
          createdAt: new Date(newNotif.createdAt || newNotif.fetchedAt),
          timestamp: newNotif.timestamp || new Date(newNotif.createdAt || newNotif.fetchedAt).toISOString(),
          isRead: false,
          isRealTime: false
        };

        // Add to notifications if not already present
        setNotifications(prev => {
          const exists = prev.some(n => n.id === notification.id);
          if (!exists) {
            console.log(`✅ Loaded replacement notification: ${notification.title}`);
            return [...prev, notification];
          }
          return prev;
        });
      }
    } catch (err) {
      console.error('❌ Failed to fetch replacement notification:', err);
    }
  }, []);

  // Mark notification as read via API and schedule deletion after 2 seconds (persistent)
  const markAsRead = useCallback(async (notificationId: string) => {
    const now = new Date();
    const optimisticDeletion = new Date(now.getTime() + 2 * 1000); // 2 seconds

    // Optimistic UI update
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? {
        ...n,
        readAt: now,
        scheduledDeletionAt: optimisticDeletion,
        metadata: { ...n.metadata, read: true }
      } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));

    // Call backend to persist read + 2s deletion scheduling
    try {
      const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const resp = await fetch(`${API_BASE_URL}/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers,
        credentials: 'include'
      });

      if (!resp.ok) throw new Error(`Failed to mark as read: ${resp.status}`);

      const data = await resp.json();
      const serverDeletionAt = data?.scheduledDeletionAt ? new Date(data.scheduledDeletionAt) : optimisticDeletion;

      // Sync scheduledDeletionAt with server's value
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, scheduledDeletionAt: serverDeletionAt } : n)
      );
    } catch (err) {
      console.error('❌ Mark-as-read API failed:', err);
      // Rollback optimistic changes if needed (keep as read but remove deletion schedule)
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, scheduledDeletionAt: undefined } : n)
      );
    }

    // Local removal after 2 seconds + fetch replacement
    setTimeout(async () => {
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      console.log(`🗑️ Auto-deleted read notification (UI): ${notificationId}`);
      
      // Fetch replacement notification to fill the gap
      await fetchReplacementNotification();
    }, 2 * 1000); // Changed from 5 to 2 seconds
  }, [fetchReplacementNotification]);

  // Remove a single notification
  const removeNotification = useCallback((notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  // Clear all notifications
  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  // Access full read message (24-hour window)
  const accessReadMessage = useCallback(async (notificationId: string) => {
    try {
      const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };

      const response = await fetch(`${API_BASE_URL}/notifications/${notificationId}/read-message`, {
        method: 'GET',
        headers,
        credentials: 'include'
      });

      if (!response.ok) {
        if (response.status === 403) {
          const data = await response.json();
          return {
            success: false,
            expired: true,
            message: data.message || '24-hour access window has expired'
          };
        }
        throw new Error(`Failed to access read message: ${response.status}`);
      }

      const data = await response.json();
      
      // Update notification with access info
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? {
          ...n,
          firstAccessedAt: new Date(new Date(data.accessibleUntil).getTime() - 24 * 60 * 60 * 1000),
          readMessageAccessibleUntil: new Date(data.accessibleUntil),
          readMessageAvailable: true
        } : n)
      );

      return {
        success: true,
        fullContent: data.fullContent,
        title: data.title,
        accessibleUntil: new Date(data.accessibleUntil),
        timeRemainingMinutes: data.timeRemainingMinutes,
        isFirstAccess: data.isFirstAccess,
        source: data.source,
        link: data.link
      };
    } catch (error) {
      console.error('❌ Failed to access read message:', error);
      return {
        success: false,
        error: (error as Error).message || 'Failed to access message'
      };
    }
  }, []);

  // Auto-connect when authenticated
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      // Delay initial connection to allow app to fully load
      const connectTimer = setTimeout(() => {
        connect();
      }, 1000);

      return () => {
        clearTimeout(connectTimer);
        if (socketRef.current) {
          console.log('🔌 Disconnecting socket (cleanup)...');
          socketRef.current.removeAllListeners();
          socketRef.current.disconnect();
          socketRef.current = null;
        }
        isConnectingRef.current = false;
        reconnectAttemptsRef.current = 0;
      };
    }
  }, [isAuthenticated, user?.id, connect]);

  // Fetch read messages (24-hour window)
  const fetchReadMessages = useCallback(async () => {
    try {
      const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const token = localStorage.getItem('token');
      if (!token) return;

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      headers['Authorization'] = `Bearer ${token}`;

      const resp = await fetch(`${API_BASE_URL}/notifications/read-messages?limit=20`, {
        method: 'GET',
        headers,
        credentials: 'include'
      });

      if (!resp.ok) return;

      const data = await resp.json();
      if (data.success && data.readMessages) {
        const messages = data.readMessages.map((msg: any) => ({
          id: msg.id,
          title: msg.title,
          message: msg.message,
          type: msg.type,
          category: msg.category,
          priority: msg.priority,
          actionUrl: msg.actionUrl,
          link: msg.link || msg.actionUrl,
          linkText: msg.linkText,
          metadata: msg.metadata,
          createdAt: new Date(msg.createdAt || msg.fetchedAt),
          readAt: msg.readAt ? new Date(msg.readAt) : undefined,
          isRealTime: false,
          timeRemaining: msg.timeRemaining
        }));

        setReadMessages(messages);
        setReadMessagesCount(data.total || messages.length);
        console.log(`✅ Loaded ${messages.length} read messages`);
      }
    } catch (err) {
      console.error('❌ Failed to fetch read messages:', err);
    }
  }, []);

  // Periodic cleanup job - check for scheduled deletions every 10 seconds
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = new Date();
      setNotifications(prev => {
        const toDelete = prev.filter(n => 
          n.scheduledDeletionAt && n.scheduledDeletionAt <= now
        );
        
        if (toDelete.length > 0) {
          console.log(`🗑️ Auto-cleanup: Removing ${toDelete.length} expired notifications`);
          return prev.filter(n => 
            !n.scheduledDeletionAt || n.scheduledDeletionAt > now
          );
        }
        
        return prev;
      });
    }, 10 * 1000); // Check every 10 seconds

    return () => clearInterval(cleanupInterval);
  }, []);

  return {
    isConnected,
    notifications,
    unreadCount,
    readMessages,
    readMessagesCount,
    fetchReadMessages,
    markAsRead,
    removeNotification,
    clearAllNotifications,
    accessReadMessage,
    requestNotificationPermission: () => {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  };
};

export default useSocket;
