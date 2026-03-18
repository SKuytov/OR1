// frontend/analytics.js - Financial & Analytics Module
(function () {
    'use strict';

    const COLORS = ['#38bdf8', '#22c55e', '#eab308', '#a78bfa', '#fb923c', '#2dd4bf', '#f472b6', '#ef4444'];

    const STATUS_COLORS = {
        'New': '#3b82f6',
        'Pending': '#eab308',
        'Quote Requested': '#a78bfa',
        'Quote Received': '#8b5cf6',
        'Quote Under Approval': '#fb923c',
        'Approved': '#22c55e',
        'Ordered': '#38bdf8',
        'In Transit': '#2dd4bf',
        'Partially Delivered': '#06b6d4',
        'Delivered': '#16a34a',
        'Cancelled': '#ef4444',
        'On Hold': '#6b7280'
    };

    let currentPeriod = 'all';
    let chartsRegistry = {};
    let initialized = false;
    let customDateFrom = null;
    let customDateTo = null;
    let drillModalListenersAttached = false;
    let lastData = {};
    let currentDrillData = [];
    let drillFilters = { status: '', supplier: '', building: '' };

    function getMonthsParam() {
        switch (currentPeriod) {
            case 'month': return 1;
            case '3months': return 3;
            case '6months': return 6;
            case 'year': return 12;
            default: return null;
        }
    }

    function buildQuery(params) {
        const q = new URLSearchParams();
        if (currentPeriod === 'custom') {
            if (customDateFrom) q.set('dateFrom', customDateFrom);
            if (customDateTo) q.set('dateTo', customDateTo);
        } else {
            const months = getMonthsParam();
            if (months) q.set('months', months);
        }
        if (params) {
            Object.entries(params).forEach(([k, v]) => { if (v != null) q.set(k, v); });
        }
        const str = q.toString();
        return str ? '?' + str : '';
    }

    async function apiFetch(endpoint, params) {
        const url = (typeof API_BASE !== 'undefined' ? API_BASE : '/api') + '/analytics/' + endpoint + buildQuery(params);
        const token = typeof authToken !== 'undefined' ? authToken : localStorage.getItem('token');
        const resp = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!resp.ok) throw new Error('API error: ' + resp.status);
        return resp.json();
    }

    function fmtMoney(val) {
        const n = parseFloat(val);
        if (isNaN(n)) return '0.00 EUR';
        return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';
    }

    function fmtNum(val) {
        const n = parseFloat(val);
        if (isNaN(n)) return '0';
        return n.toLocaleString('de-DE');
    }

    function fmtPct(val) {
        const n = parseFloat(val);
        if (isNaN(n)) return '0%';
        return n.toFixed(1) + '%';
    }

    function formatPeriodLabel(period) {
        const [year, month] = period.split('-');
        const months = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
        return (months[parseInt(month) - 1] || month) + ' ' + year;
    }

    function destroyChart(key) {
        if (chartsRegistry[key]) {
            chartsRegistry[key].destroy();
            delete chartsRegistry[key];
        }
    }

    function destroyAllCharts() {
        Object.keys(chartsRegistry).forEach(destroyChart);
    }

    function getContainer() {
        return document.getElementById('analyticsTabContent');
    }

    function showLoading() {
        const c = getContainer();
        if (!c) return;
        c.innerHTML = '<div class="analytics-loading"><div class="spinner"></div><div>Loading analytics...</div></div>';
    }

    function showError(msg) {
        const c = getContainer();
        if (!c) return;
        c.innerHTML = '<div class="analytics-error"><div>' + (msg || 'Failed to load analytics data.') +
            '</div><button class="retry-btn" onclick="window.AnalyticsModule.refresh()">Retry</button></div>';
    }

    function esc(str) {
        if (!str) return '';
        return str.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));
    }

    function getPeriodLabel() {
        if (currentPeriod === 'month') return 'This Month';
        if (currentPeriod === '3months') return 'Last 3 Months';
        if (currentPeriod === '6months') return 'Last 6 Months';
        if (currentPeriod === 'year') return 'This Year';
        if (currentPeriod === 'custom') return (customDateFrom || '') + ' to ' + (customDateTo || '');
        return 'All Time';
    }

    // ── Drill-Down Modal ──────────────────────────────────────

    async function openDrillDown(type, value, displayLabel) {
        const modal = document.getElementById('analyticsDrillModal');
        const titleEl = document.getElementById('analyticsDrillTitle');
        const summaryEl = document.getElementById('analyticsDrillSummary');
        const bodyEl = document.getElementById('analyticsDrillBody');
        if (!modal) return;

        titleEl.textContent = displayLabel || 'Orders';
        summaryEl.textContent = '';
        bodyEl.innerHTML = '<div class="analytics-loading"><div class="spinner"></div><div>Loading orders...</div></div>';
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        try {
            const q = new URLSearchParams();
            q.set('type', type);
            q.set('value', String(value));
            if (currentPeriod === 'custom') {
                if (customDateFrom) q.set('dateFrom', customDateFrom);
                if (customDateTo) q.set('dateTo', customDateTo);
            } else {
                const months = getMonthsParam();
                if (months) q.set('months', months);
            }
            const token = typeof authToken !== 'undefined' ? authToken : localStorage.getItem('token');
            const base = typeof API_BASE !== 'undefined' ? API_BASE : '/api';
            const resp = await fetch(base + '/analytics/drill-down?' + q.toString(), {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!resp.ok) throw new Error('API error ' + resp.status);
            const data = await resp.json();

            titleEl.textContent = data.title || displayLabel;
            currentDrillData = data.orders;
            drillFilters = { status: '', supplier: '', building: '' };
            renderDrillContent();
        } catch (err) {
            bodyEl.innerHTML = '<div class="analytics-error">Failed to load orders: ' + err.message + '</div>';
        }
    }

    function closeDrillDown() {
        const modal = document.getElementById('analyticsDrillModal');
        if (modal) modal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    function renderDrillTable(orders) {
        if (!orders || orders.length === 0) {
            return '<p style="color:var(--color-text-secondary);padding:2rem;text-align:center;">No orders found for this selection.</p>';
        }

        const statusColors = {
            'Delivered': '#16a34a', 'Cancelled': '#ef4444', 'On Hold': '#6b7280',
            'New': '#3b82f6', 'Ordered': '#38bdf8', 'In Transit': '#2dd4bf',
            'Approved': '#22c55e', 'Pending': '#eab308'
        };
        const priorityColors = {
            'Urgent': 'background:#ef4444;color:#fff',
            'High': 'background:#fb923c;color:#fff',
            'Normal': 'background:#1e293b;color:#9ca3af',
            'Low': 'background:#1e293b;color:#6b7280'
        };

        let html = '<table class="drill-table"><thead><tr>' +
            '<th>#</th><th>Item</th><th>Building</th><th>Cost Center</th>' +
            '<th>Supplier</th><th>Qty</th><th>Unit Price</th>' +
            '<th>Total</th><th>Status</th><th>Priority</th><th>Date</th><th>Requester</th>' +
            '</tr></thead><tbody>';

        orders.forEach(function(o) {
            const sc = statusColors[o.status] || '#6b7280';
            const pc = priorityColors[o.priority] || '';
            const total = parseFloat(o.totalPrice);
            const unit = parseFloat(o.unitPrice);
            html += '<tr>' +
                '<td style="color:var(--color-accent);font-weight:600;">' + o.id + '</td>' +
                '<td class="drill-item-col" title="' + esc(o.itemDescription) + '">' + esc(o.itemDescription) + '</td>' +
                '<td>' + esc(o.building) + '</td>' +
                '<td>' + esc(o.costCenterName) + '</td>' +
                '<td>' + esc(o.supplierName) + '</td>' +
                '<td style="text-align:right;">' + o.quantity + '</td>' +
                '<td style="text-align:right;">' + (unit > 0 ? fmtMoney(unit) : '\u2014') + '</td>' +
                '<td style="text-align:right;color:' + (total > 0 ? 'var(--color-accent)' : 'var(--color-text-secondary)') + ';">' + (total > 0 ? fmtMoney(total) : '\u2014') + '</td>' +
                '<td><span class="drill-status-badge" style="background:' + sc + '22;color:' + sc + ';">' + esc(o.status) + '</span></td>' +
                '<td><span class="drill-priority-badge" style="' + pc + '">' + esc(o.priority) + '</span></td>' +
                '<td style="white-space:nowrap;">' + (o.submissionDate || '') + '</td>' +
                '<td>' + esc(o.requesterName) + '</td>' +
                '</tr>';
        });

        html += '</tbody></table>';
        return html;
    }

    function renderDrillContent() {
        const bodyEl = document.getElementById('analyticsDrillBody');
        if (!bodyEl) return;

        var filtered = currentDrillData.filter(function(o) {
            if (drillFilters.status && o.status !== drillFilters.status) return false;
            if (drillFilters.supplier && o.supplierName !== drillFilters.supplier) return false;
            if (drillFilters.building && o.building !== drillFilters.building) return false;
            return true;
        });

        var uniqueStatuses = [].concat(new Set(currentDrillData.map(function(o) { return o.status; }))).filter(Boolean).sort();
        // Use a proper unique approach
        var statusSet = {};
        currentDrillData.forEach(function(o) { if (o.status) statusSet[o.status] = true; });
        uniqueStatuses = Object.keys(statusSet).sort();

        var buildingSet = {};
        currentDrillData.forEach(function(o) { if (o.building) buildingSet[o.building] = true; });
        var uniqueBuildings = Object.keys(buildingSet).sort();

        var supplierSet = {};
        currentDrillData.forEach(function(o) { if (o.supplierName) supplierSet[o.supplierName] = true; });
        var uniqueSuppliers = Object.keys(supplierSet).sort();

        var summaryEl = document.getElementById('analyticsDrillSummary');
        if (summaryEl) {
            var totalSpend = filtered.reduce(function(s, o) { return s + (parseFloat(o.totalPrice) || 0); }, 0);
            summaryEl.textContent = filtered.length + (filtered.length < currentDrillData.length ? '/' + currentDrillData.length : '') + ' orders \u00b7 ' + fmtMoney(totalSpend);
        }

        var html = '';

        if (currentDrillData.length > 0) {
            html += '<div class="drill-filters">';

            if (uniqueStatuses.length > 1) {
                html += '<div class="drill-filter-group"><span class="drill-filter-label">Status:</span>';
                uniqueStatuses.forEach(function(s) {
                    var active = drillFilters.status === s;
                    html += '<button class="drill-chip' + (active ? ' active' : '') + '" data-filter-type="status" data-filter-val="' + esc(s) + '">' + esc(s) + '</button>';
                });
                if (drillFilters.status) html += '<button class="drill-chip-clear" data-filter-type="status">\u2715</button>';
                html += '</div>';
            }

            if (uniqueBuildings.length > 1) {
                html += '<div class="drill-filter-group"><span class="drill-filter-label">Building:</span>';
                uniqueBuildings.forEach(function(b) {
                    var active = drillFilters.building === b;
                    html += '<button class="drill-chip' + (active ? ' active' : '') + '" data-filter-type="building" data-filter-val="' + esc(b) + '">' + esc(b) + '</button>';
                });
                if (drillFilters.building) html += '<button class="drill-chip-clear" data-filter-type="building">\u2715</button>';
                html += '</div>';
            }

            if (uniqueSuppliers.length > 1) {
                html += '<div class="drill-filter-group"><span class="drill-filter-label">Supplier:</span>';
                uniqueSuppliers.slice(0, 8).forEach(function(s) {
                    var active = drillFilters.supplier === s;
                    html += '<button class="drill-chip' + (active ? ' active' : '') + '" data-filter-type="supplier" data-filter-val="' + esc(s) + '">' + esc(s) + '</button>';
                });
                if (drillFilters.supplier) html += '<button class="drill-chip-clear" data-filter-type="supplier">\u2715</button>';
                html += '</div>';
            }

            html += '</div>';
        }

        html += renderDrillTable(filtered);
        bodyEl.innerHTML = html;

        bodyEl.querySelectorAll('.drill-chip').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var type = this.dataset.filterType;
                var val = this.dataset.filterVal;
                drillFilters[type] = drillFilters[type] === val ? '' : val;
                renderDrillContent();
            });
        });
        bodyEl.querySelectorAll('.drill-chip-clear').forEach(function(btn) {
            btn.addEventListener('click', function() {
                drillFilters[this.dataset.filterType] = '';
                renderDrillContent();
            });
        });
    }

    // ── Skeleton & UI ─────────────────────────────────────────

    function renderSkeleton() {
        const c = getContainer();
        if (!c) return;

        c.innerHTML = `
        <div class="analytics-container">
            <div class="analytics-top-bar">
                <div class="period-filter" id="analyticsPeriodFilter">
                    <button class="period-btn${currentPeriod === 'month' ? ' active' : ''}" data-period="month">This Month</button>
                    <button class="period-btn${currentPeriod === '3months' ? ' active' : ''}" data-period="3months">Last 3M</button>
                    <button class="period-btn${currentPeriod === '6months' ? ' active' : ''}" data-period="6months">Last 6M</button>
                    <button class="period-btn${currentPeriod === 'year' ? ' active' : ''}" data-period="year">This Year</button>
                    <button class="period-btn${currentPeriod === 'all' ? ' active' : ''}" data-period="all">All Time</button>
                    <button class="period-btn${currentPeriod === 'custom' ? ' active' : ''}" data-period="custom">Custom</button>
                </div>
                <div class="analytics-export-btns">
                    <button class="export-btn" id="btnExportXLSX" title="Export to Excel">\ud83d\udce5 Excel</button>
                    <button class="export-btn" id="btnExportPDF" title="Export to PDF">\ud83d\udcc4 PDF</button>
                </div>
            </div>
            <div id="analyticsCustomRange" class="custom-range-picker" style="${currentPeriod === 'custom' ? '' : 'display:none;'}">
                <label>From: <input type="date" id="analyticsDateFrom" value="${customDateFrom || ''}"></label>
                <label>To: <input type="date" id="analyticsDateTo" value="${customDateTo || ''}"></label>
                <button class="btn-apply-range" id="btnApplyRange">Apply</button>
            </div>
            <div class="kpi-grid" id="analyticsKpiGrid"></div>
            <div class="charts-grid">
                <div class="chart-card" title="Click a bar to see orders"><h3>Spend Over Time</h3><canvas id="chartSpendOverTime"></canvas></div>
                <div class="chart-card" title="Click a segment to see orders"><h3>Orders by Status</h3><canvas id="chartOrderStatus"></canvas></div>
            </div>
            <div class="charts-grid">
                <div class="chart-card" title="Click a bar to see orders"><h3>Spend by Building</h3><canvas id="chartSpendBuilding"></canvas></div>
                <div class="chart-card" title="Click a bar to see orders"><h3>Top 10 Suppliers</h3><canvas id="chartSpendSupplier"></canvas></div>
            </div>
            <div class="charts-grid">
                <div class="chart-card full-width" title="Click a bar to see orders"><h3>Spend by Category</h3></div>
            </div>
            <div class="analytics-table-wrapper" id="supplierPerfTableWrapper">
                <h3>Supplier Performance</h3>
                <div id="supplierPerfTableBody"></div>
            </div>
            <div class="analytics-table-wrapper" id="topPartsTableWrapper">
                <h3>Top Ordered Parts</h3>
                <div id="topPartsTableBody"></div>
            </div>
        </div>`;

        // Bind period filter
        const filterEl = document.getElementById('analyticsPeriodFilter');
        if (filterEl) {
            filterEl.addEventListener('click', function (e) {
                const btn = e.target.closest('.period-btn');
                if (!btn) return;
                currentPeriod = btn.dataset.period;
                filterEl.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === currentPeriod));
                const customRange = document.getElementById('analyticsCustomRange');
                if (customRange) {
                    customRange.style.display = currentPeriod === 'custom' ? '' : 'none';
                }
                if (currentPeriod !== 'custom') {
                    loadData();
                }
            });
        }

        // Bind custom date range apply
        const btnApply = document.getElementById('btnApplyRange');
        if (btnApply) {
            btnApply.addEventListener('click', function () {
                const from = document.getElementById('analyticsDateFrom');
                const to = document.getElementById('analyticsDateTo');
                customDateFrom = from ? from.value || null : null;
                customDateTo = to ? to.value || null : null;
                loadData();
            });
        }

        // Bind export buttons
        document.getElementById('btnExportXLSX')?.addEventListener('click', exportToXLSX);
        document.getElementById('btnExportPDF')?.addEventListener('click', exportToPDF);

        // Bind modal close events (idempotent)
        document.getElementById('analyticsDrillClose')?.addEventListener('click', closeDrillDown);
        document.getElementById('analyticsDrillBackdrop')?.addEventListener('click', closeDrillDown);
        if (!drillModalListenersAttached) {
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') closeDrillDown();
            });
            drillModalListenersAttached = true;
        }
    }

    async function loadData() {
        try {
            destroyAllCharts();

            // Set Chart.js defaults
            if (typeof Chart !== 'undefined') {
                Chart.defaults.color = '#9ca3af';
                Chart.defaults.borderColor = 'rgba(148,163,184,0.15)';
            }

            const [summary, spendTime, statusDist, buildingSpend, supplierSpend, categorySpend, supplierPerf, topParts] =
                await Promise.all([
                    apiFetch('summary'),
                    apiFetch('spend-over-time', currentPeriod !== 'custom' && !getMonthsParam() ? { months: 24 } : null),
                    apiFetch('order-status-distribution'),
                    apiFetch('spend-by-building'),
                    apiFetch('spend-by-supplier', { limit: 10 }),
                    apiFetch('spend-by-category'),
                    apiFetch('supplier-performance', { limit: 10 }),
                    apiFetch('top-parts', { limit: 20 })
                ]);

            lastData = { summary, spendTime, statusDist, buildingSpend, supplierSpend, categorySpend, supplierPerf, topParts };

            renderKPIs(summary);
            renderSpendOverTime(spendTime);
            renderOrderStatus(statusDist);
            renderSpendByBuilding(buildingSpend);
            renderSpendBySupplier(supplierSpend);
            renderSpendByCategory(categorySpend);
            renderSupplierPerformance(supplierPerf);
            renderTopParts(topParts);
        } catch (err) {
            console.error('Analytics load error:', err);
            showError('Failed to load analytics data. ' + err.message);
        }
    }

    function renderKPIs(d) {
        const grid = document.getElementById('analyticsKpiGrid');
        if (!grid) return;

        const cards = [
            { icon: '\u{1F4B0}', value: fmtMoney(d.totalSpend), label: 'Total Spend' },
            { icon: '\u{1F4E6}', value: fmtNum(d.totalOrders), label: 'Total Orders' },
            { icon: '\u{1F4CA}', value: fmtMoney(d.avgOrderValue), label: 'Avg Order Value' },
            { icon: '\u{23F1}', value: (parseFloat(d.avgLeadTimeDays) || 0).toFixed(1) + 'd', label: 'Avg Lead Time' },
            { icon: '\u{2705}', value: fmtPct(d.deliveryRate), label: 'Delivery Rate' },
            { icon: '\u{1F504}', value: fmtNum(d.ordersInProgress), label: 'In Progress' }
        ];

        grid.innerHTML = cards.map(c => `
            <div class="kpi-card">
                <div class="kpi-icon">${c.icon}</div>
                <div class="kpi-value">${c.value}</div>
                <div class="kpi-label">${c.label}</div>
            </div>`).join('');
    }

    function renderSpendOverTime(data) {
        const canvas = document.getElementById('chartSpendOverTime');
        if (!canvas || typeof Chart === 'undefined') return;
        destroyChart('spendOverTime');

        chartsRegistry['spendOverTime'] = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: data.map(d => d.period),
                datasets: [{
                    label: 'Spend (EUR)',
                    data: data.map(d => d.total),
                    backgroundColor: '#38bdf8',
                    borderRadius: 4,
                    maxBarThickness: 40
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => fmtMoney(ctx.raw)
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v
                        }
                    }
                },
                onHover: (evt) => { if (evt.native) evt.native.target.style.cursor = 'pointer'; },
                onClick: (evt, elements) => {
                    if (!elements.length) return;
                    const idx = elements[0].index;
                    const period = data[idx].period;
                    const label = formatPeriodLabel(period);
                    openDrillDown('period', period, 'Orders \u2014 ' + label);
                }
            }
        });
    }

    function renderOrderStatus(data) {
        const canvas = document.getElementById('chartOrderStatus');
        if (!canvas || typeof Chart === 'undefined') return;
        destroyChart('orderStatus');

        chartsRegistry['orderStatus'] = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: data.map(d => d.status),
                datasets: [{
                    data: data.map(d => d.count),
                    backgroundColor: data.map(d => STATUS_COLORS[d.status] || '#6b7280'),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '55%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { boxWidth: 12, padding: 8, font: { size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: ctx => ctx.label + ': ' + ctx.raw + ' (' + fmtPct(data[ctx.dataIndex].percent) + ')'
                        }
                    }
                },
                onHover: (evt) => { if (evt.native) evt.native.target.style.cursor = 'pointer'; },
                onClick: (evt, elements) => {
                    if (!elements.length) return;
                    const idx = elements[0].index;
                    openDrillDown('status', data[idx].status, 'Orders \u2014 ' + data[idx].status);
                }
            }
        });
    }

    function renderSpendByBuilding(data) {
        const canvas = document.getElementById('chartSpendBuilding');
        if (!canvas || typeof Chart === 'undefined') return;
        destroyChart('spendBuilding');

        chartsRegistry['spendBuilding'] = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: data.map(d => d.building + (d.buildingName !== d.building ? ' - ' + d.buildingName : '')),
                datasets: [{
                    label: 'Spend (EUR)',
                    data: data.map(d => d.total),
                    backgroundColor: COLORS.slice(0, data.length),
                    borderRadius: 4,
                    maxBarThickness: 28
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => fmtMoney(ctx.raw) + ' (' + fmtPct(data[ctx.dataIndex].percent) + ')'
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: { callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v }
                    }
                },
                onHover: (evt) => { if (evt.native) evt.native.target.style.cursor = 'pointer'; },
                onClick: (evt, elements) => {
                    if (!elements.length) return;
                    const idx = elements[0].index;
                    openDrillDown('building', data[idx].building, 'Orders \u2014 ' + data[idx].buildingName);
                }
            }
        });
    }

    function renderSpendBySupplier(data) {
        const canvas = document.getElementById('chartSpendSupplier');
        if (!canvas || typeof Chart === 'undefined') return;
        destroyChart('spendSupplier');

        chartsRegistry['spendSupplier'] = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: data.map(d => d.supplierName),
                datasets: [{
                    label: 'Spend (EUR)',
                    data: data.map(d => d.total),
                    backgroundColor: COLORS.slice(0, data.length),
                    borderRadius: 4,
                    maxBarThickness: 28
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => fmtMoney(ctx.raw) + ' (' + data[ctx.dataIndex].orderCount + ' orders)'
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: { callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v }
                    }
                },
                onHover: (evt) => { if (evt.native) evt.native.target.style.cursor = 'pointer'; },
                onClick: (evt, elements) => {
                    if (!elements.length) return;
                    const idx = elements[0].index;
                    openDrillDown('supplier', data[idx].supplierId, 'Orders \u2014 ' + data[idx].supplierName);
                }
            }
        });
    }

    function renderSpendByCategory(data) {
        // Find the category chart-card (the full-width one with h3 "Spend by Category")
        var cards = document.querySelectorAll('.chart-card.full-width');
        var cardEl = null;
        cards.forEach(function(c) {
            var h = c.querySelector('h3');
            if (h && h.textContent.trim().toLowerCase().indexOf('category') !== -1) cardEl = c;
        });
        if (!cardEl || typeof Chart === 'undefined') return;
        destroyChart('spendCategory');

        // Remove any existing canvas or hybrid
        var existingCanvas = cardEl.querySelector('canvas');
        if (existingCanvas) existingCanvas.remove();
        var existingHybrid = cardEl.querySelector('.category-hybrid');
        if (existingHybrid) existingHybrid.remove();

        var hybrid = document.createElement('div');
        hybrid.className = 'category-hybrid';
        hybrid.innerHTML =
            '<div class="category-chart-side">' +
                '<canvas id="chartSpendCategory"></canvas>' +
                '<div class="category-legend" id="categoryLegend"></div>' +
            '</div>' +
            '<div class="category-table-side">' +
                '<div class="category-search-wrap">' +
                    '<input type="text" id="categorySearch" placeholder="\ud83d\udd0d  Filter categories..." class="category-search-input">' +
                '</div>' +
                '<div class="category-table-wrap">' +
                    '<table class="analytics-table category-table" id="categoryTable">' +
                        '<thead><tr>' +
                            '<th style="width:2rem">#</th>' +
                            '<th class="sortable" data-sort="category">Category <span class="sort-icon">\u21D5</span></th>' +
                            '<th class="sortable text-right" data-sort="count">Orders <span class="sort-icon">\u21D5</span></th>' +
                            '<th class="sortable text-right active-sort desc" data-sort="total">Spend <span class="sort-icon">\u2193</span></th>' +
                            '<th class="text-right" style="width:4rem">%</th>' +
                        '</tr></thead>' +
                        '<tbody id="categoryTableBody"></tbody>' +
                    '</table>' +
                '</div>' +
            '</div>';
        cardEl.appendChild(hybrid);

        var sortCol = 'total';
        var sortDir = 'desc';
        var searchTerm = '';

        // Doughnut chart — top 8 only
        var top8 = data.slice(0, 8);
        var others = data.slice(8);
        var othersTotal = others.reduce(function(s, d) { return s + d.total; }, 0);
        var othersCount = others.reduce(function(s, d) { return s + d.count; }, 0);
        var grandTotal = data.reduce(function(s, d) { return s + d.total; }, 0);
        var chartData = othersTotal > 0
            ? top8.concat([{ category: 'Other (' + others.length + ')', total: othersTotal, count: othersCount, percent: parseFloat(((othersTotal / grandTotal) * 100).toFixed(1)) }])
            : top8;

        var canvas = document.getElementById('chartSpendCategory');
        chartsRegistry['spendCategory'] = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: chartData.map(function(d) { return d.category; }),
                datasets: [{
                    data: chartData.map(function(d) { return d.total; }),
                    backgroundColor: COLORS.slice(0, chartData.length),
                    borderWidth: 2,
                    borderColor: 'var(--color-bg-elevated)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '60%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) { return ' ' + fmtMoney(ctx.raw) + ' (' + fmtPct(ctx.raw / grandTotal * 100) + ')'; }
                        }
                    }
                },
                onHover: function(evt) { if (evt.native) evt.native.target.style.cursor = 'pointer'; },
                onClick: function(evt, elements) {
                    if (!elements.length) return;
                    var idx = elements[0].index;
                    var cat = chartData[idx];
                    if (cat.category.indexOf('Other (') === 0) return;
                    openDrillDown('category', cat.category, 'Orders \u2014 Category: ' + cat.category);
                }
            },
            plugins: [{
                id: 'centerText',
                afterDraw: function(chart) {
                    var ctx = chart.ctx;
                    var area = chart.chartArea;
                    var cx = (area.left + area.right) / 2;
                    var cy = (area.top + area.bottom) / 2;
                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#38bdf8';
                    ctx.font = 'bold 13px system-ui, sans-serif';
                    ctx.fillText(grandTotal >= 1000 ? (grandTotal/1000).toFixed(1)+'k EUR' : grandTotal.toFixed(0)+' EUR', cx, cy - 8);
                    ctx.fillStyle = '#9ca3af';
                    ctx.font = '10px system-ui, sans-serif';
                    ctx.fillText('total spend', cx, cy + 10);
                    ctx.restore();
                }
            }]
        });

        // Legend
        var legendEl = document.getElementById('categoryLegend');
        if (legendEl) {
            legendEl.innerHTML = chartData.map(function(d, i) {
                return '<div class="cat-legend-item">' +
                    '<span class="cat-legend-dot" style="background:' + COLORS[i] + '"></span>' +
                    '<span class="cat-legend-name">' + esc(d.category) + '</span>' +
                    '<span class="cat-legend-val">' + (d.total >= 1000 ? (d.total/1000).toFixed(1)+'k' : d.total.toFixed(0)) + '</span>' +
                    '</div>';
            }).join('');
        }

        function renderCategoryTable() {
            var tbody = document.getElementById('categoryTableBody');
            if (!tbody) return;

            var filtered = data.filter(function(d) {
                return !searchTerm || d.category.toLowerCase().indexOf(searchTerm.toLowerCase()) !== -1;
            });

            filtered.sort(function(a, b) {
                var av = a[sortCol], bv = b[sortCol];
                if (typeof av === 'string') av = av.toLowerCase();
                if (typeof bv === 'string') bv = bv.toLowerCase();
                if (av < bv) return sortDir === 'asc' ? -1 : 1;
                if (av > bv) return sortDir === 'asc' ? 1 : -1;
                return 0;
            });

            tbody.innerHTML = filtered.map(function(d, i) {
                return '<tr style="cursor:pointer;" class="cat-row" data-cat="' + esc(d.category) + '">' +
                    '<td style="color:var(--color-text-secondary);font-size:0.75rem;">' + (i + 1) + '</td>' +
                    '<td>' +
                        '<span class="cat-dot" style="background:' + (COLORS[data.indexOf(d)] || '#6b7280') + '"></span>' +
                        esc(d.category) +
                    '</td>' +
                    '<td class="text-right">' + d.count + '</td>' +
                    '<td class="text-right" style="color:var(--color-accent);font-weight:600;">' + fmtMoney(d.total) + '</td>' +
                    '<td class="text-right">' +
                        '<div class="cat-pct-bar"><div class="cat-pct-fill" style="width:' + Math.min(d.percent, 100) + '%"></div></div>' +
                        '<span style="font-size:0.75rem;color:var(--color-text-secondary);">' + fmtPct(d.percent) + '</span>' +
                    '</td>' +
                    '</tr>';
            }).join('');

            tbody.querySelectorAll('.cat-row').forEach(function(tr) {
                tr.addEventListener('click', function() {
                    openDrillDown('category', this.dataset.cat, 'Orders \u2014 Category: ' + this.dataset.cat);
                });
            });
        }

        renderCategoryTable();

        document.querySelectorAll('#categoryTable .sortable').forEach(function(th) {
            th.addEventListener('click', function() {
                var col = this.dataset.sort;
                if (sortCol === col) {
                    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    sortCol = col;
                    sortDir = col === 'category' ? 'asc' : 'desc';
                }
                document.querySelectorAll('#categoryTable .sortable').forEach(function(h) {
                    h.classList.remove('active-sort', 'asc', 'desc');
                    h.querySelector('.sort-icon').textContent = '\u21D5';
                });
                this.classList.add('active-sort', sortDir);
                this.querySelector('.sort-icon').textContent = sortDir === 'asc' ? '\u2191' : '\u2193';
                renderCategoryTable();
            });
        });

        var searchInput = document.getElementById('categorySearch');
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                searchTerm = this.value;
                renderCategoryTable();
            });
        }
    }

    function renderSupplierPerformance(data) {
        const body = document.getElementById('supplierPerfTableBody');
        if (!body) return;

        if (!data || data.length === 0) {
            body.innerHTML = '<p style="color: var(--color-text-secondary); padding: 1rem;">No supplier data available.</p>';
            return;
        }

        let html = '<table class="analytics-table"><thead><tr>' +
            '<th>Supplier</th><th class="text-right">Orders</th><th class="text-right">Delivered</th>' +
            '<th>On-Time Rate</th><th class="text-right">Avg Lead Days</th><th class="text-right">Total Spend</th>' +
            '</tr></thead><tbody>';

        data.forEach(s => {
            const barColor = s.onTimeRate >= 80 ? 'var(--color-success)' : s.onTimeRate >= 50 ? 'var(--color-warning)' : 'var(--color-error)';
            html += '<tr style="cursor:pointer;" data-supplier-id="' + s.supplierId + '" data-supplier-name="' + esc(s.supplierName) + '">' +
                '<td>' + esc(s.supplierName) + '</td>' +
                '<td class="text-right">' + s.totalOrders + '</td>' +
                '<td class="text-right">' + s.delivered + '</td>' +
                '<td>' + fmtPct(s.onTimeRate) +
                    '<div class="ontime-bar"><div class="ontime-bar-fill" style="width:' + Math.min(s.onTimeRate, 100) + '%;background:' + barColor + '"></div></div></td>' +
                '<td class="text-right">' + (parseFloat(s.avgLeadDays) || 0).toFixed(1) + '</td>' +
                '<td class="text-right">' + fmtMoney(s.totalSpend) + '</td>' +
                '</tr>';
        });

        html += '</tbody></table>';
        body.innerHTML = html;

        // Bind click on supplier rows
        body.querySelectorAll('tr[data-supplier-id]').forEach(function(tr) {
            tr.addEventListener('click', function() {
                var sid = this.getAttribute('data-supplier-id');
                var sname = this.getAttribute('data-supplier-name');
                openDrillDown('supplier', sid, 'Orders \u2014 ' + sname);
            });
        });
    }

    function renderTopParts(data) {
        const body = document.getElementById('topPartsTableBody');
        if (!body) return;

        if (!data || data.length === 0) {
            body.innerHTML = '<p style="color: var(--color-text-secondary); padding: 1rem;">No parts data available.</p>';
            return;
        }

        let html = '<table class="analytics-table"><thead><tr>' +
            '<th>Part Description</th><th class="text-right">Times Ordered</th>' +
            '<th class="text-right">Total Qty</th><th class="text-right">Total Spend</th>' +
            '</tr></thead><tbody>';

        data.forEach(p => {
            html += '<tr style="cursor:pointer;" data-part-desc="' + esc(p.itemDescription) + '">' +
                '<td>' + esc(p.itemDescription) + '</td>' +
                '<td class="text-right">' + p.orderCount + '</td>' +
                '<td class="text-right">' + fmtNum(p.totalQty) + '</td>' +
                '<td class="text-right">' + fmtMoney(p.totalSpend) + '</td>' +
                '</tr>';
        });

        html += '</tbody></table>';
        body.innerHTML = html;

        // Bind click on part rows
        body.querySelectorAll('tr[data-part-desc]').forEach(function(tr) {
            tr.addEventListener('click', function() {
                var desc = this.getAttribute('data-part-desc');
                openDrillDown('part', desc, 'Reorders \u2014 ' + desc);
            });
        });
    }

    function exportToXLSX() {
        if (typeof XLSX === 'undefined') { alert('Excel export library not loaded.'); return; }
        var wb = XLSX.utils.book_new();

        var summarySheet = XLSX.utils.aoa_to_sheet([
            ['PartPulse Analytics Report'],
            ['Generated:', new Date().toLocaleString()],
            ['Period:', getPeriodLabel()],
            [],
            ['KPI', 'Value'],
            ['Total Spend (EUR)', lastData.summary?.totalSpend || 0],
            ['Total Orders', lastData.summary?.totalOrders || 0],
            ['Avg Order Value (EUR)', lastData.summary?.avgOrderValue || 0],
            ['Avg Lead Time (days)', lastData.summary?.avgLeadTimeDays || 0],
            ['Delivery Rate (%)', lastData.summary?.deliveryRate || 0],
            ['Orders In Progress', lastData.summary?.ordersInProgress || 0],
        ]);
        XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

        if (lastData.spendTime?.length) {
            var rows = [['Month', 'Total Spend (EUR)', 'Order Count']];
            lastData.spendTime.forEach(function(r) { rows.push([r.period, r.total, r.count]); });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Spend Over Time');
        }

        if (lastData.statusDist?.length) {
            var rows = [['Status', 'Count', '% of Total']];
            lastData.statusDist.forEach(function(r) { rows.push([r.status, r.count, r.percent]); });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Orders by Status');
        }

        if (lastData.buildingSpend?.length) {
            var rows = [['Building Code', 'Building Name', 'Total Spend (EUR)', 'Orders', '% of Total']];
            lastData.buildingSpend.forEach(function(r) { rows.push([r.building, r.buildingName, r.total, r.count, r.percent]); });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Spend by Building');
        }

        if (lastData.supplierSpend?.length) {
            var rows = [['Supplier', 'Total Spend (EUR)', 'Orders', 'Avg Value (EUR)']];
            lastData.supplierSpend.forEach(function(r) { rows.push([r.supplierName, r.total, r.orderCount, r.avgValue]); });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Top Suppliers');
        }

        if (lastData.categorySpend?.length) {
            var rows = [['Category', 'Total Spend (EUR)', 'Orders', '% of Total']];
            lastData.categorySpend.forEach(function(r) { rows.push([r.category, r.total, r.count, r.percent]); });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Spend by Category');
        }

        if (lastData.supplierPerf?.length) {
            var rows = [['Supplier', 'Total Orders', 'Delivered', 'On-Time Rate (%)', 'Avg Lead Days', 'Total Spend (EUR)']];
            lastData.supplierPerf.forEach(function(r) { rows.push([r.supplierName, r.totalOrders, r.delivered, r.onTimeRate, r.avgLeadDays, r.totalSpend]); });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Supplier Performance');
        }

        if (lastData.topParts?.length) {
            var rows = [['Part Description', 'Times Ordered', 'Total Qty', 'Total Spend (EUR)']];
            lastData.topParts.forEach(function(r) { rows.push([r.itemDescription, r.orderCount, r.totalQty, r.totalSpend]); });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Top Parts');
        }

        var filename = 'PartPulse_Analytics_' + getPeriodLabel().replace(/\s+/g, '_') + '_' + new Date().toISOString().slice(0,10) + '.xlsx';
        XLSX.writeFile(wb, filename);
    }

    function exportToPDF() {
        if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
            alert('PDF export library not loaded.'); return;
        }
        var jsPDF = window.jspdf.jsPDF;
        var doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        var darkBg = [2, 6, 23];
        var accentBlue = [56, 189, 248];
        var textGray = [229, 231, 235];
        var mutedGray = [107, 114, 128];

        var y = 15;
        var pageW = doc.internal.pageSize.width;

        // Header
        doc.setFillColor(darkBg[0], darkBg[1], darkBg[2]);
        doc.rect(0, 0, pageW, 22, 'F');
        doc.setFontSize(16);
        doc.setTextColor(accentBlue[0], accentBlue[1], accentBlue[2]);
        doc.setFont('helvetica', 'bold');
        doc.text('PartPulse \u2014 Financial Analytics Report', 15, 14);
        doc.setFontSize(9);
        doc.setTextColor(mutedGray[0], mutedGray[1], mutedGray[2]);
        doc.text('Period: ' + getPeriodLabel() + '   |   Generated: ' + new Date().toLocaleString(), 15, 20);
        y = 30;

        // KPI row
        if (lastData.summary) {
            var kpis = [
                { label: 'Total Spend', value: fmtMoney(lastData.summary.totalSpend) },
                { label: 'Orders', value: String(lastData.summary.totalOrders) },
                { label: 'Avg Value', value: fmtMoney(lastData.summary.avgOrderValue) },
                { label: 'Lead Time', value: (lastData.summary.avgLeadTimeDays||0).toFixed(1) + 'd' },
                { label: 'Delivery Rate', value: fmtPct(lastData.summary.deliveryRate) },
                { label: 'In Progress', value: String(lastData.summary.ordersInProgress) },
            ];
            var kpiW = (pageW - 20) / kpis.length;
            kpis.forEach(function(k, i) {
                var x = 10 + i * kpiW;
                doc.setFillColor(30, 41, 59);
                doc.roundedRect(x, y, kpiW - 3, 18, 2, 2, 'F');
                doc.setFontSize(7);
                doc.setTextColor(mutedGray[0], mutedGray[1], mutedGray[2]);
                doc.text(k.label.toUpperCase(), x + 3, y + 6);
                doc.setFontSize(10);
                doc.setTextColor(accentBlue[0], accentBlue[1], accentBlue[2]);
                doc.setFont('helvetica', 'bold');
                doc.text(k.value, x + 3, y + 14);
            });
            y += 24;
        }

        function addTable(title, head, rows, startY) {
            if (!rows || rows.length === 0) return startY;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(accentBlue[0], accentBlue[1], accentBlue[2]);
            doc.text(title, 10, startY);
            startY += 4;

            doc.autoTable({
                startY: startY,
                head: [head],
                body: rows,
                theme: 'grid',
                styles: {
                    fontSize: 7.5,
                    cellPadding: 2,
                    textColor: [229, 231, 235],
                    fillColor: [15, 23, 42],
                    lineColor: [30, 41, 59],
                    lineWidth: 0.2
                },
                headStyles: {
                    fillColor: [30, 41, 59],
                    textColor: [148, 163, 184],
                    fontStyle: 'bold',
                    fontSize: 7
                },
                alternateRowStyles: { fillColor: [2, 6, 23] },
                margin: { left: 10, right: 10 }
            });
            return doc.lastAutoTable.finalY + 8;
        }

        if (lastData.spendTime?.length) {
            y = addTable('Spend Over Time', ['Month', 'Total Spend (EUR)', 'Orders'],
                lastData.spendTime.map(function(r) { return [r.period, r.total.toFixed(2), r.count]; }), y);
        }

        doc.addPage();
        y = 15;

        if (lastData.buildingSpend?.length) {
            y = addTable('Spend by Building', ['Building', 'Name', 'Total Spend (EUR)', 'Orders', '%'],
                lastData.buildingSpend.map(function(r) { return [r.building, r.buildingName, r.total.toFixed(2), r.count, r.percent + '%']; }), y);
        }

        if (lastData.supplierSpend?.length) {
            y = addTable('Top Suppliers', ['Supplier', 'Total Spend (EUR)', 'Orders', 'Avg Value (EUR)'],
                lastData.supplierSpend.map(function(r) { return [r.supplierName, r.total.toFixed(2), r.orderCount, r.avgValue.toFixed(2)]; }), y);
        }

        doc.addPage();
        y = 15;

        if (lastData.categorySpend?.length) {
            y = addTable('Spend by Category', ['Category', 'Total Spend (EUR)', 'Orders', '%'],
                lastData.categorySpend.map(function(r) { return [r.category, r.total.toFixed(2), r.count, r.percent + '%']; }), y);
        }

        doc.addPage();
        y = 15;

        if (lastData.supplierPerf?.length) {
            y = addTable('Supplier Performance',
                ['Supplier', 'Orders', 'Delivered', 'On-Time %', 'Avg Lead Days', 'Total Spend (EUR)'],
                lastData.supplierPerf.map(function(r) { return [r.supplierName, r.totalOrders, r.delivered, r.onTimeRate + '%', r.avgLeadDays.toFixed(1), r.totalSpend.toFixed(2)]; }), y);
        }

        if (lastData.topParts?.length) {
            y = addTable('Top Ordered Parts', ['Part Description', 'Times Ordered', 'Total Qty', 'Total Spend (EUR)'],
                lastData.topParts.map(function(r) { return [r.itemDescription.substring(0, 60), r.orderCount, r.totalQty, r.totalSpend.toFixed(2)]; }), y);
        }

        var totalPages = doc.getNumberOfPages();
        for (var i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(mutedGray[0], mutedGray[1], mutedGray[2]);
            doc.text('Page ' + i + ' of ' + totalPages + '  |  PartPulse Analytics', pageW / 2, doc.internal.pageSize.height - 5, { align: 'center' });
        }

        var filename = 'PartPulse_Analytics_' + getPeriodLabel().replace(/[^a-zA-Z0-9]/g, '_') + '_' + new Date().toISOString().slice(0,10) + '.pdf';
        doc.save(filename);
    }

    function init() {
        if (!initialized) {
            renderSkeleton();
            initialized = true;
        }
        loadData();
    }

    function refresh() {
        renderSkeleton();
        loadData();
    }

    // Export module
    window.AnalyticsModule = { init: init, refresh: refresh };

        // ── World-Class Upgrade: Wire in Insights + Forecasting ──────────────

    async function loadInsightsAndForecast(data) {
        // Insights Panel
        if (window.AnalyticsInsights && document.getElementById('analyticsInsightsPanel')) {
            const insights = await window.AnalyticsInsights.generateInsights(data);
            window.AnalyticsInsights.renderInsightsPanel(insights, 'analyticsInsightsPanel');
        }
        // Forecast Panel
        if (window.AnalyticsForecasting && data.spendOverTime && data.spendOverTime.length >= 3) {
            window.AnalyticsForecasting.renderForecastPanel(data.spendOverTime, 'analyticsForecastPanel');
            if (document.getElementById('chartForecast')) {
                window.AnalyticsForecasting.renderForecastChart(data.spendOverTime, 'chartForecast', chartsRegistry);
            }
        }
    }

    // Patch into existing render flow
    const _origLoadData = typeof loadData === 'function' ? loadData : null;
    if (_origLoadData) {
        const __patched = async function() {
            await _origLoadData.apply(this, arguments);
            if (lastData && Object.keys(lastData).length > 0) {
                await loadInsightsAndForecast(lastData);
            }
        };
        window.AnalyticsModule && (window.AnalyticsModule.refresh = __patched);
    }

})();
