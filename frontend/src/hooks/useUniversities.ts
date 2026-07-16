import { useState, useEffect, useCallback } from "react";
import { SmartApiService } from "../services/api";
import type { University } from "../services/api";

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
        throw new Error(response.error || "Failed to load universities");
      }
    } catch (loadError) {
      const errorMessage =
        loadError instanceof Error
          ? loadError.message
          : "Failed to load universities";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const searchUniversities = useCallback(
    async (query: string): Promise<University[]> => {
      if (!query.trim()) return universities;

      try {
        const response = await SmartApiService.searchUniversities(query);
        if (response.success && response.data) {
          return response.data;
        }
        return [];
      } catch {
        return universities.filter(
          (university) =>
            university.name.toLowerCase().includes(query.toLowerCase()) ||
            university.fullName.toLowerCase().includes(query.toLowerCase()) ||
            university.location.toLowerCase().includes(query.toLowerCase()),
        );
      }
    },
    [universities],
  );

  const getUniversity = useCallback(
    (id: string): University | undefined => {
      return universities.find((university) => university.id === id);
    },
    [universities],
  );

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
