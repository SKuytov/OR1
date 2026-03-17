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
            summaryEl.textContent = data.orders.length + ' orders \u00b7 ' + fmtMoney(data.totalSpend);
            bodyEl.innerHTML = renderDrillTable(data.orders);
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
                '<td title="' + esc(o.itemDescription) + '">' + esc(o.itemDescription) + '</td>' +
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

    // ── Skeleton & UI ─────────────────────────────────────────

    function renderSkeleton() {
        const c = getContainer();
        if (!c) return;

        c.innerHTML = `
        <div class="analytics-container">
            <div class="period-filter" id="analyticsPeriodFilter">
                <button class="period-btn${currentPeriod === 'month' ? ' active' : ''}" data-period="month">This Month</button>
                <button class="period-btn${currentPeriod === '3months' ? ' active' : ''}" data-period="3months">Last 3M</button>
                <button class="period-btn${currentPeriod === '6months' ? ' active' : ''}" data-period="6months">Last 6M</button>
                <button class="period-btn${currentPeriod === 'year' ? ' active' : ''}" data-period="year">This Year</button>
                <button class="period-btn${currentPeriod === 'all' ? ' active' : ''}" data-period="all">All Time</button>
                <button class="period-btn${currentPeriod === 'custom' ? ' active' : ''}" data-period="custom">Custom</button>
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
                <div class="chart-card full-width" title="Click a bar to see orders"><h3>Spend by Category</h3><canvas id="chartSpendCategory"></canvas></div>
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
        const canvas = document.getElementById('chartSpendCategory');
        if (!canvas || typeof Chart === 'undefined') return;
        destroyChart('spendCategory');

        chartsRegistry['spendCategory'] = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: data.map(d => d.category),
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
                    openDrillDown('category', data[idx].category, 'Orders \u2014 Category: ' + data[idx].category);
                }
            }
        });
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
})();
