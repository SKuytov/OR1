const db = require('../config/database');

exports.getBuildings = async (req, res) => {
    try {
        const { active } = req.query;
        let sql = 'SELECT id, code, name, description, active, created_at, updated_at FROM buildings';
        const params = [];
        if (active !== undefined) {
            sql += ' WHERE active = ?';
            params.push(active === '1' || active === 'true' ? 1 : 0);
        }
        sql += ' ORDER BY code';

        const [rows] = await db.query(sql, params);
        res.json({ success: true, buildings: rows });
    } catch (err) {
        console.error('getBuildings error:', err);
        res.status(500).json({ success: false, message: 'Failed to load buildings' });
    }
};

exports.createBuilding = async (req, res) => {
    try {
        const { code, name, description, active = 1 } = req.body;
        if (!code || !name) {
            return res.status(400).json({ success: false, message: 'Code and name are required' });
        }

        const [result] = await db.query(
            'INSERT INTO buildings (code, name, description, active) VALUES (?, ?, ?, ?)',
            [code.trim(), name.trim(), description || null, active ? 1 : 0]
        );

        const [rows] = await db.query(
            'SELECT id, code, name, description, active, created_at, updated_at FROM buildings WHERE id = ?',
            [result.insertId]
        );

        res.json({ success: true, building: rows[0] });
    } catch (err) {
        console.error('createBuilding error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Building code already exists' });
        }
        res.status(500).json({ success: false, message: 'Failed to create building' });
    }
};

exports.updateBuilding = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { code, name, description, active } = req.body;

        const [existingRows] = await db.query('SELECT * FROM buildings WHERE id = ?', [id]);
        if (existingRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Building not found' });
        }

        const b = existingRows[0];
        const newCode = code || b.code;
        const newName = name || b.name;
        const newDesc = description !== undefined ? description : b.description;
        const newActive = active !== undefined ? (active ? 1 : 0) : b.active;

        await db.query(
            'UPDATE buildings SET code = ?, name = ?, description = ?, active = ? WHERE id = ?',
            [newCode, newName, newDesc, newActive, id]
        );

        const [rows] = await db.query(
            'SELECT id, code, name, description, active, created_at, updated_at FROM buildings WHERE id = ?',
            [id]
        );

        res.json({ success: true, building: rows[0] });
    } catch (err) {
        console.error('updateBuilding error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Building code already exists' });
        }
        res.status(500).json({ success: false, message: 'Failed to update building' });
    }
};
