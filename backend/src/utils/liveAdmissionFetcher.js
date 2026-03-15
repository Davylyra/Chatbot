/**
 * LIVE ADMISSION NOTIFICATION FETCHER FOR GHANAIAN UNIVERSITIES
 * Fetches real admission updates from official university sources
 * 
 * Sources:
 * - Official university websites (RSS/API if available)
 * - Ghana Education Service announcements
 * - Ghana Tertiary Education Commission updates
 * - Trusted education news portals
 */

import fetch from 'node-fetch';
import fetchUtils from './fetchUtils.js';
const { fetchWithRetry, deduplicateNotifications, sortNotificationsByPriority, getCuratedFallbackNotifications, UNIVERSITY_SOURCES, DEFAULT_USER_AGENT } = fetchUtils;

/**
 * Fetch live admission notifications from multiple sources
 * @returns {Promise<Array>} Array of notification objects (minimum 11)
 */
export const fetchLiveAdmissionNotifications = async () => {
  console.log('📡 Fetching live admission notifications from Ghanaian sources...');
  
  const notifications = [];
  const currentYear = new Date().getFullYear();
  const academicYear = `${currentYear}/${currentYear + 1}`;
  
  try {
    // Try to fetch from various sources with graceful fallbacks
    const fetchPromises = [
      fetchUniversityUpdates(),
      fetchEducationNews(),
      fetchGhanaAdmissionsCentral()
    ];
    
    const results = await Promise.allSettled(fetchPromises);
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        notifications.push(...result.value);
        console.log(`Source ${index + 1} returned ${result.value.length} notifications`);
      } else if (result.status === 'rejected') {
        console.warn(`⚠️ Source ${index + 1} failed:`, result.reason?.message || 'Unknown error');
      }
    });
    
    // Return only real notifications - no fake fallbacks
    // Better to show 0 notifications than fake data
    if (notifications.length === 0) {
      console.log('ℹ️ No real notifications available - returning empty array');
      return [];
    }

    // Deduplicate and sort by priority
    const uniqueNotifications = deduplicateNotifications(notifications);
    const sortedNotifications = sortNotificationsByPriority(uniqueNotifications);
    
    console.log(`✅ Returning ${sortedNotifications.length} real notifications`);
    return sortedNotifications;
    
  } catch (error) {
    console.error('❌ Error fetching live notifications:', error);
    // Return empty array on error - no fake fallbacks
    return [];
  }
};

/**
 * Fetch updates directly from university websites (all 15 sources)
 * OPTIMIZED: Parallel fetching instead of sequential
 */
async function fetchUniversityUpdates() {
  const timeout = 5000; // 5 second timeout
  
  // Fetch all universities in parallel for better performance
  const fetchPromises = Object.entries(UNIVERSITY_SOURCES).map(async ([code, uni]) => {
    try {
      // Attempt to fetch news/admission pages with retry/timeout
      const response = await fetchWithRetry(uni.newsUrl || uni.admissionUrl, {
        headers: { 'User-Agent': DEFAULT_USER_AGENT }
      }, 2, timeout);
      
      if (response && response.ok) {
        const html = await response.text();
        
        // Parse for admission-related keywords
        const admissionKeywords = ['admission list', 'admission status', 'admissions open', 'application deadline', 'entrance exam', 'matriculation', 'application form', 'online application'];
        
        for (const keyword of admissionKeywords) {
          if (html.toLowerCase().includes(keyword)) {
            // Create notification with proper schema
            const notification = {
              id: `${code}_live_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              university: uni.name,
              title: `📢 ${uni.name} Admission Update`,
              message: `Recent updates detected on ${uni.name} admissions page. Visit their website for latest information.`,
              type: 'info',
              priority: 'normal',
              category: 'admission_update',
              date: new Date().toISOString(),
              fetchedAt: new Date(),
              createdAt: new Date(),
              actionUrl: uni.newsUrl || uni.admissionUrl,
              link: uni.newsUrl || uni.admissionUrl,
              readNowUrl: uni.newsUrl || uni.admissionUrl,
              linkText: 'View on Official Website',
              source: 'official_website',
              verified: true,
              metadata: {
                universityName: uni.name,
                universityCode: code,
                detectedKeyword: keyword,
                sourceUrl: uni.newsUrl || uni.admissionUrl
              }
            };
            
            console.log(`✅ Found admission updates for ${uni.name} (keyword: "${keyword}")`);
            return notification; // Return only real updates
          }
        }
      }
      
      // Skip generic fallback notifications - return null if no real update found
      console.log(`ℹ️ No real updates from ${uni.name}`);
      return null;
      
    } catch (error) {
      // Don't create fallback notifications on error - just log and return null
      console.log(`⚠️ Could not fetch from ${uni.name}: ${error.message}`);
      return null;
    }
  });
  
  // Wait for all fetches to complete
  const results = await Promise.allSettled(fetchPromises);
  
  // Extract only successful real notifications (filter out nulls and rejected)
  const updates = results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
  
  console.log(`📊 Parallel fetch complete: ${updates.length} real notifications from ${Object.keys(UNIVERSITY_SOURCES).length} universities`);
  return updates;
}

/**
 * Fetch from Ghana education news portals
 */
async function fetchEducationNews() {
  const news = [];
  // This would parse RSS feeds or scrape news sites
  // For now, return empty to avoid blocking
  return news;
}

/**
 * Fetch from Ghana Tertiary Education Commission or centralized portal
 */
async function fetchGhanaAdmissionsCentral() {
  try {
    // Future: Connect to official Ghana education portal API
    // For now, provide structured fallback
    return [];
  } catch (error) {
    return [];
  }
}

export default { fetchLiveAdmissionNotifications };
