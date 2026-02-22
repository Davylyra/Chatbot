import fetch from 'node-fetch';

export const DEFAULT_USER_AGENT = 'GlinaxBot/2.0 (University Admission Assistant; +https://glinax.com)';

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
    const key = `${n.university || 'unknown'}_${(n.title || '').substring(0, 40)}`;
    if (seen.has(key)) return false;
    seen.set(key, true);
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

  // Create at least 11 notifications from different universities
  const fallbackData = [
    {
      id: `ug_applications_${now.getTime()}`,
      university: 'University of Ghana',
      title: '📝 UG Applications Information',
      message: `University of Ghana ${academicYear} undergraduate applications information available. Check official website.`,
      type: 'info',
      priority: month >= 11 || month <= 1 ? 'high' : 'normal',
      actionUrl: 'https://ug.edu.gh/admissions',
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
      actionUrl: 'https://ucc.edu.gh/admissions',
      readNowUrl: 'https://ucc.edu.gh/news',
      linkText: 'View UCC News'
    },
    {
      id: `uenr_info_${now.getTime()}`,
      university: 'UENR',
      title: '🌿 UENR Admissions',
      message: 'University of Energy and Natural Resources admission details and programs.',
      type: 'info',
      priority: 'normal',
      actionUrl: 'https://uenr.edu.gh/admissions',
      readNowUrl: 'https://uenr.edu.gh/news-and-events',
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
      actionUrl: 'https://umat.edu.gh/admissions',
      readNowUrl: 'https://umat.edu.gh/news',
      linkText: 'View UMaT News'
    },
    {
      id: `uew_info_${now.getTime()}`,
      university: 'UEW',
      title: '👨‍🏫 UEW Admissions',
      message: 'University of Education, Winneba teacher training and education programs.',
      type: 'info',
      priority: 'normal',
      actionUrl: 'https://uew.edu.gh/admissions',
      readNowUrl: 'https://uew.edu.gh/news',
      linkText: 'View UEW News'
    },
    {
      id: `upsa_info_${now.getTime()}`,
      university: 'UPSA',
      title: '💼 UPSA Admissions',
      message: 'University of Professional Studies business and professional programs.',
      type: 'info',
      priority: 'normal',
      actionUrl: 'https://upsa.edu.gh/admissions',
      readNowUrl: 'https://upsa.edu.gh/news-and-events',
      linkText: 'View UPSA Updates'
    },
    {
      id: `gtu_info_${now.getTime()}`,
      university: 'GTU',
      title: '💻 GTU Admissions',
      message: 'Ghana Technology University ICT and technology-focused programs.',
      type: 'info',
      priority: 'normal',
      actionUrl: 'https://gtu.edu.gh/admissions',
      readNowUrl: 'https://gtu.edu.gh/news',
      linkText: 'View GTU News'
    },
    {
      id: `gctu_info_${now.getTime()}`,
      university: 'GCTU',
      title: '📡 GCTU Admissions',
      message: 'Ghana Communication Technology University communications and technology programs.',
      type: 'info',
      priority: 'normal',
      actionUrl: 'https://gctu.edu.gh/admissions',
      readNowUrl: 'https://gctu.edu.gh/news',
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

  // Convert to proper notification format
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
    admissionUrl: 'https://ug.edu.gh/admissions',
    newsUrl: 'https://www.ug.edu.gh/announcements',
    statusUrl: 'https://apply.ug.edu.gh/admissions/admissionstatus'
  },
  KNUST: {
    name: 'KNUST',
    admissionUrl: 'https://knust.edu.gh/admissions',
    newsUrl: 'https://www.knust.edu.gh/news',
    statusUrl: 'https://admissions.knust.edu.gh'
  },
  UCC: {
    name: 'University of Cape Coast',
    admissionUrl: 'https://ucc.edu.gh/admissions',
    newsUrl: 'https://ucc.edu.gh/news'
  },
  UENR: {
    name: 'University of Energy and Natural Resources',
    admissionUrl: 'https://uenr.edu.gh/admissions',
    newsUrl: 'https://uenr.edu.gh/news-and-events'
  },
  UDS: {
    name: 'University for Development Studies',
    admissionUrl: 'https://uds.edu.gh/admissions',
    newsUrl: 'https://uds.edu.gh/news'
  },
  UMAT: {
    name: 'University of Mines and Technology',
    admissionUrl: 'https://umat.edu.gh/admissions',
    newsUrl: 'https://umat.edu.gh/news'
  },
  UEW: {
    name: 'University of Education, Winneba',
    admissionUrl: 'https://uew.edu.gh/admissions',
    newsUrl: 'https://uew.edu.gh/news'
  },
  UPSA: {
    name: 'University of Professional Studies, Accra',
    admissionUrl: 'https://upsa.edu.gh/admissions',
    newsUrl: 'https://upsa.edu.gh/news-and-events'
  },
  GTU: {
    name: 'Ghana Technology University',
    admissionUrl: 'https://gtu.edu.gh/admissions',
    newsUrl: 'https://gtu.edu.gh/news'
  },
  GCTU: {
    name: 'Ghana Communication Technology University',
    admissionUrl: 'https://gctu.edu.gh/admissions',
    newsUrl: 'https://gctu.edu.gh/news'
  },
  AAMUSTED: {
    name: 'Akenten Appiah-Menka University of Skills Training',
    admissionUrl: 'https://aamusted.edu.gh/admissions',
    newsUrl: 'https://aamusted.edu.gh/news'
  },
  CKT_UTAS: {
    name: 'CK Tedam University of Technology and Applied Sciences',
    admissionUrl: 'https://cktutas.edu.gh/admissions',
    newsUrl: 'https://cktutas.edu.gh/news'
  },
  SDD_UBIDS: {
    name: 'SD Dombo University of Business and Integrated Development Studies',
    admissionUrl: 'https://ubids.edu.gh/admissions',
    newsUrl: 'https://ubids.edu.gh/news'
  },
  ATU: {
    name: 'Accra Technical University',
    admissionUrl: 'https://atu.edu.gh/admissions',
    newsUrl: 'https://atu.edu.gh/news'
  },
  HTU: {
    name: 'Ho Technical University',
    admissionUrl: 'https://htu.edu.gh/admissions',
    newsUrl: 'https://htu.edu.gh/news'
  }
};

export default {
  fetchWithRetry,
  deduplicateNotifications,
  sortNotificationsByPriority,
  getCuratedFallbackNotifications,
  UNIVERSITY_SOURCES
};
