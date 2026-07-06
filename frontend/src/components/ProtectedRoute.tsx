/**
 * Component: ProtectedRoute
 * Description: Route protection with authentication and loading states
 * Features: Authentication checks, redirect handling, loading states
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

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
  redirectTo = '/login',
}) => {
  const { isAuthenticated, isGuest } = useAuth();
  const location = useLocation();

  if (allowGuest) {
    if (isAuthenticated || isGuest) {
      return <>{children}</>;
    }
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  if (requireAuth && !isAuthenticated) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  if (!requireAuth && isAuthenticated && !isGuest) {
    const from = location.state?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
