// backend/routes/autocomplete.js
// Intelligent autocomplete for Item Description and Category fields
// Learns from historical orders and provides multilingual suggestions (EN/BG)

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

/**
 * Get item description suggestions based on partial input
 * Searches through historical orders and returns matching descriptions
 * Supports both English and Bulgarian (Cyrillic) text
 * 
 * Query params:
 * - q: search query (partial text)
 * - limit: max results (default 10)
 */
router.get('/item-descriptions', authenticateToken, async (req, res) => {
    try {
        const { q, limit = 10 } = req.query;

        if (!q || q.length < 2) {
            return res.json({ suggestions: [] });
        }

        // Search for matching item descriptions
        const query = `
            SELECT DISTINCT
                item_description,
                COUNT(*) as usage_count
            FROM orders
            WHERE LOWER(item_description) LIKE LOWER(?)
                AND status != 'Cancelled'
            GROUP BY item_description
            ORDER BY usage_count DESC
            LIMIT ?
        `;

        const searchPattern = `%${q}%`;
        const [results] = await db.query(query, [searchPattern, parseInt(limit)]);

        // Format results
        const suggestions = results.map(row => ({
            text: row.item_description,
            usage_count: row.usage_count
        }));

        res.json({ suggestions });

    } catch (error) {
        console.error('Error fetching item description suggestions:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch suggestions',
            error: error.message
        });
    }
});

/**
 * Get category suggestions based on partial input
 * Returns most frequently used categories matching the search
 * Supports both English and Bulgarian text
 * 
 * Query params:
 * - q: search query (partial text)
 * - limit: max results (default 10)
 */
router.get('/categories', authenticateToken, async (req, res) => {
    try {
        const { q, limit = 10 } = req.query;

        if (!q || q.length < 1) {
            // If no query, return top categories
            const query = `
                SELECT DISTINCT
                    category,
                    COUNT(*) as usage_count
                FROM orders
                WHERE category IS NOT NULL 
                    AND category != ''
                    AND status != 'Cancelled'
                GROUP BY category
                ORDER BY usage_count DESC
                LIMIT ?
            `;

            const [results] = await db.query(query, [parseInt(limit)]);
            
            const suggestions = results.map(row => ({
                text: row.category,
                usage_count: row.usage_count
            }));

            return res.json({ suggestions });
        }

        // Search for matching categories
        const query = `
            SELECT DISTINCT
                category,
                COUNT(*) as usage_count
            FROM orders
            WHERE LOWER(category) LIKE LOWER(?)
                AND category IS NOT NULL
                AND category != ''
                AND status != 'Cancelled'
            GROUP BY category
            ORDER BY usage_count DESC
            LIMIT ?
        `;

        const searchPattern = `%${q}%`;
        const [results] = await db.query(query, [searchPattern, parseInt(limit)]);

        // Format results
        const suggestions = results.map(row => ({
            text: row.category,
            usage_count: row.usage_count
        }));

        res.json({ suggestions });

    } catch (error) {
        console.error('Error fetching category suggestions:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch suggestions',
            error: error.message
        });
    }
});

/**
 * Get smart suggestions for item description
 * Analyzes the partial input and provides context-aware suggestions
 * For example:
 * - "Ла" → suggests "Лагер"
 * - "Лагер 6" → suggests "Лагер 6205", "Лагер 6206", etc.
 * 
 * Query params:
 * - q: current input text
 * - limit: max results (default 5)
 */
router.get('/smart-suggestions', authenticateToken, async (req, res) => {
    try {
        const { q, limit = 5 } = req.query;

        if (!q || q.length < 2) {
            return res.json({ suggestions: [] });
        }

        // Search for descriptions containing the input
        const query = `
            SELECT DISTINCT
                item_description,
                COUNT(*) as usage_count
            FROM orders
            WHERE LOWER(item_description) LIKE LOWER(?)
                AND status != 'Cancelled'
            GROUP BY item_description
            ORDER BY 
                CASE 
                    WHEN LOWER(item_description) LIKE LOWER(?) THEN 1
                    ELSE 2
                END,
                usage_count DESC
            LIMIT ?
        `;

        // Search patterns:
        // 1. Starts with the exact input (higher priority)
        // 2. Contains the input anywhere
        const startsWithPattern = `${q}%`;
        const containsPattern = `%${q}%`;

        const [results] = await db.query(
            query, 
            [containsPattern, startsWithPattern, parseInt(limit)]
        );

        // Format results
        const suggestions = results.map(row => ({
            text: row.item_description,
            usage_count: row.usage_count,
            // Provide completion hint (what comes after current input)
            completion: row.item_description.substring(q.length)
        }));

        res.json({ suggestions });

    } catch (error) {
        console.error('Error fetching smart suggestions:', error);
        console.error('SQL error details:', error.sqlMessage || error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch suggestions',
            error: error.message
        });
    }
});

/**
 * Get part number suggestions based on category or description context
 * Helps complete part numbers based on what's being ordered
 * 
 * Query params:
 * - q: partial part number
 * - category: optional category filter
 * - description: optional description filter
 * - limit: max results (default 10)
 */
router.get('/part-numbers', authenticateToken, async (req, res) => {
    try {
        const { q, category, description, limit = 10 } = req.query;

        if (!q || q.length < 1) {
            return res.json({ suggestions: [] });
        }

        let query = `
            SELECT DISTINCT
                part_number,
                item_description,
                category,
                COUNT(*) as usage_count
            FROM orders
            WHERE part_number IS NOT NULL 
                AND part_number != ''
                AND LOWER(part_number) LIKE LOWER(?)
                AND status != 'Cancelled'
        `;

        const params = [`%${q}%`];

        // Add context filters if provided
        if (category) {
            query += ' AND LOWER(category) LIKE LOWER(?)';
            params.push(`%${category}%`);
        }

        if (description) {
            query += ' AND LOWER(item_description) LIKE LOWER(?)';
            params.push(`%${description}%`);
        }

        query += `
            GROUP BY part_number, item_description, category
            ORDER BY usage_count DESC
            LIMIT ?
        `;

        params.push(parseInt(limit));

        const [results] = await db.query(query, params);

        // Format results
        const suggestions = results.map(row => ({
            part_number: row.part_number,
            description: row.item_description,
            category: row.category,
            usage_count: row.usage_count
        }));

        res.json({ suggestions });

    } catch (error) {
        console.error('Error fetching part number suggestions:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch suggestions',
            error: error.message
        });
    }
});

module.exports = router;
