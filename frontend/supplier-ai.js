// frontend/supplier-ai.js - AI Supplier Suggestions UI

/**
 * Load and display AI-powered supplier suggestions for an order
 * @param {number} orderId - Order ID
 * @param {number|null} currentSupplierId - Currently assigned supplier ID (if any)
 */
async function loadSupplierSuggestions(orderId, currentSupplierId = null) {
    const container = document.getElementById('supplierSuggestionsContainer');
    if (!container) {
        console.error('supplierSuggestionsContainer not found');
        return;
    }
    
    // Show loading state
    container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;padding:2rem;color:#94a3b8;">
            <div style="text-align:center;">
                <div style="font-size:1.5rem;margin-bottom:0.5rem;">⌛</div>
                <div>Analyzing order and finding matches...</div>
            </div>
        </div>
    `;
    
    try {
        // Fetch suggestions from backend
        const response = await fetch(`${API_BASE}/suppliers/suggestions/${orderId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Failed to load suggestions');
        }
        
        const suggestions = data.suggestions || [];
        
        if (suggestions.length === 0) {
            // No suggestions available
            container.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem;color:#64748b;background:rgba(15,23,42,0.4);border-radius:8px;border:1px dashed rgba(100,116,139,0.3);">
                    <div style="font-size:2rem;margin-bottom:0.75rem;">🤔</div>
                    <div style="font-size:0.9rem;font-weight:500;margin-bottom:0.25rem;">No suggestions available yet. This improves as you assign more suppliers!</div>
                    <div style="font-size:0.8rem;color:#475569;margin-top:0.25rem;">Tip: Assign suppliers to orders with similar items to train the AI.</div>
                </div>
            `;
            return;
        }
        
        // Render suggestion cards
        let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:0.75rem;margin-top:0.5rem;">';
        
        for (const suggestion of suggestions) {
            const isCurrentSupplier = currentSupplierId && suggestion.supplier_id === currentSupplierId;
            const confidenceColor = getConfidenceColor(suggestion.confidence);
            
            html += `
                <div class="supplier-suggestion-card" data-supplier-id="${suggestion.supplier_id}" style="
                    background: ${isCurrentSupplier ? 'rgba(34,197,94,0.08)' : 'rgba(15,23,42,0.6)'};
                    border: 1px solid ${isCurrentSupplier ? 'rgba(34,197,94,0.3)' : 'rgba(51,65,85,0.8)'};
                    border-radius: 8px;
                    padding: 0.875rem;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    position: relative;
                ">
                    ${isCurrentSupplier ? '<div style="position:absolute;top:0.5rem;right:0.5rem;background:rgba(34,197,94,0.9);color:white;font-size:0.65rem;padding:0.15rem 0.4rem;border-radius:4px;font-weight:600;">CURRENT</div>' : ''}
                    
                    <div style="display:flex;align-items:start;justify-content:space-between;margin-bottom:0.5rem;">
                        <div style="flex:1;">
                            <div style="font-weight:600;font-size:0.9rem;color:#e2e8f0;margin-bottom:0.15rem;">${escapeHtml(suggestion.supplier_name)}</div>
                            ${suggestion.contact_person ? `<div style="font-size:0.75rem;color:#94a3b8;">${escapeHtml(suggestion.contact_person)}</div>` : ''}
                        </div>
                        <div style="display:flex;flex-direction:column;align-items:flex-end;">
                            <div style="font-size:0.65rem;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.1rem;">Confidence</div>
                            <div style="font-size:1.1rem;font-weight:700;color:${confidenceColor};">${suggestion.confidence}%</div>
                        </div>
                    </div>
                    
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.6rem;padding:0.4rem 0.5rem;background:rgba(15,23,42,0.5);border-radius:6px;">
                        <div style="width:100%;background:rgba(51,65,85,0.5);height:4px;border-radius:2px;overflow:hidden;">
                            <div style="width:${suggestion.confidence}%;height:100%;background:${confidenceColor};transition:width 0.3s ease;"></div>
                        </div>
                    </div>
                    
                    <div style="font-size:0.75rem;color:#cbd5e1;margin-bottom:0.5rem;line-height:1.4;">
                        ${suggestion.match_reasons.length > 0 ? suggestion.match_reasons.slice(0, 2).map(reason => `• ${escapeHtml(reason)}`).join('<br>') : 'Based on historical patterns'}
                    </div>
                    
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:0.6rem;padding-top:0.6rem;border-top:1px solid rgba(51,65,85,0.5);">
                        <div style="font-size:0.7rem;color:#64748b;">
                            📊 ${suggestion.total_orders} order${suggestion.total_orders !== 1 ? 's' : ''}
                        </div>
                        <button 
                            class="btn btn-primary btn-sm"
                            onclick="assignSupplierFromSuggestion(${orderId}, ${suggestion.supplier_id})"
                            style="font-size:0.75rem;padding:0.3rem 0.6rem;white-space:nowrap;"
                        >
                            ${isCurrentSupplier ? '✓ Selected' : '→ Assign'}
                        </button>
                    </div>
                </div>
            `;
        }
        
        html += '</div>';
        container.innerHTML = html;
        
        // Add hover effect
        const cards = container.querySelectorAll('.supplier-suggestion-card');
        cards.forEach(card => {
            card.addEventListener('mouseenter', () => {
                card.style.transform = 'translateY(-2px)';
                card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
            });
            card.addEventListener('mouseleave', () => {
                card.style.transform = 'translateY(0)';
                card.style.boxShadow = 'none';
            });
        });
        
    } catch (error) {
        console.error('Error loading supplier suggestions:', error);
        container.innerHTML = `
            <div style="padding:1rem;background:rgba(220,38,38,0.1);border:1px solid rgba(220,38,38,0.3);border-radius:8px;color:#fca5a5;font-size:0.85rem;">
                ⚠️ Failed to load suggestions: ${escapeHtml(error.message)}
            </div>
        `;
    }
}

/**
 * Assign a supplier to an order from suggestion card
 * @param {number} orderId - Order ID
 * @param {number} supplierId - Supplier ID to assign
 */
async function assignSupplierFromSuggestion(orderId, supplierId) {
    try {
        // Update order with selected supplier
        const response = await fetch(`${API_BASE}/orders/${orderId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                supplier_id: supplierId
            })
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Failed to assign supplier');
        }
        
        alert('✓ Supplier assigned successfully!');
        
        // Reload order details and suggestions
        if (typeof loadOrders === 'function') {
            loadOrders();
        }
        if (typeof openOrderDetail === 'function') {
            openOrderDetail(orderId);
        }
        
    } catch (error) {
        console.error('Error assigning supplier:', error);
        alert('⚠️ Failed to assign supplier: ' + error.message);
    }
}

/**
 * Get color based on confidence score
 * @param {number} confidence - Confidence percentage (0-100)
 * @returns {string} CSS color
 */
function getConfidenceColor(confidence) {
    if (confidence >= 75) return '#22c55e'; // Green
    if (confidence >= 50) return '#eab308'; // Yellow
    return '#f97316'; // Orange
}
