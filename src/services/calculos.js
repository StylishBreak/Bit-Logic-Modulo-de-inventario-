// Reglas de negocio puras del límite de recepción (sección 6 del documento del módulo).
const config = require('../config');

/** Espacio disponible = Capacidad máxima − Inventario actual − Donaciones en camino */
function espacioDisponible(capacidad, inventarioActual, enCamino = 0) {
  return Math.max(0, capacidad - inventarioActual - enCamino);
}

/** Stock máximo de un producto = Consumo diario × Días de cobertura */
function stockMaximo(consumoDiario, diasCobertura) {
  return consumoDiario * diasCobertura;
}

function ocupacion(capacidad, inventarioActual, enCamino = 0) {
  if (!capacidad) return 1;
  return (inventarioActual + enCamino) / capacidad;
}

/** Verde < 70 %, Amarillo 70–89 %, Rojo ≥ 90 % */
function semaforo(porcentaje, umbrales = config.semaforo) {
  if (porcentaje >= umbrales.rojo) return 'rojo';
  if (porcentaje >= umbrales.amarillo) return 'amarillo';
  return 'verde';
}

/** Cuánto se acepta y cuánto se redirige respetando espacio y stock máximo del producto. */
function calcularRecepcion({ cantidad, espacio, stockMax, stockActual }) {
  const margenProducto = Math.max(0, stockMax - stockActual);
  const cantidadAceptada = Math.min(cantidad, espacio, margenProducto);
  return { cantidadAceptada, cantidadRedirigida: cantidad - cantidadAceptada };
}

function diasParaCaducar(fecha, hoy = new Date()) {
  const f = new Date(`${fecha}T00:00:00`);
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((f - h) / 86400000);
}

module.exports = { espacioDisponible, stockMaximo, ocupacion, semaforo, calcularRecepcion, diasParaCaducar };
