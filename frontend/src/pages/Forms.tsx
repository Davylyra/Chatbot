import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiInfo, FiRefreshCw, FiAlertCircle } from 'react-icons/fi';
import Navbar from '../components/Navbar';
import FormCard from '../components/FormCard';
import EmailVerificationModal from '../components/EmailVerificationModal';
import EnhancedSearch from '../components/EnhancedSearch';
// FormCardSkeleton removed - app loads instantly
import { useAppStore } from '../store';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefreshIndicator';
import { PAYMENT_METHODS } from '../data/constants';
import { formatPrice } from '../utils/formatters';
import { contentService, type PageContent } from '../services/contentService';

const Forms: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { user, isGuest } = useAuth();
  const { showSuccess, showError } = useToast();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEmailVerification, setShowEmailVerification] = useState(false);
  const [selectedForm, setSelectedForm] = useState<any>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pageContent, setPageContent] = useState<PageContent | null>(null);
  const { forms, loadForms, purchaseForm } = useAppStore();

  // Load forms data and page content
  useEffect(() => {
    const loadFormsData = async () => {
      if (forms.length === 0) {
        try {
          await loadForms();
        } catch {
          setError('Failed to load forms. Please try again.');
          // Forms loading error - handled gracefully
        }
      }
    };

    loadFormsData();
  }, [forms.length, loadForms]);

  // Load page content
  useEffect(() => {
    const loadPageContent = async () => {
      try {
        const content = await contentService.getPageContent('forms');
        setPageContent(content);
      } catch (error) {
        console.error('Failed to load page content:', error);
      }
    };

    loadPageContent();
  }, []);

  // Handle refresh - Optimized with useCallback
  const handleRefresh = useCallback(async () => {
    setError(null);
    
    try {
      await loadForms();
    } catch {
      setError('Failed to refresh forms. Please try again.');
      // Forms refresh error - handled gracefully
    }
  }, [loadForms]);

  // Pull to refresh functionality
  const { isRefreshing, pullDistance, canRefresh } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: 80,
    resistance: 0.5,
    enabled: !isLoading && !error
  });

  // Use dynamic payment methods from constants
  const paymentMethods = PAYMENT_METHODS;

  // Handle search result selection
  const handleSearchResultSelect = (_selectedForm: any) => {
    // You can add custom logic here, like highlighting the selected form
    // Form selected via search
  };

  // Filter forms based on search query - Optimized with useMemo
  const filteredForms = useMemo(() => 
    searchQuery
      ? forms.filter(form =>
          form.universityName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          form.fullName.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : forms,
    [searchQuery, forms]
  );

  const handleBuyForm = useCallback((form: any) => {
    setSelectedForm(form);
    setShowPaymentModal(true);
  }, []);

  // Check if user email is verified (mock implementation)
  const isEmailVerified = () => {
    // Guest users can proceed without email verification
    if (isGuest) {
      return true;
    }
    
    // TODO: Replace with real API call to check email verification status
    // For authenticated users, check their email verification status
    // For now, we'll assume email is verified for authenticated users
    return user && user.email !== 'guest@glinax.com';
  };

  const handlePayment = async () => {
    if (!selectedForm || !selectedPaymentMethod) return;
    
    // Check if email is verified
    if (!isEmailVerified()) {
      setShowPaymentModal(false);
      setShowEmailVerification(true);
      return;
    }
    
    // Proceed with payment if email is verified
    await processPayment();
  };

  const processPayment = async () => {
    if (!selectedForm) return;
    
    setIsProcessingPayment(true);
    
    try {
      await purchaseForm(selectedForm.id);
      showSuccess(
        'Payment Successful!',
        `Form for ${selectedForm.universityName} has been purchased.`,
        4000
      );
      setShowPaymentModal(false);
      setSelectedForm(null);
      setSelectedPaymentMethod('');
    } catch {
      showError(
        'Payment Failed',
        'Please try again or contact support if the issue persists.',
        5000
      );
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleEmailVerified = () => {
    setShowEmailVerification(false);
    setShowPaymentModal(true);
  };

  const handleResendVerificationCode = async () => {
    // TODO: Replace with real API call
    // const response = await authApi.sendEmailVerification(user?.email);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock success
    // Verification code sent successfully
  };

  return (
    <div className={`min-h-screen ${
      theme === 'dark' 
        ? 'bg-gradient-to-b from-transparent via-gray-800/50 to-gray-800' 
        : 'bg-gradient-to-b from-transparent via-white/50 to-white'
    }`}>
      {/* Pull to Refresh Indicator */}
      <PullToRefreshIndicator
        isRefreshing={isRefreshing}
        pullDistance={pullDistance}
        canRefresh={canRefresh}
        threshold={80}
        theme={theme}
      />
      
      <Navbar 
        title="BUY ADMISSION FORMS"
        showBackButton={true}
        onBackClick={() => navigate('/')}
        showMenuButton={false}
      />

      <div className="max-w-md mx-auto px-4 py-6">
        {/* App loads instantly - no loading states */}

        {/* Error State - Only show if critical */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <div className={`p-6 rounded-2xl text-center border ${
              theme === 'dark' 
                ? 'bg-red-900/20 border-red-700/50' 
                : 'bg-red-50 border-red-200'
            }`}>
              <FiAlertCircle className={`w-8 h-8 mx-auto mb-3 ${
                theme === 'dark' ? 'text-red-400' : 'text-red-600'
              }`} />
              <h3 className={`text-lg font-semibold mb-2 ${
                theme === 'dark' ? 'text-red-400' : 'text-red-600'
              }`}>
                Error Loading Forms
              </h3>
              <p className={`text-sm mb-4 ${
                theme === 'dark' ? 'text-red-300' : 'text-red-700'
              }`}>
                {error}
              </p>
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm transition-colors flex items-center space-x-2 mx-auto"
              >
                <FiRefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Try Again</span>
              </button>
            </div>
          </motion.div>
        )}

        {/* Main Content - Only show when not loading and no error */}
        {!isLoading && !error && (
          <>
        {/* Enhanced Search Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <EnhancedSearch
            data={forms}
            searchFields={['universityName', 'fullName']}
            placeholder="Search universities and forms..."
            onResultSelect={handleSearchResultSelect}
            onSearch={setSearchQuery}
            showSuggestions={true}
            theme={theme}
          />
        </motion.div>

        {/* Payment Methods */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={` rounded-2xl p-4 mb-6 border transition-all duration-200 ${
            theme === 'dark' 
              ? 'glass-card-unified-dark' 
              : 'glass-card-unified'
          }`}
        >
          <h3 className={`font-semibold mb-3 transition-colors duration-200 ${
            theme === 'dark' ? 'text-white' : 'text-gray-800'
          }`}>
            {pageContent?.sections.find(s => s.id === 'payment-methods-title')?.title || 'Secure Mobile Money Payment'}
          </h3>
          <p className={`text-sm mb-4 transition-colors duration-200 ${
            theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
          }`}>
            {pageContent?.sections.find(s => s.id === 'payment-methods-title')?.content || 'Make payments via'}
          </p>
          <div className="flex space-x-3">
            {paymentMethods.map((method, index) => (
              <motion.div
                key={method.name}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + index * 0.1 }}
                className={`${method.color} text-white px-4 py-2 rounded-lg text-sm font-medium`}
              >
                {method.name}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Email Verification Notice */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className={` rounded-2xl p-4 mb-6 border transition-all duration-200 ${
            theme === 'dark' 
              ? 'glass-card-unified-dark' 
              : 'glass-card-unified'
          }`}
        >
          <div className="flex items-start space-x-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-200 ${
              theme === 'dark' ? 'bg-red-900/50' : 'bg-red-100'
            }`}>
              <FiInfo className={`w-4 h-4 transition-colors duration-200 ${
                theme === 'dark' ? 'text-red-400' : 'text-red-600'
              }`} />
            </div>
            <div>
              <h4 className={`font-semibold mb-1 transition-colors duration-200 ${
                theme === 'dark' ? 'text-white' : 'text-gray-800'
              }`}>
                {pageContent?.sections.find(s => s.id === 'email-verification-title')?.title || 'Email Verification Required'}
              </h4>
              <p className={`text-sm transition-colors duration-200 ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
              }`}>
                {pageContent?.sections.find(s => s.id === 'email-verification-title')?.content || 'Please verify your email address before purchasing forms. You\'ll receive a verification code when initiating payment.'}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Forms List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="space-y-4"
        >
          {filteredForms.length > 0 ? (
            filteredForms.map((form, index) => (
              <motion.div
                key={form.universityName}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + index * 0.1 }}
              >
                <FormCard
                  universityName={form.universityName}
                  fullName={form.fullName}
                  formPrice={form.formPrice}
                  currency={form.currency || 'GHS'}
                  deadline={form.deadline}
                  isAvailable={form.isAvailable}
                  onBuyClick={() => handleBuyForm(form)}
                  logo={form.logo}
                  status={form.status || 'available'}
                  daysUntilDeadline={form.daysUntilDeadline}
                  lastUpdated={form.lastUpdated}
                />
              </motion.div>
            ))
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-12"
            >
              <div className={`text-lg font-medium mb-2 ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}>
                {searchQuery ? 'No forms found matching your search.' : (pageContent?.sections.find(s => s.id === 'empty-state')?.content || 'No admission forms available.')}
              </div>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className={`text-sm transition-colors duration-200 ${
                    theme === 'dark' ? 'text-primary-400 hover:text-primary-300' : 'text-primary-600 hover:text-primary-700'
                  }`}
                >
                  Clear search
                </button>
              )}
            </motion.div>
          )}
        </motion.div>
          </>
        )}
      </div>

      {/* Payment Modal */}
      {showPaymentModal && selectedForm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowPaymentModal(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className={`p-6 max-w-sm w-full ${
              theme === 'dark' ? 'glass-modal-dark' : 'glass-modal'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={`text-lg font-bold mb-4 transition-colors duration-200 ${
              theme === 'dark' ? 'text-white' : 'text-gray-800'
            }`}>Confirm Payment</h3>
            
            {/* Guest Mode Notice */}
            {isGuest && (
              <div className={`p-3 rounded-lg mb-4 border ${
                theme === 'dark' 
                  ? 'bg-blue-900/20 border-blue-700/50' 
                  : 'bg-blue-50 border-blue-200'
              }`}>
                <p className={`text-sm ${
                  theme === 'dark' ? 'text-blue-300' : 'text-blue-700'
                }`}>
                  <strong>{pageContent?.sections.find(s => s.id === 'guest-notice')?.title || 'Guest Mode'}:</strong> {pageContent?.sections.find(s => s.id === 'guest-notice')?.content || 'You\'re purchasing as a guest. Consider creating an account to save your purchase history.'}
                </p>
              </div>
            )}
            
            <div className="space-y-4 mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center">
                  <span className="text-primary-600 font-bold text-lg">
                    {selectedForm.universityName.charAt(0)}
                  </span>
                </div>
                <div>
                  <h4 className={`font-semibold transition-colors duration-200 ${
                    theme === 'dark' ? 'text-white' : 'text-gray-800'
                  }`}>{selectedForm.universityName}</h4>
                  <p className={`text-sm transition-colors duration-200 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  }`}>{selectedForm.fullName}</p>
                </div>
              </div>
              
              <div className={`flex items-center justify-between p-3 rounded-lg transition-colors duration-200 ${
                theme === 'dark' ? 'bg-white/5' : 'bg-gray-50'
              }`}>
                <span className={`transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                }`}>Total Amount:</span>
                <span className={`font-bold text-lg transition-colors duration-200 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-800'
                }`}>
                  {typeof selectedForm.formPrice === 'number' 
                    ? formatPrice(selectedForm.formPrice, { 
                        currency: selectedForm.currency || 'GHS',
                        showSymbol: true 
                      })
                    : selectedForm.buyPrice || selectedForm.formPrice
                  }
                </span>
              </div>

              {/* Payment Method Selection */}
              <div>
                <label className={`block text-sm font-medium mb-2 transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Select Payment Method
                </label>
                <div className="space-y-2">
                  {paymentMethods.map((method) => (
                    <button
                      key={method.name}
                      onClick={() => setSelectedPaymentMethod(method.name)}
                      className={`w-full p-3 rounded-lg border transition-all duration-200 ${
                        selectedPaymentMethod === method.name
                          ? theme === 'dark'
                            ? 'border-primary-500 bg-primary-500/10'
                            : 'border-primary-500 bg-primary-50'
                          : theme === 'dark'
                          ? 'border-white/20 hover:border-white/30'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-full ${method.color} flex items-center justify-center`}>
                          <span className="text-white text-xs font-bold">
                            {method.name.charAt(0)}
                          </span>
                        </div>
                        <span className={`font-medium transition-colors duration-200 ${
                          selectedPaymentMethod === method.name
                            ? theme === 'dark'
                              ? 'text-primary-300'
                              : 'text-primary-700'
                            : theme === 'dark'
                            ? 'text-white'
                            : 'text-gray-800'
                        }`}>
                          {method.name}
                        </span>
                        {selectedPaymentMethod === method.name && (
                          <div className="ml-auto w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center">
                            <span className="text-white text-xs">✓</span>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex space-x-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setShowPaymentModal(false);
                  setSelectedPaymentMethod('');
                }}
                className={`flex-1 py-3 px-4 border rounded-xl font-medium transition-all duration-200 ${
                  theme === 'dark'
                    ? 'border-white/20 text-gray-300 hover:bg-white/10 hover:text-white'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Cancel
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handlePayment}
                disabled={!selectedPaymentMethod || isProcessingPayment}
                className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all duration-200 ${
                  !selectedPaymentMethod || isProcessingPayment
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-primary-600 hover:bg-primary-700 text-white hover:scale-105'
                }`}
              >
                {isProcessingPayment ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Processing...</span>
                  </div>
                ) : (
                  'Pay Now'
                )}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Email Verification Modal */}
      <EmailVerificationModal
        isOpen={showEmailVerification}
        onClose={() => setShowEmailVerification(false)}
        onVerified={handleEmailVerified}
        userEmail={user?.email || ''}
        onResendCode={handleResendVerificationCode}
      />
    </div>
  );
};

export default Forms;
