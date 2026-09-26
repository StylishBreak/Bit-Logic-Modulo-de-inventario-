'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

// Parámetros de scrypt recomendados por OWASP (N=2^14, r=8, p=5)
const PARAMETROS = { N: 16384, r: 8, p: 5 };
const LONGITUD_HASH = 32;
const MEMORIA_MAXIMA = 64 * 1024 * 1024;

/**
 * Genera el hash de una contraseña con sal aleatoria.
 * Formato guardado en la base: scrypt$N$r$p$salBase64$hashBase64
 */
async function generarHash(password) {
  const sal = crypto.randomBytes(16);
  const hash = await scrypt(password, sal, LONGITUD_HASH, { ...PARAMETROS, maxmem: MEMORIA_MAXIMA });
  const { N, r, p } = PARAMETROS;
  return ['scrypt', N, r, p, sal.toString('base64'), hash.toString('base64')].join('$');
}

/** Compara una contraseña con el hash guardado usando comparación de tiempo constante. */
async function verificarPassword(password, almacenado) {
  const partes = String(almacenado).split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, N, r, p, salBase64, hashBase64] = partes;
  const esperado = Buffer.from(hashBase64, 'base64');
  const calculado = await scrypt(password, Buffer.from(salBase64, 'base64'), esperado.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: MEMORIA_MAXIMA,
  });
  return crypto.timingSafeEqual(calculado, esperado);
}

module.exports = { generarHash, verificarPassword };
