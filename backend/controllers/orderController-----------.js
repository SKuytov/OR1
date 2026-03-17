// backend/controllers/orderController.js
const db = require('../config/database');
const emailService = require('../utils/emailService');

exports.createOrder = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const {
            building, itemDescription, partNumber, category,
            quantity, dateNeeded, priority, notes,
            requester, requesterEmail, costCenterId
        } = req.body;

        const [result] = await connection.query(
            `INSERT INTO orders (
                building, cost_center_id, item_description, part_number, category,
                quantity, date_needed, priority, notes,
                requester_id, requester_name, requester_email, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New')`,
            [building, costCenterId || null, itemDescription, partNumber || null, category || null,
             quantity, dateNeeded, priority || 'Normal', notes,
             req.user.id, requester, requesterEmail]
        );

        const orderId = result.insertId;

        // Handle file uploads
        if (req.files && req.files.length > 0) {
            const fileInserts = req.files.map(file => [
                orderId, file.originalname, `/uploads/${file.filename}`, file.mimetype, file.size
            ]);

            await connection.query(
                `INSERT INTO order_files
                (order_id, file_name, file_path, file_type, file_size)
                VALUES ?`,
                [fileInserts]
            );
        }

        // Get cost center code for email
        let costCenterCode = null;
        if (costCenterId) {
            const [cc] = await connection.query(
                'SELECT code FROM cost_centers WHERE id = ?',
                [costCenterId]
            );
            if (cc.length > 0) costCenterCode = cc[0].code;
        }

        await connection.commit();

        // Send email notification to admin/procurement (non-blocking)
        emailService.sendNewOrderNotification({
            orderId,
            building,
            itemDescription,
            quantity,
            requester,
            dateNeeded,
            priority: priority || 'Normal',
            costCenterCode
        }).catch(err => console.error('New order email failed:', err.message));

        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            orderId
        });
    } catch (error) {
        await connection.rollback();
        console.error('Create order error:', error);
        res.status(500).json({ success: false, message: 'Failed to create order' });
    } finally {
        connection.release();
    }
};

exports.getOrders = async (req, res) => {
    try {
        const { status, building, priority, supplier_id, search, assigned_filter } = req.query;

        let query = `
            SELECT o.*,
                   s.name as supplier_name,
                   q.quote_number,
                   cc.code as cost_center_code,
                   cc.name as cost_center_name,
                   u_assigned.name as assigned_to_name,
                   u_assigned.username as assigned_to_username,
                   TIMESTAMPDIFF(MINUTE, o.last_activity_at, NOW()) as minutes_since_activity,
                   GROUP_CONCAT(
                       DISTINCT JSON_OBJECT(
                           'id', f.id,
                           'name', f.file_name,
                           'path', f.file_path,
                           'type', f.file_type,
                           'size', f.file_size
                       )
                   ) as files
            FROM orders o
            LEFT JOIN order_files f ON o.id = f.order_id
            LEFT JOIN suppliers s ON o.supplier_id = s.id
            LEFT JOIN quotes q ON o.quote_ref = q.id
            LEFT JOIN cost_centers cc ON o.cost_center_id = cc.id
            LEFT JOIN users u_assigned ON o.assigned_to_user_id = u_assigned.id
        `;

        const conditions = [];
        const params = [];

        // Role-based filtering
        if (req.user.role === 'requester') {
            conditions.push('o.building = ?');
            params.push(req.user.building);
        }

        // Filters
        if (status) { conditions.push('o.status = ?'); params.push(status); }
        if (building) { conditions.push('o.building = ?'); params.push(building); }
        if (priority) { conditions.push('o.priority = ?'); params.push(priority); }
        if (supplier_id) { conditions.push('o.supplier_id = ?'); params.push(supplier_id); }
        
        // ⭐ NEW: Assignment filter for procurement
        if (assigned_filter === 'mine' && ['admin', 'procurement'].includes(req.user.role)) {
            conditions.push('o.assigned_to_user_id = ?');
            params.push(req.user.id);
        } else if (assigned_filter === 'unassigned') {
            conditions.push('o.assigned_to_user_id IS NULL');
        }
        
        if (search) {
            const s = `%${search.trim()}%`;
            const idMatch = parseInt(search.trim(), 10);
            const idClause = !isNaN(idMatch) ? ' OR o.id = ?' : '';
            const idParam = !isNaN(idMatch) ? [idMatch] : [];

            conditions.push(`(
                o.item_description LIKE ?
                OR o.part_number LIKE ?
                OR o.requester_name LIKE ?
                OR o.notes LIKE ?
                OR o.category LIKE ?
                OR o.status LIKE ?
                OR o.building LIKE ?
                OR s.name LIKE ?
                OR cc.code LIKE ?
                OR cc.name LIKE ?
                OR CAST(o.id AS CHAR) LIKE ?
                OR EXISTS (SELECT 1 FROM order_files f2 WHERE f2.order_id = o.id AND f2.file_name LIKE ?)
                ${idClause}
            )`);
            params.push(s, s, s, s, s, s, s, s, s, s, s, s, ...idParam);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' GROUP BY o.id ORDER BY o.submission_date DESC';

        const [orders] = await db.query(query, params);

        // Parse files JSON
        orders.forEach(order => {
            if (order.files && order.files !== 'null') {
                try {
                    order.files = JSON.parse(`[${order.files}]`);
                    order.files = order.files.filter(f => f.id !== null);
                } catch { order.files = []; }
            } else {
                order.files = [];
            }
        });

        res.json({ success: true, orders });
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve orders' });
    }
};

exports.getOrderById = async (req, res) => {
    try {
        const { id } = req.params;

        const [orders] = await db.query(`
            SELECT o.*,
                   s.name as supplier_name, s.email as supplier_email,
                   s.contact_person as supplier_contact,
                   q.quote_number, q.status as quote_status,
                   cc.code as cost_center_code, cc.name as cost_center_name,
                   u_assigned.id as assigned_to_id,
                   u_assigned.name as assigned_to_name,
                   u_assigned.username as assigned_to_username,
                   u_assigned.email as assigned_to_email,
                   TIMESTAMPDIFF(MINUTE, o.last_activity_at, NOW()) as minutes_since_activity
            FROM orders o
            LEFT JOIN suppliers s ON o.supplier_id = s.id
            LEFT JOIN quotes q ON o.quote_ref = q.id
            LEFT JOIN cost_centers cc ON o.cost_center_id = cc.id
            LEFT JOIN users u_assigned ON o.assigned_to_user_id = u_assigned.id
            WHERE o.id = ?
        `, [id]);

        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const order = orders[0];

        // Get files
        const [files] = await db.query(
            'SELECT id, file_name, file_path, file_type, file_size, uploaded_at FROM order_files WHERE order_id = ?',
            [id]
        );
        order.files = files;

        // Get history
        const [history] = await db.query(
            'SELECT * FROM order_history WHERE order_id = ? ORDER BY changed_at DESC',
            [id]
        );
        order.history = history;
        
        // ⭐ NEW: Get assignment history
        const [assignmentHistory] = await db.query(
            `SELECT ah.*, 
                    u_from.name as from_user_name,
                    u_to.name as to_user_name,
                    u_by.name as by_user_name
             FROM order_assignment_history ah
             LEFT JOIN users u_from ON ah.assigned_from_user_id = u_from.id
             LEFT JOIN users u_to ON ah.assigned_to_user_id = u_to.id
             LEFT JOIN users u_by ON ah.assigned_by_user_id = u_by.id
             WHERE ah.order_id = ?
             ORDER BY ah.created_at DESC
             LIMIT 5`,
            [id]
        );
        order.assignmentHistory = assignmentHistory;

        res.json({ success: true, order });
    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve order' });
    }
};

exports.updateOrder = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const updates = req.body;

        const [currentOrder] = await connection.query(
            'SELECT * FROM orders WHERE id = ?', [id]
        );

        if (currentOrder.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const orderData = currentOrder[0];
        
        // ⭐ NEW: Check assignment permissions
        if (orderData.assigned_to_user_id && req.user.role !== 'admin') {
            // If order is assigned, only the assigned user can edit it
            if (orderData.assigned_to_user_id !== req.user.id) {
                await connection.rollback();
                
                // Get assigned user name
                const [assignedUser] = await connection.query(
                    'SELECT name FROM users WHERE id = ?',
                    [orderData.assigned_to_user_id]
                );
                
                return res.status(403).json({ 
                    success: false, 
                    message: `This order is currently being processed by ${assignedUser[0]?.name || 'another user'}. Only they or an admin can edit it.`,
                    assigned_to: assignedUser[0]?.name
                });
            }
        }
        
        // ⭐ NEW: Auto-claim order on first edit if not assigned
        if (!orderData.assigned_to_user_id && ['admin', 'procurement'].includes(req.user.role)) {
            const now = new Date();
            await connection.query(
                `UPDATE orders 
                 SET assigned_to_user_id = ?, assigned_at = ?, last_activity_at = ?
                 WHERE id = ?`,
                [req.user.id, now, now, id]
            );
            
            // Log the auto-claim
            await connection.query(
                `INSERT INTO order_assignment_history 
                 (order_id, assigned_to_user_id, assigned_by_user_id, assignment_type, reason)
                 VALUES (?, ?, ?, 'claim', 'Auto-claimed on first edit')`,
                [id, req.user.id, req.user.id]
            );
        }

        // Allowed updatable fields
        const allowedFields = [
            'status', 'supplier', 'supplier_id', 'quote_id', 'price',
            'unit_price', 'total_price', 'assigned_to', 'priority',
            'expected_delivery_date', 'notes', 'part_number', 'category',
            'cost_center_id',
            'supplier_notes', 'alternative_product_name', 'alternative_product_description'
        ];

        const updateFields = [];
        const updateValues = [];

        for (const key of Object.keys(updates)) {
            if (allowedFields.includes(key)) {
                updateFields.push(`${key} = ?`);
                updateValues.push(updates[key]);
            }
        }

        if (updateFields.length > 0) {
            updateValues.push(id);

            await connection.query(
                `UPDATE orders SET ${updateFields.join(', ')} WHERE id = ?`,
                updateValues
            );

            // Log history for each changed field
            for (const key of Object.keys(updates)) {
                if (allowedFields.includes(key) && String(orderData[key]) !== String(updates[key])) {
                    await connection.query(
                        `INSERT INTO order_history
                        (order_id, changed_by, field_name, old_value, new_value)
                        VALUES (?, ?, ?, ?, ?)`,
                        [id, req.user.username, key,
                         String(orderData[key] || ''), String(updates[key] || '')]
                    );
                }
            }
        }

        await connection.commit();

        // Send email if status changed
        if (updates.status && updates.status !== orderData.status) {
            emailService.sendStatusUpdateNotification({
                orderId: id,
                requesterEmail: orderData.requester_email,
                requesterName: orderData.requester_name,
                oldStatus: orderData.status,
                newStatus: updates.status,
                building: orderData.building,
                itemDescription: orderData.item_description
            }).catch(err => console.error('Status update email failed:', err.message));
        }

        res.json({ success: true, message: 'Order updated successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Update order error:', error);
        res.status(500).json({ success: false, message: 'Failed to update order' });
    } finally {
        connection.release();
    }
};

exports.deleteOrder = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { id } = req.params;

        const [orders] = await connection.query(
            'SELECT * FROM orders WHERE id = ?', [id]
        );

        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Delete files from filesystem
        const [files] = await connection.query(
            'SELECT file_path FROM order_files WHERE order_id = ?', [id]
        );

        const fs = require('fs');
        files.forEach(file => {
            const absolutePath = path.join('/var/www/partpulse-orders/backend', file.file_path);
            if (fs.existsSync(file.file_path)) {
                fs.unlinkSync(file.file_path);
            }
        });

        await connection.query('DELETE FROM orders WHERE id = ?', [id]);
        await connection.commit();

        res.json({ success: true, message: 'Order deleted successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Delete order error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete order' });
    } finally {
        connection.release();
    }
};

exports.getOrderStats = async (req, res) => {
    try {
        const [statusCounts] = await db.query(
            'SELECT status, COUNT(*) as count FROM orders GROUP BY status'
        );

        const [buildingCounts] = await db.query(
            'SELECT building, COUNT(*) as count FROM orders GROUP BY building'
        );

        const [totalValue] = await db.query(
            `SELECT SUM(total_price) as total FROM orders WHERE status NOT IN ('Cancelled')`
        );

        const [priorityCounts] = await db.query(
            'SELECT priority, COUNT(*) as count FROM orders GROUP BY priority'
        );

        const [recentOrders] = await db.query(`
            SELECT id, building, item_description, status, priority, submission_date
            FROM orders ORDER BY submission_date DESC LIMIT 10
        `);
        
        // ⭐ NEW: Assignment statistics
        const [assignmentStats] = await db.query(`
            SELECT 
                COUNT(CASE WHEN assigned_to_user_id IS NOT NULL THEN 1 END) as assigned_count,
                COUNT(CASE WHEN assigned_to_user_id IS NULL THEN 1 END) as unassigned_count,
                COUNT(CASE WHEN assigned_to_user_id IS NOT NULL AND 
                      TIMESTAMPDIFF(MINUTE, last_activity_at, NOW()) > 30 THEN 1 END) as stale_count
            FROM orders
            WHERE status IN ('New', 'Pending', 'Quote Requested', 'Quote Received')
        `);

        res.json({
            success: true,
            stats: {
                byStatus: statusCounts,
                byBuilding: buildingCounts,
                byPriority: priorityCounts,
                totalValue: totalValue[0].total || 0,
                recentOrders,
                assignments: assignmentStats[0] || {}
            }
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve statistics' });
    }
};
