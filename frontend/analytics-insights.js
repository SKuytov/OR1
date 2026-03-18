// frontend/analytics-insights.js - AI-Powered Cost-Saving Insights Engine
(function() {
    'use strict';

    window.AnalyticsInsights = {
        generateInsights: generateInsights,
        renderInsightsPanel: renderInsightsPanel
    };

    function fmt(val) {
        const n = parseFloat(val);
        if (isNaN(n)) return '0.00 EUR';
        return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';
    }

    function esc(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]||c));
    }

    async function generateInsights(data) {
        const insights = [];

        // 1. Supplier Consolidation
        if (data.bySupplier && data.bySupplier.length >= 4) {
            const sorted = [...data.bySupplier].sort((a,b) => parseFloat(b.totalSpend)-parseFloat(a.totalSpend));
            const total = sorted.reduce((s,x) => s+parseFloat(x.totalSpend||0),0);
            let cum=0, rec=0;
            for (const s of sorted) { cum+=parseFloat(s.totalSpend||0); rec++; if(cum>=total*0.8) break; }
            const savings = total * Math.min(0.10, (sorted.length-rec)/sorted.length*0.15);
            if (savings > 100) insights.push({
                priority:'high', icon:'🤝',
                title:'Supplier Consolidation Opportunity',
                description:`You use <strong>${sorted.length}</strong> suppliers. Top <strong>${rec}</strong> cover 80% of spend. Consolidating could save <strong>${fmt(savings)}</strong>/year.`,
                savings, action:'Negotiate volume discounts with top suppliers'
            });
        }

        // 2. Price Anomalies
        if (data.topParts && data.topParts.length >= 3) {
            const prices = data.topParts.map(p=>parseFloat(p.avgUnitPrice||0)).filter(p=>p>0);
            const mean = prices.reduce((s,p)=>s+p,0)/prices.length;
            const std = Math.sqrt(prices.reduce((s,p)=>s+Math.pow(p-mean,2),0)/prices.length);
            const anomalies = data.topParts.filter(p => parseFloat(p.avgUnitPrice||0) > mean+2*std);
            if (anomalies.length > 0) {
                const savings = anomalies.reduce((s,p) => s+(parseFloat(p.avgUnitPrice||0)-mean)*parseInt(p.totalQty||1),0);
                insights.push({
                    priority:'high', icon:'⚠️',
                    title:`${anomalies.length} Price Anomalie(s) Detected`,
                    description:`Items priced >2σ above average. Top: <em>${esc(anomalies[0].itemDescription)}</em>. Potential savings: <strong>${fmt(savings)}</strong>.`,
                    savings, action:'Renegotiate prices for flagged items'
                });
            }
        }

        // 3. Bulk Purchasing
        if (data.topParts) {
            const items = data.topParts.filter(p=>parseInt(p.orderCount||0)>=4);
            const savings = items.reduce((s,p)=>s+parseFloat(p.avgUnitPrice||0)*parseInt(p.totalQty||0)*0.08,0);
            if (savings > 50) insights.push({
                priority:'medium', icon:'📦',
                title:'Bulk Purchasing Opportunity',
                description:`<strong>${items.length}</strong> items ordered 4+ times. Switching to bulk orders (8% discount) = <strong>${fmt(savings)}</strong> savings.`,
                savings, action:'Create standing/blanket orders for high-frequency items'
            });
        }

        // 4. Seasonal Patterns
        if (data.spendOverTime && data.spendOverTime.length >= 6) {
            const monthly = data.spendOverTime.map(d=>({period:d.period,spend:parseFloat(d.totalSpend||0)}));
            const avg = monthly.reduce((s,d)=>s+d.spend,0)/monthly.length;
            const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const peaks = monthly.filter(d=>d.spend>avg*1.3).map(d=>{
                const m = parseInt((d.period||'').split('-')[1]||'1')-1;
                return monthNames[m]||d.period;
            });
            if (peaks.length > 0) insights.push({
                priority:'low', icon:'📅',
                title:'Seasonal Spending Pattern Detected',
                description:`Spending peaks in: <strong>${peaks.join(', ')}</strong>. Pre-ordering before these months can reduce rush premiums.`,
                savings: avg*0.05*peaks.length,
                action:'Schedule procurement ahead of peak months'
            });
        }

        // 5. Slow Suppliers
        if (data.supplierPerformance) {
            const slow = data.supplierPerformance.filter(s=>parseFloat(s.avgDeliveryTime||0)>14);
            if (slow.length > 0) insights.push({
                priority:'medium', icon:'⏱️',
                title:`${slow.length} Slow Supplier(s) Identified`,
                description:`Average delivery >14 days: <em>${slow.slice(0,3).map(s=>esc(s.supplierName)).join(', ')}</em>. Affects urgency response capability.`,
                savings:0, action:'Find alternative suppliers for time-critical parts'
            });
        }

        return insights.sort((a,b)=>({high:3,medium:2,low:1}[b.priority]-{high:3,medium:2,low:1}[a.priority]));
    }

    function renderInsightsPanel(insights, containerId) {
        const el = document.getElementById(containerId);
        if (!el) return;
        if (!insights || insights.length === 0) {
            el.innerHTML = '<div class="insights-empty"><span>✅</span><p>No significant issues detected for this period. Great work!</p></div>';
            return;
        }
        const totalSavings = insights.filter(i=>i.savings>0).reduce((s,i)=>s+i.savings,0);
        let html = '';
        if (totalSavings > 0) html += `<div class="insights-total-banner">💡 Total Estimated Savings Opportunity: <strong>${fmt(totalSavings)}</strong></div>`;
        html += '<div class="insights-grid">';
        insights.forEach(ins => {
            html += `
            <div class="insight-card insight-priority-${ins.priority}">
                <div class="insight-header">
                    <span class="insight-icon">${ins.icon}</span>
                    <span class="insight-title">${esc(ins.title)}</span>
                    <span class="insight-badge insight-badge-${ins.priority}">${ins.priority.toUpperCase()}</span>
                </div>
                <div class="insight-desc">${ins.description}</div>
                ${ins.savings>0?`<div class="insight-savings">💰 Est. savings: <strong>${fmt(ins.savings)}</strong></div>`:''}
                <div class="insight-action">→ ${esc(ins.action)}</div>
            </div>`;
        });
        html += '</div>';
        el.innerHTML = html;
    }

})();
