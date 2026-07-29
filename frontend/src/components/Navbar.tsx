import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiMenu,
  FiArrowLeft,
  FiUser,
  FiCheck,
  FiSun,
  FiMoon,
  FiSettings,
  FiLogOut,
  FiUserPlus,
  FiBell,
  FiHelpCircle,
  FiChevronDown,
} from "react-icons/fi";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";

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
    title = "CERKYL",
    logoSrc,
    logoAlt = "Logo",
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
    const { user, isGuest, logout } = useAuth();

    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const profileDropdownRef = useRef<HTMLDivElement>(null);

    const handleToggleTheme = useCallback(() => {
      setThemeMode(theme === "dark" ? "light" : "dark");
    }, [theme, setThemeMode]);
    const headerRef = useRef<HTMLElement>(null);
    const [showTooltip, setShowTooltip] = useState(false);
    const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);

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
            headerElement.classList.add("header-scrolled");
          } else {
            headerElement.classList.remove("header-scrolled");
          }
        }
      };

      window.addEventListener("scroll", handleScroll);
      return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          profileDropdownRef.current &&
          !profileDropdownRef.current.contains(event.target as Node)
        ) {
          setIsProfileOpen(false);
        }
      };

      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
      <motion.nav
        ref={headerRef}
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="sticky top-0 z-50 transition-all duration-300 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/80 shadow-2xs"
      >
        <div className="max-w-md mx-auto px-4 py-3 md:max-w-5xl">
          <div className="relative flex items-center justify-between">
            {/* Left side - Back Arrow and Menu */}
            <div className="flex items-center space-x-2">
              {showBackButton && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onBackClick}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 border ${
                    theme === "dark"
                      ? "bg-slate-800/80 border-slate-700/80 text-slate-200 hover:bg-slate-700"
                      : "bg-slate-100/80 border-slate-200/80 text-slate-700 hover:bg-slate-200"
                  }`}
                  title="Go back"
                >
                  <FiArrowLeft className="w-5 h-5" />
                </motion.button>
              )}

              {showMenuButton && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onMenuClick}
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all duration-200 md:hidden ${
                    theme === "dark"
                      ? "bg-slate-800/80 border-slate-700/80 text-slate-200 hover:bg-slate-700"
                      : "bg-slate-100/80 border-slate-200/80 text-slate-700 hover:bg-slate-200"
                  }`}
                  title="Toggle menu"
                >
                  <FiMenu className="w-5 h-5" />
                </motion.button>
              )}

              {!showBackButton && !showMenuButton && (
                <div className="w-10 h-10" />
              )}
            </div>

            {/* Center - Section Title Badge */}
            {/* <div className="flex-1 flex justify-center px-2 md:px-4 mx-2 overflow-hidden">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.2 }}
                className={`px-4 py-1.5 md:px-6 md:py-2 text-center transition-all duration-200 rounded-full border shadow-2xs backdrop-blur-md ${
                  theme === "dark"
                    ? "bg-slate-800/80 border-slate-700/80 text-white"
                    : "bg-white/80 border-slate-200/80 text-slate-900"
                }`}
              >
                <div className="flex items-center justify-center space-x-2 md:space-x-3">
                  {logoSrc ? (
                    <img
                      src={logoSrc}
                      alt={logoAlt}
                      className="h-7 w-auto object-contain md:h-10"
                    />
                  ) : (
                    <h1 className="text-xs md:text-sm font-bold uppercase tracking-wider truncate bg-gradient-to-r from-primary-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent">
                      {title}
                    </h1>
                  )}
                  {showNotificationBadge && notificationCount > 0 && (
                    <span className="bg-primary-600 text-white text-[10px] font-extrabold rounded-full px-2 py-0.5 shadow-xs">
                      {notificationCount}
                    </span>
                  )}
                </div>
              </motion.div>
            </div> */}

            {/* Right side - Action controls */}
            <div className="flex items-center space-x-2 md:space-x-3">
              {/* Theme Toggle */}
              {showThemeToggle && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleToggleTheme}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 border ${
                    theme === "dark"
                      ? "bg-slate-800/80 border-slate-700/80 text-amber-400 hover:bg-slate-700"
                      : "bg-slate-100/80 border-slate-200/80 text-indigo-600 hover:bg-slate-200"
                  }`}
                  title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
                >
                  {theme === "dark" ? (
                    <FiSun className="w-5 h-5 text-amber-400" />
                  ) : (
                    <FiMoon className="w-5 h-5 text-indigo-600" />
                  )}
                </motion.button>
              )}

              {showMarkAllReadButton && (
                <div className="relative">
                  <motion.button
                    whileHover={!isButtonDisabled ? { scale: 1.05 } : {}}
                    whileTap={!isButtonDisabled ? { scale: 0.95 } : {}}
                    onClick={handleMarkAllRead}
                    disabled={isButtonDisabled}
                    onMouseEnter={() =>
                      !isButtonDisabled && setShowTooltip(true)
                    }
                    onMouseLeave={() => setShowTooltip(false)}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 border ${
                      theme === "dark"
                        ? "bg-slate-800/80 border-slate-700/80 text-slate-200 hover:bg-slate-700"
                        : "bg-slate-100/80 border-slate-200/80 text-slate-700 hover:bg-slate-200"
                    } ${isButtonDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <motion.div
                      animate={{
                        rotate: isMarkingAllRead ? 360 : 0,
                        scale: isMarkingAllRead ? 0.8 : 1,
                      }}
                      transition={{
                        duration: isMarkingAllRead ? 1 : 0.2,
                        repeat: isMarkingAllRead ? Infinity : 0,
                        ease: "linear",
                      }}
                    >
                      <FiCheck className="w-5 h-5" />
                    </motion.div>
                  </motion.button>

                  {/* Tooltip */}
                  {showTooltip && !isMarkingAllRead && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.9 }}
                      className={`absolute top-12 right-0 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap z-50 border shadow-lg ${
                        theme === "dark"
                          ? "bg-slate-800 text-slate-200 border-slate-700"
                          : "bg-white text-slate-800 border-slate-200"
                      }`}
                    >
                      {onMarkAllReadClick
                        ? "Mark all as read"
                        : "All notifications read"}
                    </motion.div>
                  )}
                </div>
              )}

              {/* User Profile Popover / Dropdown Menu */}
              <div className="relative" ref={profileDropdownRef}>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    setIsProfileOpen((prev) => !prev);
                    if (onProfileClick) {
                      onProfileClick();
                    }
                  }}
                  className={`h-10 px-2.5 rounded-xl flex items-center space-x-2 transition-all duration-200 border ${
                    theme === "dark"
                      ? "bg-slate-800/80 border-slate-700/80 text-slate-200 hover:bg-slate-700"
                      : "bg-slate-100/80 border-slate-200/80 text-slate-700 hover:bg-slate-200"
                  }`}
                  title={isGuest ? "Guest User" : user?.name || "User Profile"}
                >
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-primary-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-xs">
                    {isGuest ? (
                      <FiUser className="w-3.5 h-3.5" />
                    ) : (
                      (user?.name || "U").charAt(0).toUpperCase()
                    )}
                  </div>
                  <span className="hidden sm:inline-block text-xs font-bold truncate max-w-[100px]">
                    {isGuest ? "Guest" : user?.name || "User"}
                  </span>
                  <FiChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                      isProfileOpen ? "rotate-180" : ""
                    }`}
                  />
                </motion.button>

                {/* Popover Dropdown Menu */}
                <AnimatePresence>
                  {isProfileOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className={`absolute right-0 top-12 z-50 w-72 rounded-2xl border shadow-2xl backdrop-blur-xl p-3.5 ${
                        theme === "dark"
                          ? "bg-slate-900/95 border-slate-800 text-white"
                          : "bg-white/95 border-slate-200 text-slate-900"
                      }`}
                    >
                      {/* User Header */}
                      <div className="flex items-center space-x-3 pb-3 border-b border-slate-200/80 dark:border-slate-800/80">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-primary-500/20 shrink-0">
                          {isGuest ? (
                            <FiUser className="w-5 h-5" />
                          ) : (
                            (user?.name || "User").charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold text-sm truncate text-slate-900 dark:text-white">
                              {isGuest ? "Guest User" : user?.name || "Student"}
                            </h4>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                isGuest
                                  ? "bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                                  : "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                              }`}
                            >
                              {isGuest ? "Guest" : "Student"}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {isGuest
                              ? "Browsing Mode"
                              : user?.email || "Account Active"}
                          </p>
                        </div>
                      </div>

                      {/* Navigation Quick Links */}
                      <div className="py-2 space-y-1">
                        <button
                          onClick={() => {
                            setIsProfileOpen(false);
                            navigate("/profile");
                          }}
                          className={`w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                            theme === "dark"
                              ? "hover:bg-slate-800 text-slate-200 hover:text-white"
                              : "hover:bg-slate-100 text-slate-700 hover:text-slate-900"
                          }`}
                        >
                          <FiUser className="w-4 h-4 text-primary-500" />
                          <span>Profile Overview</span>
                        </button>

                        <button
                          onClick={() => {
                            setIsProfileOpen(false);
                            navigate("/settings");
                          }}
                          className={`w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                            theme === "dark"
                              ? "hover:bg-slate-800 text-slate-200 hover:text-white"
                              : "hover:bg-slate-100 text-slate-700 hover:text-slate-900"
                          }`}
                        >
                          <FiSettings className="w-4 h-4 text-indigo-500" />
                          <span>Settings</span>
                        </button>

                        <button
                          onClick={() => {
                            setIsProfileOpen(false);
                            navigate("/notifications");
                          }}
                          className={`w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                            theme === "dark"
                              ? "hover:bg-slate-800 text-slate-200 hover:text-white"
                              : "hover:bg-slate-100 text-slate-700 hover:text-slate-900"
                          }`}
                        >
                          <FiBell className="w-4 h-4 text-amber-500" />
                          <span>Notifications</span>
                        </button>

                        <button
                          onClick={() => {
                            setIsProfileOpen(false);
                            navigate("/help-support");
                          }}
                          className={`w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                            theme === "dark"
                              ? "hover:bg-slate-800 text-slate-200 hover:text-white"
                              : "hover:bg-slate-100 text-slate-700 hover:text-slate-900"
                          }`}
                        >
                          <FiHelpCircle className="w-4 h-4 text-teal-500" />
                          <span>Help & Support</span>
                        </button>
                      </div>

                      {/* Footer Actions */}
                      <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
                        {isGuest ? (
                          <button
                            onClick={() => {
                              setIsProfileOpen(false);
                              navigate("/signup");
                            }}
                            className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold text-xs transition-colors shadow-md shadow-primary-600/20"
                          >
                            <FiUserPlus className="w-4 h-4" />
                            <span>Create Account</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setIsProfileOpen(false);
                              logout();
                              navigate("/");
                            }}
                            className={`w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-xl font-bold text-xs transition-colors ${
                              theme === "dark"
                                ? "bg-red-950/50 hover:bg-red-900/60 text-red-400 border border-red-900/50"
                                : "bg-red-50 hover:bg-red-100 text-red-600 border border-red-200/60"
                            }`}
                          >
                            <FiLogOut className="w-4 h-4" />
                            <span>Sign Out</span>
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </motion.nav>
    );
  },
);

Navbar.displayName = "Navbar";

export default Navbar;
