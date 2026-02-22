/**
 * Sidebar Component
 *
 * This is the main navigation sidebar that provides access to all app features.
 * It features a modern glassmorphism design with enhanced blur effects and
 * smooth animations inspired by ChatGPT's interface.
 *
 * Features:
 * - Enhanced backdrop blur with gradient overlays
 * - User profile display with avatar
 * - Navigation menu with icons and descriptions
 * - Active route highlighting
 * - Smooth slide-in animations
 * - Theme-aware styling
 * - Logout functionality
 *
 * Integration Notes:
 * - Uses React Router for navigation
 * - Integrates with AuthContext for user data
 * - Theme switching support
 * - Ready for backend user profile integration
 *
 * Backend Integration Points:
 * - User profile data (avatar, name, email)
 * - Notification count from backend
 * - User preferences and settings
 * - Logout API integration
 *
 * Props:
 * - isOpen: boolean - Controls sidebar visibility
 * - onClose: () => void - Callback to close sidebar
 * - userName?: string - Optional user name override
 *
 * Dependencies:
 * - useAuth: For user authentication and logout
 * - useTheme: For theme switching
 * - useLocation: For active route detection
 */
import React, { memo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiUser, 
  FiBell, 
  FiShoppingCart, 
  FiClock, 
  FiSettings, 
  FiFileText, 
  FiHelpCircle, 
  FiInfo, 
  FiLogOut,
  FiUserPlus,
  FiX
} from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useGuestLimitations } from '../hooks/useGuestLimitations';
import GuestLimitationModal from './GuestLimitationModal';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
}

const Sidebar: React.FC<SidebarProps> = memo(({
  isOpen,
  onClose,
  userName = "User"
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isGuest } = useAuth();
  const { theme } = useTheme();
  const { 
    showLimitationModal, 
    limitationData, 
    checkGuestAccess, 
    closeLimitationModal 
  } = useGuestLimitations();

  // All menu items
  const allMenuItems = [
    {
      icon: FiUser,
      label: "Profile Overview",
      description: "View and edit profile",
      path: "/profile",
      guestFeature: "profile",
      authOnly: true
    },
    {
      icon: FiBell,
      label: "Notifications",
      description: "Updates and alerts",
      path: "/notifications",
      showInGuest: true
    },
    {
      icon: FiShoppingCart,
      label: "Buy Forms",
      description: "Universities Form",
      path: "/forms",
      showInGuest: true
    },
    {
      icon: FiClock,
      label: "Conversation History",
      description: "View past chats",
      path: "/conversation-history",
      showInGuest: true
    },
    {
      icon: FiSettings,
      label: "Settings",
      description: "App preferences & account",
      path: "/settings",
      showInGuest: true
    },
    {
      icon: FiFileText,
      label: "Transactions",
      description: "Payments history & receipts",
      path: "/transactions",
      guestFeature: "transactions",
      authOnly: true
    },
    {
      icon: FiHelpCircle,
      label: "Help & Support",
      description: "Get help or contact us",
      path: "/help-support",
      showInGuest: true
    },
    {
      icon: FiInfo,
      label: "About Glinax",
      description: "App info & version",
      path: "/about",
      showInGuest: true
    }
  ];

  // Filter menu items based on guest status
  const menuItems = isGuest 
    ? allMenuItems.filter(item => item.showInGuest)
    : allMenuItems;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop with enhanced blur effect */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40"
            style={{
              background: theme === 'dark' 
                ? 'linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.2) 100%)'
                : 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.1) 100%)',
              backdropFilter: 'blur(12px) saturate(180%)',
              WebkitBackdropFilter: 'blur(12px) saturate(180%)'
            }}
          />
          
          {/* Sidebar */}
          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className={`fixed left-0 top-0 h-full w-80 border-r shadow-2xl z-50 transition-colors duration-200 ${
              theme === 'dark' 
                ? 'bg-gray-800/95 border-gray-700' 
                : 'bg-white/95 border-white/20'
            }`}
            style={{
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)'
            }}
          >
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className={`p-6 border-b transition-colors duration-200 ${
                theme === 'dark' ? 'border-gray-700' : 'border-white/20'
              }`}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className={`text-xl font-bold transition-colors duration-200 ${
                    theme === 'dark' ? 'text-white' : 'text-gray-800'
                  }`}>Menu</h2>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onClose}
                    className={`p-2 rounded-full transition-colors duration-200 ${
                      theme === 'dark' 
                        ? 'bg-gray-700 hover:bg-gray-600' 
                        : 'bg-white/20 hover:bg-white/30'
                    }`}
                  >
                    <FiX className={`w-5 h-5 transition-colors duration-200 ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                    }`} />
                  </motion.button>
                </div>
                
                {/* User Profile Card */}
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className={`rounded-3xl p-6 border transition-all duration-200 ${
                    theme === 'dark' 
                      ? 'bg-gradient-to-br from-gray-800/40 to-gray-900/60 border-gray-700/50 shadow-2xl' 
                      : 'bg-gradient-to-br from-white/90 to-gray-50/90 border-gray-200/50 shadow-xl'
                  }`}
                  style={{
                    backdropFilter: 'blur(20px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                    boxShadow: theme === 'dark' 
                      ? '0 20px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)' 
                      : '0 20px 40px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.8)'
                  }}
                >
                  <div className="flex items-center space-x-4">
                    <div className="relative">
                      <div className="w-16 h-16 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg">
                        <FiUser className="w-8 h-8 text-white" />
                      </div>
                      {isGuest && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center">
                          <span className="text-xs text-yellow-900 font-bold">G</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className={`font-bold text-lg transition-colors duration-200 ${
                        theme === 'dark' ? 'text-white' : 'text-gray-800'
                      }`}>
                        {isGuest ? 'Guest User' : (user?.name || userName)}
                      </h3>
                      {isGuest && (
                        <div className="mt-1">
                          <p className={`text-sm font-medium transition-colors duration-200 ${
                            theme === 'dark' ? 'text-yellow-300' : 'text-yellow-600'
                          }`}>
                            Guest Mode
                          </p>
                          <p className={`text-xs transition-colors duration-200 ${
                            theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                          }`}>
                            Limited features available
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Menu Items */}
              <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
                <div className="space-y-2">
                  {menuItems.map((item, index) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    
                    return (
                      <motion.div
                        key={item.path}
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <Link
                          to={item.path}
                          onClick={() => {
                            // Only check guest access if the item has a guestFeature and is not explicitly shown in guest mode
                            if (item.guestFeature && !item.showInGuest && !checkGuestAccess(item.guestFeature)) {
                              return;
                            }
                            onClose();
                          }}
                          className={`block p-4 rounded-2xl transition-all duration-200 group ${
                            isActive 
                              ? theme === 'dark'
                                ? 'bg-primary-600/20 border border-primary-500/30'
                                : 'bg-primary-100 border border-primary-200'
                              : theme === 'dark'
                                ? 'hover:bg-white/10 border border-transparent'
                                : 'hover:bg-white/50 border border-transparent'
                          }`}
                          style={{
                            backdropFilter: isActive ? 'blur(8px) saturate(180%)' : 'blur(4px) saturate(180%)',
                            WebkitBackdropFilter: isActive ? 'blur(8px) saturate(180%)' : 'blur(4px) saturate(180%)'
                          }}
                        >
                          <div className="flex items-center space-x-3">
                            <div className={`p-2 rounded-xl transition-colors duration-200 ${
                              isActive 
                                ? 'bg-primary-500 text-white' 
                                : theme === 'dark'
                                  ? 'bg-gray-700 text-gray-300 group-hover:bg-primary-500/20 group-hover:text-primary-400'
                                  : 'bg-gray-100 text-gray-600 group-hover:bg-primary-100 group-hover:text-primary-600'
                            }`}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <div className="flex-1">
                              <h4 className={`font-medium transition-colors duration-200 ${
                                isActive 
                                  ? theme === 'dark' ? 'text-primary-400' : 'text-primary-700'
                                  : theme === 'dark' ? 'text-white' : 'text-gray-800'
                              }`}>
                                {item.label}
                              </h4>
                              <p className={`text-sm transition-colors duration-200 ${
                                isActive 
                                  ? theme === 'dark' ? 'text-primary-300' : 'text-primary-600'
                                  : theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                              }`}>
                                {item.description}
                              </p>
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className={`p-6 border-t transition-colors duration-200 ${
                theme === 'dark' ? 'border-gray-700' : 'border-white/20'
              }`}>
                {isGuest ? (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      onClose();
                      // Navigate to signup page using React Router
                      navigate('/signup');
                    }}
                    className={`w-full flex items-center justify-center space-x-2 py-2 px-3 border rounded-xl transition-colors duration-200 ${
                      theme === 'dark'
                        ? 'border-primary-500 text-primary-400 hover:bg-primary-900/20'
                        : 'border-primary-500 text-primary-600 hover:bg-primary-50'
                    }`}
                    style={{
                      backdropFilter: 'blur(8px) saturate(180%)',
                      WebkitBackdropFilter: 'blur(8px) saturate(180%)'
                    }}
                  >
                    <FiUserPlus className="w-4 h-4" />
                    <span className="text-sm font-medium">Create Account</span>
                  </motion.button>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      logout();
                      onClose();
                    }}
                    className={`w-full flex items-center justify-center space-x-2 py-2 px-3 border rounded-xl transition-colors duration-200 ${
                      theme === 'dark'
                        ? 'border-red-700 text-red-400 hover:bg-red-900/20'
                        : 'border-red-200 text-red-600 hover:bg-red-50'
                    }`}
                    style={{
                      backdropFilter: 'blur(8px) saturate(180%)',
                      WebkitBackdropFilter: 'blur(8px) saturate(180%)'
                    }}
                  >
                    <FiLogOut className="w-4 h-4" />
                    <span className="text-sm font-medium">Sign Out</span>
                  </motion.button>
                )}
                
                <div className="text-center mt-4">
                  <p className={`text-sm transition-colors duration-200 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>Glinax v2.1.0</p>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}

      {/* Guest Limitation Modal */}
      <GuestLimitationModal
        isOpen={showLimitationModal}
        onClose={closeLimitationModal}
        feature={limitationData?.feature || ''}
        description={limitationData?.description || ''}
        benefits={limitationData?.benefits || []}
      />
    </AnimatePresence>
  );
});

export default Sidebar;
