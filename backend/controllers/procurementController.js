// backend/controllers/procurementController.js
// PartPulse Orders v3.0 - Procurement Lifecycle Controller
// Handles: quote responses, purchase orders, invoices, accounting handoff
const db = require('../config/database');

// ===== HELPER =====
function generatePONumber() {
    const year = new Date().getFullYear();
    const random = Math.floor(10000 + Math.random() * 90000);
    return `PO-${year}-${random}`;
}

// ===== QUOTE RESPONSES =====

// POST /api/procurement/quotes/:quoteId/responses
// Record a supplier response (price, delivery, etc.)
exports.recordQuoteResponse = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { quoteId } = req.params;
        const {
            order_id, quote_item_id,
            unit_price, total_price, currency,
            promised_delivery_date, lead_time_days,
            availability, moq,
            has_alternative, alternative_description, alternative_unit_price,
            supplier_notes, internal_notes,
            status, response_document_id
        } = req.body;

        // Verify quote exists
        const [quotes] = await connection.query('SELECT id, supplier_id FROM quotes WHERE id = ?', [quoteId]);
        if (!quotes.length) return res.status(404).json({ success: false, message: 'Quote not found' });

        const [result] = await connection.query(`
            INSERT INTO quote_responses 
            (quote_id, quote_item_id, order_id, recorded_by, unit_price, total_price, currency,
             promised_delivery_date, lead_time_days, availability, moq,
             has_alternative, alternative_description, alternative_unit_price,
             supplier_notes, internal_notes, status, response_document_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [quoteId, quote_item_id || null, order_id || null, req.user.id,
            unit_price || null, total_price || null, currency || 'EUR',
            promised_delivery_date || null, lead_time_days || null,
            availability || 'available', moq || null,
            has_alternative ? 1 : 0, alternative_description || null, alternative_unit_price || null,
            supplier_notes || null, internal_notes || null,
            status || 'pending', response_document_id || null]);

        // If unit_price provided and order_id exists, update the quote_item and order
        if (unit_price && order_id) {
            const calcTotal = total_price || (unit_price * (req.body.quantity || 1));
            await connection.query(
                'UPDATE quote_items SET unit_price = ?, total_price = ? WHERE quote_id = ? AND order_id = ?',
                [unit_price, calcTotal, quoteId, order_id]
            );
            await connection.query(
                'UPDATE orders SET unit_price = ?, total_price = ? WHERE id = ?',
                [unit_price, calcTotal, order_id]
            );
            // Update quote total
            await connection.query(`
                UPDATE quotes SET total_amount = (
                    SELECT COALESCE(SUM(total_price), 0) FROM quote_items WHERE quote_id = ?
                ) WHERE id = ?
            `, [quoteId, quoteId]);
        }

        // Update quote status to Received if not already further along
        await connection.query(`
            UPDATE quotes SET status = 'Received' 
            WHERE id = ? AND status IN ('Draft', 'Sent to Supplier')
        `, [quoteId]);

        // Update linked orders to Quote Received
        await connection.query(`
            UPDATE orders SET status = 'Quote Received'
            WHERE quote_ref = ? AND status = 'Quote Requested'
        `, [quoteId]);

        await connection.commit();
        res.status(201).json({ success: true, message: 'Response recorded', responseId: result.insertId });
    } catch (err) {
        await connection.rollback();
        console.error('recordQuoteResponse error:', err);
        res.status(500).json({ success: false, message: 'Failed to record response' });
    } finally {
        connection.release();
    }
};

// GET /api/procurement/quotes/:quoteId/responses
exports.getQuoteResponses = async (req, res) => {
    try {
        const { quoteId } = req.params;
        const [responses] = await db.query(`
            SELECT qr.*, 
                   u.name as recorded_by_name,
                   o.item_description, o.quantity as order_quantity,
                   qi.quantity as quoted_quantity
            FROM quote_responses qr
            LEFT JOIN users u ON qr.recorded_by = u.id
            LEFT JOIN orders o ON qr.order_id = o.id
            LEFT JOIN quote_items qi ON qr.quote_item_id = qi.id
            WHERE qr.quote_id = ?
            ORDER BY qr.responded_at DESC
        `, [quoteId]);
        res.json({ success: true, responses });
    } catch (err) {
        console.error('getQuoteResponses error:', err);
        res.status(500).json({ success: false, message: 'Failed to get responses' });
    }
};

// PUT /api/procurement/quotes/responses/:responseId
exports.updateQuoteResponse = async (req, res) => {
    try {
        const { responseId } = req.params;
        const fields = ['unit_price','total_price','currency','promised_delivery_date','lead_time_days',
                        'availability','moq','has_alternative','alternative_description','alternative_unit_price',
                        'supplier_notes','internal_notes','status','response_document_id'];
        const updates = [];
        const vals = [];
        for (const f of fields) {
            if (req.body[f] !== undefined) { updates.push(`${f} = ?`); vals.push(req.body[f]); }
        }
        if (!updates.length) return res.status(400).json({ success: false, message: 'Nothing to update' });
        vals.push(responseId);
        await db.query(`UPDATE quote_responses SET ${updates.join(', ')} WHERE id = ?`, vals);
        res.json({ success: true });
    } catch (err) {
        console.error('updateQuoteResponse error:', err);
        res.status(500).json({ success: false, message: 'Failed to update response' });
    }
};

// ===== PURCHASE ORDERS =====

// POST /api/procurement/purchase-orders
exports.createPO = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { quote_id, supplier_id, currency, delivery_address, payment_terms, notes, items, expected_delivery_date } = req.body;
        if (!supplier_id) return res.status(400).json({ success: false, message: 'supplier_id required' });

        const poNumber = generatePONumber();
        let totalAmount = 0;
        if (items) items.forEach(i => { totalAmount += (i.unit_price || 0) * (i.quantity || 0); });

        const [result] = await connection.query(`
            INSERT INTO purchase_orders (po_number, quote_id, supplier_id, created_by, currency, total_amount, 
                delivery_address, payment_terms, notes, expected_delivery_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [poNumber, quote_id || null, supplier_id, req.user.id,
            currency || 'EUR', totalAmount, delivery_address || null,
            payment_terms || null, notes || null, expected_delivery_date || null]);
        
        const poId = result.insertId;

        // Insert PO items
        if (items && items.length > 0) {
            for (const item of items) {
                const itemTotal = (item.unit_price || 0) * (item.quantity || 0);
                await connection.query(`
                    INSERT INTO po_items (po_id, order_id, quote_item_id, item_description, part_number, 
                        quantity, unit_price, total_price, currency)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [poId, item.order_id || null, item.quote_item_id || null,
                    item.item_description, item.part_number || null,
                    item.quantity, item.unit_price || null, itemTotal, currency || 'EUR']);
                
                // Update order: link PO, set status to Ordered
                if (item.order_id) {
                    await connection.query(
                        'UPDATE orders SET po_id = ?, po_number = ?, status = ? WHERE id = ?',
                        [poId, poNumber, 'Ordered', item.order_id]
                    );
                }
            }
        } else if (quote_id) {
            // Auto-create items from quote
            const [quoteItems] = await connection.query(`
                SELECT qi.*, o.item_description, o.part_number, o.building
                FROM quote_items qi
                JOIN orders o ON qi.order_id = o.id
                WHERE qi.quote_id = ?
            `, [quote_id]);
            
            for (const qi of quoteItems) {
                const itemTotal = (qi.unit_price || 0) * (qi.quantity || 0);
                await connection.query(`
                    INSERT INTO po_items (po_id, order_id, quote_item_id, item_description, part_number,
                        quantity, unit_price, total_price, currency)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [poId, qi.order_id, qi.id, qi.item_description, qi.part_number || null,
                    qi.quantity, qi.unit_price || null, itemTotal, currency || 'EUR']);
                
                await connection.query(
                    'UPDATE orders SET po_id = ?, po_number = ?, status = ? WHERE id = ?',
                    [poId, poNumber, 'Ordered', qi.order_id]
                );
            }
        }

        // Update quote to link PO
        if (quote_id) {
            await connection.query('UPDATE quotes SET status = ? WHERE id = ?', ['Approved', quote_id]);
        }

        await connection.commit();
        res.status(201).json({ success: true, poId, poNumber, message: 'Purchase order created' });
    } catch (err) {
        await connection.rollback();
        console.error('createPO error:', err);
        res.status(500).json({ success: false, message: 'Failed to create PO' });
    } finally {
        connection.release();
    }
};

// GET /api/procurement/purchase-orders
exports.getPOs = async (req, res) => {
    try {
        const { quote_id, supplier_id, status } = req.query;
        let query = `
            SELECT po.*, s.name as supplier_name, u.name as created_by_name,
                   q.quote_number, COUNT(pi.id) as item_count
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            LEFT JOIN users u ON po.created_by = u.id
            LEFT JOIN quotes q ON po.quote_id = q.id
            LEFT JOIN po_items pi ON po.id = pi.po_id
            WHERE 1=1
        `;
        const params = [];
        if (quote_id) { query += ' AND po.quote_id = ?'; params.push(quote_id); }
        if (supplier_id) { query += ' AND po.supplier_id = ?'; params.push(supplier_id); }
        if (status) { query += ' AND po.status = ?'; params.push(status); }
        query += ' GROUP BY po.id ORDER BY po.created_at DESC';
        const [pos] = await db.query(query, params);
        res.json({ success: true, purchase_orders: pos });
    } catch (err) {
        console.error('getPOs error:', err);
        res.status(500).json({ success: false, message: 'Failed to get POs' });
    }
};

// GET /api/procurement/purchase-orders/:id
exports.getPOById = async (req, res) => {
    try {
        const [pos] = await db.query(`
            SELECT po.*, s.name as supplier_name, s.email as supplier_email,
                   s.contact_person, u.name as created_by_name, q.quote_number
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            LEFT JOIN users u ON po.created_by = u.id
            LEFT JOIN quotes q ON po.quote_id = q.id
            WHERE po.id = ?
        `, [req.params.id]);
        if (!pos.length) return res.status(404).json({ success: false, message: 'PO not found' });
        
        const [items] = await db.query(`
            SELECT pi.*, o.building, o.requester_name
            FROM po_items pi
            LEFT JOIN orders o ON pi.order_id = o.id
            WHERE pi.po_id = ?
        `, [req.params.id]);
        
        res.json({ success: true, po: { ...pos[0], items } });
    } catch (err) {
        console.error('getPOById error:', err);
        res.status(500).json({ success: false, message: 'Failed to get PO' });
    }
};

// PUT /api/procurement/purchase-orders/:id
exports.updatePO = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        const { status, actual_delivery_date, notes, invoice_received } = req.body;

        const updates = [];
        const vals = [];
        if (status !== undefined) { updates.push('status = ?'); vals.push(status); }
        if (actual_delivery_date !== undefined) { updates.push('actual_delivery_date = ?'); vals.push(actual_delivery_date); }
        if (notes !== undefined) { updates.push('notes = ?'); vals.push(notes); }
        if (invoice_received !== undefined) { updates.push('invoice_received = ?'); vals.push(invoice_received); }
        if (status === 'sent') { updates.push('sent_at = NOW()'); }
        if (status === 'confirmed') { updates.push('confirmed_at = NOW()'); }
        
        if (updates.length) {
            vals.push(id);
            await connection.query(`UPDATE purchase_orders SET ${updates.join(', ')} WHERE id = ?`, vals);
        }

        // If delivered, update linked orders
        if (status === 'delivered' && actual_delivery_date) {
            await connection.query(`
                UPDATE orders SET status = 'Delivered', 
                    delivery_confirmed_at = NOW(), delivery_confirmed_by = ?
                WHERE po_id = ? AND status IN ('Ordered', 'In Transit', 'Partially Delivered')
            `, [req.user.id, id]);
        } else if (status === 'partially_delivered') {
            await connection.query(`
                UPDATE orders SET status = 'Partially Delivered' WHERE po_id = ?
                AND status IN ('Ordered', 'In Transit')
            `, [id]);
        } else if (status === 'sent') {
            await connection.query(`
                UPDATE orders SET status = 'In Transit' WHERE po_id = ? AND status = 'Ordered'
            `, [id]);
        }

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        await connection.rollback();
        console.error('updatePO error:', err);
        res.status(500).json({ success: false, message: 'Failed to update PO' });
    } finally {
        connection.release();
    }
};

// ===== INVOICES =====

// POST /api/procurement/invoices
exports.createInvoice = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { po_id, quote_id, supplier_id, invoice_number, invoice_date, due_date,
                currency, amount, vat_amount, total_amount, notes } = req.body;
        if (!supplier_id) return res.status(400).json({ success: false, message: 'supplier_id required' });

        const [result] = await connection.query(`
            INSERT INTO invoices (po_id, quote_id, supplier_id, received_by, invoice_number,
                invoice_date, due_date, currency, amount, vat_amount, total_amount, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [po_id || null, quote_id || null, supplier_id, req.user.id,
            invoice_number || null, invoice_date || null, due_date || null,
            currency || 'EUR', amount || 0, vat_amount || 0, total_amount || 0, notes || null]);

        // Mark PO as invoice received
        if (po_id) {
            await connection.query('UPDATE purchase_orders SET invoice_received = 1 WHERE id = ?', [po_id]);
        }

        await connection.commit();
        res.status(201).json({ success: true, invoiceId: result.insertId });
    } catch (err) {
        await connection.rollback();
        console.error('createInvoice error:', err);
        res.status(500).json({ success: false, message: 'Failed to create invoice' });
    } finally {
        connection.release();
    }
};

// GET /api/procurement/invoices
exports.getInvoices = async (req, res) => {
    try {
        const { po_id, quote_id, status } = req.query;
        let query = `
            SELECT i.*, s.name as supplier_name, u.name as received_by_name,
                   po.po_number, q.quote_number
            FROM invoices i
            LEFT JOIN suppliers s ON i.supplier_id = s.id
            LEFT JOIN users u ON i.received_by = u.id
            LEFT JOIN purchase_orders po ON i.po_id = po.id
            LEFT JOIN quotes q ON i.quote_id = q.id
            WHERE 1=1
        `;
        const params = [];
        if (po_id) { query += ' AND i.po_id = ?'; params.push(po_id); }
        if (quote_id) { query += ' AND i.quote_id = ?'; params.push(quote_id); }
        if (status) { query += ' AND i.status = ?'; params.push(status); }
        query += ' ORDER BY i.received_at DESC';
        const [invoices] = await db.query(query, params);
        res.json({ success: true, invoices });
    } catch (err) {
        console.error('getInvoices error:', err);
        res.status(500).json({ success: false, message: 'Failed to get invoices' });
    }
};

// PUT /api/procurement/invoices/:id
exports.updateInvoice = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, accounting_notes, booking_reference, paid_at } = req.body;
        const updates = [];
        const vals = [];
        if (status !== undefined) { updates.push('status = ?'); vals.push(status); }
        if (accounting_notes !== undefined) { updates.push('accounting_notes = ?'); vals.push(accounting_notes); }
        if (booking_reference !== undefined) { updates.push('booking_reference = ?'); vals.push(booking_reference); }
        if (paid_at !== undefined) { updates.push('paid_at = ?'); vals.push(paid_at); }
        if (status === 'sent_to_accounting') {
            updates.push('sent_to_accounting_at = NOW()', 'sent_to_accounting_by = ?');
            vals.push(req.user.id);
        }
        if (!updates.length) return res.status(400).json({ success: false, message: 'Nothing to update' });
        vals.push(id);
        await db.query(`UPDATE invoices SET ${updates.join(', ')} WHERE id = ?`, vals);
        res.json({ success: true });
    } catch (err) {
        console.error('updateInvoice error:', err);
        res.status(500).json({ success: false, message: 'Failed to update invoice' });
    }
};

// ===== UNIFIED LIFECYCLE VIEW =====

// GET /api/procurement/lifecycle/:orderId
// Returns complete lifecycle for an order: order -> quote -> response -> PO -> invoice
exports.getOrderLifecycle = async (req, res) => {
    try {
        const { orderId } = req.params;
        
        // Order details
        const [orders] = await db.query(`
            SELECT o.*, s.name as supplier_name, q.quote_number, q.id as quote_id,
                   cc.code as cost_center_code, cc.name as cost_center_name,
                   u_req.name as requester_display_name
            FROM orders o
            LEFT JOIN suppliers s ON o.supplier_id = s.id
            LEFT JOIN quotes q ON o.quote_ref = q.id
            LEFT JOIN cost_centers cc ON o.cost_center_id = cc.id
            LEFT JOIN users u_req ON o.requester_id = u_req.id
            WHERE o.id = ?
        `, [orderId]);
        if (!orders.length) return res.status(404).json({ success: false, message: 'Order not found' });
        const order = orders[0];
        
        // Quote details (if linked)
        let quote = null;
        let quoteResponses = [];
        let quoteItems = [];
        if (order.quote_id) {
            const [quotes] = await db.query(`
                SELECT q.*, s.name as supplier_name, s.email as supplier_email
                FROM quotes q
                LEFT JOIN suppliers s ON q.supplier_id = s.id
                WHERE q.id = ?
            `, [order.quote_id]);
            if (quotes.length) {
                quote = quotes[0];
                const [items] = await db.query(
                    'SELECT * FROM quote_items WHERE quote_id = ? AND order_id = ?',
                    [order.quote_id, orderId]
                );
                quoteItems = items;
                const [responses] = await db.query(`
                    SELECT qr.*, u.name as recorded_by_name
                    FROM quote_responses qr
                    LEFT JOIN users u ON qr.recorded_by = u.id
                    WHERE qr.quote_id = ? AND qr.order_id = ?
                    ORDER BY qr.responded_at DESC
                `, [order.quote_id, orderId]);
                quoteResponses = responses;
            }
        }
        
        // PO details
        let po = null;
        let poItems = [];
        if (order.po_id) {
            const [pos] = await db.query(`
                SELECT po.*, s.name as supplier_name
                FROM purchase_orders po
                LEFT JOIN suppliers s ON po.supplier_id = s.id
                WHERE po.id = ?
            `, [order.po_id]);
            if (pos.length) {
                po = pos[0];
                const [items] = await db.query(
                    'SELECT * FROM po_items WHERE po_id = ? AND order_id = ?',
                    [order.po_id, orderId]
                );
                poItems = items;
            }
        }
        
        // Invoice (via PO or quote)
        let invoices = [];
        if (order.po_id || order.quote_id) {
            const [inv] = await db.query(`
                SELECT i.*, u.name as received_by_name
                FROM invoices i
                LEFT JOIN users u ON i.received_by = u.id
                WHERE i.po_id = ? OR i.quote_id = ?
                ORDER BY i.received_at DESC
            `, [order.po_id || 0, order.quote_id || 0]);
            invoices = inv;
        }
        
        // Order history
        const [history] = await db.query(
            'SELECT * FROM order_history WHERE order_id = ? ORDER BY changed_at ASC',
            [orderId]
        );
        
        res.json({
            success: true,
            lifecycle: { order, quote, quoteItems, quoteResponses, po, poItems, invoices, history }
        });
    } catch (err) {
        console.error('getOrderLifecycle error:', err);
        res.status(500).json({ success: false, message: 'Failed to get lifecycle' });
    }
};

// GET /api/procurement/lifecycle/quote/:quoteId
// Returns full lifecycle for ALL orders in a quote
exports.getQuoteLifecycle = async (req, res) => {
    try {
        const { quoteId } = req.params;
        
        const [quotes] = await db.query(`
            SELECT q.*, s.name as supplier_name, s.email as supplier_email,
                   s.contact_person as supplier_contact, s.phone as supplier_phone,
                   u.name as created_by_name
            FROM quotes q
            LEFT JOIN suppliers s ON q.supplier_id = s.id
            LEFT JOIN users u ON q.created_by = u.id
            WHERE q.id = ?
        `, [quoteId]);
        if (!quotes.length) return res.status(404).json({ success: false, message: 'Quote not found' });
        
        const quote = quotes[0];
        
        // All items
        const [items] = await db.query(`
            SELECT qi.*, o.item_description, o.part_number, o.building, o.quantity as order_qty,
                   o.status as order_status, o.date_needed, o.priority, o.requester_name,
                   o.po_id, o.po_number, cc.code as cost_center_code,
                   GROUP_CONCAT(DISTINCT JSON_OBJECT(
                       'id', f.id, 'name', f.file_name,
                       'path', REPLACE(f.file_path, './', '/'), 'type', f.file_type
                   )) as files
            FROM quote_items qi
            JOIN orders o ON qi.order_id = o.id
            LEFT JOIN cost_centers cc ON o.cost_center_id = cc.id
            LEFT JOIN order_files f ON f.order_id = o.id
            WHERE qi.quote_id = ?
            GROUP BY qi.id
            ORDER BY qi.id ASC
        `, [quoteId]);
        
        // Parse files
        items.forEach(item => {
            if (item.files) {
                try { item.files = JSON.parse(`[${item.files}]`).filter(f => f.id); }
                catch { item.files = []; }
            } else { item.files = []; }
        });
        
        // Responses
        const [responses] = await db.query(`
            SELECT qr.*, u.name as recorded_by_name, o.item_description
            FROM quote_responses qr
            LEFT JOIN users u ON qr.recorded_by = u.id
            LEFT JOIN orders o ON qr.order_id = o.id
            WHERE qr.quote_id = ?
            ORDER BY qr.responded_at DESC
        `, [quoteId]);
        
        // PO
        const [pos] = await db.query(`
            SELECT po.*, s.name as supplier_name, u.name as created_by_name,
                   COUNT(pi.id) as item_count
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            LEFT JOIN users u ON po.created_by = u.id
            LEFT JOIN po_items pi ON po.id = pi.po_id
            WHERE po.quote_id = ?
            GROUP BY po.id
        `, [quoteId]);
        
        // Invoices
        const [invoices] = await db.query(`
            SELECT i.*, u.name as received_by_name
            FROM invoices i
            LEFT JOIN users u ON i.received_by = u.id
            WHERE i.quote_id = ?
            ORDER BY i.received_at DESC
        `, [quoteId]);
        
        // Send log
        const [sendLog] = await db.query(`
            SELECT qsl.*, u.name as sent_by_name
            FROM quote_send_log qsl
            LEFT JOIN users u ON qsl.sent_by = u.id
            WHERE qsl.quote_id = ?
            ORDER BY qsl.sent_at DESC
        `, [quoteId]);
        
        res.json({
            success: true,
            lifecycle: { quote, items, responses, purchase_orders: pos, invoices, sendLog }
        });
    } catch (err) {
        console.error('getQuoteLifecycle error:', err);
        res.status(500).json({ success: false, message: 'Failed to get quote lifecycle' });
    }
};
