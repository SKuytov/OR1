# 🤖 AI Supplier Suggestion Training

## Overview
This script imports your historical order data from Excel and trains the AI to suggest suppliers based on past patterns.

## Prerequisites

1. **Install xlsx package** (if not already installed):
```bash
cd /var/www/partpulse-orders/backend
npm install xlsx
```

2. **Upload your Excel file** to the server:
```bash
# Option 1: Upload via SCP/SFTP to /var/www/partpulse-orders/backend/data/
# Option 2: Create the data directory and copy manually
mkdir -p /var/www/partpulse-orders/backend/data
cd /var/www/partpulse-orders/backend/data
# Upload your for_Training_Porachki.xlsx here
```

## Training Steps

### Step 1: Check Your Suppliers Database
Make sure all suppliers from your Excel file exist in the database first:

```bash
mysql -u partpulse_user -p partpulse_orders
```

```sql
SELECT name FROM suppliers ORDER BY name;
```

If suppliers are missing, add them via the UI (Suppliers tab) or SQL.

### Step 2: Run Training Script

```bash
cd /var/www/partpulse-orders/backend
node scripts/train_supplier_ai.js ./data/for_Training_Porachki.xlsx
```

### Step 3: Monitor Output

The script will:
- ✅ Read Excel data
- ✅ Match items with suppliers
- ✅ Create training orders
- ✅ Log supplier selections
- ✅ Update supplier statistics
- ⚠️ Report any missing suppliers

### Step 4: Verify Training

Check if training data was imported:

```sql
SELECT COUNT(*) as training_orders FROM orders WHERE status = 'Delivered';
SELECT COUNT(*) as selections FROM supplier_selection_log;
```

## Expected Excel Format

The script expects these columns (Bulgarian or English):
- **Описание артикул** / **Item Description** - Product description
- **Доставчик** / **Supplier** - Supplier name
- **Машина** / **Building** - Machine/Building name

## What Happens After Training?

The AI will now:

1. **Learn patterns** from historical data:
   - Which suppliers are used for specific items
   - Which suppliers are preferred for certain buildings
   - Item categories that match suppliers

2. **Suggest suppliers** when viewing orders:
   - Top 3 recommendations appear in order details
   - Based on item description similarity
   - Weighted by historical success

3. **Improve over time**:
   - Each new supplier assignment is logged
   - Suggestions get smarter with more data

## Troubleshooting

### Missing Suppliers Error
If you see warnings about missing suppliers:

1. Add them to the database first via UI or SQL:
```sql
INSERT INTO suppliers (name, active) VALUES ('SUPPLIER_NAME', 1);
```

2. Re-run the training script

### Excel Format Issues
- Ensure Excel file is .xlsx format (not .xls)
- Check that column names match expected format
- Verify data is in the first sheet

### Permission Issues
```bash
# Fix file permissions
chmod 644 ./data/for_Training_Porachki.xlsx
```

## Advanced: Re-training

To clear old training data and start fresh:

```sql
-- Clear training data
DELETE FROM orders WHERE status = 'Delivered' AND created_at < '2026-01-01';
DELETE FROM supplier_selection_log WHERE selected_at < '2026-01-01';

-- Reset supplier stats
UPDATE suppliers SET total_orders = 0, last_order_date = NULL;
```

Then re-run the training script.

## Support

Questions? Check the main project README or contact support.
