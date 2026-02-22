/**
 * Assessment Service
 * Description: Handles dynamic assessment questions and result generation
 * Integration: Replace with real AI/backend service for assessment processing
 */

import { ASSESSMENT_QUESTIONS } from '../data/constants';
import { SmartApiService } from './api';
import { handleApiError } from '../utils/apiHelpers';

export interface AssessmentData {
  bestSubject: string[];
  shsProgram: string;
  wassceGrade: string;
  interests: string[];
  careerGoals: string;
  preferredLocation: string;
}

export interface RecommendedProgram {
  id: string;
  university: string;
  program: string;
  matchScore: number;
  location: string;
  fees: string;
  requirements: string[];
  description: string;
  logo: string;
}

export interface AssessmentQuestion {
  id: string;
  question: string;
  type: 'single' | 'multiple' | 'text';
  options?: string[];
  placeholder?: string;
  required?: boolean;
}

class AssessmentService {
  /**
   * Get dynamic assessment questions
   * TODO: Replace with API call to fetch questions from backend
   */
  async getAssessmentQuestions(): Promise<AssessmentQuestion[]> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return ASSESSMENT_QUESTIONS.map(q => ({
      ...q,
      required: true // All questions are required by default
    }));
  }

  /**
   * Submit assessment and get recommendations
   * Sends assessment data to AI model for personalized recommendations
   */
  async submitAssessment(data: AssessmentData): Promise<RecommendedProgram[]> {
    try {
      // Send assessment data to AI model
      const aiResponse = await this.sendToAIModel(data);
      
      if (aiResponse && aiResponse.recommendations) {
        return aiResponse.recommendations;
      }
      
      // Fallback to mock recommendations if AI fails
      return this.generateMockRecommendations(data);
    } catch (error) {
      console.error('AI assessment failed:', handleApiError(error, 'Assessment processing failed'));
      // Fallback to mock recommendations
      return this.generateMockRecommendations(data);
    }
  }

  /**
   * Send assessment data to AI model for processing
   */
  private async sendToAIModel(data: AssessmentData): Promise<{ recommendations: RecommendedProgram[] } | null> {
    try {
      // Prepare assessment data for AI model
      const assessmentPrompt = this.buildAssessmentPrompt(data);
      
      // Send to AI service using SmartApiService
      const response = await SmartApiService.getAIRecommendations({
        assessmentData: data,
        prompt: assessmentPrompt
      });

      if (response.success && response.data) {
        return response.data;
      } else {
        throw new Error(response.error || 'AI service unavailable');
      }
    } catch (error) {
      console.error('AI model request failed:', handleApiError(error));
      return null;
    }
  }

  /**
   * Build assessment prompt for AI model
   */
  private buildAssessmentPrompt(data: AssessmentData): string {
    return `
      Based on the following student assessment data, provide personalized university program recommendations for Ghanaian universities:
      
      Strong Subjects: ${data.bestSubject.join(', ')}
      SHS Program: ${data.shsProgram}
      WASSCE Grade: ${data.wassceGrade}
      Career Interests: ${data.interests.join(', ')}
      Career Goals: ${data.careerGoals}
      Preferred Location: ${data.preferredLocation}
      
      Please recommend 3-4 university programs that best match this student's profile, considering:
      - Academic strengths and subject performance
      - Career interests and goals
      - Location preferences
      - Program requirements and suitability
      
      For each recommendation, provide:
      - University name and program
      - Match score (0-100)
      - Location
      - Fees
      - Key requirements
      - Description of why it's a good match
    `;
  }

  /**
   * Generate mock recommendations based on assessment data
   * TODO: Replace with real AI recommendation engine
   */
  private generateMockRecommendations(data: AssessmentData): RecommendedProgram[] {
    const recommendations: RecommendedProgram[] = [];
    
    // Simple matching algorithm based on interests and subjects
    const interestKeywords = data.interests.join(' ').toLowerCase();
    const subjectKeywords = data.bestSubject.join(' ').toLowerCase();
    
    // Computer Science/IT recommendations
    if (interestKeywords.includes('computer') || interestKeywords.includes('technology') || 
        subjectKeywords.includes('ict') || subjectKeywords.includes('computer')) {
      recommendations.push({
        id: '1',
        university: 'KNUST',
        program: 'Computer Science',
        matchScore: 95,
        location: 'Kumasi, Ashanti Region',
        fees: 'GHS 3,500 per semester',
        requirements: ['Mathematics', 'English', 'Science'],
        description: 'Perfect match for your interest in Computer Science and strong performance in Mathematics and Science.',
        logo: '/university-logos/knust-logo.png'
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
        logo: '/university-logos/gctu-logo.png'
      });
    }
    
    // Business recommendations
    if (interestKeywords.includes('business') || interestKeywords.includes('finance') ||
        subjectKeywords.includes('business') || subjectKeywords.includes('economics')) {
      recommendations.push({
        id: '3',
        university: 'UG',
        program: 'Business Administration',
        matchScore: 90,
        location: 'Legon, Greater Accra',
        fees: 'GHS 4,200 per semester',
        requirements: ['Mathematics', 'English', 'Social Studies'],
        description: 'Excellent choice based on your business interests and career goals.',
        logo: '/university-logos/ug-logo.png'
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
        logo: '/university-logos/upsa-logo.jpg'
      });
    }
    
    // Engineering recommendations
    if (interestKeywords.includes('engineering') || subjectKeywords.includes('mathematics') ||
        subjectKeywords.includes('science')) {
      recommendations.push({
        id: '5',
        university: 'KNUST',
        program: 'Mechanical Engineering',
        matchScore: 92,
        location: 'Kumasi, Ashanti Region',
        fees: 'GHS 3,500 per semester',
        requirements: ['Mathematics', 'Physics', 'Chemistry'],
        description: 'Strong engineering program matching your mathematical and scientific strengths.',
        logo: '/university-logos/knust-logo.png'
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
        logo: '/university-logos/umat-logo.jpg'
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
        logo: '/university-logos/uhas-logo.png'
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
        logo: '/university-logos/uew-logo.png'
      });
    }
    
    // If no specific matches, provide general recommendations
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
          logo: '/university-logos/ucc-logo.png'
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
          logo: '/university-logos/uds-logo.jpg'
        }
      );
    }
    
    // Sort by match score and return top 4
    return recommendations
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 4);
  }

  /**
   * Send assessment data to chat AI for discussion
   * This crafts a personalized message based on the user's assessment answers
   */
  async sendAssessmentToChat(data: AssessmentData): Promise<string> {
    try {
      // Craft a personalized message based on the user's answers
      const personalizedMessage = this.craftPersonalizedMessage(data);
      return personalizedMessage;
    } catch (error) {
      console.error('Failed to craft assessment message:', error);
      return 'I just completed my assessment and would like to discuss my university options with you.';
    }
  }

  /**
   * Craft a personalized message based on the user's assessment answers
   */
  private craftPersonalizedMessage(data: AssessmentData): string {
    const subjects = data.bestSubject.join(', ');
    const shsProgram = data.shsProgram;
    const wassceGrade = data.wassceGrade;
    const interests = data.interests.join(', ');
    const goals = data.careerGoals;
    const location = data.preferredLocation;

    // Create a personalized message based on their answers
    let message = `Hi! I just completed my university assessment and I'm excited to discuss my options with you. `;
    
    // Add subject strengths
    if (subjects) {
      message += `My strongest subjects are ${subjects}. `;
    }

    // Add SHS program background
    if (shsProgram) {
      message += `In SHS I studied the ${shsProgram} program. `;
    }

    // Add WASSCE grade
    if (wassceGrade) {
      message += `I obtained ${wassceGrade} in my WASSCE. `;
    }
    
    // Add career interests
    if (interests) {
      message += `I'm particularly interested in ${interests}. `;
    }
    
    // Add career goals
    if (goals) {
      message += `My career goal is to ${goals.toLowerCase()}. `;
    }
    
    // Add location preference
    if (location) {
      message += `I prefer to study in ${location}. `;
    }
    
    // Add request for guidance
    message += `Based on my assessment, could you help me understand which university programs would be the best fit for me? I'd love to hear your recommendations and learn more about the application process.`;
    
    return message;
  }


  /**
   * Get assessment statistics
   * TODO: Replace with real analytics from backend
   */
  async getAssessmentStats(): Promise<{
    totalAssessments: number;
    averageScore: number;
    popularPrograms: string[];
  }> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      totalAssessments: 1250,
      averageScore: 82,
      popularPrograms: ['Computer Science', 'Business Administration', 'Medicine', 'Engineering']
    };
  }
}

export const assessmentService = new AssessmentService();
