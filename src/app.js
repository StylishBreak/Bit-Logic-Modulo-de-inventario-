'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Enrutador } = require('./router');
const { enviarJson, leerCuerpoJson } = require('./http');
const { ErrorApp, errores } = require('./utils/errores');
const { autenticar, autorizar } = require('./middleware/auth');
const { LimitadorIntentos } = require('./middleware/limitador');
const { aplicarEncabezadosSeguridad } = require('./middleware/seguridad');
const { crearServicioAuth } = require('./services/auth.service');
const { crearServicioInventario } = require('./services/inventario.service');
const { registrarRutasAuth } = require('./routes/auth.routes');
const { registrarRutasInventario } = require('./routes/inventario.routes');

const CARPETA_PUBLICA = path.join(__dirname, '..', 'public');

// Solo se sirven estos archivos (lista blanca): no hay forma de pedir otros archivos del servidor
const ARCHIVOS_PUBLICOS = {
  '/': { archivo: 'index.html', tipo: 'text/html; charset=utf-8' },
  '/index.html': { archivo: 'index.html', tipo: 'text/html; charset=utf-8' },
  '/app.js': { archivo: 'app.js', tipo: 'text/javascript; charset=utf-8' },
  '/styles.css': { archivo: 'styles.css', tipo: 'text/css; charset=utf-8' },
};

function cargarArchivosPublicos() {
  const archivos = new Map();
  for (const [ruta, { archivo, tipo }] of Object.entries(ARCHIVOS_PUBLICOS)) {
    archivos.set(ruta, { contenido: fs.readFileSync(path.join(CARPETA_PUBLICA, archivo)), tipo });
  }
  return archivos;
}

function enviarArchivo(res, { contenido, tipo }) {
  res.writeHead(200, { 'Content-Type': tipo, 'Content-Length': contenido.length });
  res.end(contenido);
}

function leerRuta(url) {
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    throw errores.solicitudIncorrecta('URL inválida');
  }
}

/** Manejo centralizado de errores: códigos claros y sin exponer detalles internos. */
function responderError(res, error) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  if (error instanceof ErrorApp) {
    const cuerpo = { error: error.message };
    if (error.detalles) cuerpo.detalles = error.detalles;
    enviarJson(res, error.estado, cuerpo, error.encabezados);
    return;
  }
  if (error instanceof URIError) {
    enviarJson(res, 400, { error: 'URL mal formada' });
    return;
  }
  console.error('[error interno]', error);
  enviarJson(res, 500, { error: 'Error interno del servidor' });
}

/**
 * Crea la aplicación: registra las rutas y devuelve la función que atiende
 * cada petición HTTP (se usa con http.createServer).
 */
function crearApp({ db, config }) {
  const enrutador = new Enrutador();
  const servicioAuth = crearServicioAuth({ db, config });
  const servicioInventario = crearServicioInventario({ db, config });
  const limitadorLogin = new LimitadorIntentos({
    maximo: config.loginMaxIntentos,
    ventanaMs: config.loginVentanaMs,
  });
  const limitadorCuentas = new LimitadorIntentos({
    maximo: config.loginMaxFallosCuenta,
    ventanaMs: config.loginVentanaMs,
  });
  const archivos = cargarArchivosPublicos();
  const comprobarBase = db.prepare('SELECT 1 AS ok');

  enrutador.get('/health', { publica: true }, () => {
    comprobarBase.get();
    return { estado: 200, datos: { estado: 'ok', version: config.version } };
  });
  registrarRutasAuth(enrutador, { servicioAuth, limitadorLogin, limitadorCuentas, config });
  registrarRutasInventario(enrutador, { servicioInventario });

  async function atender(req, res) {
    const metodo = req.method === 'HEAD' ? 'GET' : req.method;
    const ruta = leerRuta(req.url);

    if (metodo === 'GET' && archivos.has(ruta)) {
      enviarArchivo(res, archivos.get(ruta));
      return;
    }

    const encontrada = enrutador.buscar(metodo, ruta);
    if (!encontrada) throw errores.noEncontrado('Ruta no encontrada');
    if (encontrada.permitidos) throw errores.metodoNoPermitido(encontrada.permitidos);

    const { ruta: definicion, params } = encontrada;
    const ctx = { req, params };
    // 1) Autenticación (JWT)  2) Autorización por rol  3) Lectura y validación de datos
    if (!definicion.opciones.publica) {
      ctx.usuario = autenticar(req.headers.authorization, config.jwtSecreto);
      autorizar(ctx.usuario, definicion.opciones.roles);
    }
    if (definicion.opciones.cuerpo) ctx.cuerpo = await leerCuerpoJson(req);

    const { estado, datos, encabezados } = await definicion.manejador(ctx);
    enviarJson(res, estado, datos, encabezados);
  }

  return function manejarPeticion(req, res) {
    aplicarEncabezadosSeguridad(res);
    atender(req, res).catch((error) => responderError(res, error));
  };
}

module.exports = { crearApp };
