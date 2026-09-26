'use strict';

const http = require('node:http');
const { cargarConfiguracion } = require('./config');
const { abrirBaseDeDatos } = require('./db/database');
const { crearApp } = require('./app');

const config = cargarConfiguracion();
if (config.secretoTemporal) {
  console.warn('[aviso] JWT_SECRET no está definido: se generó un secreto temporal (solo desarrollo)');
}

const db = abrirBaseDeDatos(config.rutaBaseDatos);
const app = crearApp({ db, config });

const servidor = http.createServer((req, res) => {
  const inicio = Date.now();
  res.on('finish', () => {
    const ruta = String(req.url).split('?')[0].replace(/[^\w/.-]/g, '');
    console.log(`${req.method} ${ruta} ${res.statusCode} ${Date.now() - inicio}ms`);
  });
  app(req, res);
});
servidor.requestTimeout = 15000;
servidor.headersTimeout = 10000;

servidor.listen(config.puerto, () => {
  console.log(`Módulo de Inventario escuchando en http://localhost:${config.puerto} (${config.entorno})`);
});

function cerrar() {
  servidor.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);
