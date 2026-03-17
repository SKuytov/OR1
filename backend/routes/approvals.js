// backend/routes/approvals.js - Phase 3: Approval Workflow
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const nodemailer = require('nodemailer');

// Email transporter (configure in .env)
const createTransporter = () => {
    if (!process.env.SMTP_HOST) {
        console.warn('SMTP not configured, email notifications disabled');
        return null;
    }
    
    return nodemailer.createTransporter({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
};

// ========== GET: List approvals with filters ==========
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { status, assigned_to, order_id, from_date, to_date } = req.query;
        const user = req.user;
        
        let query = `
            SELECT 
                a.*,
                o.item_description,
                o.building,
                o.cost_center_code,
                s.name as supplier_name,
                u_req.name as requested_by_name,
                u_req.email as requested_by_email,
                u_assigned.name as assigned_to_name,
                u_approved.name as approved_by_name,
                d.file_name as quote_file_name,
                d.id as quote_document_id
            FROM approvals a
            INNER JOIN orders o ON a.order_id = o.id
            LEFT JOIN suppliers s ON a.supplier_id = s.id
            LEFT JOIN users u_req ON a.requested_by = u_req.id
            LEFT JOIN users u_assigned ON a.assigned_to = u_assigned.id
            LEFT JOIN users u_approved ON a.approved_by = u_approved.id
            LEFT JOIN documents d ON a.quote_document_id = d.id
            WHERE 1=1
        `;
        
        const params = [];
        
        // Filter by assigned manager (managers only see their assignments)
        if (user.role === 'manager') {
            query += ' AND a.assigned_to = ?';
            params.push(user.id);
        }
        
        // Requesters only see their own requests
        if (user.role === 'requester') {
            query += ' AND a.requested_by = ?';
            params.push(user.id);
        }
        
        if (status) {
            query += ' AND a.status = ?';
            params.push(status);
        }
        
        if (assigned_to) {
            query += ' AND a.assigned_to = ?';
            params.push(assigned_to);
        }
        
        if (order_id) {
            query += ' AND a.order_id = ?';
            params.push(order_id);
        }
        
        if (from_date) {
            query += ' AND a.requested_at >= ?';
            params.push(from_date);
        }
        
        if (to_date) {
            query += ' AND a.requested_at <= ?';
            params.push(to_date);
        }
        
        query += ' ORDER BY a.requested_at DESC';
        
        const [approvals] = await pool.query(query, params);
        
        res.json({
            success: true,
            approvals
        });
    } catch (error) {
        console.error('Error fetching approvals:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch approvals'
        });
    }
});

// ========== GET: Count pending approvals for manager ==========
router.get('/pending-count', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'manager' && req.user.role !== 'admin') {
            return res.json({ success: true, count: 0 });
        }
        
        let query = "SELECT COUNT(*) as count FROM approvals WHERE status = 'pending'";
        const params = [];
        
        if (req.user.role === 'manager') {
            query += ' AND assigned_to = ?';
            params.push(req.user.id);
        }
        
        const [result] = await pool.query(query, params);
        
        res.json({
            success: true,
            count: result[0].count
        });
    } catch (error) {
        console.error('Error counting pending approvals:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to count pending approvals'
        });
    }
});

// ========== GET: Single approval details ==========
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const [approvals] = await pool.query(`
            SELECT 
                a.*,
                o.item_description,
                o.part_number,
                o.quantity,
                o.building,
                o.cost_center_code,
                o.cost_center_name,
                o.notes as order_notes,
                s.name as supplier_name,
                s.email as supplier_email,
                u_req.name as requested_by_name,
                u_req.email as requested_by_email,
                u_assigned.name as assigned_to_name,
                u_approved.name as approved_by_name,
                d.file_name as quote_file_name,
                d.file_path as quote_file_path,
                d.id as quote_document_id
            FROM approvals a
            INNER JOIN orders o ON a.order_id = o.id
            LEFT JOIN suppliers s ON a.supplier_id = s.id
            LEFT JOIN users u_req ON a.requested_by = u_req.id
            LEFT JOIN users u_assigned ON a.assigned_to = u_assigned.id
            LEFT JOIN users u_approved ON a.approved_by = u_approved.id
            LEFT JOIN documents d ON a.quote_document_id = d.id
            WHERE a.id = ?
        `, [id]);
        
        if (approvals.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Approval not found'
            });
        }
        
        // Get approval history
        const [history] = await pool.query(`
            SELECT 
                ah.*,
                u.name as performed_by_name
            FROM approval_history ah
            LEFT JOIN users u ON ah.performed_by = u.id
            WHERE ah.approval_id = ?
            ORDER BY ah.performed_at DESC
        `, [id]);
        
        res.json({
            success: true,
            approval: {
                ...approvals[0],
                history
            }
        });
    } catch (error) {
        console.error('Error fetching approval details:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch approval details'
        });
    }
});

// ========== POST: Create approval request ==========
router.post('/', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const {
            order_id,
            quote_document_id,
            assigned_to,
            estimated_cost,
            supplier_id,
            priority,
            comments
        } = req.body;
        
        if (!order_id) {
            return res.status(400).json({
                success: false,
                message: 'Order ID is required'
            });
        }
        
        await connection.beginTransaction();
        
        // Create approval request
        const [result] = await connection.query(`
            INSERT INTO approvals 
            (order_id, quote_document_id, requested_by, assigned_to, estimated_cost, supplier_id, priority, comments)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [order_id, quote_document_id || null, req.user.id, assigned_to || null, estimated_cost || null, supplier_id || null, priority || 'Normal', comments || null]);
        
        const approvalId = result.insertId;
        
        // Log to approval history
        await connection.query(`
            INSERT INTO approval_history
            (approval_id, action, performed_by, new_status, comments)
            VALUES (?, 'created', ?, 'pending', ?)
        `, [approvalId, req.user.id, comments]);
        
        // Update order approval status
        await connection.query(
            "UPDATE orders SET approval_status = 'pending' WHERE id = ?",
            [order_id]
        );
        
        await connection.commit();
        
        // Send email notification to manager
        if (assigned_to) {
            const [managers] = await pool.query(
                'SELECT name, email, notification_email, email_notifications_enabled FROM users WHERE id = ?',
                [assigned_to]
            );
            
            if (managers.length > 0 && managers[0].email_notifications_enabled) {
                const managerEmail = managers[0].notification_email || managers[0].email;
                await sendApprovalNotification(approvalId, managerEmail, managers[0].name);
            }
        }
        
        res.json({
            success: true,
            message: 'Approval request created',
            approvalId
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error creating approval request:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create approval request'
        });
    } finally {
        connection.release();
    }
});

// ========== PUT: Approve request ==========
router.put('/:id/approve', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const { id } = req.params;
        const { comments } = req.body;
        
        // Verify approval exists and is pending
        const [approvals] = await connection.query(
            'SELECT * FROM approvals WHERE id = ? AND status = "pending"',
            [id]
        );
        
        if (approvals.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pending approval not found'
            });
        }
        
        const approval = approvals[0];
        
        await connection.beginTransaction();
        
        // Update approval
        await connection.query(`
            UPDATE approvals 
            SET status = 'approved', 
                approved_by = ?, 
                approved_at = NOW(),
                comments = CONCAT(COALESCE(comments, ''), '\n\nApproved: ', ?)
            WHERE id = ?
        `, [req.user.id, comments || '', id]);
        
        // Log to history
        await connection.query(`
            INSERT INTO approval_history
            (approval_id, action, performed_by, old_status, new_status, comments)
            VALUES (?, 'approved', ?, 'pending', 'approved', ?)
        `, [id, req.user.id, comments]);
        
        // Update order
        await connection.query(`
            UPDATE orders 
            SET approval_status = 'approved',
                approved_by = ?,
                approved_at = NOW(),
                status = 'Approved'
            WHERE id = ?
        `, [req.user.id, approval.order_id]);
        
        await connection.commit();
        
        // Notify requester
        const [requesters] = await pool.query(
            'SELECT name, email FROM users WHERE id = ?',
            [approval.requested_by]
        );
        
        if (requesters.length > 0) {
            await sendApprovalDecisionNotification(id, requesters[0].email, 'approved', comments);
        }
        
        res.json({
            success: true,
            message: 'Approval granted'
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error approving request:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to approve request'
        });
    } finally {
        connection.release();
    }
});

// ========== PUT: Reject request ==========
router.put('/:id/reject', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const { id } = req.params;
        const { rejection_reason } = req.body;
        
        if (!rejection_reason) {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required'
            });
        }
        
        // Verify approval exists and is pending
        const [approvals] = await connection.query(
            'SELECT * FROM approvals WHERE id = ? AND status = "pending"',
            [id]
        );
        
        if (approvals.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pending approval not found'
            });
        }
        
        const approval = approvals[0];
        
        await connection.beginTransaction();
        
        // Update approval
        await connection.query(`
            UPDATE approvals 
            SET status = 'rejected', 
                approved_by = ?, 
                approved_at = NOW(),
                rejection_reason = ?
            WHERE id = ?
        `, [req.user.id, rejection_reason, id]);
        
        // Log to history
        await connection.query(`
            INSERT INTO approval_history
            (approval_id, action, performed_by, old_status, new_status, comments)
            VALUES (?, 'rejected', ?, 'pending', 'rejected', ?)
        `, [id, req.user.id, rejection_reason]);
        
        // Update order
        await connection.query(`
            UPDATE orders 
            SET approval_status = 'rejected',
                status = 'On Hold'
            WHERE id = ?
        `, [approval.order_id]);
        
        await connection.commit();
        
        // Notify requester
        const [requesters] = await pool.query(
            'SELECT name, email FROM users WHERE id = ?',
            [approval.requested_by]
        );
        
        if (requesters.length > 0) {
            await sendApprovalDecisionNotification(id, requesters[0].email, 'rejected', rejection_reason);
        }
        
        res.json({
            success: true,
            message: 'Approval rejected'
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error rejecting request:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reject request'
        });
    } finally {
        connection.release();
    }
});

// ========== Helper: Send approval notification email ==========
async function sendApprovalNotification(approvalId, managerEmail, managerName) {
    const transporter = createTransporter();
    if (!transporter) return;
    
    try {
        const [approvals] = await pool.query(`
            SELECT 
                a.*,
                o.item_description,
                o.building,
                u.name as requested_by_name
            FROM approvals a
            INNER JOIN orders o ON a.order_id = o.id
            INNER JOIN users u ON a.requested_by = u.id
            WHERE a.id = ?
        `, [approvalId]);
        
        if (approvals.length === 0) return;
        
        const approval = approvals[0];
        const appUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        
        await transporter.sendMail({
            from: process.env.SMTP_FROM || 'noreply@partpulse.eu',
            to: managerEmail,
            subject: `[PartPulse] Approval Required: Order #${approval.order_id}`,
            html: `
                <h2>New Approval Request</h2>
                <p>Hello ${managerName},</p>
                <p>A new quote approval is awaiting your review:</p>
                <ul>
                    <li><strong>Order ID:</strong> #${approval.order_id}</li>
                    <li><strong>Item:</strong> ${approval.item_description}</li>
                    <li><strong>Building:</strong> ${approval.building}</li>
                    <li><strong>Estimated Cost:</strong> ${approval.estimated_cost ? '$' + approval.estimated_cost : 'N/A'}</li>
                    <li><strong>Requested by:</strong> ${approval.requested_by_name}</li>
                    <li><strong>Priority:</strong> ${approval.priority}</li>
                </ul>
                <p><a href="${appUrl}" style="background:#3b82f6;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Review in PartPulse</a></p>
                <p style="color:#666;font-size:0.9em;">Please log in to PartPulse to review and approve or reject this request.</p>
            `
        });
        
        console.log('Approval notification sent to:', managerEmail);
    } catch (error) {
        console.error('Error sending approval notification:', error);
    }
}

// ========== Helper: Send approval decision notification ==========
async function sendApprovalDecisionNotification(approvalId, requesterEmail, decision, comments) {
    const transporter = createTransporter();
    if (!transporter) return;
    
    try {
        const [approvals] = await pool.query(`
            SELECT 
                a.*,
                o.item_description,
                u.name as approved_by_name
            FROM approvals a
            INNER JOIN orders o ON a.order_id = o.id
            LEFT JOIN users u ON a.approved_by = u.id
            WHERE a.id = ?
        `, [approvalId]);
        
        if (approvals.length === 0) return;
        
        const approval = approvals[0];
        const isApproved = decision === 'approved';
        
        await transporter.sendMail({
            from: process.env.SMTP_FROM || 'noreply@partpulse.eu',
            to: requesterEmail,
            subject: `[PartPulse] Order #${approval.order_id} ${isApproved ? 'Approved' : 'Rejected'}`,
            html: `
                <h2>Approval ${isApproved ? 'Granted' : 'Rejected'}</h2>
                <p>Your quote request for Order #${approval.order_id} has been <strong>${decision}</strong>.</p>
                <ul>
                    <li><strong>Item:</strong> ${approval.item_description}</li>
                    <li><strong>Decision by:</strong> ${approval.approved_by_name}</li>
                    <li><strong>Comments:</strong> ${comments || 'None'}</li>
                </ul>
                ${isApproved ? '<p>You can now proceed to send the purchase order to the supplier.</p>' : '<p>Please review the rejection reason and resubmit if needed.</p>'}
            `
        });
        
        console.log('Decision notification sent to:', requesterEmail);
    } catch (error) {
        console.error('Error sending decision notification:', error);
    }
}

module.exports = router;
