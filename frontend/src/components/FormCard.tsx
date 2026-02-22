import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { FiShoppingCart, FiCalendar, FiMessageCircle } from 'react-icons/fi';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { formatPrice, formatDeadline, formatFormStatus, getCurrencySymbol } from '../utils/formatters';

interface FormCardProps {
  universityName: string;
  fullName: string;
  formPrice: number | string; // Support both number and string for backward compatibility
  currency?: string;
  deadline: string;
  isAvailable: boolean;
  onBuyClick: () => void;
  logo?: string;
  // New dynamic fields
  status?: 'available' | 'expired' | 'not_yet_open' | 'sold_out';
  daysUntilDeadline?: number;
  lastUpdated?: string;
}

const FormCard: React.FC<FormCardProps> = memo(({
  universityName,
  fullName,
  formPrice,
  currency = 'GHS',
  deadline,
  isAvailable,
  onBuyClick,
  logo,
  status = 'available',
  daysUntilDeadline,
  lastUpdated: _lastUpdated // eslint-disable-line @typescript-eslint/no-unused-vars
}) => {
  const { theme } = useTheme();
  const navigate = useNavigate();

  const handleChatClick = () => {
    navigate('/chat', { 
      state: { 
        universityContext: {
          name: universityName,
          fullName: fullName,
          logo: logo
        }
      }
    });
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5 }}
      transition={{ duration: 0.3 }}
      className={`p-6 hover:shadow-xl transition-all duration-300 ${
        theme === 'dark' ? 'glass-card-dark hover:bg-white/10' : 'glass-card hover:bg-white/80'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          {logo ? (
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center backdrop-blur-xl border transition-all duration-200 bg-white/5 border-white/10 shadow-lg shadow-white/5">
              <img 
                src={logo} 
                alt={`${universityName} logo`}
                className="w-8 h-8 rounded-xl object-cover"
              />
            </div>
          ) : (
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">
                {universityName.charAt(0)}
              </span>
            </div>
          )}
          <div>
            <h3 className={`font-bold text-lg transition-colors duration-200 ${
              theme === 'dark' ? 'text-white' : 'text-gray-800'
            }`}>{universityName}</h3>
            <p className={`text-sm transition-colors duration-200 ${
              theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
            }`}>{fullName}</p>
          </div>
        </div>
        
        <div className={`px-3 py-1 rounded-full text-xs font-medium transition-colors duration-200 ${
          formatFormStatus(status).bgColor
        } ${formatFormStatus(status).color}`}>
          {formatFormStatus(status).text}
        </div>
      </div>

      {/* Price and Deadline Info */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="flex items-center space-x-2">
          <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors duration-200 ${
            theme === 'dark' ? 'bg-yellow-500/20' : 'bg-yellow-100'
          }`}>
            <span className={`text-xs font-bold transition-colors duration-200 ${
              theme === 'dark' ? 'text-yellow-400' : 'text-yellow-600'
            }`}>{getCurrencySymbol(currency)}</span>
          </div>
          <div>
            <p className={`text-xs transition-colors duration-200 ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
            }`}>Form Price</p>
            <p className={`font-semibold transition-colors duration-200 ${
              theme === 'dark' ? 'text-white' : 'text-gray-800'
            }`}>
              {typeof formPrice === 'number' 
                ? formatPrice(formPrice, { currency, showSymbol: false })
                : formPrice
              }
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <FiCalendar className={`w-4 h-4 transition-colors duration-200 ${
            theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
          }`} />
          <div>
            <p className={`text-xs transition-colors duration-200 ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
            }`}>Deadline</p>
            <p className={`font-semibold transition-colors duration-200 ${
              theme === 'dark' ? 'text-white' : 'text-gray-800'
            }`}>
              {formatDeadline(deadline).formatted}
            </p>
            {daysUntilDeadline !== undefined && (
              <p className={`text-xs transition-colors duration-200 ${
                formatDeadline(deadline).status === 'expired' 
                  ? 'text-red-500' 
                  : formatDeadline(deadline).status === 'urgent'
                  ? 'text-orange-500'
                  : theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`}>
                {daysUntilDeadline < 0 
                  ? `${Math.abs(daysUntilDeadline)} days ago`
                  : `${daysUntilDeadline} days left`
                }
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-2">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleChatClick}
          className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-medium transition-all duration-200 ${
            theme === 'dark'
              ? 'bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white'
              : 'bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-800'
          }`}
        >
          <FiMessageCircle className="w-4 h-4" />
          <span>Chat About {universityName}</span>
        </motion.button>
        
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onBuyClick}
          disabled={!isAvailable}
          className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-medium transition-all duration-200 ${
            isAvailable
              ? 'bg-primary-600 hover:bg-primary-700 text-white shadow-md hover:shadow-lg'
              : theme === 'dark'
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          <FiShoppingCart className="w-4 h-4" />
          <span>Buy Form</span>
        </motion.button>
      </div>
    </motion.div>
  );
});

FormCard.displayName = 'FormCard';

export default FormCard;
