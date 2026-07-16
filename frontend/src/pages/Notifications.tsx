import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { FiAlertCircle, FiCheck } from "react-icons/fi";
import Navbar from "../components/Navbar";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { contentService, type PageContent } from "../services/contentService";
import { useSocket } from "../hooks/useSocket";

const Notifications: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { user, isGuest } = useAuth();
  const { notifications, markAsRead, markAllAsRead } = useSocket();

  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [recentlyMarkedRead, setRecentlyMarkedRead] = useState<Set<string>>(
    new Set(),
  );
  const [pageContent, setPageContent] = useState<PageContent | null>(null);

  useEffect(() => {
    const loadPageContent = async () => {
      try {
        const content = await contentService.getPageContent("notifications");
        setPageContent(content);
      } catch (error) {
        console.error("Failed to load page content:", error);
      }
    };

    loadPageContent();
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkAllAsRead = useCallback(async () => {
    if (!user?.id) return;

    try {
      const result = await markAllAsRead();
      if (result.success) {
        setShowSuccessMessage(true);
        setTimeout(() => setShowSuccessMessage(false), 3000);
      }
    } catch {}
  }, [user?.id, markAllAsRead]);

  const handleMarkAsRead = useCallback(
    (notificationId: string) => {
      markAsRead(notificationId);
      setRecentlyMarkedRead((prev) => new Set([...prev, notificationId]));
      setTimeout(() => {
        setRecentlyMarkedRead((prev) => {
          const newSet = new Set(prev);
          newSet.delete(notificationId);
          return newSet;
        });
      }, 2000);
    },
    [markAsRead],
  );

  if (isGuest) {
    return (
      <div className="min-h-screen">
        <Navbar
          title="NOTIFICATIONS"
          showBackButton={true}
          onBackClick={() => navigate("/")}
          showMenuButton={false}
        />

        <div className="w-full max-w-sm mx-auto px-4 py-8 overflow-hidden md:max-w-xl md:px-6 md:py-10 lg:max-w-2xl xl:max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className={`rounded-2xl border p-6 text-center backdrop-blur-md ${
              theme === "dark"
                ? "bg-gray-800/60 border-gray-700 text-gray-100"
                : "bg-white/80 border-gray-200 text-gray-800"
            }`}
          >
            <FiAlertCircle
              className={`mx-auto mb-4 h-12 w-12 ${
                theme === "dark" ? "text-yellow-400" : "text-yellow-600"
              }`}
            />
            <h3 className="text-xl font-semibold mb-2">
              Login to view notification
            </h3>
            <p
              className={`text-sm ${theme === "dark" ? "text-gray-300" : "text-gray-600"}`}
            >
              Sign in to see your updates, alerts, and unread notifications.
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Navigation Header */}
      <Navbar
        title="NOTIFICATIONS"
        showBackButton={true}
        onBackClick={() => navigate("/")}
        showMenuButton={false}
        showNotificationBadge={true}
        notificationCount={unreadCount}
        showMarkAllReadButton={true}
        onMarkAllReadClick={unreadCount > 0 ? handleMarkAllAsRead : undefined}
      />

      {/* Success Message */}
      <AnimatePresence>
        {showSuccessMessage && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50"
          >
            <div
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg shadow-lg ${
                theme === "dark"
                  ? "bg-green-800/90 text-green-200 border border-green-700"
                  : "bg-green-100 text-green-800 border border-green-200"
              }`}
            >
              <FiCheck className="w-4 h-4" />
              <span className="text-sm font-medium">
                {pageContent?.sections.find((s) => s.id === "success-message")
                  ?.content || "All notifications marked as read"}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="w-full max-w-sm mx-auto px-4 py-4 overflow-hidden md:max-w-xl md:px-6 md:py-6 lg:max-w-2xl xl:max-w-3xl">
        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center mb-6"
        >
          <p
            className={`font-medium transition-colors duration-200 ${
              theme === "dark" ? "text-primary-400" : "text-primary-600"
            }`}
          >
            {pageContent?.sections.find((s) => s.id === "page-title")
              ?.content || "Updates and Alerts"}
          </p>
        </motion.div>

        {/* Notifications List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-4"
        >
          {notifications.length > 0 ? (
            notifications.map((notification, index) => {
              const isRecentlyMarked = recentlyMarkedRead.has(notification.id);
              const isUnread = !notification.isRead;

              return (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className={`backdrop-blur-md rounded-2xl p-4 relative cursor-pointer hover:shadow-lg transition-all duration-300 border ${
                    theme === "dark"
                      ? "bg-white/10 border-white/20 hover:bg-white/15"
                      : "bg-white/80 border-white/30 hover:bg-white/90"
                  } ${isRecentlyMarked ? "ring-2 ring-green-500/50" : ""}`}
                  onClick={() => handleMarkAsRead(notification.id)}
                >
                  {/* Unread indicator */}
                  {isUnread && !isRecentlyMarked && (
                    <div className="absolute top-4 right-4 w-3 h-3 bg-primary-500 rounded-full"></div>
                  )}

                  {/* Recently marked indicator */}
                  {isRecentlyMarked && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute top-4 right-4 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center"
                    >
                      <FiCheck className="w-3 h-3 text-white" />
                    </motion.div>
                  )}

                  {/* Notification content */}
                  <div className="flex items-start space-x-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-200 ${
                        notification.type === "success"
                          ? theme === "dark"
                            ? "bg-green-900/50"
                            : "bg-green-100"
                          : notification.type === "warning"
                            ? theme === "dark"
                              ? "bg-yellow-900/50"
                              : "bg-yellow-100"
                            : notification.type === "error"
                              ? theme === "dark"
                                ? "bg-red-900/50"
                                : "bg-red-100"
                              : theme === "dark"
                                ? "bg-gray-700"
                                : "bg-gray-100"
                      }`}
                    >
                      <FiAlertCircle
                        className={`w-5 h-5 transition-colors duration-200 ${
                          notification.type === "success"
                            ? theme === "dark"
                              ? "text-green-400"
                              : "text-green-600"
                            : notification.type === "warning"
                              ? theme === "dark"
                                ? "text-yellow-400"
                                : "text-yellow-600"
                              : notification.type === "error"
                                ? theme === "dark"
                                  ? "text-red-400"
                                  : "text-red-600"
                                : theme === "dark"
                                  ? "text-gray-300"
                                  : "text-gray-600"
                        }`}
                      />
                    </div>
                    <div className="flex-1">
                      <h3
                        className={`font-semibold mb-1 transition-colors duration-200 ${
                          theme === "dark" ? "text-white" : "text-gray-800"
                        }`}
                      >
                        {notification.title}
                      </h3>
                      <p
                        className={`text-sm mb-2 transition-colors duration-200 ${
                          theme === "dark" ? "text-gray-300" : "text-gray-600"
                        }`}
                      >
                        {notification.message}
                      </p>

                      {/* Clickable link if available */}
                      {notification.link && (
                        <a
                          href={notification.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className={`inline-block text-sm font-medium mb-2 transition-colors duration-200 ${
                            theme === "dark"
                              ? "text-blue-400 hover:text-blue-300"
                              : "text-blue-600 hover:text-blue-700"
                          } underline`}
                        >
                          {notification.linkText || "Learn more"} →
                        </a>
                      )}

                      <p
                        className={`text-xs transition-colors duration-200 ${
                          theme === "dark" ? "text-gray-400" : "text-gray-500"
                        }`}
                      >
                        {new Date(notification.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })
          ) : (
            /* Empty State */
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className={`text-center py-12 transition-colors duration-200 ${
                theme === "dark" ? "text-gray-400" : "text-gray-500"
              }`}
            >
              <FiAlertCircle
                className={`w-16 h-16 mx-auto mb-4 transition-colors duration-200 ${
                  theme === "dark" ? "text-gray-600" : "text-gray-300"
                }`}
              />
              <h3
                className={`text-lg font-medium mb-2 transition-colors duration-200 ${
                  theme === "dark" ? "text-gray-300" : "text-gray-700"
                }`}
              >
                {pageContent?.sections.find((s) => s.id === "empty-state")
                  ?.title || "No notifications yet"}
              </h3>
              <p className="text-sm">
                {pageContent?.sections.find((s) => s.id === "empty-state")
                  ?.content ||
                  "You'll see updates and alerts here when they arrive."}
              </p>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Notifications;
