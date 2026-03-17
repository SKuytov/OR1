// backend/controllers/documents.js
// Document Management Controller - Phase 1

const db = require('../config/database');
const fs = require('fs').promises;
const path = require('path');

// Get all documents for an order
exports.getOrderDocuments = async (req, res) => {
    try {
        const { orderId } = req.params;
        
        const [documents] = await db.query(`
            SELECT 
                d.*,
                u.name as uploaded_by_name,
                p.name as processed_by_name
            FROM documents d
            LEFT JOIN users u ON d.uploaded_by = u.id
            LEFT JOIN users p ON d.processed_by = p.id
            WHERE d.order_id = ?
            ORDER BY d.uploaded_at DESC
        `, [orderId]);
        
        res.json({ success: true, documents });
    } catch (error) {
        console.error('Get order documents error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch documents' });
    }
};

// Upload document
exports.uploadDocument = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { document_type, notes, requires_action, action_deadline, action_notes, metadata } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        // Insert document record
        const [result] = await db.query(`
            INSERT INTO documents (
                order_id, document_type, file_path, file_name, file_size, mime_type,
                uploaded_by, notes, requires_action, action_deadline, action_notes, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            orderId,
            document_type,
            req.file.path,
            req.file.originalname,
            req.file.size,
            req.file.mimetype,
            req.user.id,
            notes || null,
            requires_action === 'true' || requires_action === true ? 1 : 0,
            action_deadline || null,
            action_notes || null,
            metadata ? JSON.stringify(metadata) : null
        ]);
        
        // Log activity in order history
        await db.query(`
            INSERT INTO order_history (order_id, field_name, old_value, new_value, changed_by)
            VALUES (?, 'document', '', ?)
        `, [orderId, `Uploaded ${document_type}: ${req.file.originalname}`]);
        
        res.json({
            success: true,
            message: 'Document uploaded successfully',
            documentId: result.insertId,
            fileName: req.file.originalname
        });
    } catch (error) {
        console.error('Upload document error:', error);
        
        // Clean up uploaded file on error
        if (req.file && req.file.path) {
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                console.error('Failed to delete file:', unlinkError);
            }
        }
        
        res.status(500).json({ success: false, message: 'Failed to upload document' });
    }
};

// Delete document
exports.deleteDocument = async (req, res) => {
    try {
        const { documentId } = req.params;
        
        // Get document info
        const [documents] = await db.query('SELECT * FROM documents WHERE id = ?', [documentId]);
        
        if (documents.length === 0) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        
        const document = documents[0];
        
        // Check permissions (only uploader or admin can delete)
        if (req.user.role !== 'admin' && document.uploaded_by !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this document' });
        }
        
        // Delete file from filesystem
        try {
            await fs.unlink(document.file_path);
        } catch (fileError) {
            console.error('Failed to delete file from filesystem:', fileError);
            // Continue with database deletion even if file delete fails
        }
        
        // Delete from database
        await db.query('DELETE FROM documents WHERE id = ?', [documentId]);
        
        // Log activity
        await db.query(`
            INSERT INTO order_history (order_id, field_name, old_value, new_value, changed_by)
            VALUES (?, 'document', ?, 'deleted')
        `, [document.order_id, `${document.document_type}: ${document.file_name}`]);
        
        res.json({ success: true, message: 'Document deleted successfully' });
    } catch (error) {
        console.error('Delete document error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete document' });
    }
};

// Update document status/metadata
exports.updateDocument = async (req, res) => {
    try {
        const { documentId } = req.params;
        const { status, notes, requires_action, action_deadline, action_notes, metadata } = req.body;
        
        const updates = [];
        const values = [];
        
        if (status) {
            updates.push('status = ?');
            values.push(status);
            
            if (status === 'processed' || status === 'sent_to_accounting') {
                updates.push('processed_at = NOW()', 'processed_by = ?');
                values.push(req.user.id);
            }
        }
        
        if (notes !== undefined) {
            updates.push('notes = ?');
            values.push(notes);
        }
        
        if (requires_action !== undefined) {
            updates.push('requires_action = ?');
            values.push(requires_action ? 1 : 0);
        }
        
        if (action_deadline !== undefined) {
            updates.push('action_deadline = ?');
            values.push(action_deadline || null);
        }
        
        if (action_notes !== undefined) {
            updates.push('action_notes = ?');
            values.push(action_notes);
        }
        
        if (metadata) {
            updates.push('metadata = ?');
            values.push(JSON.stringify(metadata));
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }
        
        values.push(documentId);
        
        await db.query(`
            UPDATE documents 
            SET ${updates.join(', ')}
            WHERE id = ?
        `, values);
        
        res.json({ success: true, message: 'Document updated successfully' });
    } catch (error) {
        console.error('Update document error:', error);
        res.status(500).json({ success: false, message: 'Failed to update document' });
    }
};

// Get document statistics for dashboard
exports.getDocumentStats = async (req, res) => {
    try {
        const [stats] = await db.query(`
            SELECT 
                COUNT(*) as total_documents,
                SUM(CASE WHEN requires_action = 1 AND action_deadline < CURDATE() THEN 1 ELSE 0 END) as overdue_actions,
                SUM(CASE WHEN requires_action = 1 AND action_deadline >= CURDATE() THEN 1 ELSE 0 END) as pending_actions,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_documents,
                SUM(CASE WHEN status = 'sent_to_accounting' THEN 1 ELSE 0 END) as sent_to_accounting
            FROM documents
        `);
        
        res.json({ success: true, stats: stats[0] });
    } catch (error) {
        console.error('Get document stats error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch statistics' });
    }
};

// Generate quote request email template
exports.generateQuoteRequestEmail = async (req, res) => {
    try {
        const { orderIds } = req.body;
        
        if (!orderIds || orderIds.length === 0) {
            return res.status(400).json({ success: false, message: 'No orders selected' });
        }
        
        // Get orders with supplier info
        const [orders] = await db.query(`
            SELECT 
                o.*,
                s.name as supplier_name,
                s.contact_person,
                s.email as supplier_email,
                cc.code as cost_center_code,
                cc.name as cost_center_name
            FROM orders o
            LEFT JOIN suppliers s ON o.supplier_id = s.id
            LEFT JOIN cost_centers cc ON o.cost_center_id = cc.id
            WHERE o.id IN (?)
        `, [orderIds]);
        
        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Orders not found' });
        }
        
        const supplier = orders[0];
        const orderNumbers = orders.map(o => `#${o.id}`).join(', ');
        
        // Build email subject
        const subject = `Quote Request - Order ${orderNumbers}`;
        
        // Build email body
        const body = `Dear ${supplier.contact_person || 'Sir/Madam'},

We would like to request a quote for the following items:

${orders.map((o, idx) => `
${idx + 1}. Order #${o.id}
   Item Description: ${o.item_description}
   Part Number: ${o.part_number || 'N/A'}
   Quantity: ${o.quantity}
   Date Needed: ${formatDate(o.date_needed)}
   Building: ${o.building}
   Cost Center: ${o.cost_center_code || 'N/A'} - ${o.cost_center_name || 'N/A'}
`).join('\n')}

Please provide:
✓ Unit price and total price in EUR
✓ Lead time / availability
✓ Proforma invoice
✓ Any technical documentation if applicable

For your reference:
- Company: ${process.env.COMPANY_NAME || 'PartPulse'}
- Contact: ${req.user.name}
- Email: ${req.user.email}
- Phone: ${process.env.COMPANY_PHONE || 'N/A'}

Thank you for your prompt response.

Best regards,
${req.user.name}
${req.user.email}`;
        
        // Create mailto link for Outlook
        const mailtoLink = `mailto:${supplier.supplier_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        
        res.json({
            success: true,
            emailData: {
                to: supplier.supplier_email,
                subject,
                body,
                mailtoLink,
                supplierName: supplier.supplier_name,
                orderCount: orders.length
            }
        });
    } catch (error) {
        console.error('Generate quote email error:', error);
        res.status(500).json({ success: false, message: 'Failed to generate email' });
    }
};

// Helper function to format dates
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

module.exports = exports;
