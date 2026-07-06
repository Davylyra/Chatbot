import { getCollection } from '../config/db.js';
import { ObjectId } from 'mongodb';
import { buildNotification } from '../utils/notificationBuilder.js';
import notificationService from '../utils/notificationService.js';

export const createNotification = async (studentId, payloadData) => {
  try {
    const configuredNotification = buildNotification({
      title: payloadData.title,
      message: payloadData.message,
      type: payloadData.type,
      category: payloadData.category,
      priority: payloadData.priority,
      actionUrl: payloadData.actionUrl,
      link: payloadData.link,
      linkText: payloadData.linkText,
      metadata: payloadData.metadata,
      fetchedAt: payloadData.fetchedAt,
      expiresAt: payloadData.expiresAt
    });

    const dispatchResult = await notificationService.sendToUser(studentId, configuredNotification);
    if (dispatchResult.success) {
      return { success: true, notificationId: dispatchResult.notificationId };
    }
    return { success: false, error: dispatchResult.error };
  } catch (creationError) {
    return { success: false, error: creationError.message };
  }
};

export const getUserNotifications = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { limit = 10, skip = 0, unreadOnly = false } = req.query;

    const notificationArchive = await getCollection('notifications');
    const enforcementLimit = Math.max(Math.min(parseInt(limit), 10), 8);
    
    const searchFilter = { 
      $or: [{ userId: studentId }, { userId: 'system' }],
      $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }]
    };
    
    if (unreadOnly === 'true') searchFilter.isRead = false;

    const fetchedNotifications = await notificationArchive
      .find(searchFilter)
      .sort({ fetchedAt: -1, createdAt: -1 })
      .limit(enforcementLimit)
      .skip(parseInt(skip))
      .toArray();

    const pendingCount = await notificationArchive.countDocuments({
      $or: [{ userId: studentId }, { userId: 'system' }],
      isRead: false,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
    });

    const currentTime = new Date();
    const normalizedAlerts = fetchedNotifications.map(alertItem => ({
      id: alertItem._id.toString(),
      title: alertItem.title,
      message: alertItem.message,
      type: alertItem.type,
      category: alertItem.category,
      isRead: alertItem.isRead,
      priority: alertItem.priority,
      actionUrl: alertItem.actionUrl,
      link: alertItem.link || alertItem.actionUrl,
      linkText: alertItem.linkText || 'Learn more',
      metadata: alertItem.metadata,
      fetchedAt: alertItem.fetchedAt || alertItem.createdAt,
      createdAt: alertItem.createdAt,
      readAt: alertItem.readAt,
      expiresAt: alertItem.expiresAt,
      readNowUrl: alertItem.readNowUrl,
      readNowExpiresAt: alertItem.readNowExpiresAt,
      readNowActive: alertItem.readNowExpiresAt ? currentTime < new Date(alertItem.readNowExpiresAt) : false
    }));

    res.json({
      success: true,
      notifications: normalizedAlerts,
      unreadCount: pendingCount,
      total: fetchedNotifications.length,
      hasMore: fetchedNotifications.length >= enforcementLimit,
      maxNotifications: 10,
      minNotifications: 8
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { notificationId } = req.params;

    if (!ObjectId.isValid(notificationId)) {
      return res.status(400).json({ success: false, message: 'Invalid notification ID' });
    }

    const schedulingResult = await notificationService.scheduleNotificationDeletion(notificationId, studentId, 2);

    if (!schedulingResult.success) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    if (global.io) {
      global.io.to(`user_${studentId}`).emit('notification_marked_read', {
        notificationId,
        scheduledDeletionAt: schedulingResult.scheduledDeletionAt,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Notification marked as read',
      scheduledDeletionAt: schedulingResult.scheduledDeletionAt,
      readNowExpiresAt: schedulingResult.readNowExpiresAt,
      replacementScheduledIn: '2 seconds',
      willDeleteIn: schedulingResult.willDeleteIn
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to update notification' });
  }
};

export const markAllAsRead = async (req, res) => {
  try {
    const studentId = req.user.id;
    const notificationArchive = await getCollection('notifications');
    
    const timeReference = new Date();
    const plannedDeletion = new Date(timeReference.getTime() + 2 * 1000);
    const accessibilityExpiration = new Date(timeReference.getTime() + 24 * 60 * 60 * 1000);
    
    const updateManifest = await notificationArchive.updateMany(
      { userId: studentId, isRead: false },
      { $set: { isRead: true, readAt: timeReference, scheduledDeletionAt: plannedDeletion, readNowExpiresAt: accessibilityExpiration } }
    );

    if (global.io) {
      global.io.to(`user_${studentId}`).emit('notifications_marked_read_all', {
        count: updateManifest.modifiedCount,
        scheduledDeletionAt: plannedDeletion,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: `${updateManifest.modifiedCount} notifications marked as read`,
      count: updateManifest.modifiedCount,
      scheduledDeletionAt: plannedDeletion,
      readNowExpiresAt: accessibilityExpiration,
      replacementScheduledIn: '2 seconds',
      willDeleteIn: 2
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to update notifications' });
  }
};

export const deleteNotification = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { notificationId } = req.params;

    if (!ObjectId.isValid(notificationId)) {
      return res.status(400).json({ success: false, message: 'Invalid notification ID' });
    }

    const notificationArchive = await getCollection('notifications');
    const removalStatus = await notificationArchive.deleteOne({ _id: new ObjectId(notificationId), userId: studentId });

    if (removalStatus.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, message: 'Notification deleted' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to delete notification' });
  }
};

export const clearReadNotifications = async (req, res) => {
  try {
    const studentId = req.user.id;
    const notificationArchive = await getCollection('notifications');
    const cleanupResult = await notificationArchive.deleteMany({ userId: studentId, isRead: true });

    res.json({ success: true, message: `${cleanupResult.deletedCount} read notifications cleared`, count: cleanupResult.deletedCount });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to clear notifications' });
  }
};

export const trackNotificationAccess = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { notificationId } = req.params;

    if (!ObjectId.isValid(notificationId)) {
      return res.status(400).json({ success: false, message: 'Invalid notification ID' });
    }

    const notificationArchive = await getCollection('notifications');
    const matchedNotification = await notificationArchive.findOne({ _id: new ObjectId(notificationId), userId: studentId });

    if (!matchedNotification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    const evaluationTime = new Date();
    if (matchedNotification.readNowExpiresAt && evaluationTime > new Date(matchedNotification.readNowExpiresAt)) {
      return res.status(403).json({ success: false, message: 'Read now access has expired (24-hour limit)' });
    }

    await notificationArchive.updateOne(
      { _id: new ObjectId(notificationId) },
      { $set: { lastAccessedAt: evaluationTime, accessCount: (matchedNotification.accessCount || 0) + 1 } }
    );

    res.json({ success: true, message: 'Access recorded', url: matchedNotification.readNowUrl || matchedNotification.link || matchedNotification.actionUrl });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to track notification access' });
  }
};

export const getReadMessages = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { limit = 20, skip = 0 } = req.query;

    const notificationArchive = await getCollection('notifications');
    const timeReference = new Date();
    const offsetLimit = new Date(timeReference.getTime() - 24 * 60 * 60 * 1000);

    const lookupQuery = {
      $or: [{ userId: studentId }, { userId: 'system' }],
      isRead: true,
      readAt: { $gte: offsetLimit },
      scheduledDeletionAt: { $exists: false }
    };

    const archivedMessages = await notificationArchive
      .find(lookupQuery)
      .sort({ readAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .toArray();

    const aggregateCount = await notificationArchive.countDocuments(lookupQuery);
    const parsedArchives = archivedMessages.map(item => ({
      id: item._id.toString(),
      title: item.title,
      message: item.message,
      type: item.type,
      category: item.category,
      isRead: item.isRead,
      priority: item.priority,
      actionUrl: item.actionUrl,
      link: item.link || item.actionUrl,
      linkText: item.linkText || 'Learn more',
      metadata: item.metadata,
      fetchedAt: item.fetchedAt || item.createdAt,
      createdAt: item.createdAt,
      readAt: item.readAt,
      expiresAt: item.expiresAt,
      readNowUrl: item.readNowUrl,
      readNowExpiresAt: item.readNowExpiresAt,
      readNowActive: item.readNowExpiresAt ? timeReference < new Date(item.readNowExpiresAt) : false,
      timeRemaining: Math.max(0, Math.ceil((new Date(item.readAt).getTime() + 24 * 60 * 60 * 1000 - timeReference.getTime()) / 1000))
    }));

    res.json({ success: true, readMessages: parsedArchives, total: aggregateCount, hasMore: (parseInt(skip) + parsedArchives.length) < aggregateCount });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch read messages' });
  }
};

export const createSystemNotification = async (studentId, triggerType, contextData) => {
  const structuredTemplates = {
    welcome: { title: 'Welcome to CERKYL! 🎓', message: 'Start exploring Ghanaian universities and get personalized admission guidance.', type: 'success', category: 'general', priority: 'normal' },
    admission_update: { title: contextData.title || 'University Admission Update', message: contextData.message || 'Important admission information available.', type: contextData.type || 'info', category: 'admission_update', priority: contextData.priority || 'normal', actionUrl: contextData.actionUrl, metadata: contextData.metadata || {} },
    payment_success: { title: 'Payment Successful ✅', message: `Your payment of GHS ${contextData.amount} has been processed successfully.`, type: 'success', category: 'payment', priority: 'high', metadata: { transactionId: contextData.transactionId, amount: contextData.amount } },
    payment_failed: { title: 'Payment Failed ❌', message: `Your payment of GHS ${contextData.amount} could not be processed. Please try again.`, type: 'error', category: 'payment', priority: 'high', metadata: { transactionId: contextData.transactionId, amount: contextData.amount, reason: contextData.reason } },
    deadline_reminder: { title: `Application Deadline Approaching ⏰`, message: `${contextData.universityName} application deadline is ${contextData.daysLeft} days away.`, type: 'warning', category: 'deadline', priority: 'high', metadata: { universityName: contextData.universityName, deadline: contextData.deadline } },
    scholarship_alert: { title: 'New Scholarship Available 💰', message: `${contextData.scholarshipName} is now open for applications.`, type: 'info', category: 'scholarship', priority: 'normal', metadata: { scholarshipName: contextData.scholarshipName, deadline: contextData.deadline } }
  };

  const selectedTemplate = structuredTemplates[triggerType];
  if (!selectedTemplate) return { success: false, error: 'Unknown notification type' };

  const assembledNotification = buildNotification({
    title: selectedTemplate.title,
    message: selectedTemplate.message,
    type: selectedTemplate.type,
    category: selectedTemplate.category,
    priority: selectedTemplate.priority,
    actionUrl: selectedTemplate.actionUrl,
    metadata: selectedTemplate.metadata,
    fetchedAt: contextData.fetchedAt || new Date(),
    expiresInDays: contextData.expiresInDays || null
  });

  Object.assign(assembledNotification, contextData);
  return await notificationService.sendToUser(studentId, assembledNotification);
};

export default {
  createNotification,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearReadNotifications,
  createSystemNotification,
  trackNotificationAccess,
  getReadMessages
};
