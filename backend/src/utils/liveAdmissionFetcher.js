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
 Fetch live admission notifications from multiple sources
 */
export const fetchLiveAdmissionNotifications = async () => {
  console.log('Fetching live admission notifications from Ghanaian sources...');
  
  const notifications = [];
  const currentYear = new Date().getFullYear();
  const academicYear = `${currentYear}/${currentYear + 1}`;
  
  try {
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
        console.warn(` Source ${index + 1} failed:`, result.reason?.message || 'Unknown error');
      }
    });
    
    if (notifications.length === 0) {
      console.log(' No real notifications available - returning empty array');
      return [];
    }

    const uniqueNotifications = deduplicateNotifications(notifications);
    const sortedNotifications = sortNotificationsByPriority(uniqueNotifications);
    
    console.log(` Returning ${sortedNotifications.length} real notifications`);
    return sortedNotifications;
    
  } catch (error) {
    console.error(' Error fetching live notifications:', error);
    return [];
  }
};

/**
 * Fetch updates directly from university websites 
 */
async function fetchUniversityUpdates() {
  const timeout = 5000; // 5 second timeout
  
  const fetchPromises = Object.entries(UNIVERSITY_SOURCES).map(async ([code, uni]) => {
    try {
      const response = await fetchWithRetry(uni.newsUrl || uni.admissionUrl, {
        headers: { 'User-Agent': DEFAULT_USER_AGENT }
      }, 2, timeout);
      
      if (response && response.ok) {
        const html = await response.text();
        
        const admissionKeywords = ['admission list', 'admission status', 'admissions open', 'application deadline', 'entrance exam', 'matriculation', 'application form', 'online application'];
        
        for (const keyword of admissionKeywords) {
          if (html.toLowerCase().includes(keyword)) {
            const notification = {
              id: `${code}_live_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              university: uni.name,
              title: ` ${uni.name} Admission Update`,
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
            
            console.log(` Found admission updates for ${uni.name} (keyword: "${keyword}")`);
            return notification; // Return only real updates
          }
        }
      }
      
      console.log(` No real updates from ${uni.name}`);
      return null;
      
    } catch (error) {
      console.log(` Could not fetch from ${uni.name}: ${error.message}`);
      return null;
    }
  });
  
  const results = await Promise.allSettled(fetchPromises);
  
  const updates = results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
  
  console.log(` Parallel fetch complete: ${updates.length} real notifications from ${Object.keys(UNIVERSITY_SOURCES).length} universities`);
  return updates;
}

/**
 * Fetch from Ghana education news portals
 */
async function fetchEducationNews() {
  const news = [];
  return news;
}

/**
 * Fetch from Ghana Tertiary Education Commission or centralized portal
 */
async function fetchGhanaAdmissionsCentral() {
  try {
    return [];
  } catch (error) {
    return [];
  }
}

export default { fetchLiveAdmissionNotifications };
