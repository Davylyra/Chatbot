/**
 * Manages dynamic academic years and admission cycles
 * 
 * Handles:
 * - Current academic year calculation (auto-updates based on date)
 * - Application deadlines
 * - Important dates
 * - Admission statuses
 */

export const getCurrentAcademicYear = () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  
  // In Ghana, academic year typically starts September
  // If Jan-Aug, it's currentYear-1/currentYear
  const month = now.getMonth(); // 0-11
  
  if (month >= 8) { // September (8) through December (11)
    return `${currentYear}/${currentYear + 1}`;
  } else { // January (0) through August (7)
    return `${currentYear - 1}/${currentYear}`;
  }
};

export const getAcademicYearInfo = () => {
  const academicYear = getCurrentAcademicYear();
  const [startYear, endYear] = academicYear.split('/').map(Number);
  
  return {
    academicYear,
    startYear,
    endYear,
    
    dates: {
      applicationStart: new Date(startYear, 9, 1), // October 1st of start year
      applicationDeadline: new Date(startYear + 1, 2, 31), // March 31st of next year
      resultReleaseStart: new Date(startYear + 1, 4, 15), // Mid-May
      admissionListRelease: new Date(startYear + 1, 5, 30), // Late June
      acceptanceDeadline: new Date(startYear + 1, 6, 31), // July 31st
      registrationPeriod: {
        start: new Date(startYear + 1, 7, 1), // August 1st
        end: new Date(startYear + 1, 8, 30) // September 30th
      },
      academicStart: new Date(startYear + 1, 8, 15), // Mid-September
    },
    
    isApplicationOpen: () => {
      const now = new Date();
      const info = getAcademicYearInfo();
      return now >= info.dates.applicationStart && now <= info.dates.applicationDeadline;
    },
    
    daysUntilDeadline: () => {
      const now = new Date();
      const deadline = getAcademicYearInfo().dates.applicationDeadline;
      const diff = deadline - now;
      return Math.ceil(diff / (1000 * 60 * 60 * 24));
    },
    
    cycleStatus: () => {
      const now = new Date();
      const info = getAcademicYearInfo();
      
      if (now < info.dates.applicationStart) {
        return 'PENDING'; // Not yet open
      } else if (now <= info.dates.applicationDeadline) {
        return 'ACTIVE'; // Application ongoing
      } else if (now < info.dates.admissionListRelease) {
        return 'PROCESSING'; // Results being processed
      } else if (now <= info.dates.acceptanceDeadline) {
        return 'ACCEPTANCE'; // Admission lists released, awaiting acceptances
      } else if (now <= info.dates.registrationPeriod.end) {
        return 'REGISTRATION'; // Registration period
      } else {
        return 'STARTED'; // Academic year has started
      }
    }
  };
};

export const getDynamicUniversityDates = () => {
  const yearInfo = getAcademicYearInfo();
  const status = yearInfo.cycleStatus();
  
  return {
    applicationOpen: status === 'ACTIVE',
    applicationDeadline: yearInfo.dates.applicationDeadline.toISOString(),
    resultDate: yearInfo.dates.resultReleaseStart.toISOString(),
    admissionListReleaseDate: yearInfo.dates.admissionListRelease.toISOString(),
    acceptanceDeadline: yearInfo.dates.acceptanceDeadline.toISOString(),
    registrationStart: yearInfo.dates.registrationPeriod.start.toISOString(),
    registrationEnd: yearInfo.dates.registrationPeriod.end.toISOString(),
    academicStart: yearInfo.dates.academicStart.toISOString(),
    cycleStatus: status,
    daysUntilDeadline: yearInfo.daysUntilDeadline()
  };
};

export const hasDatePassed = (date) => {
  return new Date() > new Date(date);
};

export const formatDateForDisplay = (date) => {
  const options = {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  };
  return new Date(date).toLocaleDateString('en-GB', options);
};

export const isDateApproaching = (date) => {
  const now = new Date();
  const targetDate = new Date(date);
  const daysUntil = (targetDate - now) / (1000 * 60 * 60 * 24);
  return daysUntil > 0 && daysUntil <= 30;
};

export const getCycleStatusMessage = () => {
  const info = getAcademicYearInfo();
  const status = info.cycleStatus();
  const year = info.academicYear;
  
  switch(status) {
    case 'PENDING':
      return `🔜 Applications for ${year} will open on ${formatDateForDisplay(info.dates.applicationStart)}`;
    case 'ACTIVE':
      return `📝 Applications for ${year} are open! Deadline: ${formatDateForDisplay(info.dates.applicationDeadline)} (${info.daysUntilDeadline()} days left)`;
    case 'PROCESSING':
      return `⏳ Applications closed. Results being processed. Check back soon!`;
    case 'ACCEPTANCE':
      return `🎓 Admission lists have been released! Accept by ${formatDateForDisplay(info.dates.acceptanceDeadline)}`;
    case 'REGISTRATION':
      return `📋 Registration period ongoing until ${formatDateForDisplay(info.dates.registrationPeriod.end)}`;
    case 'STARTED':
      return `🎓 Academic year ${year} has started!`;
    default:
      return `Academic year ${year} is underway`;
  }
};

export const getRelevantNotifications = () => {
  const info = getAcademicYearInfo();
  const notifications = [];
  
  if (isDateApproaching(info.dates.applicationDeadline) && info.cycleStatus() === 'ACTIVE') {
    notifications.push({
      type: 'warning',
      title: '⏰ Application Deadline Approaching!',
      message: `Only ${info.daysUntilDeadline()} days left to apply for ${info.academicYear}`,
      priority: 'high'
    });
  }
  
  if (isDateApproaching(info.dates.admissionListRelease) && info.cycleStatus() === 'PROCESSING') {
    notifications.push({
      type: 'info',
      title: '📢 Admission Lists Coming Soon!',
      message: `Admission results for ${info.academicYear} will be released on ${formatDateForDisplay(info.dates.admissionListRelease)}`,
      priority: 'normal'
    });
  }
  
  if (isDateApproaching(info.dates.acceptanceDeadline) && info.cycleStatus() === 'ACCEPTANCE') {
    notifications.push({
      type: 'warning',
      title: '📝 Acceptance Deadline Approaching!',
      message: `Accept your admission by ${formatDateForDisplay(info.dates.acceptanceDeadline)}`,
      priority: 'high'
    });
  }
  
  return notifications;
};

export default {
  getCurrentAcademicYear,
  getAcademicYearInfo,
  getDynamicUniversityDates,
  hasDatePassed,
  formatDateForDisplay,
  isDateApproaching,
  getCycleStatusMessage,
  getRelevantNotifications
};
