class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
const badRequest = (msg, details) => new AppError(400, msg, details);
const unauthorized = (msg = 'No autenticado') => new AppError(401, msg);
const forbidden = (msg = 'No tienes permiso para realizar esta acción') => new AppError(403, msg);
const notFound = (msg = 'Recurso no encontrado') => new AppError(404, msg);
const conflict = (msg) => new AppError(409, msg);
module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict };
