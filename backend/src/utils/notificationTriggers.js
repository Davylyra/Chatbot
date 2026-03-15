/**
 * Notification Triggers for Admission Updates
 * Handles real-time notifications for Ghanaian university admission events
 * ENHANCED: Now fetches from live sources with fallback
 */

import { getCollection } from '../config/db.js';
import { fetchLiveAdmissionNotifications } from './liveAdmissionFetcher.js';
import { buildNotification } from './notificationBuilder.js';
import notificationService from './notificationService.js';

// Helper: get current academic year (e.g., 2025/2026)
const getAcademicYear = () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  return now.getMonth() >= 8 ? `${currentYear}/${currentYear + 1}` : `${currentYear - 1}/${currentYear}`;
};

// Check for urgent admission updates and notify all users
export const checkAdmissionUpdates = async () => {
  try {
    console.log('🔍 [LIVE-NOTIFICATIONS] Checking for admission updates from live sources...');

    // Fetch from live sources only (no fallback to prevent fake notifications)
    const events = await fetchLiveAdmissionNotifications();
    console.log(`📡 [LIVE-NOTIFICATIONS] Fetched ${Array.isArray(events) ? events.length : 0} notifications from live sources`);

    if (!Array.isArray(events) || events.length === 0) {
      console.log('ℹ️ [LIVE-NOTIFICATIONS] No admission events available - showing real data only');
      return;
    }

    console.log(`[LIVE-NOTIFICATIONS] Processing ${events.length} notification events`);

    const usersCollection = await getCollection('users');
    const users = await usersCollection.find({}).toArray();

    if (users.length === 0) {
      console.log('ℹ️ [LIVE-NOTIFICATIONS] No users to notify');
      return;
    }

    // For each event create a notification per user if not recently sent
    let sentCount = 0;
    for (const event of events) {
      const title = event.title || `${event.university} update`;
      const message = event.message || '';

      for (const user of users) {
        // Enhanced duplicate check: pass university code for more accurate detection
        const universityCode = event.metadata?.universityCode || event.university;
        const already = await checkRecentNotification(user._id.toString(), title, 24, universityCode);
        if (already) continue;

        const notification = buildNotification({
          title,
          message,
          type: event.type || event.priority || 'info',
          category: event.category || 'admission_update',
          priority: event.priority || 'normal',
          actionUrl: event.actionUrl || null,
          link: event.link || event.actionUrl || null,
          linkText: event.linkText || 'View Details',
          fetchedAt: event.fetchedAt || event.createdAt || new Date(),
          metadata: {
            university: event.university,
            event: event.event,
            year: getAcademicYear(),
            source: event.source || 'live',
            verified: event.verified || false,
            originalFetchDate: event.fetchedAt || event.createdAt || new Date()
          },
          expiresInDays: 14
        });

        await notificationService.sendToUser(user._id.toString(), notification);
        sentCount++;
      }
    }

    console.log(`[LIVE-NOTIFICATIONS] Sent ${sentCount} notifications (${events.length} events) to ${users.length} users`);

  } catch (error) {
    console.error('❌ [LIVE-NOTIFICATIONS] Error checking admission updates:', error);
  }
};

// Check if user recently received similar notification
// ENHANCED: Now checks by university code + title for better duplicate detection
const checkRecentNotification = async (userId, title, hoursBack = 24, universityCode = null) => {
  try {
    const notificationsCollection = await getCollection('notifications');
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const query = {
      userId,
      title,
      createdAt: { $gte: cutoffTime }
    };
    
    // If university code provided, check for exact match to prevent cross-university duplicates
    if (universityCode) {
      query['metadata.universityCode'] = universityCode;
    }

    const existing = await notificationsCollection.findOne(query);

    return !!existing;
  } catch (error) {
    console.error('❌ Error checking recent notifications:', error);
    return false;
  }
};

// Notify users about specific university updates
export const notifyUniversityUpdate = async (universityName, updateType, details = {}) => {
  try {
    const usersCollection = await getCollection('users');
    const users = await usersCollection.find({}).toArray();

    const notificationTemplates = {
      admission_lists_released: {
        title: `🚨 ${universityName} Admission Lists Released!`,
        message: `Check your admission status for ${universityName} 2025/2026 academic year.`,
        priority: "urgent"
      },
      deadline_extended: {
        title: `📅 ${universityName} Deadline Extended`,
        message: `Application deadline for ${universityName} has been extended to ${details.newDeadline}.`,
        priority: "high"
      },
      new_program: {
        title: `✨ New Program at ${universityName}`,
        message: `${details.programName} is now available at ${universityName}.`,
        priority: "normal"
      },
      scholarship_announcement: {
        title: `💰 New Scholarship at ${universityName}`,
        message: `${details.scholarshipName} scholarship now available. Deadline: ${details.deadline}`,
        priority: "high"
      }
    };

    const template = notificationTemplates[updateType];
    if (!template) return;

    const year = getAcademicYear();
    for (const user of users) {
      const notification = buildNotification({
        title: template.title,
        message: template.message,
        type: template.priority === 'urgent' ? 'urgent' : 'info',
        category: 'admission_update',
        priority: template.priority,
        metadata: { university: universityName, updateType, ...details, year },
        expiresInDays: 30
      });

      await notificationService.sendToUser(user._id.toString(), notification);
    }

    console.log(`Notified ${users.length} users about ${universityName} ${updateType}`);

  } catch (error) {
    console.error('❌ Error sending university update notifications:', error);
  }
};

// Schedule periodic checks (to be called by a cron job or scheduler)
export const scheduleAdmissionChecks = () => {
  // Check every 6 hours
  setInterval(checkAdmissionUpdates, 6 * 60 * 60 * 1000);

  // Initial check
  setTimeout(checkAdmissionUpdates, 60000); // 1 minute after startup
};

export default {
  checkAdmissionUpdates,
  notifyUniversityUpdate,
  scheduleAdmissionChecks
};
