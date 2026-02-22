/**
 * NOTIFICATION CLEANUP JOB
 * Periodically deletes notifications that have been read for 30+ minutes
 * Run this as a cron job or scheduled task
 */

import { getCollection } from '../config/db.js';

export const cleanupReadNotifications = async () => {
  try {
    const notificationsCollection = await getCollection('notifications');
    
    // Check if collection is available (DB connected)
    if (!notificationsCollection) {
      return { success: false, error: 'Database not connected', deletedCount: 0 };
    }
    
    const now = new Date();

    // Delete notifications scheduled for deletion
    const result = await notificationsCollection.deleteMany({
      scheduledDeletionAt: { $lte: now }
    });

    if (result.deletedCount > 0) {
      console.log(`✅ Cleanup: Deleted ${result.deletedCount} expired notifications`);
    }

    return {
      success: true,
      deletedCount: result.deletedCount
    };
  } catch (error) {
    console.error('❌ Notification cleanup error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Run cleanup every 2 seconds (to catch 2-second deletion deadlines) 
export const startCleanupSchedule = () => {
  console.log('🔄 Starting notification cleanup scheduler (runs every 2 seconds)');
  
  // Run immediately on start
  cleanupReadNotifications();
  
  // Then run every 2 seconds
  setInterval(() => {
    cleanupReadNotifications();
  }, 2 * 1000); // 2 seconds
};

// For manual execution - DISABLED to prevent server crashes
// Uncomment to enable manual script execution
/*
if (import.meta.url === `file://${process.argv[1]}`) {
  cleanupReadNotifications()
    .then(result => {
      console.log('Cleanup result:', result);
      process.exit(0);
    })
    .catch(err => {
      console.error('Cleanup failed:', err);
      process.exit(1);
    });
}
*/
