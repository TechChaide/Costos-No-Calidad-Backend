const fs = require('fs').promises;
const path = require('path');
const { fn, col, literal, Op } = require('sequelize');
const { CostoNoCalidad, VentaDiaria } = require('../models');

/**
 * Datos del dashboard en memoria del servidor, con copia en disco (.cache/coq) para que un reinicio
 * no obligue a esperar la consulta completa de ventas (~90 s: 2.2 M filas en una tabla heap sin
 * índice por AÑO/MES).
 *
 * Medido (06/11/2026): la tabla ocupa ~11.6 GB (1.5 M páginas, ~2.6 KB por fila, 140 columnas) y
 * VALOR_NETO no está en ningún índice, así que la consulta completa lee toda la tabla del disco
 * (45-100 s según carga del servidor). Con usuario de solo lectura no se puede acelerar ese escaneo;
 * por eso se evita repetirlo:
 *  - Carga completa solo la primera vez (sin copia en disco) o a pedido (?completa=1).
 *  - Actualización normal: mes anterior + actual filtrando por FECHA (~10-15 s, usa índices existentes).
 *  - Revisión semanal: últimos 6 meses por FECHA, por si llegan ajustes a meses ya cerrados.
 */

const ANIO_MINIMO = 2024;
const TTL_MS = 6 * 60 * 60 * 1000; // actualización automática en segundo plano
const REVISION_CADA_MS = 7 * 24 * 60 * 60 * 1000;
const MESES_NORMAL = 2;
const MESES_REVISION = 6;
const ENFRIAMIENTO_MS = 60 * 1000; // evita repetir la actualización manual en menos de 1 minuto
const VERSION = 2; // subir si cambia la definición de las consultas (invalida la copia en disco)
const DIR = path.join(process.cwd(), '.cache', 'coq');

const st = (globalThis.__coq ??= { inflight: {} });

/* ---------- copia en disco ---------- */
async function leer(nombre) {
    try {
        const s = JSON.parse(await fs.readFile(path.join(DIR, nombre), 'utf8'));
        return s?.version === VERSION ? s : undefined;
    } catch {
        return undefined;
    }
}

async function guardar(nombre, s) {
    try {
        await fs.mkdir(DIR, { recursive: true });
        await fs.writeFile(path.join(DIR, nombre), JSON.stringify(s));
    } catch (e) {
        console.error('[coq] no se pudo guardar la copia en disco', e);
    }
}

const cargarDisco = () =>
    (st.disco ??= (async () => {
        st.costos ??= await leer('costos.json');
        st.ventas ??= await leer('ventas.json');
    })());

/* ---------- consultas ---------- */
function unaVez(key, fnQuery) {
    let p = st.inflight[key];
    if (!p) {
        p = fnQuery()
            .then((v) => { st.error = undefined; return v; })
            .catch((e) => { st.error = 'No se pudo actualizar desde SQL Server.'; throw e; })
            .finally(() => { delete st.inflight[key]; });
        st.inflight[key] = p;
    }
    return p;
}

const actualizarCostos = () =>
    unaVez('costos', async () => {
        const data = await CostoNoCalidad.findAll({
            attributes: [
                'anio',
                'mes',
                [fn('RTRIM', col('CENTRO')), 'centro'],
                [fn('RTRIM', col('PROCESO')), 'proceso'],
                [fn('RTRIM', col('REFERENCIA')), 'referencia'],
                [fn('RTRIM', col('DESCRIPCION_REFERENCIA')), 'descripcion'],
                [col('TIPO_COSTOS'), 'tipo'],
                'fuente',
                [fn('SUM', col('IMPORTE')), 'importe'],
            ],
            group: [
                col('AÑO'), col('MES'),
                fn('RTRIM', col('CENTRO')), fn('RTRIM', col('PROCESO')),
                fn('RTRIM', col('REFERENCIA')), fn('RTRIM', col('DESCRIPCION_REFERENCIA')),
                col('TIPO_COSTOS'), col('FUENTE'),
            ],
            order: [[col('AÑO'), 'ASC'], [col('MES'), 'ASC']],
            raw: true,
        });

        st.costos = {
            version: VERSION,
            at: Date.now(),
            data: data.map((r) => ({
                ...r,
                anio: Number(r.anio),
                mes: Number(r.mes),
                centro: r.centro ?? '',
                proceso: r.proceso ?? '',
                referencia: r.referencia ?? '',
                descripcion: r.descripcion ?? '',
                importe: Number(r.importe),
            })),
        };
        await guardar('costos.json', st.costos);
        return st.costos;
    });

/**
 * Ventas netas (VALOR_NETO), sin filtrar ANULADA: la factura anulada (ANULADA = 'X') y su documento de
 * reverso (S1/S2, no marcado con 'X') se compensan entre sí. Excluir solo las 'X' descontaría la
 * anulación dos veces. Notas de crédito y devoluciones vienen en negativo.
 * Validado contra el Excel inicial del proyecto (diferencia < 0,01 %).
 */
const consultarVentas = (where) =>
    VentaDiaria.findAll({
        attributes: [
            'anio',
            'mes',
            [fn('RTRIM', col('CENTRO')), 'centro'],
            [fn('SUM', col('VALOR_NETO')), 'ventas'],
            [fn('CONVERT', literal('char(10)'), fn('MAX', col('FECHA')), 23), 'ultima'],
        ],
        where,
        group: [col('AÑO'), col('MES'), fn('RTRIM', col('CENTRO'))],
        order: [[col('AÑO'), 'ASC'], [col('MES'), 'ASC']],
        raw: true,
    });

const actualizarVentas = (forzarCompleta = false) =>
    unaVez('ventas', async () => {
        const prev = st.ventas;
        const completa = forzarCompleta || !prev;
        const revision = !completa && Date.now() - (prev.revisionAt ?? prev.completaAt) > REVISION_CADA_MS;

        // Primer día de la ventana a releer (hora local del servidor). Valores numéricos, sin entrada del usuario.
        const hoy = new Date();
        const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - ((revision ? MESES_REVISION : MESES_NORMAL) - 1), 1);
        const anioDesde = inicio.getFullYear();
        const mesDesde = inicio.getMonth() + 1;
        const claveDesde = anioDesde * 100 + mesDesde;

        const filas = await consultarVentas(
            completa
                ? { anio: { [Op.gte]: ANIO_MINIMO } }
                : { fecha: { [Op.gte]: `${anioDesde}-${String(mesDesde).padStart(2, '0')}-01` } },
        );
        const nuevas = filas.map((r) => ({ anio: Number(r.anio), mes: Number(r.mes), centro: r.centro ?? '', ventas: Number(r.ventas) }));
        const ultimaNueva = filas.reduce((m, r) => (r.ultima && (!m || r.ultima > m) ? r.ultima : m), null);

        const data = completa
            ? nuevas
            : [...prev.data.filter((r) => r.anio * 100 + r.mes < claveDesde), ...nuevas].sort((a, b) => a.anio - b.anio || a.mes - b.mes);

        st.ventas = {
            version: VERSION,
            at: Date.now(),
            completaAt: completa ? Date.now() : prev.completaAt,
            revisionAt: completa || revision ? Date.now() : (prev.revisionAt ?? prev.completaAt),
            ultimaFecha: ultimaNueva ?? prev?.ultimaFecha ?? null,
            data,
        };
        await guardar('ventas.json', st.ventas);
        return st.ventas;
    });

/* ---------- API pública ---------- */
const enSegundoPlano = (p, que) => p.catch((e) => console.error(`[coq] actualización de ${que} falló`, e));

async function getCostosNc() {
    await cargarDisco();
    if (!st.costos) return (await actualizarCostos()).data;
    if (Date.now() - st.costos.at >= TTL_MS) enSegundoPlano(actualizarCostos(), 'costos');
    return st.costos.data;
}

async function getVentas() {
    await cargarDisco();
    if (!st.ventas) return (await actualizarVentas()).data;
    if (Date.now() - st.ventas.at >= TTL_MS) enSegundoPlano(actualizarVentas(), 'ventas');
    return st.ventas.data;
}

function getEstado() {
    return {
        costosAl: st.costos?.at ?? null,
        ventasAl: st.ventas?.at ?? null,
        ventasCompletaAl: st.ventas?.completaAt ?? null,
        ventasHasta: st.ventas?.ultimaFecha ?? null,
        actualizando: Boolean(st.inflight.costos || st.inflight.ventas),
        error: st.error ?? null,
    };
}

/** Actualización a pedido del usuario. Si ya hay una en curso, espera esa misma (no lanza otra). */
async function actualizarAhora(completa = false) {
    await cargarDisco();
    const ultima = Math.min(st.costos?.at ?? 0, st.ventas?.at ?? 0);
    const enCurso = st.inflight.costos || st.inflight.ventas;
    if (!enCurso && !completa && Date.now() - ultima < ENFRIAMIENTO_MS) return getEstado();
    await Promise.all([actualizarCostos(), actualizarVentas(completa)]);
    return getEstado();
}

/** Precalienta la caché al iniciar el servidor. Sin await: el arranque no debe esperar la consulta lenta de ventas. */
function precalentar() {
    getCostosNc().catch((e) => console.error('[warmup] costos-nc', e));
    getVentas().catch((e) => console.error('[warmup] ventas', e));
}

module.exports = { getCostosNc, getVentas, getEstado, actualizarAhora, precalentar };
