// frontend/supplier-selector.js
// Professional Supplier Selection Interface

let supplierSelectorState = {
    allSuppliers: [],
    filteredSuppliers: [],
    selectedSupplierId: null,
    currentOrderId: null,
    searchTerm: '',
    filterRecent: false
};

// ============================================================================
// Open Supplier Selection Modal
// ============================================================================

async function openSupplierSelector(orderId, currentSupplierId = null) {
    console.log('🏢 Opening supplier selector for order', orderId, 'current supplier:', currentSupplierId);
    
    supplierSelectorState.currentOrderId = orderId;
    supplierSelectorState.selectedSupplierId = currentSupplierId;
    
    // Create modal first (with loading state)
    const modal = createSupplierSelectorModal(true);
    document.body.appendChild(modal);
    
    // Load suppliers THEN render
    await loadSuppliersForSelection();
    renderSupplierCards();
    updateSupplierStats();
    
    // Attach event listeners AFTER modal is in DOM
    attachSupplierSelectorEvents(modal);
    
    // Focus search
    setTimeout(() => {
        document.getElementById('supplierSearchInput')?.focus();
    }, 100);
}

// ============================================================================
// Create Modal UI
// ============================================================================

function createSupplierSelectorModal(isLoading = false) {
    const overlay = document.createElement('div');
    overlay.id = 'supplierSelectorOverlay';
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.9);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        animation: fadeIn 0.2s ease;
    `;
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: #0f172a;
        border: 1px solid rgba(148, 163, 184, 0.3);
        border-radius: 16px;
        width: 90%;
        max-width: 900px;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        animation: slideUp 0.3s ease;
    `;
    
    modal.innerHTML = `
        <!-- Header -->
        <div style="padding: 1.5rem; border-bottom: 1px solid rgba(148, 163, 184, 0.2);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
                <h2 style="margin: 0; font-size: 1.5rem; color: #e2e8f0;">
                    🏢 Select Supplier
                </h2>
                <button id="btnCloseSupplierSelector" class="btn-icon" style="font-size: 1.5rem;">
                    ✕
                </button>
            </div>
            
            <!-- Search Bar -->
            <div style="display: flex; gap: 0.75rem; align-items: center;">
                <div style="flex: 1; position: relative;">
                    <input 
                        type="text" 
                        id="supplierSearchInput" 
                        class="form-control" 
                        placeholder="🔍 Search by name, contact, email, or specialization..."
                        style="padding-left: 2.5rem;"
                    >
                    <span style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: #64748b; font-size: 1.2rem;">
                        🔍
                    </span>
                </div>
                <button id="btnFilterRecent" class="btn btn-secondary" style="white-space: nowrap;">
                    ⏱️ Recent Only
                </button>
                <button id="btnAddNewSupplier" class="btn btn-primary" style="white-space: nowrap;">
                    ➕ New Supplier
                </button>
            </div>
            
            <!-- Quick Stats -->
            <div id="supplierStats" style="display: flex; gap: 1rem; margin-top: 0.75rem; font-size: 0.85rem; color: #94a3b8;">
                <span id="totalSuppliersCount">${isLoading ? 'Loading...' : '0 suppliers'}</span>
                <span id="activeSuppliersCount">${isLoading ? '' : '0 active'}</span>
            </div>
        </div>
        
        <!-- Supplier List -->
        <div id="supplierListContainer" style="flex: 1; overflow-y: auto; padding: 1rem;">
            <div id="supplierGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;">
                ${isLoading ? '<div style="text-align: center; padding: 3rem; color: #94a3b8;">Loading suppliers...</div>' : ''}
            </div>
            <div id="noSuppliersMessage" style="display: none; text-align: center; padding: 3rem; color: #64748b;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📭</div>
                <div style="font-size: 1.1rem;">No suppliers found</div>
                <div style="font-size: 0.9rem; margin-top: 0.5rem;">Try adjusting your search or add a new supplier</div>
            </div>
        </div>
        
        <!-- Footer -->
        <div style="padding: 1rem 1.5rem; border-top: 1px solid rgba(148, 163, 184, 0.2); display: flex; justify-content: space-between; align-items: center;">
            <div style="color: #94a3b8; font-size: 0.85rem;">
                <span id="selectedSupplierName">No supplier selected</span>
            </div>
            <div style="display: flex; gap: 0.75rem;">
                <button id="btnCancelSupplierSelection" class="btn btn-secondary">Cancel</button>
                <button id="btnConfirmSupplierSelection" class="btn btn-primary" disabled>
                    ✓ Assign Supplier
                </button>
            </div>
        </div>
    `;
    
    overlay.appendChild(modal);
    
    return overlay;
}

// ============================================================================
// Load Suppliers
// ============================================================================

async function loadSuppliersForSelection() {
    console.log('📡 Loading suppliers from API...');
    
    try {
        const res = await apiGet('/suppliers');
        
        console.log('📦 Suppliers response:', res);
        
        if (res.success && res.suppliers) {
            supplierSelectorState.allSuppliers = res.suppliers;
            supplierSelectorState.filteredSuppliers = res.suppliers;
            
            console.log(`✅ Loaded ${res.suppliers.length} suppliers`);
        } else {
            console.error('❌ Invalid response from suppliers API:', res);
            showNotification('Failed to load suppliers', 'error');
        }
    } catch (error) {
        console.error('❌ Failed to load suppliers:', error);
        showNotification('Failed to load suppliers', 'error');
    }
}

function updateSupplierStats() {
    const total = supplierSelectorState.allSuppliers.length;
    const active = supplierSelectorState.allSuppliers.filter(s => s.active).length;
    
    const totalEl = document.getElementById('totalSuppliersCount');
    const activeEl = document.getElementById('activeSuppliersCount');
    
    if (totalEl) totalEl.textContent = `${total} supplier${total !== 1 ? 's' : ''}`;
    if (activeEl) activeEl.textContent = `${active} active`;
}

// ============================================================================
// Render Supplier Cards
// ============================================================================

function renderSupplierCards() {
    const grid = document.getElementById('supplierGrid');
    const noMessage = document.getElementById('noSuppliersMessage');
    
    if (!grid) {
        console.error('❌ supplierGrid element not found!');
        return;
    }
    
    const suppliers = supplierSelectorState.filteredSuppliers;
    
    console.log(`🎨 Rendering ${suppliers.length} supplier cards`);
    
    if (suppliers.length === 0) {
        grid.style.display = 'none';
        if (noMessage) noMessage.style.display = 'block';
        return;
    }
    
    grid.style.display = 'grid';
    if (noMessage) noMessage.style.display = 'none';
    
    grid.innerHTML = suppliers.map(supplier => createSupplierCard(supplier)).join('');
    
    // Attach click handlers
    suppliers.forEach(supplier => {
        const card = document.getElementById(`supplierCard_${supplier.id}`);
        if (card) {
            card.addEventListener('click', () => {
                console.log('🖱️ Clicked supplier:', supplier.id, supplier.name);
                selectSupplier(supplier.id, supplier.name);
            });
        }
    });
    
    console.log('✅ Supplier cards rendered and click handlers attached');
}

function createSupplierCard(supplier) {
    const isSelected = supplierSelectorState.selectedSupplierId === supplier.id;
    const isActive = supplier.active;
    
    // Performance score - SAFELY handle null/undefined
    const perfScore = supplier.performance_score != null ? parseFloat(supplier.performance_score) : null;
    let scoreColor = '#64748b';
    if (perfScore !== null) {
        if (perfScore >= 7) scoreColor = '#22c55e';
        else if (perfScore >= 5) scoreColor = '#f59e0b';
        else if (perfScore < 5) scoreColor = '#ef4444';
    }
    
    // Last order badge
    let lastOrderBadge = '';
    if (supplier.last_order_date) {
        const daysSince = Math.floor((new Date() - new Date(supplier.last_order_date)) / (1000 * 60 * 60 * 24));
        if (daysSince <= 30) {
            lastOrderBadge = `<span style="background: rgba(34, 197, 94, 0.1); color: #22c55e; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.7rem;">📦 ${daysSince}d ago</span>`;
        }
    }
    
    return `
        <div 
            id="supplierCard_${supplier.id}"
            class="supplier-card ${isSelected ? 'selected' : ''}"
            style="
                background: ${isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(30, 41, 59, 0.5)'};
                border: 2px solid ${isSelected ? '#3b82f6' : 'rgba(148, 163, 184, 0.2)'};
                border-radius: 12px;
                padding: 1rem;
                cursor: pointer;
                transition: all 0.2s ease;
                opacity: ${isActive ? '1' : '0.5'};
                position: relative;
            "
            onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 16px rgba(0,0,0,0.2)';"
            onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';"
        >
            <!-- Selection Indicator -->
            ${isSelected ? `
                <div style="position: absolute; top: 0.5rem; right: 0.5rem; background: #3b82f6; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem;">
                    ✓
                </div>
            ` : ''}
            
            <!-- Supplier Name -->
            <div style="font-weight: 600; font-size: 1rem; color: #e2e8f0; margin-bottom: 0.5rem; padding-right: 2rem;">
                ${supplier.name || 'Unnamed Supplier'}
                ${!isActive ? '<span style="color: #ef4444; font-size: 0.75rem; margin-left: 0.5rem;">(Inactive)</span>' : ''}
            </div>
            
            <!-- Specialization -->
            ${supplier.specialization ? `
                <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 0.75rem;">
                    🏷️ ${supplier.specialization}
                </div>
            ` : ''}
            
            <!-- Contact Info -->
            <div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem;">
                ${supplier.contact_person ? `<div>👤 ${supplier.contact_person}</div>` : ''}
                ${supplier.email ? `<div>📧 ${supplier.email}</div>` : ''}
                ${supplier.phone ? `<div>📞 ${supplier.phone}</div>` : ''}
            </div>
            
            <!-- Stats Row -->
            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(148, 163, 184, 0.1);">
                <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                    ${lastOrderBadge}
                    ${supplier.total_orders > 0 ? `
                        <span style="font-size: 0.7rem; color: #64748b;">
                            ${supplier.total_orders} order${supplier.total_orders !== 1 ? 's' : ''}
                        </span>
                    ` : ''}
                </div>
                ${perfScore !== null ? `
                    <div style="display: flex; align-items: center; gap: 0.25rem;">
                        <span style="color: ${scoreColor}; font-size: 0.85rem;">⭐</span>
                        <span style="color: ${scoreColor}; font-size: 0.8rem; font-weight: 600;">
                            ${perfScore.toFixed(1)}
                        </span>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// ============================================================================
// Supplier Selection
// ============================================================================

function selectSupplier(supplierId, supplierName) {
    console.log('✅ Supplier selected:', supplierId, supplierName);
    
    supplierSelectorState.selectedSupplierId = supplierId;
    
    // Update UI
    document.querySelectorAll('.supplier-card').forEach(card => {
        card.classList.remove('selected');
        card.style.background = 'rgba(30, 41, 59, 0.5)';
        card.style.border = '2px solid rgba(148, 163, 184, 0.2)';
    });
    
    const selectedCard = document.getElementById(`supplierCard_${supplierId}`);
    if (selectedCard) {
        selectedCard.classList.add('selected');
        selectedCard.style.background = 'rgba(59, 130, 246, 0.15)';
        selectedCard.style.border = '2px solid #3b82f6';
    }
    
    // Update footer
    const nameEl = document.getElementById('selectedSupplierName');
    if (nameEl) nameEl.textContent = `Selected: ${supplierName}`;
    
    const confirmBtn = document.getElementById('btnConfirmSupplierSelection');
    if (confirmBtn) confirmBtn.disabled = false;
}

// ============================================================================
// Event Handlers
// ============================================================================

function attachSupplierSelectorEvents(overlay) {
    console.log('🔗 Attaching event listeners to supplier selector');
    
    // Close button
    const closeBtn = document.getElementById('btnCloseSupplierSelector');
    if (closeBtn) {
        console.log('✅ Close button found');
        closeBtn.onclick = () => {
            console.log('🚪 Close button clicked');
            closeSupplierSelector();
        };
    } else {
        console.error('❌ Close button not found!');
    }
    
    // Cancel button
    const cancelBtn = document.getElementById('btnCancelSupplierSelection');
    if (cancelBtn) {
        console.log('✅ Cancel button found');
        cancelBtn.onclick = () => {
            console.log('❌ Cancel button clicked');
            closeSupplierSelector();
        };
    } else {
        console.error('❌ Cancel button not found!');
    }
    
    // Confirm button
    const confirmBtn = document.getElementById('btnConfirmSupplierSelection');
    if (confirmBtn) {
        console.log('✅ Confirm button found');
        confirmBtn.onclick = () => {
            console.log('💾 Confirm button clicked');
            confirmSupplierSelection();
        };
    } else {
        console.error('❌ Confirm button not found!');
    }
    
    // Search input
    const searchInput = document.getElementById('supplierSearchInput');
    if (searchInput) {
        console.log('✅ Search input found');
        searchInput.oninput = (e) => {
            console.log('🔍 Search:', e.target.value);
            filterSuppliers(e.target.value);
        };
    } else {
        console.error('❌ Search input not found!');
    }
    
    // Recent filter
    const recentBtn = document.getElementById('btnFilterRecent');
    if (recentBtn) {
        console.log('✅ Recent filter button found');
        recentBtn.onclick = () => {
            console.log('⏱️ Recent filter toggled');
            toggleRecentFilter(recentBtn);
        };
    } else {
        console.error('❌ Recent filter button not found!');
    }
    
    // Add new supplier
    const addBtn = document.getElementById('btnAddNewSupplier');
    if (addBtn) {
        console.log('✅ Add supplier button found');
        addBtn.onclick = () => {
            console.log('➕ Add new supplier clicked');
            openQuickAddSupplier();
        };
    } else {
        console.error('❌ Add supplier button not found!');
    }
    
    // Close on overlay click
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            console.log('🚪 Overlay clicked, closing');
            closeSupplierSelector();
        }
    };
    
    // Keyboard shortcuts
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            console.log('⌨️ ESC pressed, closing');
            closeSupplierSelector();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

function filterSuppliers(searchTerm) {
    supplierSelectorState.searchTerm = searchTerm.toLowerCase();
    
    let filtered = supplierSelectorState.allSuppliers;
    
    // Apply search
    if (searchTerm) {
        filtered = filtered.filter(s => {
            return (
                s.name?.toLowerCase().includes(searchTerm) ||
                s.contact_person?.toLowerCase().includes(searchTerm) ||
                s.email?.toLowerCase().includes(searchTerm) ||
                s.specialization?.toLowerCase().includes(searchTerm) ||
                s.category_tags?.toLowerCase().includes(searchTerm)
            );
        });
    }
    
    // Apply recent filter
    if (supplierSelectorState.filterRecent) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        filtered = filtered.filter(s => {
            return s.last_order_date && new Date(s.last_order_date) > thirtyDaysAgo;
        });
    }
    
    // Sort: active first, then by performance score
    filtered.sort((a, b) => {
        if (a.active !== b.active) return b.active - a.active;
        return (parseFloat(b.performance_score) || 0) - (parseFloat(a.performance_score) || 0);
    });
    
    supplierSelectorState.filteredSuppliers = filtered;
    renderSupplierCards();
}

function toggleRecentFilter(btn) {
    supplierSelectorState.filterRecent = !supplierSelectorState.filterRecent;
    
    if (supplierSelectorState.filterRecent) {
        btn.style.background = '#3b82f6';
        btn.style.color = 'white';
    } else {
        btn.style.background = '';
        btn.style.color = '';
    }
    
    filterSuppliers(supplierSelectorState.searchTerm);
}

function closeSupplierSelector() {
    const overlay = document.getElementById('supplierSelectorOverlay');
    if (overlay) {
        console.log('🚪 Closing supplier selector');
        document.body.removeChild(overlay);
    }
}

async function confirmSupplierSelection() {
    const supplierId = supplierSelectorState.selectedSupplierId;
    const orderId = supplierSelectorState.currentOrderId;
    
    console.log('💾 Confirming supplier selection:', { orderId, supplierId });
    
    if (!supplierId || !orderId) {
        console.error('❌ Missing orderId or supplierId');
        return;
    }
    
    try {
        // Update order with selected supplier
        const res = await apiPut(`/orders/${orderId}`, {
            supplier_id: supplierId
        });
        
        console.log('📡 Update response:', res);
        
        if (res.success) {
            showNotification('✅ Supplier assigned successfully', 'success');
            closeSupplierSelector();
            
            // Reload order detail if open
            if (typeof openOrderDetail === 'function') {
                await openOrderDetail(orderId);
            }
            
            // Reload orders list
            if (typeof loadOrders === 'function') {
                await loadOrders();
            }
        } else {
            showNotification('❌ ' + (res.message || 'Failed to assign supplier'), 'error');
        }
    } catch (error) {
        console.error('❌ Failed to assign supplier:', error);
        showNotification('❌ Failed to assign supplier', 'error');
    }
}

function openQuickAddSupplier() {
    console.log('➕ Opening quick add supplier form');
    
    // Close current modal
    closeSupplierSelector();
    
    // Switch to suppliers tab and open form
    if (typeof switchTab === 'function') {
        switchTab('suppliersTab');
    }
    
    // Trigger new supplier form
    setTimeout(() => {
        const newBtn = document.getElementById('btnNewSupplier');
        if (newBtn) {
            console.log('✅ Triggering new supplier form');
            newBtn.click();
        } else {
            console.error('❌ btnNewSupplier not found');
        }
    }, 300);
}

// ============================================================================
// Helper: Show Notification
// ============================================================================

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        background: ${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        font-size: 0.9rem;
        font-weight: 500;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Add animations
if (!document.getElementById('supplierSelectorAnimations')) {
    const style = document.createElement('style');
    style.id = 'supplierSelectorAnimations';
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes slideUp {
            from { transform: translateY(50px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        @keyframes slideIn {
            from { transform: translateX(400px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(400px); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

console.log('📦 Professional Supplier Selector loaded');
