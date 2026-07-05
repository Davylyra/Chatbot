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
  FiX,
  FiMenu
} from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useGuestLimitations } from '../hooks/useGuestLimitations';
import GuestLimitationModal from './GuestLimitationModal';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
  isDesktop?: boolean;
}

const Sidebar: React.FC<SidebarProps> = memo(({
  isOpen,
  onClose,
  userName = "User",
  isDesktop = false
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
      label: "About CERKYL ",
      description: "App info & version",
      path: "/about",
      showInGuest: true
    }
  ];

  const menuItems = isGuest
    ? allMenuItems.filter(item => item.showInGuest)
    : allMenuItems;

  return (
    <>
      <AnimatePresence>
        {!isDesktop && isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className={`fixed inset-0 z-40`}
            style={{
              background: theme === 'dark'
                ? 'linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.2) 100%)'
                : 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.1) 100%)',
              backdropFilter: 'blur(12px) saturate(180%)',
              WebkitBackdropFilter: 'blur(12px) saturate(180%)'
            }}
          />
        )}
      </AnimatePresence>

      <motion.div
        animate={{ 
          width: isDesktop ? (isOpen ? 320 : 72) : 320,
          x: !isDesktop && !isOpen ? -320 : 0
        }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className={`${isDesktop ? 'relative' : 'fixed'} left-0 top-0 h-full shadow-2xl z-50 flex flex-col transition-colors duration-200 overflow-hidden whitespace-nowrap ${
          theme === 'dark' ? 'bg-gray-800/95 border-gray-700' : 'bg-white/95 border-white/20'
        } border-r`}
        style={{
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)'
        }}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className={`p-4 border-b transition-colors duration-200 h-[72px] flex items-center ${isOpen ? 'justify-between' : 'justify-center'} ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
            {isOpen ? (
              <>
                <h2 className={`text-xl font-bold transition-colors duration-200 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                  Menu
                </h2>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onClose}
                  className={`p-2 rounded-lg transition-colors duration-200 ${theme === 'dark' ? 'text-gray-400 hover:bg-gray-700 hover:text-white' : 'text-gray-500 hover:bg-gray-200 hover:text-black'}`}
                >
                  {isDesktop ? <FiMenu className="w-5 h-5" /> : <FiX className="w-5 h-5" />}
                </motion.button>
              </>
            ) : (
              <button 
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('toggleMainSidebar'));
                }} 
                className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'text-gray-400 hover:bg-gray-700 hover:text-white' : 'text-gray-500 hover:bg-gray-200 hover:text-black'}`}
              >
                <FiMenu className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* User Profile Card */}
          {isOpen ? (
            <div className={`p-4 border-b transition-colors duration-200 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className={`rounded-2xl p-4 border transition-all duration-200 ${theme === 'dark'
                    ? 'bg-gradient-to-br from-gray-800/40 to-gray-900/60 border-gray-700/50 shadow-lg'
                    : 'bg-gradient-to-br from-white/90 to-gray-50/90 border-gray-200/50 shadow-md'
                  }`}
                style={{
                  boxShadow: theme === 'dark'
                    ? '0 10px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                    : '0 10px 20px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.8)'
                }}
              >
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-md shrink-0">
                      <FiUser className="w-6 h-6 text-white" />
                    </div>
                    {isGuest && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center">
                        <span className="text-[10px] text-yellow-900 font-bold">G</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-bold text-base truncate transition-colors duration-200 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                      {isGuest ? 'Guest User' : (user?.name || userName)}
                    </h3>
                    {isGuest && (
                      <div className="mt-0.5">
                        <p className={`text-xs font-medium transition-colors duration-200 ${theme === 'dark' ? 'text-yellow-300' : 'text-yellow-600'}`}>
                          Guest Mode
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          ) : (
            <div className={`p-4 border-b flex justify-center transition-colors duration-200 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
               <div className="w-10 h-10 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shrink-0 relative cursor-pointer" onClick={() => navigate('/profile')}>
                  <FiUser className="w-5 h-5 text-white" />
                  {isGuest && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full flex items-center justify-center">
                      <span className="text-[8px] text-yellow-900 font-bold">G</span>
                    </div>
                  )}
               </div>
            </div>
          )}

          {/* Menu Items */}
          <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
            <div className={`space-y-1.5 ${!isOpen && 'flex flex-col items-center'}`}>
              {menuItems.map((item, index) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;

                return (
                  <motion.div
                    key={item.path}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className={!isOpen ? 'w-full flex justify-center' : ''}
                  >
                    <Link
                      to={item.path}
                      title={!isOpen ? item.label : undefined}
                      onClick={() => {
                        if (item.guestFeature && !item.showInGuest && !checkGuestAccess(item.guestFeature)) {
                          return;
                        }
                        if (!isDesktop) onClose();
                      }}
                      className={`${isOpen ? 'block p-3' : 'flex items-center justify-center w-12 h-12 p-0'} rounded-2xl transition-all duration-200 group ${
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
                      <div className={`flex items-center ${!isOpen && 'justify-center'} space-x-4`}>
                        <div className={`p-2.5 rounded-xl transition-colors duration-200 shrink-0 ${
                          isActive
                            ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/30'
                            : theme === 'dark'
                              ? 'bg-gray-800 text-gray-400 group-hover:bg-gray-700 group-hover:text-white'
                              : 'bg-white text-gray-500 group-hover:bg-primary-50 group-hover:text-primary-600 shadow-sm'
                        }`}>
                          <Icon className="w-6 h-6" />
                        </div>
                        {isOpen && (
                          <div className="flex-1 min-w-0">
                            <h3 className={`font-semibold text-[15px] mb-0.5 truncate transition-colors duration-200 ${
                              isActive
                                ? theme === 'dark' ? 'text-primary-400' : 'text-primary-700'
                                : theme === 'dark' ? 'text-gray-200 group-hover:text-white' : 'text-gray-700 group-hover:text-gray-900'
                            }`}>
                              {item.label}
                            </h3>
                            <p className={`text-xs truncate transition-colors duration-200 ${
                              isActive
                                ? theme === 'dark' ? 'text-primary-400/80' : 'text-primary-600/80'
                                : theme === 'dark' ? 'text-gray-500 group-hover:text-gray-400' : 'text-gray-500 group-hover:text-gray-600'
                            }`}>
                              {item.description}
                            </p>
                          </div>
                        )}
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Footer Area */}
          <div className={`p-6 border-t transition-colors duration-200 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
            {isGuest ? (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  onClose();
                  navigate('/signup');
                }}
                title={!isOpen ? 'Create Account' : undefined}
                className={`w-full flex items-center justify-center space-x-2 py-2 px-3 border rounded-xl transition-colors duration-200 ${theme === 'dark'
                    ? 'border-primary-500 text-primary-400 hover:bg-primary-900/20'
                    : 'border-primary-500 text-primary-600 hover:bg-primary-50'
                  }`}
              >
                <FiUserPlus className="w-5 h-5 shrink-0" />
                {isOpen && <span className="font-semibold">Create Account</span>}
              </motion.button>
            ) : (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  logout();
                  navigate('/');
                }}
                title={!isOpen ? 'Sign Out' : undefined}
                className={`w-full flex items-center justify-center space-x-3 p-4 rounded-2xl border transition-all duration-200 ${
                  theme === 'dark'
                    ? 'border-red-900/50 bg-red-900/20 text-red-400 hover:bg-red-900/40 hover:border-red-500/50'
                    : 'border-red-100 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-200'
                }`}
              >
                <FiLogOut className="w-5 h-5 shrink-0" />
                {isOpen && <span className="font-semibold">Sign Out</span>}
              </motion.button>
            )}
            
            {isOpen && (
              <div className="mt-6 text-center">
                <p className={`text-xs transition-colors duration-200 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                  CERKYL v2.1.0
                </p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
      <GuestLimitationModal
        isOpen={showLimitationModal}
        onClose={closeLimitationModal}
        feature={limitationData?.feature || ''}
        message={limitationData?.message || ''}
      />
    </>
  );
});

export default Sidebar;
