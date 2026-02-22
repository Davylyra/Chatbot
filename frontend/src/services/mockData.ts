/**
 * Mock Data Service
 * Description: Provides realistic mock data for frontend development
 * Integration: Replace with real API calls from api.ts
 */

import { UNIVERSITIES_DATA, ASSESSMENT_QUESTIONS } from '../data/constants';

// Types for mock data
export interface MockUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  createdAt: string;
  location?: string;
  bio?: string;
  interests?: string[];
  preferredUniversities?: string[];
}

export interface MockChatResponse {
  message: string;
  suggestions?: string[];
  relatedForms?: string[];
  nextSteps?: string[];
  universityContext?: string;
}

export interface MockAssessmentResult {
  id: string;
  userId: string;
  recommendations: {
    university: string;
    program: string;
    matchScore: number;
    reasons: string[];
  }[];
  submittedAt: string;
}

// Mock Users Database - Now managed by AI model
// These are fallback values only, actual data comes from dynamic AI-generated content
export const mockUsers: MockUser[] = [
  {
    id: '1',
    name: 'User', // Will be replaced by AI-generated user data
    email: 'user@example.com', // Will be replaced by AI-generated user data
    phone: '+233123456789', // Will be replaced by AI-generated user data
    createdAt: '2025-01-15T10:00:00Z',
    location: 'Accra, Ghana', // Will be replaced by AI-generated user data
    bio: 'Passionate about technology and education', // Will be replaced by AI-generated user data
    interests: ['Computer Science', 'Engineering', 'Technology'], // Will be replaced by AI-generated user data
    preferredUniversities: ['KNUST', 'UG', 'Ashesi'] // Will be replaced by AI-generated user data
  },
  {
    id: '2',
    name: 'Student', // Will be replaced by AI-generated user data
    email: 'student@example.com', // Will be replaced by AI-generated user data
    phone: '+233987654321', // Will be replaced by AI-generated user data
    createdAt: '2025-01-10T14:30:00Z',
    location: 'Kumasi, Ghana', // Will be replaced by AI-generated user data
    bio: 'Interested in medicine and healthcare', // Will be replaced by AI-generated user data
    interests: ['Medicine', 'Health Sciences', 'Biology'], // Will be replaced by AI-generated user data
    preferredUniversities: ['UG', 'KNUST', 'UHA'] // Will be replaced by AI-generated user data
  }
];

// Chat Response Generator - TODO: Replace with AI model integration
export class ChatResponseGenerator {
  private static generateUniversitySpecificResponse(universityContext: string, userMessage: string): string {
    const university = universityContext.toLowerCase();
    
    // University-specific responses
    if (university.includes('knust')) {
      if (userMessage.includes('program') || userMessage.includes('course')) {
        return `At KNUST, we offer excellent programs in Engineering, Medicine, Agriculture, Business, and Science. Our Computer Science and Engineering programs are particularly renowned. What specific program are you interested in?`;
      }
      if (userMessage.includes('requirement') || userMessage.includes('admission')) {
        return `For KNUST admission, you typically need WASSCE grades with at least 6 credits including English and Mathematics. Specific programs may have additional requirements. Would you like details about a particular program?`;
      }
      if (userMessage.includes('deadline') || userMessage.includes('application')) {
        return `KNUST application deadlines are usually in December. The 2026/2027 academic year applications are now open. I can help you with the application process.`;
      }
      if (userMessage.includes('fee') || userMessage.includes('cost') || userMessage.includes('price')) {
        return `KNUST fees vary by program. Undergraduate programs typically range from ₵2,000 to ₵5,000 per semester. Would you like specific fee information for a program?`;
      }
      if (userMessage.includes('campus') || userMessage.includes('life') || userMessage.includes('student')) {
        return `KNUST has a vibrant campus life in Kumasi with excellent facilities, student organizations, and a strong academic community. The campus is well-equipped with modern laboratories and libraries.`;
      }
    }
    
    if (university.includes('ug') || university.includes('university of ghana')) {
      if (userMessage.includes('program') || userMessage.includes('course')) {
        return `UG offers diverse programs in Arts, Social Sciences, Business, Medicine, and Law. Our Business School and Medical School are highly regarded. What field interests you?`;
      }
      if (userMessage.includes('requirement') || userMessage.includes('admission')) {
        return `UG admission requires WASSCE with at least 6 credits including English and Mathematics. Some programs have specific subject requirements. Which program are you considering?`;
      }
      if (userMessage.includes('deadline') || userMessage.includes('application')) {
        return `UG application deadlines are typically in December for the following academic year. Applications for 2026/2025 are currently open.`;
      }
      if (userMessage.includes('fee') || userMessage.includes('cost') || userMessage.includes('price')) {
        return `UG fees range from ₵1,500 to ₵4,000 per semester depending on the program. International students have different fee structures.`;
      }
      if (userMessage.includes('campus') || userMessage.includes('life') || userMessage.includes('student')) {
        return `UG's Legon campus offers a rich student experience with numerous clubs, sports facilities, and cultural activities. The campus is located in Accra with easy access to the city.`;
      }
    }

    // Add responses for other universities
    const universityResponses: Record<string, Record<string, string>> = {
      'ucc': {
        'program': 'UCC specializes in Education, Arts, Science, Business, and Agriculture programs. Our Education programs are particularly strong.',
        'requirement': 'UCC admission requires WASSCE with 6 credits including English and Mathematics. Education programs may have additional requirements.',
        'deadline': 'UCC application deadlines are usually in December. Applications for 2026/2027 are now open.',
        'fee': 'UCC fees range from ₵1,200 to ₵3,500 per semester depending on the program.',
        'campus': 'UCC campus in Cape Coast offers a serene learning environment with modern facilities and strong community engagement.'
      },
      'uds': {
        'program': 'UDS focuses on Development Studies, Agriculture, Medicine, and Education programs with emphasis on community development.',
        'requirement': 'UDS admission requires WASSCE with 6 credits including English and Mathematics. Development programs may have specific requirements.',
        'deadline': 'UDS application deadlines are typically in December for the following academic year.',
        'fee': 'UDS fees range from ₵1,000 to ₵3,000 per semester, making it one of the most affordable options.',
        'campus': 'UDS has multiple campuses in Tamale, Navrongo, and Wa, each with unique specializations.'
      }
    };

    const uniKey = university.replace(/[^a-z]/g, '');
    if (universityResponses[uniKey]) {
      for (const [keyword, response] of Object.entries(universityResponses[uniKey])) {
        if (userMessage.includes(keyword)) {
          return response;
        }
      }
    }

    return `I'd be happy to help you with information about ${universityContext}. What specific information are you looking for?`;
  }

  static generateResponse(userMessage: string, universityContext?: string): MockChatResponse {
    const message = userMessage.toLowerCase();
    
    // University-specific responses
    if (universityContext) {
      const universityResponse = this.generateUniversitySpecificResponse(universityContext, message);
      return {
        message: universityResponse,
        suggestions: [
          "Tell me about admission requirements",
          "What programs are available?",
          "When are application deadlines?",
          "What are the fees like?"
        ],
        universityContext
      };
    }

    // General responses
    if (message.includes('hello') || message.includes('hi') || message.includes('hey')) {
      return {
        message: "Hello! I'm your AI assistant for Ghana university admissions. How can I help you today?",
        suggestions: [
          "Help me choose a university",
          "Tell me about admission requirements",
          "Show me available programs",
          "Help with application process"
        ]
      };
    }

    if (message.includes('university') || message.includes('school')) {
      return {
        message: "I can help you with information about Ghanaian universities. We have data on KNUST, UG, UCC, UDS, and many others. What would you like to know?",
        suggestions: [
          "Compare universities",
          "Find programs by interest",
          "Check admission requirements",
          "View application deadlines"
        ]
      };
    }

    if (message.includes('program') || message.includes('course') || message.includes('degree')) {
      return {
        message: "I can help you find programs that match your interests. What field are you interested in?",
        suggestions: [
          "Engineering programs",
          "Medicine and Health Sciences",
          "Business and Management",
          "Arts and Humanities",
          "Education programs"
        ]
      };
    }

    if (message.includes('requirement') || message.includes('admission') || message.includes('qualification')) {
      return {
        message: "Admission requirements vary by university and program. Generally, you need WASSCE with at least 6 credits including English and Mathematics. Which university or program are you interested in?",
        suggestions: [
          "KNUST requirements",
          "UG requirements",
          "UCC requirements",
          "General admission process"
        ]
      };
    }

    if (message.includes('fee') || message.includes('cost') || message.includes('price') || message.includes('money')) {
      return {
        message: "University fees in Ghana vary by institution and program. Public universities typically range from ₵1,000 to ₵5,000 per semester. Which university are you considering?",
        suggestions: [
          "Compare university fees",
          "Financial aid options",
          "Payment methods",
          "Budget planning"
        ]
      };
    }

    if (message.includes('deadline') || message.includes('application') || message.includes('apply')) {
      return {
        message: "Application deadlines for most Ghanaian universities are typically in December for the following academic year. Applications for 2026/2027 are currently open. Which university are you applying to?",
        suggestions: [
          "Check specific deadlines",
          "Application process guide",
          "Required documents",
          "Submit application"
        ]
      };
    }

    if (message.includes('help') || message.includes('support')) {
      return {
        message: "I'm here to help you with university admissions in Ghana. I can assist with university selection, program information, admission requirements, and application processes. What do you need help with?",
        suggestions: [
          "University selection guide",
          "Program recommendation",
          "Application checklist",
          "Contact support"
        ]
      };
    }

    // Default response
    return {
      message: "I understand you're looking for information about Ghanaian universities. I can help you with university selection, programs, admission requirements, fees, and application processes. What specific information do you need?",
      suggestions: [
        "Find universities by location",
        "Search programs by interest",
        "Compare admission requirements",
        "Check application deadlines",
        "Get program recommendations"
      ]
    };
  }
}

// Mock API Service - TODO: Replace with real API calls
export class MockApiService {
  // Chat API simulation
  static async getChatResponse(message: string, universityContext?: string): Promise<MockChatResponse> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
    
    return ChatResponseGenerator.generateResponse(message, universityContext);
  }

  // User authentication simulation
  static async authenticateUser(email: string, _password: string): Promise<MockUser | null> {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const user = mockUsers.find(u => u.email === email);
    if (user) {
      return user;
    }
    return null;
  }

  // Get user profile
  static async getUserProfile(userId: string): Promise<MockUser | null> {
    await new Promise(resolve => setTimeout(resolve, 300));
    
    return mockUsers.find(u => u.id === userId) || null;
  }

  // Update user profile
  static async updateUserProfile(userId: string, updates: Partial<MockUser>): Promise<MockUser | null> {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const userIndex = mockUsers.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      mockUsers[userIndex] = { ...mockUsers[userIndex], ...updates };
      return mockUsers[userIndex];
    }
    return null;
  }

  // Get universities
  static async getUniversities(): Promise<any[]> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return UNIVERSITIES_DATA;
  }

  // Get assessment questions
  static async getAssessmentQuestions(): Promise<any[]> {
    await new Promise(resolve => setTimeout(resolve, 200));
    return ASSESSMENT_QUESTIONS;
  }

  // Submit assessment
  static async submitAssessment(assessmentData: any): Promise<MockAssessmentResult> {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Generate mock recommendations based on assessment data
    const recommendations = [
      {
        university: "KNUST",
        program: "Computer Science",
        matchScore: 95,
        reasons: ["Strong in mathematics", "Interest in technology", "Good grades in science subjects"]
      },
      {
        university: "UG",
        program: "Business Administration",
        matchScore: 88,
        reasons: ["Interest in business", "Good communication skills", "Leadership potential"]
      }
    ];

    return {
      id: `assessment_${Date.now()}`,
      userId: assessmentData.userId || '1',
      recommendations,
      submittedAt: new Date().toISOString()
    };
  }

  // Purchase form simulation
  static async purchaseForm(_formId: string, _paymentData: any): Promise<{ success: boolean; transactionId: string }> {
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    return {
      success: true,
      transactionId: `txn_${Date.now()}`
    };
  }

  // Get user's purchased forms
  static async getUserForms(_userId: string): Promise<any[]> {
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Return mock purchased forms
    return [
      {
        id: "1",
        universityName: "KNUST",
        fullName: "Kwame Nkrumah University of Science & Technology",
        formPrice: "₵200",
        purchaseDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: "completed"
      }
    ];
  }
}

// Export for backward compatibility
export { UNIVERSITIES_DATA, ASSESSMENT_QUESTIONS };