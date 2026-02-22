import fetch from 'node-fetch';
import { getCollection } from '../config/db.js';
import { fetchLiveAdmissionNotifications } from './liveAdmissionFetcher.js';
import fetchUtils from './fetchUtils.js';
const { fetchWithRetry, DEFAULT_USER_AGENT } = fetchUtils;

const CONFIG = {
  REQUEST_TIMEOUT: 10000,
  REQUEST_DELAY: 2000,
  USER_AGENT: 'Glinax-ChatBot/1.0 (+https://glinax.com/bot)',
  MAX_RETRIES: 2,
  DATA_RETENTION_DAYS: 14,
  SOURCES: [
    {
      name: 'JAMB Portal',
      url: 'https://www.jamb.gov.ng',
      parser: 'jamb',
      keywords: ['admission', 'deadline', 'results', 'application', 'Ghana'],
      enabled: true
    },
    {
      name: 'UCC Admissions',
      url: 'https://www.ucc.edu.gh/admissions',
      parser: 'university_general',
      university: 'University of Cape Coast',
      keywords: ['admission', 'application', 'deadline', 'results'],
      enabled: true
    },
    {
      name: 'KNUST Admissions',
      url: 'https://www.knust.edu.gh/admissions',
      parser: 'university_general',
      university: 'Kwame Nkrumah University of Science and Technology',
      keywords: ['admission', 'application', 'deadline', 'results'],
      enabled: true
    },
    {
      name: 'UG Admissions',
      url: 'https://www.ug.edu.gh/admissions',
      parser: 'university_general',
      university: 'University of Ghana',
      keywords: ['admission', 'application', 'deadline', 'results'],
      enabled: true
    },
    {
      name: 'UST Admissions',
      url: 'https://www.ust.edu.gh/admissions',
      parser: 'university_general',
      university: 'University of Science and Technology',
      keywords: ['admission', 'application', 'deadline', 'results'],
      enabled: true
    },
    {
      name: 'Ghana News Feed',
      url: 'https://www.citinewsroom.com/search?q=admission+ghana',
      parser: 'news_feed',
      keywords: ['admission', 'university', 'application', 'Ghana', 'deadline'],
      enabled: true
    }
  ]
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const checkRobotsTxt = async (domain) => {
  try {
    const response = await fetchWithRetry(`${domain}/robots.txt`, { headers: { 'User-Agent': DEFAULT_USER_AGENT } }, 1, 5000);
    if (response && response.ok) {
      const robotsContent = await response.text();
      return !robotsContent.toLowerCase().includes('disallow: /');
    }
    return true;
  } catch (error) {
    console.warn(`⚠️ Could not check robots.txt for ${domain}:`, error.message);
    return true;
  }
};

// NOTE: Mock data generation permanently removed
// All notifications must come from real sources only (web fetchers, backend events, user system)

// Fetch admission notifications from all sources
export const fetchAdmissionNotifications = async () => {
  console.log('🌐 [ADMISSION-FETCH] Starting admission notifications fetch...');
  const allNotifications = [];
  const errors = [];

  try {
    // STEP 1: Fetch LIVE notifications from real university sources
    console.log('📡 [ADMISSION-FETCH] Fetching live notifications from Ghanaian universities...');
    const liveNotifications = await fetchLiveAdmissionNotifications();
    if (Array.isArray(liveNotifications) && liveNotifications.length > 0) {
      console.log(`✅ [ADMISSION-FETCH] Fetched ${liveNotifications.length} live notifications`);
      allNotifications.push(...liveNotifications);
    } else {
      console.warn('⚠️ [ADMISSION-FETCH] Live fetch returned no data');
    }

    // ✅ STEP 2: Only use live data - NO FALLBACKS, NO MOCK DATA
    if (allNotifications.length === 0) {
      console.log('⚠️ [ADMISSION-FETCH] No live notifications fetched - returning empty result');
    }

    // STEP 3: Legacy source checking (kept for backward compatibility)
    for (const source of CONFIG.SOURCES.filter(s => s.enabled)) {
      try {
        console.log(`📡 [ADMISSION-FETCH] Checking legacy source: ${source.name}`);
        
        // Rate limiting
        await sleep(CONFIG.REQUEST_DELAY);

        // Check robots.txt
        const domain = new URL(source.url).origin;
        const isAllowed = await checkRobotsTxt(domain);
        
        if (!isAllowed) {
          console.warn(`⚠️ [ADMISSION-FETCH] Skipping ${source.name} - robots.txt disallows scraping`);
          continue;
        }

        console.log(`✅ [ADMISSION-FETCH] Legacy source ${source.name} processed`);

      } catch (error) {
        const errorMsg = `Failed to fetch from ${source.name}: ${error.message}`;
        console.error(`❌ [ADMISSION-FETCH] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    // ✅ STEP 4: Store all collected notifications in database
    if (allNotifications.length > 0) {
      console.log(`💾 [ADMISSION-FETCH] Storing ${allNotifications.length} notifications to database...`);
      const result = await storeAdmissionNotifications(allNotifications);
      console.log(`[ADMISSION-FETCH] Stored ${result.insertedCount || 0} new admission notifications`);
    } else {
      console.warn('⚠️ [ADMISSION-FETCH] No notifications to store');
    }

    return {
      success: true,
      notificationsCollected: allNotifications.length,
      errors: errors.length > 0 ? errors : null
    };

  } catch (error) {
    console.error('❌ [ADMISSION-FETCH] Admission notifications fetch failed:', error);
    return {
      success: false,
      error: error.message,
      notificationsCollected: allNotifications.length
    };
  }
};

// Store admission notifications in database
export const storeAdmissionNotifications = async (notifications) => {
  try {
    const notificationsCollection = await getCollection('notifications');
    
    // Enhanced duplicate detection window (7 days instead of 1 hour)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    let insertedCount = 0;
    
    for (const notification of notifications) {
      // Enhanced duplicate detection: check by title, message, and university
      const existing = await notificationsCollection.findOne({
        $or: [
          // Exact match on title and university
          {
            title: notification.title,
            'metadata.universityName': notification.metadata?.universityName,
            createdAt: { $gte: sevenDaysAgo }
          },
          // Similar message content (prevents duplicates with slightly different titles)
          {
            message: notification.message,
            'metadata.universityName': notification.metadata?.universityName,
            createdAt: { $gte: sevenDaysAgo }
          }
        ]
      });

      if (!existing) {
        try {
          await notificationsCollection.insertOne({
            ...notification,
            userId: 'system', // System-wide notification
            isRead: false,
            readAt: null,
            scheduledDeletionAt: null,
            isWebSourced: true,
            storedAt: new Date()
          });
          insertedCount++;
        } catch (insertError) {
          console.warn(`⚠️ Failed to insert notification: ${notification.title}`, insertError.message);
        }
      } else {
        console.log(`⏭️ Skipped duplicate notification: ${notification.title}`);
      }
    }

    return { success: true, insertedCount };
  } catch (error) {
    console.error('❌ Error storing admission notifications:', error);
    return { success: false, error: error.message, insertedCount: 0 };
  }
};

// Clean up old admission notifications
export const cleanupOldAdmissionNotifications = async () => {
  try {
    const notificationsCollection = await getCollection('notifications');
    
    // Check if collection is available (DB connected)
    if (!notificationsCollection) {
      return { success: false, error: 'Database not connected', deletedCount: 0 };
    }
    
    const cutoffDate = new Date(Date.now() - CONFIG.DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const result = await notificationsCollection.deleteMany({
      isWebSourced: true,
      createdAt: { $lt: cutoffDate }
    });

    if (result.deletedCount > 0) {
      console.log(`Cleaned up ${result.deletedCount} old admission notifications`);
    }

    return { success: true, deletedCount: result.deletedCount };
  } catch (error) {
    console.error('❌ Error cleaning up old notifications:', error);
    return { success: false, error: error.message };
  }
};

// Get system-wide admission notifications
export const getAdmissionNotifications = async (limit = 20, skip = 0) => {
  try {
    const notificationsCollection = await getCollection('notifications');
    
    const notifications = await notificationsCollection
      .find({
        userId: 'system',
        isWebSourced: true,
        $or: [
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } }
        ]
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    return {
      success: true,
      notifications: notifications.map(n => ({
        id: n._id.toString(),
        title: n.title,
        message: n.message,
        type: n.type,
        category: n.category,
        priority: n.priority,
        university: n.metadata?.universityName,
        actionUrl: n.actionUrl,
        link: n.link || n.actionUrl, // Clickable link support
        linkText: n.linkText || 'View Details',
        createdAt: n.createdAt, // Use the actual fetch date from web, not current date
        isWebSourced: true
      }))
    };
  } catch (error) {
    console.error('❌ Error fetching admission notifications:', error);
    return { success: false, error: error.message, notifications: [] };
  }
};

export default {
  fetchAdmissionNotifications,
  storeAdmissionNotifications,
  cleanupOldAdmissionNotifications,
  getAdmissionNotifications
};
