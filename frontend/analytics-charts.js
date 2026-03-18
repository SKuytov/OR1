// frontend/analytics-charts.js - Advanced Chart Configurations
(function() {
    'use strict';

    window.AnalyticsCharts = {
        defaultOptions: getDefaultOptions,
        applyGradient: applyGradient,
        COLORS: ['#38bdf8','#22c55e','#eab308','#a78bfa','#fb923c','#2dd4bf','#f472b6','#ef4444','#84cc16','#f97316'],
        STATUS_COLORS: {
            'New':'#3b82f6','Pending':'#eab308','Quote Requested':'#a78bfa',
            'Quote Received':'#8b5cf6','Quote Under Approval':'#fb923c',
            'Approved':'#22c55e','Ordered':'#38bdf8','In Transit':'#2dd4bf',
            'Partially Delivered':'#06b6d4','Delivered':'#16a34a',
            'Cancelled':'#ef4444','On Hold':'#6b7280'
        }
    };

    function getDefaultOptions(overrides) {
        const base = {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 600, easing: 'easeInOutQuart' },
            plugins: {
                legend: {
                    labels: { color: '#94a3b8', font: { size: 11 }, padding: 16 }
                },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#f1f5f9',
                    bodyColor: '#94a3b8',
                    borderColor: 'rgba(148,163,184,0.2)',
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(ctx) {
                            const val = ctx.parsed.y !== undefined ? ctx.parsed.y : ctx.parsed;
                            if (typeof val === 'number' && val > 100) {
                                return ' ' + val.toLocaleString('de-DE', {minimumFractionDigits:2,maximumFractionDigits:2}) + ' EUR';
                            }
                            return ' ' + (val !== undefined ? val : ctx.formattedValue);
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#64748b', maxRotation: 45, font: { size: 11 } },
                    grid: { color: 'rgba(148,163,184,0.08)' }
                },
                y: {
                    ticks: {
                        color: '#64748b', font: { size: 11 },
                        callback: v => v >= 1000 ? (v/1000).toFixed(1)+'k' : v
                    },
                    grid: { color: 'rgba(148,163,184,0.08)' },
                    beginAtZero: true
                }
            }
        };
        return deepMerge(base, overrides || {});
    }

    function applyGradient(ctx, colorHex, alpha1, alpha2) {
        alpha1 = alpha1 !== undefined ? alpha1 : 0.4;
        alpha2 = alpha2 !== undefined ? alpha2 : 0.0;
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, hexToRgba(colorHex, alpha1));
        gradient.addColorStop(1, hexToRgba(colorHex, alpha2));
        return gradient;
    }

    function hexToRgba(hex, alpha) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!result) return `rgba(56,189,248,${alpha})`;
        return `rgba(${parseInt(result[1],16)},${parseInt(result[2],16)},${parseInt(result[3],16)},${alpha})`;
    }

    function deepMerge(target, source) {
        const out = Object.assign({}, target);
        for (const key of Object.keys(source)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                out[key] = deepMerge(target[key] || {}, source[key]);
            } else {
                out[key] = source[key];
            }
        }
        return out;
    }

})();
