'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const CARPETA_SQL = path.join(__dirname, '..', '..', 'database');

function leerSql(archivo) {
  return fs.readFileSync(path.join(CARPETA_SQL, archivo), 'utf8');
}

/**
 * Abre (o crea) la base SQLite, aplica el esquema y, si no hay usuarios,
 * carga los datos de demostración. Con ':memory:' la base vive solo en memoria (pruebas).
 */
function abrirBaseDeDatos(ruta = ':memory:') {
  if (ruta !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(ruta)), { recursive: true });
  }
  const db = new DatabaseSync(ruta);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(leerSql('schema.sql'));

  const { total } = db.prepare('SELECT COUNT(*) AS total FROM usuarios').get();
  if (total === 0) db.exec(leerSql('seed.sql'));
  return db;
}

/** Ejecuta varias operaciones como una sola transacción (todo o nada). */
function enTransaccion(db, operacion) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const resultado = operacion();
    db.exec('COMMIT');
    return resultado;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

module.exports = { abrirBaseDeDatos, enTransaccion };
