import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import type { Notification } from '../types';

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
  const hasLoadedInitial = useRef(false);

  // Load initial notifications from API
  const loadInitialNotifications = useCallback(async () => {
    if (hasLoadedInitial.current) return;
    
    try {
      const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const token = localStorage.getItem('token');
      if (!token) {
        return;
      }
      const response = await fetch(`${API_BASE_URL}/notifications?limit=10`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to load notifications: ${response.status}`);
      }

      const data = await response.json();
      if (data.success && Array.isArray(data.notifications)) {
        const loadedNotifications: NotificationData[] = data.notifications.map((notif: any) => ({
          id: notif.id,
          title: notif.title,
          message: notif.message,
          type: notif.type || 'info',
          category: notif.category || 'general',
          priority: notif.priority || 'normal',
          actionUrl: notif.actionUrl,
          link: notif.link || notif.actionUrl,
          linkText: notif.linkText || 'Learn more',
          metadata: notif.metadata,
          createdAt: new Date(notif.createdAt || notif.fetchedAt),
          timestamp: notif.timestamp || new Date(notif.createdAt || notif.fetchedAt).toISOString(),
          isRead: notif.isRead || false,
          readAt: notif.readAt ? new Date(notif.readAt) : undefined,
          readNowUrl: notif.readNowUrl,
          readNowExpiresAt: notif.readNowExpiresAt ? new Date(notif.readNowExpiresAt) : undefined,
          scheduledDeletionAt: notif.scheduledDeletionAt ? new Date(notif.scheduledDeletionAt) : undefined,
          isRealTime: false
        }));

        setNotifications(loadedNotifications);
        const unread = loadedNotifications.filter(n => !n.isRead).length;
        setUnreadCount(unread);
        hasLoadedInitial.current = true;
      }
    } catch (error) {
      console.error('Failed to load initial notifications:', error);
    }
  }, []);

  // Connect to Socket.io server
  const connect = useCallback(() => {
    if (!isAuthenticated || !user?.id) {
      return;
    }

    // Prevent multiple simultaneous connection attempts
    if (isConnectingRef.current || (socketRef.current && socketRef.current.connected)) {
      return;
    }

    isConnectingRef.current = true;
    // Remove /api path from base URL for Socket.io connection
    const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
    const API_BASE_URL = apiUrl.replace(/\/api$/, '');

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
        setIsConnected(true);
        isConnectingRef.current = false;
        reconnectAttemptsRef.current = 0;

        // Join user-specific room for notifications
        socket.emit('join-user-room', user.id);

        // Load initial notifications from database
        loadInitialNotifications();
      });

      // New: Handle connection success confirmation from server
      socket.on('connection-success', (data: any) => {
        if (data.dbConnected === false) {
          console.warn('Server running in limited mode (DB not connected)');
        }
      });

      // Handle room join confirmation
      socket.on('room-joined', (_data: any) => {
        // Room joined successfully
      });

    socket.on('disconnect', (reason: string) => {
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

    socket.on('reconnect', (_attemptNumber: number) => {
      setIsConnected(true);
      isConnectingRef.current = false;
      reconnectAttemptsRef.current = 0;
      
      // Re-join user room after reconnect
      if (user?.id) {
        socket.emit('join-user-room', user.id);
      }

      // Reload notifications after reconnect
      hasLoadedInitial.current = false;
      loadInitialNotifications();
    });

    socket.on('reconnect_attempt', (_attemptNumber: number) => {
      // Reconnection attempt in progress
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
      const { notificationId } = data;
      
      // Remove from local state
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      
      // Fetch replacement notification to fill the gap
      await fetchReplacementNotification();
    });
  } catch (error) {
    console.error('Failed to create Socket.io connection:', error);
    isConnectingRef.current = false;
    setIsConnected(false);
  }
  }, [user?.id, isAuthenticated, loadInitialNotifications]);

  // Fetch a replacement notification to fill the gap
  const fetchReplacementNotification = useCallback(async () => {
    try {
      const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const token = localStorage.getItem('token');
      if (!token) return;

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      headers['Authorization'] = `Bearer ${token}`;

      // Fetch multiple notifications to ensure we get at least one new one
      const resp = await fetch(`${API_BASE_URL}/notifications?limit=5`, {
        method: 'GET',
        headers,
        credentials: 'include'
      });

      if (!resp.ok) return;

      const data = await resp.json();
      if (data.success && data.notifications && data.notifications.length > 0) {
        setNotifications(prev => {
          const currentIds = new Set(prev.map(n => n.id));
          const newNotifications: NotificationData[] = [];

          // Find notifications that aren't already in the list
          for (const newNotif of data.notifications) {
            if (!currentIds.has(newNotif.id)) {
              const notification: NotificationData = {
                id: newNotif.id,
                title: newNotif.title,
                message: newNotif.message,
                type: newNotif.type,
                category: newNotif.category,
                priority: newNotif.priority,
                actionUrl: newNotif.actionUrl,
                link: newNotif.link || newNotif.actionUrl,
                linkText: newNotif.linkText,
                metadata: newNotif.metadata,
                createdAt: new Date(newNotif.createdAt || newNotif.fetchedAt),
                timestamp: newNotif.timestamp || new Date(newNotif.createdAt || newNotif.fetchedAt).toISOString(),
                isRead: newNotif.isRead || false,
                readNowUrl: newNotif.readNowUrl,
                readNowExpiresAt: newNotif.readNowExpiresAt ? new Date(newNotif.readNowExpiresAt) : undefined,
                isRealTime: false
              };
              newNotifications.push(notification);
              currentIds.add(newNotif.id);
              
              // Only add one replacement at a time
              if (newNotifications.length >= 1) break;
            }
          }

          if (newNotifications.length > 0) {
            return [...prev, ...newNotifications];
          }
          
          return prev;
        });
      }
    } catch (err) {
      console.error('Failed to fetch replacement notification:', err);
    }
  }, []);

  // Mark notification as read via API and schedule deletion after 2 seconds (persistent)
  const markAsRead = useCallback(async (notificationId: string) => {
    const now = new Date();
    const optimisticDeletion = new Date(now.getTime() + 2 * 1000); // 2 seconds

    // Optimistic UI update - mark as read and schedule deletion
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? {
        ...n,
        isRead: true,
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
      console.error('Mark-as-read API failed:', err);
      // Rollback optimistic changes if needed (keep as read but remove deletion schedule)
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, scheduledDeletionAt: undefined } : n)
      );
    }

    // Local removal after 2 seconds + fetch replacement
    setTimeout(async () => {
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      
      // Fetch replacement notification to fill the gap
      await fetchReplacementNotification();
    }, 2 * 1000); // Changed from 5 to 2 seconds
  }, [fetchReplacementNotification]);

  // Remove a single notification
  const removeNotification = useCallback((notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    try {
      const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const token = localStorage.getItem('token');
      if (!token) {
        return { success: false };
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      headers['Authorization'] = `Bearer ${token}`;

      // Count how many unread notifications will be marked
      const unreadCount = notifications.filter(n => !n.isRead).length;

      // Optimistically update all to read
      const now = new Date();
      const optimisticDeletion = new Date(now.getTime() + 2 * 1000);
      setNotifications(prev =>
        prev.map(n => ({
          ...n,
          isRead: true,
          readAt: now,
          scheduledDeletionAt: optimisticDeletion,
          metadata: { ...n.metadata, read: true }
        }))
      );
      setUnreadCount(0);

      // Call backend
      const resp = await fetch(`${API_BASE_URL}/notifications/read-all`, {
        method: 'PUT',
        headers,
        credentials: 'include'
      });

      if (!resp.ok) throw new Error(`Failed to mark all as read: ${resp.status}`);

      // Schedule batch deletion after 2 seconds
      setTimeout(async () => {
        setNotifications([]);
        
        // Fetch replacements to refill
        for (let i = 0; i < Math.min(unreadCount, 5); i++) {
          await fetchReplacementNotification();
          // Small delay between fetches to prevent duplicates
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }, 2 * 1000);

      return { success: true };
    } catch (err) {
      console.error('Failed to mark all as read:', err);
      return { success: false, error: err };
    }
  }, [notifications, fetchReplacementNotification]);

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
      console.error('Failed to access read message:', error);
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
      }
    } catch (err) {
      console.error('Failed to fetch read messages:', err);
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
    markAllAsRead,
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
