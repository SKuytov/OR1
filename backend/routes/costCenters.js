const express = require('express');
const router = express.Router();
const costCenterController = require('../controllers/costCenterController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Everyone logged-in can read cost centers (for order form radio buttons)
router.get('/',
    authenticateToken,
    costCenterController.getCostCenters
);

// Admin can manage cost centers
router.post('/',
    authenticateToken,
    authorizeRoles('admin'),
    costCenterController.createCostCenter
);

router.put('/:id',
    authenticateToken,
    authorizeRoles('admin'),
    costCenterController.updateCostCenter
);

router.delete('/:id',
    authenticateToken,
    authorizeRoles('admin'),
    costCenterController.deleteCostCenter
);

module.exports = router;
