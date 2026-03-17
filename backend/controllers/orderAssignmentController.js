// backend/controllers/orderAssignmentController.js
// Order Assignment System - Handles claiming, releasing, and reassigning orders

const db = require('../config/database');

// Constants
const AUTO_RELEASE_MINUTES = 30; // Auto-release after 30 minutes of inactivity

/**
 * Claim an order for processing
 * Only unassigned orders or stale assignments can be claimed
 */
exports.claimOrder = async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { id } = req.params;
        const userId = req.user.id;
        
        // Get current order state
        const [orders] = await connection.query(
            `SELECT id, assigned_to_user_id, assigned_at, last_activity_at, status 
             FROM orders WHERE id = ?`,
            [id]
        );
        
        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }
        
        const order = orders[0];
        
        // Check if already assigned to someone else
        if (order.assigned_to_user_id && order.assigned_to_user_id !== userId) {
            // Check if assignment is stale (no activity for AUTO_RELEASE_MINUTES)
            const minutesSinceActivity = order.last_activity_at 
                ? Math.floor((Date.now() - new Date(order.last_activity_at)) / 60000)
                : 999;
            
            if (minutesSinceActivity < AUTO_RELEASE_MINUTES) {
                await connection.rollback();
                
                // Get assigned user name
                const [assignedUser] = await connection.query(
                    'SELECT name, username FROM users WHERE id = ?',
                    [order.assigned_to_user_id]
                );
                
                return res.status(409).json({ 
                    success: false, 
                    message: `Order is currently being processed by ${assignedUser[0]?.name || 'another user'}`,
                    assigned_to: assignedUser[0],
                    minutes_ago: minutesSinceActivity
                });
            }
            
            // Assignment is stale, auto-release it
            await connection.query(
                `INSERT INTO order_assignment_history 
                 (order_id, assigned_from_user_id, assigned_to_user_id, assigned_by_user_id, assignment_type, reason)
                 VALUES (?, ?, NULL, ?, 'auto_release', 'Automatic release due to inactivity')`,
                [id, order.assigned_to_user_id, userId]
            );
        }
        
        // Claim the order
        const now = new Date();
        await connection.query(
            `UPDATE orders 
             SET assigned_to_user_id = ?, 
                 assigned_at = ?, 
                 last_activity_at = ?
             WHERE id = ?`,
            [userId, now, now, id]
        );
        
        // Log the claim
        await connection.query(
            `INSERT INTO order_assignment_history 
             (order_id, assigned_from_user_id, assigned_to_user_id, assigned_by_user_id, assignment_type, reason)
             VALUES (?, NULL, ?, ?, 'claim', 'User claimed order for processing')`,
            [id, userId, userId]
        );
        
        await connection.commit();
        
        res.json({ 
            success: true, 
            message: 'Order claimed successfully',
            assigned_at: now
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Claim order error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to claim order' 
        });
    } finally {
        connection.release();
    }
};

/**
 * Release an order (make it unassigned)
 * User can release their own orders, admin can release any
 */
exports.releaseOrder = async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { id } = req.params;
        const userId = req.user.id;
        const { reason } = req.body;
        
        // Get current order state
        const [orders] = await connection.query(
            `SELECT id, assigned_to_user_id FROM orders WHERE id = ?`,
            [id]
        );
        
        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }
        
        const order = orders[0];
        
        // Check permissions
        if (order.assigned_to_user_id !== userId && req.user.role !== 'admin') {
            await connection.rollback();
            return res.status(403).json({ 
                success: false, 
                message: 'You can only release your own orders' 
            });
        }
        
        if (!order.assigned_to_user_id) {
            await connection.rollback();
            return res.status(400).json({ 
                success: false, 
                message: 'Order is not assigned to anyone' 
            });
        }
        
        // Release the order
        await connection.query(
            `UPDATE orders 
             SET assigned_to_user_id = NULL, 
                 assigned_at = NULL,
                 last_activity_at = NULL
             WHERE id = ?`,
            [id]
        );
        
        // Log the release
        await connection.query(
            `INSERT INTO order_assignment_history 
             (order_id, assigned_from_user_id, assigned_to_user_id, assigned_by_user_id, assignment_type, reason)
             VALUES (?, ?, NULL, ?, 'release', ?)`,
            [id, order.assigned_to_user_id, userId, reason || 'User released order']
        );
        
        await connection.commit();
        
        res.json({ 
            success: true, 
            message: 'Order released successfully' 
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Release order error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to release order' 
        });
    } finally {
        connection.release();
    }
};

/**
 * Reassign order to another user (admin only)
 */
exports.reassignOrder = async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { id } = req.params;
        const { new_user_id, reason } = req.body;
        const adminId = req.user.id;
        
        if (!new_user_id) {
            await connection.rollback();
            return res.status(400).json({ 
                success: false, 
                message: 'new_user_id is required' 
            });
        }
        
        // Verify new user exists and has correct role
        const [newUser] = await connection.query(
            `SELECT id, name, role FROM users WHERE id = ? AND active = 1`,
            [new_user_id]
        );
        
        if (newUser.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false, 
                message: 'Target user not found or inactive' 
            });
        }
        
        if (!['admin', 'procurement'].includes(newUser[0].role)) {
            await connection.rollback();
            return res.status(400).json({ 
                success: false, 
                message: 'Target user must be admin or procurement role' 
            });
        }
        
        // Get current order state
        const [orders] = await connection.query(
            `SELECT id, assigned_to_user_id FROM orders WHERE id = ?`,
            [id]
        );
        
        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }
        
        const order = orders[0];
        const previousUserId = order.assigned_to_user_id;
        
        // Reassign the order
        const now = new Date();
        await connection.query(
            `UPDATE orders 
             SET assigned_to_user_id = ?, 
                 assigned_at = ?,
                 last_activity_at = ?
             WHERE id = ?`,
            [new_user_id, now, now, id]
        );
        
        // Log the reassignment
        await connection.query(
            `INSERT INTO order_assignment_history 
             (order_id, assigned_from_user_id, assigned_to_user_id, assigned_by_user_id, assignment_type, reason)
             VALUES (?, ?, ?, ?, 'reassign', ?)`,
            [id, previousUserId, new_user_id, adminId, reason || 'Admin reassignment']
        );
        
        await connection.commit();
        
        res.json({ 
            success: true, 
            message: `Order reassigned to ${newUser[0].name}`,
            assigned_to: newUser[0]
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Reassign order error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to reassign order' 
        });
    } finally {
        connection.release();
    }
};

/**
 * Request reassignment (creates notification for admin)
 */
exports.requestReassignment = async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { id } = req.params;
        const { reason } = req.body;
        const userId = req.user.id;
        
        // Verify order exists and user has it assigned
        const [orders] = await connection.query(
            `SELECT id, assigned_to_user_id, item_description FROM orders WHERE id = ?`,
            [id]
        );
        
        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }
        
        const order = orders[0];
        
        if (order.assigned_to_user_id !== userId) {
            await connection.rollback();
            return res.status(403).json({ 
                success: false, 
                message: 'You can only request reassignment for your own orders' 
            });
        }
        
        // Add note to assignment history
        await connection.query(
            `INSERT INTO order_assignment_history 
             (order_id, assigned_from_user_id, assigned_to_user_id, assigned_by_user_id, assignment_type, reason)
             VALUES (?, ?, ?, ?, 'reassign', ?)`,
            [id, userId, userId, userId, `REASSIGNMENT REQUESTED: ${reason || 'No reason provided'}`]
        );
        
        await connection.commit();
        
        // TODO: Send notification to admin (implement notification system)
        
        res.json({ 
            success: true, 
            message: 'Reassignment request submitted to admin' 
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Request reassignment error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to request reassignment' 
        });
    } finally {
        connection.release();
    }
};

/**
 * Get assignment history for an order
 */
exports.getAssignmentHistory = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [history] = await db.query(
            `SELECT 
                ah.*,
                u_from.name as from_user_name,
                u_to.name as to_user_name,
                u_by.name as by_user_name
             FROM order_assignment_history ah
             LEFT JOIN users u_from ON ah.assigned_from_user_id = u_from.id
             LEFT JOIN users u_to ON ah.assigned_to_user_id = u_to.id
             LEFT JOIN users u_by ON ah.assigned_by_user_id = u_by.id
             WHERE ah.order_id = ?
             ORDER BY ah.created_at DESC`,
            [id]
        );
        
        res.json({ 
            success: true, 
            history 
        });
        
    } catch (error) {
        console.error('Get assignment history error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to retrieve assignment history' 
        });
    }
};

/**
 * Get my assigned orders
 */
exports.getMyAssignedOrders = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const [orders] = await db.query(
            `SELECT * FROM v_my_assigned_orders 
             WHERE assigned_to_user_id = ?
             ORDER BY 
                CASE priority 
                    WHEN 'Urgent' THEN 1
                    WHEN 'High' THEN 2
                    WHEN 'Normal' THEN 3
                    WHEN 'Low' THEN 4
                END,
                submission_date ASC`,
            [userId]
        );
        
        res.json({ 
            success: true, 
            orders,
            count: orders.length
        });
        
    } catch (error) {
        console.error('Get my assigned orders error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to retrieve assigned orders' 
        });
    }
};

/**
 * Get unassigned orders
 */
exports.getUnassignedOrders = async (req, res) => {
    try {
        const [orders] = await db.query(
            `SELECT * FROM v_unassigned_orders LIMIT 50`
        );
        
        res.json({ 
            success: true, 
            orders,
            count: orders.length
        });
        
    } catch (error) {
        console.error('Get unassigned orders error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to retrieve unassigned orders' 
        });
    }
};

/**
 * Auto-release stale assignments (cron job endpoint)
 */
exports.autoReleaseStaleAssignments = async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        // Find stale assignments
        const [staleOrders] = await connection.query(
            `SELECT id, assigned_to_user_id, last_activity_at
             FROM orders
             WHERE assigned_to_user_id IS NOT NULL
             AND last_activity_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
            [AUTO_RELEASE_MINUTES]
        );
        
        let releasedCount = 0;
        
        for (const order of staleOrders) {
            // Release the order
            await connection.query(
                `UPDATE orders 
                 SET assigned_to_user_id = NULL, 
                     assigned_at = NULL,
                     last_activity_at = NULL
                 WHERE id = ?`,
                [order.id]
            );
            
            // Log the auto-release
            await connection.query(
                `INSERT INTO order_assignment_history 
                 (order_id, assigned_from_user_id, assigned_to_user_id, assigned_by_user_id, assignment_type, reason)
                 VALUES (?, ?, NULL, 1, 'auto_release', 'Automatic release after ${AUTO_RELEASE_MINUTES} minutes of inactivity')`,
                [order.id, order.assigned_to_user_id]
            );
            
            releasedCount++;
        }
        
        await connection.commit();
        
        res.json({ 
            success: true, 
            message: `Auto-released ${releasedCount} stale assignments`,
            released_count: releasedCount
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Auto-release error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to auto-release stale assignments' 
        });
    } finally {
        connection.release();
    }
};
