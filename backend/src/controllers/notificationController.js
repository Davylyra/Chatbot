import { getCollection } from '../config/db.js';
import { ObjectId } from 'mongodb';
import { buildNotification } from '../utils/notificationBuilder.js';
import notificationService from '../utils/notificationService.js';

// Note: createNotification removed - use notificationService.sendUserNotification() instead

export const getUserNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10, skip = 0, unreadOnly = false } = req.query;

    const notificationsCollection = await getCollection('notifications');
    
    const maxLimit = Math.max(Math.min(parseInt(limit), 10), 8);
    
    const query = { 
      $or: [
        // User-specific notifications
        { userId: userId },
        // System-wide notifications
        { userId: 'system' }
      ],
      // Only show non-expired notifications
      $and: [
        {
          $or: [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } }
          ]
        }
      ]
    };
    
    if (unreadOnly === 'true') {
      query.isRead = false;
    }

    const notifications = await notificationsCollection
      .find(query)
      .sort({ fetchedAt: -1, createdAt: -1 })
      .limit(maxLimit)
      .skip(parseInt(skip))
      .toArray();

    const unreadCount = await notificationsCollection.countDocuments({
      $or: [
        { userId: userId },
        { userId: 'system' }
      ],
      isRead: false,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    });

    const now = new Date();
    const formattedNotifications = notifications.map(notif => ({
      id: notif._id.toString(),
      title: notif.title,
      message: notif.message,
      type: notif.type,
      category: notif.category,
      isRead: notif.isRead,
      priority: notif.priority,
      actionUrl: notif.actionUrl,
      link: notif.link || notif.actionUrl,
      linkText: notif.linkText || 'Learn more',
      metadata: notif.metadata,
      fetchedAt: notif.fetchedAt || notif.createdAt,
      createdAt: notif.createdAt,
      readAt: notif.readAt,
      expiresAt: notif.expiresAt,
      readNowUrl: notif.readNowUrl,
      readNowExpiresAt: notif.readNowExpiresAt,
      readNowActive: notif.readNowExpiresAt ? now < new Date(notif.readNowExpiresAt) : false
    }));

    res.json({
      success: true,
      notifications: formattedNotifications,
      unreadCount,
      total: notifications.length,
      hasMore: notifications.length >= maxLimit,
      maxNotifications: 10,
      minNotifications: 8
    });
  } catch (error) {
    console.error('❌ Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications'
    });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;

    if (!ObjectId.isValid(notificationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID'
      });
    }

    // Use database-backed scheduling (no setTimeout)
    const result = await notificationService.scheduleNotificationDeletion(notificationId, userId, 2);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Emit socket event for real-time UI update
    if (global.io) {
      global.io.to(`user_${userId}`).emit('notification_marked_read', {
        notificationId: notificationId,
        scheduledDeletionAt: result.scheduledDeletionAt,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Notification marked as read',
      scheduledDeletionAt: result.scheduledDeletionAt,
      readNowExpiresAt: result.readNowExpiresAt,
      replacementScheduledIn: '2 seconds',
      willDeleteIn: result.willDeleteIn
    });
  } catch (error) {
    console.error('❌ Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notification'
    });
  }
};

export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationsCollection = await getCollection('notifications');
    
    const now = new Date();
    const deletionTime = new Date(now.getTime() + 2 * 1000);
    const readNowExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    // Use database-backed scheduling for all notifications
    const result = await notificationsCollection.updateMany(
      { 
        userId: userId,
        isRead: false 
      },
      { 
        $set: { 
          isRead: true,
          readAt: now,
          scheduledDeletionAt: deletionTime,
          readNowExpiresAt: readNowExpiresAt
        } 
      }
    );

    // Emit socket event for real-time UI update
    if (global.io) {
      global.io.to(`user_${userId}`).emit('notifications_marked_read_all', {
        count: result.modifiedCount,
        scheduledDeletionAt: deletionTime,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`,
      count: result.modifiedCount,
      scheduledDeletionAt: deletionTime,
      readNowExpiresAt: readNowExpiresAt,
      replacementScheduledIn: '2 seconds',
      willDeleteIn: 2
    });
  } catch (error) {
    console.error('❌ Mark all as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notifications'
    });
  }
};

export const deleteNotification = async (req, res) => {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;

    if (!ObjectId.isValid(notificationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID'
      });
    }

    const notificationsCollection = await getCollection('notifications');
    
    const result = await notificationsCollection.deleteOne({
      _id: new ObjectId(notificationId),
      userId: userId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    console.error('❌ Delete notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification'
    });
  }
};

export const clearReadNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    const notificationsCollection = await getCollection('notifications');
    
    const result = await notificationsCollection.deleteMany({
      userId: userId,
      isRead: true
    });

    res.json({
      success: true,
      message: `${result.deletedCount} read notifications cleared`,
      count: result.deletedCount
    });
  } catch (error) {
    console.error('❌ Clear notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear notifications'
    });
  }
};

export const trackNotificationAccess = async (req, res) => {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;

    if (!ObjectId.isValid(notificationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID'
      });
    }

    const notificationsCollection = await getCollection('notifications');
    
    const notification = await notificationsCollection.findOne({
      _id: new ObjectId(notificationId),
      userId: userId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    const now = new Date();
    if (notification.readNowExpiresAt && now > new Date(notification.readNowExpiresAt)) {
      return res.status(403).json({
        success: false,
        message: 'Read now access has expired (24-hour limit)'
      });
    }

    console.log(`📖 User ${userId} accessed notification ${notificationId} via "Read now" button`);
    await notificationsCollection.updateOne(
      { _id: new ObjectId(notificationId) },
      { 
        $set: { 
          lastAccessedAt: now,
          accessCount: (notification.accessCount || 0) + 1
        } 
      }
    );

    res.json({
      success: true,
      message: 'Access recorded',
      url: notification.readNowUrl || notification.link || notification.actionUrl
    });
  } catch (error) {
    console.error('❌ Track access error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track notification access'
    });
  }
};

export const getReadMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, skip = 0 } = req.query;

    const notificationsCollection = await getCollection('notifications');
    
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const query = {
      $or: [
        { userId: userId },
        { userId: 'system' }
      ],
      isRead: true,
      readAt: { $gte: twentyFourHoursAgo },
      scheduledDeletionAt: { $exists: false }
    };

    const readMessages = await notificationsCollection
      .find(query)
      .sort({ readAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .toArray();

    const totalCount = await notificationsCollection.countDocuments(query);

    const formattedMessages = readMessages.map(notif => ({
      id: notif._id.toString(),
      title: notif.title,
      message: notif.message,
      type: notif.type,
      category: notif.category,
      isRead: notif.isRead,
      priority: notif.priority,
      actionUrl: notif.actionUrl,
      link: notif.link || notif.actionUrl,
      linkText: notif.linkText || 'Learn more',
      metadata: notif.metadata,
      fetchedAt: notif.fetchedAt || notif.createdAt,
      createdAt: notif.createdAt,
      readAt: notif.readAt,
      expiresAt: notif.expiresAt,
      readNowUrl: notif.readNowUrl,
      readNowExpiresAt: notif.readNowExpiresAt,
      readNowActive: notif.readNowExpiresAt ? now < new Date(notif.readNowExpiresAt) : false,
      timeRemaining: Math.max(0, Math.ceil((new Date(notif.readAt).getTime() + 24 * 60 * 60 * 1000 - now.getTime()) / 1000))
    }));

    res.json({
      success: true,
      readMessages: formattedMessages,
      total: totalCount,
      hasMore: (parseInt(skip) + formattedMessages.length) < totalCount
    });
  } catch (error) {
    console.error('❌ Get read messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch read messages'
    });
  }
};

export const createSystemNotification = async (userId, type, data) => {
  const notificationTemplates = {
    welcome: {
      title: 'Welcome to Glinax! 🎓',
      message: 'Start exploring Ghanaian universities and get personalized admission guidance.',
      type: 'success',
      category: 'general',
      priority: 'normal'
    },
    admission_update: {
      title: data.title || 'University Admission Update',
      message: data.message || 'Important admission information available.',
      type: data.type || 'info',
      category: 'admission_update',
      priority: data.priority || 'normal',
      actionUrl: data.actionUrl,
      metadata: data.metadata || {}
    },
    payment_success: {
      title: 'Payment Successful ✅',
      message: `Your payment of GHS ${data.amount} has been processed successfully.`,
      type: 'success',
      category: 'payment',
      priority: 'high',
      metadata: { transactionId: data.transactionId, amount: data.amount }
    },
    payment_failed: {
      title: 'Payment Failed ❌',
      message: `Your payment of GHS ${data.amount} could not be processed. Please try again.`,
      type: 'error',
      category: 'payment',
      priority: 'high',
      metadata: { transactionId: data.transactionId, amount: data.amount, reason: data.reason }
    },
    deadline_reminder: {
      title: `Application Deadline Approaching ⏰`,
      message: `${data.universityName} application deadline is ${data.daysLeft} days away.`,
      type: 'warning',
      category: 'deadline',
      priority: 'high',
      metadata: { universityName: data.universityName, deadline: data.deadline }
    },
    scholarship_alert: {
      title: 'New Scholarship Available 💰',
      message: `${data.scholarshipName} is now open for applications.`,
      type: 'info',
      category: 'scholarship',
      priority: 'normal',
      metadata: { scholarshipName: data.scholarshipName, deadline: data.deadline }
    }
  };

  const template = notificationTemplates[type];
  if (!template) {
    console.error(`Unknown notification type: ${type}`);
    return { success: false, error: 'Unknown notification type' };
  }

  const notificationObj = buildNotification({
    title: template.title,
    message: template.message,
    type: template.type,
    category: template.category,
    priority: template.priority,
    actionUrl: template.actionUrl,
    metadata: template.metadata,
    fetchedAt: data.fetchedAt || new Date(),
    expiresInDays: data.expiresInDays || null
  });

  Object.assign(notificationObj, data);

  const result = await notificationService.sendToUser(userId, notificationObj);
  return result;
};

export default {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearReadNotifications,
  createSystemNotification,
  trackNotificationAccess,
  getReadMessages
};
