'use strict';

const { leerCuerpoJson } = require('../http');
const { obtenerIp } = require('../middleware/limitador');
const { errores } = require('../utils/errores');

function claveDeCuenta(correo) {
  return typeof correo === 'string' ? correo.trim().toLowerCase().slice(0, 100) : '';
}

const MOTIVO_CUENTA = 'Esta cuenta está bloqueada temporalmente por varios intentos fallidos';
const MOTIVO_IP = 'Demasiados intentos fallidos desde esta conexión';

/**
 * Solo cuentan los intentos fallidos (correo o contraseña incorrectos, 401):
 * - Por cuenta: tras varios fallos se bloquea ESE correo durante la ventana, desde cualquier IP;
 *   los demás correos siguen entrando normalmente.
 * - Por IP: límite alto de fallos con cualquier correo, para frenar a quien prueba muchas cuentas.
 * Los inicios de sesión correctos y los datos mal escritos (400) no cuentan. Cada intento se
 * aparta antes de verificar la contraseña y se devuelve si no fue un fallo.
 */
function registrarRutasAuth(enrutador, { servicioAuth, limitadorLogin, limitadorCuentas, config }) {
  // POST /api/auth/login → pública; devuelve el JWT
  enrutador.post('/api/auth/login', { publica: true }, async (ctx) => {
    const ip = obtenerIp(ctx.req, config.confiarEnProxy);
    const estadoIp = limitadorLogin.reservar(ip);
    if (!estadoIp.permitido) throw errores.demasiadasSolicitudes(estadoIp.reinicioSegundos, MOTIVO_IP);

    let cuenta = '';
    let fallo = false;
    try {
      const cuerpo = await leerCuerpoJson(ctx.req);
      const clave = claveDeCuenta(cuerpo.correo);
      if (clave) {
        const estadoCuenta = limitadorCuentas.reservar(clave);
        if (!estadoCuenta.permitido) throw errores.demasiadasSolicitudes(estadoCuenta.reinicioSegundos, MOTIVO_CUENTA);
        cuenta = clave;
      }
      const datos = await servicioAuth.iniciarSesion(cuerpo);
      limitadorCuentas.reiniciar(cuenta);
      return { estado: 200, datos };
    } catch (error) {
      fallo = error.estado === 401;
      throw error;
    } finally {
      if (!fallo) {
        limitadorLogin.liberar(ip);
        if (cuenta) limitadorCuentas.liberar(cuenta);
      }
    }
  });
}

module.exports = { registrarRutasAuth };
