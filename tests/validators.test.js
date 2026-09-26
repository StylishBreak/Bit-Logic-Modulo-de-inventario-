'use strict';

// Pruebas unitarias de las validaciones de datos y de las fechas
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const v = require('../src/utils/validators');
const { hoy, esFechaValida, diasEntre, sumarDias } = require('../src/utils/fechas');
const { ErrorApp } = require('../src/utils/errores');

const HOY = '2026-09-25';

/** Ejecuta la validación y devuelve la lista de detalles del error 400. */
function detallesDe(fn) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof ErrorApp);
    assert.equal(error.estado, 400);
    return error.detalles ?? [error.message];
  }
  assert.fail('Se esperaba un error de validación');
}

const productoBase = {
  nombre: 'Pasta',
  categoria: 'Granos',
  almacenamiento: 'seco',
  unidad: 'kg',
  consumoDiario: 20,
  diasCobertura: 30,
  lote: 'P-10',
  caducidad: '2027-05-01',
};

describe('Validación de credenciales', () => {
  test('CP-01 · credenciales válidas: el correo se normaliza a minúsculas', () => {
    assert.deepEqual(v.validarCredenciales({ correo: ' Admin@Comedores.TEST ', password: 'x' }), {
      correo: 'admin@comedores.test',
      password: 'x',
    });
  });

  test('CP-03 · campos obligatorios vacíos', () => {
    const detalles = detallesDe(() => v.validarCredenciales({ correo: '', password: '   ' }));
    assert.deepEqual(detalles, ['El campo correo es obligatorio', 'El campo password es obligatorio']);
  });

  test('CP-04/CP-13 · formatos incorrectos y campos no permitidos', () => {
    const detalles = detallesDe(() =>
      v.validarCredenciales({ correo: 'admin-sin-arroba', password: 'x'.repeat(101), rol: 'Administrador' })
    );
    assert.ok(detalles.includes('Campo no permitido: rol'));
    assert.ok(detalles.includes('El correo no tiene un formato válido'));
    assert.ok(detalles.includes('La contraseña debe ser texto de máximo 100 caracteres'));
  });
});

describe('Validación de productos', () => {
  test('CP-23 · producto válido', () => {
    assert.deepEqual(v.validarProducto({ ...productoBase, nombre: '  Pasta  ' }, HOY), productoBase);
  });

  test('CP-25 · los 8 campos son obligatorios', () => {
    const detalles = detallesDe(() => v.validarProducto({}, HOY));
    assert.equal(detalles.length, 8);
    assert.ok(detalles.every((d) => d.endsWith('es obligatorio')));
  });

  test('CP-26 · formatos incorrectos', () => {
    const detalles = detallesDe(() =>
      v.validarProducto(
        { ...productoBase, consumoDiario: 'veinte', caducidad: '01/05/2027', almacenamiento: 'ambiente', nombre: 7 },
        HOY
      )
    );
    assert.ok(detalles.includes('El campo consumoDiario debe ser numérico'));
    assert.ok(detalles.includes('El campo caducidad debe tener el formato AAAA-MM-DD'));
    assert.ok(detalles.includes('El campo almacenamiento debe ser uno de: seco, refrigerado, congelado'));
    assert.ok(detalles.includes('El campo nombre debe ser texto'));
  });

  test('CP-27 · valores fuera de los límites', () => {
    const detalles = detallesDe(() =>
      v.validarProducto({ ...productoBase, diasCobertura: 400, consumoDiario: 0, nombre: 'P', lote: 'L 1' }, HOY)
    );
    assert.ok(detalles.includes('El campo diasCobertura debe estar entre 1 y 365'));
    assert.ok(detalles.includes('El campo consumoDiario debe estar entre 0.01 y 10000'));
    assert.ok(detalles.includes('El campo nombre debe tener entre 2 y 60 caracteres'));
    assert.ok(detalles.includes('El lote solo admite letras, números y guiones'));
  });

  test('CP-27 · días de cobertura enteros y consumo con máximo 2 decimales', () => {
    const detalles = detallesDe(() =>
      v.validarProducto({ ...productoBase, diasCobertura: 7.5, consumoDiario: 1.234 }, HOY)
    );
    assert.ok(detalles.includes('El campo diasCobertura debe ser un número entero'));
    assert.ok(detalles.includes('El campo consumoDiario admite máximo 2 decimales'));
  });

  test('CP-28 · producto caducado o que caduca hoy', () => {
    assert.deepEqual(detallesDe(() => v.validarProducto({ ...productoBase, caducidad: HOY }, HOY)), [
      'El producto ya caducó o caduca hoy; no se puede registrar',
    ]);
  });

  test('CP-30 · campo no permitido (asignación masiva de stock)', () => {
    const detalles = detallesDe(() => v.validarProducto({ ...productoBase, stock: 999 }, HOY));
    assert.deepEqual(detalles, ['Campo no permitido: stock']);
  });

  test('CP-31 · texto con caracteres de código (XSS)', () => {
    const detalles = detallesDe(() =>
      v.validarProducto({ ...productoBase, nombre: '<script>alert(1)</script>' }, HOY)
    );
    assert.deepEqual(detalles, ['El campo nombre contiene caracteres no permitidos']);
  });
});

describe('Validación de movimientos', () => {
  test('CP-48 · salida válida (motivo opcional)', () => {
    assert.deepEqual(v.validarMovimiento({ productoId: 1, cantidad: 20 }, 'salida'), {
      productoId: 1,
      cantidad: 20,
      excepcion: false,
      motivo: null,
    });
  });

  test('CP-39 · cantidad fuera de límites', () => {
    for (const cantidad of [0, -5, 10001]) {
      assert.deepEqual(detallesDe(() => v.validarMovimiento({ productoId: 1, cantidad }, 'entrada')), [
        'El campo cantidad debe estar entre 1 y 10000',
      ]);
    }
  });

  test('CP-40 · formato incorrecto de cantidad y producto', () => {
    const detalles = detallesDe(() => v.validarMovimiento({ productoId: 1.5, cantidad: 'diez' }, 'entrada'));
    assert.deepEqual(detalles, ['El campo productoId debe ser un número entero', 'El campo cantidad debe ser numérico']);
  });

  test('CP-47 · la excepción exige motivo y debe ser booleana', () => {
    assert.deepEqual(detallesDe(() => v.validarMovimiento({ productoId: 1, cantidad: 5, excepcion: true }, 'entrada')), [
      'El motivo es obligatorio para autorizar una excepción',
    ]);
    assert.deepEqual(detallesDe(() => v.validarMovimiento({ productoId: 1, cantidad: 5, excepcion: 'si' }, 'entrada')), [
      'El campo excepcion debe ser true o false',
    ]);
  });

  test('CP-51 · la merma exige motivo', () => {
    assert.deepEqual(detallesDe(() => v.validarMovimiento({ productoId: 5, cantidad: 4 }, 'merma')), [
      'El motivo de la merma es obligatorio',
    ]);
  });

  test('CP-45 · las salidas no aceptan el campo excepcion', () => {
    assert.deepEqual(detallesDe(() => v.validarMovimiento({ productoId: 1, cantidad: 5, excepcion: true }, 'salida')), [
      'Campo no permitido: excepcion',
    ]);
  });
});

describe('Validación de capacidad e identificadores', () => {
  test('CP-53 · capacidad válida (solo los almacenamientos enviados)', () => {
    assert.deepEqual(v.validarCapacidad({ seco: 1200, congelado: 0 }), { seco: 1200, congelado: 0 });
  });

  test('CP-54 · capacidad vacía, negativa o con campos desconocidos', () => {
    assert.deepEqual(detallesDe(() => v.validarCapacidad({})), [
      'Indica al menos un almacenamiento: seco, refrigerado o congelado',
    ]);
    assert.deepEqual(detallesDe(() => v.validarCapacidad({ seco: -5 })), ['El campo seco debe estar entre 0 y 100000']);
    assert.deepEqual(detallesDe(() => v.validarCapacidad({ ambiente: 5 })), ['Campo no permitido: ambiente']);
  });

  test('CP-18 · el id de la URL debe ser un entero positivo', () => {
    assert.equal(v.validarId('12', 'id'), 12);
    for (const malo of ['abc', '0', '-1', '1.5', '9999999999']) {
      assert.throws(() => v.validarId(malo, 'id del comedor'), { estado: 400 });
    }
  });
});

describe('Fechas', () => {
  test('esFechaValida() revisa formato y calendario real', () => {
    assert.equal(esFechaValida('2028-02-29'), true);
    assert.equal(esFechaValida('2027-02-29'), false);
    assert.equal(esFechaValida('2027-13-01'), false);
    assert.equal(esFechaValida('01/05/2027'), false);
    assert.equal(esFechaValida(20270501), false);
  });

  test('diasEntre() y sumarDias() son consistentes', () => {
    assert.equal(diasEntre('2026-09-25', '2026-09-30'), 5);
    assert.equal(diasEntre('2026-09-25', '2026-09-24'), -1);
    assert.equal(sumarDias('2026-12-30', 3), '2027-01-02');
  });

  test('hoy() usa la zona horaria de México', () => {
    // 26/09/2026 04:30 UTC todavía es 25/09/2026 en la Ciudad de México
    assert.equal(hoy('America/Mexico_City', new Date('2026-09-26T04:30:00Z')), '2026-09-25');
    assert.match(hoy(), /^\d{4}-\d{2}-\d{2}$/);
  });
});
