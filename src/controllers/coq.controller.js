const db = require('../models');
const { handleError } = require('../helpers/error.helper');
const coqCache = require('../helpers/coq-cache.helper');

module.exports = {

    // Costos de no calidad agregados (año, mes, centro, proceso, referencia, tipo, fuente)
    getCostosNc: async (req, res) => {
        try {
            const data = await coqCache.getCostosNc();

            return res.status(200).json({
                data: data,
                length: data.length
            });
        } catch (error) {
            handleError(res, error, 'No se pudo obtener los costos de no calidad.');
        }
    },

    // Ventas netas agregadas (año, mes, centro)
    getVentas: async (req, res) => {
        try {
            const data = await coqCache.getVentas();

            return res.status(200).json({
                data: data,
                length: data.length
            });
        } catch (error) {
            handleError(res, error, 'No se pudo obtener las ventas.');
        }
    },

    // Estado de la última extracción (fecha/hora, hasta qué día hay ventas, si hay una en curso)
    getEstado: async (req, res) => {
        try {
            return res.status(200).json({
                data: coqCache.getEstado(),
                length: 1
            });
        } catch (error) {
            handleError(res, error, 'No se pudo obtener el estado de la extracción.');
        }
    },

    // Vuelve a extraer los datos de los cubos a pedido del usuario.
    // Ventas incremental (mes anterior + actual, ~10 s). Con ?completa=1 recarga todo (~90 s).
    actualizar: async (req, res) => {
        try {
            const completa = req.query.completa === '1';
            const data = await coqCache.actualizarAhora(completa);

            return res.status(200).json({
                data: data,
                length: 1
            });
        } catch (error) {
            handleError(res, error, 'No se pudo actualizar desde SQL Server. Se mantienen los datos anteriores.');
        }
    },

    // Verifica la conexión a ambas bases. No expone detalles internos del error.
    health: async (req, res) => {
        const bases = { nc: db.sequelizeNc, ventas: db.sequelizeVentas };
        const results = {};

        await Promise.all(
            Object.entries(bases).map(async ([key, sequelize]) => {
                try {
                    await sequelize.query('SELECT 1 AS ok');
                    results[key] = 'ok';
                } catch (error) {
                    console.error(`[health] fallo en base "${key}":`, error.message);
                    results[key] = 'error';
                }
            })
        );

        const allOk = Object.values(results).every((r) => r === 'ok');
        return res.status(allOk ? 200 : 503).json(results);
    }
};
