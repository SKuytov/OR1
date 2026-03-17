// backend/scripts/train_supplier_ai.js
// Train Supplier Suggestion AI from Historical Excel Data

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Database connection
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
};

function truncateText(text, maxLength = 50) {
    if (!text) return '';
    
    const trimmed = text.trim();
    
    if (trimmed.length <= maxLength) {
        return trimmed;
    }
    
    return trimmed.substring(0, maxLength - 3) + '...';
}

function abbreviateBuilding(sheetName) {
    // Abbreviate common long sheet names to fit in building column (max 15 chars to be safe)
    const abbreviations = {
        'Cotton Tape and Sliver': 'CTS',
        'Cotton Buds and Pads': 'CBP',
        'Wet Wipes': 'WW',
        'Paper Sticks, Plastics': 'PSP',
        'Paper Sticks': 'PS',
        'Plastics': 'PL'
    };
    
    // Check for exact match
    if (abbreviations[sheetName]) {
        return abbreviations[sheetName];
    }
    
    // Otherwise truncate to 15 chars
    return truncateText(sheetName, 15);
}

function detectHeaderRow(sheet) {
    // Try reading from row 1 (default)
    const dataRow1 = xlsx.utils.sheet_to_json(sheet, { range: 0, defval: '' });
    
    if (dataRow1.length > 0) {
        const firstRow = dataRow1[0];
        const columns = Object.keys(firstRow);
        
        // Check if row 1 has proper column names
        const hasProperColumns = columns.some(col => 
            col === 'Описание артикул' || col === 'Доставчик'
        );
        
        if (hasProperColumns) {
            return 0; // Headers in row 1
        }
    }
    
    // Otherwise assume headers in row 3
    return 2; // Skip first 2 rows
}

async function trainSupplierAI(excelFilePath) {
    const connection = await mysql.createConnection(dbConfig);
    
    try {
        console.log('📊 Reading Excel file:', excelFilePath);
        
        // Read Excel file
        const workbook = xlsx.readFile(excelFilePath);
        
        // Filter out utility sheets (Statistics, Reference, Sheet1, Sheet2, etc.)
        const dataSheets = workbook.SheetNames.filter(name => 
            !name.match(/^(Statistics|Reference|Sheet\d+)$/i)
        );
        
        console.log(`✅ Found ${dataSheets.length} data sheets: ${dataSheets.join(', ')}\n`);
        
        // Get existing suppliers map
        const [suppliers] = await connection.execute(
            'SELECT id, name FROM suppliers'
        );
        
        const supplierMap = {};
        suppliers.forEach(s => {
            supplierMap[s.name.toLowerCase().trim()] = s.id;
        });
        
        console.log(`📦 Found ${suppliers.length} suppliers in database\n`);
        
        // Get admin user details (for training data attribution)
        const [adminUsers] = await connection.execute(
            "SELECT id, name, email FROM users WHERE role = 'admin' LIMIT 1"
        );
        
        if (adminUsers.length === 0) {
            throw new Error('No admin user found in database');
        }
        
        const adminUserId = adminUsers[0].id;
        const adminUserName = adminUsers[0].name || 'Training Import';
        const adminUserEmail = adminUsers[0].email || 'training@partpulse.local';
        
        let totalProcessed = 0;
        let totalSkipped = 0;
        let newSuppliersFound = new Set();
        
        // Process each sheet
        for (const sheetName of dataSheets) {
            console.log(`\n📄 Processing sheet: ${sheetName}`);
            console.log('='.repeat(60));
            
            const sheet = workbook.Sheets[sheetName];
            
            // Auto-detect header row position
            const headerRowRange = detectHeaderRow(sheet);
            console.log(`   Header row: ${headerRowRange === 0 ? 'Row 1' : 'Row 3'}`);
            
            // Read sheet with detected header row
            const data = xlsx.utils.sheet_to_json(sheet, { 
                range: headerRowRange,
                defval: '' // Default value for empty cells
            });
            
            console.log(`   Loaded ${data.length} rows`);
            
            // Use abbreviated sheet name as building
            const building = abbreviateBuilding(sheetName);
            console.log(`   Building code: "${building}" (${building.length} chars)`);
            
            let processedCount = 0;
            let skippedCount = 0;
            let skipReasons = { noDesc: 0, noSupplier: 0, notFound: 0 };
            
            // Process each row
            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                
                // Extract fields - try multiple column name variations
                const itemDescription = 
                    row['Описание артикул'] || 
                    row['Описание'] ||
                    row['Item Description'] || 
                    row['Description'] ||
                    '';
                    
                const supplierName = 
                    row['Доставчик'] || 
                    row['Supplier'] || 
                    '';
                    
                // Машина = Machine/Cost Center (not building)
                const costCenter = 
                    row['Машина'] || 
                    row['Machine'] ||
                    row['Cost Center'] || 
                    '';
                
                const status = 
                    row['Статус'] ||
                    row['Status'] || 
                    '';
                
                // Skip rows without item description or supplier
                if (!itemDescription || itemDescription.trim().length < 3) {
                    skippedCount++;
                    skipReasons.noDesc++;
                    continue;
                }
                
                if (!supplierName || supplierName.trim() === '') {
                    skippedCount++;
                    skipReasons.noSupplier++;
                    continue;
                }
                
                // Find supplier ID (case-insensitive match)
                const supplierKey = supplierName.toLowerCase().trim();
                let supplierId = supplierMap[supplierKey];
                
                // If supplier not found, track it
                if (!supplierId) {
                    newSuppliersFound.add(supplierName.trim());
                    skippedCount++;
                    skipReasons.notFound++;
                    continue;
                }
                
                // Truncate cost center if needed
                const costCenterTruncated = truncateText(costCenter, 100);
                
                // Create item description with cost center for better matching
                const fullDescription = costCenterTruncated 
                    ? `${itemDescription.trim()} [${costCenterTruncated}]`
                    : itemDescription.trim();
                
                try {
                    // Create a virtual order for training
                    // Insert into orders table
                    const [orderResult] = await connection.execute(
                        `INSERT INTO orders (
                            item_description, 
                            building, 
                            quantity, 
                            date_needed, 
                            status, 
                            requester_id,
                            requester_name,
                            requester_email,
                            supplier_id
                        ) VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?)`,
                        [
                            truncateText(fullDescription, 500), // Truncate full description
                            building,
                            1,
                            'Delivered', // Mark as delivered for training
                            adminUserId,
                            adminUserName,
                            adminUserEmail,
                            supplierId
                        ]
                    );
                    
                    const orderId = orderResult.insertId;
                    
                    // Log supplier selection for training
                    await connection.execute(
                        `INSERT INTO supplier_selection_log (
                            order_id, 
                            supplier_id, 
                            selected_by_user_id, 
                            from_suggestion
                        ) VALUES (?, ?, ?, ?)`,
                        [orderId, supplierId, adminUserId, false]
                    );
                    
                    processedCount++;
                    
                    if (processedCount % 50 === 0) {
                        process.stdout.write(`   ⏳ Processed ${processedCount}...\r`);
                    }
                } catch (err) {
                    console.error(`\n   ❌ Error on row ${i + 3} (Excel row ${i + 4}):`);
                    console.error(`      Building: "${building}" (${building.length} chars)`);
                    console.error(`      Item: "${itemDescription.substring(0, 50)}..."`);
                    console.error(`      Supplier: "${supplierName}"`);
                    throw err;
                }
            }
            
            console.log(`   ✅ Processed: ${processedCount} orders`);
            console.log(`   ⏭️  Skipped: ${skippedCount} rows`);
            if (skippedCount > 0) {
                console.log(`      (no desc: ${skipReasons.noDesc}, no supplier: ${skipReasons.noSupplier}, not found: ${skipReasons.notFound})`);
            }
            
            totalProcessed += processedCount;
            totalSkipped += skippedCount;
        }
        
        // Update supplier statistics
        console.log('\n📊 Updating supplier statistics...');
        
        await connection.execute(`
            UPDATE suppliers s
            SET 
                total_orders = (
                    SELECT COUNT(*) FROM orders o WHERE o.supplier_id = s.id
                ),
                last_order_date = NOW()
        `);
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Training Complete!');
        console.log('='.repeat(60));
        console.log(`📈 Total Processed: ${totalProcessed} orders`);
        console.log(`⏭️  Total Skipped: ${totalSkipped} rows (missing data)`);
        
        if (newSuppliersFound.size > 0) {
            const newSuppliers = Array.from(newSuppliersFound);
            console.log(`\n⚠️  Found ${newSuppliers.length} suppliers not in database:`);
            newSuppliers.slice(0, 15).forEach(name => {
                console.log(`   - ${name}`);
            });
            if (newSuppliers.length > 15) {
                console.log(`   ... and ${newSuppliers.length - 15} more`);
            }
            console.log('\n💡 Add these suppliers to your database first, then re-run training.');
            console.log('   You can add them via the Suppliers page in the UI.');
        }
        
    } catch (error) {
        console.error('❌ Training failed:', error);
        throw error;
    } finally {
        await connection.end();
    }
}

// CLI execution
if (require.main === module) {
    const excelFile = process.argv[2];
    
    if (!excelFile) {
        console.error('❌ Usage: node train_supplier_ai.js <path_to_excel_file>');
        console.error('   Example: node train_supplier_ai.js ./data/for_Training_Porachki.xlsx');
        process.exit(1);
    }
    
    if (!fs.existsSync(excelFile)) {
        console.error(`❌ File not found: ${excelFile}`);
        process.exit(1);
    }
    
    trainSupplierAI(excelFile)
        .then(() => {
            console.log('\n🎉 AI training completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Training failed:', error.message);
            process.exit(1);
        });
}

module.exports = { trainSupplierAI };
