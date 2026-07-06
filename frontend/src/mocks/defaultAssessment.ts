import type { AssessmentData, RecommendedProgram } from '../services/assessmentService';

export function generateMockRecommendations(data: AssessmentData): RecommendedProgram[] {
  const recommendations: RecommendedProgram[] = [];

  const interestKeywords = data.interests.join(' ').toLowerCase();
  const subjectKeywords = data.bestSubject.join(' ').toLowerCase();

  // Computer Science/IT recommendations
  if (
    interestKeywords.includes('computer') ||
    interestKeywords.includes('technology') ||
    subjectKeywords.includes('ict') ||
    subjectKeywords.includes('computer')
  ) {
    recommendations.push({
      id: '1',
      university: 'KNUST',
      program: 'Computer Science',
      matchScore: 95,
      location: 'Kumasi, Ashanti Region',
      fees: 'GHS 3,500 per semester',
      requirements: ['Mathematics', 'English', 'Science'],
      description:
        'Perfect match for your interest in Computer Science and strong performance in Mathematics and Science.',
      logo: '/university-logos/knust-logo.png',
    });

    recommendations.push({
      id: '2',
      university: 'GCTU',
      program: 'Software Engineering',
      matchScore: 88,
      location: 'Accra, Greater Accra',
      fees: 'GHS 3,200 per semester',
      requirements: ['Mathematics', 'English', 'Science'],
      description: 'Specialized program that aligns with your career aspirations in technology.',
      logo: '/university-logos/gctu-logo.png',
    });
  }

  // Business recommendations
  if (
    interestKeywords.includes('business') ||
    interestKeywords.includes('finance') ||
    subjectKeywords.includes('business') ||
    subjectKeywords.includes('economics')
  ) {
    recommendations.push({
      id: '3',
      university: 'UG',
      program: 'Business Administration',
      matchScore: 90,
      location: 'Legon, Greater Accra',
      fees: 'GHS 4,200 per semester',
      requirements: ['Mathematics', 'English', 'Social Studies'],
      description: 'Excellent choice based on your business interests and career goals.',
      logo: '/university-logos/ug-logo.png',
    });

    recommendations.push({
      id: '4',
      university: 'UPSA',
      program: 'Accounting',
      matchScore: 85,
      location: 'Accra, Greater Accra',
      fees: 'GHS 3,800 per semester',
      requirements: ['Mathematics', 'English', 'Business Studies'],
      description: 'Leading professional studies program for accounting and finance careers.',
      logo: '/university-logos/upsa-logo.jpg',
    });
  }

  // Engineering recommendations
  if (
    interestKeywords.includes('engineering') ||
    subjectKeywords.includes('mathematics') ||
    subjectKeywords.includes('science')
  ) {
    recommendations.push({
      id: '5',
      university: 'KNUST',
      program: 'Mechanical Engineering',
      matchScore: 92,
      location: 'Kumasi, Ashanti Region',
      fees: 'GHS 3,500 per semester',
      requirements: ['Mathematics', 'Physics', 'Chemistry'],
      description:
        'Strong engineering program matching your mathematical and scientific strengths.',
      logo: '/university-logos/knust-logo.png',
    });

    recommendations.push({
      id: '6',
      university: 'UMaT',
      program: 'Mining Engineering',
      matchScore: 87,
      location: 'Tarkwa, Western Region',
      fees: 'GHS 3,000 per semester',
      requirements: ['Mathematics', 'Physics', 'Chemistry'],
      description: 'Specialized mining engineering program with excellent industry connections.',
      logo: '/university-logos/umat-logo.jpg',
    });
  }

  // Medicine/Health recommendations
  if (interestKeywords.includes('medicine') || interestKeywords.includes('health')) {
    recommendations.push({
      id: '7',
      university: 'UHAS',
      program: 'Medicine',
      matchScore: 94,
      location: 'Ho, Volta Region',
      fees: 'GHS 4,500 per semester',
      requirements: ['Biology', 'Chemistry', 'Physics', 'Mathematics'],
      description: 'Leading health sciences university with comprehensive medical program.',
      logo: '/university-logos/uhas-logo.png',
    });
  }

  // Education recommendations
  if (interestKeywords.includes('education') || interestKeywords.includes('teaching')) {
    recommendations.push({
      id: '8',
      university: 'UEW',
      program: 'Education (Mathematics)',
      matchScore: 89,
      location: 'Winneba, Central Region',
      fees: 'GHS 2,800 per semester',
      requirements: ['Mathematics', 'English', 'Science'],
      description: 'Premier teacher education institution with strong mathematics program.',
      logo: '/university-logos/uew-logo.png',
    });
  }

  if (recommendations.length === 0) {
    recommendations.push(
      {
        id: '9',
        university: 'UCC',
        program: 'General Arts',
        matchScore: 75,
        location: 'Cape Coast, Central Region',
        fees: 'GHS 2,500 per semester',
        requirements: ['English', 'Social Studies'],
        description: 'Flexible arts program that allows you to explore various fields.',
        logo: '/university-logos/ucc-logo.png',
      },
      {
        id: '10',
        university: 'UDS',
        program: 'Development Studies',
        matchScore: 72,
        location: 'Tamale, Northern Region',
        fees: 'GHS 2,200 per semester',
        requirements: ['English', 'Social Studies'],
        description: 'Focus on development and community engagement with affordable fees.',
        logo: '/university-logos/uds-logo.jpg',
      }
    );
  }

  return recommendations.sort((a, b) => b.matchScore - a.matchScore).slice(0, 4);
}
