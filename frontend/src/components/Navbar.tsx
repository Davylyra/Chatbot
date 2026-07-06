import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiMenu, FiArrowLeft, FiUser, FiCheck, FiSun, FiMoon } from 'react-icons/fi';
import { useTheme } from '../contexts/ThemeContext';

interface NavbarProps {
  title?: string;
  logoSrc?: string;
  logoAlt?: string;
  showBackButton?: boolean;
  onBackClick?: () => void;
  showMenuButton?: boolean;
  onMenuClick?: () => void;
  showProfileButton?: boolean;
  onProfileClick?: () => void;
  showNotificationBadge?: boolean;
  notificationCount?: number;
  showMarkAllReadButton?: boolean;
  onMarkAllReadClick?: () => void;
  showThemeToggle?: boolean;
}

const Navbar: React.FC<NavbarProps> = memo(
  ({
    title = 'CERKYL',
    logoSrc,
    logoAlt = 'Logo',
    showBackButton = false,
    onBackClick,
    showMenuButton = true,
    onMenuClick,
    showProfileButton = false,
    onProfileClick,
    showNotificationBadge = false,
    notificationCount = 0,
    showMarkAllReadButton = false,
    onMarkAllReadClick,
    showThemeToggle = false,
  }) => {
    const navigate = useNavigate();
    const { theme, setThemeMode } = useTheme();

    const handleToggleTheme = useCallback(() => {
      setThemeMode(theme === 'dark' ? 'light' : 'dark');
    }, [theme, setThemeMode]);
    const headerRef = useRef<HTMLElement>(null);
    const [showTooltip, setShowTooltip] = useState(false);
    const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);

    const handleHomeClick = useCallback(() => {
      navigate('/');
    }, [navigate]);

    const handleMarkAllRead = useCallback(async () => {
      if (isMarkingAllRead || !onMarkAllReadClick) return;

      setIsMarkingAllRead(true);
      try {
        await onMarkAllReadClick();
      } finally {
        setIsMarkingAllRead(false);
      }
    }, [isMarkingAllRead, onMarkAllReadClick]);

    const isButtonDisabled = !onMarkAllReadClick || isMarkingAllRead;

    useEffect(() => {
      const handleScroll = () => {
        const scrollY = window.scrollY;
        const headerElement = headerRef.current;

        if (headerElement) {
          if (scrollY > 10) {
            headerElement.classList.add('header-scrolled');
          } else {
            headerElement.classList.remove('header-scrolled');
          }
        }
      };

      window.addEventListener('scroll', handleScroll);
      return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
      <motion.nav
        ref={headerRef}
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="sticky top-0 z-50 transition-all duration-300"
        style={{
          background:
            theme === 'dark'
              ? 'linear-gradient(to bottom, rgba(17, 24, 39, 0.95) 0%, rgba(17, 24, 39, 0.8) 50%, rgba(17, 24, 39, 0.4) 80%, transparent 100%)'
              : 'linear-gradient(to bottom, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.8) 50%, rgba(255, 255, 255, 0.4) 80%, transparent 100%)',
          backdropFilter: 'blur(20px)',
          boxShadow: 'none',
          borderBottom: 'none',
        }}
      >
        <div className="max-w-md mx-auto px-4 py-4 md:max-w-5xl">
          <div className="relative flex items-center justify-between">
            {/* Left side - Back Arrow and Menu */}
            <div className="flex items-center space-x-2">
              {showBackButton && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onBackClick}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 ${
                    theme === 'dark'
                      ? 'glass-unified-dark hover:bg-white/10'
                      : 'glass-unified hover:bg-white/20'
                  }`}
                >
                  <FiArrowLeft
                    className={`w-5 h-5 transition-colors duration-200 ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                    }`}
                  />
                </motion.button>
              )}

              {showMenuButton && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onMenuClick}
                  className={`w-10 h-10 rounded-full backdrop-blur-md border flex items-center justify-center transition-all duration-200 md:hidden ${
                    theme === 'dark'
                      ? 'bg-white/10 border-white/20 hover:bg-white/20'
                      : 'bg-white/60 border-white/40 hover:bg-white/80'
                  }`}
                >
                  <FiMenu
                    className={`w-5 h-5 transition-colors duration-200 ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                    }`}
                  />
                </motion.button>
              )}

              {!showBackButton && !showMenuButton && <div className="w-10 h-10" />}
            </div>

            {/* Center - Section Title (flexible and centered) */}
            <div className="flex-1 flex justify-center px-2 md:px-4 mx-2 overflow-hidden">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className={`px-3 py-1.5 md:px-6 md:py-2 text-center transition-all duration-200 shadow-lg ${
                  theme === 'dark'
                    ? 'glass-unified-dark shadow-black/20'
                    : 'glass-unified shadow-gray-200/50'
                }`}
                style={{ borderRadius: '45px' }}
              >
                <div className="flex items-center justify-center space-x-2 md:space-x-3">
                  {logoSrc ? (
                    <img
                      src={logoSrc}
                      alt={logoAlt}
                      className="h-8 w-auto object-contain md:h-12"
                    />
                  ) : (
                    <h1
                      className={`text-xs md:text-sm font-semibold uppercase tracking-wide truncate transition-colors duration-200 ${
                        theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
                      }`}
                    >
                      {title}
                    </h1>
                  )}
                  {showNotificationBadge && notificationCount > 0 && (
                    <div className="bg-primary-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {notificationCount}
                    </div>
                  )}
                </div>
              </motion.div>
            </div>

            <div className="flex items-center space-x-2 md:space-x-3">
              {/* Theme Toggle */}
              {showThemeToggle && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleToggleTheme}
                  className={`w-10 h-10 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-all duration-200 ${
                    theme === 'dark'
                      ? 'glass-unified-dark hover:bg-white/10'
                      : 'glass-unified hover:bg-white/20'
                  }`}
                >
                  {theme === 'dark' ? (
                    <FiSun className="w-5 h-5 text-yellow-400" />
                  ) : (
                    <FiMoon className="w-5 h-5 text-gray-700" />
                  )}
                </motion.button>
              )}

              {showMarkAllReadButton ? (
                <div className="relative">
                  <motion.button
                    whileHover={!isButtonDisabled ? { scale: 1.05 } : {}}
                    whileTap={!isButtonDisabled ? { scale: 0.95 } : {}}
                    onClick={handleMarkAllRead}
                    disabled={isButtonDisabled}
                    onMouseEnter={() => !isButtonDisabled && setShowTooltip(true)}
                    onMouseLeave={() => setShowTooltip(false)}
                    className={`w-10 h-10 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-all duration-200 relative ${
                      theme === 'dark'
                        ? 'glass-unified-dark hover:bg-white/10'
                        : 'glass-unified hover:bg-white/20'
                    } ${isButtonDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <motion.div
                      animate={{
                        rotate: isMarkingAllRead ? 360 : 0,
                        scale: isMarkingAllRead ? 0.8 : 1,
                      }}
                      transition={{
                        duration: isMarkingAllRead ? 1 : 0.2,
                        repeat: isMarkingAllRead ? Infinity : 0,
                        ease: 'linear',
                      }}
                    >
                      <FiCheck
                        className={`w-5 h-5 transition-colors duration-200 ${
                          theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                        }`}
                      />
                    </motion.div>
                  </motion.button>

                  {/* Tooltip */}
                  {showTooltip && !isMarkingAllRead && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.8 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.8 }}
                      className={`absolute top-12 right-0 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap z-50 ${
                        theme === 'dark'
                          ? 'bg-gray-800 text-gray-200 border border-gray-700'
                          : 'bg-white text-gray-800 border border-gray-200 shadow-lg'
                      }`}
                    >
                      {onMarkAllReadClick ? 'Mark all as read' : 'All notifications read'}
                      <div
                        className={`absolute -top-1 right-3 w-2 h-2 rotate-45 ${
                          theme === 'dark'
                            ? 'bg-gray-800 border-l border-t border-gray-700'
                            : 'bg-white border-l border-t border-gray-200'
                        }`}
                      ></div>
                    </motion.div>
                  )}
                </div>
              ) : showProfileButton ? (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onProfileClick}
                  className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all duration-200 ${
                    theme === 'dark'
                      ? 'bg-white/10 hover:bg-white/15'
                      : 'bg-white/20 hover:bg-white/30'
                  }`}
                  style={{
                    backdropFilter: 'blur(16px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                    border:
                      theme === 'dark'
                        ? '2px solid rgba(255, 255, 255, 0.2)'
                        : '2px solid rgba(255, 255, 255, 0.3)',
                    boxShadow:
                      theme === 'dark'
                        ? '0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                        : '0 4px 12px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                  }}
                >
                  <FiUser
                    className={`w-6 h-6 transition-colors duration-200 ${
                      theme === 'dark' ? 'text-white' : 'text-gray-800'
                    }`}
                  />
                </motion.button>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleHomeClick}
                  className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all duration-200 ${
                    theme === 'dark'
                      ? 'bg-white/10 hover:bg-white/15'
                      : 'bg-white/20 hover:bg-white/30'
                  }`}
                  style={{
                    backdropFilter: 'blur(16px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                    border:
                      theme === 'dark'
                        ? '2px solid rgba(255, 255, 255, 0.2)'
                        : '2px solid rgba(255, 255, 255, 0.3)',
                    boxShadow:
                      theme === 'dark'
                        ? '0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                        : '0 4px 12px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                  }}
                >
                  <FiUser
                    className={`w-6 h-6 transition-colors duration-200 ${
                      theme === 'dark' ? 'text-white' : 'text-gray-800'
                    }`}
                  />
                </motion.button>
              )}
            </div>
          </div>
        </div>
      </motion.nav>
    );
  }
);

Navbar.displayName = 'Navbar';

export default Navbar;
