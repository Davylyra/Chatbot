import { ApiService } from './api';
import { CacheManager } from '../utils/apiHelpers';

export interface FormData {
  id: string;
  universityId: string;
  universityName: string;
  fullName: string;
  formPrice: number | null;
  currency: string;
  deadline: string | null;
  isAvailable: boolean;
  description: string;
  logo?: string;
  lastUpdated: string;
  applicationPeriod: {
    start: string | null;
    end: string | null;
  };
  requirements: string[];
  paymentMethods: string[];
  isExpired: boolean;
  daysUntilDeadline: number | null;
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
        const stockMap = await this.getStockMap();

        const processedForms = this.processFormsData(
          response.data.map((university) => {
            const key = (university as any).universityName || university.name;
            const stock = stockMap[key];
            return {
              ...university,
              formPrice: university.formPrice || university.buyPrice || null,
              currency: 'GHS',
              // Fold real inventory into availability. If we have no stock
              // record for this university (lookup failed, or it isn't
              // tracked in form_inventory yet), fall back to the existing
              // isAvailable flag rather than assuming sold out.
              isAvailable: stock ? stock.inStock && university.isAvailable : university.isAvailable,
            };
          })
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
        if (!matchedUniversity) return null;

        const stockMap = await this.getStockMap();
        const key = (matchedUniversity as any).universityName || matchedUniversity.name;
        const stock = stockMap[key];

        return this.processFormData({
          ...matchedUniversity,
          formPrice: matchedUniversity.formPrice || matchedUniversity.buyPrice || null,
          currency: 'GHS',
          isAvailable: stock ? stock.inStock && matchedUniversity.isAvailable : matchedUniversity.isAvailable,
        });
      }

      return null;
    } catch {
      const fallback = await this.getFallbackForms();
      return fallback.data.find((form) => form.id === formId) || null;
    }
  }

  // Looks up live inventory counts per university. Fails open (empty map)
  // on any error so a stock-check hiccup never takes down the forms list -
  // the actual purchase-blocking safeguard lives server-side in
  // paystackController.js's initializePayment.
  private static async getStockMap(): Promise<Record<string, { inStock: boolean; remaining: number }>> {
    try {
      const stockResponse = await ApiService.getFormStockStatus();
      if (stockResponse.success && stockResponse.data) {
        return stockResponse.data;
      }
      return {};
    } catch {
      return {};
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
    const hasDeadline = !!form.deadline;
    const deadline = hasDeadline ? new Date(form.deadline) : null;
    const daysUntilDeadline =
      deadline && !isNaN(deadline.getTime())
        ? Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;

    // Status precedence: an unavailable-with-no-deadline university hasn't
    // been set up yet (not_yet_open reads honestly - "we haven't announced
    // this"), which is distinct from sold_out (configured, but currently
    // out of stock). A real deadline that's passed or is implausibly far
    // out takes priority over the availability flag either way.
    let status: FormData['status'] = 'available';
    if (daysUntilDeadline !== null && daysUntilDeadline < 0) {
      status = 'expired';
    } else if (daysUntilDeadline !== null && daysUntilDeadline > 365) {
      status = 'not_yet_open';
    } else if (!form.isAvailable) {
      status = daysUntilDeadline === null ? 'not_yet_open' : 'sold_out';
    }

    const formPrice =
      typeof form.formPrice === 'string'
        ? parseFloat(form.formPrice.replace(/[^\d.]/g, ''))
        : (form.formPrice ?? null);

    return {
      id: form.id,
      universityId: form.universityId || form.id,
      universityName: form.universityName,
      fullName: form.fullName || form.universityName,
      formPrice: formPrice !== null && !isNaN(formPrice) ? formPrice : null,
      currency: form.currency || 'GHS',
      deadline: hasDeadline ? form.deadline : null,
      isAvailable: form.isAvailable && status === 'available',
      description: form.description || '',
      logo: form.logo,
      lastUpdated: form.lastUpdated || new Date().toISOString(),
      applicationPeriod: hasDeadline
        ? { start: form.deadline, end: form.deadline }
        : { start: null, end: null },
      requirements: form.requirements || [],
      paymentMethods: form.paymentMethods || ['MTN', 'Vodafone', 'AirtelTigo'],
      isExpired: daysUntilDeadline !== null && daysUntilDeadline < 0,
      daysUntilDeadline,
      status,
    };
  }

  // IMPORTANT: this only runs when the live /universities call fails
  // entirely - meaning we have no confirmed data of any kind. Every field
  // here must reflect that honestly: no price, no deadline, and
  // isAvailable forced false, regardless of whatever UNIVERSITIES_DATA
  // happens to have hardcoded. This file is UI placeholder/demo content,
  // not a source of truth, and must never be presented as if it were.
  private static async getFallbackForms(): Promise<FormsApiResponse> {
    const { UNIVERSITIES_DATA } = await import('../data/constants');

    console.warn(
      '[FormsApiService] Live universities endpoint unavailable - showing placeholder ' +
        'listings with purchasing disabled. This is not real availability, price, or deadline data.'
    );

    const forms: FormData[] = UNIVERSITIES_DATA.map((university) => ({
      id: university.id,
      universityId: university.id,
      universityName: university.universityName,
      fullName: university.fullName,
      formPrice: null,
      currency: 'GHS',
      deadline: null,
      isAvailable: false,
      description: university.description,
      logo: university.logo,
      lastUpdated: new Date().toISOString(),
      applicationPeriod: { start: null, end: null },
      requirements: [],
      paymentMethods: ['MTN', 'Vodafone', 'AirtelTigo'],
      isExpired: false,
      daysUntilDeadline: null,
      status: 'not_yet_open',
    }));

    return {
      success: true,
      data: forms,
      lastUpdated: new Date().toISOString(),
      totalCount: forms.length,
    };
  }
}

export default FormsApiService;
