/**
 * Centralized API Helpers
 * Consolidates repeated API call patterns, error handling, and caching logic
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
const DEFAULT_TIMEOUT = 10000;

interface ApiCallOptions {
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: any;
  headers?: Record<string, string>;
  timeout?: number;
  requiresAuth?: boolean;
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Centralized API call handler with auth, timeout, and error handling
 */
export async function apiCall<T = any>(options: ApiCallOptions): Promise<ApiResponse<T>> {
  const {
    endpoint,
    method = 'GET',
    body,
    headers = {},
    timeout = DEFAULT_TIMEOUT,
    requiresAuth = true
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const requestHeaders: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...headers
    };

    if (requiresAuth) {
      const token = localStorage.getItem('token');
      if (token) {
        requestHeaders['Authorization'] = `Bearer ${token}`;
      }
    }

    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
    
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || errorData.error || `HTTP ${response.status}`
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: data.data || data,
      message: data.message
    };
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { success: false, error: 'Request timeout' };
      }
      return { success: false, error: error.message };
    }
    
    return { success: false, error: 'Unknown error occurred' };
  }
}

/**
 * Centralized error handler with user-friendly messages
 */
export function handleApiError(error: unknown, fallbackMessage = 'An error occurred'): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return fallbackMessage;
}

/**
 * Cache management utilities
 */
export class CacheManager<T> {
  private key: string;
  private ttl: number;

  constructor(key: string, ttl: number = 5 * 60 * 1000) { // 5 minutes default
    this.key = key;
    this.ttl = ttl;
  }

  get(): T | null {
    try {
      const cached = localStorage.getItem(this.key);
      if (!cached) return null;

      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < this.ttl) {
        return data;
      }
      
      this.clear();
      return null;
    } catch {
      return null;
    }
  }

  set(data: T): void {
    try {
      localStorage.setItem(this.key, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.warn('Failed to cache data:', error);
    }
  }

  clear(): void {
    localStorage.removeItem(this.key);
  }

  isValid(): boolean {
    return this.get() !== null;
  }
}

/**
 * Retry logic for failed requests
 */
export async function retryApiCall<T>(
  fn: () => Promise<ApiResponse<T>>,
  maxRetries = 2,
  delay = 1000
): Promise<ApiResponse<T>> {
  let lastError: ApiResponse<T> = { success: false, error: 'Max retries exceeded' };
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      if (result.success) return result;
      
      lastError = result;
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay * (attempt + 1)));
      }
    } catch (error) {
      lastError = { success: false, error: handleApiError(error) };
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay * (attempt + 1)));
      }
    }
  }
  
  return lastError;
}

export default {
  apiCall,
  handleApiError,
  CacheManager,
  retryApiCall
};
