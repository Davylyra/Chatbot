let API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
let API_TIMEOUT = 10000;

const initializeApiConfig = async () => {
  try {
    const { configService } = await import("./configService");
    const baseUrl = await configService.getConfig("api.base_url");
    const timeout = await configService.getConfig("api.timeout");

    if (baseUrl) API_BASE_URL = baseUrl;
    if (timeout) API_TIMEOUT = parseInt(timeout, 10);
  } catch (configError) {
    console.warn(
      "Failed to load dynamic API configuration, using defaults:",
      configError,
    );
  }
};

initializeApiConfig();

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

export interface University {
  id: string;
  name: string;
  fullName: string;
  location: string;
  established: number;
  studentCount: string;
  type: "public" | "private";
  programs: string[];
  logo: string;
  formPrice: string;
  buyPrice: string;
  deadline: string;
  isAvailable: boolean;
  description: string;
  cutOffPoints?: Record<string, number>;
  admissionRequirements?: string[];
  campusFacilities?: string[];
  contactInfo?: {
    phone: string;
    email: string;
    website: string;
  };
}

export interface FormData {
  id: string;
  universityId: string;
  universityName: string;
  formPrice: string;
  buyPrice: string;
  deadline: string;
  isAvailable: boolean;
  description?: string;
  requirements?: string[];
  documents?: string[];
}

export interface ChatResponse {
  message: string;
  suggestions?: string[];
  relatedForms?: string[];
  nextSteps?: string[];
  universityContext?: string;
  metadata?: {
    confidence: number;
    sources: string[];
    lastUpdated: string;
  };
}

export interface AssessmentQuestion {
  id: string;
  question: string;
  type: "text" | "single" | "multiple";
  options?: string[];
  placeholder?: string;
  required: boolean;
  order: number;
}

export interface PaymentMethod {
  id: string;
  name: string;
  code: string;
  description: string;
  icon: string;
  isActive: boolean;
  fees?: {
    percentage: number;
    fixed: number;
  };
}

export interface AppConfig {
  name: string;
  version: string;
  description: string;
  supportEmail: string;
  supportPhone: string;
  website: string;
  socialMedia: {
    twitter: string;
    facebook: string;
    instagram: string;
  };
  features: {
    chatEnabled: boolean;
    formsEnabled: boolean;
    assessmentEnabled: boolean;
    paymentsEnabled: boolean;
  };
  maintenance: {
    isActive: boolean;
    message: string;
    startTime?: string;
    endTime?: string;
  };
}

class HttpClient {
  private baseURL: string;
  private timeout: number;

  constructor(baseURL: string, timeout: number) {
    this.baseURL = baseURL;
    this.timeout = timeout;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const body = await response.json();
      return { success: true, data: body };
    } catch (requestError) {
      clearTimeout(timeoutId);

      if (requestError instanceof Error) {
        if (requestError.name === "AbortError") {
          return {
            success: false,
            data: null as T,
            error: "Request timeout. Please try again.",
          };
        }
        return { success: false, data: null as T, error: requestError.message };
      }

      return {
        success: false,
        data: null as T,
        error: "An unexpected error occurred.",
      };
    }
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: "GET" });
  }

  async post<T>(endpoint: string, payload: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async put<T>(endpoint: string, payload: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }
}

const httpClient = new HttpClient(API_BASE_URL, API_TIMEOUT);

export class ApiService {
  static async getUniversities(): Promise<ApiResponse<University[]>> {
    return httpClient.get<University[]>("/universities");
  }

  static async getUniversity(id: string): Promise<ApiResponse<University>> {
    return httpClient.get<University>(`/universities/${id}`);
  }

  static async searchUniversities(
    query: string,
  ): Promise<ApiResponse<University[]>> {
    return httpClient.get<University[]>(
      `/universities/search?q=${encodeURIComponent(query)}`,
    );
  }

  static async getForms(): Promise<ApiResponse<FormData[]>> {
    return httpClient.get<FormData[]>("/forms");
  }

  static async getForm(id: string): Promise<ApiResponse<FormData>> {
    return httpClient.get<FormData>(`/forms/${id}`);
  }

  static async purchaseForm(
    formId: string,
    paymentData: any,
  ): Promise<ApiResponse<{ transactionId: string; status: string }>> {
    return httpClient.post(`/forms/${formId}/purchase`, paymentData);
  }

  static async sendMessage(
    message: string,
    universityContext?: string,
  ): Promise<ApiResponse<ChatResponse>> {
    return httpClient.post<ChatResponse>("/chat/message", {
      message,
      universityContext,
      timestamp: new Date().toISOString(),
    });
  }

  static async getConversations(): Promise<ApiResponse<any[]>> {
    return httpClient.get<any[]>("/chat/conversations");
  }

  static async deleteConversation(
    conversationId: string,
  ): Promise<ApiResponse<void>> {
    return httpClient.delete<void>(`/chat/conversations/${conversationId}`);
  }

  static async generateConversationTitle(
    conversationId: string,
    firstUserMessage: string,
    firstBotReply?: string,
    universityContext?: string,
    fallbackTitle?: string,
  ): Promise<ApiResponse<{ title: string; method: string }>> {
    return httpClient.post<{ title: string; method: string }>(
      `/chat/conversations/${conversationId}/generate-title`,
      {
        firstUserMessage,
        firstBotReply,
        universityContext,
        fallbackTitle,
      },
    );
  }

  static async getAssessmentQuestions(): Promise<
    ApiResponse<AssessmentQuestion[]>
  > {
    return httpClient.get<AssessmentQuestion[]>("/assessment/questions");
  }

  static async submitAssessment(answers: any): Promise<ApiResponse<any>> {
    return httpClient.post("/assessment/submit", answers);
  }

  static async getAIRecommendations(
    assessmentData: any,
  ): Promise<ApiResponse<any>> {
    return httpClient.post("/assessment/ai-recommendations", assessmentData);
  }

  static async getPageContent(pageId: string): Promise<ApiResponse<any>> {
    return httpClient.get(`/content/pages/${pageId}`);
  }

  static async updatePageContent(
    pageId: string,
    content: any,
  ): Promise<ApiResponse<any>> {
    return httpClient.put(`/content/pages/${pageId}`, content);
  }

  static async getConfig(key: string): Promise<ApiResponse<any>> {
    return httpClient.get(`/config/${key}`);
  }

  static async getConfigCategory(category: string): Promise<ApiResponse<any>> {
    return httpClient.get(`/config/category/${category}`);
  }

  static async updateConfig(
    key: string,
    config: any,
  ): Promise<ApiResponse<any>> {
    return httpClient.put(`/config/${key}`, config);
  }

  static async getDynamicData(
    type: string,
    id: string,
  ): Promise<ApiResponse<any>> {
    return httpClient.get(`/data/${type}/${id}`);
  }

  static async getDynamicDataCollection(
    type: string,
    filters?: Record<string, any>,
  ): Promise<ApiResponse<any>> {
    const queryParams = filters
      ? `?${new URLSearchParams(filters).toString()}`
      : "";
    return httpClient.get(`/data/${type}${queryParams}`);
  }

  static async createDynamicData(
    type: string,
    payload: any,
  ): Promise<ApiResponse<any>> {
    return httpClient.post(`/data/${type}`, payload);
  }

  static async updateDynamicData(
    type: string,
    id: string,
    payload: any,
  ): Promise<ApiResponse<any>> {
    return httpClient.put(`/data/${type}/${id}`, payload);
  }

  static async deleteDynamicData(
    type: string,
    id: string,
  ): Promise<ApiResponse<any>> {
    return httpClient.delete(`/data/${type}/${id}`);
  }

  static async getPaymentMethods(): Promise<ApiResponse<PaymentMethod[]>> {
    return httpClient.get<PaymentMethod[]>("/payments/methods");
  }

  static async getAppConfig(): Promise<ApiResponse<AppConfig>> {
    return httpClient.get<AppConfig>("/config");
  }

  static async updateAppConfig(
    config: Partial<AppConfig>,
  ): Promise<ApiResponse<AppConfig>> {
    return httpClient.put<AppConfig>("/config", config);
  }

  static async getNotifications(): Promise<ApiResponse<any[]>> {
    return httpClient.get<any[]>("/notifications");
  }

  static async markNotificationAsRead(
    notificationId: string,
  ): Promise<ApiResponse<void>> {
    return httpClient.put<void>(`/notifications/${notificationId}/read`, {});
  }

  static async getUserProfile(userId: string): Promise<ApiResponse<any>> {
    return httpClient.get<any>(`/users/${userId}`);
  }

  static async updateUserProfile(
    userId: string,
    updates: any,
  ): Promise<ApiResponse<any>> {
    return httpClient.put<any>(`/users/${userId}`, updates);
  }

  static async trackEvent(
    event: string,
    eventData: any,
  ): Promise<ApiResponse<void>> {
    return httpClient.post<void>("/analytics/track", {
      event,
      data: eventData,
    });
  }
}

export class FallbackService {
  static async getUniversities(): Promise<ApiResponse<University[]>> {
    const { UNIVERSITIES_DATA } = await import("../data/constants");
    return {
      success: true,
      data: UNIVERSITIES_DATA.map((university) => ({
        ...university,
        name: university.universityName,
        id: university.id,
        fullName: university.fullName,
        location: university.location,
        established: university.established,
        studentCount: university.studentCount,
        type: university.type,
        programs: university.programs,
        logo: university.logo,
        formPrice: university.formPrice,
        buyPrice: university.buyPrice,
        deadline: university.deadline,
        isAvailable: university.isAvailable,
        description: university.description,
      })) as University[],
    };
  }

  static async getForms(): Promise<ApiResponse<FormData[]>> {
    const { UNIVERSITIES_DATA } = await import("../data/constants");
    const forms = UNIVERSITIES_DATA.map((university) => ({
      id: university.id,
      universityId: university.id,
      universityName: university.universityName,
      formPrice: university.formPrice,
      buyPrice: university.buyPrice,
      deadline: university.deadline,
      isAvailable: university.isAvailable,
      description: university.description,
    }));

    return { success: true, data: forms };
  }

  static async sendMessage(
    message: string,
    universityContext?: string,
  ): Promise<ApiResponse<ChatResponse>> {
    const { MockApiService } = await import("./mockData");
    const chatReply = await MockApiService.getChatResponse(
      message,
      universityContext,
    );
    return { success: true, data: chatReply };
  }
}

export class SmartApiService {
  private static isApiAvailable: boolean | null = null;

  private static async checkApiAvailability(): Promise<boolean> {
    if (this.isApiAvailable !== null) {
      return this.isApiAvailable;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const healthCheck = await fetch(`${API_BASE_URL}/health`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      this.isApiAvailable = healthCheck.ok;
    } catch {
      this.isApiAvailable = false;
    }

    return this.isApiAvailable;
  }

  static async getUniversities(): Promise<ApiResponse<University[]>> {
    const isAvailable = await this.checkApiAvailability();
    return isAvailable
      ? ApiService.getUniversities()
      : FallbackService.getUniversities();
  }

  static async getForms(): Promise<ApiResponse<FormData[]>> {
    const isAvailable = await this.checkApiAvailability();
    return isAvailable ? ApiService.getForms() : FallbackService.getForms();
  }

  static async sendMessage(
    message: string,
    universityContext?: string,
  ): Promise<ApiResponse<ChatResponse>> {
    const isAvailable = await this.checkApiAvailability();
    return isAvailable
      ? ApiService.sendMessage(message, universityContext)
      : FallbackService.sendMessage(message, universityContext);
  }

  static async getUniversity(id: string) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.getUniversity(id);
    }
    const { UNIVERSITIES_DATA } = await import("../data/constants");
    const university = UNIVERSITIES_DATA.find((u) => u.id === id);
    return {
      success: !!university,
      data: university
        ? ({
            ...university,
            name: university.universityName,
            logo: university.logo,
          } as University)
        : (undefined as any),
    };
  }

  static async searchUniversities(query: string) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.searchUniversities(query);
    }
    const { UNIVERSITIES_DATA } = await import("../data/constants");
    const filtered = UNIVERSITIES_DATA.filter(
      (university) =>
        university.universityName.toLowerCase().includes(query.toLowerCase()) ||
        university.fullName.toLowerCase().includes(query.toLowerCase()) ||
        university.location.toLowerCase().includes(query.toLowerCase()),
    );
    return {
      success: true,
      data: filtered.map((university) => ({
        ...university,
        name: university.universityName,
        logo: university.logo,
      })) as University[],
    };
  }

  static async purchaseForm(formId: string, paymentData: any) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.purchaseForm(formId, paymentData);
    }
    return {
      success: true,
      data: {
        transactionId: `txn_${Date.now()}`,
        status: "completed",
      },
    };
  }

  static async getAppConfig() {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.getAppConfig();
    }
    const { APP_CONFIG } = await import("../data/constants");
    return { success: true, data: APP_CONFIG as AppConfig };
  }

  static async getConfig(key: string) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.getConfig(key);
    }
    return { success: false, data: null, error: "API not available" };
  }

  static async getConfigCategory(category: string) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.getConfigCategory(category);
    }
    return { success: false, data: null, error: "API not available" };
  }

  static async updateConfig(key: string, config: any) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.updateConfig(key, config);
    }
    return { success: false, data: null, error: "API not available" };
  }

  static async getPageContent(pageId: string) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.getPageContent(pageId);
    }
    return { success: false, data: null, error: "API not available" };
  }

  static async updatePageContent(pageId: string, content: any) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.updatePageContent(pageId, content);
    }
    return { success: false, data: null, error: "API not available" };
  }

  static async getDynamicData(type: string, id: string) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.getDynamicData(type, id);
    }
    return { success: false, data: null, error: "API not available" };
  }

  static async getDynamicDataCollection(
    type: string,
    filters?: Record<string, any>,
  ) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.getDynamicDataCollection(type, filters);
    }
    return { success: false, data: null, error: "API not available" };
  }

  static async createDynamicData(type: string, payload: any) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.createDynamicData(type, payload);
    }
    return { success: false, data: null, error: "API not available" };
  }

  static async updateDynamicData(type: string, id: string, payload: any) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.updateDynamicData(type, id, payload);
    }
    return { success: false, data: null, error: "API not available" };
  }

  static async deleteDynamicData(type: string, id: string) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.deleteDynamicData(type, id);
    }
    return { success: false, data: null, error: "API not available" };
  }

  static async getAIRecommendations(assessmentData: any) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.getAIRecommendations(assessmentData);
    }
    return { success: false, data: null, error: "API not available" };
  }
}

export default SmartApiService;
