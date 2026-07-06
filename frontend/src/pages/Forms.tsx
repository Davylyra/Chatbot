import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiRefreshCw, FiAlertCircle } from 'react-icons/fi';
import Navbar from '../components/Navbar';
import FormCard from '../components/FormCard';
import PaymentModal from '../components/PaymentModal';
import EnhancedSearch from '../components/EnhancedSearch';
// FormCardSkeleton removed - app loads instantly
import { useAppStore } from '../store';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../hooks/useToast';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefreshIndicator';
import { PAYMENT_METHODS } from '../data/constants';
import { contentService, type PageContent } from '../services/contentService';

const Forms: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { showSuccess, showError } = useToast();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedForm, setSelectedForm] = useState<any>(null);
  const [isLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pageContent, setPageContent] = useState<PageContent | null>(null);
  const { forms, loadForms, purchaseForm, addTransaction } = useAppStore();

  useEffect(() => {
    const loadFormsData = async () => {
      if (forms.length === 0) {
        try {
          await loadForms();
        } catch {
          setError('Failed to load forms. Please try again.');
        }
      }
    };

    loadFormsData();
  }, [forms.length, loadForms]);

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

  const handleRefresh = useCallback(async () => {
    setError(null);
    
    try {
      await loadForms();
    } catch {
      setError('Failed to refresh forms. Please try again.');
    }
  }, [loadForms]);

  const { isRefreshing, pullDistance, canRefresh } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: 80,
    resistance: 0.5,
    enabled: !isLoading && !error
  });

  const paymentMethods = PAYMENT_METHODS;

  const handleSearchResultSelect = (_selectedForm: any) => {
  };

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

  const handlePaymentSuccess = async (reference: string) => {
    if (!selectedForm) return;

    try {
      await purchaseForm(selectedForm.id);
      const now = new Date();
      const amountValue = typeof selectedForm.formPrice === 'number'
        ? selectedForm.formPrice
        : parseFloat(String(selectedForm.formPrice).replace(/[^0-9.]/g, '')) || 0;

      addTransaction({
        id: reference,
        universityName: selectedForm.universityName,
        fullName: selectedForm.fullName,
        type: 'Form Purchase',
        date: now.toLocaleDateString(),
        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'completed',
        paymentMethod: 'Mobile Money',
        amount: `GHC ${amountValue.toFixed(2)}`,
        currency: selectedForm.currency || 'GHS',
        reference
      });

      showSuccess(
        'Payment Successful!',
        `Form for ${selectedForm.universityName} has been purchased.`,
        4000
      );
      setShowPaymentModal(false);
      setSelectedForm(null);
    } catch {
      showError(
        'Payment Failed',
        'Please try again or contact support if the issue persists.',
        5000
      );
    }
  };

  const handlePaymentError = (message: string) => {
    showError('Payment Failed', message || 'Unable to complete payment.', 5000);
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
      {selectedForm && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          formData={{
            id: selectedForm.id,
            universityName: selectedForm.universityName,
            fullName: selectedForm.fullName,
            formPrice: selectedForm.formPrice
          }}
          onSuccess={handlePaymentSuccess}
          onError={handlePaymentError}
        />
      )}

    </div>
  );
};

export default Forms;
