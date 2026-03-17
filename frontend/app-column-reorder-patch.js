// ===================== COLUMN REORDER PATCH =====================
// Replace the renderFlatOrders and renderGroupedOrders functions in app.js
// New column order: ID, View Button, Item, Cost Center, Qty, Status, Priority, Files, Requester, Delivery, Needed, Supplier, Building, Unit, Total

function renderFlatOrders() {
    const isAdminView = currentUser.role !== 'requester';

    let html = '<div class="table-wrapper"><table><thead><tr>';
    if (isAdminView) html += '<th class="sticky"><input type="checkbox" id="selectAllOrders"></th>';
    
    // New column order: ID, Item, Cost Center, Qty, Status, Priority, Files, Requester, Delivery, Needed, Supplier, Building, Unit, Total
    html += '<th>ID</th>';
    html += '<th></th>'; // View button
    html += '<th>Item</th>';
    html += '<th>Cost Center</th>';
    html += '<th>Qty</th>';
    html += '<th>Status</th>';
    html += '<th>Priority</th>';
    html += '<th>Files</th>';
    
    if (isAdminView) {
        html += '<th>Requester</th>';
        html += '<th>Delivery</th>';
        html += '<th>Needed</th>';
        html += '<th>Supplier</th>';
        html += '<th>Building</th>';
        html += '<th>Unit</th>';
        html += '<th>Total</th>';
    } else {
        html += '<th>Delivery</th>';
        html += '<th>Needed</th>';
    }
    
    html += '</tr></thead><tbody>';

    for (const order of filteredOrders) {
        const statusClass = 'status-' + order.status.toLowerCase().replace(/ /g, '-');
        const priorityClass = 'priority-' + (order.priority || 'Normal').toLowerCase();
        const hasFiles = order.files && order.files.length > 0;
        const deliveryStatus = getDeliveryStatus(order);

        html += '<tr data-id="' + order.id + '">';
        
        if (isAdminView) {
            html += `<td class="sticky"><input type="checkbox" class="row-select" data-id="${order.id}"></td>`;
        }
        
        // ID
        html += `<td>#${order.id}</td>`;
        
        // View Button
        html += `<td><button class="btn btn-secondary btn-sm btn-view-order" data-id="${order.id}">View</button></td>`;
        
        // Item
        html += `<td title="${escapeHtml(order.item_description)}">${escapeHtml(order.item_description.substring(0, 40))}${order.item_description.length > 40 ? '…' : ''}</td>`;
        
        // Cost Center
        html += `<td>${order.cost_center_code || '-'}</td>`;
        
        // Qty
        html += `<td>${order.quantity}</td>`;
        
        // Status
        html += `<td><span class="status-badge ${statusClass}">${order.status}</span></td>`;
        
        // Priority
        html += `<td><span class="priority-pill ${priorityClass}">${order.priority || 'Normal'}</span></td>`;
        
        // Files
        html += `<td>${hasFiles ? '📎 ' + order.files.length : '-'}</td>`;

        if (isAdminView) {
            // Requester
            html += `<td>${order.requester_name}</td>`;
            
            // Delivery
            html += `<td>${getDeliveryBadgeHtml(deliveryStatus)}</td>`;
            
            // Needed
            html += `<td>${formatDate(order.date_needed)}</td>`;
            
            // Supplier
            html += `<td>${order.supplier_name || '-'}</td>`;
            
            // Building
            html += `<td>${order.building}</td>`;
            
            // Unit
            html += `<td class="text-right">${fmtPrice(order.unit_price)}</td>`;
            
            // Total
            html += `<td class="text-right">${fmtPrice(order.total_price)}</td>`;
        } else {
            // Delivery
            html += `<td>${getDeliveryBadgeHtml(deliveryStatus)}</td>`;
            
            // Needed
            html += `<td>${formatDate(order.date_needed)}</td>`;
        }

        html += '</tr>';
    }
    html += '</tbody></table></div>';

    ordersTable.innerHTML = html;
    attachOrderEventListeners(isAdminView);
}

function renderGroupedOrders() {
    const isAdminView = currentUser.role !== 'requester';
    const grouped = {};

    // Group by status
    for (const order of filteredOrders) {
        if (!grouped[order.status]) grouped[order.status] = [];
        grouped[order.status].push(order);
    }

    let html = '';

    for (const status of ORDER_STATUSES) {
        if (!grouped[status] || grouped[status].length === 0) continue;

        const statusClass = 'status-' + status.toLowerCase().replace(/ /g, '-');
        html += `<div class="status-group">
            <div class="status-group-header" data-status="${status}">
                <div class="status-group-title">
                    <span class="status-badge ${statusClass}">${status}</span>
                    <span class="status-group-count">${grouped[status].length}</span>
                </div>
                <span class="status-group-chevron">▼</span>
            </div>
            <div class="status-group-body" data-status="${status}">`;

        html += '<div class="table-wrapper"><table><thead><tr>';
        if (isAdminView) html += '<th class="sticky"><input type="checkbox" class="select-all-group" data-status="${status}"></th>';
        
        // New column order (without Status since we're grouped by status)
        html += '<th>ID</th>';
        html += '<th></th>'; // View button
        html += '<th>Item</th>';
        html += '<th>Cost Center</th>';
        html += '<th>Qty</th>';
        html += '<th>Priority</th>';
        html += '<th>Files</th>';
        
        if (isAdminView) {
            html += '<th>Requester</th>';
            html += '<th>Delivery</th>';
            html += '<th>Needed</th>';
            html += '<th>Supplier</th>';
            html += '<th>Building</th>';
            html += '<th>Unit</th>';
            html += '<th>Total</th>';
        } else {
            html += '<th>Delivery</th>';
            html += '<th>Needed</th>';
        }
        
        html += '</tr></thead><tbody>';

        for (const order of grouped[status]) {
            const priorityClass = 'priority-' + (order.priority || 'Normal').toLowerCase();
            const hasFiles = order.files && order.files.length > 0;
            const deliveryStatus = getDeliveryStatus(order);

            html += '<tr data-id="' + order.id + '">';
            
            if (isAdminView) {
                html += `<td class="sticky"><input type="checkbox" class="row-select" data-id="${order.id}"></td>`;
            }
            
            // ID
            html += `<td>#${order.id}</td>`;
            
            // View Button
            html += `<td><button class="btn btn-secondary btn-sm btn-view-order" data-id="${order.id}">View</button></td>`;
            
            // Item
            html += `<td title="${escapeHtml(order.item_description)}">${escapeHtml(order.item_description.substring(0, 40))}${order.item_description.length > 40 ? '…' : ''}</td>`;
            
            // Cost Center
            html += `<td>${order.cost_center_code || '-'}</td>`;
            
            // Qty
            html += `<td>${order.quantity}</td>`;
            
            // Priority
            html += `<td><span class="priority-pill ${priorityClass}">${order.priority || 'Normal'}</span></td>`;
            
            // Files
            html += `<td>${hasFiles ? '📎 ' + order.files.length : '-'}</td>`;

            if (isAdminView) {
                // Requester
                html += `<td>${order.requester_name}</td>`;
                
                // Delivery
                html += `<td>${getDeliveryBadgeHtml(deliveryStatus)}</td>`;
                
                // Needed
                html += `<td>${formatDate(order.date_needed)}</td>`;
                
                // Supplier
                html += `<td>${order.supplier_name || '-'}</td>`;
                
                // Building
                html += `<td>${order.building}</td>`;
                
                // Unit
                html += `<td class="text-right">${fmtPrice(order.unit_price)}</td>`;
                
                // Total
                html += `<td class="text-right">${fmtPrice(order.total_price)}</td>`;
            } else {
                // Delivery
                html += `<td>${getDeliveryBadgeHtml(deliveryStatus)}</td>`;
                
                // Needed
                html += `<td>${formatDate(order.date_needed)}</td>`;
            }

            html += '</tr>';
        }

        html += '</tbody></table></div></div></div>';
    }

    ordersTable.innerHTML = html;

    // Attach collapse/expand handlers
    document.querySelectorAll('.status-group-header').forEach(header => {
        header.addEventListener('click', () => {
            const status = header.dataset.status;
            const body = document.querySelector(`.status-group-body[data-status="${status}"]`);
            if (body) {
                body.classList.toggle('collapsed');
                header.classList.toggle('collapsed');
            }
        });
    });

    attachOrderEventListeners(isAdminView);
}

// ===================== INSTRUCTIONS =====================
// 1. Open frontend/app.js
// 2. Find the renderFlatOrders() function (around line 733)
// 3. Replace it with the renderFlatOrders() function above
// 4. Find the renderGroupedOrders() function (around line 786)
// 5. Replace it with the renderGroupedOrders() function above
// 6. Save the file
// 7. Refresh your browser
