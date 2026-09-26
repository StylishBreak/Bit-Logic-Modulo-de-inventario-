'use strict';

// Pruebas unitarias de las reglas de negocio del límite de recepción (funciones puras)
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const calculos = require('../src/services/calculos');

describe('Reglas del límite de recepción (calculos.js)', () => {
  test('CP-23 · stockMaximo() = consumo diario × días de cobertura', () => {
    assert.equal(calculos.stockMaximo(20, 30), 600);
    assert.equal(calculos.stockMaximo(10, 30), 300);
    assert.equal(calculos.stockMaximo(0.5, 7), 3.5);
  });

  test('CP-43/CP-44 · porcentajeOcupacion() redondea a un decimal y trata capacidad 0 como lleno', () => {
    assert.equal(calculos.porcentajeOcupacion(284, 400), 71);
    assert.equal(calculos.porcentajeOcupacion(1, 3), 33.3);
    assert.equal(calculos.porcentajeOcupacion(0, 0), 100);
  });

  test('CP-43/CP-44 · semaforo() respeta los umbrales 70 % y 90 %', () => {
    assert.equal(calculos.semaforo(0), 'verde');
    assert.equal(calculos.semaforo(69.9), 'verde');
    assert.equal(calculos.semaforo(70), 'amarillo');
    assert.equal(calculos.semaforo(89.9), 'amarillo');
    assert.equal(calculos.semaforo(90), 'rojo');
    assert.equal(calculos.semaforo(100), 'rojo');
  });

  test('CP-36 · calcularRecepcion() acepta todo cuando hay espacio y no se rebasa el máximo', () => {
    const r = calculos.calcularRecepcion({ cantidad: 50, stockActual: 120, stockMax: 300, capacidad: 1000, ocupado: 210 });
    assert.deepEqual(
      { aceptada: r.aceptada, rechazada: r.rechazada, parcial: r.parcial, motivo: r.motivo },
      { aceptada: 50, rechazada: 0, parcial: false, motivo: null }
    );
  });

  test('CP-37 · calcularRecepcion() recibe parcialmente cuando falta espacio', () => {
    const r = calculos.calcularRecepcion({ cantidad: 200, stockActual: 0, stockMax: 300, capacidad: 200, ocupado: 60 });
    assert.equal(r.aceptada, 140);
    assert.equal(r.rechazada, 60);
    assert.equal(r.parcial, true);
    assert.equal(r.limitadoPor, 'espacio');
    assert.match(r.motivo, /Espacio insuficiente/);
  });

  test('CP-38 · calcularRecepcion() limita por stock máximo del producto', () => {
    const r = calculos.calcularRecepcion({ cantidad: 50, stockActual: 180, stockMax: 200, capacidad: 400, ocupado: 204 });
    assert.equal(r.aceptada, 20);
    assert.equal(r.rechazada, 30);
    assert.equal(r.limitadoPor, 'stockMaximo');
    assert.match(r.motivo, /stock máximo/);

    const lleno = calculos.calcularRecepcion({ cantidad: 10, stockActual: 200, stockMax: 200, capacidad: 400, ocupado: 224 });
    assert.equal(lleno.aceptada, 0);
    assert.equal(lleno.parcial, false);
  });

  test('CP-46 · calcularRecepcion() con excepción acepta la cantidad completa', () => {
    const r = calculos.calcularRecepcion({
      cantidad: 30, stockActual: 200, stockMax: 200, capacidad: 400, ocupado: 400, excepcion: true,
    });
    assert.equal(r.aceptada, 30);
    assert.equal(r.rechazada, 0);
    assert.equal(r.excepcion, true);
  });

  test('CP-19 · estadoCaducidad() distingue caducado, por caducar y vigente', () => {
    assert.equal(calculos.estadoCaducidad(-1, 7), 'caducado');
    assert.equal(calculos.estadoCaducidad(0, 7), 'por_caducar');
    assert.equal(calculos.estadoCaducidad(7, 7), 'por_caducar');
    assert.equal(calculos.estadoCaducidad(8, 7), 'vigente');
  });

  test('redondear() evita errores de punto flotante', () => {
    assert.equal(calculos.redondear(0.1 + 0.2), 0.3);
  });
});
