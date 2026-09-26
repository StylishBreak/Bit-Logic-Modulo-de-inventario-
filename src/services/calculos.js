'use strict';

/**
 * Reglas de negocio del límite de recepción. Son funciones puras (sin base de datos)
 * para poder probarlas de forma aislada.
 */

const UMBRAL_AMARILLO = 70;
const UMBRAL_ROJO = 90;

function redondear(valor) {
  return Math.round(valor * 100) / 100;
}

/** Stock máximo de un producto = consumo diario × días de cobertura. */
function stockMaximo(consumoDiario, diasCobertura) {
  return redondear(consumoDiario * diasCobertura);
}

/** Porcentaje ocupado de un almacenamiento (con un decimal). Sin capacidad se considera lleno. */
function porcentajeOcupacion(ocupado, capacidad) {
  if (capacidad <= 0) return 100;
  return Math.round((ocupado / capacidad) * 1000) / 10;
}

/** Semáforo de ocupación: verde < 70 %, amarillo 70–89.9 %, rojo ≥ 90 %. */
function semaforo(porcentaje) {
  if (porcentaje >= UMBRAL_ROJO) return 'rojo';
  if (porcentaje >= UMBRAL_AMARILLO) return 'amarillo';
  return 'verde';
}

/**
 * Calcula cuánto se puede recibir de una entrada.
 * Límite = el menor entre el espacio libre del almacenamiento y lo que le falta al
 * producto para llegar a su stock máximo. Una excepción del Administrador acepta todo.
 */
function calcularRecepcion({ cantidad, stockActual, stockMax, capacidad, ocupado, excepcion = false }) {
  if (excepcion) {
    return {
      solicitada: cantidad,
      aceptada: cantidad,
      rechazada: 0,
      parcial: false,
      excepcion: true,
      limitadoPor: null,
      motivo: 'Excepción autorizada por el Administrador',
    };
  }

  const espacioDisponible = redondear(Math.max(0, capacidad - ocupado));
  const faltanteProducto = redondear(Math.max(0, stockMax - stockActual));
  const limitadoPor = espacioDisponible <= faltanteProducto ? 'espacio' : 'stockMaximo';
  const aceptada = redondear(Math.min(cantidad, espacioDisponible, faltanteProducto));
  const rechazada = redondear(cantidad - aceptada);

  let motivo = null;
  if (rechazada > 0) {
    motivo =
      limitadoPor === 'espacio'
        ? 'Espacio insuficiente en el almacenamiento'
        : 'Se alcanza el stock máximo del producto';
  }

  return {
    solicitada: cantidad,
    aceptada,
    rechazada,
    parcial: aceptada > 0 && rechazada > 0,
    excepcion: false,
    limitadoPor: rechazada > 0 ? limitadoPor : null,
    motivo,
  };
}

/** Estado de caducidad según los días que faltan. */
function estadoCaducidad(diasRestantes, diasAlerta) {
  if (diasRestantes < 0) return 'caducado';
  if (diasRestantes <= diasAlerta) return 'por_caducar';
  return 'vigente';
}

module.exports = {
  UMBRAL_AMARILLO,
  UMBRAL_ROJO,
  redondear,
  stockMaximo,
  porcentajeOcupacion,
  semaforo,
  calcularRecepcion,
  estadoCaducidad,
};
