import React, { memo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiHome,
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
  FiMenu,
} from "react-icons/fi";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { useGuestLimitations } from "../hooks/useGuestLimitations";
import GuestLimitationModal from "./GuestLimitationModal";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
  isDesktop?: boolean;
}

const Sidebar: React.FC<SidebarProps> = memo(
  ({ isOpen, onClose, userName: _userName = "User", isDesktop = false }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const { logout, isGuest } = useAuth();
    const { theme } = useTheme();
    const {
      showLimitationModal,
      limitationData,
      checkGuestAccess,
      closeLimitationModal,
    } = useGuestLimitations();

    const allMenuItems = [
      {
        icon: FiHome,
        label: "Home",
        description: "Main dashboard & chat",
        path: "/",
        showInGuest: true,
      },
      {
        icon: FiUser,
        label: "Profile Overview",
        description: "View and edit profile",
        path: "/profile",
        guestFeature: "profile",
        authOnly: true,
      },
      {
        icon: FiBell,
        label: "Notifications",
        description: "Updates and alerts",
        path: "/notifications",
        showInGuest: true,
      },
      {
        icon: FiShoppingCart,
        label: "Buy Forms",
        description: "Universities Form",
        path: "/forms",
        showInGuest: true,
      },
      {
        icon: FiClock,
        label: "Conversation History",
        description: "View past chats",
        path: "/conversation-history",
        showInGuest: true,
      },
      {
        icon: FiSettings,
        label: "Settings",
        description: "App preferences & account",
        path: "/settings",
        showInGuest: true,
      },
      {
        icon: FiFileText,
        label: "Transactions",
        description: "Payments history & receipts",
        path: "/transactions",
        guestFeature: "transactions",
        authOnly: true,
      },
      {
        icon: FiHelpCircle,
        label: "Help & Support",
        description: "Get help or contact us",
        path: "/help-support",
        showInGuest: true,
      },
      {
        icon: FiInfo,
        label: "About CERKYL",
        description: "App info & version",
        path: "/about",
        showInGuest: true,
      },
    ];

    const menuItems = isGuest
      ? allMenuItems.filter((item) => item.showInGuest)
      : allMenuItems;

    return (
      <>
        {/* Mobile Backdrop Blur Overlay */}
        <AnimatePresence>
          {!isDesktop && isOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-md"
            />
          )}
        </AnimatePresence>

        {/* Sidebar Container */}
        <motion.aside
          initial={false}
          animate={{
            width: isDesktop ? (isOpen ? 320 : 76) : 320,
            x: !isDesktop && !isOpen ? -320 : 0,
          }}
          transition={{ type: "spring", damping: 25, stiffness: 220 }}
          className={`${
            isDesktop ? "relative" : "fixed"
          } left-0 top-0 h-full z-50 flex flex-col transition-colors duration-200 overflow-hidden whitespace-nowrap border-r ${
            theme === "dark"
              ? "bg-slate-900/95 border-slate-800 text-white"
              : "bg-white/95 border-slate-200/80 text-slate-900"
          } shadow-2xl backdrop-blur-xl`}
        >
          <div className="flex flex-col h-full">
            {/* Header / Brand Section */}
            <div
              className={`px-4 py-3.5 border-b h-[72px] flex items-center shrink-0 ${
                isOpen ? "justify-between" : "justify-center"
              } ${theme === "dark" ? "border-slate-800/80" : "border-slate-200/80"}`}
            >
              {isOpen ? (
                <>
                  <div
                    onClick={() => navigate("/")}
                    className="flex items-center space-x-3 cursor-pointer group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/30 group-hover:scale-105 transition-transform">
                      <span className="text-white font-extrabold text-lg tracking-wider">
                        C
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                          CERKYL
                        </h2>
                        {isGuest && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            Guest
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                        Admissions & Career AI
                      </p>
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onClose}
                    className={`p-2 rounded-xl transition-colors ${
                      theme === "dark"
                        ? "text-slate-400 hover:bg-slate-800 hover:text-white"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                    title="Close sidebar"
                  >
                    {isDesktop ? (
                      <FiMenu className="w-5 h-5" />
                    ) : (
                      <FiX className="w-5 h-5" />
                    )}
                  </motion.button>
                </>
              ) : (
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("toggleMainSidebar"));
                  }}
                  className={`p-2.5 rounded-xl transition-colors ${
                    theme === "dark"
                      ? "text-slate-400 hover:bg-slate-800 hover:text-white"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                  title="Expand sidebar"
                >
                  <FiMenu className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Scrollable Navigation Items */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-hide">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  location.pathname === item.path ||
                  (item.path !== "/" &&
                    location.pathname.startsWith(item.path));

                return (
                  <div
                    key={item.path}
                    className={!isOpen ? "flex justify-center" : ""}
                  >
                    <Link
                      to={item.path}
                      title={!isOpen ? item.label : undefined}
                      onClick={(e) => {
                        if (
                          item.guestFeature &&
                          !item.showInGuest &&
                          !checkGuestAccess(item.guestFeature)
                        ) {
                          e.preventDefault();
                          return;
                        }
                        if (!isDesktop) onClose();
                      }}
                      className={`group relative flex items-center transition-all duration-200 rounded-2xl ${
                        isOpen ? "w-full p-2.5 space-x-3" : "w-11 h-11 justify-center"
                      } ${
                        isActive
                          ? "bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 font-semibold border border-primary-200/80 dark:border-primary-800/80 shadow-2xs"
                          : theme === "dark"
                          ? "text-slate-300 hover:bg-slate-800/70 hover:text-white"
                          : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      {/* Active Left Indicator Bar */}
                      {isActive && isOpen && (
                        <motion.div
                          layoutId="activeSidePill"
                          className="absolute left-0 top-2 bottom-2 w-1 bg-primary-600 dark:bg-primary-400 rounded-r-full"
                        />
                      )}

                      <div
                        className={`p-2 rounded-xl shrink-0 transition-colors ${
                          isActive
                            ? "bg-primary-600 text-white shadow-md shadow-primary-600/30"
                            : theme === "dark"
                            ? "bg-slate-800/80 text-slate-400 group-hover:bg-slate-700 group-hover:text-white"
                            : "bg-slate-100 text-slate-500 group-hover:bg-primary-50 group-hover:text-primary-600"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>

                      {isOpen && (
                        <div className="flex-1 min-w-0 text-left">
                          <h4
                            className={`text-xs font-bold truncate transition-colors ${
                              isActive
                                ? "text-primary-700 dark:text-primary-300"
                                : "text-slate-800 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white"
                            }`}
                          >
                            {item.label}
                          </h4>
                          <p
                            className={`text-[11px] truncate transition-colors mt-0.5 ${
                              isActive
                                ? "text-primary-600/80 dark:text-primary-400/80"
                                : "text-slate-400 dark:text-slate-500 group-hover:text-slate-500"
                            }`}
                          >
                            {item.description}
                          </p>
                        </div>
                      )}
                    </Link>
                  </div>
                );
              })}
            </div>

            {/* Bottom Footer Actions */}
            <div
              className={`p-4 border-t shrink-0 ${
                theme === "dark" ? "border-slate-800/80" : "border-slate-200/80"
              }`}
            >
              {isGuest ? (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    onClose();
                    navigate("/signup");
                  }}
                  title={!isOpen ? "Create Account" : undefined}
                  className={`w-full flex items-center justify-center space-x-2 py-2.5 px-3 rounded-2xl font-bold text-xs transition-all shadow-md shadow-primary-600/20 active:scale-95 ${
                    theme === "dark"
                      ? "bg-primary-600 hover:bg-primary-700 text-white"
                      : "bg-primary-600 hover:bg-primary-700 text-white"
                  }`}
                >
                  <FiUserPlus className="w-4 h-4 shrink-0" />
                  {isOpen && <span>Create Account</span>}
                </motion.button>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    logout();
                    navigate("/");
                  }}
                  title={!isOpen ? "Sign Out" : undefined}
                  className={`w-full flex items-center justify-center space-x-2.5 p-2.5 rounded-2xl font-bold text-xs transition-all ${
                    theme === "dark"
                      ? "bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/50"
                      : "bg-red-50 hover:bg-red-100 text-red-600 border border-red-200/60"
                  }`}
                >
                  <FiLogOut className="w-4 h-4 shrink-0" />
                  {isOpen && <span>Sign Out</span>}
                </motion.button>
              )}

              {isOpen && (
                <div className="mt-3 text-center">
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                    CERKYL v2.1.0 • Ghanaian University AI
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.aside>

        {/* Guest Limitation Modal */}
        <GuestLimitationModal
          isOpen={showLimitationModal}
          onClose={closeLimitationModal}
          feature={limitationData?.feature || ""}
          description={limitationData?.description || ""}
        />
      </>
    );
  }
);

Sidebar.displayName = "Sidebar";

export default Sidebar;
