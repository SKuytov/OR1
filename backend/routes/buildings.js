const express = require('express');
const router = express.Router();
const buildingController = require('../controllers/buildingController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Everyone logged-in can read buildings (for dropdowns)
router.get('/',
    authenticateToken,
    buildingController.getBuildings
);

// Admin can manage buildings
router.post('/',
    authenticateToken,
    authorizeRoles('admin'),
    buildingController.createBuilding
);

router.put('/:id',
    authenticateToken,
    authorizeRoles('admin'),
    buildingController.updateBuilding
);

module.exports = router;
