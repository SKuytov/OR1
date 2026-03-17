// backend/controllers/quoteController.js
const db = require('../config/database');

// Generate unique quote number: QT-YYYY-XXXXX
function generateQuoteNumber() {
    const year = new Date().getFullYear();
    const random = Math.floor(10000 + Math.random() * 90000);
    return `QT-${year}-${random}`;
}

exports.getQuotes = async (req, res) => {
    try {
        const [quotes] = await db.query(`
            SELECT q.*, 
                   s.name as supplier_name,
                   u.name as created_by_name,
                   COUNT(qi.id) as item_count
            FROM quotes q
            LEFT JOIN suppliers s ON q.supplier_id = s.id
            LEFT JOIN users u ON q.created_by = u.id
            LEFT JOIN quote_items qi ON q.id = qi.quote_id
            GROUP BY q.id
            ORDER BY q.created_at DESC
        `);

        res.json({ success: true, quotes });
    } catch (error) {
        console.error('Get quotes error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve quotes' });
    }
};

exports.getQuoteById = async (req, res) => {
    try {
        const { id } = req.params;

        const [quotes] = await db.query(`
            SELECT q.*, s.name as supplier_name, s.email as supplier_email,
                   s.contact_person as supplier_contact, u.name as created_by_name
            FROM quotes q
            LEFT JOIN suppliers s ON q.supplier_id = s.id
            LEFT JOIN users u ON q.created_by = u.id
            WHERE q.id = ?
        `, [id]);

        if (quotes.length === 0) {
            return res.status(404).json({ success: false, message: 'Quote not found' });
        }

        const [items] = await db.query(`
            SELECT qi.*, o.building, o.item_description, o.part_number,
                   o.quantity as order_quantity, o.date_needed,
                   o.requester_name, o.status as order_status
            FROM quote_items qi
            JOIN orders o ON qi.order_id = o.id
            WHERE qi.quote_id = ?
            ORDER BY qi.id ASC
        `, [id]);

        res.json({
            success: true,
            quote: { ...quotes[0], items }
        });
    } catch (error) {
        console.error('Get quote error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve quote' });
    }
};

exports.createQuote = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { supplier_id, order_ids, notes, currency, valid_until } = req.body;

        if (!supplier_id || !order_ids || order_ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Supplier and at least one order are required'
            });
        }

        const quoteNumber = generateQuoteNumber();

        const [result] = await connection.query(
            `INSERT INTO quotes (quote_number, supplier_id, currency, valid_until, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [quoteNumber, supplier_id, currency || 'EUR', valid_until, notes, req.user.id]
        );

        const quoteId = result.insertId;

        // Add order items to quote
        for (const orderId of order_ids) {
            const [orders] = await connection.query(
                'SELECT quantity FROM orders WHERE id = ?', [orderId]
            );

            if (orders.length > 0) {
                await connection.query(
                    `INSERT INTO quote_items (quote_id, order_id, quantity)
                     VALUES (?, ?, ?)`,
                    [quoteId, orderId, orders[0].quantity]
                );

                // Update order status and link to quote
                await connection.query(
                    `UPDATE orders SET status = 'Quote Requested', supplier_id = ?, quote_ref = ?
                     WHERE id = ?`,
                    [supplier_id, quoteId, orderId]
                );

                // Log history
                await connection.query(
                    `INSERT INTO order_history (order_id, changed_by, field_name, old_value, new_value)
                     VALUES (?, ?, 'status', 'New', 'Quote Requested')`,
                    [orderId, req.user.username]
                );
            }
        }

        await connection.commit();

        res.status(201).json({
            success: true,
            message: 'Quote created successfully',
            quoteId,
            quoteNumber
        });
    } catch (error) {
        await connection.rollback();
        console.error('Create quote error:', error);
        res.status(500).json({ success: false, message: 'Failed to create quote' });
    } finally {
        connection.release();
    }
};

exports.updateQuote = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { status, total_amount, valid_until, notes, items } = req.body;

        // Update quote fields
        const updateFields = [];
        const values = [];

        if (status !== undefined) { updateFields.push('status = ?'); values.push(status); }
        if (total_amount !== undefined) { updateFields.push('total_amount = ?'); values.push(total_amount); }
        if (valid_until !== undefined) { updateFields.push('valid_until = ?'); values.push(valid_until); }
        if (notes !== undefined) { updateFields.push('notes = ?'); values.push(notes); }

        if (updateFields.length > 0) {
            values.push(id);
            await connection.query(
                `UPDATE quotes SET ${updateFields.join(', ')} WHERE id = ?`,
                values
            );
        }

        // Update item prices if provided
        if (items && items.length > 0) {
            let totalAmount = 0;

            for (const item of items) {
                const itemTotal = (item.unit_price || 0) * (item.quantity || 1);
                totalAmount += itemTotal;

                await connection.query(
                    `UPDATE quote_items SET unit_price = ?, quantity = ?, total_price = ?, notes = ?
                     WHERE id = ?`,
                    [item.unit_price, item.quantity, itemTotal, item.notes || null, item.id]
                );

                // Update order prices too
                if (item.order_id) {
                    await connection.query(
                        `UPDATE orders SET unit_price = ?, total_price = ? WHERE id = ?`,
                        [item.unit_price, itemTotal, item.order_id]
                    );
                }
            }

            // Update quote total
            await connection.query(
                'UPDATE quotes SET total_amount = ? WHERE id = ?',
                [totalAmount, id]
            );
        }

        // Update linked order statuses based on quote status
        if (status === 'Received') {
            await connection.query(
                `UPDATE orders SET status = 'Quote Received'
                 WHERE quote_ref = ? AND status = 'Quote Requested'`, [id]
            );
        } else if (status === 'Under Approval') {
            await connection.query(
                `UPDATE orders SET status = 'Quote Under Approval'
                 WHERE quote_ref = ? AND status = 'Quote Received'`, [id]
            );
        }

        await connection.commit();
        res.json({ success: true, message: 'Quote updated successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Update quote error:', error);
        res.status(500).json({ success: false, message: 'Failed to update quote' });
    } finally {
        connection.release();
    }
};

exports.addItemsToQuote = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { order_ids } = req.body;

        // Get quote's supplier
        const [quotes] = await connection.query(
            'SELECT supplier_id FROM quotes WHERE id = ?', [id]
        );

        if (quotes.length === 0) {
            return res.status(404).json({ success: false, message: 'Quote not found' });
        }

        for (const orderId of order_ids) {
            const [orders] = await connection.query(
                'SELECT quantity FROM orders WHERE id = ?', [orderId]
            );

            if (orders.length > 0) {
                await connection.query(
                    'INSERT INTO quote_items (quote_id, order_id, quantity) VALUES (?, ?, ?)',
                    [id, orderId, orders[0].quantity]
                );

                await connection.query(
                    `UPDATE orders SET status = 'Quote Requested', supplier_id = ?, quote_ref = ?
                     WHERE id = ?`,
                    [quotes[0].supplier_id, id, orderId]
                );
            }
        }

        await connection.commit();
        res.json({ success: true, message: 'Items added to quote' });
    } catch (error) {
        await connection.rollback();
        console.error('Add items error:', error);
        res.status(500).json({ success: false, message: 'Failed to add items' });
    } finally {
        connection.release();
    }
};

exports.removeItemFromQuote = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { id, itemId } = req.params;

        // Get order_id before deleting
        const [items] = await connection.query(
            'SELECT order_id FROM quote_items WHERE id = ? AND quote_id = ?',
            [itemId, id]
        );

        if (items.length > 0) {
            await connection.query('DELETE FROM quote_items WHERE id = ?', [itemId]);

            // Reset order status
            await connection.query(
                `UPDATE orders SET status = 'New', supplier_id = NULL, quote_ref = NULL
                 WHERE id = ?`, [items[0].order_id]
            );
        }

        // Recalculate total
        await connection.query(
            `UPDATE quotes SET total_amount = (
                SELECT COALESCE(SUM(total_price), 0) FROM quote_items WHERE quote_id = ?
            ) WHERE id = ?`, [id, id]
        );

        await connection.commit();
        res.json({ success: true, message: 'Item removed from quote' });
    } catch (error) {
        await connection.rollback();
        console.error('Remove item error:', error);
        res.status(500).json({ success: false, message: 'Failed to remove item' });
    } finally {
        connection.release();
    }
};

exports.approveQuote = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { id } = req.params;

        await connection.query(
            `UPDATE quotes SET status = 'Approved' WHERE id = ?`, [id]
        );

        // Update all linked orders to Approved
        await connection.query(
            `UPDATE orders SET status = 'Approved' WHERE quote_ref = ?`, [id]
        );

        // Log history for each order
        const [orders] = await connection.query(
            'SELECT id FROM orders WHERE quote_ref = ?', [id]
        );

        for (const order of orders) {
            await connection.query(
                `INSERT INTO order_history (order_id, changed_by, field_name, old_value, new_value)
                 VALUES (?, ?, 'status', 'Quote Under Approval', 'Approved')`,
                [order.id, req.user.username]
            );
        }

        await connection.commit();
        res.json({ success: true, message: 'Quote approved, all linked orders updated' });
    } catch (error) {
        await connection.rollback();
        console.error('Approve quote error:', error);
        res.status(500).json({ success: false, message: 'Failed to approve quote' });
    } finally {
        connection.release();
    }
};

// =====================================================================
// ⭐ SMART QUOTE SEND — New exports for Phase 6
// =====================================================================

// GET /api/quotes/:id/email-data
// Returns all data needed to compose the quote request email
exports.getQuoteEmailData = async (req, res) => {
    try {
        const { id } = req.params;

        // Quote + supplier info
        const [quotes] = await db.query(`
            SELECT q.*,
                   s.name AS supplier_name,
                   s.email AS supplier_email,
                   s.contact_person AS supplier_contact,
                   s.phone AS supplier_phone,
                   u.name AS created_by_name
            FROM quotes q
            LEFT JOIN suppliers s ON q.supplier_id = s.id
            LEFT JOIN users u ON q.created_by = u.id
            WHERE q.id = ?
        `, [id]);

        if (quotes.length === 0) {
            return res.status(404).json({ success: false, message: 'Quote not found' });
        }

        // All items with full order details for email composition
        const [items] = await db.query(`
            SELECT
                qi.id AS quote_item_id,
                qi.quantity,
                o.id AS order_id,
                o.item_description,
                o.part_number,
                o.building,
                o.date_needed,
                o.priority,
                o.notes AS order_notes,
                cc.code AS cost_center_code,
                cc.name AS cost_center_name
            FROM quote_items qi
            JOIN orders o ON qi.order_id = o.id
            LEFT JOIN cost_centers cc ON o.cost_center_id = cc.id
            WHERE qi.quote_id = ?
            ORDER BY qi.id ASC
        `, [id]);

        // Previous send log
        const [sendLog] = await db.query(`
            SELECT qsl.*, u.name AS sent_by_name
            FROM quote_send_log qsl
            LEFT JOIN users u ON qsl.sent_by = u.id
            WHERE qsl.quote_id = ?
            ORDER BY qsl.sent_at DESC
        `, [id]);

        res.json({
            success: true,
            quote: { ...quotes[0], items },
            sendLog
        });
    } catch (error) {
        console.error('Get quote email data error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve quote email data' });
    }
};

// POST /api/quotes/:id/send-log
// Records a send action, updates quote status to "Sent to Supplier",
// updates linked orders to "Quote Requested" if not already there
exports.logQuoteSend = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { method, supplier_email, notes } = req.body;

        if (!method) {
            return res.status(400).json({ success: false, message: 'method is required (outlook|copy|link)' });
        }

        // Verify quote exists
        const [quotes] = await connection.query('SELECT id, status FROM quotes WHERE id = ?', [id]);
        if (quotes.length === 0) {
            return res.status(404).json({ success: false, message: 'Quote not found' });
        }

        // Insert send log
        await connection.query(
            `INSERT INTO quote_send_log (quote_id, sent_by, method, supplier_email, notes)
             VALUES (?, ?, ?, ?, ?)`,
            [id, req.user.id, method, supplier_email || null, notes || null]
        );

        // Update quote status to "Sent to Supplier"
        await connection.query(
            `UPDATE quotes SET status = 'Sent to Supplier' WHERE id = ?`,
            [id]
        );

        // Update linked orders to "Quote Requested" where not already in a more advanced state
        await connection.query(
            `UPDATE orders SET status = 'Quote Requested'
             WHERE quote_ref = ?
               AND status IN ('New', 'Pending')`,
            [id]
        );

        await connection.commit();

        // Return updated quote + new log
        const [updatedQuote] = await connection.query(
            `SELECT q.*, s.name AS supplier_name, s.email AS supplier_email
             FROM quotes q LEFT JOIN suppliers s ON q.supplier_id = s.id
             WHERE q.id = ?`, [id]
        );
        const [sendLog] = await connection.query(
            `SELECT qsl.*, u.name AS sent_by_name
             FROM quote_send_log qsl LEFT JOIN users u ON qsl.sent_by = u.id
             WHERE qsl.quote_id = ? ORDER BY qsl.sent_at DESC`, [id]
        );

        res.json({
            success: true,
            message: 'Quote send logged successfully',
            quote: updatedQuote[0],
            sendLog
        });
    } catch (error) {
        await connection.rollback();
        console.error('Log quote send error:', error);
        res.status(500).json({ success: false, message: 'Failed to log quote send' });
    } finally {
        connection.release();
    }
};

// GET /api/quotes/:id/send-log
// Returns all send log entries for this quote, joined with users
exports.getQuoteSendLog = async (req, res) => {
    try {
        const { id } = req.params;
        const [sendLog] = await db.query(
            `SELECT qsl.*, u.name AS sent_by_name
             FROM quote_send_log qsl
             LEFT JOIN users u ON qsl.sent_by = u.id
             WHERE qsl.quote_id = ?
             ORDER BY qsl.sent_at DESC`,
            [id]
        );
        res.json({ success: true, sendLog });
    } catch (error) {
        console.error('Get send log error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve send log' });
    }
};
