import React, { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";

// Decode JWT payload and check if it's still valid — no library needed
function isTokenValid(token: string | null): boolean {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

function clearAuthStorage() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("assessmentCompleted");
}

interface User {
  id: string;
  name: string;
  email: string;
  is_verified?: boolean;
  createdAt?: string;
  assessmentCompleted?: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  isLoading: boolean;
  error: string | null;
  login: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
  signup: (
    name: string,
    email: string,
    password: string,
  ) => Promise<{ success: boolean; message: string; errors?: string[] }>;
  sendSignupVerification: (
    email: string,
  ) => Promise<{ success: boolean; message: string; errors?: string[] }>;
  verifySignup: (
    email: string,
    verificationCode: string,
    name: string,
    password: string,
  ) => Promise<{ success: boolean; message: string; errors?: string[] }>;
  loginAsGuest: () => void;
  updateProfile: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    if (isTokenValid(token) && storedUser) {
      try {
        return JSON.parse(storedUser);
      } catch {
        return null;
      }
    }
    const isGuestSession = sessionStorage.getItem("glinax-guest") === "true";
    const storedGuestUser = sessionStorage.getItem("guest-user");
    if (isGuestSession && storedGuestUser) {
      try {
        return JSON.parse(storedGuestUser);
      } catch {
        return null;
      }
    }
    return null;
  });
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return isTokenValid(localStorage.getItem("token"));
  });
  const [isGuest, setIsGuest] = useState(() => {
    return sessionStorage.getItem("glinax-guest") === "true";
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    // Clear stale/expired tokens on mount
    if (token && !isTokenValid(token)) {
      clearAuthStorage();
      setUser(null);
      setIsAuthenticated(false);
    }
  }, []);

  const login = async (
    email: string,
    password: string,
  ): Promise<{ success: boolean; message: string }> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const authResponse = await response.json();

      if (!response.ok) {
        const message = authResponse.message || "Login failed";
        setError(message);
        return { success: false, message };
      }

      localStorage.setItem("token", authResponse.token);
      localStorage.setItem("user", JSON.stringify(authResponse.user));
      sessionStorage.removeItem("guest-user");
      sessionStorage.removeItem("glinax-guest");

      setUser(authResponse.user);
      setIsAuthenticated(true);
      setIsGuest(false);

      return { success: true, message: "Login successful!" };
    } catch (loginError) {
      const message =
        loginError instanceof Error ? loginError.message : "Login failed";
      console.error("Login error:", message);
      setError(message);
      return { success: false, message };
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (
    name: string,
    email: string,
    password: string,
  ): Promise<{ success: boolean; message: string; errors?: string[] }> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const authResponse = await response.json();

      if (!response.ok) {
        const message = authResponse.message || "Signup failed";
        setError(message);
        return {
          success: false,
          message,
          errors: authResponse.errors || [message],
        };
      }

      return {
        success: true,
        message:
          authResponse.message ||
          "Account created successfully, please log in.",
      };
    } catch (signupError) {
      const message =
        signupError instanceof Error ? signupError.message : "Signup failed";
      console.error("Signup error:", message);
      setError(message);
      return { success: false, message };
    } finally {
      setIsLoading(false);
    }
  };

  const loginAsGuest = () => {
    fetch(`${API_BASE_URL}/auth/guest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
      .then(async (response) => {
        const authResponse = await response.json();
        if (!response.ok)
          throw new Error(authResponse.message || "Guest login failed");

        const guestUser = authResponse.user;
        sessionStorage.setItem("guest-user", JSON.stringify(guestUser));
        sessionStorage.setItem("glinax-guest", "true");

        setUser(guestUser);
        setIsGuest(true);
        setIsAuthenticated(false);
        setError(null);
      })
      .catch((guestLoginError) => {
        console.error("Guest login error:", guestLoginError);
        setError(guestLoginError.message || "Unable to enter guest mode");
      });
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.removeItem("guest-user");
    sessionStorage.removeItem("glinax-guest");

    setUser(null);
    setIsAuthenticated(false);
    setIsGuest(false);
    setError(null);

    window.location.href = "/login";
  };

  const updateProfile = (updates: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...updates };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      setUser(updatedUser);
    }
  };

  const sendSignupVerification = async (
    email: string,
  ): Promise<{ success: boolean; message: string; errors?: string[] }> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/auth/send-signup-verification`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        },
      );

      const verificationResponse = await response.json();

      if (!response.ok) {
        const message =
          verificationResponse.message || "Failed to send verification code";
        setError(message);
        return {
          success: false,
          message,
          errors: verificationResponse.errors || [message],
        };
      }

      return {
        success: true,
        message:
          verificationResponse.message ||
          "Verification code sent to your email",
      };
    } catch (verificationRequestError) {
      const message =
        verificationRequestError instanceof Error
          ? verificationRequestError.message
          : "Failed to send verification code";
      console.error("Send verification error:", message);
      setError(message);
      return { success: false, message };
    } finally {
      setIsLoading(false);
    }
  };

  const verifySignup = async (
    email: string,
    verificationCode: string,
    name: string,
    password: string,
  ): Promise<{ success: boolean; message: string; errors?: string[] }> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          verification_code: verificationCode,
          name,
          password,
        }),
      });

      const verificationResponse = await response.json();

      if (!response.ok) {
        const message = verificationResponse.message || "Verification failed";
        setError(message);
        return {
          success: false,
          message,
          errors: verificationResponse.errors || [message],
        };
      }

      return {
        success: true,
        message:
          verificationResponse.message ||
          "Account created successfully! Please log in.",
      };
    } catch (signupVerificationError) {
      const message =
        signupVerificationError instanceof Error
          ? signupVerificationError.message
          : "Verification failed";
      console.error("Verify signup error:", message);
      setError(message);
      return { success: false, message };
    } finally {
      setIsLoading(false);
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isGuest,
    isLoading,
    error,
    login,
    logout,
    signup,
    sendSignupVerification,
    verifySignup,
    loginAsGuest,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
