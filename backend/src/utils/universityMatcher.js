import { ghanaUniversitiesDatabase, getAllUniversities } from '../data/ghanaUniversitiesDatabase.js';

export function matchUniversitiesToProfile(studentProfile) {
  const matchedUniversities = getAllUniversities()
    .map(institution => {
      const score = calculateUniversityMatchScore(institution, studentProfile);
      if (score.totalScore <= 30) return null;

      return {
        universityName: institution.name,
        matchScore: score.totalScore,
        matchBreakdown: score.breakdown,
        reasoning: generateReasoningForMatch(institution, studentProfile, score),
        recommendedPrograms: findBestProgramsForUser(institution, studentProfile),
        strengths: institution.strength_areas,
        location: `${institution.location}, ${institution.region} Region`,
        type: institution.type,
        established: institution.established
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.matchScore - a.matchScore);

  return matchedUniversities;
}

function calculateUniversityMatchScore(institution, studentProfile) {
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

  if (studentProfile.careerGoals) {
    const careerKeywords = studentProfile.careerGoals.toLowerCase();
    
    if (careerKeywords.includes('medicine') || careerKeywords.includes('health') || careerKeywords.includes('medical')) {
      const healthPrograms = Object.values(institution.programs || {}).filter(p => p.category === 'Health Sciences');
      breakdown.careerAlignment = Math.min(25, (institution.name.includes('Health') ? 5 : healthPrograms.length) * 5);
    } else {
      const matchingPrograms = Object.values(institution.programs || {}).filter(program =>
        program.career_fields.some(field => 
          careerKeywords.includes(field.toLowerCase()) || field.toLowerCase().includes(careerKeywords.split(' ')[0])
        )
      );
      breakdown.careerAlignment = Math.min(25, matchingPrograms.length * 5);
    }
  }

  if (studentProfile.subjects?.length) {
    const subjects = studentProfile.subjects.map(s => s.toLowerCase());
    
    const stemSubjects = ['mathematics', 'physics', 'chemistry', 'biology', 'elective math'];
    const businessSubjects = ['economics', 'business', 'accounting', 'costing'];
    const artsSubjects = ['literature', 'history', 'geography', 'french', 'government'];
    const techSubjects = ['technical drawing', 'graphic design', 'metalwork', 'woodwork'];
    const healthSubjects = ['biology', 'chemistry', 'physics', 'mathematics'];
    
    const programCategories = Object.values(institution.programs || {}).map(p => p.category);
    
    if (subjects.some(s => stemSubjects.includes(s)) && programCategories.includes('STEM')) breakdown.subjectAlignment += 10;
    if (subjects.some(s => businessSubjects.includes(s)) && programCategories.includes('Business')) breakdown.subjectAlignment += 10;
    if (subjects.some(s => artsSubjects.includes(s)) && programCategories.includes('Social Sciences')) breakdown.subjectAlignment += 8;
    if (subjects.some(s => techSubjects.includes(s)) && programCategories.includes('STEM')) breakdown.subjectAlignment += 8;
    if (subjects.some(s => healthSubjects.includes(s)) && programCategories.includes('Health Sciences')) breakdown.subjectAlignment += 12;
    
    breakdown.subjectAlignment = Math.min(20, breakdown.subjectAlignment);
  }

  breakdown.programAvailability = Math.min(15, Object.keys(institution.programs || {}).length * 2);

  if (studentProfile.preferredLocation) {
    const locationPref = studentProfile.preferredLocation.toLowerCase();
    const uniLocation = `${institution.location} ${institution.region}`.toLowerCase();
    
    if (uniLocation.includes(locationPref) || locationPref.includes(institution.region.toLowerCase())) {
      breakdown.locationPreference = 15;
    } else if (locationPref === 'any' || locationPref === 'flexible') {
      breakdown.locationPreference = 8;
    }
  } else {
    breakdown.locationPreference = 8;
  }

  if (studentProfile.shsProgram) {
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
    
    const matchingCategories = programMapping[studentProfile.shsProgram.toLowerCase()] || [];
    const programCategories = Object.values(institution.programs || {}).map(p => p.category);
    
    const matches = matchingCategories.filter(cat => programCategories.includes(cat));
    breakdown.shsProgramFit = Math.min(10, matches.length * 5);
  }

  if (studentProfile.wassceGrade) {
    const grade = studentProfile.wassceGrade.trim();
    if (grade.match(/^[A-C]/i)) breakdown.gradeCompatibility = 10;
    else if (grade.match(/^[D-E]/i)) breakdown.gradeCompatibility = 8;
    else breakdown.gradeCompatibility = 6;
  } else {
    breakdown.gradeCompatibility = 7;
  }

  if (studentProfile.interests?.length) {
    const interests = studentProfile.interests.map(i => i.toLowerCase());
    const specializationsMatch = institution.specializations.some(spec =>
      interests.some(interest => 
        spec.toLowerCase().includes(interest) || interest.includes(spec.toLowerCase().split(' ')[0])
      )
    );
    
    breakdown.interestMatch = specializationsMatch ? 8 : 3;
  }

  if (studentProfile.financialSituation === 'need_scholarship') {
    breakdown.financialFit = institution.type === 'public' ? 7 : 3;
  } else if (studentProfile.financialSituation === 'comfortable') {
    breakdown.financialFit = 7;
  } else {
    breakdown.financialFit = 5;
  }

  const totalScore = Object.values(breakdown).reduce((sum, val) => sum + val, 0);

  return {
    totalScore: Math.min(100, Math.round(totalScore)),
    breakdown
  };
}

function findBestProgramsForUser(institution, studentProfile) {
  const scoredPrograms = [];

  for (const [programName, programData] of Object.entries(institution.programs || {})) {
    let score = 0;

    if (studentProfile.careerGoals) {
      const careerLower = studentProfile.careerGoals.toLowerCase();
      if (programData.career_fields.some(field => careerLower.includes(field.toLowerCase()) || field.toLowerCase().includes(careerLower))) {
        score += 50;
      }
    }

    if (studentProfile.interests?.some(interest =>
      programName.toLowerCase().includes(interest.toLowerCase()) ||
      programData.career_fields.some(field => field.toLowerCase().includes(interest.toLowerCase()))
    )) {
      score += 30;
    }

    if (studentProfile.subjects?.length) {
      const subjectsLower = studentProfile.subjects.map(s => s.toLowerCase());
      
      if (programData.category === 'STEM' && subjectsLower.some(s => ['mathematics', 'physics', 'chemistry', 'biology'].includes(s))) {
        score += 20;
      }
      
      if (programData.category === 'Business' && subjectsLower.some(s => ['economics', 'business', 'accounting'].includes(s))) {
        score += 20;
      }
    }

    if (score > 0) {
      scoredPrograms.push({ name: programName, ...programData, score });
    }
  }

  return scoredPrograms.sort((a, b) => b.score - a.score).slice(0, 3);
}

function generateReasoningForMatch(institution, studentProfile, scoreData) {
  const reasons = [];

  if (scoreData.breakdown.careerAlignment >= 15) reasons.push(`Strong alignment with career goals in ${studentProfile.careerGoals || 'your chosen field'}`);
  if (scoreData.breakdown.subjectAlignment >= 12) reasons.push(`Offers programs matching your subject background in ${studentProfile.subjects?.slice(0, 2).join(', ') || 'key areas'}`);
  if (scoreData.breakdown.shsProgramFit >= 7) reasons.push(`Well-suited for ${studentProfile.shsProgram || 'your'} SHS program graduates`);
  if (scoreData.breakdown.locationPreference >= 10) reasons.push(`Located in your preferred region (${institution.region})`);
  if (scoreData.breakdown.financialFit >= 6 && studentProfile.financialSituation === 'need_scholarship' && institution.type === 'public') {
    reasons.push('Public university with lower fees and scholarship opportunities');
  }
  if (institution.strength_areas?.length) reasons.push(`Known for ${institution.strength_areas.slice(0, 2).join(' and ')}`);

  if (!reasons.length) reasons.push(`Offers relevant programs and established in ${institution.established}`);

  return reasons.join('. ');
}

export function getTopUniversityMatches(studentProfile, topN = 5) {
  return matchUniversitiesToProfile(studentProfile).slice(0, topN);
}

export function getUniversityMatchesByThreshold(studentProfile, minScore = 50) {
  return matchUniversitiesToProfile(studentProfile).filter(match => match.matchScore >= minScore);
}

export default {
  matchUniversitiesToProfile,
  getTopUniversityMatches,
  getUniversityMatchesByThreshold,
  calculateUniversityMatchScore,
  findBestProgramsForUser
};
