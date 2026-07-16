/**
 * Authentication utilities for token management and validation
 */

export const isTokenValid = (token: string | null): boolean => {
  if (!token) return false;

  try {
    // Basic JWT validation - check if it has 3 parts
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    const payload = JSON.parse(atob(parts[1]));
    const currentTime = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < currentTime) {
      return false;
    }

    return true;
  } catch (error) {
    console.error("Token validation error:", error);
    return false;
  }
};

export const clearExpiredToken = (): void => {
  const token = localStorage.getItem("token");
  if (token && !isTokenValid(token)) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    window.dispatchEvent(new CustomEvent("tokenExpired"));
  }
};

export const getValidToken = (): string | null => {
  const token = localStorage.getItem("token");
  if (isTokenValid(token)) {
    return token;
  }

  clearExpiredToken();
  return null;
};

export const setupTokenValidation = (): void => {
  setInterval(
    () => {
      clearExpiredToken();
    },
    5 * 60 * 1000,
  );

  window.addEventListener("focus", () => {
    clearExpiredToken();
  });
};
