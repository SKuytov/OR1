// backend/scripts/diagnose_skipped_rows.js
// Diagnose why rows are being skipped during training

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

function diagnoseSkippedRows(excelFilePath) {
    console.log('🔍 Reading Excel file:', excelFilePath);
    
    const workbook = xlsx.readFile(excelFilePath);
    
    // Filter out utility sheets
    const dataSheets = workbook.SheetNames.filter(name => 
        !name.match(/^(Statistics|Reference|Sheet\d+)$/i)
    );
    
    console.log(`✅ Found ${dataSheets.length} data sheets\n`);
    
    let totalRows = 0;
    let totalProcessable = 0;
    let totalSkipped = 0;
    
    const skipReasons = {
        noDescription: 0,
        noSupplier: 0,
        descriptionTooShort: 0,
        emptySupplier: 0
    };
    
    for (const sheetName of dataSheets) {
        console.log(`\n📄 Sheet: ${sheetName}`);
        console.log('='.repeat(60));
        
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);
        
        let processable = 0;
        let skipped = 0;
        
        const sheetReasons = {
            noDescription: 0,
            noSupplier: 0,
            descriptionTooShort: 0,
            emptySupplier: 0
        };
        
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
            
            // Check skip conditions
            if (!itemDescription) {
                skipped++;
                sheetReasons.noDescription++;
                continue;
            }
            
            if (!supplierName) {
                skipped++;
                sheetReasons.noSupplier++;
                continue;
            }
            
            if (supplierName.trim() === '') {
                skipped++;
                sheetReasons.emptySupplier++;
                continue;
            }
            
            if (itemDescription.trim().length < 3) {
                skipped++;
                sheetReasons.descriptionTooShort++;
                continue;
            }
            
            processable++;
        }
        
        console.log(`   Total rows: ${data.length}`);
        console.log(`   ✅ Processable: ${processable}`);
        console.log(`   ⏭️  Skipped: ${skipped}`);
        
        if (skipped > 0) {
            console.log(`\n   Skip Reasons:`);
            if (sheetReasons.noDescription > 0) {
                console.log(`     - No description: ${sheetReasons.noDescription}`);
            }
            if (sheetReasons.noSupplier > 0) {
                console.log(`     - No supplier field: ${sheetReasons.noSupplier}`);
            }
            if (sheetReasons.emptySupplier > 0) {
                console.log(`     - Empty supplier: ${sheetReasons.emptySupplier}`);
            }
            if (sheetReasons.descriptionTooShort > 0) {
                console.log(`     - Description too short: ${sheetReasons.descriptionTooShort}`);
            }
        }
        
        // Show first few skipped rows as examples
        if (skipped > 0) {
            console.log(`\n   Sample skipped rows:`);
            let samples = 0;
            for (let i = 0; i < data.length && samples < 3; i++) {
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
                
                if (!itemDescription || !supplierName || supplierName.trim() === '' || itemDescription.trim().length < 3) {
                    console.log(`     Row ${i + 3}: Desc="${itemDescription.substring(0, 40)}..." Supplier="${supplierName}"`);
                    samples++;
                }
            }
        }
        
        totalRows += data.length;
        totalProcessable += processable;
        totalSkipped += skipped;
        
        skipReasons.noDescription += sheetReasons.noDescription;
        skipReasons.noSupplier += sheetReasons.noSupplier;
        skipReasons.emptySupplier += sheetReasons.emptySupplier;
        skipReasons.descriptionTooShort += sheetReasons.descriptionTooShort;
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 OVERALL SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total rows: ${totalRows}`);
    console.log(`✅ Processable: ${totalProcessable}`);
    console.log(`⏭️  Skipped: ${totalSkipped}`);
    
    console.log(`\nSkip Reasons Breakdown:`);
    if (skipReasons.noDescription > 0) {
        console.log(`  - No description: ${skipReasons.noDescription}`);
    }
    if (skipReasons.noSupplier > 0) {
        console.log(`  - No supplier field: ${skipReasons.noSupplier}`);
    }
    if (skipReasons.emptySupplier > 0) {
        console.log(`  - Empty supplier: ${skipReasons.emptySupplier}`);
    }
    if (skipReasons.descriptionTooShort > 0) {
        console.log(`  - Description too short: ${skipReasons.descriptionTooShort}`);
    }
    
    console.log('\n💡 Most skipped rows are likely empty/incomplete order entries.');
}

// CLI execution
if (require.main === module) {
    const excelFile = process.argv[2];
    
    if (!excelFile) {
        console.error('❌ Usage: node diagnose_skipped_rows.js <path_to_excel_file>');
        console.error('   Example: node diagnose_skipped_rows.js ./data/for_Training_Porachki.xlsx');
        process.exit(1);
    }
    
    if (!fs.existsSync(excelFile)) {
        console.error(`❌ File not found: ${excelFile}`);
        process.exit(1);
    }
    
    try {
        diagnoseSkippedRows(excelFile);
    } catch (error) {
        console.error('❌ Failed:', error.message);
        process.exit(1);
    }
}

module.exports = { diagnoseSkippedRows };
