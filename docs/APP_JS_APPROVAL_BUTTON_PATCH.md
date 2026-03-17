# App.js Approval Button Integration Patch

## Instructions

Add the following code to `frontend/app.js` in the `renderQuoteDetail(q)` function.

**Location:** After the items table section and BEFORE the "Update Quote" section (approximately line 1110)

## Code to Add

```javascript
// ⭐ ADD SUBMIT FOR APPROVAL BUTTON (for admin/procurement only)
if ((currentUser.role === 'admin' || currentUser.role === 'procurement') && 
    (q.status === 'Draft' || q.status === 'Received')) {
    html += `
        <hr class="mt-2" style="border-color: rgba(31,41,55,0.9); margin-bottom: 0.6rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
            <div>
                <div class="detail-section-title" style="margin:0;">Approval Workflow</div>
                <div style="font-size:0.75rem;color:#94a3b8;margin-top:0.2rem;">Submit this quote to a manager for approval</div>
            </div>
            <button id="btnSubmitForApproval" class="btn btn-primary btn-sm" style="white-space:nowrap;" data-quote-id="${q.id}">
                📋 Submit for Approval
            </button>
        </div>
    `;
}
```

## Exact Location in renderQuoteDetail Function

The function currently looks like this:

```javascript
function renderQuoteDetail(q) {
    let html = `<div class="detail-grid">...</div>`;
    if (q.notes) html += `...`;
    if (q.items && q.items.length) {
        html += '<div class="detail-section-title mt-2">Items</div>...';
        html += '</tbody></table></div>';
    }
    
    // ⭐⭐⭐ INSERT THE NEW CODE HERE ⭐⭐⭐
    
    html += '<div class="detail-section-title mt-2">Update Quote</div>';
    // ... rest of function
}
```

## Additional Event Handler

At the END of the `renderQuoteDetail` function, AFTER setting `quoteDetailBody.innerHTML = html;` and BEFORE the btnSaveQuote event listener, add:

```javascript
// Attach submit for approval button handler
const btnSubmitApproval = document.getElementById('btnSubmitForApproval');
if (btnSubmitApproval && typeof openSubmitForApprovalDialog === 'function') {
    btnSubmitApproval.addEventListener('click', () => {
        const quoteId = parseInt(btnSubmitApproval.dataset.quoteId, 10);
        openSubmitForApprovalDialog(quoteId);
    });
}
```

## Complete Modified renderQuoteDetail Function

For reference, here's the complete function with both additions:

```javascript
function renderQuoteDetail(q) {
    let html = `<div class="detail-grid"><div><div class="detail-label">Quote #</div><div class="detail-value">${q.quote_number}</div></div><div><div class="detail-label">Status</div><div class="detail-value">${q.status}</div></div><div><div class="detail-label">Supplier</div><div class="detail-value">${q.supplier_name || '-'}</div></div><div><div class="detail-label">Valid Until</div><div class="detail-value">${q.valid_until ? formatDate(q.valid_until) : '-'}</div></div><div><div class="detail-label">Total Amount</div><div class="detail-value">${fmtPrice(q.total_amount)}</div></div><div><div class="detail-label">Currency</div><div class="detail-value">${q.currency}</div></div></div>`;
    if (q.notes) html += `<div class="detail-section-title mt-1">Notes</div><div class="text-muted mt-1">${escapeHtml(q.notes)}</div>`;
    if (q.items && q.items.length) {
        html += '<div class="detail-section-title mt-2">Items</div><div class="table-wrapper"><table><thead><tr><th>Order</th><th>Building</th><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>';
        for (const it of q.items) html += `<tr><td>#${it.order_id}</td><td>${it.building}</td><td>${escapeHtml(it.item_description.substring(0,40))}${it.item_description.length>40?'…':''}</td><td>${it.quantity}</td><td class="text-right">${fmtPrice(it.unit_price)}</td><td class="text-right">${fmtPrice(it.total_price)}</td></tr>`;
        html += '</tbody></table></div>';
    }
    
    // ⭐ ADD SUBMIT FOR APPROVAL BUTTON (for admin/procurement only)
    if ((currentUser.role === 'admin' || currentUser.role === 'procurement') && 
        (q.status === 'Draft' || q.status === 'Received')) {
        html += `
            <hr class="mt-2" style="border-color: rgba(31,41,55,0.9); margin-bottom: 0.6rem;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
                <div>
                    <div class="detail-section-title" style="margin:0;">Approval Workflow</div>
                    <div style="font-size:0.75rem;color:#94a3b8;margin-top:0.2rem;">Submit this quote to a manager for approval</div>
                </div>
                <button id="btnSubmitForApproval" class="btn btn-primary btn-sm" style="white-space:nowrap;" data-quote-id="${q.id}">
                    📋 Submit for Approval
                </button>
            </div>
        `;
    }
    
    html += '<div class="detail-section-title mt-2">Update Quote</div>';
    html += `<div class="form-group mt-1"><label>Status</label><select id="quoteStatus" class="form-control form-control-sm">${['Draft','Sent to Supplier','Received','Under Approval','Approved','Rejected'].map(s => `<option value="${s}" ${s===q.status?'selected':''}>${s}</option>`).join('')}</select></div>`;
    html += `<div class="form-group mt-1"><label>Notes</label><textarea id="quoteNotes" class="form-control form-control-sm" rows="2">${q.notes || ''}</textarea></div>`;
    html += '<div class="form-actions"><button id="btnSaveQuote" class="btn btn-primary btn-sm">Save</button></div>';
    quoteDetailBody.innerHTML = html;
    
    // Attach submit for approval button handler
    const btnSubmitApproval = document.getElementById('btnSubmitForApproval');
    if (btnSubmitApproval && typeof openSubmitForApprovalDialog === 'function') {
        btnSubmitApproval.addEventListener('click', () => {
            const quoteId = parseInt(btnSubmitApproval.dataset.quoteId, 10);
            openSubmitForApprovalDialog(quoteId);
        });
    }
    
    document.getElementById('btnSaveQuote').addEventListener('click', async () => {
        const payload = { status: document.getElementById('quoteStatus').value, notes: document.getElementById('quoteNotes').value };
        const res = await apiPut(`/quotes/${q.id}`, payload);
        if (res.success) { alert('Quote updated'); loadQuotes(); } else { alert('Failed to update quote'); }
    });
}
```

## Verification

After applying this patch:

1. The "Submit for Approval" button will appear in quote detail panels
2. It will only show for admin/procurement users
3. It will only show when quote status is "Draft" or "Received"
4. Clicking it will open the approval submission dialog (from approval-submission.js)
5. After submission, the quote status will automatically change to "Under Approval"

## Testing

1. Login as procurement user
2. Create a quote and set status to "Received"
3. Click "View" on the quote
4. Verify "Approval Workflow" section appears with button
5. Click "📋 Submit for Approval" button
6. Dialog should open with manager selection

---

**Note:** This is the ONLY change needed to app.js. All other approval functionality is in separate modules (approvals.js, approval-submission.js) which are already complete and committed.
