'use strict';

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha de hoy (AAAA-MM-DD) en la zona horaria indicada. */
function hoy(zonaHoraria = 'America/Mexico_City', ahora = new Date()) {
  // El formato en-CA entrega la fecha como AAAA-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

/** Verifica que el texto tenga formato AAAA-MM-DD y sea una fecha real del calendario. */
function esFechaValida(texto) {
  if (typeof texto !== 'string' || !FORMATO_FECHA.test(texto)) return false;
  const [anio, mes, dia] = texto.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
  );
}

/** Días completos entre dos fechas AAAA-MM-DD (negativo si "hasta" es anterior a "desde"). */
function diasEntre(desde, hasta) {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / MS_POR_DIA);
}

/** Suma (o resta) días a una fecha AAAA-MM-DD. */
function sumarDias(fecha, dias) {
  const resultado = new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * MS_POR_DIA);
  return resultado.toISOString().slice(0, 10);
}

module.exports = { hoy, esFechaValida, diasEntre, sumarDias };
