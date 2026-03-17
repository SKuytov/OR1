// backend/routes/quotes.js
const express = require('express');
const router = express.Router();
const quoteController = require('../controllers/quoteController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Get all quotes
router.get('/',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    quoteController.getQuotes
);

// Get single quote with items
router.get('/:id',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    quoteController.getQuoteById
);

// Create quote (group multiple orders)
router.post('/',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    quoteController.createQuote
);

// Update quote
router.put('/:id',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    quoteController.updateQuote
);

// Add order items to existing quote
router.post('/:id/items',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    quoteController.addItemsToQuote
);

// Remove item from quote
router.delete('/:id/items/:itemId',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    quoteController.removeItemFromQuote
);

// Approve quote
router.post('/:id/approve',
    authenticateToken,
    authorizeRoles('admin'),
    quoteController.approveQuote
);

module.exports = router;
