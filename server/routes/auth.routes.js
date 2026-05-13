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

// --- Protected User Routes ---
router.post('/logout', verifyToken, authController.logout);
router.get('/profile', verifyToken, authController.getProfile);

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