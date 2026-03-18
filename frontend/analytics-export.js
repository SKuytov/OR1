// frontend/analytics-export.js - Multi-Format Export Module
(function() {
    'use strict';

    window.AnalyticsExport = {
        exportCSV: exportCSV,
        exportJSON: exportJSON,
        printReport: printReport
    };

    function downloadBlob(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function exportCSV(data, periodLabel) {
        const rows = [];
        const ts = new Date().toISOString().slice(0,10);

        // KPIs
        rows.push(['=== KPI SUMMARY ===']);
        rows.push(['Period', periodLabel || 'All Time']);
        if (data.kpis) {
            rows.push(['Total Spend', data.kpis.totalSpend || 0]);
            rows.push(['Total Orders', data.kpis.totalOrders || 0]);
            rows.push(['Avg Order Value', data.kpis.avgOrderValue || 0]);
            rows.push(['On-Time Rate', (data.kpis.onTimeRate || 0) + '%']);
            rows.push(['Active Suppliers', data.kpis.activeSuppliers || 0]);
        }
        rows.push([]);

        // Spend over time
        if (data.spendOverTime && data.spendOverTime.length > 0) {
            rows.push(['=== SPEND OVER TIME ===']);
            rows.push(['Period', 'Total Spend (EUR)', 'Order Count']);
            data.spendOverTime.forEach(d => rows.push([d.period, d.totalSpend, d.orderCount]));
            rows.push([]);
        }

        // Suppliers
        if (data.bySupplier && data.bySupplier.length > 0) {
            rows.push(['=== TOP SUPPLIERS ===']);
            rows.push(['Supplier', 'Total Spend (EUR)', 'Orders', 'Share %']);
            const total = data.bySupplier.reduce((s,x)=>s+parseFloat(x.totalSpend||0),0);
            data.bySupplier.forEach(s => rows.push([
                s.supplierName, s.totalSpend, s.orderCount,
                total>0 ? (parseFloat(s.totalSpend)/total*100).toFixed(1) : '0'
            ]));
            rows.push([]);
        }

        // Top Parts
        if (data.topParts && data.topParts.length > 0) {
            rows.push(['=== TOP ORDERED PARTS ===']);
            rows.push(['Item Description', 'Order Count', 'Total Qty', 'Avg Unit Price (EUR)', 'Total Spend (EUR)']);
            data.topParts.forEach(p => rows.push([
                '"' + (p.itemDescription||'').replace(/"/g,'""') + '"',
                p.orderCount, p.totalQty, p.avgUnitPrice, p.totalSpend
            ]));
            rows.push([]);
        }

        // Supplier Performance
        if (data.supplierPerformance && data.supplierPerformance.length > 0) {
            rows.push(['=== SUPPLIER PERFORMANCE ===']);
            rows.push(['Supplier', 'Total Orders', 'Delivered', 'On-Time %', 'Avg Delivery Days', 'Total Spend (EUR)']);
            data.supplierPerformance.forEach(s => rows.push([
                '"' + (s.supplierName||'').replace(/"/g,'""') + '"',
                s.totalOrders, s.deliveredCount,
                parseFloat(s.onTimeRate||0).toFixed(1),
                parseFloat(s.avgDeliveryTime||0).toFixed(1),
                parseFloat(s.totalSpend||0).toFixed(2)
            ]));
        }

        const csv = rows.map(r => r.join(',')).join('\n');
        downloadBlob('\ufeff' + csv, `analytics_${ts}.csv`, 'text/csv;charset=utf-8');
    }

    function exportJSON(data, periodLabel) {
        const ts = new Date().toISOString().slice(0,10);
        const payload = { exportedAt: new Date().toISOString(), period: periodLabel, ...data };
        downloadBlob(JSON.stringify(payload, null, 2), `analytics_${ts}.json`, 'application/json');
    }

    function printReport(periodLabel) {
        const container = document.getElementById('analyticsTabContent');
        if (!container) return;
        const printWin = window.open('', '_blank');
        printWin.document.write(`<!DOCTYPE html><html><head><title>Analytics Report – ${periodLabel||'All Time'}</title>
        <style>
            body { font-family: Arial, sans-serif; font-size: 13px; color: #1e293b; background: #fff; margin: 2rem; }
            h1 { font-size: 1.4rem; color: #0f172a; border-bottom: 2px solid #38bdf8; padding-bottom: 0.5rem; }
            h3 { font-size: 1rem; color: #475569; margin: 1.5rem 0 0.5rem; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 12px; }
            th { background: #f1f5f9; color: #475569; padding: 6px 10px; text-align: left; font-size: 11px; text-transform: uppercase; }
            td { padding: 5px 10px; border-bottom: 1px solid #e2e8f0; }
            .kpi-row { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
            .kpi-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.75rem 1rem; min-width: 120px; }
            .kpi-val { font-size: 1.4rem; font-weight: 700; color: #0284c7; }
            .kpi-lbl { font-size: 11px; color: #64748b; text-transform: uppercase; }
            canvas { display: none; }
            @media print { button { display:none; } }
        </style></head><body>
        <h1>📊 Analytics Report — ${periodLabel||'All Time'}</h1>
        <p style="color:#64748b;font-size:0.8rem;">Generated: ${new Date().toLocaleString()}</p>
        ${container.innerHTML}
        <script>window.onload=()=>window.print();<\/script>
        </body></html>`);
        printWin.document.close();
    }

})();
