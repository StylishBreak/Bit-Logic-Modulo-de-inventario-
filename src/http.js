'use strict';

const { errores } = require('./utils/errores');

const LIMITE_CUERPO_BYTES = 20 * 1024; // 20 KB
const TIPO_JSON = /^application\/json\b/i;

/** Envía una respuesta JSON con el código indicado. */
function enviarJson(res, estado, datos, encabezados = {}) {
  const cuerpo = JSON.stringify(datos);
  res.writeHead(estado, {
    ...encabezados,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(cuerpo),
  });
  res.end(cuerpo);
}

function interpretarJson(texto) {
  if (texto === '') return {};
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw errores.solicitudIncorrecta('JSON mal formado');
  }
  if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) {
    throw errores.solicitudIncorrecta('El cuerpo debe ser un objeto JSON');
  }
  return datos;
}

/**
 * Lee el cuerpo de la petición como JSON.
 * 415 si no es application/json, 413 si supera el límite y 400 si está mal formado.
 */
function leerCuerpoJson(req, limite = LIMITE_CUERPO_BYTES) {
  if (!TIPO_JSON.test(req.headers['content-type'] || '')) {
    return Promise.reject(errores.tipoNoSoportado());
  }
  if (Number(req.headers['content-length'] || 0) > limite) {
    return Promise.reject(errores.demasiadoGrande());
  }

  return new Promise((resolve, reject) => {
    const partes = [];
    let recibidos = 0;
    let terminado = false;

    const terminar = (accion) => {
      if (terminado) return;
      terminado = true;
      accion();
    };

    req.on('data', (parte) => {
      recibidos += parte.length;
      if (recibidos > limite) {
        terminar(() => reject(errores.demasiadoGrande()));
      } else if (!terminado) {
        partes.push(parte);
      }
    });
    req.on('end', () => {
      terminar(() => {
        try {
          resolve(interpretarJson(Buffer.concat(partes).toString('utf8').trim()));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', (error) => terminar(() => reject(error)));
  });
}

module.exports = { enviarJson, leerCuerpoJson, LIMITE_CUERPO_BYTES };
