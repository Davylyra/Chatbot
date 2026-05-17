import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
  is_verified?: boolean;
  createdAt?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
  signup: (name: string, email: string, password: string) => Promise<{ success: boolean; message: string; errors?: string[] }>;
  sendSignupVerification: (email: string) => Promise<{ success: boolean; message: string; errors?: string[] }>;
  verifySignup: (email: string, code: string, name: string, password: string) => Promise<{ success: boolean; message: string; errors?: string[] }>;
  loginAsGuest: () => void;
  updateProfile: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkSession = () => {
      const token = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');
      const isGuestSession = localStorage.getItem('glinax-guest') === 'true';

      if (token) {
        if (storedUser) {
          try {
            const userData = JSON.parse(storedUser);
            setUser(userData);
            setIsAuthenticated(true);
            setIsGuest(false);
          } catch (err) {
            console.error('Failed to parse stored user:', err);
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('glinax-guest');
          }
        }
        return;
      }

      if (isGuestSession && storedUser) {
        try {
          const userData = JSON.parse(storedUser);
          setUser(userData);
          setIsGuest(true);
          setIsAuthenticated(false);
        } catch (err) {
          console.error('Failed to parse guest user:', err);
          localStorage.removeItem('user');
          localStorage.removeItem('glinax-guest');
        }
      }
    };

    checkSession();
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; message: string }> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        const message = data.message || 'Login failed';
        setError(message);
        return { success: false, message };
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.removeItem('glinax-guest');
      
      setUser(data.user);
      setIsAuthenticated(true);
      setIsGuest(false);

      return { success: true, message: 'Login successful!' };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      console.error('Login error:', message);
      setError(message);
      return { success: false, message };
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (name: string, email: string, password: string): Promise<{ success: boolean; message: string; errors?: string[] }> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        const message = data.message || 'Signup failed';
        setError(message);
        return { 
          success: false, 
          message,
          errors: data.errors || [message]
        };
      }

      return { success: true, message: data.message || 'Account created successfully, please log in.' };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Signup failed';
      console.error('Signup error:', message);
      setError(message);
      return { success: false, message };
    } finally {
      setIsLoading(false);
    }
  };

  const loginAsGuest = () => {
    fetch(`${API_BASE_URL}/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Guest login failed');

        const guestUser = data.user;
        localStorage.setItem('user', JSON.stringify(guestUser));
        localStorage.setItem('glinax-guest', 'true');

        setUser(guestUser);
        setIsGuest(true);
        setIsAuthenticated(false);
        setError(null);
      })
      .catch((err) => {
        console.error('Guest login error:', err);
        setError(err.message || 'Unable to enter guest mode');
      });
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('glinax-guest');
    
    setUser(null);
    setIsAuthenticated(false);
    setIsGuest(false);
    setError(null);
    
    window.location.href = '/login';
  };

  const updateProfile = (updates: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...updates };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
    }
  };

  const sendSignupVerification = async (email: string): Promise<{ success: boolean; message: string; errors?: string[] }> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/auth/send-signup-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (!response.ok) {
        const message = data.message || 'Failed to send verification code';
        setError(message);
        return { 
          success: false, 
          message,
          errors: data.errors || [message]
        };
      }

      return { success: true, message: data.message || 'Verification code sent to your email' };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send verification code';
      console.error('Send verification error:', message);
      setError(message);
      return { success: false, message };
    } finally {
      setIsLoading(false);
    }
  };

  const verifySignup = async (email: string, code: string, name: string, password: string): Promise<{ success: boolean; message: string; errors?: string[] }> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, verification_code: code, name, password })
      });

      const data = await response.json();

      if (!response.ok) {
        const message = data.message || 'Verification failed';
        setError(message);
        return { 
          success: false, 
          message,
          errors: data.errors || [message]
        };
      }

      return { success: true, message: data.message || 'Account created successfully! Please log in.' };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Verification failed';
      console.error('Verify signup error:', message);
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

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};