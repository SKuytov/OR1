// backend/scripts/clean_training_data.js
// Remove training data from production orders table

const mysql = require('mysql2/promise');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
};

async function cleanTrainingData() {
    const connection = await mysql.createConnection(dbConfig);
    
    try {
        console.log('🧽 Cleaning training data from production orders...');
        
        // Count training orders
        const [countResult] = await connection.execute(`
            SELECT COUNT(*) as count 
            FROM orders 
            WHERE status = 'Delivered' 
            AND requester_name = 'Training Import'
        `);
        
        const trainingOrdersCount = countResult[0].count;
        console.log(`📊 Found ${trainingOrdersCount} training orders`);
        
        if (trainingOrdersCount === 0) {
            console.log('✅ No training data to clean!');
            return;
        }
        
        // Get IDs to delete
        const [trainingOrders] = await connection.execute(`
            SELECT id FROM orders 
            WHERE status = 'Delivered' 
            AND requester_name = 'Training Import'
        `);
        
        const orderIds = trainingOrders.map(o => o.id);
        
        // Delete from supplier_selection_log first (foreign key)
        console.log('🗑️  Deleting from supplier_selection_log...');
        await connection.execute(`
            DELETE FROM supplier_selection_log 
            WHERE order_id IN (${orderIds.join(',')})
        `);
        
        // Delete orders
        console.log('🗑️  Deleting training orders...');
        const [deleteResult] = await connection.execute(`
            DELETE FROM orders 
            WHERE status = 'Delivered' 
            AND requester_name = 'Training Import'
        `);
        
        console.log(`✅ Deleted ${deleteResult.affectedRows} training orders`);
        
        // Update supplier statistics
        console.log('📊 Updating supplier statistics...');
        await connection.execute(`
            UPDATE suppliers s
            SET 
                total_orders = (
                    SELECT COUNT(*) FROM orders o WHERE o.supplier_id = s.id
                ),
                last_order_date = (
                    SELECT MAX(submission_date) FROM orders o WHERE o.supplier_id = s.id
                )
        `);
        
        console.log('✅ Production data cleaned successfully!');
        
    } catch (error) {
        console.error('❌ Failed to clean training data:', error);
        throw error;
    } finally {
        await connection.end();
    }
}

if (require.main === module) {
    cleanTrainingData()
        .then(() => {
            console.log('\n🎉 Cleanup completed!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Cleanup failed:', error.message);
            process.exit(1);
        });
}

module.exports = { cleanTrainingData };
