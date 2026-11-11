const axios = require('axios');

/**
 * Validación de token vía seguridadesGuard — mismo patrón que muestreos-backend.
 * GET AUTH_API_URL con Authorization: Bearer <token>
 * Respuesta esperada: true
 *
 * Si el token ya venció pero hace ≤ TOKEN_EXPIRED_GRACE_HOURS, se permite
 * continuar (p. ej. guardar). Si pasó más de ese margen → 401.
 */
const AUTH_API_URL =
    process.env.AUTH_API_URL ||
    'http://seguridades_guard_service:5400/api/auths/checkToken';

/** Horas máximas desde el vencimiento del token para seguir permitiendo operaciones. */
const TOKEN_EXPIRED_GRACE_HOURS = 3;
const TOKEN_EXPIRED_GRACE_MS = TOKEN_EXPIRED_GRACE_HOURS * 60 * 60 * 1000;

console.log('AUTH_API_URL', AUTH_API_URL);
console.log('TOKEN_EXPIRED_GRACE_HOURS', TOKEN_EXPIRED_GRACE_HOURS);

const AUTH_DISABLED =
    process.env.NODE_ENV !== 'production' &&
    String(process.env.DISABLE_AUTH || process.env.SKIP_AUTH || '')
        .toLowerCase() === 'true';

if (AUTH_DISABLED) {
    console.warn('\n========================================================');
    console.warn('⚠️  AUTH DESHABILITADA (DISABLE_AUTH/SKIP_AUTH=true)');
    console.warn('⚠️  TODOS LOS ENDPOINTS ESTÁN SIN VERIFICACIÓN DE TOKEN');
    console.warn('⚠️  NO USAR EN PRODUCCIÓN');
    console.warn('========================================================\n');
}

const verifyToken = async (req, res, next) => {
    if (AUTH_DISABLED) {
        req.token = 'DISABLED';
        return next();
    }

    let token = null;
    const authHeader = req.headers['authorization'];
    const cookieToken = req.cookies?.token;
    if (authHeader) token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token && cookieToken) token = cookieToken;

    if (!token) {
        return res.status(403).json({
            message: 'Authentication token required',
            code: 'MISSING_TOKEN',
        });
    }

    try {
        const response = await axios.get(AUTH_API_URL, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 15000,
        });

        console.log('response', response.data);

        if (response.data === true || response.data?.valid === true) {
            req.token = token;
            return next();
        }

        // Token vencido: gracia de TOKEN_EXPIRED_GRACE_HOURS para seguir guardando.
        if (response.data && response.data.reason === 'EXPIRED') {
            const expiredAgoMs = Number(response.data.expiredAgoMs);
            const withinGrace =
                Number.isFinite(expiredAgoMs) &&
                expiredAgoMs >= 0 &&
                expiredAgoMs <= TOKEN_EXPIRED_GRACE_MS;

            if (withinGrace) {
                req.token = token;
                req.tokenExpiredGrace = true;
                req.tokenExpiredAt = response.data.expiredAt;
                req.tokenExpiredAgoMs = expiredAgoMs;
                return next();
            }

            return res.status(401).json({
                message: `Token expired more than ${TOKEN_EXPIRED_GRACE_HOURS} hours ago`,
                code: 'EXPIRED_TOKEN',
                graceHours: TOKEN_EXPIRED_GRACE_HOURS,
                expiredAt: response.data.expiredAt,
                expiredAgoMs: response.data.expiredAgoMs,
                expiredAgoSeconds: response.data.expiredAgoSeconds,
            });
        }

        return res.status(401).json({
            message: 'Invalid or expired token',
            code: 'INVALID_TOKEN',
        });
    } catch (error) {
        console.error('Token validation error:', error.message);
        return res.status(401).json({
            message: 'Token validation failed',
            code: 'VALIDATION_ERROR',
            details:
                process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

module.exports = { verifyToken, TOKEN_EXPIRED_GRACE_HOURS };
