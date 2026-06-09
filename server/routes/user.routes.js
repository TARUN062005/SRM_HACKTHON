const express = require('express');
const router = express.Router();
const userController = require('../controller/userController');
const { verifyToken } = require('../middleware/authmiddleware');

// ✅ Added upload middleware (multer)
const upload = require('../middleware/upload');
router.post('/request-reactivation', userController.requestReactivation);
router.use(verifyToken);
router.get('/profile', userController.getProfile);
router.post('/active-ping', userController.activePing);
router.post('/logout-all', userController.logoutAllSessions);

// ✅ Update account settings + upload profileImage
router.patch('/settings', upload.single('profileImage'), userController.updateSettings);
router.get('/activity', userController.getActivityLogs);

// Account Lifecycle: ?type=suspend (Soft) or ?type=permanent (Hard)
router.delete('/account', userController.deleteAccount);
router.get('/notifications', userController.getNotifications);

// Mark all as read (when user visits notification page)
router.patch('/notifications/read-all', userController.markAllNotificationsRead);

// Mark a single notification as read
router.patch('/notifications/:id/read', userController.markNotificationRead);

// Click CTA action (track clicks)
router.post('/notifications/:id/click', userController.trackNotificationClick);
router.post('/notifications/push-token', userController.savePushToken);
router.delete("/notifications/push-token", userController.deletePushToken);
router.get("/notifications/push-token", userController.getPushTokens);
router.patch('/email/subscription', userController.updateEmailSubscription);

// Get email subscription status
router.get('/email/subscription', userController.getEmailSubscription);

module.exports = router;