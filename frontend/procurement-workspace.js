// frontend/procurement-workspace.js
// PartPulse Orders v3.1 — Full Procurement Dashboard + Lifecycle
// Dashboard: KPI Strip + Orders Pipeline + Lifecycle Panel + Document Hub
// Wizard: Create Quote (3-step) with AI supplier suggestions
// Lifecycle: 5-stage quote → PO → Invoice → Accounting
// Pure Vanilla JS — no frameworks

'use strict';

// ============================================================
// MODULE STATE
// ============================================================
const PW = {
    currentQuoteId: null,
    currentLifecycle: null,
    wizardState: {
        step: 1,
        selectedOrderIds: [],
        orders: [],
        selectedSupplierId: null,
        selectedSupplierName: '',
        currency: 'EUR',
        validUntil: '',
        notes: '',
        aiSuggestions: []
    },
    panelOpen: false,
    // Dashboard state
    dashboard: {
        initialized: false,
        kpis: null,
        orders: [],
        documents: [],
        selectedQuoteId: null,
        docTypeFilter: 'all',
        pipelineFilter: null
    }
};

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

/**
 * showToast — displays a dismissible toast at bottom-right
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} type
 */
function showToast(message, type = 'success') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const colors = {
        success: '#10b981',
        error: '#ef4444',
        info: '#06b6d4',
        warning: '#f59e0b'
    };
    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.style.borderLeftColor = colors[type] || colors.success;
    toast.innerHTML = `<span class="toast-icon" style="color:${colors[type]}">${icons[type] || '✓'}</span><span class="toast-msg">${escHtml(message)}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-visible'));
    setTimeout(() => {
        toast.classList.remove('toast-visible');
        toast.classList.add('toast-hiding');
        setTimeout(() => toast.remove(), 350);
    }, 3500);
}

// ============================================================
// HTML ESCAPE UTILITY
// ============================================================
function escHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============================================================
// API HELPERS
// ============================================================
function pwApiGet(path) {
    const token = localStorage.getItem('authToken') || (typeof authToken !== 'undefined' ? authToken : '');
    return fetch('/api' + path, {
        headers: { 'Authorization': 'Bearer ' + token }
    }).then(r => r.json());
}

function pwApiPost(path, body) {
    const token = localStorage.getItem('authToken') || (typeof authToken !== 'undefined' ? authToken : '');
    return fetch('/api' + path, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    }).then(r => r.json());
}

function pwApiPut(path, body) {
    const token = localStorage.getItem('authToken') || (typeof authToken !== 'undefined' ? authToken : '');
    return fetch('/api' + path, {
        method: 'PUT',
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    }).then(r => r.json());
}

// ============================================================
// FORMAT HELPERS
// ============================================================
function pwFmtDate(d) {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function pwFmtDateTime(d) {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' ' + dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function pwFmtPrice(v, currency) {
    if (v === null || v === undefined || v === '') return '—';
    const n = parseFloat(v);
    if (isNaN(n)) return '—';
    return n.toFixed(2) + ' ' + (currency || 'EUR');
}

// ============================================================
// SPINNER HELPER
// ============================================================
function pwSpinner() {
    return '<div class="loading-spinner"></div>';
}

// ============================================================
// STATUS BADGE HELPERS
// ============================================================
function pwStatusBadge(status, type) {
    const maps = {
        quote: {
            'Draft': 'badge-gray', 'Sent to Supplier': 'badge-cyan', 'Received': 'badge-blue',
            'Under Approval': 'badge-yellow', 'Approved': 'badge-green', 'Rejected': 'badge-red'
        },
        po: {
            'draft': 'badge-gray', 'sent': 'badge-cyan', 'confirmed': 'badge-blue',
            'partially_delivered': 'badge-yellow', 'delivered': 'badge-green', 'cancelled': 'badge-red'
        },
        invoice: {
            'received': 'badge-gray', 'verified': 'badge-blue', 'sent_to_accounting': 'badge-cyan',
            'booked': 'badge-yellow', 'paid': 'badge-green', 'disputed': 'badge-red'
        },
        response: {
            'pending': 'badge-gray', 'accepted': 'badge-green', 'rejected': 'badge-red',
            'negotiating': 'badge-yellow', 'countered': 'badge-orange'
        },
        availability: {
            'in_stock': 'badge-green', 'available': 'badge-blue', 'on_order': 'badge-yellow',
            'partial': 'badge-orange', 'unavailable': 'badge-red'
        }
    };
    const cls = (maps[type] && maps[type][status]) || 'badge-gray';
    return `<span class="pw-badge ${cls}">${escHtml(status || '—')}</span>`;
}

function priorityBadge(p) {
    const cls = { 'Urgent': 'badge-red', 'High': 'badge-orange', 'Normal': 'badge-blue', 'Low': 'badge-gray' };
    return `<span class="pw-badge ${cls[p] || 'badge-gray'}">${escHtml(p || 'Normal')}</span>`;
}

// ============================================================
// LIFECYCLE BADGE (compact mini-timeline for order list rows)
// ============================================================

/**
 * renderLifecycleBadge — returns compact HTML mini-timeline for an order
 * Used in renderOrderRow to show procurement stage
 * @param {Object} order
 * @returns {string} HTML
 */
function renderLifecycleBadge(order) {
    if (!order) return '';

    const stages = [
        { key: 'quote', label: 'Quote', icon: '📋' },
        { key: 'approved', label: 'Approved', icon: '✅' },
        { key: 'ordered', label: 'Ordered', icon: '📦' },
        { key: 'delivered', label: 'Delivered', icon: '🚚' }
    ];

    const statusMap = {
        'New': 0, 'Pending': 0, 'Quote Requested': 1, 'Quote Received': 1,
        'Under Approval': 1, 'Approved': 2, 'Rejected': 1,
        'Ordered': 3, 'In Transit': 3, 'Partially Delivered': 3,
        'Delivered': 4, 'Cancelled': 0
    };

    const currentStage = statusMap[order.status] || 0;

    let html = '<div class="lifecycle-badge">';
    stages.forEach((stage, i) => {
        const stageNum = i + 1;
        let cls = 'lb-step';
        if (stageNum < currentStage) cls += ' lb-done';
        else if (stageNum === currentStage) cls += ' lb-active';
        else cls += ' lb-pending';
        html += `<span class="${cls}" title="${stage.label}">${stage.icon}</span>`;
        if (i < stages.length - 1) html += '<span class="lb-connector"></span>';
    });

    if (order.quote_number) {
        html += `<span class="lb-ref">${escHtml(order.quote_number)}</span>`;
    } else if (order.po_number) {
        html += `<span class="lb-ref">${escHtml(order.po_number)}</span>`;
    }

    html += '</div>';
    return html;
}

// ============================================================
// ============================================================
// SECTION I: PROCUREMENT DASHBOARD
// ============================================================
// ============================================================

// Document type → lifecycle stage mapping
const PW_DOC_TYPE_STAGES = {
    'quote_request': 1, 'rfq': 1, 'datasheet': 1,
    'proforma_invoice': 2, 'quote_response': 2,
    'approval_doc': 3,
    'purchase_order': 4,
    'delivery_note': 5, 'packing_list': 5, 'shipping_doc': 5,
    'invoice': 6, 'accounting_doc': 6
};

const PW_DOC_TYPE_LABELS = {
    'quote_request': 'Quote Request', 'rfq': 'RFQ', 'datasheet': 'Datasheet',
    'proforma_invoice': 'Proforma Invoice', 'quote_response': 'Quote Response',
    'approval_doc': 'Approval Doc',
    'purchase_order': 'Purchase Order',
    'delivery_note': 'Delivery Note', 'packing_list': 'Packing List', 'shipping_doc': 'Shipping Doc',
    'invoice': 'Invoice', 'accounting_doc': 'Accounting Doc'
};

const PW_PIPELINE_STAGES = [
    { key: 'new',      label: 'New',      color: '#64748b', icon: '🆕' },
    { key: 'quote',    label: 'Quote',    color: '#06b6d4', icon: '📋' },
    { key: 'response', label: 'Response', color: '#3b82f6', icon: '💬' },
    { key: 'approval', label: 'Approval', color: '#f59e0b', icon: '✅' },
    { key: 'po',       label: 'PO',       color: '#8b5cf6', icon: '📦' },
    { key: 'invoice',  label: 'Invoice',  color: '#ec4899', icon: '🧾' },
    { key: 'done',     label: 'Done',     color: '#10b981', icon: '🏁' }
];

/**
 * Map quote/order statuses to pipeline stage keys
 */
function pwGetPipelineStage(quote) {
    if (!quote) return 'new';
    const s = (quote.status || '').toLowerCase();
    if (['delivered', 'paid', 'booked', 'sent_to_accounting'].includes(s)) return 'done';
    if (s.includes('invoice') || s === 'received_invoice') return 'invoice';
    if (s.includes('po') || s === 'ordered' || s.includes('purchase') || s.includes('transit') || s.includes('partial')) return 'po';
    if (s === 'approved') return 'po';
    if (s === 'under approval' || s === 'under_approval') return 'approval';
    if (s === 'received' || s.includes('response')) return 'response';
    if (s === 'sent to supplier' || s === 'sent_to_supplier' || s === 'draft') return 'quote';
    return 'new';
}

/**
 * initProcurementDashboard — entry point called when procurement tab activates
 */
async function initProcurementDashboard() {
    const container = document.getElementById('procurementWorkspaceContainer');
    if (!container) return;

    // Render shell immediately
    container.innerHTML = buildDashboardShell();
    container.classList.add('pw-dashboard-active');

    // Bind static controls
    bindDashboardControls();

    // Load all data in parallel
    await Promise.all([
        loadProcurementKPIs(),
        loadOrdersPipeline(),
        loadDocumentHub()
    ]);

    PW.dashboard.initialized = true;
}

/**
 * buildDashboardShell — renders the dashboard skeleton HTML
 */
function buildDashboardShell() {
    return `
    <div class="pw-dashboard" id="pwDashboard">
        <!-- Top bar -->
        <div class="pw-dash-topbar">
            <div class="pw-dash-title">
                <span class="pw-dash-logo">⚙</span>
                <div>
                    <h2 class="pw-dash-heading">Procurement Dashboard</h2>
                    <div class="pw-dash-subtitle">PartPulse Orders · Spare Parts Pipeline</div>
                </div>
            </div>
            <div class="pw-dash-actions">
                <button class="pw-btn pw-btn-secondary pw-btn-sm" id="pwDashRefreshBtn" title="Refresh dashboard">
                    <span class="pw-btn-icon">↻</span> Refresh
                </button>
                <button class="pw-btn pw-btn-primary" id="pwDashNewQuoteBtn" onclick="openEnhancedCreateQuoteModal()">
                    <span class="pw-btn-icon">+</span> New Quote
                </button>
            </div>
        </div>

        <!-- KPI Strip -->
        <div class="pw-kpi-strip" id="pwKpiStrip">
            ${[0,1,2,3,4,5].map(() => `<div class="pw-kpi-card pw-kpi-skeleton"><div class="pw-kpi-skel-num"></div><div class="pw-kpi-skel-label"></div></div>`).join('')}
        </div>

        <!-- Main 3-column layout -->
        <div class="pw-dash-body">
            <!-- LEFT: Orders Pipeline -->
            <div class="pw-dash-col pw-dash-col-left" id="pwPipelineCol">
                <div class="pw-panel-header">
                    <span class="pw-panel-header-title">📊 Orders Pipeline</span>
                    <button class="pw-btn pw-btn-ghost pw-btn-xs" id="pwPipelineRefreshBtn" title="Refresh pipeline">↻</button>
                </div>
                <div class="pw-pipeline-container" id="pwPipelineContainer">
                    <div class="pw-panel-loading">${pwSpinner()} Loading pipeline…</div>
                </div>
            </div>

            <!-- CENTER: Quote Lifecycle Panel -->
            <div class="pw-dash-col pw-dash-col-center" id="pwLifecycleCol">
                <div class="pw-panel-header">
                    <span class="pw-panel-header-title" id="pwLifecyclePanelTitle">🚀 Lifecycle</span>
                    <div class="pw-panel-header-actions" id="pwLifecyclePanelActions"></div>
                </div>
                <div class="pw-lifecycle-embed" id="pwLifecycleEmbed">
                    <div class="pw-lifecycle-empty">
                        <div class="pw-lifecycle-empty-icon">📋</div>
                        <div class="pw-lifecycle-empty-text">Select a quote from the pipeline</div>
                        <div class="pw-lifecycle-empty-sub">Click any quote card on the left to view its full lifecycle</div>
                    </div>
                </div>
            </div>

            <!-- RIGHT: Document Hub -->
            <div class="pw-dash-col pw-dash-col-right" id="pwDocHubCol">
                <div class="pw-panel-header">
                    <span class="pw-panel-header-title">📁 Document Hub</span>
                    <button class="pw-btn pw-btn-ghost pw-btn-xs" id="pwDocHubRefreshBtn" title="Refresh documents">↻</button>
                </div>
                <div class="pw-dochub-container" id="pwDocHubContainer">
                    <div class="pw-panel-loading">${pwSpinner()} Loading documents…</div>
                </div>
            </div>
        </div>
    </div>
    `;
}

/**
 * bindDashboardControls — attaches event handlers for dashboard top-level buttons
 */
function bindDashboardControls() {
    const refreshBtn = document.getElementById('pwDashRefreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = `${pwSpinner()} Refreshing…`;
            await Promise.all([loadProcurementKPIs(), loadOrdersPipeline(), loadDocumentHub()]);
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<span class="pw-btn-icon">↻</span> Refresh';
            showToast('Dashboard refreshed', 'success');
        });
    }
    const pipelineRefreshBtn = document.getElementById('pwPipelineRefreshBtn');
    if (pipelineRefreshBtn) {
        pipelineRefreshBtn.addEventListener('click', () => loadOrdersPipeline());
    }
    const docRefreshBtn = document.getElementById('pwDocHubRefreshBtn');
    if (docRefreshBtn) {
        docRefreshBtn.addEventListener('click', () => loadDocumentHub());
    }
}

// ============================================================
// KPI STRIP
// ============================================================

/**
 * loadProcurementKPIs — fetches stats and renders KPI strip
 */
async function loadProcurementKPIs() {
    try {
        const [statsRes, quotesRes, approvalsRes] = await Promise.all([
            pwApiGet('/orders/stats/overview').catch(() => null),
            pwApiGet('/procurement/quotes').catch(() => null),
            pwApiGet('/approvals').catch(() => null)
        ]);

        const quotes = (quotesRes && quotesRes.quotes) ? quotesRes.quotes : [];
        const approvals = (approvalsRes && Array.isArray(approvalsRes)) ? approvalsRes :
                          (approvalsRes && approvalsRes.approvals) ? approvalsRes.approvals : [];

        const now = new Date();
        const activeQuotes = quotes.filter(q => !['Delivered', 'paid', 'booked'].includes(q.status)).length;
        const awaitingResponse = quotes.filter(q => q.status === 'Sent to Supplier').length;
        const pendingApproval = approvals.filter(a => a.status === 'pending').length;

        // Overdue: quotes sent > 7 days ago without response
        const overdue = quotes.filter(q => {
            if (q.status !== 'Sent to Supplier') return false;
            const sent = new Date(q.created_at);
            return (now - sent) > 7 * 24 * 60 * 60 * 1000;
        }).length;

        const openOrders = (statsRes && statsRes.open) ? statsRes.open :
                           quotes.filter(q => !['Delivered', 'paid', 'booked', 'cancelled'].includes((q.status || '').toLowerCase())).length;

        const docsPending = quotes.filter(q => {
            const stage = pwGetPipelineStage(q);
            return ['quote', 'response', 'approval'].includes(stage);
        }).length;

        const stats = {
            activeQuotes,
            awaitingResponse,
            pendingApproval,
            overdue,
            openOrders,
            docsPending
        };

        PW.dashboard.kpis = stats;
        renderKPIStrip(stats);
    } catch (err) {
        console.error('loadProcurementKPIs error:', err);
        renderKPIStripError();
    }
}

/**
 * renderKPIStrip — renders the 6 KPI stat cards
 * @param {Object} stats
 */
function renderKPIStrip(stats) {
    const strip = document.getElementById('pwKpiStrip');
    if (!strip) return;

    const cards = [
        {
            label: 'Active Quotes',
            value: stats.activeQuotes,
            icon: '📋',
            color: '#06b6d4',
            cls: ''
        },
        {
            label: 'Awaiting Response',
            value: stats.awaitingResponse,
            icon: '💬',
            color: '#3b82f6',
            cls: ''
        },
        {
            label: 'Pending Approval',
            value: stats.pendingApproval,
            icon: '✅',
            color: '#f59e0b',
            cls: stats.pendingApproval > 0 ? 'pw-kpi-card--warn' : ''
        },
        {
            label: 'Overdue',
            value: stats.overdue,
            icon: '⚠',
            color: '#ef4444',
            cls: stats.overdue > 0 ? 'pw-kpi-card--danger' : ''
        },
        {
            label: 'Open Orders',
            value: stats.openOrders,
            icon: '📦',
            color: '#8b5cf6',
            cls: ''
        },
        {
            label: 'Docs Pending',
            value: stats.docsPending,
            icon: '📁',
            color: '#10b981',
            cls: ''
        }
    ];

    strip.innerHTML = cards.map(c => `
        <div class="pw-kpi-card ${c.cls}" style="--kpi-accent:${c.color}">
            <div class="pw-kpi-icon">${c.icon}</div>
            <div class="pw-kpi-value" style="color:${c.color}">${c.value}</div>
            <div class="pw-kpi-label">${c.label}</div>
        </div>
    `).join('');
}

function renderKPIStripError() {
    const strip = document.getElementById('pwKpiStrip');
    if (!strip) return;
    strip.innerHTML = `<div style="color:#64748b;font-size:0.8rem;padding:0.75rem;">Failed to load KPIs</div>`;
}

// ============================================================
// ORDERS PIPELINE
// ============================================================

/**
 * loadOrdersPipeline — fetches quotes and renders kanban-style pipeline
 */
async function loadOrdersPipeline() {
    const container = document.getElementById('pwPipelineContainer');
    if (!container) return;

    try {
        const res = await pwApiGet('/procurement/quotes');
        const quotes = (res && res.quotes) ? res.quotes : [];
        PW.dashboard.orders = quotes;
        renderOrdersPipeline(quotes);
    } catch (err) {
        console.error('loadOrdersPipeline error:', err);
        if (container) {
            container.innerHTML = `<div class="pw-panel-error"><span>⚠</span> Failed to load pipeline</div>`;
        }
    }
}

/**
 * renderOrdersPipeline — renders kanban columns grouped by pipeline stage
 * @param {Array} quotes
 */
function renderOrdersPipeline(quotes) {
    const container = document.getElementById('pwPipelineContainer');
    if (!container) return;

    // Group quotes by stage
    const groups = {};
    PW_PIPELINE_STAGES.forEach(s => { groups[s.key] = []; });
    quotes.forEach(q => {
        const stage = pwGetPipelineStage(q);
        if (groups[stage]) groups[stage].push(q);
        else groups['new'].push(q);
    });

    const now = new Date();

    const columnsHtml = PW_PIPELINE_STAGES.map(stage => {
        const items = groups[stage.key] || [];
        const cardsHtml = items.length === 0
            ? `<div class="pw-pipe-empty">No items</div>`
            : items.map(q => {
                const isOverdue = stage.key === 'quote' &&
                    q.created_at && (now - new Date(q.created_at)) > 7 * 24 * 60 * 60 * 1000;
                const isSelected = PW.dashboard.selectedQuoteId === q.id;
                return `
                    <div class="pw-pipe-card ${isOverdue ? 'pw-pipe-card--overdue' : ''} ${isSelected ? 'pw-pipe-card--selected' : ''}"
                         data-quote-id="${q.id}"
                         onclick="selectQuoteInDashboard(${q.id})">
                        <div class="pw-pipe-card-header">
                            <span class="pw-pipe-quote-num">${escHtml(q.quote_number || '#' + q.id)}</span>
                            ${isOverdue ? '<span class="pw-pipe-overdue-badge">OVERDUE</span>' : ''}
                        </div>
                        <div class="pw-pipe-supplier">${escHtml(q.supplier_name || '—')}</div>
                        <div class="pw-pipe-meta">
                            <span>${pwFmtDate(q.created_at)}</span>
                            ${q.total_amount ? `<span class="pw-pipe-amount">${pwFmtPrice(q.total_amount, q.currency)}</span>` : ''}
                        </div>
                        ${q.item_count ? `<div class="pw-pipe-items-count">${q.item_count} item(s)</div>` : ''}
                    </div>`;
            }).join('');

        return `
            <div class="pw-pipe-column">
                <div class="pw-pipe-col-header" style="--col-color:${stage.color}">
                    <span class="pw-pipe-col-icon">${stage.icon}</span>
                    <span class="pw-pipe-col-label">${stage.label}</span>
                    <span class="pw-pipe-col-count">${items.length}</span>
                </div>
                <div class="pw-pipe-col-body">
                    ${cardsHtml}
                </div>
            </div>`;
    }).join('');

    container.innerHTML = `<div class="pw-pipeline-kanban">${columnsHtml}</div>`;
}

// ============================================================
// QUOTE SELECTION IN DASHBOARD
// ============================================================

/**
 * selectQuoteInDashboard — loads lifecycle data for selected quote into center panel
 * @param {number} quoteId
 */
async function selectQuoteInDashboard(quoteId) {
    if (!quoteId) return;
    PW.dashboard.selectedQuoteId = quoteId;

    // Update pipeline card selection state
    document.querySelectorAll('.pw-pipe-card').forEach(c => {
        c.classList.toggle('pw-pipe-card--selected', parseInt(c.dataset.quoteId) === quoteId);
    });

    const embed = document.getElementById('pwLifecycleEmbed');
    const titleEl = document.getElementById('pwLifecyclePanelTitle');
    if (embed) {
        embed.innerHTML = `<div class="pw-panel-loading">${pwSpinner()} Loading lifecycle…</div>`;
    }

    try {
        const res = await pwApiGet(`/procurement/lifecycle/quote/${quoteId}`);
        if (!res.success) {
            if (embed) embed.innerHTML = `<div class="pw-panel-error"><span>⚠</span> ${escHtml(res.message || 'Failed to load')}</div>`;
            return;
        }

        PW.currentQuoteId = quoteId;
        PW.currentLifecycle = res.lifecycle;

        const { quote } = res.lifecycle;
        if (titleEl && quote) {
            titleEl.innerHTML = `🚀 ${escHtml(quote.quote_number)} <span class="pw-lifecycle-title-badge">${escHtml(quote.supplier_name || '—')}</span>`;
        }

        const actionsEl = document.getElementById('pwLifecyclePanelActions');
        if (actionsEl && quote) {
            actionsEl.innerHTML = `
                <button class="pw-btn pw-btn-ghost pw-btn-xs" onclick="selectQuoteInDashboard(${quoteId})" title="Refresh">↻</button>
                <button class="pw-btn pw-btn-ghost pw-btn-xs" onclick="openQuoteLifecyclePanel(${quoteId})" title="Open full-screen panel">⛶</button>
            `;
        }

        // Render lifecycle inline
        renderLifecycleInDashboard(res.lifecycle, embed);

    } catch (err) {
        console.error('selectQuoteInDashboard error:', err);
        if (embed) embed.innerHTML = `<div class="pw-panel-error"><span>⚠</span> Network error loading lifecycle</div>`;
    }
}

/**
 * renderLifecycleInDashboard — renders the lifecycle stages in the embedded center panel
 * @param {Object} lc - lifecycle data
 * @param {HTMLElement} container
 */
function renderLifecycleInDashboard(lc, container) {
    const { quote, items, responses, purchase_orders, invoices, sendLog } = lc;
    if (!quote || !container) return;

    const stage = determineCurrentStage(quote, responses, purchase_orders, invoices);

    container.innerHTML = `
        <div class="pw-lifecycle-embed-header">
            <div class="pw-lifecycle-embed-meta">
                <span class="pw-lifecycle-embed-ref">${escHtml(quote.quote_number)}</span>
                ${pwStatusBadge(quote.status, 'quote')}
                <span class="pw-lifecycle-embed-supplier">📦 ${escHtml(quote.supplier_name || '—')}</span>
            </div>
            <div class="pw-lifecycle-stepper">
                ${renderDashboardStepper(stage)}
            </div>
        </div>
        <div class="pw-lifecycle-embed-body" id="pwEmbedLifecycleBody">
            <div class="lifecycle-timeline">
                ${renderStage1(quote, items, sendLog, stage)}
                ${renderStage2(quote, items, responses, stage)}
                ${renderStage3(quote, stage)}
                ${renderStage4(quote, purchase_orders, stage)}
                ${renderStage5(quote, purchase_orders, invoices, stage)}
            </div>
        </div>`;

    // Bind all stage events (reuse existing functions)
    bindStage2Events(quote, items);
    bindStage3Events(quote);
    bindStage4Events(quote, purchase_orders);
    bindStage5Events(quote, purchase_orders, invoices);
}

/**
 * renderDashboardStepper — renders a horizontal stepper for the 5 lifecycle stages
 * @param {number} currentStage
 * @returns {string} HTML
 */
function renderDashboardStepper(currentStage) {
    const steps = [
        { n: 1, label: 'Quote', icon: '📧' },
        { n: 2, label: 'Response', icon: '💬' },
        { n: 3, label: 'Approval', icon: '✅' },
        { n: 4, label: 'PO', icon: '📦' },
        { n: 5, label: 'Invoice', icon: '🧾' }
    ];
    return steps.map((s, i) => `
        <div class="pw-stepper-step ${s.n < currentStage ? 'pw-stepper-done' : s.n === currentStage ? 'pw-stepper-active' : 'pw-stepper-pending'}">
            <div class="pw-stepper-dot">${s.n < currentStage ? '✓' : s.icon}</div>
            <div class="pw-stepper-label">${s.label}</div>
        </div>
        ${i < steps.length - 1 ? '<div class="pw-stepper-connector"></div>' : ''}
    `).join('');
}

// ============================================================
// DOCUMENT HUB
// ============================================================

/**
 * loadDocumentHub — fetches documents and renders the right panel
 */
async function loadDocumentHub() {
    const container = document.getElementById('pwDocHubContainer');
    if (!container) return;

    try {
        const res = await pwApiGet('/documents');
        const docs = Array.isArray(res) ? res : (res && res.documents) ? res.documents : [];
        PW.dashboard.documents = docs;
        renderDocumentHub(docs);
    } catch (err) {
        console.error('loadDocumentHub error:', err);
        if (container) {
            container.innerHTML = `<div class="pw-panel-error"><span>⚠</span> Failed to load documents</div>`;
        }
    }
}

/**
 * renderDocumentHub — renders the document hub with filter chips and doc cards
 * @param {Array} docs
 */
function renderDocumentHub(docs) {
    const container = document.getElementById('pwDocHubContainer');
    if (!container) return;

    const filter = PW.dashboard.docTypeFilter || 'all';

    const docTypeGroups = {
        all:      { label: 'All',       color: '#64748b' },
        quotes:   { label: 'Quotes',    color: '#06b6d4', types: ['quote_request', 'rfq'] },
        proforma: { label: 'Proformas', color: '#3b82f6', types: ['proforma_invoice', 'quote_response'] },
        po:       { label: 'POs',       color: '#8b5cf6', types: ['purchase_order'] },
        invoices: { label: 'Invoices',  color: '#ec4899', types: ['invoice', 'accounting_doc'] },
        shipping: { label: 'Shipping',  color: '#10b981', types: ['delivery_note', 'packing_list', 'shipping_doc'] },
        datasheets:{ label: 'Datasheets',color: '#f59e0b', types: ['datasheet', 'approval_doc'] }
    };

    // Filter docs
    let filteredDocs = docs;
    if (filter !== 'all' && docTypeGroups[filter] && docTypeGroups[filter].types) {
        filteredDocs = docs.filter(d => docTypeGroups[filter].types.includes(d.document_type));
    }

    // Sort by uploaded date, newest first
    filteredDocs = [...filteredDocs].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    const filterChips = Object.keys(docTypeGroups).map(key => {
        const grp = docTypeGroups[key];
        const count = key === 'all' ? docs.length :
            (grp.types ? docs.filter(d => grp.types.includes(d.document_type)).length : docs.length);
        return `
            <button class="pw-doc-filter-chip ${filter === key ? 'active' : ''}"
                    style="--chip-color:${grp.color}"
                    onclick="pwSetDocFilter('${key}')">
                ${grp.label} <span class="pw-doc-filter-count">${count}</span>
            </button>`;
    }).join('');

    const uploadBtn = `
        <button class="pw-btn pw-btn-primary pw-btn-sm pw-dochub-upload-btn" onclick="openUploadDialogForStage(null, [])">
            <span>↑</span> Upload Document
        </button>`;

    const docsHtml = filteredDocs.length === 0
        ? `<div class="pw-dochub-empty">No documents found</div>`
        : filteredDocs.slice(0, 50).map(doc => renderDocCard(doc, docTypeGroups)).join('');

    container.innerHTML = `
        <div class="pw-dochub-filters">
            ${filterChips}
        </div>
        ${uploadBtn}
        <div class="pw-dochub-list" id="pwDocHubList">
            ${docsHtml}
        </div>`;
}

/**
 * renderDocCard — renders a single document card in the doc hub
 * @param {Object} doc
 * @param {Object} docTypeGroups
 * @returns {string} HTML
 */
function renderDocCard(doc, docTypeGroups) {
    const type = doc.document_type || 'unknown';
    const label = PW_DOC_TYPE_LABELS[type] || type;

    // Find color for type badge
    let badgeColor = '#64748b';
    for (const [key, grp] of Object.entries(docTypeGroups)) {
        if (grp.types && grp.types.includes(type)) {
            badgeColor = grp.color;
            break;
        }
    }

    const stage = PW_DOC_TYPE_STAGES[type];
    const stageInfo = stage ? ` · Stage ${stage}` : '';
    const pending = stage && stage <= 3; // stages 1-3 might need action

    return `
        <div class="pw-doc-card ${pending ? 'pw-doc-card--pending' : ''}">
            <div class="pw-doc-card-header">
                <span class="pw-doc-type-badge" style="background:${badgeColor}22;color:${badgeColor};border:1px solid ${badgeColor}44">${escHtml(label)}</span>
                ${pending ? '<span class="pw-doc-pending-dot" title="Pending action"></span>' : ''}
            </div>
            <div class="pw-doc-filename" title="${escHtml(doc.original_filename || doc.filename || 'Unknown')}">
                📄 ${escHtml((doc.original_filename || doc.filename || 'Document').substring(0, 32))}${(doc.original_filename || doc.filename || '').length > 32 ? '…' : ''}
            </div>
            <div class="pw-doc-meta">
                <span>${pwFmtDate(doc.created_at)}</span>
                <span>${escHtml(doc.uploaded_by_name || '—')}</span>
            </div>
            ${doc.quote_number ? `<div class="pw-doc-linked">🔗 ${escHtml(doc.quote_number)}${stageInfo}</div>` : ''}
            <div class="pw-doc-actions">
                <a class="pw-btn pw-btn-ghost pw-btn-xs" href="/api/documents/${doc.id}/download" target="_blank" title="Download">↓ View</a>
            </div>
        </div>`;
}

/**
 * renderDocTypeFilter — re-renders doc hub with updated filter
 */
function renderDocTypeFilter() {
    renderDocumentHub(PW.dashboard.documents);
}

/**
 * pwSetDocFilter — sets the active doc type filter and re-renders
 * @param {string} filterKey
 */
function pwSetDocFilter(filterKey) {
    PW.dashboard.docTypeFilter = filterKey;
    renderDocTypeFilter();
}

/**
 * openUploadDialogForStage — opens upload dialog with document type pre-selected for a lifecycle stage
 * @param {number|null} stage - lifecycle stage number (1-6) or null for generic
 * @param {Array} orderIds - array of order IDs to link
 */
function openUploadDialogForStage(stage, orderIds) {
    // Map stage to default document type
    const stageDefaultType = {
        1: 'rfq',
        2: 'proforma_invoice',
        3: 'approval_doc',
        4: 'purchase_order',
        5: 'delivery_note',
        6: 'invoice'
    };
    const defaultType = stage ? (stageDefaultType[stage] || '') : '';

    const existing = document.getElementById('pwUploadDialogOverlay');
    if (existing) existing.remove();

    const docTypes = Object.keys(PW_DOC_TYPE_LABELS);
    const typeOptions = docTypes.map(t =>
        `<option value="${t}" ${t === defaultType ? 'selected' : ''}>${PW_DOC_TYPE_LABELS[t]}</option>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.id = 'pwUploadDialogOverlay';
    overlay.className = 'pw-modal-overlay';
    overlay.innerHTML = `
        <div class="pw-modal-card" style="max-width:480px;">
            <div class="pw-modal-header">
                <h3 class="pw-modal-title">📎 Upload Document${stage ? ' — Stage ' + stage : ''}</h3>
                <button class="pw-close-btn" id="pwUploadDialogClose">✕</button>
            </div>
            <div class="pw-wizard-body">
                <div class="pw-form-group">
                    <label class="pw-label">Document Type</label>
                    <select id="pwUploadDocType" class="pw-form-control">${typeOptions}</select>
                </div>
                <div class="pw-form-group">
                    <label class="pw-label">File</label>
                    <input type="file" id="pwUploadFile" class="pw-form-control" accept=".pdf,.PDF,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg">
                </div>
                <div class="pw-form-group">
                    <label class="pw-label">Notes (optional)</label>
                    <textarea id="pwUploadNotes" class="pw-form-control" rows="2" placeholder="Notes about this document…"></textarea>
                </div>
                <div class="pw-form-actions">
                    <button class="pw-btn pw-btn-secondary" id="pwUploadCancelBtn">Cancel</button>
                    <button class="pw-btn pw-btn-primary" id="pwUploadSubmitBtn">↑ Upload</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const close = () => { overlay.classList.add('pw-fade-out'); setTimeout(() => overlay.remove(), 300); };
    overlay.querySelector('#pwUploadDialogClose').addEventListener('click', close);
    overlay.querySelector('#pwUploadCancelBtn').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelector('#pwUploadSubmitBtn').addEventListener('click', async () => {
        const fileInput = document.getElementById('pwUploadFile');
        const docType = document.getElementById('pwUploadDocType')?.value;
        const notes = document.getElementById('pwUploadNotes')?.value || '';
        const submitBtn = document.getElementById('pwUploadSubmitBtn');

        if (!fileInput || !fileInput.files || !fileInput.files[0]) {
            showToast('Please select a file to upload', 'warning');
            return;
        }

        const file = fileInput.files[0];
        submitBtn.disabled = true;
        submitBtn.innerHTML = pwSpinner() + ' Uploading…';

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('documentType', docType);
            if (orderIds && orderIds.length) {
                formData.append('orderIds', JSON.stringify(orderIds));
            }
            if (notes) formData.append('notes', notes);

            const token = localStorage.getItem('authToken') || (typeof authToken !== 'undefined' ? authToken : '');
            const res = await fetch('/api/documents/upload', {
                method: 'POST',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                body: formData
            });
            const data = await res.json();

            if (data.success) {
                showToast('Document uploaded successfully', 'success');
                close();
                loadDocumentHub();
            } else {
                showToast('Upload failed: ' + (data.message || 'Unknown error'), 'error');
                submitBtn.disabled = false;
                submitBtn.innerHTML = '↑ Upload';
            }
        } catch (err) {
            console.error('Upload error:', err);
            showToast('Network error uploading document', 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '↑ Upload';
        }
    });
}

// ============================================================
// ============================================================
// SECTION II: EXISTING PROCUREMENT WORKSPACE CODE (PRESERVED)
// ============================================================
// ============================================================

// ============================================================
// A. ENHANCED QUOTE CREATION WIZARD
// ============================================================

function openEnhancedCreateQuoteModal(preselectedSupplierId, preselectedSupplierName) {
    const selIds = typeof selectedOrderIds !== 'undefined'
        ? Array.from(selectedOrderIds)
        : [];

    if (!selIds.length) {
        showToast('Please select at least one order', 'warning');
        return;
    }

    const suppliers = typeof suppliersState !== 'undefined' ? suppliersState : [];
    const orders = typeof ordersState !== 'undefined'
        ? ordersState.filter(o => selIds.includes(o.id))
        : selIds.map(id => ({ id, item_description: 'Order #' + id, quantity: 1, building: '—' }));

    openEnhancedQuoteModal(selIds, orders, suppliers, preselectedSupplierId, preselectedSupplierName);
}

function openEnhancedQuoteModal(selectedOrderIds, orders, suppliersState, preselectedSupplierId, preselectedSupplierName) {
    PW.wizardState = {
        step: 1,
        selectedOrderIds: selectedOrderIds,
        orders: orders,
        selectedSupplierId: preselectedSupplierId || null,
        selectedSupplierName: preselectedSupplierName || '',
        currency: 'EUR',
        validUntil: '',
        notes: '',
        aiSuggestions: []
    };

    const existing = document.getElementById('pwWizardOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pwWizardOverlay';
    overlay.className = 'pw-modal-overlay';
    overlay.innerHTML = buildWizardHTML(orders, suppliersState);
    document.body.appendChild(overlay);

    overlay.querySelector('.pw-wizard-close').addEventListener('click', closeEnhancedQuoteModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeEnhancedQuoteModal(); });

    showWizardStep(1);
    bindWizardStep1(orders);
}

function closeEnhancedQuoteModal() {
    const overlay = document.getElementById('pwWizardOverlay');
    if (overlay) {
        overlay.classList.add('pw-fade-out');
        setTimeout(() => overlay.remove(), 300);
    }
}

function buildWizardHTML(orders, suppliers) {
    return `
        <div class="pw-modal-card pw-wizard-card">
            <div class="pw-modal-header">
                <div>
                    <h3 class="pw-modal-title">📋 Create Quote</h3>
                    <div class="pw-wizard-steps">
                        <span class="pw-step-dot active" data-step="1">1</span>
                        <span class="pw-step-line"></span>
                        <span class="pw-step-dot" data-step="2">2</span>
                        <span class="pw-step-line"></span>
                        <span class="pw-step-dot" data-step="3">3</span>
                    </div>
                </div>
                <button class="pw-close-btn pw-wizard-close">✕</button>
            </div>
            <div class="pw-wizard-body">
                <div id="wizardStep1" class="wizard-step">${buildStep1HTML(orders)}</div>
                <div id="wizardStep2" class="wizard-step hidden">${buildStep2HTML(suppliers)}</div>
                <div id="wizardStep3" class="wizard-step hidden">${buildStep3HTML()}</div>
            </div>
            <div class="pw-wizard-footer">
                <button id="wizardBtnBack" class="btn btn-secondary hidden">← Back</button>
                <div style="flex:1"></div>
                <button id="wizardBtnNext" class="btn btn-primary">Review Suppliers →</button>
                <button id="wizardBtnCreate" class="btn btn-primary hidden">✓ Create Quote</button>
            </div>
        </div>
    `;
}

function buildStep1HTML(orders) {
    const totalItems = orders.length;
    const urgentCount = orders.filter(o => o.priority === 'Urgent').length;
    const soonestDate = orders.map(o => o.date_needed).filter(Boolean).sort()[0];

    let rows = '';
    for (const o of orders) {
        rows += `<tr>
            <td>#${o.id}</td>
            <td title="${escHtml(o.item_description)}">${escHtml((o.item_description || '').substring(0, 45))}${(o.item_description || '').length > 45 ? '…' : ''}</td>
            <td>${escHtml(o.building || '—')}</td>
            <td>${o.quantity || 1}</td>
            <td>${pwFmtDate(o.date_needed)}</td>
            <td>${priorityBadge(o.priority)}</td>
        </tr>`;
    }

    return `
        <div class="pw-step-header"><h4>Step 1: Review Selected Orders</h4><p class="pw-step-subtitle">Confirm the orders to include in this quote request</p></div>
        <div class="pw-summary-cards">
            <div class="pw-summary-card"><div class="pw-summary-number">${totalItems}</div><div class="pw-summary-label">Total Orders</div></div>
            ${urgentCount > 0 ? `<div class="pw-summary-card pw-summary-urgent"><div class="pw-summary-number">${urgentCount}</div><div class="pw-summary-label">Urgent</div></div>` : ''}
            ${soonestDate ? `<div class="pw-summary-card"><div class="pw-summary-number">${pwFmtDate(soonestDate)}</div><div class="pw-summary-label">Earliest Needed</div></div>` : ''}
        </div>
        <div class="pw-table-wrapper">
            <table class="pw-table">
                <thead><tr><th>ID</th><th>Description</th><th>Building</th><th>Qty</th><th>Date Needed</th><th>Priority</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function buildStep2HTML(suppliers) {
    const supplierOptions = (suppliers || []).filter(s => s.active !== 0)
        .map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('');
    return `
        <div class="pw-step-header"><h4>Step 2: Select Supplier</h4><p class="pw-step-subtitle">Use AI suggestions or pick manually</p></div>
        <div id="aiSuggestionsArea">
            <div class="pw-ai-loading" id="aiLoadingSpinner">${pwSpinner()}<span>Getting AI supplier suggestions…</span></div>
            <div id="aiSuggestionsCards" class="ai-supplier-cards hidden"></div>
            <div id="aiNoSuggestions" class="hidden" style="text-align:center;color:#94a3b8;padding:1rem;">No AI suggestions available for these orders.</div>
        </div>
        <div style="margin-top:1rem;"><button id="btnShowManualSupplier" class="btn btn-secondary btn-sm">🏢 Skip AI and pick manually</button></div>
        <div id="manualSupplierArea" class="hidden" style="margin-top:1rem;">
            <div class="pw-form-group">
                <label class="pw-label">Select Supplier</label>
                <select id="wizardManualSupplier" class="pw-form-control"><option value="">— Choose supplier —</option>${supplierOptions}</select>
            </div>
            <button id="btnConfirmManualSupplier" class="btn btn-primary btn-sm" style="margin-top:0.5rem;">Use This Supplier →</button>
        </div>
        <div id="selectedSupplierConfirm" class="hidden" style="margin-top:1rem;">
            <div class="pw-selected-supplier-card">
                <span class="pw-check-icon">✓</span>
                <div><strong id="selectedSupplierNameDisplay"></strong><div id="selectedSupplierContactDisplay" style="font-size:0.8rem;color:#94a3b8;margin-top:0.2rem;"></div></div>
                <button id="btnChangeSupplier" class="btn btn-secondary btn-sm" style="margin-left:auto;">Change</button>
            </div>
        </div>
    `;
}

function buildStep3HTML() {
    const defaultValidUntil = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })();
    return `
        <div class="pw-step-header"><h4>Step 3: Confirm &amp; Create Quote</h4><p class="pw-step-subtitle">Review details and create the quote request</p></div>
        <div id="step3Summary" class="pw-confirm-summary"></div>
        <div class="pw-form-row" style="margin-top:1.25rem;">
            <div class="pw-form-group"><label class="pw-label">Currency</label>
                <select id="wizardCurrency" class="pw-form-control"><option value="EUR">EUR</option><option value="BGN">BGN</option><option value="USD">USD</option><option value="GBP">GBP</option></select>
            </div>
            <div class="pw-form-group"><label class="pw-label">Valid Until</label>
                <input type="date" id="wizardValidUntil" class="pw-form-control" value="${defaultValidUntil}">
            </div>
        </div>
        <div class="pw-form-group"><label class="pw-label">Internal Notes</label>
            <textarea id="wizardNotes" class="pw-form-control" rows="2" placeholder="Notes for procurement team…"></textarea>
        </div>
    `;
}

function showWizardStep(step) {
    PW.wizardState.step = step;
    document.querySelectorAll('#pwWizardOverlay .pw-step-dot').forEach(dot => {
        const s = parseInt(dot.dataset.step);
        dot.classList.remove('active', 'done');
        if (s < step) dot.classList.add('done');
        else if (s === step) dot.classList.add('active');
    });
    for (let i = 1; i <= 3; i++) {
        const el = document.getElementById('wizardStep' + i);
        if (el) el.classList.toggle('hidden', i !== step);
    }
    const btnBack = document.getElementById('wizardBtnBack');
    const btnNext = document.getElementById('wizardBtnNext');
    const btnCreate = document.getElementById('wizardBtnCreate');
    if (btnBack) btnBack.classList.toggle('hidden', step === 1);
    if (btnNext) btnNext.classList.toggle('hidden', step === 3);
    if (btnCreate) btnCreate.classList.toggle('hidden', step !== 3);
    if (step === 2) { if (btnNext) btnNext.textContent = 'Confirm Details →'; loadAISuggestionsForWizard(); }
    else if (step === 1) { if (btnNext) btnNext.textContent = 'Review Suppliers →'; }
    else if (step === 3) { populateStep3Summary(); }
}

function bindWizardStep1(orders) {
    const btnNext = document.getElementById('wizardBtnNext');
    const btnBack = document.getElementById('wizardBtnBack');
    const btnCreate = document.getElementById('wizardBtnCreate');
    if (btnNext) {
        btnNext.addEventListener('click', () => {
            const step = PW.wizardState.step;
            if (step === 1) { showWizardStep(2); }
            else if (step === 2) {
                if (!PW.wizardState.selectedSupplierId) { showToast('Please select a supplier before continuing', 'warning'); return; }
                showWizardStep(3);
            }
        });
    }
    if (btnBack) btnBack.addEventListener('click', () => showWizardStep(Math.max(1, PW.wizardState.step - 1)));
    if (btnCreate) btnCreate.addEventListener('click', executeCreateQuote);
    const btnShowManual = document.getElementById('btnShowManualSupplier');
    if (btnShowManual) btnShowManual.addEventListener('click', () => { const area = document.getElementById('manualSupplierArea'); if (area) area.classList.remove('hidden'); });
    const btnConfirmManual = document.getElementById('btnConfirmManualSupplier');
    if (btnConfirmManual) {
        btnConfirmManual.addEventListener('click', () => {
            const sel = document.getElementById('wizardManualSupplier');
            if (!sel || !sel.value) { showToast('Please choose a supplier', 'warning'); return; }
            selectWizardSupplier(parseInt(sel.value), sel.options[sel.selectedIndex].text, null, null);
        });
    }
}

async function loadAISuggestionsForWizard() {
    const spinner = document.getElementById('aiLoadingSpinner');
    const cards = document.getElementById('aiSuggestionsCards');
    const noSugg = document.getElementById('aiNoSuggestions');
    if (spinner) spinner.classList.remove('hidden');
    if (cards) cards.classList.add('hidden');
    if (noSugg) noSugg.classList.add('hidden');
    try {
        const suggestions = await getAISuggestionsForOrders(PW.wizardState.selectedOrderIds);
        PW.wizardState.aiSuggestions = suggestions;
        if (spinner) spinner.classList.add('hidden');
        if (!suggestions || !suggestions.length) { if (noSugg) noSugg.classList.remove('hidden'); return; }
        if (cards) {
            cards.innerHTML = renderAISuggestionCards(suggestions);
            cards.classList.remove('hidden');
            cards.querySelectorAll('.btn-select-ai-supplier').forEach(btn => {
                btn.addEventListener('click', () => selectWizardSupplier(parseInt(btn.dataset.supplierId), btn.dataset.supplierName, btn.dataset.supplierContact || '', btn.dataset.supplierEmail || ''));
            });
        }
    } catch (err) {
        console.error('loadAISuggestionsForWizard error:', err);
        if (spinner) spinner.classList.add('hidden');
        if (noSugg) noSugg.classList.remove('hidden');
    }
}

function renderAISuggestionCards(suggestions) {
    return suggestions.map(s => `
        <div class="ai-supplier-card">
            <div class="ai-card-header"><div class="ai-supplier-name">${escHtml(s.name)}</div><div class="ai-score-label">${Math.round((s.score || 0.7) * 100)}% match</div></div>
            <div class="supplier-score-bar"><div class="supplier-score-fill" style="width:${Math.round((s.score || 0.7) * 100)}%"></div></div>
            ${s.reasons && s.reasons.length ? `<ul class="ai-reasons-list">${s.reasons.slice(0, 3).map(r => `<li>${escHtml(r)}</li>`).join('')}</ul>` : ''}
            ${s.email ? `<div class="ai-contact"><span>📧</span> ${escHtml(s.email)}</div>` : ''}
            ${s.contact_person ? `<div class="ai-contact"><span>👤</span> ${escHtml(s.contact_person)}</div>` : ''}
            <button class="btn btn-primary btn-sm btn-select-ai-supplier" style="margin-top:0.75rem;width:100%;"
                data-supplier-id="${s.id || s.supplier_id}" data-supplier-name="${escHtml(s.name)}"
                data-supplier-contact="${escHtml(s.contact_person || '')}" data-supplier-email="${escHtml(s.email || '')}">
                Select This Supplier
            </button>
        </div>
    `).join('');
}

function selectWizardSupplier(id, name, contact, email) {
    PW.wizardState.selectedSupplierId = id;
    PW.wizardState.selectedSupplierName = name;
    const confirm = document.getElementById('selectedSupplierConfirm');
    const nameDisplay = document.getElementById('selectedSupplierNameDisplay');
    const contactDisplay = document.getElementById('selectedSupplierContactDisplay');
    const manualArea = document.getElementById('manualSupplierArea');
    const aiCards = document.getElementById('aiSuggestionsCards');
    if (nameDisplay) nameDisplay.textContent = name;
    if (contactDisplay) contactDisplay.textContent = [contact, email].filter(Boolean).join(' · ');
    if (confirm) confirm.classList.remove('hidden');
    if (manualArea) manualArea.classList.add('hidden');
    if (aiCards) {
        aiCards.querySelectorAll('.ai-supplier-card').forEach(card => {
            const btn = card.querySelector('.btn-select-ai-supplier');
            if (btn && parseInt(btn.dataset.supplierId) === id) { card.classList.add('ai-card-selected'); btn.textContent = '✓ Selected'; btn.disabled = true; }
            else { card.style.opacity = '0.5'; }
        });
    }
    const btnChange = document.getElementById('btnChangeSupplier');
    if (btnChange) {
        btnChange.onclick = () => {
            PW.wizardState.selectedSupplierId = null;
            if (confirm) confirm.classList.add('hidden');
            if (aiCards) { aiCards.querySelectorAll('.ai-supplier-card').forEach(card => { card.classList.remove('ai-card-selected'); card.style.opacity = ''; const btn = card.querySelector('.btn-select-ai-supplier'); if (btn) { btn.textContent = 'Select This Supplier'; btn.disabled = false; } }); }
        };
    }
    showToast('Supplier "' + name + '" selected', 'success');
}

function populateStep3Summary() {
    const el = document.getElementById('step3Summary');
    if (!el) return;
    const ws = PW.wizardState;
    el.innerHTML = `<div class="pw-confirm-grid"><div class="pw-confirm-item"><div class="pw-confirm-label">Supplier</div><div class="pw-confirm-value" style="color:#06b6d4;font-weight:600;">${escHtml(ws.selectedSupplierName)}</div></div><div class="pw-confirm-item"><div class="pw-confirm-label">Orders</div><div class="pw-confirm-value">${ws.selectedOrderIds.length} order(s) selected</div></div></div>`;
}

async function executeCreateQuote() {
    const ws = PW.wizardState;
    if (!ws.selectedSupplierId) { showToast('No supplier selected', 'error'); return; }
    const currency = document.getElementById('wizardCurrency')?.value || 'EUR';
    const validUntil = document.getElementById('wizardValidUntil')?.value || null;
    const notes = document.getElementById('wizardNotes')?.value || null;
    const btnCreate = document.getElementById('wizardBtnCreate');
    if (btnCreate) { btnCreate.disabled = true; btnCreate.innerHTML = pwSpinner() + ' Creating…'; }
    try {
        const body = { supplier_id: ws.selectedSupplierId, order_ids: ws.selectedOrderIds, notes, currency, valid_until: validUntil };
        const res = await pwApiPost('/quotes', body);
        if (res.success) {
            closeEnhancedQuoteModal();
            if (typeof selectedOrderIds !== 'undefined') selectedOrderIds.clear();
            if (typeof updateSelectionUi === 'function') updateSelectionUi();
            if (typeof loadOrders === 'function') loadOrders();
            if (typeof loadQuotes === 'function') loadQuotes();
            showToast('Quote ' + (res.quoteNumber || '') + ' created successfully', 'success');
            // Refresh dashboard pipeline if active
            if (PW.dashboard.initialized) {
                loadOrdersPipeline();
                loadProcurementKPIs();
            }
            if (res.quoteId) setTimeout(() => {
                if (PW.dashboard.initialized) selectQuoteInDashboard(res.quoteId);
                else openQuoteLifecyclePanel(res.quoteId);
            }, 400);
        } else {
            showToast('Failed to create quote: ' + (res.message || 'Unknown error'), 'error');
            if (btnCreate) { btnCreate.disabled = false; btnCreate.textContent = '✓ Create Quote'; }
        }
    } catch (err) {
        console.error('executeCreateQuote error:', err);
        showToast('Network error creating quote', 'error');
        if (btnCreate) { btnCreate.disabled = false; btnCreate.textContent = '✓ Create Quote'; }
    }
}

// ============================================================
// D. AI SUPPLIER SUGGESTIONS
// ============================================================
async function getAISuggestionsForOrders(orderIds) {
    if (!orderIds || !orderIds.length) return [];
    try {
        // Call the real per-order endpoint for each order, then merge results
        const perOrderResults = await Promise.all(
            orderIds.map(id => pwApiGet(`/api/suppliers/suggestions/${id}`).catch(() => null))
        );
        // Collect all unique supplier suggestions by supplier_id
        const seen = new Set();
        const merged = [];
        for (const res of perOrderResults) {
            if (!res || !res.suggestions) continue;
            for (const s of res.suggestions) {
                const key = s.supplier_id || s.id || s.name;
                if (!seen.has(key)) {
                    seen.add(key);
                    merged.push(s);
                }
            }
        }
        return merged.slice(0, 3);
    } catch (err) { console.error('getAISuggestionsForOrders error:', err); return []; }
}

// ============================================================
// B. QUOTE LIFECYCLE PANEL (full-screen slide-in, preserved)
// ============================================================
async function openQuoteLifecyclePanel(quoteId) {
    if (!quoteId) return;
    const existing = document.getElementById('lifecyclePanel');
    if (existing) existing.remove();
    PW.currentQuoteId = quoteId;
    PW.panelOpen = true;
    const panel = document.createElement('div');
    panel.id = 'lifecyclePanel';
    panel.className = 'lifecycle-panel';
    panel.innerHTML = `
        <div class="lifecycle-panel-header">
            <div><h3 class="lifecycle-panel-title">🚀 Procurement Workspace</h3><div id="lcPanelSubtitle" class="lifecycle-panel-subtitle">Loading…</div></div>
            <button class="pw-close-btn" id="btnCloseLifecycle">✕</button>
        </div>
        <div class="lifecycle-panel-body" id="lifecyclePanelBody">
            <div style="padding:2rem;text-align:center;">${pwSpinner()}<p style="margin-top:1rem;color:#94a3b8;">Loading lifecycle data…</p></div>
        </div>`;
    document.body.appendChild(panel);
    document.getElementById('btnCloseLifecycle').addEventListener('click', closeLifecyclePanel);
    const backdrop = document.createElement('div');
    backdrop.id = 'lifecycleBackdrop';
    backdrop.className = 'lifecycle-backdrop';
    backdrop.addEventListener('click', closeLifecyclePanel);
    document.body.insertBefore(backdrop, panel);
    requestAnimationFrame(() => { panel.classList.add('panel-open'); backdrop.classList.add('backdrop-visible'); });
    await loadAndRenderLifecycle(quoteId);
}

function closeLifecyclePanel() {
    const panel = document.getElementById('lifecyclePanel');
    const backdrop = document.getElementById('lifecycleBackdrop');
    if (panel) { panel.classList.remove('panel-open'); panel.classList.add('panel-closing'); setTimeout(() => panel.remove(), 350); }
    if (backdrop) { backdrop.classList.remove('backdrop-visible'); setTimeout(() => backdrop.remove(), 350); }
    PW.panelOpen = false;
    PW.currentQuoteId = null;
}

async function loadAndRenderLifecycle(quoteId) {
    try {
        const res = await pwApiGet(`/procurement/lifecycle/quote/${quoteId}`);
        if (!res.success) { showLifecycleError(res.message || 'Failed to load lifecycle'); return; }
        PW.currentLifecycle = res.lifecycle;
        renderLifecyclePanel(res.lifecycle);
    } catch (err) { console.error('loadAndRenderLifecycle error:', err); showLifecycleError('Network error loading lifecycle'); }
}

function showLifecycleError(msg) {
    const body = document.getElementById('lifecyclePanelBody');
    if (body) body.innerHTML = `<div class="pw-error-state"><div class="pw-error-icon">⚠</div><p>${escHtml(msg)}</p></div>`;
}

function renderLifecyclePanel(lc) {
    const { quote, items, responses, purchase_orders, invoices, sendLog } = lc;
    if (!quote) return;
    const subtitle = document.getElementById('lcPanelSubtitle');
    if (subtitle) subtitle.innerHTML = `${escHtml(quote.quote_number)} · ${escHtml(quote.supplier_name || '—')} · ${pwStatusBadge(quote.status, 'quote')}`;
    const body = document.getElementById('lifecyclePanelBody');
    if (!body) return;
    const stage = determineCurrentStage(quote, responses, purchase_orders, invoices);
    body.innerHTML = `<div class="lifecycle-timeline">${renderStage1(quote, items, sendLog, stage)}${renderStage2(quote, items, responses, stage)}${renderStage3(quote, stage)}${renderStage4(quote, purchase_orders, stage)}${renderStage5(quote, purchase_orders, invoices, stage)}</div>`;
    bindStage2Events(quote, items);
    bindStage3Events(quote);
    bindStage4Events(quote, purchase_orders);
    bindStage5Events(quote, purchase_orders, invoices);
}

function determineCurrentStage(quote, responses, pos, invoices) {
    if (invoices && invoices.length) return 5;
    if (pos && pos.length) { const po = pos[0]; if (po.status === 'delivered') return 5; return 4; }
    if (quote.status === 'Approved' || quote.status === 'Under Approval') return 3;
    if (responses && responses.length) return 2;
    if (quote.status === 'Sent to Supplier' || quote.status === 'Received') return 2;
    return 1;
}

function stageClass(stageNum, currentStage) {
    if (stageNum < currentStage) return 'stage-complete';
    if (stageNum === currentStage) return 'stage-active';
    return 'stage-pending';
}

function stageIcon(stageNum, currentStage) {
    if (stageNum < currentStage) return '<span class="stage-status-icon stage-check">✓</span>';
    if (stageNum === currentStage) return '<span class="stage-status-icon stage-pulse"></span>';
    return '<span class="stage-status-icon stage-lock">🔒</span>';
}

function renderStage1(quote, items, sendLog, currentStage) {
    const cls = stageClass(1, currentStage);
    const icon = stageIcon(1, currentStage);
    const logRows = (sendLog || []).map(l => `<tr><td>${pwFmtDateTime(l.sent_at)}</td><td>${escHtml(l.sent_by_name || '—')}</td><td>${escHtml(l.recipient_email || '—')}</td></tr>`).join('') || '<tr><td colspan="3" style="color:#64748b;text-align:center;">No send history</td></tr>';
    const itemRows = (items || []).map(item => `<tr><td>#${item.order_id}</td><td title="${escHtml(item.item_description)}">${escHtml((item.item_description || '').substring(0, 40))}${(item.item_description || '').length > 40 ? '…' : ''}</td><td>${escHtml(item.building || '—')}</td><td>${item.quantity || item.order_qty || 1}</td><td>${item.files && item.files.length ? `📎 ${item.files.length}` : '—'}</td></tr>`).join('') || '<tr><td colspan="5" style="color:#64748b;text-align:center;">No items</td></tr>';

    // Document chips for Stage 1
    const stage1DocChips = renderStageDocChips(1, quote);

    return `<div class="lifecycle-stage ${cls}" id="stage1">
        <div class="stage-header">${icon}<div class="stage-title-area"><div class="stage-title">📧 Quote Request Sent</div><div class="stage-meta">${escHtml(quote.quote_number)} · ${escHtml(quote.supplier_name || '—')} · Created ${pwFmtDate(quote.created_at)}</div></div>
        ${currentStage >= 1 && typeof openQuoteSendPanel === 'function' ? `<button class="btn btn-secondary btn-sm" onclick="openQuoteSendPanel(${quote.id})" style="margin-left:auto;white-space:nowrap;">📧 Resend Email</button>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="openUploadDialogForStage(1, [])" style="margin-left:0.5rem;white-space:nowrap;">📎 Attach RFQ</button></div>
        <div class="stage-body">
            ${stage1DocChips}
            <div class="pw-subsection-title">Send History</div>
            <div class="pw-table-wrapper" style="max-height:140px;"><table class="pw-table"><thead><tr><th>Sent At</th><th>By</th><th>Recipient</th></tr></thead><tbody>${logRows}</tbody></table></div>
            <div class="pw-subsection-title" style="margin-top:1rem;">Quote Items</div>
            <div class="pw-table-wrapper"><table class="pw-table"><thead><tr><th>Order</th><th>Description</th><th>Building</th><th>Qty</th><th>Files</th></tr></thead><tbody>${itemRows}</tbody></table></div>
        </div></div>`;
}

function renderStage2(quote, items, responses, currentStage) {
    const cls = stageClass(2, currentStage);
    const icon = stageIcon(2, currentStage);
    const responseSummary = (responses || []).length > 0 ? `${responses.length} response(s) recorded` : 'Awaiting supplier response';
    const existingResponses = (responses || []).map(r => `<div class="pw-response-card" style="margin-bottom:0.75rem;" data-response-id="${r.id}"><div class="pw-response-header"><span>${escHtml(r.item_description || 'All items')}</span>${pwStatusBadge(r.status, 'response')}${pwStatusBadge(r.availability, 'availability')}<span class="pw-muted">${pwFmtDateTime(r.responded_at)}</span><button class="btn btn-secondary btn-sm pw-edit-response-btn" style="margin-left:auto;padding:0.2rem 0.6rem;font-size:0.75rem;" data-response-id="${r.id}">✏️ Edit</button></div><div class="pw-response-details">${r.unit_price ? `<div><span class="pw-detail-label">Unit Price:</span> <strong>${pwFmtPrice(r.unit_price, r.currency)}</strong></div>` : ''}${r.total_price ? `<div><span class="pw-detail-label">Total:</span> <strong>${pwFmtPrice(r.total_price, r.currency)}</strong></div>` : ''}${r.promised_delivery_date ? `<div><span class="pw-detail-label">Promised Delivery:</span> ${pwFmtDate(r.promised_delivery_date)}</div>` : ''}${r.lead_time_days ? `<div><span class="pw-detail-label">Lead Time:</span> ${r.lead_time_days} days</div>` : ''}${r.has_alternative ? `<div style="margin-top:0.5rem;padding:0.5rem;background:#1e293b;border-radius:0.375rem;border-left:3px solid #f59e0b;"><strong>Alternative:</strong> ${escHtml(r.alternative_description || '')} ${r.alternative_unit_price ? '— ' + pwFmtPrice(r.alternative_unit_price, r.currency) : ''}</div>` : ''}${r.supplier_notes ? `<div><span class="pw-detail-label">Supplier Notes:</span> ${escHtml(r.supplier_notes)}</div>` : ''}${r.internal_notes ? `<div><span class="pw-detail-label">Internal Notes:</span> ${escHtml(r.internal_notes)}</div>` : ''}${r.response_document_id ? `<div style="margin-top:0.4rem;"><a class="pw-pdf-badge" href="/api/documents/${r.response_document_id}/download" target="_blank" style="display:inline-flex;align-items:center;gap:0.3rem;padding:0.2rem 0.6rem;background:#1e3a5f;border-radius:0.375rem;font-size:0.75rem;color:#60a5fa;text-decoration:none;">📄 PDF</a></div>` : ''}<div style="font-size:0.75rem;color:#64748b;margin-top:0.3rem;">Recorded by ${escHtml(r.recorded_by_name || '—')}</div><div id="pw-edit-form-${r.id}" class="hidden" style="margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid rgba(148,163,184,0.2);"></div></div></div>`).join('');
    const itemOptions = (items || []).map(item => `<option value="${item.order_id}">#${item.order_id} — ${escHtml((item.item_description || '').substring(0, 35))}</option>`).join('');

    // Document chips for Stage 2
    const stage2DocChips = renderStageDocChips(2, quote);

    return `<div class="lifecycle-stage ${cls}" id="stage2">
        <div class="stage-header">${icon}<div class="stage-title-area"><div class="stage-title">💬 Supplier Response</div><div class="stage-meta">${responseSummary}</div></div>
        ${currentStage >= 1 ? `<button class="btn btn-secondary btn-sm" id="btnMarkAllReceived" style="margin-left:auto;white-space:nowrap;">✅ Mark All Received</button>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="openUploadDialogForStage(2, [])" style="margin-left:0.5rem;white-space:nowrap;">📎 Attach Proforma</button></div>
        <div class="stage-body">
            ${stage2DocChips}
            ${existingResponses ? `<div class="pw-subsection-title">Recorded Responses</div>${existingResponses}` : ''}
            <div class="pw-subsection-title" style="margin-top:1rem;">Record New Response</div>
            <div class="response-form" id="responseFormContainer">
                <div class="pw-form-group"><label class="pw-label">For Order Item (optional)</label><select id="respOrderId" class="pw-form-control"><option value="">— All items in quote —</option>${itemOptions}</select></div>
                <div class="pw-form-row">
                    <div class="pw-form-group"><label class="pw-label">Unit Price</label><input type="number" id="respUnitPrice" class="pw-form-control" step="0.0001" placeholder="0.0000"></div>
                    <div class="pw-form-group"><label class="pw-label">Total Price</label><input type="number" id="respTotalPrice" class="pw-form-control" step="0.01" placeholder="0.00"></div>
                    <div class="pw-form-group"><label class="pw-label">Currency</label><select id="respCurrency" class="pw-form-control"><option value="EUR">EUR</option><option value="BGN">BGN</option><option value="USD">USD</option><option value="GBP">GBP</option></select></div>
                </div>
                <div class="pw-form-row">
                    <div class="pw-form-group"><label class="pw-label">Promised Delivery Date</label><input type="date" id="respDeliveryDate" class="pw-form-control"></div>
                    <div class="pw-form-group"><label class="pw-label">Lead Time (days)</label><input type="number" id="respLeadTime" class="pw-form-control" placeholder="e.g. 14"></div>
                    <div class="pw-form-group"><label class="pw-label">MOQ</label><input type="number" id="respMoq" class="pw-form-control" placeholder="Min order qty"></div>
                </div>
                <div class="pw-form-row">
                    <div class="pw-form-group"><label class="pw-label">Availability</label><select id="respAvailability" class="pw-form-control"><option value="in_stock">In Stock</option><option value="available" selected>Available</option><option value="on_order">On Order</option><option value="partial">Partial</option><option value="unavailable">Unavailable</option></select></div>
                    <div class="pw-form-group"><label class="pw-label">Response Status</label><select id="respStatus" class="pw-form-control"><option value="pending">Pending</option><option value="accepted">Accepted</option><option value="negotiating">Negotiating</option><option value="countered">Countered</option><option value="rejected">Rejected</option></select></div>
                </div>
                <div class="pw-form-group"><label class="pw-label"><input type="checkbox" id="respHasAlt"> Has Alternative Product</label></div>
                <div id="respAltFields" class="hidden">
                    <div class="pw-form-group"><label class="pw-label">Alternative Description</label><textarea id="respAltDesc" class="pw-form-control" rows="2" placeholder="Describe the alternative…"></textarea></div>
                    <div class="pw-form-group"><label class="pw-label">Alternative Unit Price</label><input type="number" id="respAltPrice" class="pw-form-control" step="0.0001" placeholder="0.0000"></div>
                </div>
                <div class="pw-form-group"><label class="pw-label">Supplier Notes</label><textarea id="respSupplierNotes" class="pw-form-control" rows="2" placeholder="Notes from the supplier…"></textarea></div>
                <div class="pw-form-group"><label class="pw-label">Internal Notes</label><textarea id="respInternalNotes" class="pw-form-control" rows="2" placeholder="Internal procurement notes…"></textarea></div>
                <div class="pw-form-group"><label class="pw-label">📎 Attach Quote PDF (optional)</label><input type="file" id="respPdfFile" class="pw-form-control" accept=".pdf,.PDF"><div style="font-size:0.75rem;color:#64748b;margin-top:0.25rem;">PDF will be stored and linked to this response</div></div>
                <div class="pw-form-actions"><button class="btn btn-primary" id="btnSaveResponse">💾 Save Response</button></div>
            </div>
        </div></div>`;
}

function renderStage3(quote, currentStage) {
    const cls = stageClass(3, currentStage);
    const icon = stageIcon(3, currentStage);
    const isApproved = quote.status === 'Approved';
    const isUnderApproval = quote.status === 'Under Approval';
    const isSubmittable = ['Draft', 'Received'].includes(quote.status);
    let approvalContent = '';
    if (isApproved) approvalContent = `<div class="pw-success-notice"><span>✓</span> Quote has been approved</div>`;
    else if (isUnderApproval) approvalContent = `<div class="pw-info-notice"><span>⏳</span> Quote is under review by manager</div>`;
    else if (isSubmittable) approvalContent = `<p class="pw-muted" style="margin-bottom:0.75rem;">Submit this quote for manager approval before creating a purchase order.</p><button class="btn btn-primary" id="btnSubmitApprovalFromLC">📋 Submit for Approval</button>`;
    else approvalContent = `<p class="pw-muted">Current status: ${escHtml(quote.status)}</p>`;
    const totalDisplay = quote.total_amount ? `<div class="pw-totals-row"><span class="pw-detail-label">Quote Total</span> <strong>${pwFmtPrice(quote.total_amount, quote.currency)}</strong></div>` : '';

    const stage3DocChips = renderStageDocChips(3, quote);

    return `<div class="lifecycle-stage ${cls}" id="stage3">
        <div class="stage-header">${icon}<div class="stage-title-area"><div class="stage-title">✅ Approval</div><div class="stage-meta">${escHtml(quote.status)}</div></div>
        <button class="btn btn-secondary btn-sm" onclick="openUploadDialogForStage(3, [])" style="margin-left:auto;white-space:nowrap;">📎 Attach Doc</button></div>
        <div class="stage-body">${stage3DocChips}${totalDisplay}${approvalContent}</div></div>`;
}

function renderStage4(quote, pos, currentStage) {
    const cls = stageClass(4, currentStage);
    const icon = stageIcon(4, currentStage);
    const po = pos && pos.length ? pos[0] : null;
    const canCreatePO = quote.status === 'Approved';
    let poContent = '';
    if (po) {
        poContent = `<div class="po-panel"><div class="pw-confirm-grid"><div class="pw-confirm-item"><div class="pw-confirm-label">PO Number</div><div class="pw-confirm-value" style="color:#06b6d4;font-weight:600;">${escHtml(po.po_number)}</div></div><div class="pw-confirm-item"><div class="pw-confirm-label">Status</div><div class="pw-confirm-value">${pwStatusBadge(po.status, 'po')}</div></div><div class="pw-confirm-item"><div class="pw-confirm-label">Total</div><div class="pw-confirm-value">${pwFmtPrice(po.total_amount, po.currency)}</div></div><div class="pw-confirm-item"><div class="pw-confirm-label">Expected Delivery</div><div class="pw-confirm-value">${pwFmtDate(po.expected_delivery_date)}</div></div>${po.actual_delivery_date ? `<div class="pw-confirm-item"><div class="pw-confirm-label">Actual Delivery</div><div class="pw-confirm-value" style="color:#10b981;">${pwFmtDate(po.actual_delivery_date)}</div></div>` : ''}</div><div class="pw-po-status-actions">${po.status === 'draft' ? `<button class="btn btn-primary btn-sm" data-po-id="${po.id}" data-new-status="sent" id="btnMarkPOSent">📤 Mark as Sent</button>` : ''}${po.status === 'sent' ? `<button class="btn btn-secondary btn-sm" data-po-id="${po.id}" data-new-status="confirmed" id="btnMarkPOConfirmed">✓ Mark Confirmed</button>` : ''}${['sent','confirmed','partially_delivered'].includes(po.status) ? `<button class="btn btn-secondary btn-sm" data-po-id="${po.id}" id="btnMarkPartialDelivery">📦 Partial Delivery</button><button class="btn btn-primary btn-sm" data-po-id="${po.id}" id="btnMarkDelivered">🚚 Mark Delivered</button>` : ''}</div></div>`;
    } else if (canCreatePO) {
        poContent = `<div class="po-panel"><p class="pw-muted" style="margin-bottom:0.75rem;">Create a purchase order for this approved quote. Items will be auto-populated from quote responses.</p><div class="pw-form-group"><label class="pw-label">Delivery Address</label><textarea id="poDeliveryAddress" class="pw-form-control" rows="2" placeholder="Delivery address…"></textarea></div><div class="pw-form-row"><div class="pw-form-group"><label class="pw-label">Payment Terms</label><input type="text" id="poPaymentTerms" class="pw-form-control" placeholder="e.g. Net 30"></div><div class="pw-form-group"><label class="pw-label">Expected Delivery</label><input type="date" id="poExpectedDelivery" class="pw-form-control"></div></div><div class="pw-form-group"><label class="pw-label">Notes</label><textarea id="poNotes" class="pw-form-control" rows="2" placeholder="PO notes…"></textarea></div><button class="btn btn-primary" id="btnCreatePO">📦 Create Purchase Order</button></div>`;
    } else {
        poContent = `<p class="pw-muted">Quote must be approved before creating a purchase order.</p>`;
    }

    const stage4DocChips = renderStageDocChips(4, quote);

    return `<div class="lifecycle-stage ${cls}" id="stage4">
        <div class="stage-header">${icon}<div class="stage-title-area"><div class="stage-title">📦 Purchase Order</div><div class="stage-meta">${po ? `PO: ${po.po_number} · ${po.status}` : 'Not yet created'}</div></div>
        <button class="btn btn-secondary btn-sm" onclick="openUploadDialogForStage(4, [])" style="margin-left:auto;white-space:nowrap;">📎 Attach PO Doc</button></div>
        <div class="stage-body">${stage4DocChips}${poContent}</div></div>`;
}

function renderStage5(quote, pos, invoices, currentStage) {
    const cls = stageClass(5, currentStage);
    const icon = stageIcon(5, currentStage);
    const po = pos && pos.length ? pos[0] : null;
    const invoiceRows = (invoices || []).map(inv => `<div class="pw-invoice-card" style="margin-bottom:0.75rem;"><div class="pw-response-header"><strong>${escHtml(inv.invoice_number || 'No invoice #')}</strong>${pwStatusBadge(inv.status, 'invoice')}<span class="pw-muted">${pwFmtDateTime(inv.received_at)}</span></div><div class="pw-response-details">${inv.invoice_date ? `<div><span class="pw-detail-label">Invoice Date:</span> ${pwFmtDate(inv.invoice_date)}</div>` : ''}${inv.due_date ? `<div><span class="pw-detail-label">Due Date:</span> ${pwFmtDate(inv.due_date)}</div>` : ''}<div><span class="pw-detail-label">Amount:</span> ${pwFmtPrice(inv.amount, inv.currency)} + VAT: ${pwFmtPrice(inv.vat_amount, inv.currency)} = <strong>${pwFmtPrice(inv.total_amount, inv.currency)}</strong></div>${inv.status !== 'sent_to_accounting' && inv.status !== 'booked' && inv.status !== 'paid' ? `<button class="btn btn-secondary btn-sm" style="margin-top:0.5rem;" data-inv-id="${inv.id}" id="btnSendToAccounting_${inv.id}">📤 Send to Accounting</button>` : ''}${inv.status === 'sent_to_accounting' || inv.status === 'booked' ? `<div class="pw-form-row" style="margin-top:0.5rem;"><div class="pw-form-group"><label class="pw-label">Booking Reference</label><input type="text" class="pw-form-control pw-booking-ref" data-inv-id="${inv.id}" value="${escHtml(inv.booking_reference || '')}" placeholder="Accounting ref…"></div><div style="align-self:flex-end;"><button class="btn btn-secondary btn-sm pw-save-booking" data-inv-id="${inv.id}">Save Ref</button></div></div>` : ''}${inv.accounting_notes ? `<div><span class="pw-detail-label">Accounting Notes:</span> ${escHtml(inv.accounting_notes)}</div>` : ''}${inv.paid_at ? `<div style="color:#10b981;"><span class="pw-detail-label">Paid:</span> ${pwFmtDateTime(inv.paid_at)}</div>` : ''}</div></div>`).join('');
    const canAddInvoice = po || quote;

    const stage5DocChips = renderStageDocChips(5, quote);

    return `<div class="lifecycle-stage ${cls}" id="stage5">
        <div class="stage-header">${icon}<div class="stage-title-area"><div class="stage-title">🧾 Invoice &amp; Accounting</div><div class="stage-meta">${invoices && invoices.length ? `${invoices.length} invoice(s)` : 'No invoices yet'}</div></div>
        <button class="btn btn-secondary btn-sm" onclick="openUploadDialogForStage(6, [])" style="margin-left:auto;white-space:nowrap;">📎 Attach Invoice</button></div>
        <div class="stage-body invoice-panel">${stage5DocChips}${invoiceRows}${canAddInvoice ? `<div class="pw-subsection-title" style="margin-top:1rem;">Record New Invoice</div><div class="pw-form-row"><div class="pw-form-group"><label class="pw-label">Supplier Invoice #</label><input type="text" id="invNumber" class="pw-form-control" placeholder="Supplier's invoice number"></div><div class="pw-form-group"><label class="pw-label">Invoice Date</label><input type="date" id="invDate" class="pw-form-control"></div><div class="pw-form-group"><label class="pw-label">Due Date</label><input type="date" id="invDueDate" class="pw-form-control"></div></div><div class="pw-form-row"><div class="pw-form-group"><label class="pw-label">Amount (excl. VAT)</label><input type="number" id="invAmount" class="pw-form-control" step="0.01" placeholder="0.00"></div><div class="pw-form-group"><label class="pw-label">VAT Amount</label><input type="number" id="invVat" class="pw-form-control" step="0.01" placeholder="0.00"></div><div class="pw-form-group"><label class="pw-label">Total</label><input type="number" id="invTotal" class="pw-form-control" step="0.01" placeholder="0.00"></div><div class="pw-form-group"><label class="pw-label">Currency</label><select id="invCurrency" class="pw-form-control"><option value="EUR">EUR</option><option value="BGN">BGN</option><option value="USD">USD</option><option value="GBP">GBP</option></select></div></div><div class="pw-form-group"><label class="pw-label">Notes</label><textarea id="invNotes" class="pw-form-control" rows="2" placeholder="Invoice notes…"></textarea></div><button class="btn btn-primary" id="btnRecordInvoice">🧾 Record Invoice</button>` : `<p class="pw-muted">No purchase order linked yet.</p>`}</div></div>`;
}

/**
 * renderStageDocChips — renders required document type icon chips for a stage
 * @param {number} stage
 * @param {Object} quote
 * @returns {string} HTML
 */
function renderStageDocChips(stage, quote) {
    const stageDocTypes = {
        1: [{ type: 'rfq', label: 'RFQ', icon: '📋' }, { type: 'datasheet', label: 'Datasheet', icon: '📄' }],
        2: [{ type: 'proforma_invoice', label: 'Proforma', icon: '💰' }, { type: 'quote_response', label: 'Response', icon: '💬' }],
        3: [{ type: 'approval_doc', label: 'Approval', icon: '✅' }],
        4: [{ type: 'purchase_order', label: 'PO Doc', icon: '📦' }],
        5: [{ type: 'delivery_note', label: 'Delivery Note', icon: '🚢' }, { type: 'packing_list', label: 'Packing List', icon: '📋' }],
        6: [{ type: 'invoice', label: 'Invoice', icon: '🧾' }, { type: 'accounting_doc', label: 'Accounting', icon: '💼' }]
    };
    const types = stageDocTypes[stage] || [];
    if (!types.length) return '';
    const chips = types.map(t => `
        <span class="pw-doc-chip" title="${t.label} — required for this stage">
            <span class="pw-doc-chip-icon">${t.icon}</span>
            <span class="pw-doc-chip-label">${t.label}</span>
        </span>`).join('');
    return `<div class="pw-stage-doc-chips"><span class="pw-stage-doc-label">Required docs:</span>${chips}</div>`;
}

// ============================================================
// PDF UPLOAD HELPER (Feature 6)
// ============================================================
/**
 * Upload a PDF file to /api/documents/upload and link it to a quote response.
 * @param {File} file - The PDF File object
 * @param {number} responseId - The quote_response ID to link
 * @param {number[]} orderIds - Array of order IDs associated (passed to documents upload)
 */
async function pwUploadResponsePdf(file, responseId, orderIds) {
    try {
        const formData = new FormData();
        formData.append('file', file);
        // The documents endpoint requires orderIds as a JSON string
        if (orderIds && orderIds.length) {
            formData.append('orderIds', JSON.stringify(orderIds));
        }
        const token = localStorage.getItem('partpulse_token') || sessionStorage.getItem('partpulse_token') || '';
        const uploadRes = await fetch('/api/documents/upload', {
            method: 'POST',
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            body: formData
        });
        const uploadData = await uploadRes.json();
        if (!uploadData.success || !uploadData.document) {
            showToast('PDF upload failed: ' + (uploadData.message || 'Unknown error'), 'warning');
            return;
        }
        // Link the document to the response
        const linkRes = await pwApiPut(`/procurement/quotes/responses/${responseId}`, {
            response_document_id: uploadData.document.id
        });
        if (!linkRes.success) {
            showToast('PDF uploaded but failed to link to response', 'warning');
        }
    } catch (err) {
        console.error('pwUploadResponsePdf error:', err);
        showToast('PDF upload error', 'warning');
    }
}

// ============================================================
// EVENT BINDERS
// ============================================================
function bindStage2Events(quote, items) {
    const hasAlt = document.getElementById('respHasAlt');
    const altFields = document.getElementById('respAltFields');
    if (hasAlt && altFields) hasAlt.addEventListener('change', () => altFields.classList.toggle('hidden', !hasAlt.checked));
    const unitPriceInput = document.getElementById('respUnitPrice');
    const totalPriceInput = document.getElementById('respTotalPrice');
    const orderSel = document.getElementById('respOrderId');
    if (unitPriceInput && totalPriceInput) {
        unitPriceInput.addEventListener('input', () => {
            const orderId = orderSel ? parseInt(orderSel.value) : null;
            const qty = orderId ? ((items.find(i => i.order_id === orderId) || {}).quantity || 1) : 1;
            const up = parseFloat(unitPriceInput.value);
            if (!isNaN(up)) totalPriceInput.value = (up * qty).toFixed(2);
        });
    }
    const btnSave = document.getElementById('btnSaveResponse');
    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            const orderId = document.getElementById('respOrderId')?.value;
            const body = {
                order_id: orderId ? parseInt(orderId) : null,
                unit_price: parseFloat(document.getElementById('respUnitPrice')?.value) || null,
                total_price: parseFloat(document.getElementById('respTotalPrice')?.value) || null,
                currency: document.getElementById('respCurrency')?.value || 'EUR',
                promised_delivery_date: document.getElementById('respDeliveryDate')?.value || null,
                lead_time_days: parseInt(document.getElementById('respLeadTime')?.value) || null,
                moq: parseInt(document.getElementById('respMoq')?.value) || null,
                availability: document.getElementById('respAvailability')?.value || 'available',
                status: document.getElementById('respStatus')?.value || 'pending',
                has_alternative: document.getElementById('respHasAlt')?.checked ? 1 : 0,
                alternative_description: document.getElementById('respAltDesc')?.value || null,
                alternative_unit_price: parseFloat(document.getElementById('respAltPrice')?.value) || null,
                supplier_notes: document.getElementById('respSupplierNotes')?.value || null,
                internal_notes: document.getElementById('respInternalNotes')?.value || null
            };
            btnSave.disabled = true; btnSave.innerHTML = pwSpinner() + ' Saving…';
            try {
                const res = await pwApiPost(`/procurement/quotes/${quote.id}/responses`, body);
                if (res.success) {
                    // Feature 6: PDF upload if file selected
                    const pdfFile = document.getElementById('respPdfFile')?.files?.[0];
                    if (pdfFile && res.responseId) {
                        await pwUploadResponsePdf(pdfFile, res.responseId, orderId ? [parseInt(orderId)] : quote.order_ids || []);
                    }
                    showToast('Response recorded successfully', 'success');
                    // Refresh in dashboard or panel
                    if (PW.dashboard.initialized && PW.dashboard.selectedQuoteId === quote.id) {
                        await selectQuoteInDashboard(quote.id);
                    } else {
                        await loadAndRenderLifecycle(quote.id);
                    }
                } else { showToast('Failed to save response: ' + (res.message || ''), 'error'); btnSave.disabled = false; btnSave.textContent = '💾 Save Response'; }
            } catch (err) { console.error('saveResponse error:', err); showToast('Network error saving response', 'error'); btnSave.disabled = false; btnSave.textContent = '💾 Save Response'; }
        });
    }

    // Feature 5: Edit buttons on existing response cards
    document.querySelectorAll('.pw-edit-response-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const responseId = parseInt(btn.dataset.responseId);
            const card = btn.closest('.pw-response-card');
            const editContainer = card.querySelector(`#pw-edit-form-${responseId}`);
            if (!editContainer) return;
            if (!editContainer.classList.contains('hidden')) {
                editContainer.classList.add('hidden');
                editContainer.innerHTML = '';
                btn.textContent = '✏️ Edit';
                return;
            }
            editContainer.innerHTML = `
                <div style="font-size:0.8rem;font-weight:600;color:#94a3b8;margin-bottom:0.5rem;">Edit Response #${responseId}</div>
                <div class="pw-form-row">
                    <div class="pw-form-group"><label class="pw-label">Unit Price</label><input type="number" id="editRespUnitPrice_${responseId}" class="pw-form-control" step="0.0001" placeholder="0.0000"></div>
                    <div class="pw-form-group"><label class="pw-label">Total Price</label><input type="number" id="editRespTotalPrice_${responseId}" class="pw-form-control" step="0.01" placeholder="0.00"></div>
                    <div class="pw-form-group"><label class="pw-label">Currency</label><select id="editRespCurrency_${responseId}" class="pw-form-control"><option value="EUR">EUR</option><option value="BGN">BGN</option><option value="USD">USD</option><option value="GBP">GBP</option></select></div>
                </div>
                <div class="pw-form-row">
                    <div class="pw-form-group"><label class="pw-label">Promised Delivery</label><input type="date" id="editRespDelivery_${responseId}" class="pw-form-control"></div>
                    <div class="pw-form-group"><label class="pw-label">Lead Time (days)</label><input type="number" id="editRespLeadTime_${responseId}" class="pw-form-control"></div>
                    <div class="pw-form-group"><label class="pw-label">MOQ</label><input type="number" id="editRespMoq_${responseId}" class="pw-form-control"></div>
                </div>
                <div class="pw-form-row">
                    <div class="pw-form-group"><label class="pw-label">Availability</label><select id="editRespAvail_${responseId}" class="pw-form-control"><option value="in_stock">In Stock</option><option value="available">Available</option><option value="on_order">On Order</option><option value="partial">Partial</option><option value="unavailable">Unavailable</option></select></div>
                    <div class="pw-form-group"><label class="pw-label">Status</label><select id="editRespStatus_${responseId}" class="pw-form-control"><option value="pending">Pending</option><option value="accepted">Accepted</option><option value="negotiating">Negotiating</option><option value="countered">Countered</option><option value="rejected">Rejected</option></select></div>
                </div>
                <div class="pw-form-group"><label class="pw-label">Supplier Notes</label><textarea id="editRespSupplierNotes_${responseId}" class="pw-form-control" rows="2"></textarea></div>
                <div class="pw-form-group"><label class="pw-label">Internal Notes</label><textarea id="editRespInternalNotes_${responseId}" class="pw-form-control" rows="2"></textarea></div>
                <div class="pw-form-group"><label class="pw-label">📎 Attach / Replace PDF</label><input type="file" id="editRespPdfFile_${responseId}" class="pw-form-control" accept=".pdf,.PDF"></div>
                <div class="pw-form-actions" style="gap:0.5rem;">
                    <button class="btn btn-primary btn-sm" id="editRespSave_${responseId}">💾 Update</button>
                    <button class="btn btn-secondary btn-sm" id="editRespCancel_${responseId}">Cancel</button>
                </div>
            `;
            editContainer.classList.remove('hidden');
            btn.textContent = '▲ Collapse';

            document.getElementById(`editRespCancel_${responseId}`).addEventListener('click', () => {
                editContainer.classList.add('hidden');
                editContainer.innerHTML = '';
                btn.textContent = '✏️ Edit';
            });

            document.getElementById(`editRespSave_${responseId}`).addEventListener('click', async () => {
                const saveBtn = document.getElementById(`editRespSave_${responseId}`);
                const updateBody = {};
                const upVal = document.getElementById(`editRespUnitPrice_${responseId}`)?.value;
                const tpVal = document.getElementById(`editRespTotalPrice_${responseId}`)?.value;
                const curVal = document.getElementById(`editRespCurrency_${responseId}`)?.value;
                const ddVal = document.getElementById(`editRespDelivery_${responseId}`)?.value;
                const ltVal = document.getElementById(`editRespLeadTime_${responseId}`)?.value;
                const moqVal = document.getElementById(`editRespMoq_${responseId}`)?.value;
                const avVal = document.getElementById(`editRespAvail_${responseId}`)?.value;
                const stVal = document.getElementById(`editRespStatus_${responseId}`)?.value;
                const snVal = document.getElementById(`editRespSupplierNotes_${responseId}`)?.value;
                const inVal = document.getElementById(`editRespInternalNotes_${responseId}`)?.value;
                if (upVal) updateBody.unit_price = parseFloat(upVal);
                if (tpVal) updateBody.total_price = parseFloat(tpVal);
                if (curVal) updateBody.currency = curVal;
                if (ddVal) updateBody.promised_delivery_date = ddVal;
                if (ltVal) updateBody.lead_time_days = parseInt(ltVal);
                if (moqVal) updateBody.moq = parseInt(moqVal);
                if (avVal) updateBody.availability = avVal;
                if (stVal) updateBody.status = stVal;
                if (snVal !== undefined) updateBody.supplier_notes = snVal || null;
                if (inVal !== undefined) updateBody.internal_notes = inVal || null;
                if (!Object.keys(updateBody).length) { showToast('No changes to save', 'info'); return; }
                saveBtn.disabled = true; saveBtn.innerHTML = pwSpinner() + ' Updating…';
                try {
                    const res = await pwApiPut(`/procurement/quotes/responses/${responseId}`, updateBody);
                    if (res.success) {
                        // Feature 6: PDF upload for edit
                        const pdfFile = document.getElementById(`editRespPdfFile_${responseId}`)?.files?.[0];
                        if (pdfFile) {
                            await pwUploadResponsePdf(pdfFile, responseId, []);
                        }
                        showToast('Response updated', 'success');
                        if (PW.dashboard.initialized && PW.dashboard.selectedQuoteId === quote.id) {
                            await selectQuoteInDashboard(quote.id);
                        } else {
                            await loadAndRenderLifecycle(quote.id);
                        }
                    } else { showToast('Update failed: ' + (res.message || ''), 'error'); saveBtn.disabled = false; saveBtn.textContent = '💾 Update'; }
                } catch (err) { console.error('updateResponse error:', err); showToast('Network error', 'error'); saveBtn.disabled = false; saveBtn.textContent = '💾 Update'; }
            });
        });
    });
    const btnMarkAll = document.getElementById('btnMarkAllReceived');
    if (btnMarkAll) {
        btnMarkAll.addEventListener('click', async () => {
            if (!confirm('Mark quote as Received and update all linked orders to "Quote Received"?')) return;
            btnMarkAll.disabled = true;
            try {
                const res = await pwApiPut(`/quotes/${quote.id}`, { status: 'Received' });
                if (res.success) {
                    showToast('Quote marked as Received', 'success');
                    if (PW.dashboard.initialized && PW.dashboard.selectedQuoteId === quote.id) {
                        await selectQuoteInDashboard(quote.id);
                        loadOrdersPipeline();
                        loadProcurementKPIs();
                    } else {
                        await loadAndRenderLifecycle(quote.id);
                    }
                } else { showToast('Failed to update status', 'error'); btnMarkAll.disabled = false; }
            } catch (err) { showToast('Network error', 'error'); btnMarkAll.disabled = false; }
        });
    }
}

function bindStage3Events(quote) {
    const btnSubmit = document.getElementById('btnSubmitApprovalFromLC');
    if (btnSubmit) {
        btnSubmit.addEventListener('click', () => {
            if (typeof openSubmitForApprovalDialog === 'function') { openSubmitForApprovalDialog(quote.id); }
            else {
                if (!confirm('Submit quote for approval?')) return;
                pwApiPut(`/quotes/${quote.id}`, { status: 'Under Approval' }).then(res => {
                    if (res.success) {
                        showToast('Submitted for approval', 'success');
                        if (PW.dashboard.initialized && PW.dashboard.selectedQuoteId === quote.id) {
                            selectQuoteInDashboard(quote.id);
                            loadOrdersPipeline();
                            loadProcurementKPIs();
                        } else {
                            loadAndRenderLifecycle(quote.id);
                        }
                    } else { showToast('Failed to submit: ' + (res.message || ''), 'error'); }
                });
            }
        });
    }
}

function bindStage4Events(quote, pos) {
    const po = pos && pos.length ? pos[0] : null;
    const btnCreatePO = document.getElementById('btnCreatePO');
    if (btnCreatePO) {
        btnCreatePO.addEventListener('click', async () => {
            if (!quote.supplier_id) { showToast('No supplier linked to this quote', 'error'); return; }
            btnCreatePO.disabled = true; btnCreatePO.innerHTML = pwSpinner() + ' Creating PO…';
            try {
                const body = { quote_id: quote.id, supplier_id: quote.supplier_id, currency: quote.currency || 'EUR', delivery_address: document.getElementById('poDeliveryAddress')?.value || null, payment_terms: document.getElementById('poPaymentTerms')?.value || null, expected_delivery_date: document.getElementById('poExpectedDelivery')?.value || null, notes: document.getElementById('poNotes')?.value || null };
                const res = await pwApiPost('/procurement/purchase-orders', body);
                if (res.success) {
                    showToast('Purchase Order ' + res.poNumber + ' created', 'success');
                    if (typeof loadOrders === 'function') loadOrders();
                    if (PW.dashboard.initialized && PW.dashboard.selectedQuoteId === quote.id) {
                        await selectQuoteInDashboard(quote.id);
                        loadOrdersPipeline();
                        loadProcurementKPIs();
                    } else {
                        await loadAndRenderLifecycle(quote.id);
                    }
                } else { showToast('Failed to create PO: ' + (res.message || ''), 'error'); btnCreatePO.disabled = false; btnCreatePO.textContent = '📦 Create Purchase Order'; }
            } catch (err) { console.error('createPO error:', err); showToast('Network error creating PO', 'error'); btnCreatePO.disabled = false; btnCreatePO.textContent = '📦 Create Purchase Order'; }
        });
    }
    if (po) {
        [{ id: 'btnMarkPOSent', status: 'sent', msg: 'Mark PO as Sent?' }, { id: 'btnMarkPOConfirmed', status: 'confirmed', msg: 'Mark PO as Confirmed by supplier?' }, { id: 'btnMarkPartialDelivery', status: 'partially_delivered', msg: 'Mark as Partially Delivered?' }].forEach(({ id, status, msg }) => {
            const btn = document.getElementById(id);
            if (btn) btn.addEventListener('click', async () => {
                if (!confirm(msg)) return; btn.disabled = true;
                try {
                    const res = await pwApiPut(`/procurement/purchase-orders/${po.id}`, { status });
                    if (res.success) {
                        showToast('PO status updated', 'success');
                        if (typeof loadOrders === 'function') loadOrders();
                        if (PW.dashboard.initialized && PW.dashboard.selectedQuoteId === quote.id) {
                            await selectQuoteInDashboard(quote.id);
                            loadOrdersPipeline();
                        } else {
                            await loadAndRenderLifecycle(quote.id);
                        }
                    } else { showToast('Failed: ' + (res.message || ''), 'error'); btn.disabled = false; }
                } catch (err) { showToast('Network error', 'error'); btn.disabled = false; }
            });
        });
        const btnDelivered = document.getElementById('btnMarkDelivered');
        if (btnDelivered) {
            btnDelivered.addEventListener('click', async () => {
                const dateStr = prompt('Enter actual delivery date (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
                if (!dateStr) return; btnDelivered.disabled = true;
                try {
                    const res = await pwApiPut(`/procurement/purchase-orders/${po.id}`, { status: 'delivered', actual_delivery_date: dateStr });
                    if (res.success) {
                        showToast('Delivery confirmed', 'success');
                        if (typeof loadOrders === 'function') loadOrders();
                        if (PW.dashboard.initialized && PW.dashboard.selectedQuoteId === quote.id) {
                            await selectQuoteInDashboard(quote.id);
                            loadOrdersPipeline();
                            loadProcurementKPIs();
                        } else {
                            await loadAndRenderLifecycle(quote.id);
                        }
                    } else { showToast('Failed: ' + (res.message || ''), 'error'); btnDelivered.disabled = false; }
                } catch (err) { showToast('Network error', 'error'); btnDelivered.disabled = false; }
            });
        }
    }
}

function bindStage5Events(quote, pos, invoices) {
    const po = pos && pos.length ? pos[0] : null;
    const btnRecord = document.getElementById('btnRecordInvoice');
    if (btnRecord) {
        btnRecord.addEventListener('click', async () => {
            const body = { po_id: po ? po.id : null, quote_id: quote.id, supplier_id: quote.supplier_id, invoice_number: document.getElementById('invNumber')?.value || null, invoice_date: document.getElementById('invDate')?.value || null, due_date: document.getElementById('invDueDate')?.value || null, currency: document.getElementById('invCurrency')?.value || 'EUR', amount: parseFloat(document.getElementById('invAmount')?.value) || 0, vat_amount: parseFloat(document.getElementById('invVat')?.value) || 0, total_amount: parseFloat(document.getElementById('invTotal')?.value) || 0, notes: document.getElementById('invNotes')?.value || null };
            if (!body.supplier_id) { showToast('No supplier linked to this quote', 'error'); return; }
            btnRecord.disabled = true; btnRecord.innerHTML = pwSpinner() + ' Recording…';
            try {
                const res = await pwApiPost('/procurement/invoices', body);
                if (res.success) {
                    showToast('Invoice recorded successfully', 'success');
                    if (PW.dashboard.initialized && PW.dashboard.selectedQuoteId === quote.id) {
                        await selectQuoteInDashboard(quote.id);
                        loadProcurementKPIs();
                    } else {
                        await loadAndRenderLifecycle(quote.id);
                    }
                } else { showToast('Failed to record invoice: ' + (res.message || ''), 'error'); btnRecord.disabled = false; btnRecord.textContent = '🧾 Record Invoice'; }
            } catch (err) { console.error('recordInvoice error:', err); showToast('Network error recording invoice', 'error'); btnRecord.disabled = false; btnRecord.textContent = '🧾 Record Invoice'; }
        });
    }
    const invAmount = document.getElementById('invAmount');
    const invVat = document.getElementById('invVat');
    const invTotal = document.getElementById('invTotal');
    if (invAmount && invVat && invTotal) { const calc = () => { const a = parseFloat(invAmount.value) || 0; const v = parseFloat(invVat.value) || 0; invTotal.value = (a + v).toFixed(2); }; invAmount.addEventListener('input', calc); invVat.addEventListener('input', calc); }
    if (invoices) {
        invoices.forEach(inv => {
            const btnSendAcc = document.getElementById(`btnSendToAccounting_${inv.id}`);
            if (btnSendAcc) btnSendAcc.addEventListener('click', async () => {
                if (!confirm('Send invoice to accounting?')) return; btnSendAcc.disabled = true;
                try {
                    const res = await pwApiPut(`/procurement/invoices/${inv.id}`, { status: 'sent_to_accounting' });
                    if (res.success) {
                        showToast('Invoice sent to accounting', 'success');
                        if (PW.dashboard.initialized && PW.dashboard.selectedQuoteId === quote.id) {
                            await selectQuoteInDashboard(quote.id);
                        } else {
                            await loadAndRenderLifecycle(quote.id);
                        }
                    } else { showToast('Failed: ' + (res.message || ''), 'error'); btnSendAcc.disabled = false; }
                } catch (err) { showToast('Network error', 'error'); btnSendAcc.disabled = false; }
            });
            const btnSaveRef = document.querySelector(`.pw-save-booking[data-inv-id="${inv.id}"]`);
            if (btnSaveRef) btnSaveRef.addEventListener('click', async () => {
                const refInput = document.querySelector(`.pw-booking-ref[data-inv-id="${inv.id}"]`);
                const ref = refInput ? refInput.value : ''; btnSaveRef.disabled = true;
                try {
                    const res = await pwApiPut(`/procurement/invoices/${inv.id}`, { booking_reference: ref });
                    if (res.success) showToast('Booking reference saved', 'success');
                    else showToast('Failed to save: ' + (res.message || ''), 'error');
                    btnSaveRef.disabled = false;
                } catch (err) { showToast('Network error', 'error'); btnSaveRef.disabled = false; }
            });
        });
    }
}

// ============================================================
// EXPOSE GLOBALS
// ============================================================
window.openEnhancedCreateQuoteModal = openEnhancedCreateQuoteModal;
window.openEnhancedQuoteModal = openEnhancedQuoteModal;
window.closeEnhancedQuoteModal = closeEnhancedQuoteModal;
window.openQuoteLifecyclePanel = openQuoteLifecyclePanel;
window.closeLifecyclePanel = closeLifecyclePanel;
window.renderLifecycleBadge = renderLifecycleBadge;
window.getAISuggestionsForOrders = getAISuggestionsForOrders;
window.showToast = showToast;
window.initProcurementDashboard = initProcurementDashboard;
window.selectQuoteInDashboard = selectQuoteInDashboard;
window.openUploadDialogForStage = openUploadDialogForStage;
window.pwSetDocFilter = pwSetDocFilter;
window.loadOrdersPipeline = loadOrdersPipeline;
window.loadDocumentHub = loadDocumentHub;
window.loadProcurementKPIs = loadProcurementKPIs;

// ============================================================
// INIT
// ============================================================
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (PW.panelOpen) closeLifecyclePanel();
        const wizard = document.getElementById('pwWizardOverlay');
        if (wizard) closeEnhancedQuoteModal();
        const uploadDialog = document.getElementById('pwUploadDialogOverlay');
        if (uploadDialog) uploadDialog.remove();
    }
});

// Hook into switchTab if present to auto-initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    // Patch switchTab to init procurement dashboard
    if (typeof window.switchTab === 'function') {
        const _origSwitchTab = window.switchTab;
        window.switchTab = function(tabId, ...args) {
            _origSwitchTab.call(this, tabId, ...args);
            if (tabId === 'procurementTab' || tabId === 'procurement') {
                initProcurementDashboard();
            }
        };
    }
});
