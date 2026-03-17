const db = require('../config/database');
const bcrypt = require('bcrypt');

// Helper to generate a random strong-ish password
function generatePassword(length = 10) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@#$%^&*';
    let pwd = '';
    for (let i = 0; i < length; i++) {
        pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
}

exports.listUsers = async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, username, name, email, role, building, active, created_at, updated_at FROM users ORDER BY id'
        );
        res.json({ success: true, users: rows });
    } catch (err) {
        console.error('listUsers error:', err);
        res.status(500).json({ success: false, message: 'Failed to load users' });
    }
};

exports.createUser = async (req, res) => {
    try {
        const { username, name, email, role, building, active = 1, password } = req.body;

        if (!username || !name || !email || !role) {
            return res.status(400).json({ success: false, message: 'Username, name, email and role are required' });
        }

        // Use provided password if present, otherwise generate one
        const plainPassword = password && password.trim().length >= 6
            ? password.trim()
            : generatePassword(10);

        const passwordHash = await bcrypt.hash(plainPassword, 10);

        const [result] = await db.query(
            'INSERT INTO users (username, password_hash, name, email, role, building, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [username, passwordHash, name, email, role, building || null, active ? 1 : 0]
        );

        const [rows] = await db.query(
            'SELECT id, username, name, email, role, building, active, created_at, updated_at FROM users WHERE id = ?',
            [result.insertId]
        );

        res.json({
            success: true,
            user: rows[0],
            password: plainPassword // returned so admin can share it with the user
        });
    } catch (err) {
        console.error('createUser error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Username or email already exists' });
        }
        res.status(500).json({ success: false, message: 'Failed to create user' });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const { username, name, email, role, building, active } = req.body;

        const [existingRows] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
        if (existingRows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const user = existingRows[0];

        const newUsername = username || user.username;
        const newName = name || user.name;
        const newEmail = email || user.email;
        const newRole = role || user.role;
        const newBuilding = building !== undefined ? building : user.building;
        const newActive = active !== undefined ? (active ? 1 : 0) : user.active;

        await db.query(
            'UPDATE users SET username = ?, name = ?, email = ?, role = ?, building = ?, active = ? WHERE id = ?',
            [newUsername, newName, newEmail, newRole, newBuilding, newActive, userId]
        );

        const [rows] = await db.query(
            'SELECT id, username, name, email, role, building, active, created_at, updated_at FROM users WHERE id = ?',
            [userId]
        );

        res.json({ success: true, user: rows[0] });
    } catch (err) {
        console.error('updateUser error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Username or email already exists' });
        }
        res.status(500).json({ success: false, message: 'Failed to update user' });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const { password } = req.body || {};

        if (!password || password.trim().length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        const [existingRows] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
        if (existingRows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const plainPassword = password.trim();
        const passwordHash = await bcrypt.hash(plainPassword, 10);

        await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);

        res.json({ success: true });
    } catch (err) {
        console.error('resetPassword error:', err);
        res.status(500).json({ success: false, message: 'Failed to reset password' });
    }
};
