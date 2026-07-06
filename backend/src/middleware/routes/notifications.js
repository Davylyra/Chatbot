
import express from 'express';
import authMiddleware from '../authMiddleware.js';
import {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearReadNotifications,
  trackNotificationAccess,
  getReadMessages
} from '../../controllers/notificationController.js';
import { getAdmissionNotifications } from '../../utils/admissionNotificationsFetcher.js';

const router = express.Router();

router.get('/', authMiddleware, getUserNotifications);

// Get read/marked messages (24-hour temporary storage)
router.get('/read-messages', authMiddleware, getReadMessages);

// Get system-wide admission notifications (no auth required)
router.get('/admission/feed', async (req, res) => {
  try {
    const { limit = 20, skip = 0 } = req.query;
    const result = await getAdmissionNotifications(parseInt(limit), parseInt(skip));
    
    if (result.success) {
      res.json({
        success: true,
        notifications: result.notifications,
        count: result.notifications.length
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    console.error(' Error fetching admission notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admission notifications'
    });
  }
});

router.post('/:notificationId/access', authMiddleware, trackNotificationAccess);

router.put('/:notificationId/read', authMiddleware, markAsRead);

router.put('/read-all', authMiddleware, markAllAsRead);

router.delete('/:notificationId', authMiddleware, deleteNotification);

router.delete('/clear-read', authMiddleware, clearReadNotifications);

export default router;
