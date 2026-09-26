const store = require('../data/store');
const calc = require('./calculos');
const v = require('../utils/validators');
const { badRequest, forbidden, notFound, conflict } = require('../utils/errors');

const esAdmin = (u) => u.rol === 'Administrador';

function obtenerComedor(id) {
  const comedor = store.db.comedores.find((c) => c.id === id);
  if (!comedor) throw notFound('Comedor inexistente');
  return comedor;
}

function verificarAccesoComedor(usuario, comedorId) {
  if (!esAdmin(usuario) && usuario.comedorId !== comedorId) {
    throw forbidden('Solo puedes consultar o modificar el inventario de tu comedor');
  }
}

function obtenerProducto(comedorId, productoId) {
  const p = store.db.productos.find((x) => x.id === productoId && x.comedorId === comedorId);
  if (!p) throw notFound('Producto inexistente en este comedor');
  return p;
}

function inventarioActual(comedorId, almacenamiento) {
  return store.db.productos
    .filter((p) => p.comedorId === comedorId && p.almacenamiento === almacenamiento)
    .reduce((s, p) => s + p.stock, 0);
}

function enCamino(comedorId, almacenamiento) {
  return store.db.enCamino
    .filter((e) => e.comedorId === comedorId && e.almacenamiento === almacenamiento)
    .reduce((s, e) => s + e.cantidad, 0);
}

function resumenOcupacion(comedor) {
  return v.ALMACENAMIENTOS.map((alm) => {
    const actual = inventarioActual(comedor.id, alm);
    const camino = enCamino(comedor.id, alm);
    const cap = comedor.capacidad[alm];
    const oc = calc.ocupacion(cap, actual, camino);
    return {
      almacenamiento: alm,
      capacidad: cap,
      inventarioActual: actual,
      enCamino: camino,
      espacioDisponible: calc.espacioDisponible(cap, actual, camino),
      ocupacion: Math.round(oc * 1000) / 10,
      semaforo: calc.semaforo(oc),
    };
  });
}

function consultarInventario(usuario, comedorIdRaw, hoy = new Date()) {
  const comedorId = v.idValido(comedorIdRaw);
  const comedor = obtenerComedor(comedorId);
  verificarAccesoComedor(usuario, comedorId);
  const productos = store.db.productos
    .filter((p) => p.comedorId === comedorId)
    .map((p) => {
      const dias = calc.diasParaCaducar(p.caducidad, hoy);
      return { ...p, diasParaCaducar: dias, proximoACaducar: dias <= 3 };
    });
  return { comedor: comedor.nombre, ocupacion: resumenOcupacion(comedor), productos };
}

function consultarTodos() {
  return store.db.comedores.map((c) => ({
    comedorId: c.id,
    comedor: c.nombre,
    ocupacion: resumenOcupacion(c),
    productos: store.db.productos.filter((p) => p.comedorId === c.id),
  }));
}

function crearProducto(comedorIdRaw, body = {}, hoy = new Date()) {
  const comedorId = v.idValido(comedorIdRaw);
  obtenerComedor(comedorId);
  v.requeridos(body, ['nombre', 'categoria', 'almacenamiento', 'unidad', 'lote', 'caducidad', 'consumoDiario', 'diasCobertura']);
  v.textoValido(body.nombre, 'nombre');
  v.textoValido(body.categoria, 'categoria');
  v.textoValido(body.lote, 'lote', 30);
  if (!v.ALMACENAMIENTOS.includes(body.almacenamiento)) throw badRequest(`almacenamiento debe ser: ${v.ALMACENAMIENTOS.join(', ')}`);
  if (!v.UNIDADES.includes(body.unidad)) throw badRequest(`unidad debe ser: ${v.UNIDADES.join(', ')}`);
  v.fechaValida(body.caducidad);
  v.noCaducado(body.caducidad, hoy);
  v.cantidadValida(body.consumoDiario, 'consumoDiario');
  if (!Number.isInteger(body.diasCobertura) || body.diasCobertura < 1 || body.diasCobertura > 365) {
    throw badRequest('diasCobertura debe ser un entero entre 1 y 365');
  }
  const duplicado = store.db.productos.some(
    (p) => p.comedorId === comedorId && p.nombre.toLowerCase() === body.nombre.toLowerCase() && p.lote === body.lote,
  );
  if (duplicado) throw conflict('Ya existe ese producto con el mismo lote en este comedor');

  const producto = {
    id: store.db.nextId.producto++,
    comedorId,
    nombre: body.nombre.trim(),
    categoria: body.categoria.trim(),
    almacenamiento: body.almacenamiento,
    unidad: body.unidad,
    stock: 0,
    consumoDiario: body.consumoDiario,
    diasCobertura: body.diasCobertura,
    lote: body.lote.trim(),
    caducidad: body.caducidad,
  };
  store.db.productos.push(producto);
  return producto;
}

function eliminarProducto(comedorIdRaw, productoIdRaw) {
  const comedorId = v.idValido(comedorIdRaw);
  const productoId = v.idValido(productoIdRaw);
  obtenerComedor(comedorId);
  const producto = obtenerProducto(comedorId, productoId);
  store.db.productos = store.db.productos.filter((p) => p !== producto);
  return { eliminado: productoId };
}

function registrarMovimiento(usuario, tipo, comedorId, producto, cantidad, extra = {}) {
  const mov = { id: store.db.nextId.movimiento++, tipo, comedorId, productoId: producto.id, cantidad, usuarioId: usuario.sub, fecha: new Date().toISOString(), ...extra };
  store.db.movimientos.push(mov);
  return mov;
}

function registrarEntrada(usuario, comedorIdRaw, body = {}) {
  const comedorId = v.idValido(comedorIdRaw);
  const comedor = obtenerComedor(comedorId);
  verificarAccesoComedor(usuario, comedorId);
  v.requeridos(body, ['productoId', 'cantidad']);
  v.cantidadValida(body.cantidad);
  const producto = obtenerProducto(comedorId, v.idValido(body.productoId));
  const alm = producto.almacenamiento;

  const cap = comedor.capacidad[alm];
  const actual = inventarioActual(comedorId, alm);
  const camino = enCamino(comedorId, alm);
  const nivel = calc.semaforo(calc.ocupacion(cap, actual, camino));

  if (body.excepcion === true) {
    if (!esAdmin(usuario)) throw forbidden('Solo el Administrador puede autorizar excepciones');
    producto.stock += body.cantidad;
    const mov = registrarMovimiento(usuario, 'entrada', comedorId, producto, body.cantidad, { excepcion: true });
    store.db.excepciones.push({ movimientoId: mov.id, autorizadoPor: usuario.sub, fecha: mov.fecha });
    return { cantidadAceptada: body.cantidad, cantidadRedirigida: 0, semaforo: nivel, excepcion: true, stock: producto.stock };
  }

  if (nivel === 'rojo') {
    return { cantidadAceptada: 0, cantidadRedirigida: body.cantidad, semaforo: nivel, mensaje: 'Almacenamiento en rojo: la donación se redirige a otro comedor', stock: producto.stock };
  }

  const r = calc.calcularRecepcion({
    cantidad: body.cantidad,
    espacio: calc.espacioDisponible(cap, actual, camino),
    stockMax: calc.stockMaximo(producto.consumoDiario, producto.diasCobertura),
    stockActual: producto.stock,
  });
  if (r.cantidadAceptada > 0) {
    producto.stock += r.cantidadAceptada;
    registrarMovimiento(usuario, 'entrada', comedorId, producto, r.cantidadAceptada, { redirigida: r.cantidadRedirigida });
  }
  const nuevoNivel = calc.semaforo(calc.ocupacion(cap, actual + r.cantidadAceptada, camino));
  const resp = { ...r, semaforo: nuevoNivel, stock: producto.stock };
  if (nuevoNivel === 'amarillo') resp.aviso = 'El espacio de este almacenamiento se está acabando';
  return resp;
}

function registrarSalida(usuario, comedorIdRaw, body = {}, tipo = 'salida') {
  const comedorId = v.idValido(comedorIdRaw);
  obtenerComedor(comedorId);
  verificarAccesoComedor(usuario, comedorId);
  const campos = tipo === 'merma' ? ['productoId', 'cantidad', 'motivo'] : ['productoId', 'cantidad'];
  v.requeridos(body, campos);
  v.cantidadValida(body.cantidad);
  if (tipo === 'merma') v.textoValido(body.motivo, 'motivo', 120);
  const producto = obtenerProducto(comedorId, v.idValido(body.productoId));
  if (body.cantidad > producto.stock) throw badRequest('Stock insuficiente');
  producto.stock -= body.cantidad;
  const mov = registrarMovimiento(usuario, tipo, comedorId, producto, body.cantidad, tipo === 'merma' ? { motivo: body.motivo } : {});
  return { movimiento: mov, stock: producto.stock };
}

function actualizarCapacidad(comedorIdRaw, body = {}) {
  const comedorId = v.idValido(comedorIdRaw);
  const comedor = obtenerComedor(comedorId);
  v.requeridos(body, v.ALMACENAMIENTOS);
  v.ALMACENAMIENTOS.forEach((alm) => v.cantidadValida(body[alm], alm));
  comedor.capacidad = { seco: body.seco, refrigerado: body.refrigerado, congelado: body.congelado };
  return { comedorId, capacidad: comedor.capacidad };
}

module.exports = {
  consultarInventario, consultarTodos, crearProducto, eliminarProducto,
  registrarEntrada, registrarSalida, actualizarCapacidad,
};
