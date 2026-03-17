# Intelligent Autocomplete System

## Overview

The Intelligent Autocomplete system enhances the requester experience by providing **predictive text suggestions** for Item Description and Category fields based on historical order data. The system learns from past orders and suggests commonly used descriptions, categories, and part numbers as users type.

## 🎯 Features

### ✅ Multi-language Support
- **English and Bulgarian (Cyrillic)** text fully supported
- Case-insensitive matching for all languages
- UTF-8/Unicode character handling

### 🧠 Smart Suggestions
- **Context-aware**: Suggests based on what you're typing
- **Usage frequency**: Most commonly used terms appear first
- **Recent history**: Recently used terms are prioritized
- **Partial matching**: Finds matches anywhere in the text

### ⚡ Performance
- **Debounced search**: Reduces server load (300ms delay)
- **Minimal characters**: Suggestions start after 2 characters
- **Fast response**: Optimized database queries
- **Lightweight UI**: Smooth animations and transitions

### 🎨 Beautiful UX
- **Keyboard navigation**: Use Arrow keys, Enter, Escape
- **Mouse support**: Click or hover to select
- **Usage badges**: Shows how many times each term was used
- **Auto-focus**: Moves to next field after selection
- **Responsive design**: Works on desktop and mobile

---

## 💻 How to Use

### For Requesters

#### Item Description Field
1. Start typing in the "Item Description" field
2. After 2+ characters, suggestions appear automatically
3. Example workflow:
   - Type: `Ла` → See: `Лагер`, `Лагер 6205`, etc.
   - Type: `Bearing` → See: `Bearing 6205`, `Bearing SKF`, etc.
4. **Select a suggestion**:
   - Click with mouse
   - Press ↓ Arrow Down and Enter
   - Keep typing to refine

#### Category Field
1. Start typing in the "Category" field
2. After 1+ character, see category suggestions
3. Examples:
   - Type: `B` → See: `Bearings`, `Belts`, etc.
   - Type: `М` → See: `Мотори`, `Механични`, etc.

#### Part Number Field
1. Start typing in the "Part Number" field
2. Get **context-aware** suggestions based on:
   - Current item description
   - Selected category
   - Historical data
3. If you select a part number, the system can auto-fill description and category from previous orders

---

## 🛠️ Technical Details

### Backend API Endpoints

#### 1. `/api/autocomplete/item-descriptions`
**Purpose**: Get item description suggestions

**Query Parameters**:
- `q` (string, required): Search query (min 2 chars)
- `limit` (number, optional): Max results (default 10)

**Response**:
```json
{
  "suggestions": [
    {
      "text": "Лагер 6205",
      "usage_count": 15,
      "last_used": "2026-02-20T10:30:00Z"
    }
  ]
}
```

#### 2. `/api/autocomplete/categories`
**Purpose**: Get category suggestions

**Query Parameters**:
- `q` (string, optional): Search query (min 1 char)
- `limit` (number, optional): Max results (default 10)

**Response**: Same as item-descriptions

#### 3. `/api/autocomplete/smart-suggestions`
**Purpose**: Advanced suggestions with context awareness

**Query Parameters**:
- `q` (string, required): Current input text
- `limit` (number, optional): Max results (default 5)

**Response**:
```json
{
  "suggestions": [
    {
      "text": "Лагер 6205 SKF",
      "usage_count": 8,
      "completion": " 6205 SKF"
    }
  ]
}
```

#### 4. `/api/autocomplete/part-numbers`
**Purpose**: Part number suggestions with context

**Query Parameters**:
- `q` (string, required): Partial part number
- `category` (string, optional): Filter by category
- `description` (string, optional): Filter by description
- `limit` (number, optional): Max results (default 10)

**Response**:
```json
{
  "suggestions": [
    {
      "part_number": "6205",
      "description": "Лагер 6205",
      "category": "Bearings",
      "usage_count": 12
    }
  ]
}
```

---

## 📊 Database Queries

### Item Description Query
```sql
SELECT DISTINCT
    item_description,
    COUNT(*) as usage_count,
    MAX(created_at) as last_used
FROM orders
WHERE item_description LIKE '%search%' COLLATE utf8mb4_unicode_ci
    AND status != 'Cancelled'
GROUP BY item_description
ORDER BY usage_count DESC, last_used DESC
LIMIT 10;
```

### Key Features:
- **COLLATE utf8mb4_unicode_ci**: Case-insensitive, multilingual matching
- **Exclude cancelled orders**: Only learn from valid orders
- **Order by usage + recency**: Most relevant suggestions first

---

## 🎨 Frontend Component

### IntelligentAutocomplete Class

**Constructor Options**:
```javascript
new IntelligentAutocomplete(inputElement, {
    endpoint: '/api/autocomplete/item-descriptions',
    minChars: 2,              // Min characters before search
    debounceMs: 300,          // Debounce delay in milliseconds
    maxResults: 10,           // Max suggestions to show
    placeholder: 'Start typing...',
    showUsageCount: true,     // Show usage badges
    onSelect: (suggestion) => { }, // Callback on selection
    customParams: { }         // Additional query params
});
```

### Keyboard Shortcuts
- **↑ Arrow Up**: Move to previous suggestion
- **↓ Arrow Down**: Move to next suggestion
- **Enter**: Select highlighted suggestion
- **Escape**: Close suggestions
- **Tab**: Close and move to next field

---

## 🚀 Installation & Deployment

### Step 1: Pull Latest Code
```bash
cd /var/www/partpulse-orders
git pull origin main
```

### Step 2: Restart Server
```bash
pm2 restart partpulse-orders
```

### Step 3: Verify
1. Login to the application
2. Go to "Create New Order" form
3. Type in "Item Description" field
4. You should see suggestions appear

**No database changes required!** The system uses existing `orders` table data.

---

## 🔧 Configuration

### Adjust Debounce Timing
Edit `frontend/js/intelligent-autocomplete.js`:
```javascript
window.itemDescriptionAutocomplete = new IntelligentAutocomplete(itemDescriptionInput, {
    debounceMs: 500,  // Increase to 500ms for slower typing
    // ...
});
```

### Change Minimum Characters
```javascript
window.categoryAutocomplete = new IntelligentAutocomplete(categoryInput, {
    minChars: 3,  // Require 3 characters before suggestions
    // ...
});
```

### Adjust Max Results
```javascript
window.itemDescriptionAutocomplete = new IntelligentAutocomplete(itemDescriptionInput, {
    maxResults: 15,  // Show up to 15 suggestions
    // ...
});
```

---

## 📝 Example Usage Scenarios

### Scenario 1: Bulgarian Bearing Order
**User types**: `Ла`

**System suggests**:
1. Лагер 6205 (15×)
2. Лагер 6206 (12×)
3. Лагер SKF (8×)

**User continues typing**: `Лагер 6`

**System refines**:
1. Лагер 6205 (15×)
2. Лагер 6206 (12×)
3. Лагер 6305 (5×)

### Scenario 2: Category Selection
**User types**: `Be`

**System suggests**:
1. Bearings (45×)
2. Belts (23×)

**User selects**: Bearings

**Cursor auto-moves to next field**: Part Number

### Scenario 3: Part Number with Context
**Item Description**: "Лагер"
**Category**: "Bearings"
**User types in Part Number**: `6`

**System suggests (filtered by context)**:
1. 6205 - Лагер 6205 - Bearings (15×)
2. 6206 - Лагер 6206 - Bearings (12×)

---

## 🐛 Troubleshooting

### Suggestions Not Appearing

**Check 1**: Verify you're typing enough characters
- Item Description: 2+ characters
- Category: 1+ character
- Part Number: 1+ character

**Check 2**: Check browser console for errors
```bash
# Open browser DevTools (F12)
# Check Console tab for JavaScript errors
```

**Check 3**: Verify API is accessible
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://your-server.com/api/autocomplete/categories?q=Be"
```

**Check 4**: Check server logs
```bash
pm2 logs partpulse-orders --lines 50
```

### Slow Performance

**Solution 1**: Add database index
```sql
-- Add index for faster searches
CREATE INDEX idx_orders_item_description ON orders(item_description(100));
CREATE INDEX idx_orders_category ON orders(category(50));
CREATE INDEX idx_orders_part_number ON orders(part_number(50));
```

**Solution 2**: Increase debounce delay
```javascript
// In intelligent-autocomplete.js
debounceMs: 500  // Wait 500ms instead of 300ms
```

### CSS Styling Issues

**Check**: Ensure CSS file is loaded
```html
<!-- In index.html -->
<link rel="stylesheet" href="css/intelligent-autocomplete.css">
```

**Clear cache**: Force refresh with Ctrl+Shift+R (or Cmd+Shift+R on Mac)

---

## 📊 Performance Metrics

### Expected Performance
- **Search latency**: < 100ms (typical)
- **UI render time**: < 50ms
- **Debounce delay**: 300ms (configurable)
- **Total time to suggestions**: ~400ms after user stops typing

### Database Load
- **Query complexity**: O(log n) with indexes
- **Typical query time**: 10-50ms
- **Max results**: 10 (configurable)

---

## 🔐 Security

### Authentication Required
All autocomplete endpoints require valid JWT token:
```javascript
headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`
}
```

### SQL Injection Protection
- **Parameterized queries**: All user input is sanitized
- **No direct SQL concatenation**: Uses prepared statements

### XSS Protection
- **Text content only**: No HTML rendering in suggestions
- **DOM sanitization**: textContent used instead of innerHTML

---

## ✨ Future Enhancements

### Planned Features
1. **Fuzzy matching**: Tolerate typos and spelling errors
2. **Synonym support**: Link related terms (e.g., "Motor" ↔ "Мотор")
3. **User-specific suggestions**: Learn from individual user's history
4. **Image previews**: Show product images in suggestions
5. **Smart defaults**: Pre-fill based on building/cost center context

### Potential Improvements
- **Elasticsearch integration**: For advanced search capabilities
- **Machine learning**: Predict what user needs before they type
- **Voice input**: Speech-to-text for hands-free data entry

---

## 📞 Support

For issues or questions:
1. Check this documentation
2. Review browser console for errors
3. Check PM2 logs: `pm2 logs partpulse-orders`
4. Contact system administrator

---

**Version**: 2.5.1  
**Last Updated**: February 23, 2026  
**Feature**: Phase 5 - Enhanced Requester Experience
