const { badRequest } = require('./errors');

const ALMACENAMIENTOS = ['seco', 'refrigerado', 'congelado'];
const UNIDADES = ['kg', 'L', 'pza'];
const MAX_CANTIDAD = 10000; // límite superior por operación
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const TEXTO_RE = /^[\p{L}\p{N} .,()-]+$/u;

function requeridos(body, campos) {
  const faltantes = campos.filter((c) => body[c] === undefined || body[c] === null || String(body[c]).trim() === '');
  if (faltantes.length) throw badRequest('Campos obligatorios vacíos', { faltantes });
}

function cantidadValida(valor, campo = 'cantidad') {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) throw badRequest(`${campo} debe ser numérico`);
  if (valor <= 0) throw badRequest(`${campo} debe ser mayor que 0`);
  if (valor > MAX_CANTIDAD) throw badRequest(`${campo} no puede ser mayor que ${MAX_CANTIDAD}`);
}

function textoValido(valor, campo, max = 80) {
  if (typeof valor !== 'string' || valor.length > max || !TEXTO_RE.test(valor)) {
    throw badRequest(`${campo} tiene un formato inválido`);
  }
}

function fechaValida(valor, campo = 'caducidad') {
  if (typeof valor !== 'string' || !FECHA_RE.test(valor) || Number.isNaN(Date.parse(valor))) {
    throw badRequest(`${campo} debe tener formato AAAA-MM-DD`);
  }
}

function noCaducado(fecha, hoy = new Date()) {
  const f = new Date(`${fecha}T23:59:59`);
  if (f < hoy) throw badRequest('El producto está caducado');
}

function idValido(valor) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw badRequest('Identificador inválido');
  return n;
}

module.exports = { ALMACENAMIENTOS, UNIDADES, MAX_CANTIDAD, EMAIL_RE, requeridos, cantidadValida, textoValido, fechaValida, noCaducado, idValido };
