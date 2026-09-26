'use strict';

/**
 * Utilidades para las pruebas: levanta la aplicación con una base SQLite en memoria
 * (limpia en cada prueba) en un puerto aleatorio.
 */
const http = require('node:http');
const crypto = require('node:crypto');
const { abrirBaseDeDatos } = require('../src/db/database');
const { crearApp } = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');
const { hoy, sumarDias } = require('../src/utils/fechas');

const ZONA = 'America/Mexico_City';

// Credenciales de los usuarios de demostración (database/seed.sql)
const USUARIOS_DEMO = {
  admin: { correo: 'admin@comedores.test', clave: 'Admin#2026' },
  usuarioA: { correo: 'responsable.a@comedores.test', clave: 'ComedorA#2026' },
  bloqueado: { correo: 'bloqueado@comedores.test', clave: 'Bloqueado#2026' },
};

function configuracionDePrueba(cambios = {}) {
  return {
    entorno: 'test',
    puerto: 0,
    rutaBaseDatos: ':memory:',
    jwtSecreto: crypto.randomBytes(32).toString('hex'),
    secretoTemporal: false,
    jwtExpiraSegundos: 3600,
    loginMaxIntentos: 1000,
    loginVentanaMs: 15 * 60 * 1000,
    loginMaxFallosCuenta: 1000,
    confiarEnProxy: false,
    zonaHoraria: ZONA,
    diasAlertaCaducidad: 7,
    version: 'pruebas',
    ...cambios,
  };
}

async function crearEntorno(cambios) {
  const config = configuracionDePrueba(cambios);
  const db = abrirBaseDeDatos(':memory:');
  const servidor = http.createServer(crearApp({ db, config }));
  await new Promise((listo) => servidor.listen(0, '127.0.0.1', listo));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  const firmar = (datos) => firmarToken(datos, config.jwtSecreto, config.jwtExpiraSegundos);
  const tokens = {
    admin: firmar({ sub: 1, rol: 'Administrador', comedorId: null }),
    usuarioA: firmar({ sub: 2, rol: 'Usuario', comedorId: 1 }),
    usuarioB: firmar({ sub: 3, rol: 'Usuario', comedorId: 2 }),
  };

  async function pedir(metodo, ruta, { token, cuerpo, crudo, encabezados = {} } = {}) {
    const headers = { ...encabezados };
    if (token) headers.Authorization = `Bearer ${token}`;
    let body;
    if (crudo !== undefined) {
      body = crudo;
    } else if (cuerpo !== undefined) {
      body = JSON.stringify(cuerpo);
      headers['Content-Type'] ??= 'application/json';
    }
    const respuesta = await fetch(base + ruta, { method: metodo, headers, body });
    const texto = await respuesta.text();
    let datos = texto;
    try {
      datos = JSON.parse(texto);
    } catch {
      // la respuesta no era JSON (por ejemplo, la página HTML)
    }
    return { estado: respuesta.status, datos, encabezados: respuesta.headers };
  }

  async function cerrar() {
    servidor.closeAllConnections();
    await new Promise((listo) => servidor.close(listo));
    try {
      db.close();
    } catch {
      // la base ya estaba cerrada (prueba de error inesperado)
    }
  }

  return { base, db, config, tokens, firmar, pedir, cerrar };
}

/** Producto válido para crear; la caducidad es relativa a hoy para que la prueba no caduque. */
function productoValido(cambios = {}) {
  return {
    nombre: 'Pasta',
    categoria: 'Granos',
    almacenamiento: 'seco',
    unidad: 'kg',
    consumoDiario: 20,
    diasCobertura: 30,
    lote: 'P-10',
    caducidad: sumarDias(hoy(ZONA), 200),
    ...cambios,
  };
}

function decodificar(parte) {
  return JSON.parse(Buffer.from(parte, 'base64url').toString('utf8'));
}

module.exports = { ZONA, USUARIOS_DEMO, crearEntorno, configuracionDePrueba, productoValido, decodificar };
