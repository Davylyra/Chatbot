/**
 * Forms Hook
 * Description: Manages dynamic form data from API
 * Integration: Provides real-time form data with caching
 */

import { useState, useEffect, useCallback } from 'react';
import { SmartApiService } from '../services/api';
import type { FormData } from '../services/api';

interface UseFormsReturn {
  forms: FormData[];
  isLoading: boolean;
  error: string | null;
  getForm: (id: string) => FormData | undefined;
  getFormsByUniversity: (universityId: string) => FormData[];
  purchaseForm: (formId: string, paymentData: any) => Promise<{ success: boolean; transactionId?: string; error?: string }>;
  refreshForms: () => Promise<void>;
}

export const useForms = (): UseFormsReturn => {
  const [forms, setForms] = useState<FormData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadForms = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await SmartApiService.getForms();
      
      if (response.success && response.data) {
        setForms(response.data);
      } else {
        throw new Error(response.error || 'Failed to load forms');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load forms';
      setError(errorMessage);
      // Forms loading error - handled gracefully
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getForm = useCallback((id: string): FormData | undefined => {
    return forms.find(form => form.id === id);
  }, [forms]);

  const getFormsByUniversity = useCallback((universityId: string): FormData[] => {
    return forms.filter(form => form.universityId === universityId);
  }, [forms]);

  const purchaseForm = useCallback(async (formId: string, paymentData: any) => {
    try {
      const response = await SmartApiService.purchaseForm(formId, paymentData);
      
      if (response.success && response.data) {
        return {
          success: true,
          transactionId: response.data.transactionId,
        };
      } else {
        return {
          success: false,
          error: response.error || 'Purchase failed',
        };
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Purchase failed';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }, []);

  const refreshForms = useCallback(async () => {
    await loadForms();
  }, [loadForms]);

  useEffect(() => {
    loadForms();
  }, [loadForms]);

  return {
    forms,
    isLoading,
    error,
    getForm,
    getFormsByUniversity,
    purchaseForm,
    refreshForms,
  };
};

export default useForms;
