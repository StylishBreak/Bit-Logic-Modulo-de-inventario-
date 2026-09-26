'use strict';

/**
 * JWT con HMAC-SHA256 (HS256) usando solo el módulo crypto de Node.
 * Sigue el estándar RFC 7519, así que el token se puede revisar en jwt.io.
 */
const crypto = require('node:crypto');
const { errores } = require('./errores');

const ENCABEZADO = { alg: 'HS256', typ: 'JWT' };

function aBase64Url(objeto) {
  return Buffer.from(JSON.stringify(objeto)).toString('base64url');
}

function firmar(contenido, secreto) {
  return crypto.createHmac('sha256', secreto).update(contenido).digest();
}

function leerParte(parte) {
  try {
    return JSON.parse(Buffer.from(parte, 'base64url').toString('utf8'));
  } catch {
    throw errores.noAutenticado('Token inválido');
  }
}

/** Crea un token firmado con fecha de emisión (iat) y de expiración (exp). */
function firmarToken(datos, secreto, expiraEnSegundos, ahoraSegundos = Math.floor(Date.now() / 1000)) {
  const carga = { ...datos, iat: ahoraSegundos, exp: ahoraSegundos + expiraEnSegundos };
  const contenido = `${aBase64Url(ENCABEZADO)}.${aBase64Url(carga)}`;
  return `${contenido}.${firmar(contenido, secreto).toString('base64url')}`;
}

/**
 * Verifica formato, algoritmo, firma y expiración. Devuelve la carga (payload)
 * o lanza un error 401.
 */
function verificarToken(token, secreto, ahoraSegundos = Math.floor(Date.now() / 1000)) {
  const partes = typeof token === 'string' ? token.split('.') : [];
  if (partes.length !== 3) throw errores.noAutenticado('Token inválido');

  const [encabezado, carga, firma] = partes;
  const datosEncabezado = leerParte(encabezado);
  // Se fija el algoritmo para evitar ataques como alg "none"
  if (datosEncabezado.alg !== 'HS256' || datosEncabezado.typ !== 'JWT') {
    throw errores.noAutenticado('Token inválido');
  }

  const esperada = firmar(`${encabezado}.${carga}`, secreto);
  const recibida = Buffer.from(firma, 'base64url');
  if (recibida.length !== esperada.length || !crypto.timingSafeEqual(recibida, esperada)) {
    throw errores.noAutenticado('Token inválido');
  }

  const datos = leerParte(carga);
  if (typeof datos.exp !== 'number' || ahoraSegundos >= datos.exp) {
    throw errores.noAutenticado('Token expirado');
  }
  return datos;
}

module.exports = { firmarToken, verificarToken };
