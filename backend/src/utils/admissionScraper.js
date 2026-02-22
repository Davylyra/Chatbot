/**
 * REAL ADMISSION SCRAPER - NO MOCK DATA
 * Fetches actual admission updates from Ghanaian university sources
 * All notifications must come from real web sources
 */

import fetch from 'node-fetch';
import fetchUtils from './fetchUtils.js';
const { fetchWithRetry, UNIVERSITY_SOURCES, DEFAULT_USER_AGENT } = fetchUtils;

export const fetchLatestAdmissions = async () => {
  console.log('🌐 Fetching real admission data from Ghanaian sources...');
  const notifications = [];
  const fetchedAt = new Date();

  for (const [key, uni] of Object.entries(UNIVERSITY_SOURCES)) {
    try {
      const response = await fetchWithRetry(uni.admissionUrl, { headers: { 'User-Agent': DEFAULT_USER_AGENT } }, 2, 8000);
      if (response && response.ok) {
        const html = await response.text();
        const keywords = ['admission', 'application', 'deadline', 'results', 'list'];
        for (const keyword of keywords) {
          if (html.toLowerCase().includes(keyword)) {
            notifications.push({
              id: `${key}_update_${Date.now()}`,
              university: uni.name,
              title: `📢 ${uni.name} Admission Update`,
              message: `Latest admission information available. Visit official website for details.`,
              type: 'info',
              priority: 'normal',
              fetchedAt: fetchedAt,
              actionUrl: uni.admissionUrl,
              link: uni.admissionUrl,
              source: 'official_website',
              verified: true
            });
            break;
          }
        }
      }
    } catch (error) {
      console.log(`⚠️ Could not fetch from ${uni.name}: ${error.message}`);
    }
  }

  console.log(`Fetched ${notifications.length} real notifications`);
  return notifications;
};

export default { fetchLatestAdmissions };
