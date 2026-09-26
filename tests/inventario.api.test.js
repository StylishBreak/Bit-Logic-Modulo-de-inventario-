'use strict';

// Pruebas de la API: consultas, entradas con límite de recepción, salidas y mermas
const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, productoValido } = require('./helpers');

describe('Consultar inventario', () => {
  let entorno;
  beforeEach(async () => {
    entorno = await crearEntorno();
  });
  afterEach(() => entorno.cerrar());

  test('CP-14 · Usuario consulta el inventario de su comedor → 200', async () => {
    const r = await entorno.pedir('GET', '/api/comedores/1/inventario', { token: entorno.tokens.usuarioA });
    assert.equal(r.estado, 200);
    assert.equal(r.datos.comedor.nombre, 'Comedor Comunitario A');
    assert.equal(r.datos.productos.length, 5);
    const arroz = r.datos.productos.find((p) => p.nombre === 'Arroz');
    assert.equal(arroz.stock, 120);
    assert.equal(arroz.stockMaximo, 300);
    assert.deepEqual(
      r.datos.almacenamiento.map((a) => [a.tipo, a.porcentaje, a.semaforo]),
      [['seco', 21, 'verde'], ['refrigerado', 51, 'verde'], ['congelado', 30, 'verde']]
    );
  });

  test('CP-15 · Usuario intenta consultar otro comedor → 403', async () => {
    const r = await entorno.pedir('GET', '/api/comedores/2/inventario', { token: entorno.tokens.usuarioA });
    assert.equal(r.estado, 403);
    assert.equal(r.datos.error, 'Solo puedes consultar u operar el inventario de tu comedor');
  });

  test('CP-16 · Administrador consulta cualquier comedor → 200', async () => {
    const r = await entorno.pedir('GET', '/api/comedores/2/inventario', { token: entorno.tokens.admin });
    assert.equal(r.estado, 200);
    assert.equal(r.datos.comedor.nombre, 'Comedor Comunitario B');
  });

  test('CP-17 · comedor inexistente → 404', async () => {
    const r = await entorno.pedir('GET', '/api/comedores/999/inventario', { token: entorno.tokens.admin });
    assert.equal(r.estado, 404);
    assert.equal(r.datos.error, 'Comedor no encontrado');
  });

  test('CP-18 · id con formato incorrecto → 400', async () => {
    const r = await entorno.pedir('GET', '/api/comedores/abc/inventario', { token: entorno.tokens.admin });
    assert.equal(r.estado, 400);
    assert.equal(r.datos.error, 'El id del comedor debe ser un número entero positivo');
  });

  test('CP-19 · producto por caducar aparece marcado y con alerta', async () => {
    const r = await entorno.pedir('GET', '/api/comedores/1/inventario', { token: entorno.tokens.usuarioA });
    const yogur = r.datos.productos.find((p) => p.nombre === 'Yogur');
    assert.equal(yogur.estadoCaducidad, 'por_caducar');
    // Los datos de ejemplo usan la misma zona horaria que la API: exactamente 5 días
    assert.equal(yogur.diasParaCaducar, 5);
    assert.ok(r.datos.alertas.some((a) => a.tipo === 'caducidad' && a.mensaje.startsWith('Yogur')));
  });

  test('CP-20 · Usuario pide el inventario general (exclusivo de Administrador) → 403', async () => {
    const r = await entorno.pedir('GET', '/api/inventario', { token: entorno.tokens.usuarioA });
    assert.equal(r.estado, 403);
    assert.equal(r.datos.error, 'No tienes permiso para realizar esta acción');
  });

  test('CP-21 · Administrador consulta el inventario general con semáforo → 200', async () => {
    const r = await entorno.pedir('GET', '/api/inventario', { token: entorno.tokens.admin });
    assert.equal(r.estado, 200);
    assert.equal(r.datos.comedores.length, 2);
    const comedorB = r.datos.comedores.find((c) => c.id === 2);
    assert.deepEqual(
      comedorB.almacenamiento.map((a) => [a.tipo, a.semaforo]),
      [['seco', 'verde'], ['refrigerado', 'amarillo'], ['congelado', 'rojo']]
    );
    assert.equal(r.datos.comedores.find((c) => c.id === 1).productosPorCaducar, 1);
  });

  test('CP-22 · historial de movimientos une producto y usuario (JOIN en SQL)', async () => {
    await entorno.pedir('POST', '/api/comedores/1/salidas', {
      token: entorno.tokens.usuarioA,
      cuerpo: { productoId: 1, cantidad: 20 },
    });
    const r = await entorno.pedir('GET', '/api/comedores/1/movimientos', { token: entorno.tokens.usuarioA });
    assert.equal(r.estado, 200);
    const [ultimo] = r.datos.movimientos;
    assert.equal(ultimo.tipo, 'salida');
    assert.equal(ultimo.producto, 'Arroz');
    assert.equal(ultimo.usuario, 'Responsable Comedor A');
    assert.equal(ultimo.excepcion, false);
    const otro = await entorno.pedir('GET', '/api/comedores/2/movimientos', { token: entorno.tokens.usuarioA });
    assert.equal(otro.estado, 403);
  });
});

describe('Registrar entradas con límite de recepción', () => {
  let entorno;
  beforeEach(async () => {
    entorno = await crearEntorno();
  });
  afterEach(() => entorno.cerrar());

  const entrada = (token, cuerpo, comedor = 1) =>
    entorno.pedir('POST', `/api/comedores/${comedor}/entradas`, { token, cuerpo });

  async function crearProducto(datos) {
    const r = await entorno.pedir('POST', '/api/comedores/1/productos', {
      token: entorno.tokens.admin,
      cuerpo: productoValido(datos),
    });
    assert.equal(r.estado, 201);
    return r.datos;
  }

  test('CP-36 · recepción dentro de la capacidad → 201', async () => {
    const r = await entrada(entorno.tokens.usuarioA, { productoId: 1, cantidad: 50 });
    assert.equal(r.estado, 201);
    assert.equal(r.datos.stock, 170);
    assert.equal(r.datos.recepcion.parcial, false);
    assert.equal(r.datos.recepcion.aceptada, 50);
    assert.equal(r.datos.almacenamiento.porcentaje, 26);
  });

  test('CP-37 · recepción parcial por falta de espacio → 201 con cantidad rechazada', async () => {
    const pescado = await crearProducto({ nombre: 'Pescado', categoria: 'Carnes', almacenamiento: 'congelado', consumoDiario: 10, lote: 'PE-01' });
    const r = await entrada(entorno.tokens.usuarioA, { productoId: pescado.id, cantidad: 200 });
    assert.equal(r.estado, 201);
    assert.deepEqual(
      { aceptada: r.datos.recepcion.aceptada, rechazada: r.datos.recepcion.rechazada, parcial: r.datos.recepcion.parcial, limitadoPor: r.datos.recepcion.limitadoPor },
      { aceptada: 140, rechazada: 60, parcial: true, limitadoPor: 'espacio' }
    );
    assert.equal(r.datos.almacenamiento.semaforo, 'rojo');

    const sinEspacio = await entrada(entorno.tokens.usuarioA, { productoId: pescado.id, cantidad: 10 });
    assert.equal(sinEspacio.estado, 409);
    assert.equal(sinEspacio.datos.error, 'Sin espacio disponible en el almacenamiento congelado');
  });

  test('CP-38 · valor fuera del límite por producto: se recibe hasta el stock máximo y luego 409', async () => {
    const parcial = await entrada(entorno.tokens.usuarioA, { productoId: 3, cantidad: 50 });
    assert.equal(parcial.estado, 201);
    assert.equal(parcial.datos.recepcion.aceptada, 20);
    assert.equal(parcial.datos.recepcion.rechazada, 30);
    assert.equal(parcial.datos.recepcion.limitadoPor, 'stockMaximo');
    assert.equal(parcial.datos.stock, 200);

    const lleno = await entrada(entorno.tokens.usuarioA, { productoId: 3, cantidad: 10 });
    assert.equal(lleno.estado, 409);
    assert.equal(lleno.datos.error, 'Leche ya alcanzó su stock máximo');
  });

  test('CP-39 · cantidades fuera de límites (0, negativa, mayor a 10,000) → 400', async () => {
    for (const cantidad of [0, -5, 10001]) {
      const r = await entrada(entorno.tokens.usuarioA, { productoId: 1, cantidad });
      assert.equal(r.estado, 400);
      assert.deepEqual(r.datos.detalles, ['El campo cantidad debe estar entre 1 y 10000']);
    }
  });

  test('CP-40 · formato incorrecto (cantidad como texto) → 400', async () => {
    const r = await entrada(entorno.tokens.usuarioA, { productoId: 1, cantidad: 'diez' });
    assert.equal(r.estado, 400);
    assert.deepEqual(r.datos.detalles, ['El campo cantidad debe ser numérico']);
  });

  test('CP-41 · producto inexistente → 404', async () => {
    const r = await entrada(entorno.tokens.usuarioA, { productoId: 999, cantidad: 5 });
    assert.equal(r.estado, 404);
    assert.equal(r.datos.error, 'Producto no encontrado en este comedor');
    // Un producto de otro comedor tampoco se puede usar (id 6 es del Comedor B)
    const otro = await entrada(entorno.tokens.usuarioA, { productoId: 6, cantidad: 5 });
    assert.equal(otro.estado, 404);
  });

  test('CP-42 · Usuario intenta registrar una entrada en otro comedor → 403', async () => {
    const r = await entrada(entorno.tokens.usuarioA, { productoId: 6, cantidad: 5 }, 2);
    assert.equal(r.estado, 403);
  });

  test('CP-43 · la ocupación entre 70 % y 89 % pone el semáforo en amarillo', async () => {
    const crema = await crearProducto({ nombre: 'Crema', categoria: 'Lácteos', almacenamiento: 'refrigerado', unidad: 'l', consumoDiario: 10, lote: 'CR-01' });
    const r = await entrada(entorno.tokens.usuarioA, { productoId: crema.id, cantidad: 80 });
    assert.equal(r.estado, 201);
    assert.equal(r.datos.almacenamiento.porcentaje, 71);
    assert.equal(r.datos.almacenamiento.semaforo, 'amarillo');
  });

  test('CP-44 · la ocupación de 90 % o más pone el semáforo en rojo', async () => {
    const crema = await crearProducto({ nombre: 'Crema', categoria: 'Lácteos', almacenamiento: 'refrigerado', unidad: 'l', consumoDiario: 10, lote: 'CR-01' });
    await entrada(entorno.tokens.usuarioA, { productoId: crema.id, cantidad: 80 });
    const r = await entrada(entorno.tokens.usuarioA, { productoId: crema.id, cantidad: 80 });
    assert.equal(r.datos.almacenamiento.porcentaje, 91);
    assert.equal(r.datos.almacenamiento.semaforo, 'rojo');
    const inventario = await entorno.pedir('GET', '/api/comedores/1/inventario', { token: entorno.tokens.usuarioA });
    assert.ok(inventario.datos.alertas.some((a) => a.tipo === 'ocupacion' && a.mensaje.includes('refrigerado')));
  });

  test('CP-45 · Usuario intenta autorizar una excepción (exclusivo de Administrador) → 403', async () => {
    const r = await entrada(entorno.tokens.usuarioA, { productoId: 3, cantidad: 30, excepcion: true, motivo: 'Donación urgente' });
    assert.equal(r.estado, 403);
    assert.match(r.datos.error, /Solo el Administrador/);
  });

  test('CP-46 · Administrador autoriza una recepción sobre el límite → 201', async () => {
    await entrada(entorno.tokens.usuarioA, { productoId: 3, cantidad: 20 }); // Leche llega a su máximo (200)
    const r = await entrada(entorno.tokens.admin, {
      productoId: 3,
      cantidad: 30,
      excepcion: true,
      motivo: 'Donación urgente de lácteos',
    });
    assert.equal(r.estado, 201);
    assert.equal(r.datos.recepcion.excepcion, true);
    assert.equal(r.datos.recepcion.aceptada, 30);
    assert.equal(r.datos.stock, 230);
    assert.equal(r.datos.movimiento.motivo, 'Donación urgente de lácteos');
  });

  test('CP-47 · excepción sin motivo → 400', async () => {
    const r = await entrada(entorno.tokens.admin, { productoId: 3, cantidad: 30, excepcion: true });
    assert.equal(r.estado, 400);
    assert.deepEqual(r.datos.detalles, ['El motivo es obligatorio para autorizar una excepción']);
  });
});

describe('Registrar salidas y mermas', () => {
  let entorno;
  beforeEach(async () => {
    entorno = await crearEntorno();
  });
  afterEach(() => entorno.cerrar());

  test('CP-48 · Usuario registra una salida en su comedor → 201 y el stock baja de 120 a 100', async () => {
    const r = await entorno.pedir('POST', '/api/comedores/1/salidas', {
      token: entorno.tokens.usuarioA,
      cuerpo: { productoId: 1, cantidad: 20 },
    });
    assert.equal(r.estado, 201);
    assert.equal(r.datos.stock, 100);
    assert.equal(r.datos.movimiento.tipo, 'salida');
    assert.equal(r.datos.movimiento.usuarioId, 2);
    // El cambio quedó guardado en la base SQLite
    const fila = entorno.db.prepare('SELECT stock FROM productos WHERE id = 1').get();
    assert.equal(fila.stock, 100);
  });

  test('CP-49 · salida mayor al stock → 400', async () => {
    const r = await entorno.pedir('POST', '/api/comedores/1/salidas', {
      token: entorno.tokens.usuarioA,
      cuerpo: { productoId: 1, cantidad: 500 },
    });
    assert.equal(r.estado, 400);
    assert.equal(r.datos.error, 'Stock insuficiente: hay 120 kg de Arroz');
  });

  test('CP-50 · Usuario registra una merma con motivo → 201', async () => {
    const r = await entorno.pedir('POST', '/api/comedores/1/mermas', {
      token: entorno.tokens.usuarioA,
      cuerpo: { productoId: 5, cantidad: 4, motivo: 'Empaque dañado' },
    });
    assert.equal(r.estado, 201);
    assert.equal(r.datos.stock, 20);
    assert.equal(r.datos.movimiento.motivo, 'Empaque dañado');
  });

  test('CP-51 · merma sin motivo → 400', async () => {
    const r = await entorno.pedir('POST', '/api/comedores/1/mermas', {
      token: entorno.tokens.usuarioA,
      cuerpo: { productoId: 5, cantidad: 4 },
    });
    assert.equal(r.estado, 400);
    assert.deepEqual(r.datos.detalles, ['El motivo de la merma es obligatorio']);
  });
});
