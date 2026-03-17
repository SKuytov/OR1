// frontend/documents.js - Multi-Order Document Management with Tabs
// Works with MySQL backend

let currentOrderId = null;
let currentDocuments = [];
let allLoadedDocuments = []; // unfiltered master copy
let activeDocTypeFilter = ''; // currently active type filter
let uploadDialogOrders = []; // All orders available for linking
let filteredUploadOrders = []; // Filtered subset

// ========== Document type label map ==========
const DOC_TYPE_LABELS = {
    '': 'All',
    'quote_request': 'Quote Request',
    'quote_pdf': 'Quote PDF',
    'proforma_invoice': 'Proforma Invoice',
    'purchase_order': 'PO',
    'invoice': 'Invoice',
    'delivery_note': 'Delivery Note',
    'signed_delivery_note': 'Signed Delivery',
    'packing_list': 'Packing List',
    'customs_declaration': 'Customs',
    'intrastat_declaration': 'Intrastat',
    'other': 'Other'
};

// Initialize tab switching in order detail panel
function initializeOrderDetailTabs() {
    // ⭐ SECURITY: Hide Documents tab from requesters
    if (currentUser && currentUser.role === 'requester') {
        return;
    }
    
    const tabsHtml = `
        <div class="detail-tabs" id="detailTabs">
            <button class="detail-tab active" data-tab="details" id="tabDetails">Order Details</button>
            <button class="detail-tab" data-tab="documents" id="tabDocuments">Documents</button>
        </div>
    `;
    
    const panelHeader = document.querySelector('#orderDetailPanel .side-panel-header');
    if (panelHeader && !document.getElementById('detailTabs')) {
        panelHeader.insertAdjacentHTML('afterend', tabsHtml);
        
        document.querySelectorAll('.detail-tab').forEach(tab => {
            tab.addEventListener('click', () => switchDetailTab(tab.dataset.tab));
        });
    }
}

function switchDetailTab(tabName) {
    document.querySelectorAll('.detail-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    const detailBody = document.getElementById('orderDetailBody');
    const documentsSection = document.getElementById('documentsSection');
    
    if (tabName === 'details') {
        if (detailBody) detailBody.style.display = 'block';
        if (documentsSection) documentsSection.style.display = 'none';
    } else if (tabName === 'documents') {
        if (detailBody) detailBody.style.display = 'none';
        if (documentsSection) documentsSection.style.display = 'block';
    }
}

// Load documents for a specific order
async function loadOrderDocuments(orderId) {
    // ⭐ SECURITY: Block requesters from loading documents
    if (currentUser && currentUser.role === 'requester') {
        return;
    }
    
    currentOrderId = orderId;
    activeDocTypeFilter = ''; // reset filter on new order load
    
    initializeOrderDetailTabs();
    
    try {
        const res = await fetch(`${API_BASE}/documents/order/${orderId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await res.json();
        
        if (data.success) {
            allLoadedDocuments = data.documents || [];
            currentDocuments = [...allLoadedDocuments];
            renderDocumentsSection();
        } else {
            showDocumentError('Failed to load documents');
        }
    } catch (err) {
        console.error('Error loading documents:', err);
        showDocumentError('Error loading documents');
    }
}

// ⭐ NEW: Apply client-side filter by document type
function applyDocTypeFilter(type) {
    activeDocTypeFilter = type;
    if (type === '') {
        currentDocuments = [...allLoadedDocuments];
    } else {
        currentDocuments = allLoadedDocuments.filter(d => d.document_type === type);
    }
    renderDocumentsSection();
}

function renderDocumentsSection() {
    const section = document.getElementById('documentsSection');
    if (!section) return;
    
    // ⭐ NEW: Build type filter tabs from types present in allLoadedDocuments
    const presentTypes = ['', ...new Set(allLoadedDocuments.map(d => d.document_type).filter(Boolean))];
    
    let typeTabsHtml = '<div class="doc-type-tabs">';
    for (const t of presentTypes) {
        const label = DOC_TYPE_LABELS[t] || t;
        const count = t === '' ? allLoadedDocuments.length : allLoadedDocuments.filter(d => d.document_type === t).length;
        const activeClass = activeDocTypeFilter === t ? ' active' : '';
        typeTabsHtml += `<button class="doc-type-tab${activeClass}" onclick="applyDocTypeFilter('${t}')">${label} <span class="doc-type-count">${count}</span></button>`;
    }
    typeTabsHtml += '</div>';
    
    let html = '<div class="documents-container">';
    html += '<div class="documents-header">';
    html += '<h4>\uD83D\uDCC4 Documents</h4>';
    
    if (currentUser && currentUser.role !== 'requester') {
        html += '<button class="btn btn-primary btn-sm" onclick="openUploadDialog()">\uD83D\uDCE4 Upload Document</button>';
    }
    
    html += '</div>';
    
    // ⭐ NEW: Only show type tabs when there are any documents loaded
    if (allLoadedDocuments.length > 0) {
        html += typeTabsHtml;
    }
    
    if (currentDocuments.length === 0) {
        html += '<div class="documents-empty">';
        if (allLoadedDocuments.length > 0 && activeDocTypeFilter !== '') {
            html += `<p class="text-muted">No documents of type <strong>${DOC_TYPE_LABELS[activeDocTypeFilter] || activeDocTypeFilter}</strong> attached to this order.</p>`;
        } else {
            html += '<p class="text-muted">No documents attached to this order yet.</p>';
        }
        html += '</div>';
    } else {
        html += '<div class="documents-list">';
        for (const doc of currentDocuments) {
            html += renderDocumentCard(doc);
        }
        html += '</div>';
    }
    
    html += '</div>';
    section.innerHTML = html;
}

function renderDocumentCard(doc) {
    const fileIcon = getFileIcon(doc.mime_type);
    const fileSize = formatFileSize(doc.file_size);
    const uploadDate = formatDateTime(doc.uploaded_at);
    
    const linkedOrders = doc.linked_order_ids || [];
    const orderBadges = linkedOrders.map(id => `<span class="order-badge">#${id}</span>`).join(' ');
    
    // ⭐ NEW: show document type badge
    const typeLabel = DOC_TYPE_LABELS[doc.document_type] || doc.document_type || '';
    const typeBadgeHtml = typeLabel ? `<span class="doc-type-badge">${escapeHtml(typeLabel)}</span>` : '';
    
    let html = '<div class="document-card">';
    html += '<div class="document-icon">' + fileIcon + '</div>';
    html += '<div class="document-info">';
    html += `<div class="document-name" title="${escapeHtml(doc.file_name)}">${escapeHtml(doc.file_name)}</div>`;
    html += `<div class="document-meta">`;
    html += typeBadgeHtml;
    html += `<span>${fileSize}</span>`;
    html += `<span>&bull;</span>`;
    html += `<span>${uploadDate}</span>`;
    html += `<span>&bull;</span>`;
    html += `<span>by ${escapeHtml(doc.uploaded_by_name || 'Unknown')}</span>`;
    html += `</div>`;
    
    if (doc.description) {
        html += `<div class="document-description">${escapeHtml(doc.description)}</div>`;
    }
    
    if (linkedOrders.length > 1) {
        html += `<div class="document-orders">Linked to: ${orderBadges}</div>`;
    }
    
    html += '</div>';
    html += '<div class="document-actions">';
    html += `<button class="btn-icon" onclick="downloadDocument(${doc.id}, '${escapeHtml(doc.file_name)}')" title="Download">&#x2B07;</button>`;
    
    // ⭐ SECURITY: Only admin can unlink (which may delete the document)
    if (currentUser && currentUser.role === 'admin') {
        html += `<button class="btn-icon btn-danger" onclick="unlinkDocument(${doc.id})" title="Remove from this order">🗑</button>`;
    }
    
    html += '</div>';
    html += '</div>';
    
    return html;
}

// Download document using dedicated API route
async function downloadDocument(documentId, fileName) {
    try {
        const res = await fetch(`${API_BASE}/documents/${documentId}/download`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (!res.ok) {
            alert('Failed to download document');
            return;
        }
        
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (err) {
        console.error('Download error:', err);
        alert('Failed to download document');
    }
}

function getFileIcon(mimeType) {
    if (!mimeType) return '\uD83D\uDCC4';
    if (mimeType.includes('pdf')) return '\uD83D\uDCD5';
    if (mimeType.includes('image')) return '\uD83D\uDDBC\uFE0F';
    if (mimeType.includes('word')) return '\uD83D\uDCD8';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '\uD83D\uDCD7';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return '\uD83D\uDCE6';
    return '\uD83D\uDCC4';
}

function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(1) + ' KB';
    const mb = kb / 1024;
    return mb.toFixed(1) + ' MB';
}

// Open upload dialog with multi-order selection
function openUploadDialog() {
    uploadDialogOrders = ordersState || [];
    filteredUploadOrders = [...uploadDialogOrders];
    
    let html = '<div class="upload-dialog-overlay" id="uploadDialog">';
    html += '<div class="upload-dialog">';
    html += '<div class="upload-dialog-header">';
    html += '<h3>Upload Document</h3>';
    html += '<button class="btn-icon" onclick="closeUploadDialog()">\u2715</button>';
    html += '</div>';
    html += '<div class="upload-dialog-body">';
    
    html += '<div class="form-group">';
    html += '<label for="docFile">Select File</label>';
    html += '<input type="file" id="docFile" class="form-control" required>';
    html += '<small class="text-muted">Max 50MB - PDF, Images, Office docs, Archives</small>';
    html += '</div>';
    
    html += '<div class="form-group">';
    html += '<label for="docType">Document Type</label>';
    html += '<select id="docType" class="form-control">';
    for (const [val, label] of Object.entries(DOC_TYPE_LABELS)) {
        if (val === '') continue;
        html += `<option value="${val}">${label}</option>`;
    }
    html += '</select>';
    html += '</div>';
    
    html += '<div class="form-group">';
    html += '<label for="docDescription">Description (optional)</label>';
    html += '<textarea id="docDescription" class="form-control" rows="2" placeholder="Add notes about this document"></textarea>';
    html += '</div>';
    
    html += '<div class="form-group">';
    html += '<label>Link to Orders (select multiple)</label>';
    html += '<div class="order-filters">';
    html += '<input type="text" id="orderSearchInput" class="form-control form-control-sm" placeholder="Search by ID, description, part number..." oninput="filterUploadOrders()">';
    html += '<select id="orderStatusFilter" class="form-control form-control-sm" onchange="filterUploadOrders()">';
    html += '<option value="">All Statuses</option>';
    html += '<option value="New">New</option>';
    html += '<option value="Pending">Pending</option>';
    html += '<option value="Quote Requested">Quote Requested</option>';
    html += '<option value="Quote Received">Quote Received</option>';
    html += '<option value="Approved">Approved</option>';
    html += '<option value="Ordered">Ordered</option>';
    html += '<option value="In Transit">In Transit</option>';
    html += '<option value="Delivered">Delivered</option>';
    html += '</select>';
    html += '<select id="orderSupplierFilter" class="form-control form-control-sm" onchange="filterUploadOrders()">';
    html += '<option value="">All Suppliers</option>';
    for (const supplier of suppliersState || []) {
        html += `<option value="${supplier.id}">${escapeHtml(supplier.name)}</option>`;
    }
    html += '</select>';
    html += '</div>';
    html += '<div class="order-selection-list" id="orderSelectionList">';
    html += renderOrderSelectionList();
    html += '</div>';
    html += '</div>';
    
    html += '</div>';
    html += '<div class="upload-dialog-footer">';
    html += '<button class="btn btn-secondary" onclick="closeUploadDialog()">Cancel</button>';
    html += '<button class="btn btn-primary" onclick="uploadDocument()">Upload</button>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
    
    document.body.insertAdjacentHTML('beforeend', html);
}

function filterUploadOrders() {
    const searchTerm = document.getElementById('orderSearchInput')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('orderStatusFilter')?.value || '';
    const supplierFilter = document.getElementById('orderSupplierFilter')?.value || '';
    
    filteredUploadOrders = uploadDialogOrders.filter(order => {
        if (searchTerm) {
            const searchFields = [
                order.id?.toString() || '',
                order.item_description || '',
                order.part_number || '',
                order.category || '',
                order.supplier_name || ''
            ].join(' ').toLowerCase();
            if (!searchFields.includes(searchTerm)) return false;
        }
        if (statusFilter && order.status !== statusFilter) return false;
        if (supplierFilter && order.supplier_id !== parseInt(supplierFilter, 10)) return false;
        return true;
    });
    
    const listContainer = document.getElementById('orderSelectionList');
    if (listContainer) {
        listContainer.innerHTML = renderOrderSelectionList();
    }
}

function renderOrderSelectionList() {
    if (filteredUploadOrders.length === 0) {
        return '<p class="text-muted" style="padding: 0.5rem; text-align: center;">No orders match the filters</p>';
    }
    
    let html = '';
    for (const order of filteredUploadOrders) {
        const checked = order.id === currentOrderId ? 'checked' : '';
        const desc = order.item_description || 'No description';
        const statusClass = 'status-' + (order.status || 'new').toLowerCase().replace(/ /g, '-');
        const supplier = order.supplier_name || '-';
        const costCenter = order.cost_center_code || '-';
        
        html += `<label class="order-checkbox-label">`;
        html += `<input type="checkbox" class="order-checkbox" value="${order.id}" ${checked}>`;
        html += `<div class="order-checkbox-content">`;
        html += `<div class="order-checkbox-main">`;
        html += `<span class="order-id">#${order.id}</span>`;
        html += `<span class="status-badge ${statusClass}">${order.status}</span>`;
        html += `<span class="order-desc">${escapeHtml(desc.substring(0, 60))}${desc.length > 60 ? '...' : ''}</span>`;
        html += `</div>`;
        html += `<div class="order-checkbox-meta">`;
        html += `<span>Supplier: ${escapeHtml(supplier)}</span>`;
        html += `<span>&bull;</span>`;
        html += `<span>CC: ${escapeHtml(costCenter)}</span>`;
        if (order.part_number) {
            html += `<span>&bull;</span>`;
            html += `<span>PN: ${escapeHtml(order.part_number)}</span>`;
        }
        html += `</div>`;
        html += `</div>`;
        html += `</label>`;
    }
    
    return html;
}

function closeUploadDialog() {
    const dialog = document.getElementById('uploadDialog');
    if (dialog) dialog.remove();
}

async function uploadDocument() {
    const fileInput = document.getElementById('docFile');
    const typeSelect = document.getElementById('docType');
    const descriptionInput = document.getElementById('docDescription');
    
    if (!fileInput.files.length) {
        alert('Please select a file');
        return;
    }
    
    const selectedOrders = Array.from(document.querySelectorAll('.order-checkbox:checked'))
        .map(cb => parseInt(cb.value, 10));
    
    if (selectedOrders.length === 0) {
        alert('Please select at least one order');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('orderIds', selectedOrders.join(','));
    formData.append('documentType', typeSelect.value);
    formData.append('description', descriptionInput.value);
    
    try {
        const res = await fetch(`${API_BASE}/documents/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: formData
        });
        
        const data = await res.json();
        
        if (data.success) {
            alert('\u2705 Document uploaded successfully!');
            closeUploadDialog();
            loadOrderDocuments(currentOrderId);
        } else {
            alert('Upload failed: ' + (data.message || 'Unknown error'));
        }
    } catch (err) {
        console.error('Upload error:', err);
        alert('Upload failed. Please try again.');
    }
}

async function unlinkDocument(documentId) {
    if (!confirm('Remove this document from the current order?')) return;
    
    try {
        const res = await fetch(`${API_BASE}/documents/${documentId}/unlink/${currentOrderId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await res.json();
        
        if (data.success) {
            loadOrderDocuments(currentOrderId);
        } else {
            alert('Failed to remove document: ' + (data.message || 'Unknown error'));
        }
    } catch (err) {
        console.error('Error removing document:', err);
        alert('Failed to remove document');
    }
}

function showDocumentError(message) {
    const section = document.getElementById('documentsSection');
    if (!section) return;
    
    section.innerHTML = `
        <div class="documents-container">
            <div class="documents-error">
                <p class="text-danger">\u26A0\uFE0F ${escapeHtml(message)}</p>
            </div>
        </div>
    `;
}

// Initialize on page load
if (typeof window !== 'undefined') {
    window.loadOrderDocuments = loadOrderDocuments;
    window.openUploadDialog = openUploadDialog;
    window.closeUploadDialog = closeUploadDialog;
    window.uploadDocument = uploadDocument;
    window.unlinkDocument = unlinkDocument;
    window.filterUploadOrders = filterUploadOrders;
    window.downloadDocument = downloadDocument;
    window.applyDocTypeFilter = applyDocTypeFilter;
}
