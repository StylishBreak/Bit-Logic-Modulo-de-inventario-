'use strict';

// Pruebas de la API: acciones exclusivas del Administrador (productos y capacidad)
const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { hoy, sumarDias } = require('../src/utils/fechas');
const { crearEntorno, productoValido, ZONA } = require('./helpers');

describe('Crear y eliminar productos', () => {
  let entorno;
  beforeEach(async () => {
    entorno = await crearEntorno();
  });
  afterEach(() => entorno.cerrar());

  const crear = (token, cuerpo) => entorno.pedir('POST', '/api/comedores/1/productos', { token, cuerpo });

  test('CP-23 · Administrador crea un producto con datos válidos → 201', async () => {
    const r = await crear(entorno.tokens.admin, productoValido());
    assert.equal(r.estado, 201);
    assert.equal(r.datos.nombre, 'Pasta');
    assert.equal(r.datos.stock, 0);
    assert.equal(r.datos.stockMaximo, 600);
    assert.equal(r.datos.comedorId, 1);
  });

  test('CP-24 · Usuario intenta crear un producto → 403', async () => {
    const r = await crear(entorno.tokens.usuarioA, productoValido());
    assert.equal(r.estado, 403);
    assert.equal(r.datos.error, 'No tienes permiso para realizar esta acción');
  });

  test('CP-25 · campos obligatorios vacíos → 400 con los 8 campos', async () => {
    const r = await crear(entorno.tokens.admin, {});
    assert.equal(r.estado, 400);
    assert.equal(r.datos.detalles.length, 8);
  });

  test('CP-26 · formatos incorrectos → 400', async () => {
    const r = await crear(
      entorno.tokens.admin,
      productoValido({ consumoDiario: 'veinte', caducidad: '01/05/2027', almacenamiento: 'ambiente' })
    );
    assert.equal(r.estado, 400);
    assert.equal(r.datos.detalles.length, 3);
  });

  test('CP-27 · valores fuera de los límites → 400', async () => {
    const r = await crear(entorno.tokens.admin, productoValido({ diasCobertura: 400, consumoDiario: 0 }));
    assert.equal(r.estado, 400);
    assert.deepEqual(r.datos.detalles, [
      'El campo consumoDiario debe estar entre 0.01 y 10000',
      'El campo diasCobertura debe estar entre 1 y 365',
    ]);
  });

  test('CP-28 · producto ya caducado → 400', async () => {
    const ayer = sumarDias(hoy(ZONA), -1);
    const r = await crear(entorno.tokens.admin, productoValido({ caducidad: ayer }));
    assert.equal(r.estado, 400);
    assert.deepEqual(r.datos.detalles, ['El producto ya caducó o caduca hoy; no se puede registrar']);
  });

  test('CP-29 · registro duplicado (mismo nombre y lote, sin importar mayúsculas) → 409', async () => {
    const r = await crear(entorno.tokens.admin, productoValido({ nombre: 'arroz', lote: 'ar-2601' }));
    assert.equal(r.estado, 409);
    assert.equal(r.datos.error, 'Ya existe arroz con el lote ar-2601 en este comedor');
  });

  test('CP-30 · campo no permitido (intentar fijar el stock directamente) → 400', async () => {
    const r = await crear(entorno.tokens.admin, productoValido({ stock: 999 }));
    assert.equal(r.estado, 400);
    assert.deepEqual(r.datos.detalles, ['Campo no permitido: stock']);
  });

  test('CP-31 · texto con código HTML/JavaScript → 400', async () => {
    const r = await crear(entorno.tokens.admin, productoValido({ nombre: '<script>alert(1)</script>' }));
    assert.equal(r.estado, 400);
    assert.deepEqual(r.datos.detalles, ['El campo nombre contiene caracteres no permitidos']);
  });

  test('CP-32 · Administrador elimina un producto sin existencias → 200 (baja lógica)', async () => {
    const creado = await crear(entorno.tokens.admin, productoValido({ nombre: 'Avena', lote: 'AV-01' }));
    const r = await entorno.pedir('DELETE', `/api/comedores/1/productos/${creado.datos.id}`, { token: entorno.tokens.admin });
    assert.equal(r.estado, 200);
    assert.equal(r.datos.mensaje, 'Producto Avena (lote AV-01) eliminado');

    const inventario = await entorno.pedir('GET', '/api/comedores/1/inventario', { token: entorno.tokens.admin });
    assert.equal(inventario.datos.productos.some((p) => p.nombre === 'Avena'), false);
    // El registro sigue en la base con activo = 0 y se puede volver a dar de alta
    const fila = entorno.db.prepare('SELECT activo FROM productos WHERE id = ?').get(creado.datos.id);
    assert.equal(fila.activo, 0);
    const otraVez = await crear(entorno.tokens.admin, productoValido({ nombre: 'Avena', lote: 'AV-01' }));
    assert.equal(otraVez.estado, 201);
  });

  test('CP-33 · eliminar un producto inexistente → 404', async () => {
    const r = await entorno.pedir('DELETE', '/api/comedores/1/productos/999', { token: entorno.tokens.admin });
    assert.equal(r.estado, 404);
  });

  test('CP-34 · eliminar un producto con existencias → 409', async () => {
    const r = await entorno.pedir('DELETE', '/api/comedores/1/productos/1', { token: entorno.tokens.admin });
    assert.equal(r.estado, 409);
    assert.equal(r.datos.error, 'No se puede eliminar Arroz: aún tiene 120 kg en existencia');
  });

  test('CP-35 · Usuario intenta eliminar un producto → 403', async () => {
    const r = await entorno.pedir('DELETE', '/api/comedores/1/productos/1', { token: entorno.tokens.usuarioA });
    assert.equal(r.estado, 403);
  });
});

describe('Configurar capacidad de almacenamiento', () => {
  let entorno;
  beforeEach(async () => {
    entorno = await crearEntorno();
  });
  afterEach(() => entorno.cerrar());

  const configurar = (token, cuerpo) => entorno.pedir('PUT', '/api/comedores/1/capacidad', { token, cuerpo });

  test('CP-52 · Usuario intenta configurar la capacidad → 403', async () => {
    const r = await configurar(entorno.tokens.usuarioA, { seco: 1200 });
    assert.equal(r.estado, 403);
  });

  test('CP-53 · Administrador configura la capacidad y el semáforo se recalcula → 200', async () => {
    const r = await configurar(entorno.tokens.admin, { seco: 1200 });
    assert.equal(r.estado, 200);
    const seco = r.datos.almacenamiento.find((a) => a.tipo === 'seco');
    assert.deepEqual({ capacidad: seco.capacidad, porcentaje: seco.porcentaje }, { capacidad: 1200, porcentaje: 17.5 });
  });

  test('CP-54 · capacidad menor a lo ocupado (409), negativa o vacía (400)', async () => {
    const menor = await configurar(entorno.tokens.admin, { seco: 100 });
    assert.equal(menor.estado, 409);
    assert.equal(menor.datos.error, 'La capacidad de seco (100) no puede ser menor a lo ocupado actualmente (210)');
    assert.equal((await configurar(entorno.tokens.admin, { seco: -5 })).estado, 400);
    assert.equal((await configurar(entorno.tokens.admin, {})).estado, 400);
    const comedorInexistente = await entorno.pedir('PUT', '/api/comedores/999/capacidad', {
      token: entorno.tokens.admin,
      cuerpo: { seco: 10 },
    });
    assert.equal(comedorInexistente.estado, 404);
  });
});
