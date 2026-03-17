// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

// Login route
router.post('/login', authController.login);

// Verify token route
router.get('/verify', authenticateToken, authController.verify);

// Logout route
router.post('/logout', authenticateToken, authController.logout);

module.exports = router;
