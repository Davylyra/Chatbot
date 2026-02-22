/**
 * Forms API Service
 * Description: Handles dynamic form data including prices, deadlines, and availability
 * Integration: Backend API integration for real-time form data
 */

import { ApiService } from './api';
import { CacheManager } from '../utils/apiHelpers';

export interface FormData {
  id: string;
  universityId: string;
  universityName: string;
  fullName: string;
  formPrice: number; // Changed from string to number for calculations
  currency: string; // e.g., 'GHS', 'USD'
  deadline: string; // ISO date string
  isAvailable: boolean;
  description: string;
  logo?: string;
  // Additional dynamic fields
  lastUpdated: string; // ISO timestamp
  applicationPeriod: {
    start: string; // ISO date
    end: string; // ISO date
  };
  requirements: string[];
  paymentMethods: string[];
  // Status indicators
  isExpired: boolean;
  daysUntilDeadline: number;
  status: 'available' | 'expired' | 'not_yet_open' | 'sold_out';
}

export interface FormsApiResponse {
  success: boolean;
  data: FormData[];
  lastUpdated: string;
  totalCount: number;
}

export interface FormPriceUpdate {
  formId: string;
  newPrice: number;
  currency: string;
  effectiveDate: string;
}

export interface FormDeadlineUpdate {
  formId: string;
  newDeadline: string;
  reason?: string;
}

export class FormsApiService {
  private static readonly cacheManager = new CacheManager<FormData[]>('glinax-forms-cache', 5 * 60 * 1000); // 5 minutes

  /**
   * Get all available forms with dynamic pricing and deadlines
   */
  static async getForms(): Promise<FormsApiResponse> {
    try {
      // Try to get from API first
      const response = await ApiService.getUniversities();
      
      if (response.success && response.data) {
        // Process and validate the data
        const processedForms = this.processFormsData(response.data.map(uni => ({
          ...uni,
          formPrice: uni.formPrice || uni.buyPrice || '0',
          currency: 'GHS'
        })));
        
        // Cache the data
        this.cacheManager.set(processedForms);
        
        return {
          success: true,
          data: processedForms,
          lastUpdated: new Date().toISOString(),
          totalCount: processedForms.length
        };
      }
      
      throw new Error('API request failed');
    } catch {
      // Forms API unavailable, using fallback data
      return this.getFallbackForms();
    }
  }

  /**
   * Get a specific form by ID
   */
  static async getFormById(formId: string): Promise<FormData | null> {
    try {
      const response = await ApiService.getUniversities();
      
      if (response.success && response.data) {
        const form = response.data.find(uni => uni.id === formId);
        return form ? this.processFormData({
          ...form,
          formPrice: form.formPrice || form.buyPrice || '0',
          currency: 'GHS'
        }) : null;
      }
      
      return null;
    } catch (_error) {
      // Form API unavailable, using fallback data
      const forms = await this.getFallbackForms();
      return forms.data.find(form => form.id === formId) || null;
    }
  }

  /**
   * Update form pricing (Admin function)
   * TODO: Implement when backend API is available
   */
  static async updateFormPrice(_update: FormPriceUpdate): Promise<boolean> {
    // updateFormPrice not implemented - backend API required
    return false;
  }

  /**
   * Update form deadline (Admin function)
   * TODO: Implement when backend API is available
   */
  static async updateFormDeadline(_update: FormDeadlineUpdate): Promise<boolean> {
    // updateFormDeadline not implemented - backend API required
    return false;
  }

  /**
   * Get cached forms data if available and not expired
   */
  static getCachedForms(): FormData[] | null {
    return this.cacheManager.get();
  }

  /**
   * Process and validate forms data from API
   */
  private static processFormsData(forms: any[]): FormData[] {
    return forms.map(form => this.processFormData(form));
  }

  /**
   * Process and validate a single form
   */
  private static processFormData(form: any): FormData {
    const now = new Date();
    const deadline = new Date(form.deadline);
    const daysUntilDeadline = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    // Determine form status
    let status: FormData['status'] = 'available';
    if (daysUntilDeadline < 0) {
      status = 'expired';
    } else if (daysUntilDeadline > 365) {
      status = 'not_yet_open';
    } else if (!form.isAvailable) {
      status = 'sold_out';
    }

    return {
      id: form.id,
      universityId: form.universityId || form.id,
      universityName: form.universityName,
      fullName: form.fullName || form.universityName,
      formPrice: typeof form.formPrice === 'string' ? 
        parseFloat(form.formPrice.replace(/[^\d.]/g, '')) : form.formPrice,
      currency: form.currency || 'GHS',
      deadline: form.deadline,
      isAvailable: form.isAvailable && status === 'available',
      description: form.description || '',
      logo: form.logo,
      lastUpdated: form.lastUpdated || new Date().toISOString(),
      applicationPeriod: form.applicationPeriod || {
        start: form.deadline,
        end: form.deadline
      },
      requirements: form.requirements || [],
      paymentMethods: form.paymentMethods || ['MTN', 'Vodafone', 'AirtelTigo'],
      isExpired: daysUntilDeadline < 0,
      daysUntilDeadline,
      status
    };
  }

  /**
   * Fallback to mock data when API is unavailable
   */
  private static async getFallbackForms(): Promise<FormsApiResponse> {
    const { UNIVERSITIES_DATA } = await import('../data/constants');
    
    const forms: FormData[] = UNIVERSITIES_DATA.map(uni => {
      const deadline = new Date(uni.deadline);
      const now = new Date();
      const daysUntilDeadline = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      return {
        id: uni.id,
        universityId: uni.id,
        universityName: uni.universityName,
        fullName: uni.fullName,
        formPrice: parseFloat(uni.formPrice.replace(/[^\d.]/g, '')),
        currency: 'GHS',
        deadline: uni.deadline,
        isAvailable: uni.isAvailable,
        description: uni.description,
        logo: uni.logo,
        lastUpdated: new Date().toISOString(),
        applicationPeriod: {
          start: uni.deadline,
          end: uni.deadline
        },
        requirements: [],
        paymentMethods: ['MTN', 'Vodafone', 'AirtelTigo'],
        isExpired: daysUntilDeadline < 0,
        daysUntilDeadline,
        status: daysUntilDeadline < 0 ? 'expired' : 'available'
      };
    });

    return {
      success: true,
      data: forms,
      lastUpdated: new Date().toISOString(),
      totalCount: forms.length
    };
  }
}

// Export for use in other services
export default FormsApiService;
