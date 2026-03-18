// frontend/analytics-cache.js - Intelligent Data Caching Layer
(function() {
    'use strict';

    const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
    const cache = {};

    window.AnalyticsCache = {
        get: getCached,
        set: setCached,
        invalidate: invalidate,
        invalidateAll: invalidateAll,
        buildKey: buildKey,
        getStats: getStats
    };

    function buildKey(endpoint, params) {
        return endpoint + '::' + JSON.stringify(params || {});
    }

    function getCached(key) {
        const entry = cache[key];
        if (!entry) return null;
        if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
            delete cache[key];
            return null;
        }
        return entry.data;
    }

    function setCached(key, data) {
        cache[key] = { data: data, timestamp: Date.now() };
    }

    function invalidate(key) { delete cache[key]; }

    function invalidateAll() {
        Object.keys(cache).forEach(k => delete cache[k]);
    }

    function getStats() {
        const now = Date.now();
        const entries = Object.entries(cache);
        const valid = entries.filter(([, v]) => now - v.timestamp <= CACHE_TTL_MS);
        return { total: entries.length, valid: valid.length, expired: entries.length - valid.length };
    }

    // Auto-cleanup expired entries every 2 minutes
    setInterval(() => {
        const now = Date.now();
        Object.keys(cache).forEach(k => {
            if (now - cache[k].timestamp > CACHE_TTL_MS) delete cache[k];
        });
    }, 2 * 60 * 1000);

})();
