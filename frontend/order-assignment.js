// frontend/order-assignment.js
// Order Assignment UI - Claim, Release, Reassign orders

// ============================================================================
// Assignment State
// ============================================================================

let assignmentState = {
    myOrders: [],
    unassignedOrders: [],
    currentFilter: 'all' // 'all', 'mine', 'unassigned'
};

// ============================================================================
// Initialization
// ============================================================================

function initAssignmentSystem() {
    // Add assignment filter chips to orders tab
    addAssignmentFilterChips();
    
    // Listen for order detail opens
    document.addEventListener('orderDetailOpened', handleOrderDetailOpened);
    
    console.log('✅ Order Assignment System initialized');
}

// ============================================================================
// Filter Chips for Quick Access
// ============================================================================

function addAssignmentFilterChips() {
    // Only for admin and procurement
    if (!currentUser || !['admin', 'procurement'].includes(currentUser.role)) {
        return;
    }
    
    const filtersContainer = document.querySelector('.filters-bar');
    if (!filtersContainer) return;
    
    // Check if already added
    if (document.getElementById('assignmentFilterChips')) return;
    
    const assignmentChipsHtml = `
        <div id="assignmentFilterChips" class="quick-filter-chips" style="margin-left: auto; padding-left: 1rem; border-left: 1px solid rgba(148,163,184,0.2);">
            <span style="font-size: 0.75rem; color: #94a3b8; margin-right: 0.5rem;">Assigned to:</span>
            <button class="quick-filter-chip" data-assignment-filter="all">
                📋 All Orders
            </button>
            <button class="quick-filter-chip" data-assignment-filter="mine">
                👤 My Orders
            </button>
            <button class="quick-filter-chip" data-assignment-filter="unassigned">
                ⭕ Unassigned
            </button>
        </div>
    `;
    
    filtersContainer.insertAdjacentHTML('beforeend', assignmentChipsHtml);
    
    // Attach event listeners
    document.querySelectorAll('[data-assignment-filter]').forEach(chip => {
        chip.addEventListener('click', () => {
            const filter = chip.dataset.assignmentFilter;
            setAssignmentFilter(filter);
        });
    });
    
    // Set default to 'all'
    setAssignmentFilter('all');
}

function setAssignmentFilter(filter) {
    assignmentState.currentFilter = filter;
    
    // Update active state
    document.querySelectorAll('[data-assignment-filter]').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.assignmentFilter === filter);
    });
    
    // Reload orders with filter
    loadOrdersWithAssignmentFilter(filter);
}

async function loadOrdersWithAssignmentFilter(filter) {
    try {
        const params = { assigned_filter: filter };
        const res = await apiGet('/orders', params);
        
        if (res.success) {
            ordersState = res.orders;
            filteredOrders = ordersState;
            applyFilters(); // Apply any existing filters
        }
    } catch (error) {
        console.error('Failed to load orders with assignment filter:', error);
    }
}

// ============================================================================
// Order Detail Panel - Assignment Controls
// ============================================================================

function handleOrderDetailOpened(event) {
    const order = event.detail;
    
    // Only for admin/procurement
    if (!currentUser || !['admin', 'procurement'].includes(currentUser.role)) {
        return;
    }
    
    // Add assignment controls to order detail panel
    addAssignmentControlsToDetail(order);
}

function addAssignmentControlsToDetail(order) {
    const detailBody = document.getElementById('orderDetailBody');
    if (!detailBody) return;
    
    // Check if order is assigned
    const isAssigned = order.assigned_to_id;
    const isAssignedToMe = isAssigned && order.assigned_to_id === currentUser.id;
    const isAdmin = currentUser.role === 'admin';
    
    let assignmentHtml = '<div id="orderAssignmentControls" style="border-top: 1px solid rgba(148,163,184,0.2); margin-top: 1rem; padding-top: 1rem;">';
    
    if (isAssigned) {
        // Order is assigned
        const staleWarning = order.minutes_since_activity > 30 
            ? '<span style="color: #f59e0b; font-size: 0.75rem;">⚠️ Inactive for ' + Math.floor(order.minutes_since_activity / 60) + ' hours</span>'
            : '';
        
        if (isAssignedToMe) {
            // Assigned to current user
            assignmentHtml += `
                <div style="background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); padding: 0.75rem; border-radius: 8px; margin-bottom: 0.75rem;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div>
                            <div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.25rem;">Assigned To</div>
                            <div style="font-weight: 500; color: #22c55e;">✓ You (${currentUser.name})</div>
                            <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 0.25rem;">Claimed ${formatTimeAgo(order.assigned_at)}</div>
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-secondary btn-sm" onclick="releaseOrder(${order.id})">
                                🔓 Release
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="requestReassignment(${order.id})">
                                🔄 Request Reassignment
                            </button>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Assigned to someone else
            assignmentHtml += `
                <div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); padding: 0.75rem; border-radius: 8px; margin-bottom: 0.75rem;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div>
                            <div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.25rem;">Assigned To</div>
                            <div style="font-weight: 500; color: #ef4444;">🔒 ${order.assigned_to_name}</div>
                            <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 0.25rem;">
                                Claimed ${formatTimeAgo(order.assigned_at)} ${staleWarning}
                            </div>
                        </div>
                        ${isAdmin ? `
                            <button class="btn btn-secondary btn-sm" onclick="openReassignDialog(${order.id}, '${order.assigned_to_name}')">
                                👤 Reassign (Admin)
                            </button>
                        ` : ''}
                    </div>
                    ${!isAdmin ? '<div style="margin-top: 0.5rem; font-size: 0.75rem; color: #f59e0b;">⚠️ Only the assigned user can edit this order</div>' : ''}
                </div>
            `;
        }
    } else {
        // Order is unassigned
        assignmentHtml += `
            <div style="background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3); padding: 0.75rem; border-radius: 8px; margin-bottom: 0.75rem;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div>
                        <div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.25rem;">Status</div>
                        <div style="font-weight: 500; color: #3b82f6;">⭕ Unassigned</div>
                        <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 0.25rem;">Available for processing</div>
                    </div>
                    <button class="btn btn-primary btn-sm" onclick="claimOrder(${order.id})">
                        ✋ Claim Order
                    </button>
                </div>
            </div>
        `;
    }
    
    // Add assignment history if exists
    if (order.assignmentHistory && order.assignmentHistory.length > 0) {
        assignmentHtml += `
            <div style="margin-top: 0.75rem;">
                <div style="font-size: 0.8rem; font-weight: 500; color: #e2e8f0; margin-bottom: 0.5rem;">Assignment History</div>
                <div style="font-size: 0.7rem; max-height: 100px; overflow-y: auto; color: #94a3b8;">
        `;
        
        order.assignmentHistory.forEach(h => {
            const icon = {
                'claim': '✋',
                'release': '🔓',
                'reassign': '🔄',
                'auto_release': '⏰'
            }[h.assignment_type] || '📝';
            
            assignmentHtml += `
                <div style="margin-bottom: 0.3rem;">
                    ${icon} <strong>${h.by_user_name}</strong> ${getAssignmentActionText(h)} 
                    <span style="color: #64748b;">${formatTimeAgo(h.created_at)}</span>
                </div>
            `;
        });
        
        assignmentHtml += '</div></div>';
    }
    
    assignmentHtml += '</div>';
    
    // Insert before update section or at end
    const updateSection = detailBody.querySelector('.detail-section-title:last-of-type');
    if (updateSection) {
        updateSection.parentElement.insertAdjacentHTML('beforebegin', assignmentHtml);
    } else {
        detailBody.insertAdjacentHTML('beforeend', assignmentHtml);
    }
}

function getAssignmentActionText(history) {
    switch (history.assignment_type) {
        case 'claim':
            return 'claimed this order';
        case 'release':
            return 'released this order';
        case 'reassign':
            return `reassigned from ${history.from_user_name || 'unassigned'} to ${history.to_user_name}`;
        case 'auto_release':
            return 'auto-released due to inactivity';
        default:
            return history.assignment_type;
    }
}

// ============================================================================
// Assignment Actions
// ============================================================================

async function claimOrder(orderId) {
    try {
        const res = await apiPost(`/order-assignments/${orderId}/claim`, {});
        
        if (res.success) {
            showNotification('✅ Order claimed successfully', 'success');
            
            // Reload order detail
            await openOrderDetail(orderId);
            
            // Update orders list
            await loadOrders();
        } else {
            showNotification('❌ ' + (res.message || 'Failed to claim order'), 'error');
        }
    } catch (error) {
        console.error('Claim order error:', error);
        showNotification('❌ Failed to claim order', 'error');
    }
}

async function releaseOrder(orderId) {
    const reason = prompt('Optional: Why are you releasing this order?');
    
    if (reason === null) return; // User cancelled
    
    try {
        const res = await apiPost(`/order-assignments/${orderId}/release`, { reason });
        
        if (res.success) {
            showNotification('✅ Order released successfully', 'success');
            
            // Reload order detail
            await openOrderDetail(orderId);
            
            // Update orders list
            await loadOrders();
        } else {
            showNotification('❌ ' + (res.message || 'Failed to release order'), 'error');
        }
    } catch (error) {
        console.error('Release order error:', error);
        showNotification('❌ Failed to release order', 'error');
    }
}

async function requestReassignment(orderId) {
    const reason = prompt('Why do you need this order reassigned?');
    
    if (!reason || reason.trim() === '') {
        alert('Please provide a reason for reassignment request');
        return;
    }
    
    try {
        const res = await apiPost(`/order-assignments/${orderId}/request-reassignment`, { reason });
        
        if (res.success) {
            showNotification('✅ Reassignment request sent to admin', 'success');
        } else {
            showNotification('❌ ' + (res.message || 'Failed to request reassignment'), 'error');
        }
    } catch (error) {
        console.error('Request reassignment error:', error);
        showNotification('❌ Failed to request reassignment', 'error');
    }
}

function openReassignDialog(orderId, currentAssignee) {
    // Create dialog
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.85);display:flex;align-items:center;justify-content:center;z-index:50;';
    
    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:#020617;padding:1.5rem;border-radius:12px;border:1px solid rgba(148,163,184,0.5);min-width:400px;color:white;';
    
    dialog.innerHTML = `
        <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem;">Reassign Order #${orderId}</h3>
        <div style="margin-bottom: 1rem; font-size: 0.85rem; color: #94a3b8;">
            Currently assigned to: <strong>${currentAssignee}</strong>
        </div>
        <div class="form-group">
            <label style="font-size: 0.85rem; margin-bottom: 0.5rem; display: block;">Reassign to:</label>
            <select id="reassignUserId" class="form-control form-control-sm">
                <option value="">Select user...</option>
            </select>
        </div>
        <div class="form-group" style="margin-top: 0.75rem;">
            <label style="font-size: 0.85rem; margin-bottom: 0.5rem; display: block;">Reason (optional):</label>
            <textarea id="reassignReason" class="form-control form-control-sm" rows="2" placeholder="Why reassign?"></textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:1rem;">
            <button class="btn btn-secondary btn-sm" id="btnCancelReassign">Cancel</button>
            <button class="btn btn-primary btn-sm" id="btnConfirmReassign">Reassign</button>
        </div>
    `;
    
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    // Load users for dropdown
    loadUsersForReassignment();
    
    // Event listeners
    document.getElementById('btnCancelReassign').onclick = () => {
        document.body.removeChild(overlay);
    };
    
    document.getElementById('btnConfirmReassign').onclick = async () => {
        const newUserId = document.getElementById('reassignUserId').value;
        const reason = document.getElementById('reassignReason').value;
        
        if (!newUserId) {
            alert('Please select a user');
            return;
        }
        
        try {
            const res = await apiPost(`/order-assignments/${orderId}/reassign`, {
                new_user_id: newUserId,
                reason
            });
            
            if (res.success) {
                showNotification('✅ Order reassigned to ' + res.assigned_to.name, 'success');
                document.body.removeChild(overlay);
                
                // Reload order detail
                await openOrderDetail(orderId);
                await loadOrders();
            } else {
                showNotification('❌ ' + (res.message || 'Failed to reassign'), 'error');
            }
        } catch (error) {
            console.error('Reassign error:', error);
            showNotification('❌ Failed to reassign order', 'error');
        }
    };
}

async function loadUsersForReassignment() {
    try {
        const res = await apiGet('/users');
        
        if (res.success) {
            const select = document.getElementById('reassignUserId');
            if (!select) return;
            
            const procurementUsers = res.users.filter(u => 
                u.active && (u.role === 'admin' || u.role === 'procurement')
            );
            
            select.innerHTML = '<option value="">Select user...</option>' + 
                procurementUsers.map(u => 
                    `<option value="${u.id}">${u.name} (${u.role})</option>`
                ).join('');
        }
    } catch (error) {
        console.error('Load users error:', error);
    }
}

// ============================================================================
// Visual Indicators in Orders Table
// ============================================================================

function addAssignmentIndicatorsToTable() {
    // Add lock icons to assigned orders in the table
    const rows = document.querySelectorAll('#ordersTable tbody tr');
    
    rows.forEach(row => {
        const orderId = row.dataset.id;
        const order = ordersState.find(o => o.id == orderId);
        
        if (order && order.assigned_to_id) {
            const isMe = order.assigned_to_id === currentUser.id;
            const icon = isMe ? '✓' : '🔒';
            const color = isMe ? '#22c55e' : '#ef4444';
            const tooltip = isMe ? 'Assigned to you' : `Assigned to ${order.assigned_to_name}`;
            
            // Add indicator to first cell
            const firstCell = row.querySelector('td:first-child');
            if (firstCell && !firstCell.querySelector('.assignment-indicator')) {
                const indicator = document.createElement('span');
                indicator.className = 'assignment-indicator';
                indicator.style.cssText = `color: ${color}; margin-right: 0.3rem; cursor: help;`;
                indicator.textContent = icon;
                indicator.title = tooltip;
                
                firstCell.prepend(indicator);
            }
        }
    });
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatTimeAgo(dateStr) {
    if (!dateStr) return 'recently';
    
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

function showNotification(message, type = 'info') {
    // Simple notification (can be enhanced with a toast library)
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
        setTimeout(() => document.body.removeChild(notification), 300);
    }, 3000);
}

// Add CSS animation styles
if (!document.getElementById('assignmentAnimations')) {
    const style = document.createElement('style');
    style.id = 'assignmentAnimations';
    style.textContent = `
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

// ============================================================================
// Initialization Hook
// ============================================================================

// Initialize when DOM is ready and user is logged in
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (currentUser) initAssignmentSystem();
    });
} else {
    if (currentUser) initAssignmentSystem();
}

// Also init when user logs in
document.addEventListener('userLoggedIn', () => {
    initAssignmentSystem();
});

console.log('📦 Order Assignment Module loaded');
