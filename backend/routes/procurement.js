// backend/routes/procurement.js
// PartPulse Orders v3.0 - Procurement Lifecycle Routes
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/procurementController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const procurementAuth = [authenticateToken, authorizeRoles('admin', 'procurement')];
const allAuth = [authenticateToken, authorizeRoles('admin', 'procurement', 'manager')];

// Quote responses
router.get('/quotes/:quoteId/responses', allAuth, ctrl.getQuoteResponses);
router.post('/quotes/:quoteId/responses', procurementAuth, ctrl.recordQuoteResponse);
router.put('/quotes/responses/:responseId', procurementAuth, ctrl.updateQuoteResponse);

// Purchase orders
router.get('/purchase-orders', allAuth, ctrl.getPOs);
router.post('/purchase-orders', procurementAuth, ctrl.createPO);
router.get('/purchase-orders/:id', allAuth, ctrl.getPOById);
router.put('/purchase-orders/:id', procurementAuth, ctrl.updatePO);

// Invoices
router.get('/invoices', allAuth, ctrl.getInvoices);
router.post('/invoices', procurementAuth, ctrl.createInvoice);
router.put('/invoices/:id', procurementAuth, ctrl.updateInvoice);

// Unified lifecycle views
router.get('/lifecycle/:orderId', allAuth, ctrl.getOrderLifecycle);
router.get('/lifecycle/quote/:quoteId', allAuth, ctrl.getQuoteLifecycle);

module.exports = router;
