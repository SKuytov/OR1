// backend/routes/test.js
const express = require('express');
const router = express.Router();
const emailService = require('../utils/emailService');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Test email configuration (admin only)
router.get('/email/verify',
    authenticateToken,
    authorizeRoles('admin'),
    async (req, res) => {
        try {
            const result = await emailService.testEmailConnection();
            res.json(result);
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

// Send test new order email (admin only)
router.post('/email/test-new-order',
    authenticateToken,
    authorizeRoles('admin'),
    async (req, res) => {
        try {
            const result = await emailService.sendNewOrderNotification({
                orderId: 9999,
                building: 'TEST',
                itemDescription: 'Тестова заявка за проверка на имейл системата',
                quantity: 1,
                requester: req.user.name || 'Test User',
                dateNeeded: new Date().toISOString().split('T')[0],
                priority: 'Normal',
                costCenterCode: 'TEST-001'
            });
            
            res.json({
                success: result.success,
                message: result.success ? 'Test email sent successfully' : 'Failed to send test email',
                messageId: result.messageId,
                error: result.error
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

// Send test status update email (admin only)
router.post('/email/test-status-update',
    authenticateToken,
    authorizeRoles('admin'),
    async (req, res) => {
        try {
            const testEmail = req.body.email || req.user.email;
            
            if (!testEmail) {
                return res.status(400).json({
                    success: false,
                    error: 'No email provided. Pass email in request body or use your own.'
                });
            }
            
            const result = await emailService.sendStatusUpdateNotification({
                orderId: 9999,
                requesterEmail: testEmail,
                requesterName: req.user.name || 'Test User',
                oldStatus: 'New',
                newStatus: 'Approved',
                building: 'TEST',
                itemDescription: 'Тестова заявка за проверка на имейл системата'
            });
            
            res.json({
                success: result.success,
                message: result.success ? `Test email sent to ${testEmail}` : 'Failed to send test email',
                messageId: result.messageId,
                error: result.error
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

// Get email configuration status (admin only)
router.get('/email/config',
    authenticateToken,
    authorizeRoles('admin'),
    async (req, res) => {
        try {
            const config = {
                smtpHost: process.env.SMTP_HOST || 'NOT SET',
                smtpPort: process.env.SMTP_PORT || 'NOT SET',
                smtpSecure: process.env.SMTP_SECURE || 'NOT SET',
                smtpUser: process.env.SMTP_USER || 'NOT SET',
                smtpPasswordSet: !!process.env.SMTP_PASSWORD,
                emailFrom: process.env.EMAIL_FROM || 'NOT SET',
                frontendUrl: process.env.FRONTEND_URL || 'NOT SET',
                adminEmail: process.env.ADMIN_EMAIL || 'NOT SET'
            };
            
            res.json({
                success: true,
                config,
                warning: !process.env.SMTP_HOST ? 'SMTP configuration incomplete' : null
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

module.exports = router;
