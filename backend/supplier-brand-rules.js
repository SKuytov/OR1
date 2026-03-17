// backend/supplier-brand-rules.js - Brand-Specific Supplier Intelligence

const pool = require('./config/database');

/**
 * Brand-to-Supplier mapping rules
 * These rules give massive score boosts when brand is detected in product description
 * 
 * Structure:
 * {
 *   'BRAND_NAME': {
 *     keywords: ['brand', 'keyword1', 'keyword2'],  // Brand detection keywords
 *     suppliers: ['Supplier Name 1', 'Supplier Name 2'],  // Preferred suppliers
 *     scoreBonus: 200  // Bonus points when matched
 *   }
 * }
 */
const BRAND_RULES = {
    'FESTO': {
        keywords: ['festo'],
        suppliers: ['FESTO', 'Festo'],
        scoreBonus: 200,
        description: 'FESTO pneumatic components'
    },
    'SKF': {
        keywords: ['skf'],
        suppliers: ['SKF', 'PROXTEAM'],  // PROXTEAM also sells SKF bearings
        scoreBonus: 200,
        description: 'SKF bearings'
    },
    'SIEMENS': {
        keywords: ['siemens'],
        suppliers: ['Siemens', 'EMEC Srl'],
        scoreBonus: 200,
        description: 'Siemens automation'
    },
    'PARKER': {
        keywords: ['parker'],
        suppliers: ['Parker', 'FESTO'],
        scoreBonus: 200,
        description: 'Parker hydraulics'
    },
    'NORD': {
        keywords: ['nord'],
        suppliers: ['NORD'],
        scoreBonus: 200,
        description: 'NORD gearboxes'
    },
    'SEW': {
        keywords: ['sew', 'sew-eurodrive'],
        suppliers: ['SEW Eurodrive'],
        scoreBonus: 200,
        description: 'SEW drive systems'
    }
};

/**
 * Detect brands in product description and apply supplier scoring rules
 * @param {string} description - Product description
 * @param {string} partNumber - Part number
 * @param {Array} suppliers - List of all suppliers {id, name}
 * @returns {Object} Brand detection results with supplier score bonuses
 */
async function applyBrandRules(description, partNumber, suppliers) {
    const text = (description + ' ' + partNumber).toLowerCase();
    const results = {
        detectedBrands: [],
        supplierBonuses: {}  // { supplier_id: bonus_score }
    };
    
    // Check each brand rule
    for (const [brandName, rule] of Object.entries(BRAND_RULES)) {
        // Check if any brand keyword is in the text
        const brandDetected = rule.keywords.some(keyword => 
            text.includes(keyword.toLowerCase())
        );
        
        if (brandDetected) {
            console.log(`    🏷️  Brand detected: ${brandName}`);
            results.detectedBrands.push(brandName);
            
            // Find matching suppliers and apply bonus
            for (const supplierName of rule.suppliers) {
                const matchingSupplier = suppliers.find(s => 
                    s.name.toLowerCase().includes(supplierName.toLowerCase()) ||
                    supplierName.toLowerCase().includes(s.name.toLowerCase())
                );
                
                if (matchingSupplier) {
                    if (!results.supplierBonuses[matchingSupplier.id]) {
                        results.supplierBonuses[matchingSupplier.id] = 0;
                    }
                    results.supplierBonuses[matchingSupplier.id] += rule.scoreBonus;
                    console.log(`      ✅ Bonus +${rule.scoreBonus} for ${matchingSupplier.name}`);
                }
            }
        }
    }
    
    return results;
}

/**
 * Get all configured brand rules (for admin UI)
 * @returns {Object} Brand rules configuration
 */
function getBrandRules() {
    return BRAND_RULES;
}

/**
 * Add or update a brand rule (for future admin interface)
 * @param {string} brandName - Brand name
 * @param {Array} keywords - Detection keywords
 * @param {Array} suppliers - Preferred supplier names
 * @param {number} scoreBonus - Bonus points
 */
function setBrandRule(brandName, keywords, suppliers, scoreBonus = 200) {
    BRAND_RULES[brandName.toUpperCase()] = {
        keywords: keywords.map(k => k.toLowerCase()),
        suppliers,
        scoreBonus,
        description: `${brandName} products`
    };
    console.log(`✅ Brand rule updated: ${brandName}`);
}

/**
 * Learn from historical data - auto-detect brand patterns
 * Analyzes orders to find brand→supplier correlations
 * @returns {Promise<Array>} Discovered patterns
 */
async function learnBrandPatterns() {
    try {
        console.log('\n🧠 Learning brand patterns from historical data...');
        
        // Find common brand keywords in item descriptions from actual orders
        // Use the orders table with item_description column
        const [rows] = await pool.promise().query(`
            SELECT 
                s.name as supplier_name,
                o.item_description,
                COUNT(*) as order_count
            FROM orders o
            JOIN suppliers s ON o.supplier_id = s.id
            WHERE s.active = 1
                AND o.supplier_id IS NOT NULL
                AND o.item_description IS NOT NULL
                AND o.item_description != ''
                AND o.status != 'Cancelled'
            GROUP BY s.name, o.item_description
            HAVING order_count >= 2
            ORDER BY order_count DESC
            LIMIT 100
        `);
        
        const patterns = [];
        const brandMap = new Map();
        
        // Analyze patterns
        for (const row of rows) {
            const desc = (row.item_description || '').toLowerCase();
            const words = desc.split(/\s+/).filter(w => w.length >= 3);
            
            // Check if supplier name appears in description (brand match)
            const supplierWords = row.supplier_name.toLowerCase().split(/\s+/);
            const brandMatch = supplierWords.some(sw => 
                words.some(w => w.includes(sw) || sw.includes(w))
            );
            
            if (brandMatch) {
                const key = row.supplier_name.toUpperCase();
                if (!brandMap.has(key)) {
                    brandMap.set(key, {
                        brand: row.supplier_name,
                        supplier: row.supplier_name,
                        totalOrders: 0,
                        examples: []
                    });
                }
                const entry = brandMap.get(key);
                entry.totalOrders += row.order_count;
                if (entry.examples.length < 3) {
                    entry.examples.push(row.item_description);
                }
            }
        }
        
        // Convert map to array with confidence ratings
        for (const [key, value] of brandMap.entries()) {
            patterns.push({
                brand: value.brand,
                supplier: value.supplier,
                frequency: value.totalOrders,
                confidence: value.totalOrders >= 10 ? 'HIGH' : value.totalOrders >= 5 ? 'MEDIUM' : 'LOW',
                examples: value.examples
            });
        }
        
        // Sort by frequency
        patterns.sort((a, b) => b.frequency - a.frequency);
        
        console.log(`📊 Discovered ${patterns.length} brand patterns`);
        return patterns;
        
    } catch (error) {
        console.error('Error learning brand patterns:', error);
        throw error;
    }
}

module.exports = {
    applyBrandRules,
    getBrandRules,
    setBrandRule,
    learnBrandPatterns,
    BRAND_RULES
};
