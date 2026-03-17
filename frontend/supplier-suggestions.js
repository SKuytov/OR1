// frontend/supplier-suggestions.js
// Phase 1: Smart Supplier Suggestions UI Component

/**
 * Load and display smart supplier suggestions for an order
 * @param {number} orderId - The order ID
 * @param {number|null} currentSupplierId - Currently assigned supplier (if any)
 */
async function loadSupplierSuggestions(orderId, currentSupplierId) {
    const container = document.getElementById('supplierSuggestionsContainer');
    if (!container) return;

    // Show loading state
    container.innerHTML = `
        <div class="suggestions-loading">
            <div class="spinner"></div>
            <span>Finding best suppliers...</span>
        </div>
    `;

    try {
        // ⭐ FIX: Use correct API endpoint
        const res = await apiGet(`/suppliers/suggestions/${orderId}`);
        
        if (!res.success || !res.suggestions || res.suggestions.length === 0) {
            container.innerHTML = `
                <div class="suggestions-empty">
                    <span style="font-size: 2rem;">🤔</span>
                    <p style="margin: 0.5rem 0 0 0; color: #94a3b8;">No suggestions available yet. This improves as you assign more suppliers!</p>
                </div>
            `;
            return;
        }

        renderSuggestions(container, res.suggestions, orderId, currentSupplierId);
    } catch (error) {
        console.error('Failed to load suggestions:', error);
        container.innerHTML = `
            <div class="suggestions-error">
                <span style="color: #ef4444;">⚠️ Failed to load suggestions</span>
            </div>
        `;
    }
}

/**
 * Render supplier suggestions
 */
function renderSuggestions(container, suggestions, orderId, currentSupplierId) {
    let html = '<div class="suggestions-grid">';

    suggestions.forEach((supplier, index) => {
        const rank = index + 1;
        const isCurrentSupplier = supplier.supplier_id === currentSupplierId;
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
        
        // Star rating based on confidence
        const stars = getStarRating(supplier.confidence);

        html += `
            <div class="suggestion-card ${isCurrentSupplier ? 'current-supplier' : ''}" data-supplier-id="${supplier.supplier_id}">
                <div class="suggestion-header">
                    <div class="suggestion-rank">${medal}</div>
                    <div class="suggestion-title">
                        <div class="supplier-name">${escapeHtml(supplier.supplier_name)}</div>
                        <div class="suggestion-score-badge">${supplier.confidence}% match</div>
                    </div>
                </div>
                
                <div class="suggestion-performance">
                    <span class="stars">${stars}</span>
                    <span class="score-text">${supplier.confidence}/100</span>
                </div>

                <div class="suggestion-reasons">
                    ${supplier.match_reasons.slice(0, 2).map(reason => 
                        `<div class="reason-badge">✓ ${escapeHtml(reason)}</div>`
                    ).join('')}
                </div>

                <div class="suggestion-contact">
                    ${supplier.contact_person ? `<div>👤 ${escapeHtml(supplier.contact_person)}</div>` : ''}
                    ${supplier.email ? `<div>📧 ${escapeHtml(supplier.email)}</div>` : ''}
                    <div>📊 ${supplier.total_orders} order${supplier.total_orders !== 1 ? 's' : ''} processed</div>
                </div>

                ${isCurrentSupplier ? 
                    '<div class="suggestion-current-badge">✓ Currently Assigned</div>' :
                    `<button class="btn btn-primary btn-sm btn-assign-suggested" 
                            data-supplier-id="${supplier.supplier_id}" 
                            data-supplier-name="${escapeHtml(supplier.supplier_name)}"
                            data-rank="${rank}">
                        Assign Supplier
                    </button>`
                }
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;

    // Attach click handlers
    attachSuggestionHandlers(orderId);
}

/**
 * Attach event handlers to suggestion assign buttons
 */
function attachSuggestionHandlers(orderId) {
    document.querySelectorAll('.btn-assign-suggested').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const supplierId = parseInt(btn.dataset.supplierId);
            const supplierName = btn.dataset.supplierName;
            const rank = parseInt(btn.dataset.rank);

            if (!confirm(`Assign supplier "${supplierName}" to this order?`)) {
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Assigning...';

            try {
                // Update order with supplier
                const updateRes = await apiPut(`/orders/${orderId}`, {
                    supplier_id: supplierId
                });

                if (updateRes.success) {
                    // Show success message
                    showToast(`✓ Supplier "${supplierName}" assigned successfully!`, 'success');

                    // Reload order detail and orders list
                    if (typeof loadOrders === 'function') loadOrders();
                    if (typeof openOrderDetail === 'function') openOrderDetail(orderId);
                } else {
                    throw new Error(updateRes.message || 'Failed to assign supplier');
                }
            } catch (error) {
                console.error('Failed to assign supplier:', error);
                showToast('⚠️ Failed to assign supplier: ' + error.message, 'error');
                btn.disabled = false;
                btn.textContent = 'Assign Supplier';
            }
        });
    });
}

/**
 * Get star rating HTML based on confidence score
 */
function getStarRating(confidence) {
    const fullStars = Math.floor(confidence / 20); // 0-5 stars
    const halfStar = (confidence % 20) >= 10;
    const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);

    let html = '';
    for (let i = 0; i < fullStars; i++) html += '⭐';
    if (halfStar) html += '✨';
    for (let i = 0; i < emptyStars; i++) html += '☆';
    
    return html;
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3);
        z-index: 9999;
        animation: slideInRight 0.3s ease;
        max-width: 400px;
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => document.body.removeChild(toast), 300);
    }, 3000);
}

// Add CSS animations
if (!document.getElementById('suggestion-animations')) {
    const style = document.createElement('style');
    style.id = 'suggestion-animations';
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .suggestions-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 2rem;
            color: #94a3b8;
            gap: 1rem;
        }

        .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid rgba(148, 163, 184, 0.2);
            border-top-color: #3b82f6;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }

        .suggestions-empty, .suggestions-error {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 2rem;
            text-align: center;
        }

        .suggestions-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 1rem;
            margin-top: 0.75rem;
        }

        .suggestion-card {
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 12px;
            padding: 1rem;
            transition: all 0.2s ease;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }

        .suggestion-card:hover {
            border-color: rgba(59, 130, 246, 0.5);
            transform: translateY(-2px);
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
        }

        .suggestion-card.current-supplier {
            background: rgba(16, 185, 129, 0.1);
            border-color: rgba(16, 185, 129, 0.4);
        }

        .suggestion-header {
            display: flex;
            align-items: flex-start;
            gap: 0.75rem;
        }

        .suggestion-rank {
            font-size: 1.5rem;
            line-height: 1;
        }

        .suggestion-title {
            flex: 1;
        }

        .supplier-name {
            font-weight: 600;
            font-size: 1rem;
            color: #f1f5f9;
            margin-bottom: 0.25rem;
        }

        .suggestion-score-badge {
            display: inline-block;
            background: rgba(59, 130, 246, 0.2);
            color: #60a5fa;
            padding: 0.15rem 0.5rem;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 600;
        }

        .suggestion-performance {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.875rem;
        }

        .stars {
            letter-spacing: 1px;
        }

        .score-text {
            color: #94a3b8;
            font-size: 0.75rem;
        }

        .suggestion-reasons {
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
        }

        .reason-badge {
            background: rgba(34, 197, 94, 0.1);
            color: #4ade80;
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.75rem;
            border-left: 2px solid #22c55e;
        }

        .suggestion-contact {
            font-size: 0.75rem;
            color: #94a3b8;
            display: flex;
            flex-direction: column;
            gap: 0.15rem;
            padding-top: 0.5rem;
            border-top: 1px solid rgba(148, 163, 184, 0.1);
        }

        .suggestion-current-badge {
            background: rgba(16, 185, 129, 0.2);
            color: #10b981;
            padding: 0.5rem;
            border-radius: 6px;
            text-align: center;
            font-size: 0.875rem;
            font-weight: 600;
        }

        .btn-assign-suggested {
            margin-top: 0.25rem;
        }
    `;
    document.head.appendChild(style);
}
