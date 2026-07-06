
import { getCollection } from '../config/db.js';
import { ObjectId } from 'mongodb';
import { buildNotification } from './notificationBuilder.js';

let io = null;

export const setIO = (ioInstance) => {
  io = ioInstance;
  console.log('NotificationService: Socket.io configured');
};

export const sendToUser = async (userId, notification) => {
  try {
    const notificationsCollection = await getCollection('notifications');

    const toInsert = {
      ...notification,
      userId: userId,
      storedAt: new Date()
    };

    const result = await notificationsCollection.insertOne(toInsert);
    const notificationId = result.insertedId.toString();

    if (io) {
      io.to(`user_${userId}`).emit('notification', { 
        ...toInsert, 
        id: notificationId 
      });
      console.log(`Notification sent to user ${userId}: ${notification.title}`);
    }

    return { success: true, notificationId };
  } catch (error) {
    console.error('NotificationService.sendToUser error:', error.message);
    return { success: false, error: error.message };
  }
};

export const broadcastNotification = async (notification) => {
  try {
    const notificationsCollection = await getCollection('notifications');
    const usersCollection = await getCollection('users');

    if (io) {
      io.emit('broadcast-notification', notification);
      console.log('Broadcast notification emitted to all clients');
    }

    // Persist per-user notifications in database
    const users = await usersCollection.find({}, { projection: { _id: 1 } }).toArray();
    const notificationsToInsert = users.map(u => ({
      ...notification,
      userId: u._id.toString(),
      storedAt: new Date()
    }));

    if (notificationsToInsert.length > 0) {
      const res = await notificationsCollection.insertMany(notificationsToInsert);
      return { 
        success: true, 
        count: notificationsToInsert.length, 
        insertedCount: Object.keys(res.insertedIds).length 
      };
    }

    return { success: true, count: 0 };
  } catch (error) {
    console.error('NotificationService.broadcastNotification error:', error.message);
    return { success: false, error: error.message };
  }
};

export const sendUserNotification = async (userId, notificationData) => {
  try {
    const notification = buildNotification({
      title: notificationData.title,
      message: notificationData.message,
      type: notificationData.type,
      category: notificationData.category,
      priority: notificationData.priority,
      metadata: notificationData.metadata,
      actionUrl: notificationData.actionUrl,
      link: notificationData.link,
      linkText: notificationData.linkText,
      expiresAt: notificationData.expiresAt,
      fetchedAt: notificationData.fetchedAt
    });

    return await sendToUser(userId, notification);
  } catch (error) {
    console.error('Error sending notification:', error);
    return { success: false, error: error.message };
  }
};

export const sendAdmissionUpdate = async (universityName, updateType, details = {}) => {
  try {
    const notification = buildNotification({
      title: `🚨 ${universityName} ${updateType}!`,
      message: details.message || `Important update for ${universityName}`,
      type: 'success',
      category: 'admission_update',
      priority: updateType.includes('List') ? 'urgent' : 'high',
      actionUrl: details.actionUrl || null,
      link: details.link || details.actionUrl || null,
      linkText: details.linkText || 'View Details',
      metadata: {
        university: universityName,
        updateType: updateType,
        ...details
      },
      expiresInDays: 30
    });

    const usersCollection = await getCollection('users');
    const interestedUsers = await usersCollection.find({
      $or: [
        { preferredUniversities: universityName },
        { savedUniversities: universityName },
        { interestedIn: universityName }
      ]
    }).toArray();

    let sentCount = 0;
    for (const user of interestedUsers) {
      const result = await sendToUser(user._id.toString(), notification);
      if (result.success) sentCount++;
    }

    if (updateType.includes('List') || updateType.includes('Opening')) {
      await broadcastNotification(notification);
    }

    return { success: true, sentCount, totalInterested: interestedUsers.length };
  } catch (error) {
    console.error('Error sending admission update:', error);
    return { success: false, error: error.message };
  }
};

export const sendPaymentNotification = async (userId, status, amount, details = {}) => {
  try {
    const statusMessages = {
      'success': {
        title: '✅ Payment Successful!',
        message: `GHS ${amount} payment received. Transaction ID: ${details.reference || 'N/A'}`,
        type: 'success'
      },
      'pending': {
        title: '⏳ Payment Pending',
        message: `Your GHS ${amount} mobile money payment is waiting for approval. Check your phone.`,
        type: 'warning'
      },
      'failed': {
        title: '❌ Payment Failed',
        message: `Your GHS ${amount} payment could not be processed. ${details.reason || 'Please try again.'}`,
        type: 'error'
      }
    };

    const notification = statusMessages[status] || {
      title: '💳 Payment Update',
      message: `Payment status: ${status}`,
      type: 'info'
    };

    return await sendUserNotification(userId, {
      ...notification,
      category: 'payment',
      priority: status === 'failed' ? 'high' : 'normal',
      metadata: { amount, status, ...details }
    });
  } catch (error) {
    console.error('Error sending payment notification:', error);
    return { success: false, error: error.message };
  }
};

export const sendFormNotification = async (userId, formName, eventType, details = {}) => {
  try {
    const eventMessages = {
      'purchase_success': {
        title: `✅ Form Purchase Complete!`,
        message: `You've successfully purchased the ${formName} application form. Download it from your dashboard.`,
        type: 'success'
      },
      'download_ready': {
        title: `📥 Form Ready to Download`,
        message: `Your ${formName} form is ready. Download it now!`,
        type: 'success'
      },
      'deadline_approaching': {
        title: `⏰ ${formName} Deadline Approaching`,
        message: `Don't forget to submit your ${formName} application before the deadline!`,
        type: 'warning'
      }
    };

    const notification = eventMessages[eventType] || { 
      title: `📋 ${formName} Update`, 
      message: `Update regarding ${formName}`, 
      type: 'info' 
    };

    return await sendUserNotification(userId, {
      ...notification,
      category: 'form',
      priority: eventType.includes('deadline') ? 'high' : 'normal',
      metadata: { formName, eventType, ...details }
    });
  } catch (error) {
    console.error('Error sending form notification:', error);
    return { success: false, error: error.message };
  }
};

export const getUnreadCount = async (userId) => {
  try {
    const notificationsCollection = await getCollection('notifications');
    const count = await notificationsCollection.countDocuments({
      userId: userId,
      isRead: false,
      $or: [ 
        { expiresAt: null }, 
        { expiresAt: { $gt: new Date() } } 
      ]
    });
    return count;
  } catch (error) {
    console.error('Error getting unread count:', error);
    return 0;
  }
};

// Note: markAsRead removed - use scheduleNotificationDeletion instead

export const scheduleNotificationDeletion = async (notificationId, userId, delaySeconds = 2) => {
  try {
    const notificationsCollection = await getCollection('notifications');
    const now = new Date();
    const deletionTime = new Date(now.getTime() + delaySeconds * 1000);
    const readNowExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    const result = await notificationsCollection.updateOne(
      { 
        _id: new ObjectId(notificationId),
        userId: userId 
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

    console.log(`Notification ${notificationId} scheduled for deletion at ${deletionTime.toISOString()}`);
    return { 
      success: result.modifiedCount > 0, 
      scheduledDeletionAt: deletionTime,
      readNowExpiresAt: readNowExpiresAt,
      willDeleteIn: delaySeconds
    };
  } catch (error) {
    console.error('Error scheduling notification deletion:', error);
    return { success: false, error: error.message };
  }
};

export default {
  setIO,
  sendToUser,
  broadcastNotification,
  sendUserNotification,
  sendAdmissionUpdate,
  sendPaymentNotification,
  sendFormNotification,
  getUnreadCount,
  scheduleNotificationDeletion
};
