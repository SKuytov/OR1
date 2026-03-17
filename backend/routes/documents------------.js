// backend/routes/documents.js - Multi-Order Document Management (MySQL)
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Configure multer for document uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/documents');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (err) {
            cb(err);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        cb(null, `${name}-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /pdf|jpg|jpeg|png|doc|docx|xls|xlsx|txt|zip|rar|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Allowed: PDF, images, Office docs, archives'));
        }
    }
});

// ========== GET: Download document file ==========
router.get('/:documentId/download', authenticateToken, async (req, res) => {
    try {
        const { documentId } = req.params;

        // Get document info from database
        const [documents] = await pool.query(
            'SELECT file_path, file_name, mime_type, file_size FROM documents WHERE id = ?',
            [documentId]
        );

        if (documents.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Document not found'
            });
        }

        const document = documents[0];
        const filePath = document.file_path;

        // Check if file exists
        try {
            await fs.access(filePath);
        } catch (err) {
            console.error('File not found on disk:', filePath);
            return res.status(404).json({
                success: false,
                message: 'File not found on server'
            });
        }

        // Set proper headers for download
        res.setHeader('Content-Type', document.mime_type || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.file_name)}"`);
        res.setHeader('Content-Length', document.file_size);

        // Stream the file
        const fileStream = fsSync.createReadStream(filePath);
        fileStream.pipe(res);

        fileStream.on('error', (err) => {
            console.error('Error streaming file:', err);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: 'Error streaming file'
                });
            }
        });
    } catch (error) {
        console.error('Error downloading document:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to download document'
        });
    }
});

// ========== GET: Documents for specific order ==========
router.get('/order/:orderId', authenticateToken, async (req, res) => {
    try {
        const { orderId } = req.params;

        // Get all documents linked to this order with user info
        const [documents] = await pool.query(`
            SELECT 
                d.*,
                odl.linked_at,
                odl.linked_by,
                u_upload.name as uploaded_by_name,
                u_link.name as linked_by_name,
                GROUP_CONCAT(DISTINCT odl2.order_id ORDER BY odl2.order_id) as linked_order_ids
            FROM documents d
            INNER JOIN order_documents_link odl ON d.id = odl.document_id
            LEFT JOIN order_documents_link odl2 ON d.id = odl2.document_id
            LEFT JOIN users u_upload ON d.uploaded_by = u_upload.id
            LEFT JOIN users u_link ON odl.linked_by = u_link.id
            WHERE odl.order_id = ?
            GROUP BY d.id, odl.linked_at, odl.linked_by, u_upload.name, u_link.name
            ORDER BY d.uploaded_at DESC
        `, [orderId]);

        // Parse linked_order_ids from comma-separated string to array
        const documentsWithLinks = documents.map(doc => ({
            ...doc,
            linked_order_ids: doc.linked_order_ids ? doc.linked_order_ids.split(',').map(Number) : []
        }));

        res.json({
            success: true,
            documents: documentsWithLinks
        });
    } catch (error) {
        console.error('Error fetching documents:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch documents'
        });
    }
});

// ========== GET: All documents (for selection dialog) ==========
router.get('/', authenticateToken, async (req, res) => {
    try {
        const [documents] = await pool.query(`
            SELECT 
                d.*,
                u.name as uploaded_by_name,
                GROUP_CONCAT(DISTINCT odl.order_id ORDER BY odl.order_id) as linked_order_ids,
                COUNT(DISTINCT odl.order_id) as order_count
            FROM documents d
            LEFT JOIN order_documents_link odl ON d.id = odl.document_id
            LEFT JOIN users u ON d.uploaded_by = u.id
            GROUP BY d.id, u.name
            ORDER BY d.uploaded_at DESC
        `);

        const documentsWithLinks = documents.map(doc => ({
            ...doc,
            linked_order_ids: doc.linked_order_ids ? doc.linked_order_ids.split(',').map(Number) : [],
            order_count: doc.order_count || 0
        }));

        res.json({
            success: true,
            documents: documentsWithLinks
        });
    } catch (error) {
        console.error('Error fetching all documents:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch documents'
        });
    }
});

// ========== POST: Upload document and link to multiple orders ==========
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        // Parse order IDs (can be array or comma-separated string)
        let orderIds = req.body.orderIds;
        if (typeof orderIds === 'string') {
            orderIds = orderIds.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
        } else if (Array.isArray(orderIds)) {
            orderIds = orderIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
        } else {
            return res.status(400).json({
                success: false,
                message: 'At least one order ID is required'
            });
        }

        if (orderIds.length === 0) {
            // Clean up uploaded file
            await fs.unlink(req.file.path);
            return res.status(400).json({
                success: false,
                message: 'At least one valid order ID is required'
            });
        }

        const description = req.body.description || null;
        const documentType = req.body.documentType || 'other';

        await connection.beginTransaction();

        // Insert document record
        const [result] = await connection.query(`
            INSERT INTO documents 
            (order_id, document_type, file_path, file_name, file_size, mime_type, uploaded_by, description)
            VALUES (NULL, ?, ?, ?, ?, ?, ?, ?)
        `, [
            documentType,
            req.file.path.replace(/\\/g, '/'),
            req.file.originalname,
            req.file.size,
            req.file.mimetype,
            req.user.id,
            description
        ]);

        const documentId = result.insertId;

        // Link document to all specified orders
        const linkValues = orderIds.map(orderId => [orderId, documentId, req.user.id]);
        await connection.query(`
            INSERT INTO order_documents_link (order_id, document_id, linked_by)
            VALUES ?
        `, [linkValues]);

        await connection.commit();

        res.json({
            success: true,
            message: `Document uploaded and linked to ${orderIds.length} order(s)`,
            document: {
                id: documentId,
                file_name: req.file.originalname,
                file_size: req.file.size,
                linked_order_ids: orderIds
            }
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error uploading document:', error);
        
        // Clean up file if database insert fails
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                console.error('Error deleting file:', unlinkError);
            }
        }
        
        res.status(500).json({
            success: false,
            message: 'Failed to upload document'
        });
    } finally {
        connection.release();
    }
});

// ========== POST: Link existing document to additional orders ==========
router.post('/:documentId/link', authenticateToken, async (req, res) => {
    try {
        const { documentId } = req.params;
        let { orderIds } = req.body;

        // Parse order IDs
        if (typeof orderIds === 'string') {
            orderIds = orderIds.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
        } else if (Array.isArray(orderIds)) {
            orderIds = orderIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
        } else {
            return res.status(400).json({
                success: false,
                message: 'Order IDs are required'
            });
        }

        if (orderIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one valid order ID is required'
            });
        }

        // Verify document exists
        const [documents] = await pool.query('SELECT id FROM documents WHERE id = ?', [documentId]);
        if (documents.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Document not found'
            });
        }

        // Link to orders (ignore duplicates)
        const linkValues = orderIds.map(orderId => [orderId, documentId, req.user.id]);
        await pool.query(`
            INSERT IGNORE INTO order_documents_link (order_id, document_id, linked_by)
            VALUES ?
        `, [linkValues]);

        res.json({
            success: true,
            message: `Document linked to ${orderIds.length} order(s)`
        });
    } catch (error) {
        console.error('Error linking document:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to link document'
        });
    }
});

// ========== DELETE: Unlink document from specific order ==========
router.delete('/:documentId/unlink/:orderId', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const { documentId, orderId } = req.params;

        await connection.beginTransaction();

        // Remove link
        await connection.query(
            'DELETE FROM order_documents_link WHERE document_id = ? AND order_id = ?',
            [documentId, orderId]
        );

        // Check if document still has links
        const [linkCount] = await connection.query(
            'SELECT COUNT(*) as count FROM order_documents_link WHERE document_id = ?',
            [documentId]
        );

        // If no more links, delete the document file and record
        if (linkCount[0].count === 0) {
            const [documents] = await connection.query(
                'SELECT file_path FROM documents WHERE id = ?',
                [documentId]
            );
            
            if (documents.length > 0) {
                try {
                    await fs.unlink(documents[0].file_path);
                } catch (err) {
                    console.error('Error deleting file:', err);
                }
                
                await connection.query('DELETE FROM documents WHERE id = ?', [documentId]);
            }
        }

        await connection.commit();

        res.json({
            success: true,
            message: linkCount[0].count === 0 ? 'Document unlinked and deleted' : 'Document unlinked from order'
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error unlinking document:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to unlink document'
        });
    } finally {
        connection.release();
    }
});

// ========== DELETE: Delete document entirely (all links + file) ==========
router.delete('/:documentId', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const { documentId } = req.params;

        await connection.beginTransaction();

        // Get document info
        const [documents] = await connection.query(
            'SELECT file_path FROM documents WHERE id = ?',
            [documentId]
        );
        
        if (documents.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Document not found'
            });
        }

        // Delete all links first
        await connection.query('DELETE FROM order_documents_link WHERE document_id = ?', [documentId]);

        // Delete document record
        await connection.query('DELETE FROM documents WHERE id = ?', [documentId]);

        await connection.commit();

        // Delete physical file
        try {
            await fs.unlink(documents[0].file_path);
        } catch (err) {
            console.error('Error deleting file:', err);
        }

        res.json({
            success: true,
            message: 'Document deleted'
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error deleting document:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete document'
        });
    } finally {
        connection.release();
    }
});

module.exports = router;
