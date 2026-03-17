// backend/routes/quoteEmail.js
// Smart Quote Send routes
// POST /api/quotes/:id/send-log   — record that a quote email was sent
// GET  /api/quotes/:id/send-log   — get send history for a quote
// GET  /api/quotes/:id/email-data — get all data needed to compose the email

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
    getQuoteEmailData,
    logQuoteSend,
    getQuoteSendLog
} = require('../controllers/quoteController');

// All routes require auth
router.use(authenticateToken);

// GET /api/quotes/:id/email-data — full data for email composition
router.get('/:id/email-data', getQuoteEmailData);

// POST /api/quotes/:id/send-log — record a send action
router.post('/:id/send-log', logQuoteSend);

// GET /api/quotes/:id/send-log — get send history
router.get('/:id/send-log', getQuoteSendLog);

module.exports = router;
