/**
 * COMPREHENSIVE GHANA UNIVERSITIES DATABASE
 * Created: January 4, 2026
 * Purpose: Unbiased, complete database of Ghanaian universities for fair recommendations
 * 
 * This database ensures ALL universities are treated equally in recommendation algorithms
 * Each university has complete program details, requirements, and specializations
 */

export const ghanaUniversitiesDatabase = {
  // PUBLIC UNIVERSITIES
  "University of Ghana": {
    type: "public",
    location: "Legon, Accra",
    region: "Greater Accra",
    established: 1948,
    specializations: ["Liberal Arts", "Sciences", "Medicine", "Business", "Engineering", "Law"],
    strength_areas: ["Research Excellence", "Established Reputation", "Diverse Programs", "Central Location"],
    programs: {
      "Computer Science": { category: "STEM", duration: 4, career_fields: ["Technology", "Software Development", "IT"] },
      "Medicine": { category: "Health Sciences", duration: 6, career_fields: ["Healthcare", "Medical Practice"] },
      "Business Administration": { category: "Business", duration: 4, career_fields: ["Business", "Management", "Entrepreneurship"] },
      "Law": { category: "Social Sciences", duration: 4, career_fields: ["Legal Practice", "Law", "Justice"] },
      "Engineering": { category: "STEM", duration: 4, career_fields: ["Engineering", "Construction", "Infrastructure"] },
      "Psychology": { category: "Social Sciences", duration: 4, career_fields: ["Mental Health", "Counseling", "Research"] },
      "Economics": { category: "Social Sciences", duration: 4, career_fields: ["Economics", "Finance", "Policy"] }
    }
  },

  "Kwame Nkrumah University of Science and Technology": {
    type: "public",
    location: "Kumasi",
    region: "Ashanti",
    established: 1952,
    specializations: ["Engineering", "Technology", "Architecture", "Sciences", "Medicine"],
    strength_areas: ["Technology Focus", "Engineering Excellence", "Industry Connections", "Innovation Hub"],
    programs: {
      "Computer Engineering": { category: "STEM", duration: 4, career_fields: ["Technology", "Engineering", "Software Development"] },
      "Civil Engineering": { category: "STEM", duration: 4, career_fields: ["Engineering", "Construction", "Infrastructure"] },
      "Architecture": { category: "STEM", duration: 5, career_fields: ["Architecture", "Design", "Urban Planning"] },
      "Medicine": { category: "Health Sciences", duration: 6, career_fields: ["Healthcare", "Medical Practice"] },
      "Mechanical Engineering": { category: "STEM", duration: 4, career_fields: ["Engineering", "Manufacturing", "Automotive"] },
      "Electrical Engineering": { category: "STEM", duration: 4, career_fields: ["Engineering", "Electronics", "Power Systems"] },
      "Agricultural Engineering": { category: "Agriculture", duration: 4, career_fields: ["Agriculture", "Engineering", "Farming Technology"] }
    }
  },

  "University of Cape Coast": {
    type: "public",
    location: "Cape Coast",
    region: "Central",
    established: 1962,
    specializations: ["Education", "Business", "Social Sciences", "Health Sciences", "Agriculture"],
    strength_areas: ["Education Focus", "Research Opportunities", "Coastal Location", "Teacher Training"],
    programs: {
      "Education (All Levels)": { category: "Education", duration: 4, career_fields: ["Teaching", "Education", "Academia"] },
      "Nursing": { category: "Health Sciences", duration: 4, career_fields: ["Healthcare", "Nursing", "Medical Care"] },
      "Business Administration": { category: "Business", duration: 4, career_fields: ["Business", "Management"] },
      "Social Work": { category: "Social Sciences", duration: 4, career_fields: ["Social Services", "Community Development"] },
      "Agriculture": { category: "Agriculture", duration: 4, career_fields: ["Agriculture", "Farming", "Agribusiness"] },
      "Tourism Management": { category: "Hospitality", duration: 4, career_fields: ["Tourism", "Hospitality", "Travel"] },
      "Environmental Science": { category: "Sciences", duration: 4, career_fields: ["Environment", "Conservation", "Research"] }
    }
  },

  "University for Development Studies": {
    type: "public",
    location: "Tamale",
    region: "Northern",
    established: 1992,
    specializations: ["Agriculture", "Development Studies", "Medicine", "Engineering", "Applied Sciences"],
    strength_areas: ["Community Development", "Agriculture Focus", "Northern Ghana", "Practical Training"],
    programs: {
      "Agriculture": { category: "Agriculture", duration: 4, career_fields: ["Agriculture", "Farming", "Food Production"] },
      "Medicine": { category: "Health Sciences", duration: 6, career_fields: ["Healthcare", "Medical Practice"] },
      "Development Studies": { category: "Social Sciences", duration: 4, career_fields: ["Development", "Policy", "Community Work"] },
      "Agricultural Engineering": { category: "Agriculture", duration: 4, career_fields: ["Agriculture", "Engineering", "Technology"] },
      "Nursing": { category: "Health Sciences", duration: 4, career_fields: ["Healthcare", "Nursing"] },
      "Environmental Science": { category: "Sciences", duration: 4, career_fields: ["Environment", "Conservation"] },
      "Animal Science": { category: "Agriculture", duration: 4, career_fields: ["Agriculture", "Veterinary", "Animal Husbandry"] }
    }
  },

  "University of Professional Studies": {
    type: "public",
    location: "Accra",
    region: "Greater Accra",
    established: 1965,
    specializations: ["Business", "Management", "Accounting", "Marketing", "Public Administration"],
    strength_areas: ["Professional Training", "Business Focus", "Industry Partnerships", "Practical Skills"],
    programs: {
      "Accounting": { category: "Business", duration: 4, career_fields: ["Accounting", "Finance", "Auditing"] },
      "Marketing": { category: "Business", duration: 4, career_fields: ["Marketing", "Sales", "Brand Management"] },
      "Human Resource Management": { category: "Business", duration: 4, career_fields: ["HR", "Management", "Recruitment"] },
      "Public Administration": { category: "Social Sciences", duration: 4, career_fields: ["Government", "Public Service", "Policy"] },
      "Banking and Finance": { category: "Business", duration: 4, career_fields: ["Banking", "Finance", "Investment"] },
      "Supply Chain Management": { category: "Business", duration: 4, career_fields: ["Logistics", "Operations", "Management"] }
    }
  },

  "University of Energy and Natural Resources": {
    type: "public",
    location: "Sunyani",
    region: "Bono",
    established: 2011,
    specializations: ["Energy", "Natural Resources", "Environment", "Engineering"],
    strength_areas: ["Energy Focus", "Environmental Studies", "Sustainability", "Research"],
    programs: {
      "Renewable Energy Engineering": { category: "STEM", duration: 4, career_fields: ["Energy", "Engineering", "Sustainability"] },
      "Environmental Science": { category: "Sciences", duration: 4, career_fields: ["Environment", "Conservation", "Research"] },
      "Forest Resources Management": { category: "Agriculture", duration: 4, career_fields: ["Forestry", "Conservation", "Natural Resources"] },
      "Mining Engineering": { category: "STEM", duration: 4, career_fields: ["Mining", "Engineering", "Geology"] },
      "Petroleum Engineering": { category: "STEM", duration: 4, career_fields: ["Oil & Gas", "Engineering", "Energy"] }
    }
  },

  "University of Health and Allied Sciences": {
    type: "public",
    location: "Ho",
    region: "Volta",
    established: 2011,
    specializations: ["Medicine", "Nursing", "Public Health", "Allied Health Sciences"],
    strength_areas: ["Health Focus", "Medical Training", "Research", "Community Health"],
    programs: {
      "Medicine": { category: "Health Sciences", duration: 6, career_fields: ["Healthcare", "Medical Practice"] },
      "Nursing": { category: "Health Sciences", duration: 4, career_fields: ["Healthcare", "Nursing"] },
      "Public Health": { category: "Health Sciences", duration: 4, career_fields: ["Public Health", "Healthcare Policy"] },
      "Physician Assistant Studies": { category: "Health Sciences", duration: 4, career_fields: ["Healthcare", "Medical Assistance"] },
      "Biomedical Sciences": { category: "Health Sciences", duration: 4, career_fields: ["Research", "Laboratory", "Healthcare"] },
      "Physiotherapy": { category: "Health Sciences", duration: 4, career_fields: ["Healthcare", "Rehabilitation", "Therapy"] }
    }
  },

  "Ashesi University": {
    type: "private",
    location: "Berekuso, Eastern Region",
    region: "Eastern",
    established: 2002,
    specializations: ["Computer Science", "Engineering", "Business", "Liberal Arts"],
    strength_areas: ["Innovation", "Entrepreneurship", "Liberal Arts Education", "Technology"],
    programs: {
      "Computer Science": { category: "STEM", duration: 4, career_fields: ["Technology", "Software Development", "IT"] },
      "Electrical and Electronic Engineering": { category: "STEM", duration: 4, career_fields: ["Engineering", "Electronics", "Technology"] },
      "Mechanical Engineering": { category: "STEM", duration: 4, career_fields: ["Engineering", "Manufacturing"] },
      "Business Administration": { category: "Business", duration: 4, career_fields: ["Business", "Entrepreneurship", "Management"] },
      "Management Information Systems": { category: "STEM", duration: 4, career_fields: ["IT", "Business", "Technology"] }
    }
  },

  "Ghana Institute of Management and Public Administration": {
    type: "public",
    location: "Accra",
    region: "Greater Accra",
    established: 1961,
    specializations: ["Public Administration", "Management", "Governance", "Policy"],
    strength_areas: ["Public Sector Training", "Policy Focus", "Leadership", "Governance"],
    programs: {
      "Public Administration": { category: "Social Sciences", duration: 4, career_fields: ["Government", "Public Service", "Administration"] },
      "Public Management": { category: "Social Sciences", duration: 4, career_fields: ["Management", "Public Sector", "Leadership"] },
      "Development Management": { category: "Social Sciences", duration: 4, career_fields: ["Development", "Policy", "NGOs"] },
      "Local Government Management": { category: "Social Sciences", duration: 4, career_fields: ["Government", "Local Administration"] }
    }
  },

  "Ghana Technology University College": {
    type: "private",
    location: "Accra",
    region: "Greater Accra",
    established: 2005,
    specializations: ["Technology", "Computer Science", "Engineering", "Business"],
    strength_areas: ["Technology Training", "Industry Focus", "Practical Skills"],
    programs: {
      "Computer Science": { category: "STEM", duration: 4, career_fields: ["Technology", "Software Development", "IT"] },
      "Information Technology": { category: "STEM", duration: 4, career_fields: ["IT", "Technology", "Systems"] },
      "Telecommunications Engineering": { category: "STEM", duration: 4, career_fields: ["Engineering", "Telecommunications", "Technology"] },
      "Business Information Technology": { category: "Business", duration: 4, career_fields: ["IT", "Business", "Technology Management"] }
    }
  },

  "Central University": {
    type: "private",
    location: "Accra",
    region: "Greater Accra",
    established: 1988,
    specializations: ["Theology", "Business", "Computing", "Education", "Health Sciences"],
    strength_areas: ["Christian Values", "Holistic Education", "Diverse Programs"],
    programs: {
      "Theology": { category: "Humanities", duration: 4, career_fields: ["Ministry", "Religious Leadership", "Teaching"] },
      "Business Administration": { category: "Business", duration: 4, career_fields: ["Business", "Management"] },
      "Nursing": { category: "Health Sciences", duration: 4, career_fields: ["Healthcare", "Nursing"] },
      "Computer Science": { category: "STEM", duration: 4, career_fields: ["Technology", "IT"] },
      "Education": { category: "Education", duration: 4, career_fields: ["Teaching", "Education"] }
    }
  },

  "Valley View University": {
    type: "private",
    location: "Accra",
    region: "Greater Accra",
    established: 1979,
    specializations: ["Business", "Theology", "Nursing", "Computing"],
    strength_areas: ["Values-Based Education", "Healthcare", "Technology"],
    programs: {
      "Nursing": { category: "Health Sciences", duration: 4, career_fields: ["Healthcare", "Nursing"] },
      "Business Administration": { category: "Business", duration: 4, career_fields: ["Business", "Management"] },
      "Information Technology": { category: "STEM", duration: 4, career_fields: ["IT", "Technology"] },
      "Theology": { category: "Humanities", duration: 4, career_fields: ["Ministry", "Religious Studies"] }
    }
  },

  "Academic City University College": {
    type: "private",
    location: "Accra",
    region: "Greater Accra",
    established: 2016,
    specializations: ["Engineering", "Computing", "Business"],
    strength_areas: ["Modern Curriculum", "Technology Focus", "Industry Partnerships"],
    programs: {
      "Computer Engineering": { category: "STEM", duration: 4, career_fields: ["Engineering", "Technology"] },
      "Electrical Engineering": { category: "STEM", duration: 4, career_fields: ["Engineering", "Electronics"] },
      "Business Administration": { category: "Business", duration: 4, career_fields: ["Business", "Entrepreneurship"] }
    }
  },

  "Methodist University College": {
    type: "private",
    location: "Dansoman, Accra",
    region: "Greater Accra",
    established: 2000,
    specializations: ["Business", "Social Sciences", "Education"],
    strength_areas: ["Christian Ethics", "Community Focus", "Holistic Education"],
    programs: {
      "Business Administration": { category: "Business", duration: 4, career_fields: ["Business", "Management"] },
      "Education": { category: "Education", duration: 4, career_fields: ["Teaching", "Education"] },
      "Social Work": { category: "Social Sciences", duration: 4, career_fields: ["Social Services", "Community Development"] }
    }
  },

  "Presbyterian University College": {
    type: "private",
    location: "Abetifi, Eastern Region",
    region: "Eastern",
    established: 2003,
    specializations: ["Business", "Theology", "Health Sciences", "Agriculture"],
    strength_areas: ["Rural Development", "Values Education", "Community Service"],
    programs: {
      "Nursing": { category: "Health Sciences", duration: 4, career_fields: ["Healthcare", "Nursing"] },
      "Agribusiness": { category: "Agriculture", duration: 4, career_fields: ["Agriculture", "Business", "Farming"] },
      "Business Administration": { category: "Business", duration: 4, career_fields: ["Business", "Management"] },
      "Theology": { category: "Humanities", duration: 4, career_fields: ["Ministry", "Religious Studies"] }
    }
  }
};

/**
 * Get all universities as an array
 */
export function getAllUniversities() {
  return Object.entries(ghanaUniversitiesDatabase).map(([name, data]) => ({
    name,
    ...data
  }));
}

/**
 * Get universities by type
 */
export function getUniversitiesByType(type) {
  return getAllUniversities().filter(uni => uni.type === type);
}

/**
 * Get universities by region
 */
export function getUniversitiesByRegion(region) {
  return getAllUniversities().filter(uni => uni.region === region);
}

/**
 * Get universities offering a specific program category
 */
export function getUniversitiesByProgramCategory(category) {
  return getAllUniversities().filter(uni => {
    return Object.values(uni.programs || {}).some(program => 
      program.category === category
    );
  });
}

/**
 * Get universities offering programs for a specific career field
 */
export function getUniversitiesByCareerField(careerField) {
  const searchTerm = careerField.toLowerCase();
  return getAllUniversities().filter(uni => {
    return Object.values(uni.programs || {}).some(program =>
      program.career_fields.some(field => field.toLowerCase().includes(searchTerm))
    );
  });
}

export default ghanaUniversitiesDatabase;
