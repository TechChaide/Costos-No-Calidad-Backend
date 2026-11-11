const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// Import routes
const coqRoutes = require('./routes/coq.routes');
const { verifyToken } = require('./middlewares/auth.middleware');

const app = express();

// Middleware
app.use(cors({
    origin: (origin, callback) => {
        // Permitir cualquier origen (incluyendo peticiones sin origin como curl, server-to-server, etc.)
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Content-Range', 'X-Content-Range']
}));

app.use(cookieParser());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'SQL Server API is running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// API Routes: el token se valida (header o cookie) contra seguridades
app.use('/api/coq', verifyToken, coqRoutes);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

module.exports = app;
