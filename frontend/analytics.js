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
    let lastRefreshTime = null;
    let comparisonMode = false;
    var _apiCache = {};
    var _apiCacheTTL = 5 * 60 * 1000; // 5 minutes

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
        var url = (typeof API_BASE !== 'undefined' ? API_BASE : '/api') + '/analytics/' + endpoint + buildQuery(params);
        var token = typeof authToken !== 'undefined' ? authToken : localStorage.getItem('token');
        var cacheKey = url;
        var cached = _apiCache[cacheKey];
        if (cached && (Date.now() - cached.ts < _apiCacheTTL)) {
            return cached.data;
        }
        var resp = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
        if (!resp.ok) throw new Error('API error: ' + resp.status);
        var data = await resp.json();
        _apiCache[cacheKey] = { data: data, ts: Date.now() };
        return data;
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
        c.innerHTML = `
        <div class="analytics-container">
            <div class="kpi-grid">
                ${Array(6).fill('<div class="kpi-card analytics-skeleton" style="height:100px;"></div>').join('')}
            </div>
            <div class="charts-grid">
                <div class="chart-card analytics-skeleton" style="height:280px;"></div>
                <div class="chart-card analytics-skeleton" style="height:280px;"></div>
            </div>
            <div class="charts-grid">
                <div class="chart-card analytics-skeleton" style="height:240px;"></div>
                <div class="chart-card analytics-skeleton" style="height:240px;"></div>
            </div>
        </div>`;
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

    // ── Widget Preferences (Customize Panel) ─────────────────
    function loadWidgetPrefs() {
        try { return JSON.parse(localStorage.getItem('analyticsWidgetPrefs') || '{}'); } catch(e) { return {}; }
    }
    function saveWidgetPrefs(prefs) {
        try { localStorage.setItem('analyticsWidgetPrefs', JSON.stringify(prefs)); } catch(e) {}
    }

    function applyWidgetVisibility() {
        var prefs = loadWidgetPrefs();
        document.querySelectorAll('#analyticsCustomizePanel input[type=checkbox]').forEach(function(cb) {
            var key = cb.dataset.widget;
            var visible = prefs[key] !== false; // default true
            cb.checked = visible;
            var targetEl = findWidgetEl(key);
            if (targetEl) targetEl.style.display = visible ? '' : 'none';
        });
    }

    function findWidgetEl(key) {
        var map = {
            'spendOverTime': document.getElementById('chartSpendOverTime')?.closest('.chart-card'),
            'forecastCard': document.getElementById('forecastCard'),
            'orderStatus': document.getElementById('chartOrderStatus')?.closest('.chart-card'),
            'spendBuilding': document.getElementById('chartSpendBuilding')?.closest('.chart-card'),
            'spendSupplier': document.getElementById('chartSpendSupplier')?.closest('.chart-card'),
            'categorySection': document.querySelector('.chart-card.full-width'),
            'supplierPerfTableWrapper': document.getElementById('supplierPerfTableWrapper'),
            'topPartsTableWrapper': document.getElementById('topPartsTableWrapper')
        };
        return map[key] || null;
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
                '<td><button class="drill-order-id-btn" data-order-id="' + o.id + '">#' + o.id + '</button></td>' +
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
                html += '<div class="drill-filter-group"><span class="drill-filter-label">Supplier:</span><div class="drill-chips-scroll">';
                uniqueSuppliers.forEach(function(s) {
                    var active = drillFilters.supplier === s;
                    html += '<button class="drill-chip' + (active ? ' active' : '') + '" data-filter-type="supplier" data-filter-val="' + esc(s) + '">' + esc(s) + '</button>';
                });
                html += '</div>';
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

        // Order ID click -> opens order detail panel
        bodyEl.querySelectorAll('.drill-order-id-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var orderId = parseInt(this.dataset.orderId);
                closeDrillDown();
                var ordersTab = document.querySelector('[data-tab="ordersTab"]');
                if (ordersTab) ordersTab.click();
                setTimeout(function() {
                    if (typeof openOrderDetail === 'function') {
                        openOrderDetail(orderId);
                    }
                }, 200);
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
    <button class="export-btn" id="btnExportXLSX" title="Export to Excel">📥 Excel</button>
    <button class="export-btn" id="btnExportPDF" title="Export to PDF">📄 PDF</button>
    <button class="export-btn" id="btnExportCSV" title="Export to CSV">📊 CSV</button>
    <button class="export-btn" id="btnExportJSON" title="Export raw JSON">📦 JSON</button>
    <button class="export-btn" id="btnPrintReport" title="Print report">🖨️ Print</button>
    <button class="export-btn" id="btnToggleComparison" title="Toggle period comparison">📊 Compare</button>
    <button class="export-btn" id="btnCustomize" title="Customize dashboard">⚙ Customize</button>
</div>
                <div class="analytics-refresh-ctrl" id="analyticsRefreshCtrl">
                    <button class="analytics-refresh-btn" id="analyticsRefreshBtn" title="Refresh data">
                        <svg class="refresh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                            <polyline points="23 4 23 10 17 10"></polyline>
                            <polyline points="1 20 1 14 7 14"></polyline>
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                        </svg>
                        Refresh
                    </button>
                    <span class="analytics-last-updated" id="analyticsLastUpdated"></span>
                </div>
            </div>
            <div id="analyticsCustomRange" class="custom-range-picker" style="${currentPeriod === 'custom' ? '' : 'display:none;'}">
                <label>From: <input type="date" id="analyticsDateFrom" value="${customDateFrom || ''}"></label>
                <label>To: <input type="date" id="analyticsDateTo" value="${customDateTo || ''}"></label>
                <button class="btn-apply-range" id="btnApplyRange">Apply</button>
            </div>
            <div class="analytics-customize-panel hidden" id="analyticsCustomizePanel">
                <div class="customize-panel-inner">
                    <strong>Show/Hide Sections</strong>
                    <label><input type="checkbox" data-widget="spendOverTime" checked> Spend Over Time</label>
                    <label><input type="checkbox" data-widget="forecastCard" checked> Spend Forecast</label>
                    <label><input type="checkbox" data-widget="orderStatus" checked> Orders by Status</label>
                    <label><input type="checkbox" data-widget="spendBuilding" checked> Spend by Building</label>
                    <label><input type="checkbox" data-widget="spendSupplier" checked> Top Suppliers</label>
                    <label><input type="checkbox" data-widget="categorySection" checked> Spend by Category</label>
                    <label><input type="checkbox" data-widget="supplierPerfTableWrapper" checked> Supplier Performance</label>
                    <label><input type="checkbox" data-widget="topPartsTableWrapper" checked> Top Parts</label>
                </div>
            </div>
            <div class="kpi-grid" id="analyticsKpiGrid"></div>
            <div class="charts-grid">
                <div class="chart-card" title="Click a bar to see orders">
                    <div class="chart-card-header">
                        <h3>Spend Over Time</h3>
                        <button class="chart-download-btn" data-chart-id="chartSpendOverTime" title="Download chart as PNG">⬇</button>
                    </div>
                    <canvas id="chartSpendOverTime"></canvas>
                </div>
                <div class="chart-card" title="Click a segment to see orders">
                    <div class="chart-card-header">
                        <h3>Orders by Status</h3>
                        <button class="chart-download-btn" data-chart-id="chartOrderStatus" title="Download chart as PNG">⬇</button>
                    </div>
                    <canvas id="chartOrderStatus"></canvas>
                </div>
            </div>
            <div class="charts-grid">
                <div class="chart-card full-width" id="forecastCard">
                    <h3>📈 Spend Forecast</h3>
                    <canvas id="chartSpendForecast"></canvas>
                    <div class="forecast-note" id="forecastNote"></div>
                </div>
            </div>
            <div class="charts-grid">
                <div class="chart-card" title="Click a bar to see orders">
                    <div class="chart-card-header">
                        <h3>Spend by Building</h3>
                        <button class="chart-download-btn" data-chart-id="chartSpendBuilding" title="Download chart as PNG">⬇</button>
                    </div>
                    <canvas id="chartSpendBuilding"></canvas>
                </div>
                <div class="chart-card" title="Click a bar to see orders">
                    <div class="chart-card-header">
                        <h3>Top 10 Suppliers</h3>
                        <button class="chart-download-btn" data-chart-id="chartSpendSupplier" title="Download chart as PNG">⬇</button>
                    </div>
                    <canvas id="chartSpendSupplier"></canvas>
                </div>
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

            <!-- 💡 INSIGHTS PANEL -->
            <div class="insights-section">
                <h3>💡 Cost-Saving Insights</h3>
                <div id="analyticsInsightsPanel">
                    <div class="analytics-loading"><div class="spinner"></div><div>Analyzing...</div></div>
                </div>
            </div>

            <!-- 📈 FORECAST PANEL -->
            <div class="chart-card" style="margin-bottom:1.25rem;">
                <h3>📈 3-Month Spend Forecast</h3>
                <div id="analyticsForecastPanel"></div>
                <div style="position:relative;height:240px;margin-top:1rem;">
                    <canvas id="chartForecast"></canvas>
                </div>
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
// ── New Export Buttons (analytics-export.js) ──
document.getElementById('btnExportCSV')?.addEventListener('click', function() {
    if (window.AnalyticsExport && lastData) {
        window.AnalyticsExport.exportCSV(lastData, getPeriodLabel());
    }
});
document.getElementById('btnExportJSON')?.addEventListener('click', function() {
    if (window.AnalyticsExport && lastData) {
        window.AnalyticsExport.exportJSON(lastData, getPeriodLabel());
    }
});
document.getElementById('btnPrintReport')?.addEventListener('click', function() {
    if (window.AnalyticsExport) {
        window.AnalyticsExport.printReport(getPeriodLabel());
    }
});

        // Comparison toggle binding
        document.getElementById('btnToggleComparison')?.addEventListener('click', function() {
            comparisonMode = !comparisonMode;
            this.classList.toggle('active', comparisonMode);
            this.textContent = comparisonMode ? '📊 Comparing' : '📊 Compare';
            if (lastData.spendTime) renderSpendOverTime(lastData.spendTime);
        });

        // Refresh button binding
        var refreshBtn = document.getElementById('analyticsRefreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function() {
                this.classList.add('spinning');
                var me = this;
                loadData().finally(function() {
                    me.classList.remove('spinning');
                    lastRefreshTime = Date.now();
                    var el = document.getElementById('analyticsLastUpdated');
                    if (el) el.textContent = 'Updated just now';
                });
            });
        }

        // Customize panel binding
        var btnCustomize = document.getElementById('btnCustomize');
        if (btnCustomize) {
            btnCustomize.addEventListener('click', function() {
                var panel = document.getElementById('analyticsCustomizePanel');
                if (panel) panel.classList.toggle('hidden');
            });
        }
        document.getElementById('analyticsCustomizePanel')?.addEventListener('change', function(e) {
            var cb = e.target;
            if (!cb.matches('input[type=checkbox]')) return;
            var prefs = loadWidgetPrefs();
            prefs[cb.dataset.widget] = cb.checked;
            saveWidgetPrefs(prefs);
            var el = findWidgetEl(cb.dataset.widget);
            if (el) el.style.display = cb.checked ? '' : 'none';
        });

        // Chart PNG download (event delegation)
        getContainer()?.addEventListener('click', function(e) {
            var btn = e.target.closest('.chart-download-btn');
            if (!btn) return;
            var chartId = btn.dataset.chartId;
            var canvas = document.getElementById(chartId);
            if (!canvas) return;
            var link = document.createElement('a');
            link.download = 'PartPulse_' + chartId + '_' + new Date().toISOString().slice(0,10) + '.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        });

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
            renderSpendForecast(spendTime);
            detectAndShowAnomalies(spendTime);
            renderOrderStatus(statusDist);
            renderSpendByBuilding(buildingSpend);
            renderSpendBySupplier(supplierSpend);
            renderSpendByCategory(categorySpend);
            renderSupplierPerformance(supplierPerf);
            renderTopParts(topParts);
            applyWidgetVisibility();

            // Track last refresh time
            lastRefreshTime = Date.now();
            var updatedEl = document.getElementById('analyticsLastUpdated');
            if (updatedEl) {
                updatedEl.textContent = 'Updated just now';
                if (!window._analyticsRefreshTimer) {
                    window._analyticsRefreshTimer = setInterval(function() {
                        var el2 = document.getElementById('analyticsLastUpdated');
                        if (!el2) return;
                        var secs = lastRefreshTime ? Math.round((Date.now() - lastRefreshTime) / 1000) : 0;
                        el2.textContent = secs < 60 ? 'Updated just now' : secs < 3600 ? `Updated ${Math.floor(secs/60)}m ago` : `Updated ${Math.floor(secs/3600)}h ago`;
                    }, 30000);
                }
            }
        } catch (err) {
            console.error('Analytics load error:', err);
            showError('Failed to load analytics data. ' + err.message);
        }
    }

    function renderKPIs(d) {
        const grid = document.getElementById('analyticsKpiGrid');
        if (!grid) return;

        function trendBadge(current, previous, isLowerBetter) {
            if (previous == null || previous === 0 || current == null) return '';
            const pct = ((current - previous) / previous * 100);
            const isUp = pct > 0;
            const isGood = isLowerBetter ? !isUp : isUp;
            const arrow = isUp ? '▲' : '▼';
            const color = isGood ? '#22c55e' : '#ef4444';
            const bg = isGood ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';
            return `<div class="kpi-trend-badge" style="color:${color};background:${bg};">${arrow} ${Math.abs(pct).toFixed(1)}% vs prev</div>`;
        }

        const prev = d.previousPeriod || {};
        const cards = [
            { icon: '💰', rawVal: parseFloat(d.totalSpend)||0, value: fmtMoney(d.totalSpend), label: 'Total Spend', trend: trendBadge(parseFloat(d.totalSpend), prev.totalSpend, false), isFloat: true },
            { icon: '📦', rawVal: parseInt(d.totalOrders)||0, value: fmtNum(d.totalOrders), label: 'Total Orders', trend: trendBadge(parseInt(d.totalOrders), prev.totalOrders, false), isFloat: false },
            { icon: '📊', rawVal: parseFloat(d.avgOrderValue)||0, value: fmtMoney(d.avgOrderValue), label: 'Avg Order Value', trend: trendBadge(parseFloat(d.avgOrderValue), prev.avgOrderValue, false), isFloat: true },
            { icon: '⏱', rawVal: parseFloat(d.avgLeadTimeDays)||0, value: (parseFloat(d.avgLeadTimeDays)||0).toFixed(1)+'d', label: 'Avg Lead Time', trend: '', isFloat: true },
            { icon: '✅', rawVal: parseFloat(d.deliveryRate)||0, value: fmtPct(d.deliveryRate), label: 'Delivery Rate', trend: '', isFloat: true },
            { icon: '🔄', rawVal: parseInt(d.ordersInProgress)||0, value: fmtNum(d.ordersInProgress), label: 'In Progress', trend: '', isFloat: false }
        ];

        grid.innerHTML = cards.map((c, i) => `
            <div class="kpi-card kpi-card--hoverable">
                <div class="kpi-icon">${c.icon}</div>
                <div class="kpi-value" data-target="${c.rawVal}" data-float="${c.isFloat}" data-display="${c.value}">0</div>
                <div class="kpi-label">${c.label}</div>
                ${c.trend}
            </div>`).join('');

        // Animate counters
        grid.querySelectorAll('.kpi-value[data-target]').forEach(function(el) {
            const target = parseFloat(el.dataset.target) || 0;
            const isFloat = el.dataset.float === 'true';
            const displayVal = el.dataset.display;
            const duration = 900;
            const start = performance.now();
            function tick(now) {
                const elapsed = Math.min(now - start, duration);
                const progress = elapsed / duration;
                // easeOutCubic
                const ease = 1 - Math.pow(1 - progress, 3);
                const current = target * ease;
                if (isFloat && target > 100) {
                    el.textContent = current.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';
                } else if (isFloat) {
                    el.textContent = current.toFixed(1) + (displayVal.includes('%') ? '%' : displayVal.includes('d') ? 'd' : '');
                } else {
                    el.textContent = Math.round(current).toLocaleString('de-DE');
                }
                if (progress < 1) requestAnimationFrame(tick);
                else el.textContent = displayVal;
            }
            requestAnimationFrame(tick);
        });
    }

    function renderSpendOverTime(data) {
        const canvas = document.getElementById('chartSpendOverTime');
        if (!canvas || typeof Chart === 'undefined') return;
        destroyChart('spendOverTime');

        const ctx2d = canvas.getContext('2d');
        const gradient = ctx2d.createLinearGradient(0, 0, 0, 320);
        gradient.addColorStop(0, 'rgba(56,189,248,0.85)');
        gradient.addColorStop(1, 'rgba(56,189,248,0.2)');

        var datasets = [{
            label: 'Spend (EUR)',
            data: data.map(function(d) { return d.total; }),
            backgroundColor: gradient,
            borderRadius: 4,
            maxBarThickness: 40
        }];

        if (comparisonMode && data.length >= 2) {
            var compData = [null].concat(data.slice(0, data.length - 1).map(function(d) { return d.total; }));
            datasets.push({
                label: 'Prev Period',
                data: compData,
                backgroundColor: 'rgba(167,139,250,0.45)',
                borderRadius: 4,
                maxBarThickness: 30
            });
        }

        chartsRegistry['spendOverTime'] = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: data.map(d => d.period),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                animation: { duration: 800, easing: 'easeInOutQuart' },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: comparisonMode },
                    tooltip: {
                        backgroundColor: 'rgba(15,23,42,0.97)',
                        titleColor: '#38bdf8',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(56,189,248,0.4)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: { label: ctx => '  ' + fmtMoney(ctx.raw) }
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

    function renderSpendForecast(spendTime) {
        var canvas = document.getElementById('chartSpendForecast');
        if (!canvas || typeof Chart === 'undefined') return;
        destroyChart('spendForecast');

        if (!spendTime || spendTime.length < 3) {
            var note = document.getElementById('forecastNote');
            if (note) note.textContent = 'Not enough data for forecasting (need at least 3 periods).';
            return;
        }

        // Linear regression
        var n = spendTime.length;
        var x = spendTime.map(function(_, i) { return i; });
        var y = spendTime.map(function(d) { return parseFloat(d.total) || 0; });
        var sumX = x.reduce(function(a, b) { return a + b; }, 0);
        var sumY = y.reduce(function(a, b) { return a + b; }, 0);
        var sumXY = x.reduce(function(acc, xi, i) { return acc + xi * y[i]; }, 0);
        var sumX2 = x.reduce(function(acc, xi) { return acc + xi * xi; }, 0);
        var slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        var intercept = (sumY - slope * sumX) / n;

        // R² confidence
        var meanY = sumY / n;
        var ssTotal = y.reduce(function(acc, yi) { return acc + Math.pow(yi - meanY, 2); }, 0);
        var ssRes = y.reduce(function(acc, yi, i) { return acc + Math.pow(yi - (slope * i + intercept), 2); }, 0);
        var rSquared = ssTotal > 0 ? Math.max(0, 1 - ssRes / ssTotal) : 0;

        // Generate future period labels
        var lastPeriod = spendTime[spendTime.length - 1].period;
        function addMonths(periodStr, m) {
            var parts = periodStr.split('-');
            var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1 + m, 1);
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        }
        var forecastPeriods = [1, 2, 3].map(function(m) { return addMonths(lastPeriod, m); });
        var forecastValues = [0, 1, 2].map(function(i) { return Math.max(0, slope * (n + i) + intercept); });

        var allLabels = spendTime.map(function(d) { return d.period; }).concat(forecastPeriods);
        var actualData = y.concat([null, null, null]);
        var forecastData = new Array(n - 1).fill(null).concat([y[n - 1]]).concat(forecastValues);

        var ctx2d = canvas.getContext('2d');
        var gradActual = ctx2d.createLinearGradient(0, 0, 0, 300);
        gradActual.addColorStop(0, 'rgba(56,189,248,0.7)');
        gradActual.addColorStop(1, 'rgba(56,189,248,0.1)');

        chartsRegistry['spendForecast'] = new Chart(canvas, {
            type: 'line',
            data: {
                labels: allLabels,
                datasets: [
                    {
                        label: 'Actual Spend',
                        data: actualData,
                        borderColor: '#38bdf8',
                        backgroundColor: gradActual,
                        borderWidth: 2.5,
                        tension: 0.3,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        fill: true,
                        spanGaps: false
                    },
                    {
                        label: 'Forecast',
                        data: forecastData,
                        borderColor: '#a78bfa',
                        backgroundColor: 'rgba(167,139,250,0.08)',
                        borderWidth: 2,
                        borderDash: [6, 4],
                        tension: 0.3,
                        pointRadius: 5,
                        pointStyle: 'rectRot',
                        pointBackgroundColor: '#a78bfa',
                        fill: false,
                        spanGaps: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                animation: { duration: 900, easing: 'easeInOutQuart' },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: '#cbd5e1', usePointStyle: true, padding: 12, font: { size: 11 } }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15,23,42,0.97)',
                        titleColor: '#38bdf8',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(56,189,248,0.4)',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + (ctx.raw != null ? fmtMoney(ctx.raw) : 'N/A'); } }
                    }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } },
                    y: {
                        beginAtZero: false,
                        ticks: { color: '#94a3b8', callback: function(v) { return v >= 1000 ? (v/1000).toFixed(0)+'k EUR' : v; } },
                        grid: { color: 'rgba(148,163,184,0.08)' }
                    }
                }
            }
        });

        var note = document.getElementById('forecastNote');
        if (note) {
            note.textContent = 'Linear trend forecast — R² confidence: ' + (rSquared * 100).toFixed(0) + '%. Forecast is indicative only.';
        }
    }

    function detectAndShowAnomalies(spendTime) {
        // Remove existing banner
        var existing = document.querySelector('.analytics-anomaly-banner');
        if (existing) existing.remove();

        if (!spendTime || spendTime.length < 4) return;
        var values = spendTime.map(function(d) { return parseFloat(d.total) || 0; });
        var n = values.length;
        var mean = values.reduce(function(a, b) { return a + b; }) / n;
        var variance = values.reduce(function(acc, v) { return acc + Math.pow(v - mean, 2); }, 0) / n;
        var stdDev = Math.sqrt(variance);
        if (stdDev === 0) return;

        var threshold = 2.0;
        var anomalies = [];
        values.forEach(function(v, i) {
            var z = Math.abs((v - mean) / stdDev);
            if (z > threshold) {
                anomalies.push({
                    period: spendTime[i].period,
                    value: v,
                    direction: v > mean ? 'spike' : 'drop',
                    pct: Math.abs((v - mean) / mean * 100).toFixed(1)
                });
            }
        });

        if (anomalies.length === 0) return;

        var latest = anomalies[anomalies.length - 1];
        var icon = latest.direction === 'spike' ? '🚨' : '📉';
        var msg = latest.direction === 'spike'
            ? `Spend spike in ${latest.period}: ${latest.pct}% above average (${fmtMoney(latest.value)})`
            : `Spend drop in ${latest.period}: ${latest.pct}% below average (${fmtMoney(latest.value)})`;

        var banner = document.createElement('div');
        banner.className = 'analytics-anomaly-banner';
        banner.innerHTML = icon + ' <strong>Anomaly Detected:</strong> ' + msg +
            ' <button class="anomaly-dismiss">Dismiss</button>';
        banner.querySelector('.anomaly-dismiss').addEventListener('click', function() { banner.remove(); });

        var kpiGrid = document.getElementById('analyticsKpiGrid');
        if (kpiGrid) kpiGrid.parentNode.insertBefore(banner, kpiGrid);
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
                        backgroundColor: 'rgba(15,23,42,0.97)',
                        titleColor: '#38bdf8',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(56,189,248,0.4)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
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
                        backgroundColor: 'rgba(15,23,42,0.97)',
                        titleColor: '#38bdf8',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(56,189,248,0.4)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
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
                        backgroundColor: 'rgba(15,23,42,0.97)',
                        titleColor: '#38bdf8',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(56,189,248,0.4)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
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
        var wrapper = document.getElementById('topPartsTableWrapper');
        var body = document.getElementById('topPartsTableBody');
        if (!body) return;

        // Add search + limit controls to wrapper header (only once)
        if (wrapper && !wrapper.querySelector('.top-parts-controls')) {
            var h3 = wrapper.querySelector('h3');
            if (h3) {
                var controls = document.createElement('div');
                controls.className = 'top-parts-controls';
                controls.innerHTML =
                    '<input class="top-parts-search" id="topPartsSearch" placeholder="Search parts..." type="text">' +
                    '<select class="top-parts-limit" id="topPartsLimit">' +
                    '<option value="10">Top 10</option>' +
                    '<option value="20" selected>Top 20</option>' +
                    '<option value="50">Top 50</option>' +
                    '<option value="999">All</option>' +
                    '</select>';
                h3.parentNode.insertBefore(controls, h3.nextSibling);
            }
        }

        if (!data || data.length === 0) {
            body.innerHTML = '<p style="color:var(--color-text-secondary);padding:1rem;">No parts data available.</p>';
            return;
        }

        // Keep full data reference for search/filter
        wrapper._allPartsData = data;

        function renderList(items) {
            if (!items || items.length === 0) {
                body.innerHTML = '<p style="color:var(--color-text-secondary);padding:1rem;">No matching parts.</p>';
                return;
            }

            var maxOrders = Math.max.apply(null, items.map(function(p) { return p.orderCount || 0; }));
            var maxSpend  = Math.max.apply(null, items.map(function(p) { return parseFloat(p.totalSpend) || 0; }));

            var rankColors = ['#eab308','#94a3b8','#fb923c']; // gold, silver, bronze

            var html = '<div class="top-parts-list">';
            items.forEach(function(p, i) {
                var rank = i + 1;
                var rankColor = rank <= 3 ? rankColors[rank - 1] : 'var(--color-text-secondary)';
                var rankLabel = rank <= 3 ? ['🥇','🥈','🥉'][rank-1] : rank;
                var freqPct = maxOrders > 0 ? (p.orderCount / maxOrders * 100) : 0;
                var spendPct = maxSpend > 0 ? ((parseFloat(p.totalSpend)||0) / maxSpend * 100) : 0;

                html += '<div class="top-part-card" data-part-desc="' + esc(p.itemDescription) + '">' +
                    '<div class="top-part-rank" style="color:' + rankColor + ';">' + rankLabel + '</div>' +
                    '<div class="top-part-info">' +
                        '<div class="top-part-name" title="' + esc(p.itemDescription) + '">' + esc(p.itemDescription) + '</div>' +
                        '<div class="top-part-bars">' +
                            '<div class="top-part-bar-row">' +
                                '<span class="top-part-bar-label">Frequency</span>' +
                                '<div class="top-part-bar-track"><div class="top-part-bar-fill top-part-bar-freq" style="width:' + freqPct.toFixed(1) + '%"></div></div>' +
                            '</div>' +
                            '<div class="top-part-bar-row">' +
                                '<span class="top-part-bar-label">Spend</span>' +
                                '<div class="top-part-bar-track"><div class="top-part-bar-fill top-part-bar-spend" style="width:' + spendPct.toFixed(1) + '%"></div></div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="top-part-stats">' +
                        '<div class="top-part-stat"><span class="stat-val">' + p.orderCount + '</span><span class="stat-key">orders</span></div>' +
                        '<div class="top-part-stat"><span class="stat-val">' + fmtNum(p.totalQty) + '</span><span class="stat-key">units</span></div>' +
                        '<div class="top-part-stat"><span class="stat-val">' + fmtMoney(p.totalSpend) + '</span><span class="stat-key">spend</span></div>' +
                    '</div>' +
                '</div>';
            });
            html += '</div>';
            body.innerHTML = html;

            body.querySelectorAll('.top-part-card').forEach(function(card) {
                card.addEventListener('click', function() {
                    var desc = this.dataset.partDesc;
                    openDrillDown('part', desc, 'Reorders — ' + desc);
                });
            });
        }

        function applyFilters() {
            var allData = wrapper._allPartsData || [];
            var search = (document.getElementById('topPartsSearch')?.value || '').toLowerCase().trim();
            var limitEl = document.getElementById('topPartsLimit');
            var limit = limitEl ? parseInt(limitEl.value) : 20;
            var filtered = allData;
            if (search) {
                filtered = filtered.filter(function(p) {
                    return (p.itemDescription||'').toLowerCase().includes(search);
                });
            }
            renderList(filtered.slice(0, limit));
        }

        renderList(data.slice(0, 20));

        // Bind search and limit
        var searchEl = document.getElementById('topPartsSearch');
        var limitEl  = document.getElementById('topPartsLimit');
        if (searchEl) { searchEl.removeEventListener('input', searchEl._handler); searchEl._handler = applyFilters; searchEl.addEventListener('input', applyFilters); }
        if (limitEl)  { limitEl.removeEventListener('change', limitEl._handler); limitEl._handler = applyFilters; limitEl.addEventListener('change', applyFilters); }
    }

    function exportToXLSX() {
        if (typeof XLSX === 'undefined') { alert('Excel export library not loaded.'); return; }
        var wb = XLSX.utils.book_new();

        function setColWidths(ws, widths) {
            ws['!cols'] = widths.map(function(w) { return { wch: w }; });
        }

        // Summary
        var summaryData = [
            ['PartPulse Analytics Report'],
            ['Generated:', new Date().toLocaleString()],
            ['Period:', getPeriodLabel()],
            [],
            ['KPI', 'Value'],
            ['Total Spend (EUR)', parseFloat(lastData.summary?.totalSpend) || 0],
            ['Total Orders', parseInt(lastData.summary?.totalOrders) || 0],
            ['Avg Order Value (EUR)', parseFloat(lastData.summary?.avgOrderValue) || 0],
            ['Avg Lead Time (days)', parseFloat(lastData.summary?.avgLeadTimeDays) || 0],
            ['Delivery Rate (%)', parseFloat(lastData.summary?.deliveryRate) || 0],
            ['Orders In Progress', parseInt(lastData.summary?.ordersInProgress) || 0]
        ];
        var summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
        setColWidths(summarySheet, [30, 22]);
        XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

        if (lastData.spendTime?.length) {
            var rows = [['Month', 'Total Spend (EUR)', 'Order Count']];
            lastData.spendTime.forEach(function(r) { rows.push([r.period, parseFloat(r.total)||0, parseInt(r.count)||0]); });
            var ws = XLSX.utils.aoa_to_sheet(rows);
            setColWidths(ws, [14, 20, 14]);
            XLSX.utils.book_append_sheet(wb, ws, 'Spend Over Time');
        }

        if (lastData.statusDist?.length) {
            var rows = [['Status', 'Count', '% of Total']];
            lastData.statusDist.forEach(function(r) { rows.push([r.status, parseInt(r.count)||0, parseFloat(r.percent)||0]); });
            var ws = XLSX.utils.aoa_to_sheet(rows);
            setColWidths(ws, [28, 10, 14]);
            XLSX.utils.book_append_sheet(wb, ws, 'Orders by Status');
        }

        if (lastData.buildingSpend?.length) {
            var rows = [['Building Code', 'Building Name', 'Total Spend (EUR)', 'Orders', '% of Total']];
            lastData.buildingSpend.forEach(function(r) { rows.push([r.building, r.buildingName, parseFloat(r.total)||0, parseInt(r.count)||0, parseFloat(r.percent)||0]); });
            var ws = XLSX.utils.aoa_to_sheet(rows);
            setColWidths(ws, [16, 24, 20, 10, 14]);
            XLSX.utils.book_append_sheet(wb, ws, 'Spend by Building');
        }

        if (lastData.supplierSpend?.length) {
            var rows = [['Supplier', 'Total Spend (EUR)', 'Orders', 'Avg Value (EUR)']];
            lastData.supplierSpend.forEach(function(r) { rows.push([r.supplierName, parseFloat(r.total)||0, parseInt(r.orderCount)||0, parseFloat(r.avgValue)||0]); });
            var ws = XLSX.utils.aoa_to_sheet(rows);
            setColWidths(ws, [36, 20, 10, 20]);
            XLSX.utils.book_append_sheet(wb, ws, 'Top Suppliers');
        }

        if (lastData.categorySpend?.length) {
            var rows = [['Category', 'Total Spend (EUR)', 'Orders', '% of Total']];
            lastData.categorySpend.forEach(function(r) { rows.push([r.category||'(Uncategorized)', parseFloat(r.total)||0, parseInt(r.count)||0, parseFloat(r.percent)||0]); });
            var ws = XLSX.utils.aoa_to_sheet(rows);
            setColWidths(ws, [32, 20, 10, 14]);
            XLSX.utils.book_append_sheet(wb, ws, 'Spend by Category');
        }

        if (lastData.supplierPerf?.length) {
            var rows = [['Supplier', 'Total Orders', 'Delivered', 'On-Time Rate (%)', 'Avg Lead Days', 'Total Spend (EUR)']];
            lastData.supplierPerf.forEach(function(r) { rows.push([r.supplierName, parseInt(r.totalOrders)||0, parseInt(r.delivered)||0, parseFloat(r.onTimeRate)||0, parseFloat(r.avgLeadDays)||0, parseFloat(r.totalSpend)||0]); });
            var ws = XLSX.utils.aoa_to_sheet(rows);
            setColWidths(ws, [36, 14, 12, 18, 16, 20]);
            XLSX.utils.book_append_sheet(wb, ws, 'Supplier Performance');
        }

        if (lastData.topParts?.length) {
            var rows = [['Part Description', 'Times Ordered', 'Total Qty', 'Total Spend (EUR)']];
            lastData.topParts.forEach(function(r) { rows.push([r.itemDescription, parseInt(r.orderCount)||0, parseInt(r.totalQty)||0, parseFloat(r.totalSpend)||0]); });
            var ws = XLSX.utils.aoa_to_sheet(rows);
            setColWidths(ws, [60, 14, 12, 20]);
            XLSX.utils.book_append_sheet(wb, ws, 'Top Parts');
        }

        var filename = 'PartPulse_Analytics_' + getPeriodLabel().replace(/\s+/g,'_') + '_' + new Date().toISOString().slice(0,10) + '.xlsx';
        XLSX.writeFile(wb, filename);
    }

    function exportToPDF() {
        if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
            alert('PDF library not loaded.'); return;
        }
        var jsPDF = window.jspdf.jsPDF;
        var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        var pageW = doc.internal.pageSize.width;   // 210
        var pageH = doc.internal.pageSize.height;  // 297
        var margin = 14;
        var contentW = pageW - margin * 2;

        // Colors
        var headerBg  = [37, 99, 235];    // blue-600
        var headerText = [255, 255, 255];
        var titleColor = [30, 58, 138];   // blue-900
        var bodyText   = [30, 41, 59];    // slate-800
        var mutedText  = [100, 116, 139]; // slate-500
        var rowAlt     = [248, 250, 252]; // slate-50

        function drawPageHeader(pageTitle) {
            doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
            doc.rect(0, 0, pageW, 16, 'F');
            doc.setFontSize(11);
            doc.setTextColor(headerText[0], headerText[1], headerText[2]);
            doc.setFont('helvetica', 'bold');
            doc.text('PartPulse Analytics', margin, 10.5);
            doc.setFontSize(8.5);
            doc.setFont('helvetica', 'normal');
            doc.text(pageTitle, pageW - margin, 10.5, { align: 'right' });
        }

        function drawFooter() {
            var total = doc.getNumberOfPages();
            for (var i = 1; i <= total; i++) {
                doc.setPage(i);
                doc.setFillColor(248, 250, 252);
                doc.rect(0, pageH - 10, pageW, 10, 'F');
                doc.setFontSize(7);
                doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
                doc.text('PartPulse — Financial Analytics Report  |  Period: ' + getPeriodLabel(), margin, pageH - 4);
                doc.text('Page ' + i + ' of ' + total, pageW - margin, pageH - 4, { align: 'right' });
            }
        }

        function sectionTitle(text, y) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
            doc.text(text, margin, y);
            doc.setDrawColor(headerBg[0], headerBg[1], headerBg[2]);
            doc.setLineWidth(0.5);
            doc.line(margin, y + 1.5, pageW - margin, y + 1.5);
            return y + 7;
        }

        function lightTable(head, rows, startY, opts) {
            if (!rows || rows.length === 0) return startY;
            doc.autoTable(Object.assign({
                startY: startY,
                head: [head],
                body: rows,
                theme: 'striped',
                styles: {
                    fontSize: 8,
                    cellPadding: 2.5,
                    textColor: bodyText,
                    fillColor: [255, 255, 255],
                    lineColor: [226, 232, 240],
                    lineWidth: 0.15
                },
                headStyles: {
                    fillColor: headerBg,
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 7.5
                },
                alternateRowStyles: { fillColor: rowAlt },
                margin: { left: margin, right: margin },
                didDrawPage: function(data) { drawPageHeader('Report'); }
            }, opts || {}));
            return doc.lastAutoTable.finalY + 8;
        }

        // ── PAGE 1: Cover + KPIs ──────────────────────────────────
        drawPageHeader('Executive Summary');
        var y = 24;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
        doc.text('Financial Analytics Report', margin, y);
        y += 8;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
        doc.text('Period: ' + getPeriodLabel() + '   |   Generated: ' + new Date().toLocaleString('de-DE'), margin, y);
        y += 10;

        if (lastData.summary) {
            var kpis = [
                { label: 'Total Spend', value: fmtMoney(lastData.summary.totalSpend) },
                { label: 'Total Orders', value: String(lastData.summary.totalOrders) },
                { label: 'Avg Order Value', value: fmtMoney(lastData.summary.avgOrderValue) },
                { label: 'Avg Lead Time', value: (lastData.summary.avgLeadTimeDays||0).toFixed(1) + ' days' },
                { label: 'Delivery Rate', value: fmtPct(lastData.summary.deliveryRate) },
                { label: 'In Progress', value: String(lastData.summary.ordersInProgress) }
            ];
            var cols = 3;
            var cardW = (contentW - (cols - 1) * 4) / cols;
            var cardH = 20;
            kpis.forEach(function(k, i) {
                var col = i % cols;
                var row = Math.floor(i / cols);
                var x = margin + col * (cardW + 4);
                var cy = y + row * (cardH + 4);
                doc.setDrawColor(226, 232, 240);
                doc.setFillColor(248, 250, 252);
                doc.roundedRect(x, cy, cardW, cardH, 2, 2, 'FD');
                doc.setFontSize(7);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
                doc.text(k.label.toUpperCase(), x + 3, cy + 6);
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(headerBg[0], headerBg[1], headerBg[2]);
                doc.text(k.value, x + 3, cy + 14);
            });
            y += 2 * (cardH + 4) + 8;
        }

        if (lastData.spendTime && lastData.spendTime.length) {
            y = sectionTitle('Spend Over Time', y);
            y = lightTable(
                ['Month', 'Total Spend (EUR)', 'Orders'],
                lastData.spendTime.map(function(r) { return [r.period, (parseFloat(r.total)||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2}), r.count]; }),
                y
            );
        }

        // ── PAGE 2: Spend by Building + Top Suppliers ─────────────
        doc.addPage();
        drawPageHeader('Spend by Building & Suppliers');
        y = 24;

        if (lastData.buildingSpend && lastData.buildingSpend.length) {
            y = sectionTitle('Spend by Building', y);
            y = lightTable(
                ['Building Code', 'Building Name', 'Total Spend (EUR)', 'Orders', '% of Total'],
                lastData.buildingSpend.map(function(r) { return [r.building, r.buildingName, (parseFloat(r.total)||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2}), r.count, (r.percent||0).toFixed(1)+'%']; }),
                y
            );
        }

        if (lastData.supplierSpend && lastData.supplierSpend.length) {
            y = sectionTitle('Top Suppliers by Spend', y);
            y = lightTable(
                ['Supplier', 'Total Spend (EUR)', 'Orders', 'Avg Value (EUR)'],
                lastData.supplierSpend.map(function(r) { return [r.supplierName, (parseFloat(r.total)||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2}), r.orderCount, (parseFloat(r.avgValue)||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})]; }),
                y
            );
        }

        // ── PAGE 3: Status + Categories ───────────────────────────
        doc.addPage();
        drawPageHeader('Order Status & Categories');
        y = 24;

        if (lastData.statusDist && lastData.statusDist.length) {
            y = sectionTitle('Orders by Status', y);
            y = lightTable(
                ['Status', 'Count', '% of Total'],
                lastData.statusDist.map(function(r) { return [r.status, r.count, (r.percent||0).toFixed(1)+'%']; }),
                y
            );
        }

        if (lastData.categorySpend && lastData.categorySpend.length) {
            y = sectionTitle('Spend by Category', y);
            y = lightTable(
                ['Category', 'Total Spend (EUR)', 'Orders', '% of Total'],
                lastData.categorySpend.map(function(r) { return [r.category || '(Uncategorized)', (parseFloat(r.total)||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2}), r.count, (r.percent||0).toFixed(1)+'%']; }),
                y
            );
        }

        // ── PAGE 4: Supplier Performance + Top Parts ──────────────
        doc.addPage();
        drawPageHeader('Supplier Performance & Top Parts');
        y = 24;

        if (lastData.supplierPerf && lastData.supplierPerf.length) {
            y = sectionTitle('Supplier Performance', y);
            y = lightTable(
                ['Supplier', 'Orders', 'Delivered', 'On-Time %', 'Avg Lead Days', 'Total Spend (EUR)'],
                lastData.supplierPerf.map(function(r) { return [r.supplierName, r.totalOrders, r.delivered, (r.onTimeRate||0).toFixed(1)+'%', (r.avgLeadDays||0).toFixed(1), (parseFloat(r.totalSpend)||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})]; }),
                y
            );
        }

        if (lastData.topParts && lastData.topParts.length) {
            y = sectionTitle('Top Ordered Parts', y);
            y = lightTable(
                ['Part Description', 'Times Ordered', 'Total Qty', 'Total Spend (EUR)'],
                lastData.topParts.map(function(r) { return [String(r.itemDescription||'').substring(0,70), r.orderCount, r.totalQty, (parseFloat(r.totalSpend)||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})]; }),
                y
            );
        }

        drawFooter();

        var filename = 'PartPulse_Analytics_' + getPeriodLabel().replace(/[^a-zA-Z0-9]/g,'_') + '_' + new Date().toISOString().slice(0,10) + '.pdf';
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
        _apiCache = {};
        renderSkeleton();
        loadData();
    }

    // Export module
    window.AnalyticsModule = { init: init, refresh: refresh, clearCache: function() { _apiCache = {}; } };

        // ── World-Class Upgrade: Wire in Insights + Forecasting ──────────────

    async function loadInsightsAndForecast(data) {
    // Remap lastData keys → what the insight/forecast modules expect
    const normalized = {
        bySupplier:          data.supplierSpend  || [],
        topParts:            data.topParts        || [],
        spendOverTime:       data.spendTime       || [],
        supplierPerformance: data.supplierPerf    || [],
        kpis:                data.summary         || {}
    };

    // Insights Panel
    if (window.AnalyticsInsights && document.getElementById('analyticsInsightsPanel')) {
        const insights = await window.AnalyticsInsights.generateInsights(normalized);
        window.AnalyticsInsights.renderInsightsPanel(insights, 'analyticsInsightsPanel');
    }

    // Forecast Panel
    if (window.AnalyticsForecasting && normalized.spendOverTime.length >= 3) {
        window.AnalyticsForecasting.renderForecastPanel(normalized.spendOverTime, 'analyticsForecastPanel');
        if (document.getElementById('chartForecast'))
            window.AnalyticsForecasting.renderForecastChart(normalized.spendOverTime, 'chartForecast', chartsRegistry);
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
