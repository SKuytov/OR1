// backend/scripts/check_missing_suppliers.js
// Check which suppliers from Excel are not in database

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
};

async function checkMissingSuppliers(excelFilePath) {
    const connection = await mysql.createConnection(dbConfig);
    
    try {
        console.log('📊 Reading Excel file:', excelFilePath);
        
        const workbook = xlsx.readFile(excelFilePath);
        
        // Filter out utility sheets
        const dataSheets = workbook.SheetNames.filter(name => 
            !name.match(/^(Statistics|Reference|Sheet\d+)$/i)
        );
        
        console.log(`✅ Found ${dataSheets.length} data sheets\n`);
        
        // Get existing suppliers
        const [suppliers] = await connection.execute(
            'SELECT name FROM suppliers ORDER BY name'
        );
        
        const supplierSet = new Set(
            suppliers.map(s => s.name.toLowerCase().trim())
        );
        
        console.log(`📦 Database has ${suppliers.length} suppliers\n`);
        
        // Collect all unique suppliers from Excel
        const excelSuppliers = new Set();
        const suppliersBySheet = {};
        
        for (const sheetName of dataSheets) {
            const sheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(sheet);
            
            suppliersBySheet[sheetName] = new Set();
            
            for (const row of data) {
                const supplierName = 
                    row['Доставчик'] || 
                    row['Supplier'] || 
                    '';
                
                if (supplierName && supplierName.trim()) {
                    const normalized = supplierName.trim();
                    excelSuppliers.add(normalized);
                    suppliersBySheet[sheetName].add(normalized);
                }
            }
        }
        
        console.log(`📎 Found ${excelSuppliers.size} unique suppliers in Excel\n`);
        
        // Find missing suppliers
        const missingSuppliers = [];
        
        for (const supplier of excelSuppliers) {
            if (!supplierSet.has(supplier.toLowerCase())) {
                missingSuppliers.push(supplier);
            }
        }
        
        if (missingSuppliers.length === 0) {
            console.log('✅ All suppliers from Excel are in the database!');
            return;
        }
        
        // Sort and display
        missingSuppliers.sort();
        
        console.log('⚠️  Missing Suppliers (' + missingSuppliers.length + ' total):');
        console.log('='.repeat(60));
        
        missingSuppliers.forEach((name, index) => {
            // Find which sheets use this supplier
            const sheets = [];
            for (const [sheet, suppliers] of Object.entries(suppliersBySheet)) {
                if (suppliers.has(name)) {
                    sheets.push(sheet);
                }
            }
            
            console.log(`${index + 1}. ${name}`);
            console.log(`   Used in: ${sheets.join(', ')}`);
        });
        
        console.log('\n' + '='.repeat(60));
        console.log('💡 To add these suppliers, use the Suppliers page in the UI.');
        console.log('💡 Or add them via SQL:');
        console.log('\nINSERT INTO suppliers (name, active) VALUES');
        
        const sqlValues = missingSuppliers
            .map(name => `  ('${name.replace(/'/g, "\\'")}', 1)`)
            .join(',\n');
        
        console.log(sqlValues + ';');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    } finally {
        await connection.end();
    }
}

// CLI execution
if (require.main === module) {
    const excelFile = process.argv[2];
    
    if (!excelFile) {
        console.error('❌ Usage: node check_missing_suppliers.js <path_to_excel_file>');
        console.error('   Example: node check_missing_suppliers.js ./data/for_Training_Porachki.xlsx');
        process.exit(1);
    }
    
    if (!fs.existsSync(excelFile)) {
        console.error(`❌ File not found: ${excelFile}`);
        process.exit(1);
    }
    
    checkMissingSuppliers(excelFile)
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Failed:', error.message);
            process.exit(1);
        });
}

module.exports = { checkMissingSuppliers };
