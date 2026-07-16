import { ASSESSMENT_QUESTIONS } from "../data/constants";
import { SmartApiService } from "./api";
import { handleApiError } from "../utils/apiHelpers";
import { generateMockRecommendations as fetchMockRecommendations } from "../mocks/defaultAssessment";

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
  type: "single" | "multiple" | "text";
  options?: string[];
  placeholder?: string;
  required?: boolean;
}

class AssessmentService {
  async getAssessmentQuestions(): Promise<AssessmentQuestion[]> {
    await new Promise((resolve) => setTimeout(resolve, 100));

    return ASSESSMENT_QUESTIONS.map((question) => ({
      ...question,
      required: true,
    }));
  }

  async submitAssessment(
    assessmentData: AssessmentData,
  ): Promise<RecommendedProgram[]> {
    try {
      const aiResponse = await this.sendToAIModel(assessmentData);

      if (aiResponse?.recommendations) {
        return aiResponse.recommendations;
      }

      return this.generateMockRecommendations(assessmentData);
    } catch (assessmentError) {
      console.error(
        "AI assessment failed:",
        handleApiError(assessmentError, "Assessment processing failed"),
      );
      return this.generateMockRecommendations(assessmentData);
    }
  }

  private async sendToAIModel(
    assessmentData: AssessmentData,
  ): Promise<{ recommendations: RecommendedProgram[] } | null> {
    try {
      const assessmentPrompt = this.buildAssessmentPrompt(assessmentData);

      const response = await SmartApiService.getAIRecommendations({
        assessmentData,
        prompt: assessmentPrompt,
      });

      if (response.success && response.data) {
        return response.data;
      }

      throw new Error(response.error || "AI service unavailable");
    } catch (modelError) {
      console.error("AI model request failed:", handleApiError(modelError));
      return null;
    }
  }

  private buildAssessmentPrompt(assessmentData: AssessmentData): string {
    return `
      Based on the following student assessment data, provide personalized university program recommendations for Ghanaian universities:
      
      Strong Subjects: ${assessmentData.bestSubject.join(", ")}
      SHS Program: ${assessmentData.shsProgram}
      WASSCE Grade: ${assessmentData.wassceGrade}
      Career Interests: ${assessmentData.interests.join(", ")}
      Career Goals: ${assessmentData.careerGoals}
      Preferred Location: ${assessmentData.preferredLocation}
      
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

  private generateMockRecommendations(
    assessmentData: AssessmentData,
  ): RecommendedProgram[] {
    return fetchMockRecommendations(assessmentData);
  }

  async sendAssessmentToChat(assessmentData: AssessmentData): Promise<string> {
    return this.craftPersonalizedMessage(assessmentData);
  }

  private craftPersonalizedMessage(assessmentData: AssessmentData): string {
    const subjects = assessmentData.bestSubject.join(", ");
    const shsProgram = assessmentData.shsProgram;
    const wassceGrade = assessmentData.wassceGrade;
    const interests = assessmentData.interests.join(", ");
    const goals = assessmentData.careerGoals;
    const location = assessmentData.preferredLocation;

    let message = `Hi! I just completed my university assessment and I'm excited to discuss my options with you. `;

    if (subjects) {
      message += `My strongest subjects are ${subjects}. `;
    }

    if (shsProgram) {
      message += `In SHS I studied the ${shsProgram} program. `;
    }

    if (wassceGrade) {
      message += `I obtained ${wassceGrade} in my WASSCE. `;
    }

    if (interests) {
      message += `I'm particularly interested in ${interests}. `;
    }

    if (goals) {
      message += `My career goal is to ${goals.toLowerCase()}. `;
    }

    if (location) {
      message += `I want you to consider only universities in ${location}. `;
    }

    message += `Based on my assessment, could you help me understand which university programs would be the best fit for me? I'd love to hear your recommendations and learn more about the application process.`;

    return message;
  }

  async getAssessmentStats(): Promise<{
    totalAssessments: number;
    averageScore: number;
    popularPrograms: string[];
  }> {
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
      totalAssessments: 1250,
      averageScore: 82,
      popularPrograms: [
        "Computer Science",
        "Business Administration",
        "Medicine",
        "Engineering",
      ],
    };
  }
}

export const assessmentService = new AssessmentService();
