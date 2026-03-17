// backend/controllers/analyticsController.js - Analytics & Financial Data
const db = require('../config/database');

// Helper: build date filter clause
function buildDateFilter(months, dateColumn = 'submission_date') {
    if (!months) return { clause: '', params: [] };
    return {
        clause: ` AND ${dateColumn} >= DATE_SUB(NOW(), INTERVAL ? MONTH)`,
        params: [parseInt(months)]
    };
}

// GET /api/analytics/summary
exports.getSummary = async (req, res) => {
    try {
        const { months } = req.query;
        const df = buildDateFilter(months);

        const [[totalRow]] = await db.query(
            `SELECT
                COUNT(*) AS totalOrders,
                COALESCE(SUM(CASE WHEN total_price > 0 THEN total_price ELSE 0 END), 0) AS totalSpend,
                COALESCE(AVG(CASE WHEN total_price > 0 THEN total_price ELSE NULL END), 0) AS avgOrderValue,
                COUNT(CASE WHEN DATE_FORMAT(submission_date, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m') THEN 1 END) AS ordersThisMonth,
                COALESCE(SUM(CASE WHEN DATE_FORMAT(submission_date, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m') AND total_price > 0 THEN total_price ELSE 0 END), 0) AS spendThisMonth,
                COUNT(CASE WHEN status NOT IN ('Delivered','Cancelled') THEN 1 END) AS ordersInProgress
            FROM orders WHERE 1=1${df.clause}`,
            df.params
        );

        const [[deliveryRow]] = await db.query(
            `SELECT
                COALESCE(AVG(CASE WHEN status = 'Delivered' AND delivery_confirmed_at IS NOT NULL
                    THEN DATEDIFF(delivery_confirmed_at, submission_date) END), 0) AS avgLeadTimeDays,
                COALESCE(COUNT(CASE WHEN status = 'Delivered' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 0) AS deliveryRate,
                COALESCE(COUNT(CASE WHEN status = 'Cancelled' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 0) AS cancelledRate
            FROM orders WHERE 1=1${df.clause}`,
            df.params
        );

        const [[pendingRow]] = await db.query(
            `SELECT COUNT(*) AS pendingApprovals FROM approvals WHERE status = 'pending'`
        );

        const [topSupplierRows] = await db.query(
            `SELECT s.name AS topSupplierName, COALESCE(SUM(o.total_price), 0) AS topSupplierSpend
            FROM orders o
            JOIN suppliers s ON o.supplier_id = s.id
            WHERE o.total_price > 0${df.clause.replace(/submission_date/g, 'o.submission_date')}
            GROUP BY o.supplier_id, s.name
            ORDER BY topSupplierSpend DESC
            LIMIT 1`,
            df.params
        );

        res.json({
            totalOrders: totalRow.totalOrders,
            totalSpend: parseFloat(totalRow.totalSpend),
            avgOrderValue: parseFloat(totalRow.avgOrderValue),
            ordersThisMonth: totalRow.ordersThisMonth,
            spendThisMonth: parseFloat(totalRow.spendThisMonth),
            pendingApprovals: pendingRow.pendingApprovals,
            avgLeadTimeDays: parseFloat(deliveryRow.avgLeadTimeDays),
            topSupplierName: topSupplierRows.length > 0 ? topSupplierRows[0].topSupplierName : null,
            topSupplierSpend: topSupplierRows.length > 0 ? parseFloat(topSupplierRows[0].topSupplierSpend) : 0,
            deliveryRate: parseFloat(deliveryRow.deliveryRate),
            cancelledRate: parseFloat(deliveryRow.cancelledRate),
            ordersInProgress: totalRow.ordersInProgress
        });
    } catch (error) {
        console.error('Analytics summary error:', error);
        res.status(500).json({ success: false, message: 'Failed to load analytics summary' });
    }
};

// GET /api/analytics/spend-over-time?months=12
exports.getSpendOverTime = async (req, res) => {
    try {
        const months = parseInt(req.query.months) || 12;
        const [rows] = await db.query(
            `SELECT DATE_FORMAT(submission_date, '%Y-%m') AS period,
                COALESCE(SUM(CASE WHEN total_price > 0 THEN total_price ELSE 0 END), 0) AS total,
                COUNT(*) AS count
            FROM orders
            WHERE submission_date IS NOT NULL
                AND submission_date >= DATE_SUB(NOW(), INTERVAL ? MONTH)
            GROUP BY period
            ORDER BY period`,
            [months]
        );
        res.json(rows.map(r => ({ period: r.period, total: parseFloat(r.total), count: r.count })));
    } catch (error) {
        console.error('Spend over time error:', error);
        res.status(500).json({ success: false, message: 'Failed to load spend over time' });
    }
};

// GET /api/analytics/spend-by-building
exports.getSpendByBuilding = async (req, res) => {
    try {
        const { months } = req.query;
        const df = buildDateFilter(months);
        const [rows] = await db.query(
            `SELECT
                COALESCE(o.building, 'Unknown') AS building,
                COALESCE(b.name, o.building, 'Unknown') AS buildingName,
                COALESCE(SUM(CASE WHEN o.total_price > 0 THEN o.total_price ELSE 0 END), 0) AS total,
                COUNT(*) AS count
            FROM orders o
            LEFT JOIN buildings b ON o.building = b.code
            WHERE 1=1${df.clause.replace(/submission_date/g, 'o.submission_date')}
            GROUP BY o.building, b.name
            ORDER BY total DESC`,
            df.params
        );
        const grandTotal = rows.reduce((sum, r) => sum + parseFloat(r.total), 0);
        res.json(rows.map(r => ({
            building: r.building,
            buildingName: r.buildingName,
            total: parseFloat(r.total),
            count: r.count,
            percent: grandTotal > 0 ? parseFloat(((parseFloat(r.total) / grandTotal) * 100).toFixed(1)) : 0
        })));
    } catch (error) {
        console.error('Spend by building error:', error);
        res.status(500).json({ success: false, message: 'Failed to load spend by building' });
    }
};

// GET /api/analytics/spend-by-supplier?limit=10
exports.getSpendBySupplier = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const { months } = req.query;
        const df = buildDateFilter(months);
        const [rows] = await db.query(
            `SELECT
                o.supplier_id AS supplierId,
                COALESCE(s.name, 'Unassigned') AS supplierName,
                COALESCE(SUM(CASE WHEN o.total_price > 0 THEN o.total_price ELSE 0 END), 0) AS total,
                COUNT(*) AS orderCount,
                COALESCE(AVG(CASE WHEN o.total_price > 0 THEN o.total_price ELSE NULL END), 0) AS avgValue
            FROM orders o
            LEFT JOIN suppliers s ON o.supplier_id = s.id
            WHERE o.supplier_id IS NOT NULL${df.clause.replace(/submission_date/g, 'o.submission_date')}
            GROUP BY o.supplier_id, s.name
            ORDER BY total DESC
            LIMIT ?`,
            [...df.params, limit]
        );
        res.json(rows.map(r => ({
            supplierId: r.supplierId,
            supplierName: r.supplierName,
            total: parseFloat(r.total),
            orderCount: r.orderCount,
            avgValue: parseFloat(r.avgValue)
        })));
    } catch (error) {
        console.error('Spend by supplier error:', error);
        res.status(500).json({ success: false, message: 'Failed to load spend by supplier' });
    }
};

// GET /api/analytics/spend-by-category
exports.getSpendByCategory = async (req, res) => {
    try {
        const { months } = req.query;
        const df = buildDateFilter(months);
        const [rows] = await db.query(
            `SELECT
                COALESCE(NULLIF(TRIM(category), ''), 'Uncategorized') AS category,
                COALESCE(SUM(CASE WHEN total_price > 0 THEN total_price ELSE 0 END), 0) AS total,
                COUNT(*) AS count
            FROM orders
            WHERE 1=1${df.clause}
            GROUP BY category
            ORDER BY total DESC`,
            df.params
        );
        const grandTotal = rows.reduce((sum, r) => sum + parseFloat(r.total), 0);
        res.json(rows.map(r => ({
            category: r.category,
            total: parseFloat(r.total),
            count: r.count,
            percent: grandTotal > 0 ? parseFloat(((parseFloat(r.total) / grandTotal) * 100).toFixed(1)) : 0
        })));
    } catch (error) {
        console.error('Spend by category error:', error);
        res.status(500).json({ success: false, message: 'Failed to load spend by category' });
    }
};

// GET /api/analytics/spend-by-cost-center
exports.getSpendByCostCenter = async (req, res) => {
    try {
        const { months } = req.query;
        const df = buildDateFilter(months);
        const [rows] = await db.query(
            `SELECT
                COALESCE(cc.code, 'Unknown') AS costCenterCode,
                COALESCE(cc.name, 'Unknown') AS costCenterName,
                COALESCE(b.code, o.building, '') AS buildingCode,
                COALESCE(SUM(CASE WHEN o.total_price > 0 THEN o.total_price ELSE 0 END), 0) AS total,
                COUNT(*) AS count
            FROM orders o
            LEFT JOIN cost_centers cc ON o.cost_center_id = cc.id
            LEFT JOIN buildings b ON cc.building_code = b.code
            WHERE 1=1${df.clause.replace(/submission_date/g, 'o.submission_date')}
            GROUP BY cc.code, cc.name, b.code, o.building
            ORDER BY total DESC`,
            df.params
        );
        res.json(rows.map(r => ({
            costCenterCode: r.costCenterCode,
            costCenterName: r.costCenterName,
            buildingCode: r.buildingCode,
            total: parseFloat(r.total),
            count: r.count
        })));
    } catch (error) {
        console.error('Spend by cost center error:', error);
        res.status(500).json({ success: false, message: 'Failed to load spend by cost center' });
    }
};

// GET /api/analytics/order-status-distribution
exports.getOrderStatusDistribution = async (req, res) => {
    try {
        const { months } = req.query;
        const df = buildDateFilter(months);
        const [rows] = await db.query(
            `SELECT
                COALESCE(status, 'Unknown') AS status,
                COUNT(*) AS count
            FROM orders
            WHERE 1=1${df.clause}
            GROUP BY status
            ORDER BY count DESC`,
            df.params
        );
        const total = rows.reduce((sum, r) => sum + r.count, 0);
        res.json(rows.map(r => ({
            status: r.status,
            count: r.count,
            percent: total > 0 ? parseFloat(((r.count / total) * 100).toFixed(1)) : 0
        })));
    } catch (error) {
        console.error('Order status distribution error:', error);
        res.status(500).json({ success: false, message: 'Failed to load order status distribution' });
    }
};

// GET /api/analytics/supplier-performance?limit=10
exports.getSupplierPerformance = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const { months } = req.query;
        const df = buildDateFilter(months);
        const [rows] = await db.query(
            `SELECT
                o.supplier_id AS supplierId,
                s.name AS supplierName,
                COUNT(*) AS totalOrders,
                COUNT(CASE WHEN o.status = 'Delivered' THEN 1 END) AS delivered,
                COUNT(CASE WHEN o.status = 'Delivered' AND o.delivery_confirmed_at IS NOT NULL
                    AND o.delivery_confirmed_at <= COALESCE(o.date_needed, o.delivery_confirmed_at) THEN 1 END) AS deliveredOnTime,
                COALESCE(AVG(CASE WHEN o.status = 'Delivered' AND o.delivery_confirmed_at IS NOT NULL
                    THEN DATEDIFF(o.delivery_confirmed_at, o.submission_date) END), 0) AS avgLeadDays,
                COALESCE(SUM(CASE WHEN o.total_price > 0 THEN o.total_price ELSE 0 END), 0) AS totalSpend
            FROM orders o
            JOIN suppliers s ON o.supplier_id = s.id
            WHERE o.supplier_id IS NOT NULL${df.clause.replace(/submission_date/g, 'o.submission_date')}
            GROUP BY o.supplier_id, s.name
            ORDER BY totalOrders DESC
            LIMIT ?`,
            [...df.params, limit]
        );
        res.json(rows.map(r => ({
            supplierId: r.supplierId,
            supplierName: r.supplierName,
            totalOrders: r.totalOrders,
            delivered: r.delivered,
            deliveredOnTime: r.deliveredOnTime,
            avgLeadDays: parseFloat(r.avgLeadDays),
            totalSpend: parseFloat(r.totalSpend),
            onTimeRate: r.delivered > 0 ? parseFloat(((r.deliveredOnTime / r.delivered) * 100).toFixed(1)) : 0
        })));
    } catch (error) {
        console.error('Supplier performance error:', error);
        res.status(500).json({ success: false, message: 'Failed to load supplier performance' });
    }
};

// GET /api/analytics/monthly-orders-count?months=12
exports.getMonthlyOrdersCount = async (req, res) => {
    try {
        const months = parseInt(req.query.months) || 12;
        const [rows] = await db.query(
            `SELECT
                DATE_FORMAT(submission_date, '%Y-%m') AS period,
                COUNT(*) AS count,
                COUNT(CASE WHEN priority = 'Urgent' THEN 1 END) AS urgent,
                COUNT(CASE WHEN priority = 'High' THEN 1 END) AS high,
                COUNT(CASE WHEN priority = 'Normal' THEN 1 END) AS normal,
                COUNT(CASE WHEN priority = 'Low' THEN 1 END) AS low
            FROM orders
            WHERE submission_date IS NOT NULL
                AND submission_date >= DATE_SUB(NOW(), INTERVAL ? MONTH)
            GROUP BY period
            ORDER BY period`,
            [months]
        );
        res.json(rows.map(r => ({
            period: r.period,
            count: r.count,
            urgent: r.urgent,
            high: r.high,
            normal: r.normal,
            low: r.low
        })));
    } catch (error) {
        console.error('Monthly orders count error:', error);
        res.status(500).json({ success: false, message: 'Failed to load monthly orders count' });
    }
};

// GET /api/analytics/approval-stats
exports.getApprovalStats = async (req, res) => {
    try {
        const { months } = req.query;
        const df = buildDateFilter(months, 'created_at');
        const [[row]] = await db.query(
            `SELECT
                COUNT(*) AS totalApprovals,
                COUNT(CASE WHEN status = 'approved' THEN 1 END) AS approved,
                COUNT(CASE WHEN status = 'rejected' THEN 1 END) AS rejected,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending,
                COALESCE(AVG(CASE WHEN approved_at IS NOT NULL
                    THEN TIMESTAMPDIFF(HOUR, created_at, approved_at) END), 0) AS avgApprovalHours
            FROM approvals
            WHERE 1=1${df.clause}`,
            df.params
        );
        res.json({
            totalApprovals: row.totalApprovals,
            approved: row.approved,
            rejected: row.rejected,
            pending: row.pending,
            avgApprovalHours: parseFloat(row.avgApprovalHours)
        });
    } catch (error) {
        console.error('Approval stats error:', error);
        res.status(500).json({ success: false, message: 'Failed to load approval stats' });
    }
};

// GET /api/analytics/top-parts?limit=20
exports.getTopParts = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const { months } = req.query;
        const df = buildDateFilter(months);
        const [rows] = await db.query(
            `SELECT
                COALESCE(item_description, 'Unknown') AS itemDescription,
                COUNT(*) AS orderCount,
                COALESCE(SUM(quantity), 0) AS totalQty,
                COALESCE(SUM(CASE WHEN total_price > 0 THEN total_price ELSE 0 END), 0) AS totalSpend
            FROM orders
            WHERE 1=1${df.clause}
            GROUP BY item_description
            ORDER BY orderCount DESC
            LIMIT ?`,
            [...df.params, limit]
        );
        res.json(rows.map(r => ({
            itemDescription: r.itemDescription,
            orderCount: r.orderCount,
            totalQty: r.totalQty,
            totalSpend: parseFloat(r.totalSpend)
        })));
    } catch (error) {
        console.error('Top parts error:', error);
        res.status(500).json({ success: false, message: 'Failed to load top parts' });
    }
};
