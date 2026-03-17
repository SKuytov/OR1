// backend/routes/orderAssignments.js
// Routes for order assignment system

const express = require('express');
const router = express.Router();
const assignmentController = require('../controllers/orderAssignmentController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// ============================================================================
// Order Assignment Routes
// ============================================================================

// Get my assigned orders (procurement and admin)
router.get('/my-orders',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    assignmentController.getMyAssignedOrders
);

// Get unassigned orders (procurement and admin)
router.get('/unassigned',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    assignmentController.getUnassignedOrders
);

// Claim an order (procurement and admin)
router.post('/:id/claim',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    assignmentController.claimOrder
);

// Release an order (procurement can release own, admin can release any)
router.post('/:id/release',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    assignmentController.releaseOrder
);

// Request reassignment (procurement)
router.post('/:id/request-reassignment',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    assignmentController.requestReassignment
);

// Reassign order to another user (admin only)
router.post('/:id/reassign',
    authenticateToken,
    authorizeRoles('admin'),
    assignmentController.reassignOrder
);

// Get assignment history for an order
router.get('/:id/history',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    assignmentController.getAssignmentHistory
);

// Auto-release stale assignments (cron job endpoint - admin only)
router.post('/auto-release',
    authenticateToken,
    authorizeRoles('admin'),
    assignmentController.autoReleaseStaleAssignments
);

module.exports = router;
