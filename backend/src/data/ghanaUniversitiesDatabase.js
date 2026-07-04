/**
 * GHANA UNIVERSITIES DATABASE — 11 Partner Institutions
 * These are the only universities currently on the Glinax platform.
 */

export const ghanaUniversitiesDatabase = {

  "Kwame Nkrumah University of Science and Technology": {
    type: "public", location: "Kumasi", region: "Ashanti", established: 1952,
    specializations: ["Engineering", "Technology", "Architecture", "Sciences", "Medicine"],
    strength_areas: ["Technology Focus", "Engineering Excellence", "Industry Connections", "Innovation Hub"],
    programs: {
      "Computer Engineering":      { category: "STEM",           duration: 4, career_fields: ["Technology", "Engineering", "Software Development"] },
      "Civil Engineering":         { category: "STEM",           duration: 4, career_fields: ["Engineering", "Construction", "Infrastructure"] },
      "Architecture":              { category: "STEM",           duration: 5, career_fields: ["Architecture", "Design", "Urban Planning"] },
      "Medicine":                  { category: "Health Sciences", duration: 6, career_fields: ["Healthcare", "Medical Practice"] },
      "Mechanical Engineering":    { category: "STEM",           duration: 4, career_fields: ["Engineering", "Manufacturing", "Automotive"] },
      "Electrical Engineering":    { category: "STEM",           duration: 4, career_fields: ["Engineering", "Electronics", "Power Systems"] },
      "Agricultural Engineering":  { category: "Agriculture",    duration: 4, career_fields: ["Agriculture", "Engineering", "Farming Technology"] }
    }
  },

  "University of Ghana": {
    type: "public", location: "Legon, Accra", region: "Greater Accra", established: 1948,
    specializations: ["Liberal Arts", "Sciences", "Medicine", "Business", "Engineering", "Law"],
    strength_areas: ["Research Excellence", "Established Reputation", "Diverse Programs", "Central Location"],
    programs: {
      "Computer Science":        { category: "STEM",           duration: 4, career_fields: ["Technology", "Software Development", "IT"] },
      "Medicine":                { category: "Health Sciences", duration: 6, career_fields: ["Healthcare", "Medical Practice"] },
      "Business Administration": { category: "Business",       duration: 4, career_fields: ["Business", "Management", "Entrepreneurship"] },
      "Law":                     { category: "Social Sciences", duration: 4, career_fields: ["Legal Practice", "Law", "Justice"] },
      "Engineering":             { category: "STEM",           duration: 4, career_fields: ["Engineering", "Construction", "Infrastructure"] },
      "Psychology":              { category: "Social Sciences", duration: 4, career_fields: ["Mental Health", "Counseling", "Research"] },
      "Economics":               { category: "Social Sciences", duration: 4, career_fields: ["Economics", "Finance", "Policy"] }
    }
  },

  "University of Cape Coast": {
    type: "public", location: "Cape Coast", region: "Central", established: 1962,
    specializations: ["Education", "Business", "Social Sciences", "Health Sciences", "Agriculture"],
    strength_areas: ["Education Focus", "Research Opportunities", "Coastal Location", "Teacher Training"],
    programs: {
      "Education":            { category: "Education",       duration: 4, career_fields: ["Teaching", "Education", "Academia"] },
      "Nursing":              { category: "Health Sciences", duration: 4, career_fields: ["Healthcare", "Nursing", "Medical Care"] },
      "Business Administration": { category: "Business",    duration: 4, career_fields: ["Business", "Management"] },
      "Social Work":          { category: "Social Sciences", duration: 4, career_fields: ["Social Services", "Community Development"] },
      "Agriculture":          { category: "Agriculture",    duration: 4, career_fields: ["Agriculture", "Farming", "Agribusiness"] },
      "Environmental Science":{ category: "Sciences",       duration: 4, career_fields: ["Environment", "Conservation", "Research"] }
    }
  },

  "University for Development Studies": {
    type: "public", location: "Tamale", region: "Northern", established: 1992,
    specializations: ["Agriculture", "Development Studies", "Medicine", "Engineering", "Applied Sciences"],
    strength_areas: ["Community Development", "Agriculture Focus", "Northern Ghana", "Practical Training"],
    programs: {
      "Agriculture":           { category: "Agriculture",    duration: 4, career_fields: ["Agriculture", "Farming", "Food Production"] },
      "Medicine":              { category: "Health Sciences", duration: 6, career_fields: ["Healthcare", "Medical Practice"] },
      "Development Studies":   { category: "Social Sciences", duration: 4, career_fields: ["Development", "Policy", "Community Work"] },
      "Agricultural Engineering": { category: "Agriculture", duration: 4, career_fields: ["Agriculture", "Engineering", "Technology"] },
      "Nursing":               { category: "Health Sciences", duration: 4, career_fields: ["Healthcare", "Nursing"] },
      "Animal Science":        { category: "Agriculture",    duration: 4, career_fields: ["Agriculture", "Veterinary", "Animal Husbandry"] }
    }
  },

  "University of Energy and Natural Resources": {
    type: "public", location: "Sunyani", region: "Bono", established: 2011,
    specializations: ["Energy", "Natural Resources", "Environment", "Engineering"],
    strength_areas: ["Energy Focus", "Environmental Studies", "Sustainability", "Research"],
    programs: {
      "Renewable Energy Engineering": { category: "STEM",       duration: 4, career_fields: ["Energy", "Engineering", "Sustainability"] },
      "Environmental Science":        { category: "Sciences",   duration: 4, career_fields: ["Environment", "Conservation", "Research"] },
      "Forest Resources Management":  { category: "Agriculture", duration: 4, career_fields: ["Forestry", "Conservation", "Natural Resources"] },
      "Mining Engineering":           { category: "STEM",       duration: 4, career_fields: ["Mining", "Engineering", "Geology"] },
      "Petroleum Engineering":        { category: "STEM",       duration: 4, career_fields: ["Oil & Gas", "Engineering", "Energy"] }
    }
  },

  "University of Education, Winneba": {
    type: "public", location: "Winneba", region: "Central", established: 1992,
    specializations: ["Education", "Arts", "Sciences", "Social Studies"],
    strength_areas: ["Teacher Training", "Education Policy", "Community Outreach", "Arts & Culture"],
    programs: {
      "Basic Education":           { category: "Education",       duration: 4, career_fields: ["Teaching", "Primary Education", "Academia"] },
      "Science Education":         { category: "Education",       duration: 4, career_fields: ["Teaching", "Science", "STEM Education"] },
      "Physical Education":        { category: "Education",       duration: 4, career_fields: ["Sports", "Physical Education", "Health"] },
      "Business Education":        { category: "Education",       duration: 4, career_fields: ["Teaching", "Business", "Vocational Training"] },
      "Special Education":         { category: "Education",       duration: 4, career_fields: ["Special Needs", "Inclusive Education"] }
    }
  },

  "University of Mines and Technology": {
    type: "public", location: "Tarkwa", region: "Western", established: 2004,
    specializations: ["Mining Engineering", "Geological Engineering", "Environmental Engineering", "Computer Science"],
    strength_areas: ["Mining Expertise", "Industry Connections", "Practical Training", "Technical Focus"],
    programs: {
      "Mining Engineering":          { category: "STEM", duration: 4, career_fields: ["Mining", "Engineering", "Resources"] },
      "Geological Engineering":      { category: "STEM", duration: 4, career_fields: ["Geology", "Exploration", "Mining"] },
      "Environmental Engineering":   { category: "STEM", duration: 4, career_fields: ["Environment", "Engineering", "Sustainability"] },
      "Computer Science":            { category: "STEM", duration: 4, career_fields: ["Technology", "IT", "Software Development"] },
      "Mechanical Engineering":      { category: "STEM", duration: 4, career_fields: ["Engineering", "Manufacturing", "Mining Equipment"] }
    }
  },

  "University of Health and Allied Sciences": {
    type: "public", location: "Ho", region: "Volta", established: 2011,
    specializations: ["Medicine", "Nursing", "Public Health", "Allied Health Sciences"],
    strength_areas: ["Health Focus", "Medical Training", "Research", "Community Health"],
    programs: {
      "Medicine":                    { category: "Health Sciences", duration: 6, career_fields: ["Healthcare", "Medical Practice"] },
      "Nursing":                     { category: "Health Sciences", duration: 4, career_fields: ["Healthcare", "Nursing"] },
      "Public Health":               { category: "Health Sciences", duration: 4, career_fields: ["Public Health", "Healthcare Policy"] },
      "Physician Assistant Studies": { category: "Health Sciences", duration: 4, career_fields: ["Healthcare", "Medical Assistance"] },
      "Biomedical Sciences":         { category: "Health Sciences", duration: 4, career_fields: ["Research", "Laboratory", "Healthcare"] },
      "Physiotherapy":               { category: "Health Sciences", duration: 4, career_fields: ["Healthcare", "Rehabilitation", "Therapy"] }
    }
  },

  "Ghana Communication Technology University": {
    type: "public", location: "Accra", region: "Greater Accra", established: 2005,
    specializations: ["ICT", "Communication Studies", "Business", "Engineering"],
    strength_areas: ["Technology Training", "Industry Focus", "Practical Skills", "ICT Hub"],
    programs: {
      "Computer Science":              { category: "STEM",     duration: 4, career_fields: ["Technology", "Software Development", "IT"] },
      "Information Technology":        { category: "STEM",     duration: 4, career_fields: ["IT", "Technology", "Systems"] },
      "Telecommunications Engineering":{ category: "STEM",     duration: 4, career_fields: ["Engineering", "Telecommunications", "Technology"] },
      "Business Information Technology":{ category: "Business", duration: 4, career_fields: ["IT", "Business", "Technology Management"] },
      "Communication Studies":         { category: "Humanities", duration: 4, career_fields: ["Media", "Communications", "Journalism"] }
    }
  },

  "Takoradi Technical University": {
    type: "public", location: "Takoradi", region: "Western", established: 1954,
    specializations: ["Engineering", "Built Environment", "Applied Sciences", "Business"],
    strength_areas: ["Technical Training", "Practical Focus", "Industry Linkages", "Western Region"],
    programs: {
      "Mechanical Engineering Technology": { category: "STEM",     duration: 4, career_fields: ["Engineering", "Manufacturing", "Automotive"] },
      "Civil Engineering Technology":      { category: "STEM",     duration: 4, career_fields: ["Engineering", "Construction", "Infrastructure"] },
      "Electrical Engineering Technology": { category: "STEM",     duration: 4, career_fields: ["Engineering", "Electronics", "Power"] },
      "Petroleum Engineering":             { category: "STEM",     duration: 4, career_fields: ["Oil & Gas", "Engineering", "Energy"] },
      "Hospitality Management":            { category: "Business",  duration: 4, career_fields: ["Hospitality", "Tourism", "Management"] }
    }
  },

  "University of Professional Studies, Accra": {
    type: "public", location: "Accra", region: "Greater Accra", established: 1965,
    specializations: ["Business", "Management", "Accounting", "Marketing", "Public Administration"],
    strength_areas: ["Professional Training", "Business Focus", "Industry Partnerships", "Practical Skills"],
    programs: {
      "Accounting":                { category: "Business",       duration: 4, career_fields: ["Accounting", "Finance", "Auditing"] },
      "Marketing":                 { category: "Business",       duration: 4, career_fields: ["Marketing", "Sales", "Brand Management"] },
      "Human Resource Management": { category: "Business",       duration: 4, career_fields: ["HR", "Management", "Recruitment"] },
      "Public Administration":     { category: "Social Sciences", duration: 4, career_fields: ["Government", "Public Service", "Policy"] },
      "Banking and Finance":       { category: "Business",       duration: 4, career_fields: ["Banking", "Finance", "Investment"] },
      "Supply Chain Management":   { category: "Business",       duration: 4, career_fields: ["Logistics", "Operations", "Management"] }
    }
  }

};

export function getAllUniversities() {
  return Object.entries(ghanaUniversitiesDatabase).map(([name, data]) => ({ name, ...data }));
}

export function getUniversitiesByType(type) {
  return getAllUniversities().filter(u => u.type === type);
}

export function getUniversitiesByRegion(region) {
  return getAllUniversities().filter(u => u.region === region);
}

export function getUniversitiesByProgramCategory(category) {
  return getAllUniversities().filter(u =>
    Object.values(u.programs || {}).some(p => p.category === category)
  );
}

export default ghanaUniversitiesDatabase;
