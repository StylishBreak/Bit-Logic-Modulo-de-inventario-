'use strict';

const { verificarToken } = require('../utils/jwt');
const { errores } = require('../utils/errores');

const ROLES = ['Usuario', 'Administrador'];

/**
 * Lee el encabezado "Authorization: Bearer <token>", verifica el JWT y
 * devuelve los datos del usuario que viajan en el token.
 */
function autenticar(encabezado, secreto) {
  if (!encabezado) throw errores.noAutenticado('Token no proporcionado');
  const [esquema, token, ...resto] = String(encabezado).split(' ');
  if (esquema !== 'Bearer' || !token || resto.length > 0) {
    throw errores.noAutenticado('Formato inválido: usa Authorization: Bearer <token>');
  }
  const datos = verificarToken(token, secreto);
  if (!ROLES.includes(datos.rol) || !Number.isInteger(datos.sub)) {
    throw errores.noAutenticado('Token inválido');
  }
  return { id: datos.sub, rol: datos.rol, comedorId: datos.comedorId ?? null };
}

/** Permite continuar solo si el rol del usuario está en la lista de la ruta. */
function autorizar(usuario, rolesPermitidos) {
  if (!rolesPermitidos.includes(usuario.rol)) throw errores.prohibido();
}

/** Un Usuario solo puede trabajar con su propio comedor; el Administrador, con todos. */
function verificarAccesoComedor(usuario, comedorId) {
  if (usuario.rol !== 'Administrador' && usuario.comedorId !== comedorId) {
    throw errores.prohibido('Solo puedes consultar u operar el inventario de tu comedor');
  }
}

module.exports = { ROLES, autenticar, autorizar, verificarAccesoComedor };
