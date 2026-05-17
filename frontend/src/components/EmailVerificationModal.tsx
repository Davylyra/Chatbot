import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiMail, FiX, FiCheck, FiRefreshCw } from 'react-icons/fi';
import { useTheme } from '../contexts/ThemeContext';

interface EmailVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: (code: string) => Promise<void>;
  userEmail: string;
  onResendCode: () => Promise<void>;
}

const EmailVerificationModal: React.FC<EmailVerificationModalProps> = ({
  isOpen,
  onClose,
  onVerified,
  userEmail,
  onResendCode
}) => {
  const { theme } = useTheme();
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300);

  useEffect(() => {
    if (timeLeft > 0 && isOpen) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setVerificationCode('');
      setError(null);
      setSuccess(false);
      setTimeLeft(300);
    }
  }, [isOpen]);

  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) {
      setError('Please enter the verification code');
      return;
    }

    if (verificationCode.length !== 6) {
      setError('Verification code must be 6 digits');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      // Call the onVerified callback with the code
      await onVerified(verificationCode);
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendCode = async () => {
    setIsResending(true);
    setError(null);

    try {
      await onResendCode();
      setTimeLeft(300);
      setError(null);
    } catch {
      setError('Failed to resend code. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className={`max-w-md w-full ${
            theme === 'dark' ? 'glass-modal-dark' : 'glass-modal'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/20">
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                success 
                  ? 'bg-green-500' 
                  : theme === 'dark' ? 'bg-blue-500' : 'bg-blue-600'
              }`}>
                {success ? (
                  <FiCheck className="w-5 h-5 text-white" />
                ) : (
                  <FiMail className="w-5 h-5 text-white" />
                )}
              </div>
              <div>
                <h3 className={`font-semibold transition-colors duration-200 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-800'
                }`}>
                  {success ? 'Email Verified!' : 'Verify Your Email'}
                </h3>
                <p className={`text-sm transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  {success ? 'You can now proceed with payment' : 'Enter the code sent to your email'}
                </p>
              </div>
            </div>
            <button 
              onClick={onClose}
              aria-label="Close verification modal"
              className={`p-2 rounded-full transition-colors duration-200 ${
                theme === 'dark' 
                  ? 'hover:bg-white/10 text-gray-400 hover:text-white' 
                  : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
              }`}
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {!success ? (
              <>
                {/* Email Display */}
                <div className={`p-4 rounded-xl mb-6 ${
                  theme === 'dark' 
                    ? 'bg-white/5 border border-white/10' 
                    : 'bg-gray-50 border border-gray-200'
                }`}>
                  <p className={`text-sm transition-colors duration-200 ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    Verification code sent to:
                  </p>
                  <p className={`font-medium transition-colors duration-200 ${
                    theme === 'dark' ? 'text-white' : 'text-gray-800'
                  }`}>
                    {userEmail}
                  </p>
                </div>

                {/* Code Input */}
                <div className="mb-6">
                  <label className={`block text-sm font-medium mb-2 transition-colors duration-200 ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Enter 6-digit verification code
                  </label>
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setVerificationCode(value);
                      setError(null);
                    }}
                    placeholder="123456"
                    className={`w-full px-4 py-3 rounded-xl border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                      theme === 'dark'
                        ? 'glass-input-dark text-white placeholder-gray-400'
                        : 'glass-input text-gray-900 placeholder-gray-500'
                    }`}
                    maxLength={6}
                    autoComplete="one-time-code"
                  />
                </div>

                {/* Error Message */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-3 rounded-xl mb-4 bg-red-500/10 border border-red-500/20`}
                  >
                    <p className="text-red-500 text-sm">{error}</p>
                  </motion.div>
                )}

                {/* Resend Code */}
                <div className="flex items-center justify-between mb-6">
                  <p className={`text-sm transition-colors duration-200 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Didn't receive the code?
                  </p>
                  <button
                    onClick={handleResendCode}
                    disabled={isResending || timeLeft > 0}
                    className={`text-sm font-medium transition-colors duration-200 ${
                      isResending || timeLeft > 0
                        ? 'text-gray-400 cursor-not-allowed'
                        : theme === 'dark'
                        ? 'text-blue-400 hover:text-blue-300'
                        : 'text-blue-600 hover:text-blue-700'
                    }`}
                  >
                    {isResending ? (
                      <div className="flex items-center space-x-2">
                        <FiRefreshCw className="w-4 h-4 animate-spin" />
                        <span>Sending...</span>
                      </div>
                    ) : timeLeft > 0 ? (
                      `Resend in ${formatTime(timeLeft)}`
                    ) : (
                      'Resend Code'
                    )}
                  </button>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-3">
                  <button
                    onClick={onClose}
                    className={`flex-1 px-4 py-3 rounded-xl font-medium transition-all duration-200 ${
                      theme === 'dark'
                        ? 'bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-800'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleVerifyCode}
                    disabled={isVerifying || !verificationCode.trim()}
                    className={`flex-1 px-4 py-3 rounded-xl font-medium transition-all duration-200 ${
                      isVerifying || !verificationCode.trim()
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-primary-600 hover:bg-primary-700 text-white hover:scale-105'
                    }`}
                  >
                    {isVerifying ? (
                      <div className="flex items-center justify-center space-x-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Verifying...</span>
                      </div>
                    ) : (
                      'Verify Email'
                    )}
                  </button>
                </div>
              </>
            ) : (
              /* Success State */
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-8"
              >
                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FiCheck className="w-8 h-8 text-white" />
                </div>
                <h4 className={`text-lg font-semibold mb-2 transition-colors duration-200 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-800'
                }`}>
                  Email Verified Successfully!
                </h4>
                <p className={`text-sm transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  You can now proceed with your payment
                </p>
              </motion.div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default EmailVerificationModal;
