// backend/server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const orderAssignmentRoutes = require('./routes/orderAssignments');
const supplierRoutes = require('./routes/suppliers');
const quoteRoutes = require('./routes/quotes');
const quoteEmailRoutes = require('./routes/quoteEmail'); // ⭐ Smart Quote Send
const userRoutes = require('./routes/users');
const buildingRoutes = require('./routes/buildings');
const costCenterRoutes = require('./routes/costCenters');
const documentsRoutes = require('./routes/documents');
const approvalsRoutes = require('./routes/approvals');
const autocompleteRoutes = require('./routes/autocomplete');
const testRoutes = require('./routes/test');
const analyticsRoutes = require('./routes/analytics');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// Static files - uploads served with original names
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/order-assignments', orderAssignmentRoutes); // ⭐ Assignment system
app.use('/api/suppliers', supplierRoutes);
app.use('/api/quotes', quoteEmailRoutes); // ⭐ Smart Quote Send (must be before quoteRoutes)
app.use('/api/quotes', quoteRoutes);
app.use('/api/users', userRoutes);
app.use('/api/buildings', buildingRoutes);
app.use('/api/cost-centers', costCenterRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/approvals', approvalsRoutes);
app.use('/api/autocomplete', autocompleteRoutes); // ⭐ NEW: Intelligent autocomplete
app.use('/api/test', testRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        version: '2.6.0' // Phase 6: Smart Quote Send
    });
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

app.listen(PORT, () => {
    console.log(`PartPulse Orders Server v2.6.0 running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`Frontend URL: ${process.env.FRONTEND_URL}`);
    console.log(`Features: Smart Quote Send + Smart Autocomplete + Document Management + Approvals + Procurement`);
});

module.exports = app;
