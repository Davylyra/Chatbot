import { useState, useCallback } from "react";
import { handleApiError } from "../utils/apiHelpers";

interface UseApiStateOptions<T> {
  initialData?: T;
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
}

interface UseApiStateReturn<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  execute: <P extends any[]>(
    apiCall: (...args: P) => Promise<T>,
    ...args: P
  ) => Promise<T | null>;
  reset: () => void;
  setData: (data: T | null) => void;
}

export function useApiState<T = any>(
  options: UseApiStateOptions<T> = {},
): UseApiStateReturn<T> {
  const { initialData = null, onSuccess, onError } = options;

  const [data, setData] = useState<T | null>(initialData as T | null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async <P extends any[]>(
      apiCall: (...args: P) => Promise<T>,
      ...args: P
    ): Promise<T | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const apiResult = await apiCall(...args);
        setData(apiResult);
        onSuccess?.(apiResult);
        return apiResult;
      } catch (apiError) {
        const errorMessage = handleApiError(apiError, "An error occurred");
        setError(errorMessage);
        onError?.(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [onSuccess, onError],
  );

  const reset = useCallback(() => {
    setData(initialData as T | null);
    setIsLoading(false);
    setError(null);
  }, [initialData]);

  return {
    data,
    isLoading,
    error,
    execute,
    reset,
    setData,
  };
}

export function useMultiApiState<T extends Record<string, any>>() {
  const [states, setStates] = useState<
    Record<
      string,
      {
        data: any;
        isLoading: boolean;
        error: string | null;
      }
    >
  >({});

  const executeFor = useCallback(
    async <K extends keyof T>(
      key: K,
      apiCall: () => Promise<T[K]>,
    ): Promise<T[K] | null> => {
      setStates((prev) => ({
        ...prev,
        [key]: { ...prev[key as string], isLoading: true, error: null },
      }));

      try {
        const apiResult = await apiCall();
        setStates((prev) => ({
          ...prev,
          [key]: { data: apiResult, isLoading: false, error: null },
        }));
        return apiResult;
      } catch (apiError) {
        const errorMessage = handleApiError(apiError);
        setStates((prev) => ({
          ...prev,
          [key]: {
            ...prev[key as string],
            isLoading: false,
            error: errorMessage,
          },
        }));
        return null;
      }
    },
    [],
  );

  const getState = useCallback(
    <K extends keyof T>(key: K) => {
      return (
        states[key as string] || { data: null, isLoading: false, error: null }
      );
    },
    [states],
  );

  const resetAll = useCallback(() => {
    setStates({});
  }, []);

  return {
    executeFor,
    getState,
    resetAll,
    states,
  };
}

export default useApiState;
