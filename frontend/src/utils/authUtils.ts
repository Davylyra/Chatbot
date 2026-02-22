/**
 * Authentication utilities for token management and validation
 */

export const isTokenValid = (token: string | null): boolean => {
  if (!token) return false;
  
  try {
    // Basic JWT validation - check if it has 3 parts
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    
    // Decode payload to check expiration
    const payload = JSON.parse(atob(parts[1]));
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Check if token is expired
    if (payload.exp && payload.exp < currentTime) {
      console.log('🔒 Token expired at:', new Date(payload.exp * 1000));
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('❌ Token validation error:', error);
    return false;
  }
};

export const clearExpiredToken = (): void => {
  const token = localStorage.getItem('token');
  if (token && !isTokenValid(token)) {
    console.log('🧹 Clearing expired token');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // Dispatch custom event for logout
    window.dispatchEvent(new CustomEvent('tokenExpired'));
  }
};

export const getValidToken = (): string | null => {
  const token = localStorage.getItem('token');
  if (isTokenValid(token)) {
    return token;
  }
  
  // Clear invalid token
  clearExpiredToken();
  return null;
};

export const setupTokenValidation = (): void => {
  // Check token validity every 5 minutes
  setInterval(() => {
    clearExpiredToken();
  }, 5 * 60 * 1000);
  
  // Check on page focus
  window.addEventListener('focus', () => {
    clearExpiredToken();
  });
};