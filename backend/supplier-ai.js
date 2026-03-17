// backend/supplier-ai.js - AI-Powered Supplier Recommendations

const pool = require('./config/database');
const brandRules = require('./supplier-brand-rules'); // ⭐ NEW: Brand intelligence

/**
 * Generate supplier suggestions for an order using AI-like heuristics
 * @param {number} orderId - Order ID
 * @returns {Promise<Array>} Array of suggested suppliers with confidence scores
 */
async function getSupplierSuggestions(orderId) {
    try {
        console.log('\n=== AI SUPPLIER SUGGESTIONS START ===');
        console.log(`📋 Order ID: ${orderId}`);
        
        // 1. Get order details
        const [orderRows] = await pool.query(
            'SELECT id, item_description, part_number, category FROM orders WHERE id = ?',
            [orderId]
        );
        
        if (orderRows.length === 0) {
            console.log('❌ Order not found');
            return [];
        }
        
        const order = orderRows[0];
        console.log('📦 Order data:', {
            description: order.item_description,
            part_number: order.part_number,
            category: order.category
        });
        
        const description = (order.item_description || '').toLowerCase();
        const partNumber = (order.part_number || '').toLowerCase();
        const category = (order.category || '').toLowerCase();
        
        const rawText = description + ' ' + partNumber + ' ' + category;
        console.log('🔤 Raw text for analysis:', rawText);
        
        // 2. Extract keywords from item description (including Cyrillic)
        const keywords = extractKeywords(rawText);
        
        if (keywords.length === 0) {
            console.log('⚠️ No keywords extracted!');
            return [];
        }
        
        console.log('🔑 Extracted keywords:', keywords);
        
        // 3. Get all active suppliers
        const [suppliers] = await pool.query(
            'SELECT id, name, contact_person, email FROM suppliers WHERE active = 1'
        );
        
        console.log(`👥 Found ${suppliers.length} active suppliers`);
        
        if (suppliers.length === 0) {
            return [];
        }
        
        // ⭐ NEW: Apply brand detection rules FIRST
        console.log('\n🏷️  Checking for brand matches...');
        const brandResults = await brandRules.applyBrandRules(
            order.item_description || '',
            order.part_number || '',
            suppliers
        );
        
        if (brandResults.detectedBrands.length > 0) {
            console.log(`  ✅ Detected brands: ${brandResults.detectedBrands.join(', ')}`);
        }
        
        // 4. Score each supplier based on historical data from BOTH tables
        const suggestions = [];
        
        for (const supplier of suppliers) {
            console.log(`\n  🏢 Analyzing supplier: ${supplier.name} (ID: ${supplier.id})`);
            let score = 0;
            let matchReasons = [];
            
            // ⭐ PRIORITY: Brand match bonus (applied FIRST for highest priority)
            if (brandResults.supplierBonuses[supplier.id]) {
                const brandBonus = brandResults.supplierBonuses[supplier.id];
                score += brandBonus;
                matchReasons.push(`🏷️  BRAND MATCH: ${brandResults.detectedBrands.join(', ')}`);
                console.log(`    🏆 BRAND BONUS: +${brandBonus} (${brandResults.detectedBrands.join(', ')})`);
            }
            
            // A. Check TRAINING_ORDERS table (uses different column names!)
            let trainingMatches = 0;
            try {
                for (const keyword of keywords) {
                    const [trainingRows] = await pool.query(`
                        SELECT COUNT(*) as match_count
                        FROM training_orders
                        WHERE supplier_id = ?
                        AND (
                            LOWER(description) LIKE ?
                            OR LOWER(category) LIKE ?
                        )
                    `, [supplier.id, `%${keyword}%`, `%${keyword}%`]);
                    
                    const matches = parseInt(trainingRows[0].match_count) || 0;
                    if (matches > 0) {
                        console.log(`    📚 Training data: keyword '${keyword}' → ${matches} matches`);
                    }
                    trainingMatches += matches;
                }
                
                if (trainingMatches > 0) {
                    const points = trainingMatches * 30;
                    score += points;
                    matchReasons.push(`${trainingMatches} historical match${trainingMatches > 1 ? 'es' : ''}`);
                    console.log(`    ✅ Training score: +${points} (${trainingMatches} matches)`);
                }
            } catch (trainingError) {
                console.log(`    ⚠️ Training table query failed:`, trainingError.message);
            }
            
            // B. Check ORDERS table (current system data)
            let orderMatches = 0;
            for (const keyword of keywords) {
                const [historyRows] = await pool.query(`
                    SELECT COUNT(*) as match_count
                    FROM orders
                    WHERE supplier_id = ?
                    AND (
                        LOWER(item_description) LIKE ?
                        OR LOWER(part_number) LIKE ?
                        OR LOWER(category) LIKE ?
                    )
                `, [supplier.id, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`]);
                
                const matches = parseInt(historyRows[0].match_count) || 0;
                if (matches > 0) {
                    console.log(`    📊 Orders table: keyword '${keyword}' → ${matches} matches`);
                }
                orderMatches += matches;
            }
            
            if (orderMatches > 0) {
                const points = orderMatches * 20;
                score += points;
                matchReasons.push(`${orderMatches} recent order${orderMatches > 1 ? 's' : ''}`);
                console.log(`    ✅ Orders score: +${points} (${orderMatches} matches)`);
            }
            
            // C. Check exact part number matches (orders table only)
            if (partNumber) {
                const [partRows] = await pool.query(
                    'SELECT COUNT(*) as count FROM orders WHERE supplier_id = ? AND LOWER(part_number) = ?',
                    [supplier.id, partNumber]
                );
                const partCount = parseInt(partRows[0].count) || 0;
                
                if (partCount > 0) {
                    score += 60;
                    matchReasons.push(`exact part #${partNumber}`);
                    console.log(`    ✅ Exact part match: +60`);
                }
            }
            
            // D. Check category matches (BOTH tables)
            if (category) {
                let trainingCatCount = 0;
                try {
                    const [trainingCatRows] = await pool.query(
                        'SELECT COUNT(*) as count FROM training_orders WHERE supplier_id = ? AND LOWER(category) = ?',
                        [supplier.id, category]
                    );
                    trainingCatCount = parseInt(trainingCatRows[0].count) || 0;
                } catch (e) {
                    // Column may not exist
                }
                
                const [categoryRows] = await pool.query(
                    'SELECT COUNT(*) as count FROM orders WHERE supplier_id = ? AND LOWER(category) = ?',
                    [supplier.id, category]
                );
                const catCount = parseInt(categoryRows[0].count) || 0;
                
                const totalCatMatches = trainingCatCount + catCount;
                if (totalCatMatches > 0) {
                    const points = totalCatMatches * 15;
                    score += points;
                    matchReasons.push(`${totalCatMatches} ${category} orders`);
                    console.log(`    ✅ Category match: +${points}`);
                }
            }
            
            // E. Bonus for suppliers with more total orders (reliability)
            let trainingTotal = 0;
            try {
                const [totalTrainingRows] = await pool.query(
                    'SELECT COUNT(*) as total FROM training_orders WHERE supplier_id = ?',
                    [supplier.id]
                );
                trainingTotal = parseInt(totalTrainingRows[0].total) || 0;
            } catch (e) {
                // Table may not exist
            }
            
            const [totalOrdersRows] = await pool.query(
                'SELECT COUNT(*) as total FROM orders WHERE supplier_id = ?',
                [supplier.id]
            );
            const ordersTotal = parseInt(totalOrdersRows[0].total) || 0;
            
            const totalOrders = trainingTotal + ordersTotal;
            if (totalOrders > 5) {
                const points = Math.min(totalOrders * 2, 60);
                score += points;
                matchReasons.push(`${totalOrders} total orders`);
                console.log(`    ✅ Reliability bonus: +${points} (${totalOrders} orders)`);
            }
            
            console.log(`    📊 TOTAL SCORE: ${score}`);
            
            // Only include suppliers with meaningful matches
            if (score > 0) {
                suggestions.push({
                    supplier_id: supplier.id,
                    supplier_name: supplier.name,
                    contact_person: supplier.contact_person,
                    email: supplier.email,
                    confidence: calculateConfidence(score),
                    score: score,
                    match_reasons: matchReasons,
                    total_orders: totalOrders
                });
            }
        }
        
        // 5. Sort by score (highest first) and return top 5
        suggestions.sort((a, b) => b.score - a.score);
        
        console.log('\n🏆 FINAL RANKING:');
        suggestions.slice(0, 5).forEach((s, i) => {
            console.log(`  ${i+1}. ${s.supplier_name}: ${s.confidence}% confidence (score: ${s.score})`);
        });
        console.log('=== AI SUPPLIER SUGGESTIONS END ===\n');
        
        return suggestions.slice(0, 5);
        
    } catch (error) {
        console.error('❌ Error generating supplier suggestions:', error);
        return [];
    }
}

/**
 * Extract meaningful keywords from text (supports Cyrillic)
 * @param {string} text - Input text
 * @returns {Array<string>} Array of keywords
 */
function extractKeywords(text) {
    if (!text) return [];
    
    // Remove common stop words (English and Bulgarian)
    const stopWords = new Set([
        // English
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
        'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
        'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this',
        'that', 'these', 'those', 'it', 'its',
        // Bulgarian common words
        'за', 'на', 'в', 'и', 'с', 'от', 'до', 'по', 'при', 'към'
    ]);
    
    // Split and clean (support Cyrillic characters)
    const words = text
        .toLowerCase()
        .replace(/[^a-zа-я0-9\s-]/gi, ' ') // Keep Cyrillic (а-я) and Latin (a-z)
        .split(/\s+/)
        .filter(word => word.length >= 3 && !stopWords.has(word));
    
    // Remove duplicates
    return [...new Set(words)];
}

/**
 * Calculate confidence percentage from raw score
 * @param {number} score - Raw score
 * @returns {number} Confidence percentage (0-100)
 */
function calculateConfidence(score) {
    if (score <= 0) return 0;
    if (score >= 200) return 95;  // ⭐ Adjusted for brand bonus
    
    const confidence = Math.min(95, 25 + (Math.log(score + 1) * 18));
    return Math.round(confidence);
}

module.exports = {
    getSupplierSuggestions
};
