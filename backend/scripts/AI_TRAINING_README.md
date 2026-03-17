# 🤖 AI Supplier Suggestion Training System

## Overview

The PartPulse AI learns from historical order data to suggest the best suppliers for new orders. The system now uses a **dedicated training data table** to keep historical data separate from production orders.

## Architecture

### Database Tables

1. **`training_orders`** - Historical training data (separate from production)
   - Contains 1,210+ historical order-supplier pairs
   - Used to train AI suggestions
   - Does NOT pollute production `orders` table

2. **`orders`** - Production orders only
   - Real orders from actual users
   - Clean and separate from training data

3. **`supplier_selection_log`** - Tracks supplier choices
   - Logs when users select suppliers
   - Tracks if selection came from AI suggestion

### AI Algorithm

The AI scores suppliers based on:
1. **Keyword Matching** (15 points per match) - Cyrillic/Bulgarian supported!
2. **Category Matching** (20 points)
3. **Specialization** (25 points)
4. **Recent Usage** (5-10 points)
5. **Performance Score** (up to 10 points)
6. **Experience** (up to 20 points)

---

## 🚀 Setup Instructions

### Step 1: Create Training Table

```bash
cd /var/www/partpulse-orders/backend
mysql -u partpulse_orders_user -p partpulse_orders < migrations/006_create_training_data_table.sql
```

### Step 2: Clean Old Training Data (if exists)

⚠️ **IMPORTANT**: If you already ran the old training script, clean production orders:

```bash
node scripts/clean_training_data.js
```

This removes 1,210 fake "Training Import" orders from production.

### Step 3: Run New Training Script

```bash
node scripts/train_supplier_ai_v2.js ./data/for_Training_Porachki.xlsx
```

This imports historical data into `training_orders` table only.

### Step 4: Deploy Updated AI

```bash
cd /var/www/partpulse-orders
git pull
cd backend
pm install  # if needed
pm restart
```

---

## 🎯 How It Works

### For Users:

1. Create new order with item description (e.g., "лагер 6205")
2. Click "Browse All" in Suggested Suppliers section
3. AI shows top 3 suppliers with:
   - Confidence score
   - Reasons ("Supplied similar items", "Recently used")
   - Supplier details

### For AI:

1. Extract keywords from item description (Cyrillic supported!)
2. Query **BOTH** `training_orders` AND `orders` tables
3. Score each supplier based on algorithm
4. Return top 3 suggestions

---

## 📊 Scripts Reference

### Training Scripts

| Script | Purpose | Output |
|--------|---------|--------|
| `train_supplier_ai.js` | ❌ OLD - Don't use | Pollutes production orders |
| `train_supplier_ai_v2.js` | ✅ NEW - Use this | Clean training_orders table |

### Utility Scripts

| Script | Purpose |
|--------|----------|
| `clean_training_data.js` | Remove fake training orders from production |
| `check_missing_suppliers.js` | Find suppliers in Excel not in database |
| `diagnose_skipped_rows.js` | Debug why Excel rows are skipped |

---

## 🐛 Troubleshooting

### Problem: "No suggestions available yet"

**Causes:**
1. Training data not imported
2. Supplier not in database
3. No keyword matches

**Solutions:**
```bash
# Check training data
mysql -u partpulse_orders_user -p -D partpulse_orders
SELECT COUNT(*) FROM training_orders;
# Should show 1210+

# Check if item has keywords
node -e "console.log('лагер 6205'.match(/[a-zа-я0-9]+/gi))"
# Should show: [ 'лагер', '6205' ]

# Check backend logs
cd /var/www/partpulse-orders/backend
pm2 logs backend
# Look for [AI] debug messages
```

### Problem: Training script skips all rows

**Cause:** Wrong header row detection

**Solution:**
```bash
node scripts/debug_cbp_columns.js ./data/for_Training_Porachki.xlsx
# Check if columns are detected correctly
```

### Problem: Cyrillic text not matching

**Cause:** Old AI code strips Cyrillic

**Solution:**
```bash
git pull  # Get latest AI code
cd backend
pm restart
```

---

## 📈 Performance Metrics

### Training Data Stats

```sql
-- Total training records
SELECT COUNT(*) as total FROM training_orders;

-- Records per supplier
SELECT s.name, COUNT(t.id) as training_count
FROM training_orders t
JOIN suppliers s ON t.supplier_id = s.id
GROUP BY s.id
ORDER BY training_count DESC
LIMIT 10;

-- Records per building
SELECT building, COUNT(*) as count
FROM training_orders
GROUP BY building;
```

### AI Performance

```sql
-- Suggestion acceptance rate
SELECT 
    COUNT(*) as total_selections,
    SUM(from_suggestion) as from_ai,
    ROUND(SUM(from_suggestion) / COUNT(*) * 100, 2) as acceptance_rate
FROM supplier_selection_log;

-- Top performing suppliers (AI suggestions)
SELECT s.name, COUNT(*) as suggested_and_selected
FROM supplier_selection_log ssl
JOIN suppliers s ON ssl.supplier_id = s.id
WHERE ssl.from_suggestion = 1
GROUP BY s.id
ORDER BY suggested_and_selected DESC
LIMIT 5;
```

---

## 🔮 Future Improvements

- [ ] Add more training data (older Excel files)
- [ ] Implement feedback loop (users rate suggestions)
- [ ] Add machine learning model (TensorFlow.js)
- [ ] Support part number matching
- [ ] Add supplier preference by user

---

## 📝 Important Notes

1. **Training data is READ-ONLY** - Never modify `training_orders` from UI
2. **Cyrillic fully supported** - Bulgarian keywords work!
3. **Production data clean** - No fake orders in `orders` table
4. **AI updates instantly** - New production orders improve suggestions
5. **Privacy safe** - Training data has no personal info

---

## 🆘 Support

For issues:
1. Check logs: `pm2 logs backend`
2. Check database: `SELECT * FROM training_orders LIMIT 5;`
3. Run diagnostics: `node scripts/diagnose_skipped_rows.js`

---

**Last Updated:** February 23, 2026
**Version:** 2.0
**Status:** ✅ Production Ready
