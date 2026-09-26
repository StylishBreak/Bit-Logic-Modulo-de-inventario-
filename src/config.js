'use strict';

const crypto = require('node:crypto');

const LONGITUD_MINIMA_SECRETO = 32;

function numeroPositivo(valor, porDefecto) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : porDefecto;
}

/** Lee la configuración desde variables de entorno (ver .env.example). */
function cargarConfiguracion(env = process.env) {
  const entorno = env.NODE_ENV || 'development';
  let jwtSecreto = env.JWT_SECRET;
  let secretoTemporal = false;

  if (!jwtSecreto) {
    if (entorno === 'production') {
      throw new Error('JWT_SECRET es obligatorio en producción');
    }
    // Solo para desarrollo: secreto aleatorio que cambia en cada arranque
    jwtSecreto = crypto.randomBytes(32).toString('hex');
    secretoTemporal = true;
  }
  if (jwtSecreto.length < LONGITUD_MINIMA_SECRETO) {
    throw new Error(`JWT_SECRET debe tener al menos ${LONGITUD_MINIMA_SECRETO} caracteres`);
  }

  return {
    entorno,
    puerto: numeroPositivo(env.PORT, 3000),
    rutaBaseDatos: env.DB_PATH || 'data/inventario.db',
    jwtSecreto,
    secretoTemporal,
    jwtExpiraSegundos: numeroPositivo(env.JWT_EXPIRA_SEGUNDOS, 3600),
    loginMaxIntentos: numeroPositivo(env.LOGIN_MAX_INTENTOS, 20),
    loginVentanaMs: numeroPositivo(env.LOGIN_VENTANA_MINUTOS, 15) * 60 * 1000,
    loginMaxFallosCuenta: numeroPositivo(env.LOGIN_MAX_FALLOS_CUENTA, 10),
    confiarEnProxy: env.TRUST_PROXY === 'true',
    zonaHoraria: env.ZONA_HORARIA || 'America/Mexico_City',
    diasAlertaCaducidad: numeroPositivo(env.DIAS_ALERTA_CADUCIDAD, 7),
    version: env.RENDER_GIT_COMMIT || env.APP_VERSION || 'local',
  };
}

module.exports = { cargarConfiguracion };
