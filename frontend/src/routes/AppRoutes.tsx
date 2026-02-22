import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from '../pages/Home';
import Chat from '../pages/Chat';
import Forms from '../pages/Forms';
import About from '../pages/About';
import Settings from '../pages/Settings';
import Profile from '../pages/Profile';
import Notifications from '../pages/Notifications';
import RecentChats from '../pages/RecentChats';
import Transactions from '../pages/Transactions';
import HelpSupport from '../pages/HelpSupport';
import Login from '../pages/Login';
import Signup from '../pages/Signup';
import Universities from '../pages/Universities';
import Assessment from '../pages/Assessment';
import ConversationHistoryPage from '../pages/ConversationHistory';
import ProtectedRoute from '../components/ProtectedRoute';

const AppRoutes = () => {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Home />} />
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
            <ProtectedRoute>
              <RecentChats />
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
    </Router>
  );
};

export default AppRoutes;
