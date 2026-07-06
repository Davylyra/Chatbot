import { ApiService } from './api';
import { CacheManager } from '../utils/apiHelpers';

export interface FormData {
  id: string;
  universityId: string;
  universityName: string;
  fullName: string;
  formPrice: number;
  currency: string;
  deadline: string;
  isAvailable: boolean;
  description: string;
  logo?: string;
  lastUpdated: string;
  applicationPeriod: {
    start: string;
    end: string;
  };
  requirements: string[];
  paymentMethods: string[];
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
  private static readonly cacheManager = new CacheManager<FormData[]>(
    'glinax-forms-cache',
    5 * 60 * 1000
  );

  static async getForms(): Promise<FormsApiResponse> {
    try {
      const response = await ApiService.getUniversities();

      if (response.success && response.data) {
        const processedForms = this.processFormsData(
          response.data.map((university) => ({
            ...university,
            formPrice: university.formPrice || university.buyPrice || '0',
            currency: 'GHS',
          }))
        );

        this.cacheManager.set(processedForms);

        return {
          success: true,
          data: processedForms,
          lastUpdated: new Date().toISOString(),
          totalCount: processedForms.length,
        };
      }

      throw new Error('API request failed');
    } catch {
      return this.getFallbackForms();
    }
  }

  static async getFormById(formId: string): Promise<FormData | null> {
    try {
      const response = await ApiService.getUniversities();

      if (response.success && response.data) {
        const matchedUniversity = response.data.find((university) => university.id === formId);
        return matchedUniversity
          ? this.processFormData({
              ...matchedUniversity,
              formPrice: matchedUniversity.formPrice || matchedUniversity.buyPrice || '0',
              currency: 'GHS',
            })
          : null;
      }

      return null;
    } catch {
      const fallback = await this.getFallbackForms();
      return fallback.data.find((form) => form.id === formId) || null;
    }
  }

  static async updateFormPrice(_priceUpdate: FormPriceUpdate): Promise<boolean> {
    return false;
  }

  static async updateFormDeadline(_deadlineUpdate: FormDeadlineUpdate): Promise<boolean> {
    return false;
  }

  static getCachedForms(): FormData[] | null {
    return this.cacheManager.get();
  }

  private static processFormsData(forms: any[]): FormData[] {
    return forms.map((form) => this.processFormData(form));
  }

  private static processFormData(form: any): FormData {
    const now = new Date();
    const deadline = new Date(form.deadline);
    const daysUntilDeadline = Math.ceil(
      (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

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
      formPrice:
        typeof form.formPrice === 'string'
          ? parseFloat(form.formPrice.replace(/[^\d.]/g, ''))
          : form.formPrice,
      currency: form.currency || 'GHS',
      deadline: form.deadline,
      isAvailable: form.isAvailable && status === 'available',
      description: form.description || '',
      logo: form.logo,
      lastUpdated: form.lastUpdated || new Date().toISOString(),
      applicationPeriod: form.applicationPeriod || {
        start: form.deadline,
        end: form.deadline,
      },
      requirements: form.requirements || [],
      paymentMethods: form.paymentMethods || ['MTN', 'Vodafone', 'AirtelTigo'],
      isExpired: daysUntilDeadline < 0,
      daysUntilDeadline,
      status,
    };
  }

  private static async getFallbackForms(): Promise<FormsApiResponse> {
    const { UNIVERSITIES_DATA } = await import('../data/constants');

    const forms: FormData[] = UNIVERSITIES_DATA.map((university) => {
      const deadline = new Date(university.deadline);
      const now = new Date();
      const daysUntilDeadline = Math.ceil(
        (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        id: university.id,
        universityId: university.id,
        universityName: university.universityName,
        fullName: university.fullName,
        formPrice: parseFloat(university.formPrice.replace(/[^\d.]/g, '')),
        currency: 'GHS',
        deadline: university.deadline,
        isAvailable: university.isAvailable,
        description: university.description,
        logo: university.logo,
        lastUpdated: new Date().toISOString(),
        applicationPeriod: {
          start: university.deadline,
          end: university.deadline,
        },
        requirements: [],
        paymentMethods: ['MTN', 'Vodafone', 'AirtelTigo'],
        isExpired: daysUntilDeadline < 0,
        daysUntilDeadline,
        status: daysUntilDeadline < 0 ? 'expired' : 'available',
      };
    });

    return {
      success: true,
      data: forms,
      lastUpdated: new Date().toISOString(),
      totalCount: forms.length,
    };
  }
}

export default FormsApiService;
