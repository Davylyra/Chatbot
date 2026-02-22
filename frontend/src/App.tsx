import React, { memo } from 'react';
import AppRoutes from './routes/AppRoutes';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { ConfigProvider } from './contexts/ConfigContext';
import ErrorBoundary from './components/ErrorBoundary';
import ToastContainer from './components/ToastContainer';
import { useAccessibility } from './hooks/useAccessibility';
import { useToast } from './hooks/useToast';
import { useSocket } from './hooks/useSocket';

const AppContent = memo(() => {
  const { theme } = useTheme();
  const { toasts, removeToast } = useToast();
  const { requestNotificationPermission } = useSocket();

  useAccessibility({
    enableKeyboardNavigation: true,
    enableFocusManagement: true,
    enableScreenReader: true
  });

  React.useEffect(() => {
    requestNotificationPermission();
  }, [requestNotificationPermission]);
  
  return (
    <div 
      id="main-content"
      className="relative min-h-screen w-full overflow-hidden scrollbar-hide"
      role="main"
      aria-label="Glinax Chatbot Application"
    >
      <div 
        className={`absolute inset-0 transition-colors duration-200 ${
          theme === 'dark' 
            ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' 
            : 'bg-gradient-to-br from-white via-[#e0f2ff] to-[#d6ecff]'
        }`}
      />
      
      <div 
        className="absolute inset-0 backdrop-blur-xl pointer-events-none"
        style={{
          background: theme === 'dark' 
            ? 'rgba(0, 0, 0, 0.1)' 
            : 'rgba(255, 255, 255, 0.3)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)'
        }}
      />
      
      <main className="relative z-10">
        <AppRoutes />
      </main>

      <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
    </div>
  );
});

AppContent.displayName = 'AppContent';

const App = memo(() => {
  return (
    <ErrorBoundary>
      <ConfigProvider>
        <ThemeProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </ThemeProvider>
      </ConfigProvider>
    </ErrorBoundary>
  );
});

App.displayName = 'App';

export default App;
