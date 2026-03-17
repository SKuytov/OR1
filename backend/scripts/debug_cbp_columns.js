// backend/scripts/debug_cbp_columns.js
// Debug CBP sheet column structure

const fs = require('fs');
const xlsx = require('xlsx');

function debugCBPSheet(excelFilePath) {
    console.log('📊 Reading Excel file:', excelFilePath);
    
    const workbook = xlsx.readFile(excelFilePath);
    const sheetName = 'Cotton Buds and Pads';
    
    if (!workbook.SheetNames.includes(sheetName)) {
        console.error('❌ Sheet not found:', sheetName);
        return;
    }
    
    const sheet = workbook.Sheets[sheetName];
    
    // Read with different ranges
    console.log('\n📍 Reading from row 1 (default):');
    const dataRow1 = xlsx.utils.sheet_to_json(sheet, { range: 0, defval: '' });
    console.log('  Columns:', Object.keys(dataRow1[0] || {}));
    console.log('  First row:', dataRow1[0]);
    
    console.log('\n📍 Reading from row 3 (skipping first 2):');
    const dataRow3 = xlsx.utils.sheet_to_json(sheet, { range: 2, defval: '' });
    console.log('  Columns:', Object.keys(dataRow3[0] || {}));
    console.log('  First row:', dataRow3[0]);
    
    console.log('\n📍 Sample data from first 5 rows (row 3 start):');
    for (let i = 0; i < Math.min(5, dataRow3.length); i++) {
        const row = dataRow3[i];
        console.log(`\n  Row ${i + 1}:`);
        console.log(`    Описание артикул: "${row['Описание артикул'] || ''}".substring(0, 50)`);
        console.log(`    Доставчик: "${row['Доставчик'] || ''}"`
);
    }
}

if (require.main === module) {
    const excelFile = process.argv[2] || './data/for_Training_Porachki.xlsx';
    
    if (!fs.existsSync(excelFile)) {
        console.error(`❌ File not found: ${excelFile}`);
        process.exit(1);
    }
    
    debugCBPSheet(excelFile);
}

module.exports = { debugCBPSheet };
