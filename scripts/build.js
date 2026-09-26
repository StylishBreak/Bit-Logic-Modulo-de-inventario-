'use strict';

/**
 * Build del módulo (npm run build):
 *  1. Revisa la sintaxis de todos los archivos JavaScript.
 *  2. Comprueba que el esquema y los datos SQL se cargan sin errores.
 *  3. Copia lo necesario para producción en la carpeta dist/ y agrega build-info.json.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const DIST = path.join(RAIZ, 'dist');
const A_COPIAR = ['src', 'public', 'database', 'docs/openapi.yaml', 'package.json', 'README.md'];

function archivosJs(carpeta) {
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) return archivosJs(ruta);
    return entrada.name.endsWith('.js') ? [ruta] : [];
  });
}

function revisarSintaxis() {
  const archivos = ['src', 'public', 'scripts', 'tests'].flatMap((c) => archivosJs(path.join(RAIZ, c)));
  for (const archivo of archivos) {
    execFileSync(process.execPath, ['--check', archivo], { stdio: 'inherit' });
  }
  console.log(`✔ Sintaxis correcta en ${archivos.length} archivos JavaScript`);
}

function revisarSql() {
  // Se carga en un proceso aparte para no mostrar el aviso experimental de node:sqlite
  const codigo = `
    const { abrirBaseDeDatos } = require(${JSON.stringify(path.join(RAIZ, 'src', 'db', 'database.js'))});
    const db = abrirBaseDeDatos(':memory:');
    const tablas = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get().n;
    const productos = db.prepare('SELECT COUNT(*) AS n FROM productos').get().n;
    console.log('✔ Esquema SQL válido: ' + tablas + ' tablas, ' + productos + ' productos de ejemplo');`;
  execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', '-e', codigo], { stdio: 'inherit' });
}

function copiar() {
  fs.rmSync(DIST, { recursive: true, force: true });
  for (const elemento of A_COPIAR) {
    const origen = path.join(RAIZ, elemento);
    if (fs.existsSync(origen)) fs.cpSync(origen, path.join(DIST, elemento), { recursive: true });
  }
  const paquete = require(path.join(RAIZ, 'package.json'));
  const info = {
    nombre: paquete.name,
    version: paquete.version,
    commit: process.env.GITHUB_SHA || 'local',
    fecha: new Date().toISOString(),
    node: process.version,
  };
  fs.writeFileSync(path.join(DIST, 'build-info.json'), `${JSON.stringify(info, null, 2)}\n`);
  console.log(`✔ Paquete generado en dist/ (versión ${info.version}, commit ${info.commit.slice(0, 7)})`);
}

revisarSintaxis();
revisarSql();
copiar();
