/**
 * Guest Limitation Modal
 * Description: Shows when guest users try to access premium features
 * Integration: Used across the app to encourage sign-up
 */

import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { FiLock, FiUserPlus, FiLogIn, FiX, FiStar, FiShield } from 'react-icons/fi';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';

interface GuestLimitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature: string;
  description: string;
  benefits?: string[];
}

const GuestLimitationModal: React.FC<GuestLimitationModalProps> = memo(({
  isOpen,
  onClose,
  feature,
  description,
  benefits = []
}) => {
  const { theme } = useTheme();
  const navigate = useNavigate();

  const handleSignUp = () => {
    onClose();
    navigate('/signup');
  };

  const handleSignIn = () => {
    onClose();
    navigate('/login');
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className={`max-w-md w-full p-6 rounded-2xl shadow-2xl ${
          theme === 'dark' ? 'glass-modal-dark' : 'glass-modal'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className={`p-3 rounded-full ${
              theme === 'dark' 
                ? 'bg-orange-500/20 text-orange-400' 
                : 'bg-orange-100 text-orange-600'
            }`}>
              <FiLock className="w-6 h-6" />
            </div>
            <div>
              <h3 className={`text-lg font-bold transition-colors duration-200 ${
                theme === 'dark' ? 'text-white' : 'text-gray-800'
              }`}>
                Premium Feature
              </h3>
              <p className={`text-sm transition-colors duration-200 ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}>
                {feature}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
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
        <div className="mb-6">
          <p className={`text-sm leading-relaxed mb-4 transition-colors duration-200 ${
            theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
          }`}>
            {description}
          </p>

          {benefits.length > 0 && (
            <div className={`p-4 rounded-xl mb-4 ${
              theme === 'dark' 
                ? 'bg-blue-900/20 border border-blue-700/30' 
                : 'bg-blue-50 border border-blue-200'
            }`}>
              <h4 className={`font-semibold mb-3 flex items-center ${
                theme === 'dark' ? 'text-blue-300' : 'text-blue-700'
              }`}>
                <FiStar className="w-4 h-4 mr-2" />
                Unlock with Account
              </h4>
              <ul className="space-y-2">
                {benefits.map((benefit, index) => (
                  <li key={index} className={`text-sm flex items-start ${
                    theme === 'dark' ? 'text-blue-200' : 'text-blue-600'
                  }`}>
                    <FiShield className="w-3 h-3 mr-2 mt-0.5 flex-shrink-0" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSignUp}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 px-4 rounded-xl font-semibold transition-colors duration-200 flex items-center justify-center space-x-2"
          >
            <FiUserPlus className="w-5 h-5" />
            <span>Create Free Account</span>
          </motion.button>
          
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSignIn}
            className={`w-full py-3 px-4 rounded-xl font-semibold transition-colors duration-200 flex items-center justify-center space-x-2 ${
              theme === 'dark'
                ? 'border border-white/20 text-white hover:bg-white/10'
                : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <FiLogIn className="w-5 h-5" />
            <span>Sign In</span>
          </motion.button>
        </div>

        {/* Footer */}
        <div className="mt-4 text-center">
          <p className={`text-xs transition-colors duration-200 ${
            theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
          }`}>
            Creating an account is free and takes less than 2 minutes
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
});

export default GuestLimitationModal;
