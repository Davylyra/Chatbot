/**
 * Universities Hook
 * Description: Manages dynamic university data from API
 * Integration: Provides real-time university data with caching
 */

import { useState, useEffect, useCallback } from 'react';
import { SmartApiService } from '../services/api';
import type { University } from '../services/api';

interface UseUniversitiesReturn {
  universities: University[];
  isLoading: boolean;
  error: string | null;
  searchUniversities: (query: string) => Promise<University[]>;
  getUniversity: (id: string) => University | undefined;
  refreshUniversities: () => Promise<void>;
}

export const useUniversities = (): UseUniversitiesReturn => {
  const [universities, setUniversities] = useState<University[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUniversities = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await SmartApiService.getUniversities();
      
      if (response.success && response.data) {
        setUniversities(response.data);
      } else {
        throw new Error(response.error || 'Failed to load universities');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load universities';
      setError(errorMessage);
      // Universities loading error - handled gracefully
    } finally {
      setIsLoading(false);
    }
  }, []);

  const searchUniversities = useCallback(async (query: string): Promise<University[]> => {
    if (!query.trim()) return universities;

    try {
      const response = await SmartApiService.searchUniversities(query);
      if (response.success && response.data) {
        return response.data;
      }
      return [];
    } catch {
      // University search error - handled gracefully
      // Fallback to local search
      return universities.filter(uni => 
        uni.name.toLowerCase().includes(query.toLowerCase()) ||
        uni.fullName.toLowerCase().includes(query.toLowerCase()) ||
        uni.location.toLowerCase().includes(query.toLowerCase())
      );
    }
  }, [universities]);

  const getUniversity = useCallback((id: string): University | undefined => {
    return universities.find(uni => uni.id === id);
  }, [universities]);

  const refreshUniversities = useCallback(async () => {
    await loadUniversities();
  }, [loadUniversities]);

  useEffect(() => {
    loadUniversities();
  }, [loadUniversities]);

  return {
    universities,
    isLoading,
    error,
    searchUniversities,
    getUniversity,
    refreshUniversities,
  };
};

export default useUniversities;
