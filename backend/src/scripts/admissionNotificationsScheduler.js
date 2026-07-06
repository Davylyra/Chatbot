/**
 * ADMISSION NOTIFICATIONS SCHEDULER
 * Scheduled job that fetches admission updates every 6 hours
 * Also handles cleanup of old notifications
 */

import { fetchAdmissionNotifications, cleanupOldAdmissionNotifications } from '../utils/admissionNotificationsFetcher.js';

// Configuration
const FETCH_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

let fetchInterval;
let cleanupInterval;

/**
 * Start the admission notifications scheduler
 */
export const startAdmissionNotificationsScheduler = () => {
  console.log('📅 Starting admission notifications scheduler...');

  console.log(' Running initial fetch...');
  fetchAdmissionNotifications()
    .then(result => {
      if (result.success) {
        console.log(` Initial fetch complete: ${result.notificationsCollected} notifications`);
      } else {
        console.warn(` Initial fetch had issues:`, result.error);
      }
    })
    .catch(error => {
      console.error(' Initial fetch failed:', error);
    });

  fetchInterval = setInterval(async () => {
    console.log('🔄 Running scheduled admission notifications fetch...');
    const result = await fetchAdmissionNotifications();
    
    if (result.success) {
      console.log(` Scheduled fetch complete: ${result.notificationsCollected} notifications`);
      if (result.errors && result.errors.length > 0) {
        console.warn(` Some sources had issues:`, result.errors);
      }
    } else {
      console.error(` Scheduled fetch failed:`, result.error);
    }
  }, FETCH_INTERVAL);

  console.log(`📅 Admission notifications fetcher will run every ${FETCH_INTERVAL / (60 * 60 * 1000)} hours`);

  cleanupOldAdmissionNotifications()
    .then(result => {
      if (result.success) {
        console.log(` Initial cleanup: Removed ${result.deletedCount} old notifications`);
      }
    })
    .catch(error => {
      console.error(' Initial cleanup failed:', error);
    });

  cleanupInterval = setInterval(async () => {
    console.log('🧹 Running scheduled cleanup...');
    const result = await cleanupOldAdmissionNotifications();
    
    if (result.success) {
      console.log(` Cleanup complete: Removed ${result.deletedCount} old notifications`);
    } else {
      console.error(` Cleanup failed:`, result.error);
    }
  }, CLEANUP_INTERVAL);

  console.log(`🧹 Cleanup will run every ${CLEANUP_INTERVAL / (60 * 60 * 1000)} hours`);
};

/**
 * Stop the scheduler (for testing or graceful shutdown)
 */
export const stopAdmissionNotificationsScheduler = () => {
  if (fetchInterval) {
    clearInterval(fetchInterval);
    console.log('⏹️ Admission notifications fetcher stopped');
  }
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    console.log('⏹️ Cleanup scheduler stopped');
  }
};

/**
 * Manual trigger for fetch (for admin/testing)
 */
export const triggerAdmissionFetch = async () => {
  console.log('⚡ Manual trigger: Fetching admission notifications...');
  return await fetchAdmissionNotifications();
};

/**
 * Manual trigger for cleanup (for admin/testing)
 */
export const triggerCleanup = async () => {
  console.log('⚡ Manual trigger: Cleaning up old notifications...');
  return await cleanupOldAdmissionNotifications();
};

/*
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  console.log('Running admission notifications scheduler manually...');
  
  Promise.all([
    fetchAdmissionNotifications(),
    cleanupOldAdmissionNotifications()
  ])
    .then(([fetchResult, cleanupResult]) => {
      console.log('=== MANUAL RUN RESULTS ===');
      console.log('Fetch Result:', fetchResult);
      console.log('Cleanup Result:', cleanupResult);
      process.exit(fetchResult.success && cleanupResult.success ? 0 : 1);
    })
    .catch(err => {
      console.error('Manual run failed:', err);
      process.exit(1);
    });
}
*/

export default {
  startAdmissionNotificationsScheduler,
  stopAdmissionNotificationsScheduler,
  triggerAdmissionFetch,
  triggerCleanup
};
