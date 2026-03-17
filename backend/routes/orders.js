// backend/routes/orders.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const supplierSuggestionsController = require('../controllers/supplierSuggestionsController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Get order statistics (admin and procurement) - MUST be before /:id
router.get('/stats/overview',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    orderController.getOrderStats
);

// ⭐ NEW: Phase 1 - Smart Supplier Suggestions
router.get('/:id/suggested-suppliers',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    supplierSuggestionsController.getSuggestedSuppliers
);

// ⭐ NEW: Log supplier selection for learning
router.post('/supplier-selection-log',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    supplierSuggestionsController.logSupplierSelection
);

// ⭐ NEW: Get suggestion statistics (admin)
router.get('/stats/suggestions',
    authenticateToken,
    authorizeRoles('admin'),
    supplierSuggestionsController.getSuggestionStats
);

// Create new order
router.post('/',
    authenticateToken,
    upload.array('files', 5),
    orderController.createOrder
);

// Get all orders (filtered by role + query params)
router.get('/',
    authenticateToken,
    orderController.getOrders
);

// Get specific order by ID
router.get('/:id',
    authenticateToken,
    orderController.getOrderById
);

// Update order (admin and procurement)
router.put('/:id',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    orderController.updateOrder
);

// Delete order (admin only)
router.delete('/:id',
    authenticateToken,
    authorizeRoles('admin'),
    orderController.deleteOrder
);

module.exports = router;
