// frontend/analytics-forecasting.js - Predictive Spend Forecasting
(function() {
    'use strict';

    window.AnalyticsForecasting = {
        forecastSpend: forecastSpend,
        detectTrend: detectTrend,
        renderForecastChart: renderForecastChart,
        renderForecastPanel: renderForecastPanel
    };

    function fmt(val) {
        const n = parseFloat(val);
        if (isNaN(n)) return '0.00 EUR';
        return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';
    }

    function addMonths(periodStr, months) {
        const [year, month] = periodStr.split('-').map(Number);
        const d = new Date(year, month - 1 + months, 1);
        return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    }

    function fmtPeriod(period) {
        const [y, m] = period.split('-');
        return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m)-1]+' '+y;
    }

    function forecastSpend(historicalData, monthsAhead) {
        monthsAhead = monthsAhead || 3;
        if (!historicalData || historicalData.length < 3) return { forecast:[], confidence:'low', trend:'insufficient_data' };

        const values = historicalData.map(d => parseFloat(d.totalSpend||0));
        const n = values.length;
        const xMean = (n-1)/2;
        const yMean = values.reduce((s,v)=>s+v,0)/n;
        let ssXX=0, ssXY=0;
        for (let i=0; i<n; i++) { ssXX+=Math.pow(i-xMean,2); ssXY+=(i-xMean)*(values[i]-yMean); }
        const slope = ssXX!==0 ? ssXY/ssXX : 0;
        const intercept = yMean - slope*xMean;

        const last = historicalData[historicalData.length-1].period;
        const forecast = [];
        for (let i=1; i<=monthsAhead; i++) {
            const predicted = Math.max(0, intercept + slope*(n-1+i));
            const uncertainty = 0.10+(i-1)*0.05;
            forecast.push({
                period: addMonths(last,i),
                predicted,
                lower: Math.max(0, predicted*(1-uncertainty)),
                upper: predicted*(1+uncertainty),
                isForecast:true
            });
        }

        return {
            forecast,
            trend: detectTrend(values),
            confidence: n>=12?'high':n>=6?'medium':'low',
            slope
        };
    }

    function detectTrend(values) {
        if (values.length < 2) return 'stable';
        const half = Math.floor(values.length/2);
        const f = values.slice(0,half).reduce((s,v)=>s+v,0)/half;
        const s = values.slice(half).reduce((s,v)=>s+v,0)/(values.length-half);
        const pct = f>0?(s-f)/f:0;
        return pct>0.10?'increasing':pct<-0.10?'decreasing':'stable';
    }

    function renderForecastChart(historicalData, canvasId, chartsRegistry) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || typeof Chart==='undefined') return;
        if (chartsRegistry && chartsRegistry[canvasId]) { chartsRegistry[canvasId].destroy(); delete chartsRegistry[canvasId]; }

        const result = forecastSpend(historicalData, 3);
        if (!result.forecast.length) return;

        const histLabels = historicalData.map(d=>fmtPeriod(d.period));
        const fcLabels = result.forecast.map(d=>fmtPeriod(d.period));
        const allLabels = [...histLabels, ...fcLabels];
        const histValues = historicalData.map(d=>parseFloat(d.totalSpend||0));
        const lastHist = histValues[histValues.length-1];

        const chart = new Chart(canvas, {
            type:'line',
            data: {
                labels: allLabels,
                datasets:[
                    {
                        label:'Actual Spend',
                        data:[...histValues, ...new Array(fcLabels.length).fill(null)],
                        borderColor:'#38bdf8', backgroundColor:'rgba(56,189,248,0.08)',
                        borderWidth:2.5, pointRadius:4, fill:true, tension:0.3
                    },
                    {
                        label:'Forecast',
                        data:[...new Array(histLabels.length-1).fill(null), lastHist, ...result.forecast.map(d=>d.predicted)],
                        borderColor:'#a78bfa', backgroundColor:'rgba(167,139,250,0.08)',
                        borderWidth:2.5, borderDash:[6,4], pointRadius:5,
                        pointStyle:'triangle', fill:true, tension:0.3
                    }
                ]
            },
            options:{
                responsive:true, maintainAspectRatio:false,
                plugins:{
                    legend:{ labels:{ color:'#94a3b8', font:{size:11} } },
                    tooltip:{ callbacks:{ label: ctx => ctx.dataset.label+': '+fmt(ctx.parsed.y) } }
                },
                scales:{
                    x:{ ticks:{color:'#64748b', maxRotation:45}, grid:{color:'rgba(148,163,184,0.08)'} },
                    y:{ ticks:{color:'#64748b', callback: v=>v>=1000?(v/1000).toFixed(1)+'k':v}, grid:{color:'rgba(148,163,184,0.08)'} }
                }
            }
        });
        if (chartsRegistry) chartsRegistry[canvasId] = chart;
        return chart;
    }

    function renderForecastPanel(historicalData, containerId) {
        const el = document.getElementById(containerId);
        if (!el) return;
        if (!historicalData || historicalData.length < 3) {
            el.innerHTML = '<p style="color:var(--color-text-secondary);font-size:0.85rem;">Need at least 3 months of data for forecasting.</p>';
            return;
        }
        const result = forecastSpend(historicalData, 3);
        const trendIcons = {increasing:'📈',decreasing:'📉',stable:'➡️',insufficient_data:'❓'};
        const trendColors = {increasing:'#ef4444',decreasing:'#22c55e',stable:'#38bdf8',insufficient_data:'#6b7280'};
        const confColors = {high:'#22c55e',medium:'#eab308',low:'#ef4444'};

        let html = `<div class="forecast-meta">
            <span>Trend: <strong style="color:${trendColors[result.trend]}">${trendIcons[result.trend]} ${result.trend}</strong></span>
            <span>Confidence: <strong style="color:${confColors[result.confidence]}">${result.confidence.toUpperCase()}</strong></span>
            <span style="color:var(--color-text-secondary);font-size:0.75rem;">Based on ${historicalData.length} months</span>
        </div><div class="forecast-cards">`;

        result.forecast.forEach(f => {
            html += `<div class="forecast-month-card">
                <div class="forecast-month-label">${fmtPeriod(f.period)}</div>
                <div class="forecast-month-value">${fmt(f.predicted)}</div>
                <div class="forecast-month-range">${fmt(f.lower)} – ${fmt(f.upper)}</div>
            </div>`;
        });
        html += '</div>';
        el.innerHTML = html;
    }

})();
