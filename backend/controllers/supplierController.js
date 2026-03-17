// backend/controllers/supplierController.js
const db = require('../config/database');
const supplierAI = require('../supplier-ai');
const brandRules = require('../supplier-brand-rules');

exports.getSuppliers = async (req, res) => {
    try {
        const [suppliers] = await db.query(
            'SELECT * FROM suppliers WHERE active = 1 ORDER BY name ASC'
        );
        res.json({ success: true, suppliers });
    } catch (error) {
        console.error('Get suppliers error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve suppliers' });
    }
};

// Get AI-powered supplier suggestions for an order
exports.getSupplierSuggestions = async (req, res) => {
    try {
        const { orderId } = req.params;
        
        if (!orderId || isNaN(orderId)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Valid order ID is required' 
            });
        }
        
        const suggestions = await supplierAI.getSupplierSuggestions(parseInt(orderId));
        
        res.json({
            success: true,
            suggestions,
            count: suggestions.length
        });
    } catch (error) {
        console.error('Get supplier suggestions error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to generate supplier suggestions' 
        });
    }
};

// Get brand rules configuration
exports.getBrandRules = async (req, res) => {
    try {
        const rules = brandRules.getBrandRules();
        res.json({
            success: true,
            rules
        });
    } catch (error) {
        console.error('Get brand rules error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to retrieve brand rules' 
        });
    }
};

// ⭐ NEW: Create or update a brand rule
exports.createOrUpdateBrandRule = async (req, res) => {
    try {
        const { brandName, keywords, suppliers, scoreBonus } = req.body;
        
        if (!brandName || !keywords || !suppliers || !Array.isArray(keywords) || !Array.isArray(suppliers)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Brand name, keywords (array), and suppliers (array) are required' 
            });
        }
        
        if (keywords.length === 0 || suppliers.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'At least one keyword and one supplier are required' 
            });
        }
        
        brandRules.setBrandRule(
            brandName,
            keywords,
            suppliers,
            scoreBonus || 200
        );
        
        res.json({
            success: true,
            message: `Brand rule for "${brandName}" saved successfully`,
            rule: brandRules.getBrandRules()[brandName.toUpperCase()]
        });
    } catch (error) {
        console.error('Create/update brand rule error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to save brand rule' 
        });
    }
};

// ⭐ NEW: Delete a brand rule
exports.deleteBrandRule = async (req, res) => {
    try {
        const { brandName } = req.params;
        const rules = brandRules.getBrandRules();
        const upperBrand = brandName.toUpperCase();
        
        if (!rules[upperBrand]) {
            return res.status(404).json({ 
                success: false, 
                message: `Brand rule "${brandName}" not found` 
            });
        }
        
        delete rules[upperBrand];
        
        res.json({
            success: true,
            message: `Brand rule for "${brandName}" deleted successfully`
        });
    } catch (error) {
        console.error('Delete brand rule error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete brand rule' 
        });
    }
};

// ⭐ NEW: Learn brand patterns from historical data
exports.learnBrandPatterns = async (req, res) => {
    try {
        const patterns = await brandRules.learnBrandPatterns();
        
        res.json({
            success: true,
            message: `Discovered ${patterns.length} brand patterns`,
            patterns
        });
    } catch (error) {
        console.error('Learn brand patterns error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to learn brand patterns' 
        });
    }
};

exports.createSupplier = async (req, res) => {
    try {
        const { name, contact_person, email, phone, address, website, notes } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Supplier name is required' });
        }

        const [result] = await db.query(
            `INSERT INTO suppliers (name, contact_person, email, phone, address, website, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [name, contact_person, email, phone, address, website, notes]
        );

        res.status(201).json({
            success: true,
            message: 'Supplier created successfully',
            supplierId: result.insertId
        });
    } catch (error) {
        console.error('Create supplier error:', error);
        res.status(500).json({ success: false, message: 'Failed to create supplier' });
    }
};

exports.updateSupplier = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, contact_person, email, phone, address, website, notes, active } = req.body;

        const updateFields = [];
        const values = [];

        if (name !== undefined) { updateFields.push('name = ?'); values.push(name); }
        if (contact_person !== undefined) { updateFields.push('contact_person = ?'); values.push(contact_person); }
        if (email !== undefined) { updateFields.push('email = ?'); values.push(email); }
        if (phone !== undefined) { updateFields.push('phone = ?'); values.push(phone); }
        if (address !== undefined) { updateFields.push('address = ?'); values.push(address); }
        if (website !== undefined) { updateFields.push('website = ?'); values.push(website); }
        if (notes !== undefined) { updateFields.push('notes = ?'); values.push(notes); }
        if (active !== undefined) { updateFields.push('active = ?'); values.push(active); }

        if (updateFields.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }

        values.push(id);
        await db.query(
            `UPDATE suppliers SET ${updateFields.join(', ')} WHERE id = ?`,
            values
        );

        res.json({ success: true, message: 'Supplier updated successfully' });
    } catch (error) {
        console.error('Update supplier error:', error);
        res.status(500).json({ success: false, message: 'Failed to update supplier' });
    }
};

exports.deleteSupplier = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('UPDATE suppliers SET active = 0 WHERE id = ?', [id]);
        res.json({ success: true, message: 'Supplier deactivated successfully' });
    } catch (error) {
        console.error('Delete supplier error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete supplier' });
    }
};
