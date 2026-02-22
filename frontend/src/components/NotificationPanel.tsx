/**
 * Notification Panel Component
 * Displays real-time notifications with glassmorphism design
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiBell, FiX, FiExternalLink, FiClock, FiCheckCircle, FiAlertCircle, FiInfo, FiXCircle } from 'react-icons/fi';
import { useTheme } from '../contexts/ThemeContext';
import { useSocket, type NotificationData } from '../hooks/useSocket';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({ isOpen, onClose }) => {
  const { theme } = useTheme();
  const { notifications, removeNotification, clearAllNotifications, markAsRead, readMessages, readMessagesCount, fetchReadMessages } = useSocket();
  const [unreadCount, setUnreadCount] = useState(0);
  const [deletionCountdowns, setDeletionCountdowns] = useState<Record<string, number>>({});
  const [showReadMessages, setShowReadMessages] = useState(false);

  // Calculate unread count
  useEffect(() => {
    const unread = notifications.filter(n => !n.metadata?.read).length;
    setUnreadCount(unread);
  }, [notifications]);

  // Track deletion countdowns for read notifications
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setDeletionCountdowns(prev => {
        const updated = { ...prev };
        notifications.forEach(n => {
          if (n.scheduledDeletionAt && n.metadata?.read) {
            const remaining = Math.max(0, Math.ceil((n.scheduledDeletionAt.getTime() - now.getTime()) / 1000));
            updated[n.id] = remaining;
          }
        });
        return updated;
      });
    }, 100); // Update every 100ms for smooth countdown

    return () => clearInterval(interval);
  }, [notifications]);

  // Auto-close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const panel = document.getElementById('notification-panel');
      if (panel && !panel.contains(event.target as Node) && isOpen) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <FiCheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <FiXCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <FiAlertCircle className="w-5 h-5 text-yellow-500" />;
      default:
        return <FiInfo className="w-5 h-5 text-blue-500" />;
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return timestamp.toLocaleDateString();
  };

  const handleNotificationClick = (notification: NotificationData) => {
    // Mark as read via API
    markAsRead(notification.id);
  };

  const handleReadNowClick = async (notification: NotificationData, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Mark as read
    markAsRead(notification.id);
    
    // Track access via API
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
      const token = localStorage.getItem('token');
      
      await fetch(`${API_BASE_URL}/api/notifications/${notification.id}/access`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.warn('Failed to track notification access:', error);
    }
    
    // Open the source URL (readNowUrl takes priority)
    const urlToOpen = notification.readNowUrl || notification.link || notification.actionUrl;
    
    if (urlToOpen && urlToOpen.startsWith('http')) {
      // Open in new tab with security measures
      window.open(urlToOpen, '_blank', 'noopener,noreferrer');
      console.log(`📖 User accessed notification: ${notification.title} at ${urlToOpen}`);
    }
  };

  const isReadNowActive = (notification: NotificationData) => {
    if (!notification.readNowExpiresAt) return true; // Not read yet, always active
    
    const now = new Date();
    const expiryDate = new Date(notification.readNowExpiresAt);
    return now < expiryDate;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-start justify-end p-4 pointer-events-none"
      >
        <motion.div
          id="notification-panel"
          initial={{ opacity: 0, scale: 0.95, x: 20 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.95, x: 20 }}
          transition={{ duration: 0.2 }}
          className={`pointer-events-auto w-full max-w-md max-h-[80vh] overflow-hidden rounded-2xl shadow-2xl border ${
            theme === 'dark'
              ? 'bg-gray-800/95 border-gray-700 backdrop-blur-xl'
              : 'bg-white/95 border-gray-200 backdrop-blur-xl'
          }`}
        >
          {/* Header */}
          <div className={`flex items-center justify-between p-4 border-b ${
            theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
          }`}>
            <div className="flex items-center space-x-2">
              <div className="relative">
                <FiBell className={`w-5 h-5 ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                }`} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <h3 className={`font-semibold ${
                theme === 'dark' ? 'text-white' : 'text-gray-800'
              }`}>
                Notifications
              </h3>
            </div>

            <div className="flex items-center space-x-2">
              {notifications.length > 0 && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={clearAllNotifications}
                  className={`text-sm px-2 py-1 rounded-md transition-colors ${
                    theme === 'dark'
                      ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700'
                      : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                  }`}
                >
                  Clear All
                </motion.button>
              )}

              {/* Read Messages Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  if (!showReadMessages) {
                    fetchReadMessages();
                  }
                  setShowReadMessages(!showReadMessages);
                }}
                className={`text-sm px-3 py-1 rounded-md transition-colors flex items-center space-x-1 ${
                  showReadMessages
                    ? theme === 'dark'
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-500 text-white'
                    : theme === 'dark'
                      ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700'
                      : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                <FiCheckCircle className="w-3 h-3" />
                <span>Read ({readMessagesCount})</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onClose}
                className={`p-1 rounded-lg transition-colors ${
                  theme === 'dark'
                    ? 'hover:bg-gray-700 text-gray-400'
                    : 'hover:bg-gray-100 text-gray-600'
                }`}
              >
                <FiX className="w-4 h-4" />
              </motion.button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto scrollbar-hide">
            {showReadMessages ? (
              // Read Messages View
              readMessages.length === 0 ? (
                <div className={`text-center py-8 px-4 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  <FiCheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No read messages</p>
                  <p className="text-xs mt-1">Read messages are stored for 24 hours</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  <AnimatePresence>
                    {readMessages.map((notification, index) => (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -100 }}
                        transition={{ delay: index * 0.05 }}
                        className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <div className="flex items-start space-x-3">
                          <div className="flex-shrink-0 mt-0.5">
                            {getNotificationIcon(notification.type)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between">
                              <h4 className={`text-sm font-medium truncate ${
                                theme === 'dark' ? 'text-white' : 'text-gray-900'
                              }`}>
                                {notification.title}
                              </h4>
                              
                              {notification.timeRemaining && notification.timeRemaining > 0 && (
                                <span className={`text-xs px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${
                                  theme === 'dark'
                                    ? 'bg-yellow-900/50 text-yellow-300'
                                    : 'bg-yellow-100 text-yellow-700'
                                }`}>
                                  {Math.floor(notification.timeRemaining / 3600)}h left
                                </span>
                              )}
                            </div>

                            <p className={`text-sm mt-1 ${
                              theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                            }`}>
                              {notification.message}
                            </p>

                            {(notification.link || notification.actionUrl) && (
                              <div className="mt-3">
                                <motion.a
                                  whileHover={{ scale: 1.02 }}
                                  whileTap={{ scale: 0.98 }}
                                  href={notification.link || notification.actionUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                                    theme === 'dark'
                                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                                  }`}
                                >
                                  <FiExternalLink className="w-4 h-4 mr-1.5" />
                                  View Details
                                </motion.a>
                              </div>
                            )}

                            <div className="flex items-center justify-between mt-2">
                              <div className="flex items-center space-x-1 text-xs text-gray-500">
                                <FiClock className="w-3 h-3" />
                                <span>Read {formatTimestamp(notification.readAt || notification.createdAt)}</span>
                              </div>

                              {notification.category && (
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  theme === 'dark'
                                    ? 'bg-gray-700 text-gray-300'
                                    : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {notification.category.replace('_', ' ')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )
            ) : (
              // Active Notifications View
              notifications.length === 0 ? (
                <div className={`text-center py-8 px-4 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  <FiBell className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No notifications yet</p>
                  <p className="text-xs mt-1">We'll notify you about important updates</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  <AnimatePresence>
                    {notifications.map((notification, index) => (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -100 }}
                        transition={{ delay: index * 0.05 }}
                        className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                          !notification.metadata?.read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                        }`}
                      >
                        <div className="flex items-start space-x-3">
                          <div className="flex-shrink-0 mt-0.5">
                            {getNotificationIcon(notification.type)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between">
                              <h4 
                                className={`text-sm font-medium truncate cursor-pointer ${
                                  theme === 'dark' ? 'text-white' : 'text-gray-900'
                                }`}
                                onClick={() => handleNotificationClick(notification)}
                              >
                                {notification.title}
                              </h4>

                              <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
                                {/* Show deletion countdown for read notifications */}
                                {notification.metadata?.read && deletionCountdowns[notification.id] > 0 && (
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full animate-pulse ${
                                    theme === 'dark'
                                      ? 'bg-red-900/50 text-red-300'
                                      : 'bg-red-100 text-red-600'
                                  }`}>
                                    {deletionCountdowns[notification.id]}s
                                  </span>
                                )}

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeNotification(notification.id);
                                  }}
                                  title="Dismiss notification"
                                  className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors ${
                                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                                  }`}
                                >
                                  <FiX className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            <p className={`text-sm mt-1 ${
                              theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                            }`}>
                              {notification.message}
                            </p>

                            {/* "Read now" button with 24-hour expiry */}
                            {(notification.readNowUrl || notification.link || notification.actionUrl) && (
                              <div className="mt-3">
                                {isReadNowActive(notification) ? (
                                  <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={(e) => handleReadNowClick(notification, e)}
                                    className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                                      theme === 'dark'
                                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                        : 'bg-blue-500 hover:bg-blue-600 text-white'
                                    }`}
                                  >
                                    <FiExternalLink className="w-4 h-4 mr-1.5" />
                                    Read now
                                  </motion.button>
                                ) : (
                                  <div className={`inline-flex items-center px-3 py-1.5 text-sm rounded-lg opacity-50 cursor-not-allowed ${
                                    theme === 'dark'
                                      ? 'bg-gray-700 text-gray-400'
                                      : 'bg-gray-200 text-gray-500'
                                  }`}>
                                    <FiXCircle className="w-4 h-4 mr-1.5" />
                                    Expired (24h limit)
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="flex items-center justify-between mt-2">
                              <div className="flex items-center space-x-1 text-xs text-gray-500">
                                <FiClock className="w-3 h-3" />
                                <span>{formatTimestamp(notification.createdAt)}</span>
                              </div>

                              {notification.category && (
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  theme === 'dark'
                                    ? 'bg-gray-700 text-gray-300'
                                    : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {notification.category.replace('_', ' ')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )
            )}
          </div>

          {/* Footer */}
          {(showReadMessages ? readMessages.length > 0 : notifications.length > 0) && (
            <div className={`p-3 border-t ${
              theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <p className={`text-xs text-center ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`}>
                {showReadMessages ? (
                  <>
                    {readMessages.length} read message{readMessages.length !== 1 ? 's' : ''}
                    {readMessagesCount > readMessages.length && ` • ${readMessagesCount} total`}
                  </>
                ) : (
                  <>
                    {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
                    {unreadCount > 0 && ` • ${unreadCount} unread`}
                  </>
                )}
              </p>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default NotificationPanel;
