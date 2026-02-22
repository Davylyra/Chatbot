/**
 * PRODUCTION-READY PAYMENT MODAL - Mobile Money Integration
 * Supports MTN, Vodafone, AirtelTigo via Paystack
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiPhone, FiCreditCard, FiAlertCircle, FiCheckCircle } from 'react-icons/fi';
import { useTheme } from '../contexts/ThemeContext';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  formData: {
    id: string;
    universityName: string;
    fullName: string;
    formPrice: number | string;
  };
  onSuccess: (reference: string) => void;
  onError: (error: string) => void;
}

type PaymentMethod = 'mtn' | 'vodafone' | 'airteltigo';

const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  formData,
  onSuccess,
  onError
}) => {
  const { theme } = useTheme();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('mtn');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

  const paymentMethods = [
    {
      id: 'mtn' as PaymentMethod,
      name: 'MTN Mobile Money',
      logo: '💛',
      prefixes: ['024', '054', '055', '059']
    },
    {
      id: 'vodafone' as PaymentMethod,
      name: 'Vodafone Cash',
      logo: '❤️',
      prefixes: ['020', '050']
    },
    {
      id: 'airteltigo' as PaymentMethod,
      name: 'AirtelTigo Money',
      logo: '💙',
      prefixes: ['027', '057', '026', '056']
    }
  ];

  const formatPhoneNumber = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');
    
    // Format as Ghana number (10 digits)
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
  };

  const validatePhoneNumber = (phone: string): boolean => {
    const digits = phone.replace(/\D/g, '');
    return digits.length === 10 && /^0[2-5][0-9]{8}$/.test(digits);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhoneNumber(formatted);
    setError(null);
  };

  const initializePayment = async () => {
    try {
      setProcessing(true);
      setError(null);

      const rawPhone = phoneNumber.replace(/\D/g, '');
      
      if (!validatePhoneNumber(rawPhone)) {
        throw new Error('Please enter a valid 10-digit Ghana phone number');
      }

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Please log in to make a payment');
      }

      console.log('💳 Initializing payment:', {
        formId: formData.id,
        amount: formData.formPrice,
        phone: rawPhone,
        method: selectedMethod
      });

      const storedUser = localStorage.getItem('user');
      const parsedUser = storedUser ? JSON.parse(storedUser) : null;

      const providerCode = selectedMethod === 'mtn' ? 'mtn' : selectedMethod === 'vodafone' ? 'vod' : 'tgo';

      const response = await fetch(`${API_BASE_URL}/payments/initialize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: parsedUser?.email || '',
          formId: formData.id,
          amount: typeof formData.formPrice === 'string' 
            ? parseFloat(formData.formPrice.replace(/[^0-9.]/g, ''))
            : formData.formPrice,
          mobileMoneyNumber: rawPhone,
          mobileMoneyProvider: providerCode,
          paymentMethod: 'mobile_money',
          metadata: {
            universityName: formData.universityName,
            formName: formData.fullName
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Payment initialization failed');
      }

      const data = await response.json();
      
      if (!data.success || !data.data?.reference) {
        throw new Error(data.message || 'Invalid payment response');
      }

      console.log('✅ Payment initialized:', data.data.reference);

      // Start verification polling
      startPaymentVerification(data.data.reference);

    } catch (err: any) {
      console.error('❌ Payment initialization error:', err);
      setError(err.message || 'Failed to initialize payment');
      setProcessing(false);
    }
  };

  const startPaymentVerification = async (ref: string) => {
    setVerifying(true);
    let attempts = 0;
    const maxAttempts = 20; // 20 attempts * 5 seconds = 100 seconds max

    const verify = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/payments/verify/${ref}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        const data = await response.json();

        if (data.success && data.status === 'success') {
          console.log('✅ Payment verified successfully');
          setVerifying(false);
          setProcessing(false);
          onSuccess(ref);
          onClose();
          return true;
        } else if (data.status === 'failed') {
          throw new Error('Payment was declined. Please try again.');
        }

        // Continue polling
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(verify, 5000); // Check every 5 seconds
        } else {
          throw new Error('Payment verification timeout. Please check your transaction history.');
        }

      } catch (err: any) {
        console.error('❌ Payment verification error:', err);
        setVerifying(false);
        setProcessing(false);
        setError(err.message);
        onError(err.message);
      }
    };

    verify();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    initializePayment();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className={`relative w-full max-w-md rounded-2xl shadow-2xl ${
            theme === 'dark' ? 'bg-gray-800' : 'bg-white'
          }`}
        >
          {/* Header */}
          <div className={`flex items-center justify-between p-6 border-b ${
            theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
          }`}>
            <div>
              <h3 className={`text-xl font-bold ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                Complete Payment
              </h3>
              <p className={`text-sm mt-1 ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}>
                {formData.universityName}
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={processing}
              className={`p-2 rounded-lg transition-colors ${
                theme === 'dark'
                  ? 'hover:bg-gray-700 text-gray-400'
                  : 'hover:bg-gray-100 text-gray-600'
              } ${processing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <FiX className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Amount Display */}
            <div className={`p-4 rounded-lg text-center ${
              theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'
            }`}>
              <p className={`text-sm mb-1 ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}>
                Amount to Pay
              </p>
              <p className={`text-3xl font-bold ${
                theme === 'dark' ? 'text-green-400' : 'text-green-600'
              }`}>
                GH₵ {typeof formData.formPrice === 'string' 
                  ? formData.formPrice.replace(/[^0-9.]/g, '')
                  : formData.formPrice.toFixed(2)}
              </p>
            </div>

            {/* Payment Method Selection */}
            <div>
              <label className={`block text-sm font-medium mb-3 ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
              }`}>
                Select Payment Method
              </label>
              <div className="grid grid-cols-1 gap-3">
                {paymentMethods.map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setSelectedMethod(method.id)}
                    disabled={processing}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      selectedMethod === method.id
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : theme === 'dark'
                          ? 'border-gray-700 hover:border-gray-600'
                          : 'border-gray-200 hover:border-gray-300'
                    } ${processing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span className="text-2xl">{method.logo}</span>
                        <div className="text-left">
                          <p className={`font-semibold ${
                            theme === 'dark' ? 'text-white' : 'text-gray-900'
                          }`}>
                            {method.name}
                          </p>
                          <p className={`text-xs ${
                            theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                          }`}>
                            {method.prefixes.join(', ')}
                          </p>
                        </div>
                      </div>
                      {selectedMethod === method.id && (
                        <FiCheckCircle className="w-5 h-5 text-primary-500" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Phone Number Input */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
              }`}>
                Mobile Money Number
              </label>
              <div className="relative">
                <FiPhone className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`} />
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={handlePhoneChange}
                  placeholder="024 123 4567"
                  maxLength={12}
                  disabled={processing}
                  className={`w-full pl-10 pr-4 py-3 rounded-lg border ${
                    theme === 'dark'
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                  } focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                    processing ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  required
                />
              </div>
              <p className={`text-xs mt-1 ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`}>
                Enter the number you'll approve the payment from
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start space-x-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
              >
                <FiAlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </motion.div>
            )}

            {/* Verification Status */}
            {verifying && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start space-x-2 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                    Waiting for payment approval...
                  </p>
                  <p className="text-xs mt-1 text-blue-600 dark:text-blue-500">
                    Please check your phone and approve the payment prompt from {
                      paymentMethods.find(m => m.id === selectedMethod)?.name
                    }
                  </p>
                </div>
              </motion.div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={processing || !phoneNumber || !validatePhoneNumber(phoneNumber.replace(/\D/g, ''))}
              className={`w-full py-4 rounded-lg font-semibold text-white transition-all ${
                processing || !phoneNumber || !validatePhoneNumber(phoneNumber.replace(/\D/g, ''))
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-primary-600 hover:bg-primary-700 active:scale-95'
              }`}
            >
              {processing ? (
                <span className="flex items-center justify-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2"
                  />
                  {verifying ? 'Verifying Payment...' : 'Processing...'}
                </span>
              ) : (
                <span className="flex items-center justify-center">
                  <FiCreditCard className="w-5 h-5 mr-2" />
                  Pay GH₵ {typeof formData.formPrice === 'string' 
                    ? formData.formPrice.replace(/[^0-9.]/g, '')
                    : formData.formPrice.toFixed(2)}
                </span>
              )}
            </button>

            {/* Security Notice */}
            <p className={`text-xs text-center ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
            }`}>
              🔒 Secured by Paystack. Your payment information is safe and encrypted.
            </p>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default PaymentModal;
