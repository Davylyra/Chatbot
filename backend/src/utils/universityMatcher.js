/**
 * ASSESSMENT-DRIVEN UNIVERSITY MATCHING ENGINE
 * Created: January 4, 2026
 * Purpose: Eliminate bias and provide fair, personalized university recommendations
 * 
 * This module scores ALL universities based purely on assessment data:
 * - Subjects studied
 * - SHS program
 * - WASSCE grade
 * - Interests
 * - Career goals
 * - Preferred location
 * - Financial situation
 */

import { ghanaUniversitiesDatabase, getAllUniversities } from '../data/ghanaUniversitiesDatabase.js';

/**
 * Main matching function - completely assessment-driven
 */
export function matchUniversitiesToProfile(assessmentData) {
  const allUniversities = getAllUniversities();
  const scoredUniversities = [];

  for (const university of allUniversities) {
    const score = calculateUniversityMatchScore(university, assessmentData);
    
    if (score.totalScore > 30) { // Only include relevant matches (>30%)
      scoredUniversities.push({
        universityName: university.name,
        matchScore: score.totalScore,
        matchBreakdown: score.breakdown,
        reasoning: generateReasoningForMatch(university, assessmentData, score),
        recommendedPrograms: findBestProgramsForUser(university, assessmentData),
        strengths: university.strength_areas,
        location: `${university.location}, ${university.region} Region`,
        type: university.type,
        established: university.established
      });
    }
  }

  // Sort by match score (highest first)
  scoredUniversities.sort((a, b) => b.matchScore - a.matchScore);

  return scoredUniversities;
}

/**
 * Calculate match score between university and user profile
 * Returns score from 0-100 based purely on assessment data
 */
function calculateUniversityMatchScore(university, assessmentData) {
  const breakdown = {
    careerAlignment: 0,
    subjectAlignment: 0,
    programAvailability: 0,
    locationPreference: 0,
    shsProgramFit: 0,
    gradeCompatibility: 0,
    interestMatch: 0,
    financialFit: 0
  };

  // 1. Career Goals Alignment (25 points) - HIGHEST WEIGHT
  if (assessmentData.careerGoals) {
    const careerKeywords = assessmentData.careerGoals.toLowerCase();
    
    // Special handling for health sciences careers
    let careerMatches = 0;
    
    if (careerKeywords.includes('medicine') || careerKeywords.includes('health') || careerKeywords.includes('medical')) {
      // For health careers, prioritize health sciences programs
      const healthPrograms = Object.values(university.programs || {}).filter(p => p.category === 'Health Sciences');
      careerMatches = Math.min(5, healthPrograms.length);
      
      // Extra boost for UHAS and universities with strong health focus
      if (university.name === 'University of Health and Allied Sciences' || university.name.includes('Health')) {
        careerMatches = 5; // Maximum for health-specialized institutions
      }
    } else {
      // For other careers, do standard matching
      const matchingPrograms = Object.values(university.programs || {}).filter(program =>
        program.career_fields.some(field => 
          careerKeywords.includes(field.toLowerCase()) ||
          field.toLowerCase().includes(careerKeywords.split(' ')[0])
        )
      );
      careerMatches = Math.min(5, matchingPrograms.length);
    }
    
    breakdown.careerAlignment = careerMatches * 5; // Up to 25 points
  }

  // 2. Subject Alignment (20 points)
  if (assessmentData.subjects && assessmentData.subjects.length > 0) {
    const subjects = assessmentData.subjects.map(s => s.toLowerCase());
    
    // Check if university offers programs matching these subjects
    const stemSubjects = ['mathematics', 'physics', 'chemistry', 'biology', 'elective math'];
    const businessSubjects = ['economics', 'business', 'accounting', 'costing'];
    const artsSubjects = ['literature', 'history', 'geography', 'french', 'government'];
    const techSubjects = ['technical drawing', 'graphic design', 'metalwork', 'woodwork'];
    const healthSubjects = ['biology', 'chemistry', 'physics', 'mathematics'];
    
    const hasStem = subjects.some(s => stemSubjects.includes(s));
    const hasBusiness = subjects.some(s => businessSubjects.includes(s));
    const hasArts = subjects.some(s => artsSubjects.includes(s));
    const hasTech = subjects.some(s => techSubjects.includes(s));
    const hasHealthSubjects = subjects.some(s => healthSubjects.includes(s));
    
    const programCategories = Object.values(university.programs || {}).map(p => p.category);
    
    if (hasStem && programCategories.includes('STEM')) breakdown.subjectAlignment += 10;
    if (hasBusiness && programCategories.includes('Business')) breakdown.subjectAlignment += 10;
    if (hasArts && programCategories.includes('Social Sciences')) breakdown.subjectAlignment += 8;
    if (hasTech && programCategories.includes('STEM')) breakdown.subjectAlignment += 8;
    if (hasHealthSubjects && programCategories.includes('Health Sciences')) breakdown.subjectAlignment += 12;
    
    // Maximum 20 points
    breakdown.subjectAlignment = Math.min(20, breakdown.subjectAlignment);
  }

  // 3. Program Availability (15 points)
  const availablePrograms = Object.keys(university.programs || {}).length;
  breakdown.programAvailability = Math.min(15, availablePrograms * 2);

  // 4. Location Preference (15 points)
  if (assessmentData.preferredLocation) {
    const locationPref = assessmentData.preferredLocation.toLowerCase();
    const uniLocation = `${university.location} ${university.region}`.toLowerCase();
    
    if (uniLocation.includes(locationPref) || locationPref.includes(university.region.toLowerCase())) {
      breakdown.locationPreference = 15;
    } else if (locationPref === 'any' || locationPref === 'flexible') {
      breakdown.locationPreference = 8;
    }
  } else {
    // No location preference = treat all equally
    breakdown.locationPreference = 8;
  }

  // 5. SHS Program Fit (10 points)
  if (assessmentData.shsProgram) {
    const program = assessmentData.shsProgram.toLowerCase();
    
    const programMapping = {
      'general science': ['STEM', 'Health Sciences', 'Sciences'],
      'business': ['Business'],
      'general arts': ['Social Sciences', 'Humanities', 'Education'],
      'home economics': ['Health Sciences', 'Social Sciences'],
      'visual arts': ['Humanities', 'Social Sciences'],
      'agricultural science': ['Agriculture'],
      'technical': ['STEM', 'Engineering'],
      'health': ['Health Sciences', 'Medicine'],
      'health sciences': ['Health Sciences', 'Medicine']
    };
    
    const matchingCategories = programMapping[program] || [];
    const programCategories = Object.values(university.programs || {}).map(p => p.category);
    
    const matches = matchingCategories.filter(cat => programCategories.includes(cat));
    breakdown.shsProgramFit = Math.min(10, matches.length * 5);
  }

  // 6. Grade Compatibility (10 points)
  if (assessmentData.wassceGrade) {
    const grade = assessmentData.wassceGrade.trim();
    
    // All universities accept varying grades, give points based on competitiveness
    // Higher grades = more options, but don't exclude any university
    if (grade.match(/^[A-C]/i)) {
      breakdown.gradeCompatibility = 10; // Excellent grades - all options
    } else if (grade.match(/^[D-E]/i)) {
      breakdown.gradeCompatibility = 8; // Good grades - most options
    } else {
      breakdown.gradeCompatibility = 6; // Average grades - still many options
    }
  } else {
    breakdown.gradeCompatibility = 7; // No grade provided - assume average
  }

  // 7. Interest Match (8 points)
  if (assessmentData.interests && assessmentData.interests.length > 0) {
    const interests = assessmentData.interests.map(i => i.toLowerCase());
    const specializationsMatch = university.specializations.some(spec =>
      interests.some(interest => 
        spec.toLowerCase().includes(interest) || interest.includes(spec.toLowerCase().split(' ')[0])
      )
    );
    
    if (specializationsMatch) {
      breakdown.interestMatch = 8;
    } else {
      breakdown.interestMatch = 3; // Partial credit
    }
  }

  // 8. Financial Fit (7 points)
  if (assessmentData.financialSituation) {
    if (assessmentData.financialSituation === 'need_scholarship') {
      // Public universities typically more affordable
      if (university.type === 'public') {
        breakdown.financialFit = 7;
      } else {
        breakdown.financialFit = 3;
      }
    } else if (assessmentData.financialSituation === 'comfortable') {
      // Can afford any university
      breakdown.financialFit = 7;
    } else {
      breakdown.financialFit = 5;
    }
  } else {
    breakdown.financialFit = 5; // Neutral
  }

  // Calculate total score
  const totalScore = Math.round(
    breakdown.careerAlignment +
    breakdown.subjectAlignment +
    breakdown.programAvailability +
    breakdown.locationPreference +
    breakdown.shsProgramFit +
    breakdown.gradeCompatibility +
    breakdown.interestMatch +
    breakdown.financialFit
  );

  return {
    totalScore: Math.min(100, totalScore),
    breakdown
  };
}

/**
 * Find best programs for user within a university
 */
function findBestProgramsForUser(university, assessmentData) {
  const programs = university.programs || {};
  const scoredPrograms = [];

  for (const [programName, programData] of Object.entries(programs)) {
    let score = 0;

    // Match against career goals
    if (assessmentData.careerGoals) {
      const careerLower = assessmentData.careerGoals.toLowerCase();
      if (programData.career_fields.some(field => 
        careerLower.includes(field.toLowerCase()) || field.toLowerCase().includes(careerLower)
      )) {
        score += 50;
      }
    }

    // Match against interests
    if (assessmentData.interests) {
      if (assessmentData.interests.some(interest =>
        programName.toLowerCase().includes(interest.toLowerCase()) ||
        programData.career_fields.some(field => field.toLowerCase().includes(interest.toLowerCase()))
      )) {
        score += 30;
      }
    }

    // Match against subjects
    if (assessmentData.subjects) {
      const subjectsLower = assessmentData.subjects.map(s => s.toLowerCase());
      
      if (programData.category === 'STEM' && subjectsLower.some(s => 
        ['mathematics', 'physics', 'chemistry', 'biology'].includes(s)
      )) {
        score += 20;
      }
      
      if (programData.category === 'Business' && subjectsLower.some(s =>
        ['economics', 'business', 'accounting'].includes(s)
      )) {
        score += 20;
      }
    }

    if (score > 0) {
      scoredPrograms.push({
        name: programName,
        category: programData.category,
        duration: programData.duration,
        careerFields: programData.career_fields,
        score
      });
    }
  }

  // Sort by score and return top 3
  scoredPrograms.sort((a, b) => b.score - a.score);
  return scoredPrograms.slice(0, 3);
}

/**
 * Generate human-readable reasoning for match
 */
function generateReasoningForMatch(university, assessmentData, scoreData) {
  const reasons = [];

  // Career alignment
  if (scoreData.breakdown.careerAlignment >= 15) {
    reasons.push(`Strong alignment with your career goals in ${assessmentData.careerGoals || 'your chosen field'}`);
  }

  // Subject match
  if (scoreData.breakdown.subjectAlignment >= 12) {
    reasons.push(`Offers programs matching your subject background in ${assessmentData.subjects?.slice(0, 2).join(', ') || 'key areas'}`);
  }

  // SHS program fit
  if (scoreData.breakdown.shsProgramFit >= 7) {
    reasons.push(`Well-suited for ${assessmentData.shsProgram || 'your'} SHS program graduates`);
  }

  // Location
  if (scoreData.breakdown.locationPreference >= 10) {
    reasons.push(`Located in your preferred region (${university.region})`);
  }

  // Financial
  if (scoreData.breakdown.financialFit >= 6 && assessmentData.financialSituation === 'need_scholarship') {
    if (university.type === 'public') {
      reasons.push('Public university with generally lower fees and scholarship opportunities');
    }
  }

  // Strength areas
  if (university.strength_areas && university.strength_areas.length > 0) {
    reasons.push(`Known for ${university.strength_areas.slice(0, 2).join(' and ')}`);
  }

  if (reasons.length === 0) {
    reasons.push(`Offers relevant programs and established in ${university.established}`);
  }

  return reasons.join('. ');
}

/**
 * Get top N university matches
 */
export function getTopUniversityMatches(assessmentData, topN = 5) {
  const allMatches = matchUniversitiesToProfile(assessmentData);
  return allMatches.slice(0, topN);
}

/**
 * Get university matches by minimum score threshold
 */
export function getUniversityMatchesByThreshold(assessmentData, minScore = 50) {
  const allMatches = matchUniversitiesToProfile(assessmentData);
  return allMatches.filter(match => match.matchScore >= minScore);
}

export default {
  matchUniversitiesToProfile,
  getTopUniversityMatches,
  getUniversityMatchesByThreshold,
  calculateUniversityMatchScore,
  findBestProgramsForUser
};
