const app = require('./src/app');
const { precalentar } = require('./src/helpers/coq-cache.helper');

const PORT = process.env.PORT || 5410;

const server = app.listen(PORT, () => {
    console.log('=============================================');
    console.log('=                                           =');
    console.log(`= SQL Server Backend: http://localhost:${PORT} =`);
    console.log('=                                           =');
    console.log('=============================================');

    // Precalienta la caché de costos y ventas (en segundo plano)
    precalentar();
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});
