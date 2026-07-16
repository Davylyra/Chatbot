import { UNIVERSITIES_DATA, ASSESSMENT_QUESTIONS } from "../data/constants";

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

export const mockUsers: MockUser[] = [
  {
    id: "1",
    name: "User",
    email: "user@example.com",
    phone: "+233123456789",
    createdAt: "2025-01-15T10:00:00Z",
    location: "Accra, Ghana",
    bio: "Passionate about technology and education",
    interests: ["Computer Science", "Engineering", "Technology"],
    preferredUniversities: ["KNUST", "UG", "Ashesi"],
  },
  {
    id: "2",
    name: "Student",
    email: "student@example.com",
    phone: "+233987654321",
    createdAt: "2025-01-10T14:30:00Z",
    location: "Kumasi, Ghana",
    bio: "Interested in medicine and healthcare",
    interests: ["Medicine", "Health Sciences", "Biology"],
    preferredUniversities: ["UG", "KNUST", "UHA"],
  },
];

export class MockApiService {
  static async getChatResponse(
    message: string,
    universityContext?: string,
  ): Promise<MockChatResponse> {
    await new Promise((resolve) =>
      setTimeout(resolve, 1000 + Math.random() * 1000),
    );

    return {
      message: `I received your message about ${universityContext || "universities"}: "${message}".`,
      suggestions: [
        "Compare universities",
        "Find programs by interest",
        "Check admission requirements",
        "View application deadlines",
      ],
      universityContext,
    };
  }

  static async authenticateUser(
    email: string,
    _password: string,
  ): Promise<MockUser | null> {
    await new Promise((resolve) => setTimeout(resolve, 500));

    const matchedUser = mockUsers.find((u) => u.email === email);
    return matchedUser || null;
  }

  static async getUserProfile(userId: string): Promise<MockUser | null> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return mockUsers.find((u) => u.id === userId) || null;
  }

  static async updateUserProfile(
    userId: string,
    updates: Partial<MockUser>,
  ): Promise<MockUser | null> {
    await new Promise((resolve) => setTimeout(resolve, 500));

    const userIndex = mockUsers.findIndex((u) => u.id === userId);
    if (userIndex !== -1) {
      mockUsers[userIndex] = { ...mockUsers[userIndex], ...updates };
      return mockUsers[userIndex];
    }
    return null;
  }

  static async getUniversities(): Promise<any[]> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return UNIVERSITIES_DATA;
  }

  static async getAssessmentQuestions(): Promise<any[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return ASSESSMENT_QUESTIONS;
  }

  static async submitAssessment(
    assessmentData: any,
  ): Promise<MockAssessmentResult> {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const recommendations = [
      {
        university: "KNUST",
        program: "Computer Science",
        matchScore: 95,
        reasons: [
          "Strong in mathematics",
          "Interest in technology",
          "Good grades in science subjects",
        ],
      },
      {
        university: "UG",
        program: "Business Administration",
        matchScore: 88,
        reasons: [
          "Interest in business",
          "Good communication skills",
          "Leadership potential",
        ],
      },
    ];

    return {
      id: `assessment_${Date.now()}`,
      userId: assessmentData.userId || "1",
      recommendations,
      submittedAt: new Date().toISOString(),
    };
  }

  static async purchaseForm(
    _formId: string,
    _paymentData: any,
  ): Promise<{ success: boolean; transactionId: string }> {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    return {
      success: true,
      transactionId: `txn_${Date.now()}`,
    };
  }

  static async getUserForms(_userId: string): Promise<any[]> {
    await new Promise((resolve) => setTimeout(resolve, 300));

    return [
      {
        id: "1",
        universityName: "KNUST",
        fullName: "Kwame Nkrumah University of Science & Technology",
        formPrice: "₵200",
        purchaseDate: new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        status: "completed",
      },
    ];
  }
}

export { UNIVERSITIES_DATA, ASSESSMENT_QUESTIONS };
