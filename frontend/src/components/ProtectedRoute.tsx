/**
 * Component: ProtectedRoute
 * Description: Route protection with authentication and loading states
 * Features: Authentication checks, redirect handling, loading states
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
// LoadingSpinner removed - app loads instantly

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  allowGuest?: boolean;
  redirectTo?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAuth = true,
  allowGuest = false,
  redirectTo = '/login'
}) => {
  const { isAuthenticated, isGuest } = useAuth();
  const location = useLocation();

  // App loads instantly - no authentication loading

  // Allow guest access if allowGuest is true
  if (allowGuest) {
    // Allow if user is authenticated OR explicitly in guest mode
    if (isAuthenticated || isGuest) {
      return <>{children}</>;
    }
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }
  
  // Redirect to login if authentication is required but user is not authenticated
  if (requireAuth && !isAuthenticated) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // Redirect to home if user is authenticated (but not guest) and trying to access auth pages
  if (!requireAuth && isAuthenticated && !isGuest) {
    const from = location.state?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
