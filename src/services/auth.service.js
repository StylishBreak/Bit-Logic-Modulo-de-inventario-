const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const store = require('../data/store');
const config = require('../config');
const { requeridos, EMAIL_RE } = require('../utils/validators');
const { badRequest, unauthorized, forbidden } = require('../utils/errors');

async function login(body = {}) {
  requeridos(body, ['correo', 'contrasena']);
  if (!EMAIL_RE.test(body.correo)) throw badRequest('El correo tiene un formato inválido');
  const usuario = store.db.usuarios.find((u) => u.correo === String(body.correo).toLowerCase());
  const ok = usuario && (await bcrypt.compare(String(body.contrasena), usuario.hash));
  if (!ok) throw unauthorized('Credenciales incorrectas');
  if (usuario.estado !== 'activo') throw forbidden('Usuario bloqueado o pendiente de validación');
  const token = jwt.sign(
    { sub: usuario.id, rol: usuario.rol, comedorId: usuario.comedorId },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn, algorithm: 'HS256' },
  );
  return { token, usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol, comedorId: usuario.comedorId } };
}

module.exports = { login };
