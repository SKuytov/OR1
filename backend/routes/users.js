const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Admin-only user management
router.get('/',
    authenticateToken,
    authorizeRoles('admin'),
    userController.listUsers
);

router.post('/',
    authenticateToken,
    authorizeRoles('admin'),
    userController.createUser
);

router.put('/:id',
    authenticateToken,
    authorizeRoles('admin'),
    userController.updateUser
);

router.post('/:id/reset-password',
    authenticateToken,
    authorizeRoles('admin'),
    userController.resetPassword
);

module.exports = router;
