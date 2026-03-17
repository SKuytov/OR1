const db = require('../config/database');

exports.getCostCenters = async (req, res) => {
    try {
        const { building_code, active } = req.query;
        let sql = 'SELECT id, building_code, code, name, description, active, created_at, updated_at FROM cost_centers';
        const conditions = [];
        const params = [];

        if (building_code) {
            conditions.push('building_code = ?');
            params.push(building_code);
        }
        if (active !== undefined) {
            conditions.push('active = ?');
            params.push(active === '1' || active === 'true' ? 1 : 0);
        }
        if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
        sql += ' ORDER BY building_code, code';

        const [rows] = await db.query(sql, params);
        res.json({ success: true, costCenters: rows });
    } catch (err) {
        console.error('getCostCenters error:', err);
        res.status(500).json({ success: false, message: 'Failed to load cost centers' });
    }
};

exports.createCostCenter = async (req, res) => {
    try {
        const { building_code, code, name, description, active = true } = req.body;
        if (!building_code || !code || !name) {
            return res.status(400).json({ success: false, message: 'Building code, cost center code, and name are required' });
        }

        const [result] = await db.query(
            'INSERT INTO cost_centers (building_code, code, name, description, active) VALUES (?, ?, ?, ?, ?)',
            [building_code.trim(), code.trim(), name.trim(), description || null, active ? 1 : 0]
        );

        const [rows] = await db.query('SELECT * FROM cost_centers WHERE id = ?', [result.insertId]);
        res.json({ success: true, costCenter: rows[0] });
    } catch (err) {
        console.error('createCostCenter error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Cost center code already exists for this building' });
        }
        res.status(500).json({ success: false, message: 'Failed to create cost center' });
    }
};

exports.updateCostCenter = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { building_code, code, name, description, active } = req.body;

        const [existing] = await db.query('SELECT * FROM cost_centers WHERE id = ?', [id]);
        if (!existing.length) {
            return res.status(404).json({ success: false, message: 'Cost center not found' });
        }

        const cc = existing[0];
        const newBuildingCode = building_code || cc.building_code;
        const newCode = code || cc.code;
        const newName = name || cc.name;
        const newDesc = description !== undefined ? description : cc.description;
        const newActive = active !== undefined ? (active ? 1 : 0) : cc.active;

        await db.query(
            'UPDATE cost_centers SET building_code = ?, code = ?, name = ?, description = ?, active = ? WHERE id = ?',
            [newBuildingCode, newCode, newName, newDesc, newActive, id]
        );

        const [rows] = await db.query('SELECT * FROM cost_centers WHERE id = ?', [id]);
        res.json({ success: true, costCenter: rows[0] });
    } catch (err) {
        console.error('updateCostCenter error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Cost center code already exists for this building' });
        }
        res.status(500).json({ success: false, message: 'Failed to update cost center' });
    }
};

exports.deleteCostCenter = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        const [existing] = await db.query('SELECT * FROM cost_centers WHERE id = ?', [id]);
        if (!existing.length) {
            return res.status(404).json({ success: false, message: 'Cost center not found' });
        }

        // Check if any orders use this cost center
        const [orders] = await db.query('SELECT COUNT(*) as cnt FROM orders WHERE cost_center_id = ?', [id]);
        if (orders[0].cnt > 0) {
            return res.status(400).json({ success: false, message: `Cannot delete: ${orders[0].cnt} order(s) use this cost center. Deactivate it instead.` });
        }

        await db.query('DELETE FROM cost_centers WHERE id = ?', [id]);
        res.json({ success: true, message: 'Cost center deleted' });
    } catch (err) {
        console.error('deleteCostCenter error:', err);
        res.status(500).json({ success: false, message: 'Failed to delete cost center' });
    }
};
