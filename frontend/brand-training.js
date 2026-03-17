// frontend/brand-training.js - Brand Intelligence Training UI for Admins

/**
 * Load brand training UI (admin only)
 */
async function loadBrandTrainingUI() {
    const container = document.getElementById('brandTrainingContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Loading brand rules...</div>';
    
    try {
        const res = await apiGet('/suppliers/brand-rules');
        
        if (!res.success) {
            throw new Error(res.message || 'Failed to load brand rules');
        }
        
        renderBrandTrainingUI(container, res.rules);
    } catch (error) {
        console.error('Error loading brand rules:', error);
        container.innerHTML = `<div class="error">⚠️ ${error.message}</div>`;
    }
}

/**
 * Render the brand training UI
 */
function renderBrandTrainingUI(container, rules) {
    let html = `
        <div class="brand-training-header">
            <h3>🧠 AI Brand Training</h3>
            <div class="header-actions">
                <button class="btn btn-secondary btn-sm" onclick="autoLearnBrands()">
                    <span>🤖 Auto-Learn from History</span>
                </button>
                <button class="btn btn-primary btn-sm" onclick="openBrandRuleForm()">
                    <span>➕ Add Brand Rule</span>
                </button>
            </div>
        </div>
        
        <div class="brand-training-info">
            <p>Train the AI to recognize brands and suggest the correct suppliers automatically.</p>
            <p><strong>Example:</strong> When "FESTO" is detected in a product description, always suggest FESTO supplier first.</p>
        </div>
        
        <div class="brand-rules-grid">
    `;
    
    const rulesArray = Object.entries(rules);
    
    if (rulesArray.length === 0) {
        html += '<div class="no-rules">No brand rules configured yet. Click "Add Brand Rule" to get started!</div>';
    } else {
        for (const [brandName, rule] of rulesArray) {
            html += `
                <div class="brand-rule-card" data-brand="${escapeHtml(brandName)}">
                    <div class="brand-rule-header">
                        <div class="brand-name">🏷️ ${escapeHtml(brandName)}</div>
                        <div class="brand-actions">
                            <button class="btn-icon" onclick="editBrandRule('${escapeHtml(brandName)}')" title="Edit">
                                ✏️
                            </button>
                            <button class="btn-icon" onclick="deleteBrandRule('${escapeHtml(brandName)}')" title="Delete">
                                🗑️
                            </button>
                        </div>
                    </div>
                    
                    <div class="brand-rule-body">
                        <div class="rule-section">
                            <div class="rule-label">Detection Keywords:</div>
                            <div class="rule-value">
                                ${rule.keywords.map(k => `<span class="keyword-badge">${escapeHtml(k)}</span>`).join(' ')}
                            </div>
                        </div>
                        
                        <div class="rule-section">
                            <div class="rule-label">Preferred Suppliers:</div>
                            <div class="rule-value">
                                ${rule.suppliers.map(s => `<span class="supplier-badge">${escapeHtml(s)}</span>`).join(' ')}
                            </div>
                        </div>
                        
                        <div class="rule-section">
                            <div class="rule-label">Score Bonus:</div>
                            <div class="rule-value"><strong>+${rule.scoreBonus}</strong> points</div>
                        </div>
                    </div>
                </div>
            `;
        }
    }
    
    html += '</div>';
    container.innerHTML = html;
}

/**
 * Open the brand rule form (create new or edit)
 */
function openBrandRuleForm(brandName = null) {
    const isEdit = brandName !== null;
    
    let rule = null;
    if (isEdit) {
        // Load existing rule
        apiGet('/suppliers/brand-rules').then(res => {
            if (res.success && res.rules[brandName]) {
                rule = res.rules[brandName];
                showBrandRuleModal(brandName, rule);
            }
        });
    } else {
        showBrandRuleModal(null, null);
    }
}

/**
 * Show brand rule modal
 */
function showBrandRuleModal(brandName, rule) {
    const isEdit = brandName !== null;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-dialog" style="max-width: 600px;">
            <div class="modal-header">
                <h3>${isEdit ? '✏️ Edit' : '➕ Add'} Brand Rule</h3>
                <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            <div class="modal-body">
                <form id="brandRuleForm">
                    <div class="form-group">
                        <label>Brand Name *</label>
                        <input type="text" id="brandNameInput" class="form-control" 
                               value="${escapeHtml(brandName || '')}" 
                               ${isEdit ? 'readonly' : ''}
                               placeholder="e.g., FESTO, SKF, Siemens" required>
                        <small>The brand name to detect in product descriptions</small>
                    </div>
                    
                    <div class="form-group">
                        <label>Detection Keywords * (comma-separated)</label>
                        <input type="text" id="keywordsInput" class="form-control" 
                               value="${rule ? rule.keywords.join(', ') : ''}" 
                               placeholder="e.g., festo, festo-pneumatic" required>
                        <small>Keywords to search for in descriptions (lowercase, comma-separated)</small>
                    </div>
                    
                    <div class="form-group">
                        <label>Preferred Suppliers * (comma-separated)</label>
                        <input type="text" id="suppliersInput" class="form-control" 
                               value="${rule ? rule.suppliers.join(', ') : ''}" 
                               placeholder="e.g., FESTO, Parker" required>
                        <small>Supplier names to boost when brand is detected</small>
                    </div>
                    
                    <div class="form-group">
                        <label>Score Bonus</label>
                        <input type="number" id="scoreBonusInput" class="form-control" 
                               value="${rule ? rule.scoreBonus : 200}" 
                               min="50" max="500" step="10">
                        <small>Points added to matching suppliers (default: 200)</small>
                    </div>
                    
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">💾 Save Rule</button>
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Form submit handler
    document.getElementById('brandRuleForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveBrandRule();
        modal.remove();
    });
}

/**
 * Save brand rule
 */
async function saveBrandRule() {
    const brandName = document.getElementById('brandNameInput').value.trim();
    const keywords = document.getElementById('keywordsInput').value
        .split(',')
        .map(k => k.trim().toLowerCase())
        .filter(k => k);
    const suppliers = document.getElementById('suppliersInput').value
        .split(',')
        .map(s => s.trim())
        .filter(s => s);
    const scoreBonus = parseInt(document.getElementById('scoreBonusInput').value);
    
    if (!brandName || keywords.length === 0 || suppliers.length === 0) {
        alert('Please fill in all required fields');
        return;
    }
    
    try {
        const res = await apiPost('/suppliers/brand-rules', {
            brandName,
            keywords,
            suppliers,
            scoreBonus
        });
        
        if (res.success) {
            showToast(`✅ Brand rule for "${brandName}" saved successfully!`, 'success');
            loadBrandTrainingUI(); // Reload
        } else {
            throw new Error(res.message);
        }
    } catch (error) {
        alert('❌ Failed to save brand rule: ' + error.message);
    }
}

/**
 * Edit existing brand rule
 */
async function editBrandRule(brandName) {
    openBrandRuleForm(brandName);
}

/**
 * Delete brand rule
 */
async function deleteBrandRule(brandName) {
    if (!confirm(`Delete brand rule for "${brandName}"?`)) {
        return;
    }
    
    try {
        const res = await apiDelete(`/suppliers/brand-rules/${encodeURIComponent(brandName)}`);
        
        if (res.success) {
            showToast(`✅ Brand rule for "${brandName}" deleted`, 'success');
            loadBrandTrainingUI(); // Reload
        } else {
            throw new Error(res.message);
        }
    } catch (error) {
        alert('❌ Failed to delete brand rule: ' + error.message);
    }
}

/**
 * Auto-learn brand patterns from historical data
 */
async function autoLearnBrands() {
    if (!confirm('Analyze historical data to discover brand patterns?\n\nThis will scan your orders and suggest new brand rules.')) {
        return;
    }
    
    const btn = event.target.closest('button');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span>🤖 Analyzing...</span>';
    btn.disabled = true;
    
    try {
        const res = await apiPost('/suppliers/brand-rules/learn', {});
        
        if (res.success) {
            if (res.patterns && res.patterns.length > 0) {
                showBrandPatternsModal(res.patterns);
            } else {
                alert('No new brand patterns discovered.\n\nTip: Make sure you have assigned suppliers to orders with brand names in descriptions.');
            }
        } else {
            throw new Error(res.message);
        }
    } catch (error) {
        alert('❌ Failed to learn patterns: ' + error.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

/**
 * Show discovered brand patterns modal
 */
function showBrandPatternsModal(patterns) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-dialog" style="max-width: 700px;">
            <div class="modal-header">
                <h3>🤖 Discovered Brand Patterns</h3>
                <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            <div class="modal-body">
                <p>Found ${patterns.length} potential brand→supplier relationships:</p>
                <div style="max-height: 400px; overflow-y: auto;">
                    ${patterns.map((p, i) => `
                        <div class="pattern-card">
                            <strong>${i+1}. ${escapeHtml(p.brand)}</strong>
                            → ${escapeHtml(p.supplier)}
                            <span class="badge">${p.frequency} orders</span>
                            <span class="badge">${p.confidence}</span>
                        </div>
                    `).join('')}
                </div>
                <p style="margin-top: 1rem; color: #94a3b8; font-size: 0.9rem;">
                    💡 Review these patterns and manually create brand rules for the ones that make sense.
                </p>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// API helper for DELETE
async function apiDelete(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        }
    });
    return await response.json();
}
