// backend/routes/analytics.js - Analytics & Financial Endpoints
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const analyticsController = require('../controllers/analyticsController');

// All analytics routes require authentication
router.get('/summary', authenticateToken, analyticsController.getSummary);
router.get('/spend-over-time', authenticateToken, analyticsController.getSpendOverTime);
router.get('/spend-by-building', authenticateToken, analyticsController.getSpendByBuilding);
router.get('/spend-by-supplier', authenticateToken, analyticsController.getSpendBySupplier);
router.get('/spend-by-category', authenticateToken, analyticsController.getSpendByCategory);
router.get('/spend-by-cost-center', authenticateToken, analyticsController.getSpendByCostCenter);
router.get('/order-status-distribution', authenticateToken, analyticsController.getOrderStatusDistribution);
router.get('/supplier-performance', authenticateToken, analyticsController.getSupplierPerformance);
router.get('/monthly-orders-count', authenticateToken, analyticsController.getMonthlyOrdersCount);
router.get('/approval-stats', authenticateToken, analyticsController.getApprovalStats);
router.get('/top-parts', authenticateToken, analyticsController.getTopParts);
router.get('/drill-down', authenticateToken, analyticsController.getDrillDown);

module.exports = router;
