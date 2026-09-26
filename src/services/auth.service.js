'use strict';

const crypto = require('node:crypto');
const { generarHash, verificarPassword } = require('../utils/password');
const { firmarToken } = require('../utils/jwt');
const { validarCredenciales } = require('../utils/validators');
const { errores } = require('../utils/errores');

function crearServicioAuth({ db, config }) {
  const buscarPorCorreo = db.prepare(`
    SELECT id, nombre, password_hash AS passwordHash, rol, comedor_id AS comedorId, activo
    FROM usuarios
    WHERE correo = ?`);

  // Si el correo no existe se verifica contra un hash de relleno para que la respuesta
  // tarde lo mismo y no revele qué correos están registrados.
  let hashDeRelleno;
  async function obtenerHashDeRelleno() {
    hashDeRelleno ??= await generarHash(crypto.randomUUID());
    return hashDeRelleno;
  }

  async function iniciarSesion(datos) {
    const { correo, password } = validarCredenciales(datos);
    const usuario = buscarPorCorreo.get(correo);
    const hash = usuario ? usuario.passwordHash : await obtenerHashDeRelleno();
    const coincide = await verificarPassword(password, hash);

    if (!usuario || !coincide) throw errores.noAutenticado('Credenciales incorrectas');
    if (usuario.activo !== 1) throw errores.prohibido('Usuario bloqueado. Contacta al Administrador');

    const token = firmarToken(
      { sub: usuario.id, rol: usuario.rol, comedorId: usuario.comedorId },
      config.jwtSecreto,
      config.jwtExpiraSegundos
    );
    return {
      token,
      tipo: 'Bearer',
      expiraEn: config.jwtExpiraSegundos,
      usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol, comedorId: usuario.comedorId },
    };
  }

  return { iniciarSesion };
}

module.exports = { crearServicioAuth };
