import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from '../../components/ProtectedRoute';

const Home = React.lazy(() => import('../Home'));
const Chat = React.lazy(() => import('../Chat'));
const Forms = React.lazy(() => import('../Forms'));
const About = React.lazy(() => import('../About'));
const Settings = React.lazy(() => import('../Settings'));
const Profile = React.lazy(() => import('../Profile'));
const Notifications = React.lazy(() => import('../Notifications'));
const Transactions = React.lazy(() => import('../Transactions'));
const HelpSupport = React.lazy(() => import('../HelpSupport'));
const Login = React.lazy(() => import('../Login'));
const Signup = React.lazy(() => import('../Signup'));
const Universities = React.lazy(() => import('../Universities'));
const Assessment = React.lazy(() => import('../Assessment'));
const ConversationHistoryPage = React.lazy(() => import('../ConversationHistory'));

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
  </div>
);

const AppRoutes = () => {
  return (
    <Router>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute allowGuest={true}>
                <Home />
              </ProtectedRoute>
            }
          />
          <Route path="/about" element={<About />} />
          <Route path="/help-support" element={<HelpSupport />} />

          {/* Auth Routes - Redirect if already authenticated */}
          <Route
            path="/login"
            element={
              <ProtectedRoute requireAuth={false}>
                <Login />
              </ProtectedRoute>
            }
          />
          <Route
            path="/signup"
            element={
              <ProtectedRoute requireAuth={false}>
                <Signup />
              </ProtectedRoute>
            }
          />

          {/* Protected Routes - Require authentication */}
          <Route
            path="/chat"
            element={
              <ProtectedRoute allowGuest={true}>
                <Chat />
              </ProtectedRoute>
            }
          />
          <Route
            path="/forms"
            element={
              <ProtectedRoute allowGuest={true}>
                <Forms />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute allowGuest={true}>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/notifications"
            element={
              <ProtectedRoute allowGuest={true}>
                <Notifications />
              </ProtectedRoute>
            }
          />
          <Route
            path="/recent-chats"
            element={
              <ProtectedRoute allowGuest={true}>
                <ConversationHistoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/transactions"
            element={
              <ProtectedRoute>
                <Transactions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/universities"
            element={
              <ProtectedRoute>
                <Universities />
              </ProtectedRoute>
            }
          />
          <Route
            path="/assessment"
            element={
              <ProtectedRoute allowGuest={true}>
                <Assessment />
              </ProtectedRoute>
            }
          />
          <Route
            path="/conversation-history"
            element={
              <ProtectedRoute allowGuest={true}>
                <ConversationHistoryPage />
              </ProtectedRoute>
            }
          />

          {/* Catch all route - redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
};

export default AppRoutes;
