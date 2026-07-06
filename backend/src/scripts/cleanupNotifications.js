/**
 * NOTIFICATION CLEANUP JOB
 * Periodically deletes notifications that have been read for 30+ minutes
 */

import { getCollection } from '../config/db.js';

export const cleanupReadNotifications = async () => {
  try {
    const notificationsCollection = await getCollection('notifications');
    
    if (!notificationsCollection) {
      return { success: false, error: 'Database not connected', deletedCount: 0 };
    }
    
    const now = new Date();

    const result = await notificationsCollection.deleteMany({
      scheduledDeletionAt: { $lte: now }
    });

    if (result.deletedCount > 0) {
      console.log(` Cleanup: Deleted ${result.deletedCount} expired notifications`);
    }

    return {
      success: true,
      deletedCount: result.deletedCount
    };
  } catch (error) {
    console.error(' Notification cleanup error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

export const startCleanupSchedule = () => {
  console.log('🔄 Starting notification cleanup scheduler (runs every 2 seconds)');
  
  cleanupReadNotifications();
  
  setInterval(() => {
    cleanupReadNotifications();
  }, 2 * 1000); // 2 seconds
};


