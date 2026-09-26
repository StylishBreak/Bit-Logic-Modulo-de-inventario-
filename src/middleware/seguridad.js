'use strict';

/**
 * Encabezados de seguridad HTTP que se envían en todas las respuestas.
 * Se agregaron después del primer escaneo de OWASP ZAP (ver documento, sección 4.1).
 */
const ENCABEZADOS_SEGURIDAD = Object.freeze({
  // Solo se permiten recursos del propio sitio; bloquea scripts inyectados y el uso en iframes
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Frame-Options': 'DENY', // anti-clickjacking para navegadores antiguos
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Origin-Agent-Cluster': '?1',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'X-DNS-Prefetch-Control': 'off',
  // Las respuestas pueden contener datos del inventario o tokens: no se guardan en caché
  'Cache-Control': 'no-store',
});

function aplicarEncabezadosSeguridad(res) {
  for (const [nombre, valor] of Object.entries(ENCABEZADOS_SEGURIDAD)) {
    res.setHeader(nombre, valor);
  }
}

module.exports = { ENCABEZADOS_SEGURIDAD, aplicarEncabezadosSeguridad };
