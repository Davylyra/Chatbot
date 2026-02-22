/**
 * REAL-TIME NOTIFICATION SERVICE (COMPATIBILITY LAYER)
 * 
 * ⚠️ DEPRECATED: This file is kept for backward compatibility only.
 * All functionality has been moved to notificationService.js
 * 
 * Please import directly from notificationService.js instead:
 * import notificationService from './notificationService.js';
 */

// Re-export all functions from the unified service
export {
  setIO,
  sendToUser,
  broadcastNotification,
  sendUserNotification,
  sendAdmissionUpdate,
  sendPaymentNotification,
  sendFormNotification,
  getUnreadCount,
  markAsRead
} from './notificationService.js';

import notificationService from './notificationService.js';

// Default export for compatibility
export default notificationService;

