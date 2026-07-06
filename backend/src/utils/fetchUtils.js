import fetch from 'node-fetch';
import crypto from 'crypto';

export const DEFAULT_USER_AGENT = 'CERKYL/2.0 (University Admission Assistant; +https://glinax.com)';

export const fetchWithRetry = async (url, options = {}, retries = 2, timeout = 10000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, { signal: controller.signal, ...options });
    clearTimeout(id);
    if (!res.ok && retries > 0) {
      await new Promise(r => setTimeout(r, 1000));
      return fetchWithRetry(url, options, retries - 1, timeout);
    }
    return res;
  } catch (err) {
    clearTimeout(id);
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 1000));
      return fetchWithRetry(url, options, retries - 1, timeout);
    }
    throw err;
  }
};

export function deduplicateNotifications(notifications) {
  const seen = new Map();
  
  return notifications.filter(n => {
    const content = `${n.university || 'unknown'}_${n.title || ''}_${n.message || ''}`;
    const hash = crypto.createHash('md5').update(content).digest('hex');
    
    if (seen.has(hash)) {
      console.log(`🔄 Duplicate detected: ${n.title}`);
      return false;
    }
    seen.set(hash, true);
    return true;
  });
}

export function sortNotificationsByPriority(notifications) {
  const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
  return notifications.sort((a, b) => {
    const p = (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
    if (p !== 0) return p;
    return new Date(b.date || b.fetchedAt || b.createdAt) - new Date(a.date || a.fetchedAt || a.createdAt);
  });
}

export function getCuratedFallbackNotifications(academicYear) {
  const now = new Date();
  const month = now.getMonth();
  const notifications = [];

  const fallbackData = [
    {
      id: `ug_applications_${now.getTime()}`,
      university: 'University of Ghana',
      title: '📝 UG Applications Information',
      message: `University of Ghana ${academicYear} undergraduate applications information available. Check official website.`,
      type: 'info',
      priority: month >= 11 || month <= 1 ? 'high' : 'normal',
      actionUrl: 'https://admissions.ug.edu.gh/undergraduate/overview',
      readNowUrl: 'https://www.ug.edu.gh/announcements',
      linkText: 'View UG Announcements'
    },
    {
      id: `knust_info_${now.getTime()}`,
      university: 'KNUST',
      title: '🎓 KNUST Admissions',
      message: 'Check KNUST for admission requirements, application deadlines, and programs offered.',
      type: 'info',
      priority: 'normal',
      actionUrl: 'https://knust.edu.gh/admissions',
      readNowUrl: 'https://www.knust.edu.gh/news',
      linkText: 'View KNUST News'
    },
    {
      id: `ucc_info_${now.getTime()}`,
      university: 'University of Cape Coast',
      title: '📚 UCC Admissions',
      message: 'University of Cape Coast admission information and program details available online.',
      type: 'info',
      priority: 'normal',
      actionUrl: 'https://admissions.ucc.edu.gh/',
      readNowUrl: 'https://ucc.edu.gh/announcements?type=admission',
      linkText: 'View UCC News'
    },
    {
      id: `uenr_info_${now.getTime()}`,
      university: 'UENR',
      title: '🌿 UENR Admissions',
      message: 'University of Energy and Natural Resources admission details and programs.',
      type: 'info',
      priority: 'normal',
      actionUrl: 'https://admissions.uenr.edu.gh/',
      readNowUrl: 'https://uenr.edu.gh/news/',
      linkText: 'View UENR Updates'
    },
    {
      id: `uds_info_${now.getTime()}`,
      university: 'UDS',
      title: '🎯 UDS Admissions',
      message: 'University for Development Studies admission requirements and application process.',
      type: 'info',
      priority: 'normal',
      actionUrl: 'https://uds.edu.gh/admissions',
      readNowUrl: 'https://uds.edu.gh/news',
      linkText: 'View UDS News'
    },
    {
      id: `umat_info_${now.getTime()}`,
      university: 'UMaT',
      title: '⛏️ UMaT Admissions',
      message: 'University of Mines and Technology admission information and mining-related programs.',
      type: 'info',
      priority: 'normal',
      actionUrl: 'https://umat.edu.gh/overview-undergraduate',
      readNowUrl: 'https://umat.edu.gh/media-press/news',
      linkText: 'View UMaT News'
    },
    {
      id: `uew_info_${now.getTime()}`,
      university: 'UEW',
      title: '👨‍🏫 UEW Admissions',
      message: 'University of Education, Winneba teacher training and education programs.',
      type: 'info',
      priority: 'normal',
      actionUrl: 'https://uew.edu.gh/admissions/apply',
      readNowUrl: 'https://uew.edu.gh/media/uew-news',
      linkText: 'View UEW News'
    },
    {
      id: `upsa_info_${now.getTime()}`,
      university: 'UPSA',
      title: '💼 UPSA Admissions',
      message: 'University of Professional Studies business and professional programs.',
      type: 'info',
      priority: 'normal',
      actionUrl: 'https://admissions.upsa.edu.gh/admissions/undergraduate/',
      readNowUrl: 'https://upsa.edu.gh/news/',
      linkText: 'View UPSA Updates'
    },
    
    {
      id: `gctu_info_${now.getTime()}`,
      university: 'GCTU',
      title: '📡 GCTU Admissions',
      message: 'Ghana Communication Technology University communications and technology programs.',
      type: 'info',
      priority: 'normal',
      actionUrl: 'https://site.gctu.edu.gh/how-to-apply',
      readNowUrl: 'https://site.gctu.edu.gh/announcements',
      linkText: 'View GCTU News'
    },
    {
      id: `aamusted_info_${now.getTime()}`,
      university: 'AAMUSTED',
      title: '🔧 AAMUSTED Admissions',
      message: 'Akenten Appiah-Menka University skills training and technical programs.',
      type: 'info',
      priority: 'normal',
      actionUrl: 'https://aamusted.edu.gh/admissions',
      readNowUrl: 'https://aamusted.edu.gh/news',
      linkText: 'View AAMUSTED News'
    },
    {
      id: `general_info_${now.getTime()}`,
      university: 'Ghana Tertiary Education',
      title: '💡 University Admission Tips',
      message: 'Ensure you meet WASSCE requirements (6 credits including English & Math).',
      type: 'info',
      priority: 'normal',
      actionUrl: 'https://www.gtec.edu.gh',
      readNowUrl: 'https://www.gtec.edu.gh',
      linkText: 'Visit GTEC'
    }
  ];

  fallbackData.forEach(item => {
    notifications.push({
      ...item,
      date: now.toISOString(),
      fetchedAt: now,
      createdAt: now,
      link: item.readNowUrl || item.actionUrl,
      source: 'system',
      category: 'admission_update',
      verified: true,
      metadata: {
        universityName: item.university,
        isFallback: true,
        academicYear
      }
    });
  });

  return notifications;
}

export const UNIVERSITY_SOURCES = {
  UG: {
    name: 'University of Ghana',
    admissionUrl: 'https://admissions.ug.edu.gh/undergraduate/overview',
    newsUrl: 'https://www.ug.edu.gh/announcements',
  },
  KNUST: {
    name: 'KNUST',
    admissionUrl: 'https://knust.edu.gh/admissions',
    newsUrl: 'https://www.knust.edu.gh/news',
  },
  UCC: {
    name: 'University of Cape Coast',
    admissionUrl: 'https://admissions.ucc.edu.gh/',
    newsUrl: 'https://ucc.edu.gh/announcements?type=admission'
  },
  UENR: {
    name: 'University of Energy and Natural Resources',
    admissionUrl: 'https://admissions.uenr.edu.gh/',
    newsUrl: 'https://uenr.edu.gh/news/'
  },
  UDS: {
    name: 'University for Development Studies',
    admissionUrl: 'https://uds.edu.gh/admissions',
    newsUrl: 'https://uds.edu.gh/news'
  },
  UMAT: {
    name: 'University of Mines and Technology',
    admissionUrl: 'https://umat.edu.gh/overview-undergraduate',
    newsUrl: 'https://umat.edu.gh/media-press/news'
  },
  UEW: {
    name: 'University of Education, Winneba',
    admissionUrl: 'https://uew.edu.gh/admissions/apply',
    newsUrl: 'https://uew.edu.gh/media/uew-news'
  },
  UPSA: {
    name: 'University of Professional Studies, Accra',
    admissionUrl: 'https://admissions.upsa.edu.gh/admissions/undergraduate/',
    newsUrl: 'https://upsa.edu.gh/news/'
  },
  GCTU: {
    name: 'Ghana Communication Technology University',
    admissionUrl: 'https://site.gctu.edu.gh/how-to-apply',
    newsUrl: 'https://site.gctu.edu.gh/announcements'
  },
  AAMUSTED: {
    name: 'Akenten Appiah-Menka University of Skills Training',
    admissionUrl: 'https://aamusted.edu.gh/admissions',
    newsUrl: 'https://aamusted.edu.gh/news'
  },
  CKT_UTAS: {
    name: 'CK Tedam University of Technology and Applied Sciences',
    admissionUrl: 'https://cktutas.edu.gh/admissions-portal/',
    newsUrl: 'https://cktutas.edu.gh/news/'
  },
  SDD_UBIDS: {
    name: 'SD Dombo University of Business and Integrated Development Studies',
    admissionUrl: 'https://ubids.edu.gh/admissions',
    newsUrl: 'https://ubids.edu.gh/news'
  },
  ATU: {
    name: 'Accra Technical University',
    admissionUrl: 'https://atu.edu.gh/how-to-apply-to-atu/',
    newsUrl: 'https://atu.edu.gh/news'
  },
  HTU: {
    name: 'Ho Technical University',
    admissionUrl: 'https://app.htu.edu.gh/admissions/',
    newsUrl: 'https://htu.edu.gh/admission-news/'
  }
};

export default {
  fetchWithRetry,
  deduplicateNotifications,
  sortNotificationsByPriority,
  getCuratedFallbackNotifications,
  UNIVERSITY_SOURCES
};
