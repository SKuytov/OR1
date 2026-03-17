// backend/routes/suppliers.js
const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplierController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Get all suppliers
router.get('/',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    supplierController.getSuppliers
);

// ⭐ Get AI-powered supplier suggestions for an order
router.get('/suggestions/:orderId',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    supplierController.getSupplierSuggestions
);

// ⭐ Get brand rules configuration
router.get('/brand-rules',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    supplierController.getBrandRules
);

// ⭐ NEW: Create/Update brand rule
router.post('/brand-rules',
    authenticateToken,
    authorizeRoles('admin'),
    supplierController.createOrUpdateBrandRule
);

// ⭐ NEW: Delete brand rule
router.delete('/brand-rules/:brandName',
    authenticateToken,
    authorizeRoles('admin'),
    supplierController.deleteBrandRule
);

// ⭐ NEW: Auto-learn brand patterns from historical data
router.post('/brand-rules/learn',
    authenticateToken,
    authorizeRoles('admin'),
    supplierController.learnBrandPatterns
);

// Create supplier
router.post('/',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    supplierController.createSupplier
);

// Update supplier
router.put('/:id',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    supplierController.updateSupplier
);

// Delete supplier
router.delete('/:id',
    authenticateToken,
    authorizeRoles('admin'),
    supplierController.deleteSupplier
);

module.exports = router;
