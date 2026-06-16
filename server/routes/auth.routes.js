const express = require('express');
const router = express.Router();
const authController = require('../controller/authController');
const { verifyToken, isAdmin } = require('../middleware/authmiddleware');

// --- Public OAuth Routes ---

// Social Auth - INITIAL REDIRECT
router.get('/google', authController.googleAuth);
router.get('/github', authController.githubAuth);

// Social Auth - CALLBACKS
router.get('/google/callback', authController.googleCallback);
router.get('/github/callback', authController.githubCallback);

const { setCsrfToken } = require('../middleware/csrfmiddleware');

// --- Public Local Auth Routes ---
router.post('/register', authController.register);
router.post('/verify-email', authController.verifyEmail);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/intelligence-preview', authController.getIntelligencePreview);
router.get('/csrf-token', authController.getCsrfToken);

// --- Protected User Routes ---
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/profile', verifyToken, setCsrfToken, authController.getProfile);

// --- Admin Management Routes ---

router.get('/admin/users', verifyToken, isAdmin, async (req, res, next) => {
    try {
        // Dynamic import to avoid circular dependency
        const UserService = require('../src/core/services/UserService');
        const userService = new UserService();
        
        // Note: You may need to add getAllUsers to your UserService class
        const users = await userService.getUserStats(); 
        res.json({ success: true, users });
    } catch (error) {
        next(error); 
    }
});

router.get('/admin/stats', verifyToken, isAdmin, async (req, res, next) => {
    try {
        const UserService = require('../src/core/services/UserService');
        const userService = new UserService();
        const stats = await userService.getUserStats();
        res.json({ success: true, stats });
    } catch (error) {
        next(error);
    }
});

module.exports = router;