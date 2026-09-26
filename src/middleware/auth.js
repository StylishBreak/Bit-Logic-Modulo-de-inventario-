const jwt = require('jsonwebtoken');
const config = require('../config');
const { unauthorized, forbidden } = require('../utils/errors');

/** Verifica el JWT enviado en el encabezado Authorization: Bearer <token>. */
function autenticar(req, _res, next) {
  const header = req.headers.authorization || '';
  const [tipo, token] = header.split(' ');
  if (tipo !== 'Bearer' || !token) return next(unauthorized('Token no proporcionado'));
  try {
    req.usuario = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    return next();
  } catch (e) {
    return next(unauthorized(e.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido'));
  }
}

/** Permite el acceso solo a los roles indicados. */
const autorizar = (...roles) => (req, _res, next) => {
  if (!req.usuario || !roles.includes(req.usuario.rol)) return next(forbidden());
  return next();
};

module.exports = { autenticar, autorizar };
