// backend/scripts/train_supplier_ai_v2.js
// Train Supplier Suggestion AI from Historical Excel Data
// V2: Uses dedicated training_orders table (separate from production)

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
    const abbreviations = {
        'Cotton Tape and Sliver': 'CTS',
        'Cotton Buds and Pads': 'CBP',
        'Wet Wipes': 'WW',
        'Paper Sticks, Plastics': 'PSP',
        'Paper Sticks': 'PS',
        'Plastics': 'PL'
    };
    
    return abbreviations[sheetName] || truncateText(sheetName, 15);
}

function detectHeaderRow(sheet) {
    const dataRow1 = xlsx.utils.sheet_to_json(sheet, { range: 0, defval: '' });
    
    if (dataRow1.length > 0) {
        const firstRow = dataRow1[0];
        const columns = Object.keys(firstRow);
        
        const hasProperColumns = columns.some(col => 
            col === 'Описание артикул' || col === 'Доставчик'
        );
        
        if (hasProperColumns) {
            return 0;
        }
    }
    
    return 2;
}

async function trainSupplierAI(excelFilePath) {
    const connection = await mysql.createConnection(dbConfig);
    
    try {
        console.log('📊 Reading Excel file:', excelFilePath);
        
        const workbook = xlsx.readFile(excelFilePath);
        
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
        
        let totalProcessed = 0;
        let totalSkipped = 0;
        let newSuppliersFound = new Set();
        
        const sourceFile = path.basename(excelFilePath);
        
        // Process each sheet
        for (const sheetName of dataSheets) {
            console.log(`\n📄 Processing sheet: ${sheetName}`);
            console.log('='.repeat(60));
            
            const sheet = workbook.Sheets[sheetName];
            
            const headerRowRange = detectHeaderRow(sheet);
            console.log(`   Header row: ${headerRowRange === 0 ? 'Row 1' : 'Row 3'}`);
            
            const data = xlsx.utils.sheet_to_json(sheet, { 
                range: headerRowRange,
                defval: ''
            });
            
            console.log(`   Loaded ${data.length} rows`);
            
            const building = abbreviateBuilding(sheetName);
            console.log(`   Building code: "${building}" (${building.length} chars)`);
            
            let processedCount = 0;
            let skippedCount = 0;
            let skipReasons = { noDesc: 0, noSupplier: 0, notFound: 0 };
            
            // Process each row
            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                
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
                    
                const costCenter = 
                    row['Машина'] || 
                    row['Machine'] ||
                    row['Cost Center'] || 
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
                
                // Find supplier ID
                const supplierKey = supplierName.toLowerCase().trim();
                let supplierId = supplierMap[supplierKey];
                
                if (!supplierId) {
                    newSuppliersFound.add(supplierName.trim());
                    skippedCount++;
                    skipReasons.notFound++;
                    continue;
                }
                
                const costCenterTruncated = truncateText(costCenter, 100);
                
                const fullDescription = costCenterTruncated 
                    ? `${itemDescription.trim()} [${costCenterTruncated}]`
                    : itemDescription.trim();
                
                try {
                    // Insert into training_orders table (NOT production orders)
                    await connection.execute(
                        `INSERT INTO training_orders (
                            item_description, 
                            building, 
                            cost_center,
                            supplier_id,
                            source_file,
                            source_sheet
                        ) VALUES (?, ?, ?, ?, ?, ?)`,
                        [
                            truncateText(fullDescription, 500),
                            building,
                            costCenterTruncated,
                            supplierId,
                            sourceFile,
                            sheetName
                        ]
                    );
                    
                    processedCount++;
                    
                    if (processedCount % 50 === 0) {
                        process.stdout.write(`   ⏳ Processed ${processedCount}...\r`);
                    }
                } catch (err) {
                    console.error(`\n   ❌ Error on row ${i + 3}:`);
                    console.error(`      Item: "${itemDescription.substring(0, 50)}..."`);
                    console.error(`      Supplier: "${supplierName}"`);
                    throw err;
                }
            }
            
            console.log(`   ✅ Processed: ${processedCount} training records`);
            console.log(`   ⏭️  Skipped: ${skippedCount} rows`);
            if (skippedCount > 0) {
                console.log(`      (no desc: ${skipReasons.noDesc}, no supplier: ${skipReasons.noSupplier}, not found: ${skipReasons.notFound})`);
            }
            
            totalProcessed += processedCount;
            totalSkipped += skippedCount;
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Training Complete!');
        console.log('='.repeat(60));
        console.log(`📈 Total Processed: ${totalProcessed} training records`);
        console.log(`⏭️  Total Skipped: ${totalSkipped} rows (missing data)`);
        console.log(`💾 Training data stored in 'training_orders' table`);
        console.log(`💾 Production 'orders' table unchanged`);
        
        if (newSuppliersFound.size > 0) {
            const newSuppliers = Array.from(newSuppliersFound);
            console.log(`\n⚠️  Found ${newSuppliers.length} suppliers not in database:`);
            newSuppliers.slice(0, 15).forEach(name => {
                console.log(`   - ${name}`);
            });
            if (newSuppliers.length > 15) {
                console.log(`   ... and ${newSuppliers.length - 15} more`);
            }
        }
        
    } catch (error) {
        console.error('❌ Training failed:', error);
        throw error;
    } finally {
        await connection.end();
    }
}

if (require.main === module) {
    const excelFile = process.argv[2];
    
    if (!excelFile) {
        console.error('❌ Usage: node train_supplier_ai_v2.js <path_to_excel_file>');
        console.error('   Example: node train_supplier_ai_v2.js ./data/for_Training_Porachki.xlsx');
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
