import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from '../Home';
import Chat from '../Chat';
import Forms from '../Forms';
import About from '../About';
import Settings from '../Settings';
import Profile from '../Profile';
import Notifications from '../Notifications';
import Transactions from '../Transactions';
import HelpSupport from '../HelpSupport';
import Login from '../Login';
import Signup from '../Signup';
import Universities from '../Universities';
import Assessment from '../Assessment';
import ConversationHistoryPage from '../ConversationHistory';
import ProtectedRoute from '../../components/ProtectedRoute';

const AppRoutes = () => {
  return (
    <Router>
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
    </Router>
  );
};

export default AppRoutes;
