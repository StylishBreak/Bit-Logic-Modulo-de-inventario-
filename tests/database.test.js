'use strict';

// Pruebas de la base de datos SQLite: persistencia en archivo y transacciones
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { abrirBaseDeDatos, enTransaccion } = require('../src/db/database');

describe('Base de datos SQLite (db/database.js)', () => {
  test('CP-64 · los datos se conservan al reiniciar y los datos de ejemplo no se duplican', (t) => {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'inventario-'));
    t.after(() => fs.rmSync(carpeta, { recursive: true, force: true }));
    const archivo = path.join(carpeta, 'datos', 'inventario.db');

    const primera = abrirBaseDeDatos(archivo);
    primera.prepare('UPDATE productos SET stock = 100 WHERE id = 1').run();
    primera.close();
    assert.ok(fs.existsSync(archivo));

    // "Reinicio" del servidor: se vuelve a abrir el mismo archivo
    const segunda = abrirBaseDeDatos(archivo);
    assert.equal(segunda.prepare('SELECT stock FROM productos WHERE id = 1').get().stock, 100);
    assert.equal(segunda.prepare('SELECT COUNT(*) AS total FROM usuarios').get().total, 4);
    segunda.close();
  });

  test('CP-64 · una transacción con error no deja cambios a medias (ROLLBACK)', () => {
    const db = abrirBaseDeDatos(':memory:');
    assert.throws(() =>
      enTransaccion(db, () => {
        db.prepare('UPDATE productos SET stock = 0 WHERE id = 1').run();
        db.prepare("INSERT INTO movimientos (comedor_id, producto_id, tipo, cantidad, usuario_id) VALUES (1, 1, 'salida', -5, 2)").run();
      })
    );
    assert.equal(db.prepare('SELECT stock FROM productos WHERE id = 1').get().stock, 120);
    db.close();
  });

  test('CP-29 · la base impide productos activos duplicados aunque se omita la validación', () => {
    const db = abrirBaseDeDatos(':memory:');
    const insertar = db.prepare(`
      INSERT INTO productos (comedor_id, nombre, categoria, almacenamiento, unidad, consumo_diario, dias_cobertura, lote, caducidad)
      VALUES (1, 'ARROZ', 'Granos', 'seco', 'kg', 1, 1, 'ar-2601', '2030-01-01')`);
    assert.throws(() => insertar.run(), /UNIQUE constraint failed/);
    db.close();
  });
});
