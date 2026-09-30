'use strict';

/**
 * Error controlado de la aplicación. Lleva el código HTTP que se debe responder
 * y, opcionalmente, una lista de detalles (por ejemplo, errores de validación).
 */
class ErrorApp extends Error {
  constructor(estado, mensaje, detalles, encabezados) {
    super(mensaje);
    this.name = 'ErrorApp';
    this.estado = estado;
    if (detalles) this.detalles = detalles;
    if (encabezados) this.encabezados = encabezados;
  }
}

const errores = {
  datosInvalidos: (detalles, mensaje = 'Datos inválidos') => new ErrorApp(400, mensaje, detalles),
  solicitudIncorrecta: (mensaje) => new ErrorApp(400, mensaje),
  noAutenticado: (mensaje = 'No autenticado') => new ErrorApp(401, mensaje),
  prohibido: (mensaje = 'No tienes permiso para realizar esta acción') => new ErrorApp(403, mensaje),
  noEncontrado: (mensaje = 'Recurso no encontrado') => new ErrorApp(404, mensaje),
  metodoNoPermitido: (permitidos) =>
    new ErrorApp(405, 'Método no permitido', undefined, { Allow: permitidos.join(', ') }),
  conflicto: (mensaje) => new ErrorApp(409, mensaje),
  demasiadoGrande: () => new ErrorApp(413, 'El cuerpo de la petición es demasiado grande'),
  tipoNoSoportado: () => new ErrorApp(415, 'El Content-Type debe ser application/json'),
  demasiadasSolicitudes: (segundos, motivo = 'Demasiados intentos de inicio de sesión') =>
    new ErrorApp(429, `${motivo}. Intenta de nuevo en ${Math.max(1, Math.ceil(segundos / 60))} min`, undefined, {
      'Retry-After': String(segundos),
    }),
};

module.exports = { ErrorApp, errores };
