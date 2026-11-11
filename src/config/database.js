const { Sequelize } = require('sequelize');

/**
 * Conexión a las 2 bases SQL Server (mismo servidor):
 *  - nc:      cubo de costos de no calidad (DB_NC_NAME)
 *  - ventas:  cubo de ventas diarias        (DB_VENTAS_NAME)
 *
 * Usuario de dominio Windows (DOMINIO\usuario) => autenticación NTLM.
 */
const createConnection = (prefix, label) => {
    const host = process.env.DB_HOST || process.env.DB_SERVER;
    const database = process.env[`${prefix}_NAME`];
    const user = process.env[`${prefix}_USER`] || process.env.DB_USER;
    const password = process.env[`${prefix}_PASSWORD`] || process.env.DB_PASSWORD;

    if (!host || !database || !user || !password) {
        console.error(`❌ Configuración incompleta para la base "${label}". Revise las variables de entorno (.env).`);
    }

    const [domain, userName] = (user || '').includes('\\') ? user.split('\\') : [undefined, user];

    return new Sequelize({
        dialect: 'mssql',
        host,
        port: Number(process.env.DB_PORT || 1433),
        database,
        username: userName,
        password,

        dialectOptions: {
            ...(domain
                ? { authentication: { type: 'ntlm', options: { domain, userName, password } } }
                : {}),
            options: {
                encrypt: process.env.DB_ENCRYPT === 'true',
                trustServerCertificate: process.env.DB_TRUST_SERVER_CERT !== 'false',
                connectTimeout: 15000,
                // la consulta de ventas agregada tarda ~80-100 s
                requestTimeout: 240000,
            },
        },

        pool: {
            max: 10,
            min: 0,
            acquire: 30000,
            idle: 30000
        },

        logging: false
    });
};

const nc = createConnection('DB_NC', 'nc');
const ventas = createConnection('DB_VENTAS', 'ventas');

// Test connections (no bloquea el arranque; las consultas reintentan por su cuenta)
[['nc', nc], ['ventas', ventas]].forEach(([label, connection]) => {
    connection.authenticate()
        .then(() => console.log(`✅ SQL Server connection "${label}" established successfully`))
        .catch(err => console.error(`❌ Database connection error "${label}":`, err.message));
});

module.exports = { nc, ventas };
