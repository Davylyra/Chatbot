// API Service Layer

let API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
let API_TIMEOUT = 10000; // 10 seconds

// load config dynamically
const initializeApiConfig = async () => {
  try {
    const { configService } = await import('./configService');
    const baseUrl = await configService.getConfig('api.base_url');
    const timeout = await configService.getConfig('api.timeout');
    
    if (baseUrl) API_BASE_URL = baseUrl;
    if (timeout) API_TIMEOUT = parseInt(timeout, 10);
  } catch (error) {
    console.warn('Failed to load dynamic API configuration, using defaults:', error);
  }
};

// Initialize configuration on module load
initializeApiConfig();

// Types for API responses
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
  type: 'public' | 'private';
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
  type: 'text' | 'single' | 'multiple';
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

// HTTP Client with error handling
class HttpClient {
  private baseURL: string;
  private timeout: number;

  constructor(baseURL: string, timeout: number) {
    this.baseURL = baseURL;
    this.timeout = timeout;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        data,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return {
            success: false,
            data: null as T,
            error: 'Request timeout. Please try again.',
          };
        }
        return {
          success: false,
          data: null as T,
          error: error.message,
        };
      }

      return {
        success: false,
        data: null as T,
        error: 'An unexpected error occurred.',
      };
    }
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async put<T>(endpoint: string, data: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

// Initialize HTTP client
const httpClient = new HttpClient(API_BASE_URL, API_TIMEOUT);

// API Service Class
export class ApiService {
  // Universities API
  static async getUniversities(): Promise<ApiResponse<University[]>> {
    return httpClient.get<University[]>('/universities');
  }

  static async getUniversity(id: string): Promise<ApiResponse<University>> {
    return httpClient.get<University>(`/universities/${id}`);
  }

  static async searchUniversities(query: string): Promise<ApiResponse<University[]>> {
    return httpClient.get<University[]>(`/universities/search?q=${encodeURIComponent(query)}`);
  }

  // Forms API
  static async getForms(): Promise<ApiResponse<FormData[]>> {
    return httpClient.get<FormData[]>('/forms');
  }

  static async getForm(id: string): Promise<ApiResponse<FormData>> {
    return httpClient.get<FormData>(`/forms/${id}`);
  }

  static async purchaseForm(formId: string, paymentData: any): Promise<ApiResponse<{ transactionId: string; status: string }>> {
    return httpClient.post(`/forms/${formId}/purchase`, paymentData);
  }

  // Chat API
  static async sendMessage(message: string, universityContext?: string): Promise<ApiResponse<ChatResponse>> {
    return httpClient.post<ChatResponse>('/chat/message', {
      message,
      universityContext,
      timestamp: new Date().toISOString(),
    });
  }

  static async getConversations(): Promise<ApiResponse<any[]>> {
    return httpClient.get<any[]>('/chat/conversations');
  }

  static async deleteConversation(conversationId: string): Promise<ApiResponse<void>> {
    return httpClient.delete<void>(`/chat/conversations/${conversationId}`);
  }

  // 🏷️ Generate LLM-powered conversation title
  static async generateConversationTitle(
    conversationId: string,
    firstUserMessage: string,
    firstBotReply?: string,
    universityContext?: string,
    fallbackTitle?: string
  ): Promise<ApiResponse<{ title: string; method: string }>> {
    return httpClient.post<{ title: string; method: string }>(
      `/chat/conversations/${conversationId}/generate-title`,
      {
        firstUserMessage,
        firstBotReply,
        universityContext,
        fallbackTitle
      }
    );
  }

  // Assessment API
  static async getAssessmentQuestions(): Promise<ApiResponse<AssessmentQuestion[]>> {
    return httpClient.get<AssessmentQuestion[]>('/assessment/questions');
  }

  static async submitAssessment(answers: any): Promise<ApiResponse<any>> {
    return httpClient.post('/assessment/submit', answers);
  }


      // AI Assessment API
      static async getAIRecommendations(assessmentData: any): Promise<ApiResponse<any>> {
        return httpClient.post('/assessment/ai-recommendations', assessmentData);
      }

      // Content Management API
      static async getPageContent(pageId: string): Promise<ApiResponse<any>> {
        return httpClient.get(`/content/pages/${pageId}`);
      }

      static async updatePageContent(pageId: string, content: any): Promise<ApiResponse<any>> {
        return httpClient.put(`/content/pages/${pageId}`, content);
      }

      // Configuration Management API
      static async getConfig(key: string): Promise<ApiResponse<any>> {
        return httpClient.get(`/config/${key}`);
      }

      static async getConfigCategory(category: string): Promise<ApiResponse<any>> {
        return httpClient.get(`/config/category/${category}`);
      }

      static async updateConfig(key: string, config: any): Promise<ApiResponse<any>> {
        return httpClient.put(`/config/${key}`, config);
      }

      // Dynamic Data Management API
      static async getDynamicData(type: string, id: string): Promise<ApiResponse<any>> {
        return httpClient.get(`/data/${type}/${id}`);
      }

      static async getDynamicDataCollection(type: string, filters?: Record<string, any>): Promise<ApiResponse<any>> {
        const queryParams = filters ? `?${new URLSearchParams(filters).toString()}` : '';
        return httpClient.get(`/data/${type}${queryParams}`);
      }

      static async createDynamicData(type: string, data: any): Promise<ApiResponse<any>> {
        return httpClient.post(`/data/${type}`, data);
      }

      static async updateDynamicData(type: string, id: string, data: any): Promise<ApiResponse<any>> {
        return httpClient.put(`/data/${type}/${id}`, data);
      }

      static async deleteDynamicData(type: string, id: string): Promise<ApiResponse<any>> {
        return httpClient.delete(`/data/${type}/${id}`);
      }

  // Payment Methods API
  static async getPaymentMethods(): Promise<ApiResponse<PaymentMethod[]>> {
    return httpClient.get<PaymentMethod[]>('/payments/methods');
  }

  // App Configuration API
  static async getAppConfig(): Promise<ApiResponse<AppConfig>> {
    return httpClient.get<AppConfig>('/config');
  }

  static async updateAppConfig(config: Partial<AppConfig>): Promise<ApiResponse<AppConfig>> {
    return httpClient.put<AppConfig>('/config', config);
  }

  // Notifications API
  static async getNotifications(): Promise<ApiResponse<any[]>> {
    return httpClient.get<any[]>('/notifications');
  }

  static async markNotificationAsRead(notificationId: string): Promise<ApiResponse<void>> {
    return httpClient.put<void>(`/notifications/${notificationId}/read`, {});
  }

  // User API
  static async getUserProfile(userId: string): Promise<ApiResponse<any>> {
    return httpClient.get<any>(`/users/${userId}`);
  }

  static async updateUserProfile(userId: string, updates: any): Promise<ApiResponse<any>> {
    return httpClient.put<any>(`/users/${userId}`, updates);
  }

  // Analytics API
  static async trackEvent(event: string, data: any): Promise<ApiResponse<void>> {
    return httpClient.post<void>('/analytics/track', { event, data });
  }
}

// Fallback to mock data when API is not available
export class FallbackService {
  static async getUniversities(): Promise<ApiResponse<University[]>> {
    // Import constants.ts as single source of truth
    const { UNIVERSITIES_DATA } = await import('../data/constants');
    return {
      success: true,
      data: UNIVERSITIES_DATA.map(uni => ({
        ...uni,
        name: uni.universityName, // Map universityName to name for consistency
        // Ensure all fields are present
        id: uni.id,
        fullName: uni.fullName,
        location: uni.location,
        established: uni.established,
        studentCount: uni.studentCount,
        type: uni.type,
        programs: uni.programs,
        logo: uni.logo, // Use logo from constants.ts (e.g., /university-logos/knust-logo.png)
        formPrice: uni.formPrice,
        buyPrice: uni.buyPrice,
        deadline: uni.deadline,
        isAvailable: uni.isAvailable,
        description: uni.description,
      })) as University[],
    };
  }

  static async getForms(): Promise<ApiResponse<FormData[]>> {
    const { UNIVERSITIES_DATA } = await import('../data/constants');
    const forms = UNIVERSITIES_DATA.map(uni => ({
      id: uni.id,
      universityId: uni.id,
      universityName: uni.universityName,
      formPrice: uni.formPrice,
      buyPrice: uni.buyPrice,
      deadline: uni.deadline,
      isAvailable: uni.isAvailable,
      description: uni.description,
    }));
    
    return {
      success: true,
      data: forms,
    };
  }

  static async sendMessage(message: string, universityContext?: string): Promise<ApiResponse<ChatResponse>> {
    const { MockApiService } = await import('./mockData');
    const response = await MockApiService.getChatResponse(message, universityContext);
    return {
      success: true,
      data: response,
    };
  }
}

// Smart API Service that falls back to mock data
export class SmartApiService {
  private static isApiAvailable: boolean | null = null;

  private static async checkApiAvailability(): Promise<boolean> {
    if (this.isApiAvailable !== null) {
      return this.isApiAvailable;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${API_BASE_URL}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      this.isApiAvailable = response.ok;
    } catch {
      this.isApiAvailable = false;
    }

    return this.isApiAvailable;
  }

  static async getUniversities(): Promise<ApiResponse<University[]>> {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.getUniversities();
    }
    return FallbackService.getUniversities();
  }

  static async getForms(): Promise<ApiResponse<FormData[]>> {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.getForms();
    }
    return FallbackService.getForms();
  }

  static async sendMessage(message: string, universityContext?: string): Promise<ApiResponse<ChatResponse>> {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.sendMessage(message, universityContext);
    }
    return FallbackService.sendMessage(message, universityContext);
  }

  // Delegate other methods to appropriate service
  static async getUniversity(id: string) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.getUniversity(id);
    }
    // Fallback using constants.ts as single source of truth
    const { UNIVERSITIES_DATA } = await import('../data/constants');
    const university = UNIVERSITIES_DATA.find(u => u.id === id);
    return {
      success: !!university,
      data: university ? {
        ...university,
        name: university.universityName, // Map universityName to name for consistency
        // Ensure logo from constants.ts is used
        logo: university.logo,
      } as University : undefined as any,
    };
  }

  static async searchUniversities(query: string) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.searchUniversities(query);
    }
    // Fallback to local search using constants.ts as single source of truth
    const { UNIVERSITIES_DATA } = await import('../data/constants');
    const filtered = UNIVERSITIES_DATA.filter(uni => 
      uni.universityName.toLowerCase().includes(query.toLowerCase()) ||
      uni.fullName.toLowerCase().includes(query.toLowerCase()) ||
      uni.location.toLowerCase().includes(query.toLowerCase())
    );
    return {
      success: true,
      data: filtered.map(uni => ({
        ...uni,
        name: uni.universityName, // Map universityName to name for consistency
        // Ensure logo from constants.ts is used
        logo: uni.logo,
      })) as University[],
    };
  }

  static async purchaseForm(formId: string, paymentData: any) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.purchaseForm(formId, paymentData);
    }
    // Fallback implementation
    return {
      success: true,
      data: {
        transactionId: `txn_${Date.now()}`,
        status: 'completed',
      },
    };
  }

  static async getAppConfig() {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.getAppConfig();
    }
    // Fallback to static config
    const { APP_CONFIG } = await import('../data/constants');
    return {
      success: true,
      data: APP_CONFIG as AppConfig,
    };
  }

  // Configuration Management API
  static async getConfig(key: string) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.getConfig(key);
    }
    // Fallback implementation
    return {
      success: false,
      data: null,
      error: 'API not available'
    };
  }

  static async getConfigCategory(category: string) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.getConfigCategory(category);
    }
    // Fallback implementation
    return {
      success: false,
      data: null,
      error: 'API not available'
    };
  }

  static async updateConfig(key: string, config: any) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.updateConfig(key, config);
    }
    // Fallback implementation
    return {
      success: false,
      data: null,
      error: 'API not available'
    };
  }

  // Content Management API
  static async getPageContent(pageId: string) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.getPageContent(pageId);
    }
    // Fallback implementation
    return {
      success: false,
      data: null,
      error: 'API not available'
    };
  }

  static async updatePageContent(pageId: string, content: any) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.updatePageContent(pageId, content);
    }
    // Fallback implementation
    return {
      success: false,
      data: null,
      error: 'API not available'
    };
  }

  // Dynamic Data Management API
  static async getDynamicData(type: string, id: string) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.getDynamicData(type, id);
    }
    // Fallback implementation
    return {
      success: false,
      data: null,
      error: 'API not available'
    };
  }

  static async getDynamicDataCollection(type: string, filters?: Record<string, any>) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.getDynamicDataCollection(type, filters);
    }
    // Fallback implementation
    return {
      success: false,
      data: null,
      error: 'API not available'
    };
  }

  static async createDynamicData(type: string, data: any) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.createDynamicData(type, data);
    }
    // Fallback implementation
    return {
      success: false,
      data: null,
      error: 'API not available'
    };
  }

  static async updateDynamicData(type: string, id: string, data: any) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.updateDynamicData(type, id, data);
    }
    // Fallback implementation
    return {
      success: false,
      data: null,
      error: 'API not available'
    };
  }

  static async deleteDynamicData(type: string, id: string) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.deleteDynamicData(type, id);
    }
    // Fallback implementation
    return {
      success: false,
      data: null,
      error: 'API not available'
    };
  }

  // AI Assessment API
  static async getAIRecommendations(assessmentData: any) {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      return ApiService.getAIRecommendations(assessmentData);
    }
    // Fallback implementation
    return {
      success: false,
      data: null,
      error: 'API not available'
    };
  }
}

export default SmartApiService;