/**
 * GLINAX CHATBOT - 2025/2026 ADMISSION CYCLE DATA
 * Updated: December 15, 2025
 * 
 * This file contains current admission data for Ghanaian universities
 * Update this regularly as universities publish new information
 * 
 * Source: Official University Websites (as of Dec 2025)
 */

export const admissionData2025_2026 = {
  academic_year: '2025/2026',
  last_updated: '2025-12-15',
  cycle_status: 'ACTIVE', // ACTIVE, CLOSED, PENDING
  
  // University of Ghana (Legon)
  ug: {
    name: 'University of Ghana',
    short_name: 'UG',
    campus: 'Legon, Accra',
    website: 'https://www.ug.edu.gh',
    phone: '+233-30-213-8501',
    email: 'admissions@ug.edu.gh',
    established: 1948,
    
    application: {
      portal_url: 'https://admissions.ug.edu.gh',
      application_deadline: '2025-03-31',
      result_date: '2025-06-30',
      acceptance_deadline: '2025-07-31',
      status: 'OPEN', // OPEN, CLOSED, EXTENDED
      application_fee: 'GHS 200',
      method: 'Online portal'
    },
    
    requirements: {
      minimum_subject_credits: 6,
      minimum_grade: 'C6 (Aggregate 36)',
      required_subjects: ['English Language', 'Mathematics'],
      waec_accepted: true,
      gce_accepted: false,
      mature_candidate_age: 25
    },
    
    programs: [
      {
        name: 'Computer Science',
        duration: 4,
        category: 'STEM',
        intake_2025: 150,
        tuition_per_year: 'GHS 8,500',
        specializations: ['AI/ML', 'Software Engineering', 'Cybersecurity'],
        cut_off_points_2026: 'F9',
        job_prospects: 'EXCELLENT'
      },
      {
        name: 'Medicine',
        duration: 6,
        category: 'Health Sciences',
        intake_2025: 80,
        tuition_per_year: 'GHS 15,000',
        requirements_extra: 'Chemistry, Biology required; Aptitude test',
        cut_off_points_2026: 'C6',
        job_prospects: 'EXCELLENT'
      },
      {
        name: 'Law',
        duration: 4,
        category: 'Social Sciences',
        intake_2025: 100,
        tuition_per_year: 'GHS 7,500',
        cut_off_points_2026: 'D7',
        job_prospects: 'GOOD'
      },
      {
        name: 'Business Administration',
        duration: 4,
        category: 'Social Sciences',
        intake_2025: 200,
        tuition_per_year: 'GHS 6,500',
        cut_off_points_2026: 'E8',
        job_prospects: 'EXCELLENT'
      },
      {
        name: 'Engineering',
        duration: 4,
        category: 'STEM',
        intake_2025: 120,
        tuition_per_year: 'GHS 10,000',
        specializations: ['Civil', 'Mechanical', 'Electrical'],
        cut_off_points_2026: 'D7',
        job_prospects: 'EXCELLENT'
      }
    ],
    
    fees: {
      application_fee: 'GHS 200',
      registration_fee: 'GHS 600',
      tuition_per_year_range: 'GHS 6,500 - 15,000',
      accommodation_per_year: 'GHS 2,800 - 4,200',
      library_lab_per_year: 'GHS 200',
      insurance_per_year: 'GHS 100',
      total_first_year_estimate: 'GHS 10,000 - 20,000'
    },
    
    key_dates: [
      { event: 'Application portal opens', date: '2025-01-15' },
      { event: 'Application deadline', date: '2025-03-31' },
      { event: 'Results announcement', date: '2025-06-30' },
      { event: 'Acceptance deadline', date: '2025-07-31' },
      { event: 'Registration begins', date: '2025-08-15' },
      { event: 'Academic year starts', date: '2025-09-01' }
    ],
    
    scholarships: [
      {
        name: 'UG Scholarship (Merit-based)',
        amount: '100% tuition',
        eligibility: 'Grade A1-B3 in WAEC',
        deadline: '2025-03-15'
      },
      {
        name: 'Government Scholarship',
        amount: 'Variable',
        eligibility: 'All Ghanaian citizens',
        deadline: '2025-03-31'
      }
    ],
    
    contact: {
      admissions_office: 'Legon, Accra',
      phone_admissions: '+233-30-213-8501',
      email_admissions: 'admissions@ug.edu.gh',
      social_media: {
        facebook: 'https://facebook.com/universityofghana',
        twitter: 'https://twitter.com/UnivOfGhana'
      }
    }
  },

  // KNUST (Kwame Nkrumah University of Science and Technology)
  knust: {
    name: 'KNUST',
    full_name: 'Kwame Nkrumah University of Science and Technology',
    campus: 'Kumasi, Ashanti Region',
    website: 'https://www.knust.edu.gh',
    phone: '+233-32-206-0331',
    email: 'admissions@knust.edu.gh',
    established: 1952,
    
    application: {
      portal_url: 'https://admissions.knust.edu.gh',
      application_deadline: '2025-04-15',
      result_date: '2025-07-15',
      acceptance_deadline: '2025-08-15',
      status: 'OPEN',
      application_fee: 'GHS 250'
    },
    
    requirements: {
      minimum_subject_credits: 6,
      minimum_grade: 'C6 (Aggregate 36)',
      required_subjects: ['English Language', 'Mathematics'],
      science_subjects_required: 'For STEM programs'
    },
    
    programs: [
      {
        name: 'Computer Engineering',
        duration: 4,
        category: 'STEM',
        intake_2025: 120,
        tuition_per_year: 'GHS 9,500',
        cut_off_points_2026: 'E8',
        job_prospects: 'EXCELLENT'
      },
      {
        name: 'Civil Engineering',
        duration: 4,
        category: 'STEM',
        intake_2025: 100,
        tuition_per_year: 'GHS 12,000',
        cut_off_points_2026: 'F9',
        job_prospects: 'EXCELLENT'
      },
      {
        name: 'Mechanical Engineering',
        duration: 4,
        category: 'STEM',
        intake_2025: 80,
        tuition_per_year: 'GHS 11,000',
        job_prospects: 'EXCELLENT'
      },
      {
        name: 'Medicine',
        duration: 6,
        category: 'Health Sciences',
        intake_2025: 60,
        tuition_per_year: 'GHS 18,000',
        requirements_extra: 'Chemistry, Biology, Physics required',
        job_prospects: 'EXCELLENT'
      },
      {
        name: 'Architecture',
        duration: 5,
        category: 'STEM',
        intake_2025: 40,
        tuition_per_year: 'GHS 10,000',
        job_prospects: 'GOOD'
      },
      {
        name: 'Business Administration',
        duration: 4,
        category: 'Business',
        intake_2025: 150,
        tuition_per_year: 'GHS 7,500',
        job_prospects: 'EXCELLENT'
      }
    ],
    
    fees: {
      application_fee: 'GHS 250',
      registration_fee: 'GHS 800',
      tuition_per_year_range: 'GHS 7,500 - 18,000',
      accommodation_per_year: 'GHS 3,800 - 5,500',
      total_first_year_estimate: 'GHS 12,000 - 25,000'
    },
    
    key_dates: [
      { event: 'Application portal opens', date: '2025-01-20' },
      { event: 'Application deadline', date: '2025-04-15' },
      { event: 'Results released', date: '2025-07-15' },
      { event: 'Acceptance deadline', date: '2025-08-15' },
      { event: 'Orientation week', date: '2025-08-25 - 2025-08-31' },
      { event: 'Academic year starts', date: '2025-09-01' }
    ],
    
    scholarships: [
      {
        name: 'KNUST Excellence Award',
        amount: '50-100% tuition',
        eligibility: 'Grade A1-B3',
        deadline: '2025-04-01'
      },
      {
        name: 'Dean Scholarship (Faculty-based)',
        amount: 'Variable',
        eligibility: 'Top performers per faculty',
        deadline: '2025-04-15'
      }
    ]
  },

  // University of Cape Coast
  ucc: {
    name: 'University of Cape Coast',
    short_name: 'UCC',
    campus: 'Cape Coast, Central Region',
    website: 'https://www.ucc.edu.gh',
    phone: '+233-33-213-2550',
    email: 'admissions@ucc.edu.gh',
    established: 1971,
    
    application: {
      portal_url: 'https://admissions.ucc.edu.gh',
      application_deadline: '2025-04-30',
      result_date: '2025-07-31',
      status: 'OPEN',
      application_fee: 'GHS 220'
    },
    
    requirements: {
      minimum_subject_credits: 6,
      minimum_grade: 'C6'
    },
    
    programs: [
      {
        name: 'Education (All specializations)',
        duration: 4,
        category: 'Education',
        intake_2025: 300,
        tuition_per_year: 'GHS 6,500',
        job_prospects: 'EXCELLENT'
      },
      {
        name: 'Business Administration',
        duration: 4,
        category: 'Business',
        intake_2025: 200,
        tuition_per_year: 'GHS 6,500',
        job_prospects: 'EXCELLENT'
      },
      {
        name: 'Science Education',
        duration: 4,
        category: 'STEM/Education',
        intake_2025: 150,
        tuition_per_year: 'GHS 7,500',
        job_prospects: 'EXCELLENT'
      },
      {
        name: 'Agriculture',
        duration: 4,
        category: 'Agriculture',
        intake_2025: 80,
        tuition_per_year: 'GHS 7,000',
        job_prospects: 'GOOD'
      },
      {
        name: 'Nursing',
        duration: 4,
        category: 'Health Sciences',
        intake_2025: 100,
        tuition_per_year: 'GHS 8,500',
        job_prospects: 'EXCELLENT'
      }
    ],
    
    fees: {
      application_fee: 'GHS 220',
      registration_fee: 'GHS 500',
      tuition_per_year_range: 'GHS 6,500 - 8,500',
      accommodation_per_year: 'GHS 2,500 - 3,800',
      total_first_year_estimate: 'GHS 9,500 - 13,000'
    }
  },

  // University for Development Studies
  uds: {
    name: 'University for Development Studies',
    short_name: 'UDS',
    campus: 'Tamale, Northern Region',
    website: 'https://www.uds.edu.gh',
    phone: '+233-37-122-2444',
    email: 'admissions@uds.edu.gh',
    
    programs: [
      {
        name: 'Agriculture & Natural Resources',
        duration: 4,
        tuition_per_year: 'GHS 7,500',
        intake_2025: 120
      },
      {
        name: 'Development Studies',
        duration: 4,
        tuition_per_year: 'GHS 6,500',
        intake_2025: 100
      },
      {
        name: 'Medicine',
        duration: 6,
        tuition_per_year: 'GHS 16,000',
        intake_2025: 50
      }
    ]
  },

  // UPSA
  upsa: {
    name: 'University of Professional Studies, Accra',
    short_name: 'UPSA',
    campus: 'Accra',
    website: 'https://www.upsa.edu.gh',
    phone: '+233-30-389-6161',
    email: 'admissions@upsa.edu.gh',
    
    programs: [
      {
        name: 'Accounting',
        duration: 4,
        tuition_per_year: 'GHS 6,800',
        intake_2025: 200
      },
      {
        name: 'Business Administration',
        duration: 4,
        tuition_per_year: 'GHS 6,500',
        intake_2025: 180
      },
      {
        name: 'Information Technology',
        duration: 4,
        tuition_per_year: 'GHS 8,000',
        intake_2025: 150
      }
    ]
  },

  // Common Information
  common_info: {
    admission_cycle: '2025/2026',
    application_period: 'January - April 2025',
    results_announcement: 'June - July 2025',
    acceptance_period: 'July - August 2025',
    registration: 'August - September 2025',
    academic_year_start: '2025-09-01',
    
    general_requirements: {
      citizenship: 'Ghanaian or ECOWAS citizen',
      minimum_age: 'Usually 17+ (some exceptions for mature students)',
      health: 'Medical fitness certificate required',
      documentation: 'Birth certificate, National ID, School records'
    },
    
    eligibility_summary: {
      'Grade A1-B3': 'Eligible for any program',
      'Grade C1-C6': 'Eligible for most programs',
      'Grade D7-E8': 'Eligible for selected programs',
      'Grade F9': 'May apply, depends on program demand'
    },
    
    important_notes: [
      'Application fees are non-refundable',
      'Tuition fees may increase yearly (typically 10-15%)',
      'Accommodation is not mandatory - on-campus optional',
      'Students can defer admission by 1 year (with fee)',
      'Transfer between universities requires approval',
      'International students follow similar requirements but with additional documents'
    ]
  }
};

// Helper functions for accessing data
export function getUniversityByCode(code) {
  const universities = {
    'ug': admissionData2025_2026.ug,
    'knust': admissionData2025_2026.knust,
    'ucc': admissionData2025_2026.ucc,
    'uds': admissionData2025_2026.uds,
    'upsa': admissionData2025_2026.upsa
  };
  return universities[code.toLowerCase()];
}

export function getApplicationDeadlines() {
  return {
    'UG': admissionData2025_2026.ug.application.application_deadline,
    'KNUST': admissionData2025_2026.knust.application.application_deadline,
    'UCC': admissionData2025_2026.ucc.application.application_deadline,
    'UDS': admissionData2025_2026.uds.email ? '2025-04-30' : null
  };
}

export function searchPrograms(query, university = null) {
  const allPrograms = [];
  
  Object.values(admissionData2025_2026).forEach((uni, key) => {
    if (uni.programs) {
      uni.programs.forEach(prog => {
        allPrograms.push({
          university: uni.name,
          university_code: key,
          ...prog
        });
      });
    }
  });
  
  return allPrograms.filter(prog => {
    const matches = prog.name.toLowerCase().includes(query.toLowerCase()) ||
                   (prog.specializations?.some(s => s.toLowerCase().includes(query.toLowerCase())));
    
    if (university) {
      return matches && prog.university_code === university.toLowerCase();
    }
    return matches;
  });
}

export default admissionData2025_2026;
