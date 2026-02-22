/**
 * Academic Year Helper - Ghanaian University Admission Cycles
 * Automatically updates based on current date
 * 
 * Ghanaian universities follow an academic calendar where:
 * - Applications open: June/July each year
 * - Deadlines: August/September
 * - Admission lists released: November/December
 * - Academic year starts: September
 * 
 * So the 2025/2026 cycle runs from September 2025 to August 2026
 */

export const AcademicYearCycle = {
  /**
   * Get current academic year (e.g., "2025/2026")
   * The cycle starts in September of the first year
   * So from Sept 1, 2025 - Aug 31, 2026 = "2025/2026" cycle
   */
  getCurrentYear(): string {
    const now = new Date();
    const currentYear = now.getFullYear();
    
    // Cycle starts in September (month 8 in 0-indexed)
    // So from Sept onward, we're in the current-year/next-year cycle
    if (now.getMonth() >= 8) {
      return `${currentYear}/${currentYear + 1}`;
    } else {
      // Jan-Aug, we're in the previous-year/current-year cycle
      return `${currentYear - 1}/${currentYear}`;
    }
  },

  /**
   * Get the previous academic year
   */
  getPreviousYear(): string {
    const currentYear = this.getCurrentYear();
    const [start, end] = currentYear.split('/').map(Number);
    return `${start - 1}/${end - 1}`;
  },

  /**
   * Get next academic year
   */
  getNextYear(): string {
    const currentYear = this.getCurrentYear();
    const [start, end] = currentYear.split('/').map(Number);
    return `${start + 1}/${end + 1}`;
  },

  /**
   * Check if currently in application/admission season
   * Typically June - September for applications
   */
  isApplicationSeason(): boolean {
    const now = new Date();
    const month = now.getMonth(); // 0-11
    return month >= 5 && month <= 8; // June (5) to September (8)
  },

  /**
   * Check if in admission results period
   * Typically December - January for results
   */
  isAdmissionResultsPeriod(): boolean {
    const now = new Date();
    const month = now.getMonth();
    return month === 11 || month === 0; // December or January
  },

  /**
   * Get key dates for current academic year
   */
  getKeyDates() {
    const now = new Date();
    const currentYear = now.getFullYear();
    
    // Determine which cycle we're in
    const cycleStartYear = now.getMonth() >= 8 ? currentYear : currentYear - 1;
    
    return {
      // Application period
      applicationStart: new Date(cycleStartYear, 5, 1), // June 1
      applicationDeadline: new Date(cycleStartYear, 8, 30), // September 30
      
      // Admission results
      admissionListsRelease: new Date(cycleStartYear + 1, 0, 15), // January 15
      
      // Academic year
      academicYearStart: new Date(cycleStartYear + 1, 8, 1), // September 1
      academicYearEnd: new Date(cycleStartYear + 2, 7, 31), // August 31
      
      // Accreditation/Verification (if applicable)
      verificationPeriod: new Date(cycleStartYear, 10, 1) // November 1
    };
  },

  /**
   * Get days remaining until specified deadline
   */
  daysUntilDeadline(deadline: Date): number {
    const now = new Date();
    const diff = deadline.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  },

  /**
   * Check if a date has passed
   */
  isPast(date: Date): boolean {
    return new Date() > date;
  },

  /**
   * Check if a date is upcoming (within 30 days)
   */
  isUpcoming(date: Date): boolean {
    const daysUntil = this.daysUntilDeadline(date);
    return daysUntil > 0 && daysUntil <= 30;
  },

  /**
   * Get all Ghanaian universities' typical application periods
   * Returns an array with admission information for all major universities
   */
  getUniversitiesAdmissionCalendar() {
    const cycle = this.getCurrentYear();
    const keyDates = this.getKeyDates();
    
    return {
      cycle,
      universities: {
        "University of Ghana": {
          code: "UG",
          applicationDeadline: keyDates.applicationDeadline,
          admissionListsRelease: keyDates.admissionListsRelease,
          healthSciencesDeadline: new Date(keyDates.applicationDeadline.getFullYear(), 9, 31), // Early deadline
          website: "https://www.ug.edu.gh",
          admissionPortal: "https://apply.ug.edu.gh"
        },
        "Kwame Nkrumah University of Science and Technology": {
          code: "KNUST",
          applicationDeadline: keyDates.applicationDeadline,
          admissionListsRelease: keyDates.admissionListsRelease,
          website: "https://www.knust.edu.gh",
          admissionPortal: "https://admissions.knust.edu.gh"
        },
        "University of Cape Coast": {
          code: "UCC",
          applicationDeadline: keyDates.applicationDeadline,
          admissionListsRelease: keyDates.admissionListsRelease,
          website: "https://www.ucc.edu.gh",
          admissionPortal: "https://admissions.ucc.edu.gh"
        },
        "University of Development Studies": {
          code: "UDS",
          applicationDeadline: keyDates.applicationDeadline,
          admissionListsRelease: keyDates.admissionListsRelease,
          website: "https://www.uds.edu.gh",
          admissionPortal: "https://admissions.uds.edu.gh"
        },
        "University of Professional Studies": {
          code: "UPSA",
          applicationDeadline: keyDates.applicationDeadline,
          admissionListsRelease: keyDates.admissionListsRelease,
          website: "https://www.upsa.edu.gh",
          admissionPortal: "https://admissions.upsa.edu.gh"
        },
        "Ghana Institute of Management and Public Administration": {
          code: "GIMPA",
          applicationDeadline: keyDates.applicationDeadline,
          admissionListsRelease: keyDates.admissionListsRelease,
          website: "https://www.gimpa.edu.gh"
        }
      }
    };
  },

  /**
   * Format date in Ghanaian English style
   */
  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-GH', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(date);
  },

  /**
   * Get countdown text for a deadline
   */
  getCountdownText(deadline: Date): string {
    const now = new Date();
    const diff = deadline.getTime() - now.getTime();
    
    if (diff < 0) return 'Deadline passed';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    
    if (days > 30) {
      return `${Math.floor(days / 7)} weeks remaining`;
    } else if (days > 0) {
      return `${days} days remaining`;
    } else if (hours > 0) {
      return `${hours} hours remaining`;
    } else {
      return 'Less than 1 hour remaining';
    }
  }
};

export default AcademicYearCycle;
