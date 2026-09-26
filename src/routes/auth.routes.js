'use strict';

const { leerCuerpoJson } = require('../http');
const { obtenerIp } = require('../middleware/limitador');
const { errores } = require('../utils/errores');

function claveDeCuenta(correo) {
  return typeof correo === 'string' ? correo.trim().toLowerCase().slice(0, 100) : '';
}

function registrarRutasAuth(enrutador, { servicioAuth, limitadorLogin, limitadorCuentas, config }) {
  // POST /api/auth/login → pública; devuelve el JWT
  enrutador.post('/api/auth/login', { publica: true }, async (ctx) => {
    // 1) Límite por IP: se revisa antes de procesar la petición
    const intento = limitadorLogin.registrar(obtenerIp(ctx.req, config.confiarEnProxy));
    if (!intento.permitido) throw errores.demasiadasSolicitudes(intento.reinicioSegundos);

    // 2) Límite por cuenta: bloquea la cuenta tras varias contraseñas incorrectas, aunque cambie la IP
    const cuerpo = await leerCuerpoJson(ctx.req);
    const cuenta = claveDeCuenta(cuerpo.correo);
    const estadoCuenta = limitadorCuentas.consultar(cuenta);
    if (cuenta && !estadoCuenta.permitido) throw errores.demasiadasSolicitudes(estadoCuenta.reinicioSegundos);

    try {
      const datos = await servicioAuth.iniciarSesion(cuerpo);
      limitadorCuentas.reiniciar(cuenta);
      return { estado: 200, datos, encabezados: { 'RateLimit-Remaining': String(intento.restantes) } };
    } catch (error) {
      if (cuenta && error.estado === 401) limitadorCuentas.registrar(cuenta);
      throw error;
    }
  });
}

module.exports = { registrarRutasAuth };
