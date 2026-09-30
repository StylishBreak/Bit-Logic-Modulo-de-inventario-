'use strict';

// Pruebas de la API: manejo de errores y controles de seguridad
const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { crearEntorno, USUARIOS_DEMO } = require('./helpers');

describe('Manejo de errores', () => {
  let entorno;
  beforeEach(async () => {
    entorno = await crearEntorno();
  });
  afterEach(() => entorno.cerrar());

  test('CP-55 · JSON mal formado → 400', async () => {
    const r = await entorno.pedir('POST', '/api/auth/login', {
      crudo: '{"correo": ',
      encabezados: { 'Content-Type': 'application/json' },
    });
    assert.equal(r.estado, 400);
    assert.deepEqual(r.datos, { error: 'JSON mal formado' });
    const arreglo = await entorno.pedir('POST', '/api/auth/login', { cuerpo: [1, 2] });
    assert.equal(arreglo.datos.error, 'El cuerpo debe ser un objeto JSON');
  });

  test('CP-56 · cuerpo mayor a 20 KB → 413', async () => {
    const r = await entorno.pedir('POST', '/api/comedores/1/salidas', {
      token: entorno.tokens.usuarioA,
      cuerpo: { productoId: 1, cantidad: 1, motivo: 'x'.repeat(25 * 1024) },
    });
    assert.equal(r.estado, 413);
  });

  test('CP-56 · cuerpo enviado por partes (sin Content-Length) mayor a 20 KB → 413', async () => {
    const estado = await new Promise((resolve, reject) => {
      const peticion = http.request(new URL('/api/auth/login', entorno.base), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, (respuesta) => {
        respuesta.resume();
        resolve(respuesta.statusCode);
      });
      peticion.on('error', reject);
      for (let i = 0; i < 25; i++) peticion.write('x'.repeat(1024));
      peticion.end();
    });
    assert.equal(estado, 413);
  });

  test('CP-57 · Content-Type distinto de application/json → 415', async () => {
    const r = await entorno.pedir('POST', '/api/comedores/1/salidas', {
      token: entorno.tokens.usuarioA,
      crudo: 'productoId=1&cantidad=5',
      encabezados: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    assert.equal(r.estado, 415);
  });

  test('CP-58 · ruta inexistente → 404 y método no permitido → 405 con encabezado Allow', async () => {
    const r404 = await entorno.pedir('GET', '/api/no-existe');
    assert.equal(r404.estado, 404);
    assert.deepEqual(r404.datos, { error: 'Ruta no encontrada' });
    const r405 = await entorno.pedir('PATCH', '/api/inventario', { token: entorno.tokens.admin });
    assert.equal(r405.estado, 405);
    assert.equal(r405.encabezados.get('allow'), 'GET');
    const urlMala = await entorno.pedir('GET', '/api/comedores/%E0%A4%A/inventario', { token: entorno.tokens.admin });
    assert.equal(urlMala.estado, 400);
  });

  test('CP-59 · error inesperado → 500 sin exponer detalles internos', async (t) => {
    t.mock.method(console, 'error', () => {});
    entorno.db.close(); // se simula que la base de datos deja de estar disponible
    const r = await entorno.pedir('GET', '/api/comedores/1/inventario', { token: entorno.tokens.admin });
    assert.equal(r.estado, 500);
    assert.deepEqual(r.datos, { error: 'Error interno del servidor' });
  });
});

describe('Controles de seguridad', () => {
  let entorno;
  afterEach(() => entorno.cerrar());

  test('CP-60 · la página y la API envían encabezados de seguridad', async () => {
    entorno = await crearEntorno();
    for (const ruta of ['/', '/health']) {
      const r = await entorno.pedir('GET', ruta);
      assert.equal(r.estado, 200);
      assert.match(r.encabezados.get('content-security-policy'), /default-src 'self'/);
      assert.match(r.encabezados.get('content-security-policy'), /frame-ancestors 'none'/);
      assert.equal(r.encabezados.get('x-frame-options'), 'DENY');
      assert.equal(r.encabezados.get('x-content-type-options'), 'nosniff');
      assert.equal(r.encabezados.get('cache-control'), 'no-store');
      assert.equal(r.encabezados.get('x-powered-by'), null);
    }
    const health = await entorno.pedir('GET', '/health');
    assert.deepEqual(health.datos, { estado: 'ok', version: 'pruebas' });
    const estilos = await entorno.pedir('GET', '/styles.css');
    assert.match(estilos.encabezados.get('content-type'), /text\/css/);
  });

  const login = (correo, password, ip) =>
    entorno.pedir('POST', '/api/auth/login', {
      cuerpo: { correo, password },
      encabezados: ip ? { 'X-Forwarded-For': ip } : {},
    });

  test('CP-61 · fuerza bruta: tras varios fallos se bloquea ese correo (429), pero los demás siguen entrando', async () => {
    entorno = await crearEntorno({ loginMaxFallosCuenta: 3 });
    for (let i = 0; i < 3; i++) assert.equal((await login('admin@comedores.test', 'Adivina#1')).estado, 401);
    const bloqueado = await login('admin@comedores.test', 'Adivina#1');
    assert.equal(bloqueado.estado, 429);
    assert.ok(Number(bloqueado.encabezados.get('retry-after')) > 0);
    assert.match(bloqueado.datos.error, /cuenta está bloqueada temporalmente.*Intenta de nuevo en 15 min/);
    // Ni siquiera la contraseña correcta de ESA cuenta entra mientras dura el bloqueo...
    assert.equal((await login(USUARIOS_DEMO.admin.correo, USUARIOS_DEMO.admin.clave)).estado, 429);
    // ...pero otra cuenta desde la misma conexión sí entra
    assert.equal((await login(USUARIOS_DEMO.usuarioA.correo, USUARIOS_DEMO.usuarioA.clave)).estado, 200);
  });

  test('CP-61 · los inicios de sesión correctos y los datos mal escritos no cuentan como intentos fallidos', async () => {
    // Antes: 20 intentos de cualquier tipo desde una IP bloqueaban a todos los correos de esa conexión
    entorno = await crearEntorno({ loginMaxFallosIp: 3, loginMaxFallosCuenta: 3 });
    for (let i = 0; i < 10; i++) {
      assert.equal((await login(USUARIOS_DEMO.admin.correo, USUARIOS_DEMO.admin.clave)).estado, 200);
      assert.equal((await login('correo-sin-arroba', 'x')).estado, 400);
    }
    // Dos fallos y luego un acceso correcto: el contador de la cuenta vuelve a cero
    assert.equal((await login(USUARIOS_DEMO.usuarioA.correo, 'Adivina#1')).estado, 401);
    assert.equal((await login(USUARIOS_DEMO.usuarioA.correo, 'Adivina#1')).estado, 401);
    assert.equal((await login(USUARIOS_DEMO.usuarioA.correo, USUARIOS_DEMO.usuarioA.clave)).estado, 200);
    assert.equal((await login(USUARIOS_DEMO.usuarioA.correo, 'Adivina#1')).estado, 401);
  });

  test('CP-61 · una IP que prueba muchos correos distintos se bloquea al llegar al máximo de fallos', async () => {
    entorno = await crearEntorno({ confiarEnProxy: true, loginMaxFallosIp: 4 });
    for (let i = 1; i <= 4; i++) {
      assert.equal((await login(`persona${i}@comedores.test`, 'Adivina#1', '203.0.113.50')).estado, 401);
    }
    const bloqueada = await login(USUARIOS_DEMO.admin.correo, USUARIOS_DEMO.admin.clave, '203.0.113.50');
    assert.equal(bloqueada.estado, 429);
    assert.match(bloqueada.datos.error, /desde esta conexión/);
    // Otra conexión no se ve afectada
    assert.equal((await login(USUARIOS_DEMO.admin.correo, USUARIOS_DEMO.admin.clave, '198.51.100.7')).estado, 200);
  });

  test('CP-61 · muchos intentos simultáneos no pasan del máximo de fallos', async () => {
    entorno = await crearEntorno({ loginMaxFallosCuenta: 3 });
    const respuestas = await Promise.all(
      Array.from({ length: 10 }, () => login('admin@comedores.test', 'Adivina#1'))
    );
    const estados = respuestas.map((r) => r.estado).sort();
    assert.deepEqual(estados, [401, 401, 401, 429, 429, 429, 429, 429, 429, 429]);
  });

  test('CP-61 · la cuenta se bloquea tras varias contraseñas incorrectas aunque cambie la IP', async () => {
    entorno = await crearEntorno({ confiarEnProxy: true, loginMaxFallosCuenta: 3 });
    for (let i = 1; i <= 3; i++) {
      assert.equal((await login('admin@comedores.test', 'Adivina#1', `203.0.113.${i}`)).estado, 401);
    }
    const bloqueada = await login(USUARIOS_DEMO.admin.correo, USUARIOS_DEMO.admin.clave, '198.51.100.9');
    assert.equal(bloqueada.estado, 429);
    // Otra cuenta no se ve afectada
    const otra = await login(USUARIOS_DEMO.usuarioA.correo, USUARIOS_DEMO.usuarioA.clave, '198.51.100.9');
    assert.equal(otra.estado, 200);
  });

  test('CP-62 · inyección SQL en el inicio de sesión no da acceso', async () => {
    entorno = await crearEntorno();
    const r1 = await entorno.pedir('POST', '/api/auth/login', {
      cuerpo: { correo: "' OR '1'='1' --", password: 'x' },
    });
    assert.equal(r1.estado, 400);
    const r2 = await entorno.pedir('POST', '/api/auth/login', {
      cuerpo: { correo: 'admin@comedores.test', password: "' OR '1'='1" },
    });
    assert.equal(r2.estado, 401);
    assert.equal(r2.datos.token, undefined);
    // La tabla de usuarios sigue intacta
    const { total } = entorno.db.prepare('SELECT COUNT(*) AS total FROM usuarios').get();
    assert.equal(total, 4);
  });

  test('CP-63 · no se pueden descargar archivos del servidor (path traversal) → 404', async () => {
    entorno = await crearEntorno();
    for (const ruta of ['/../src/config.js', '/database/seed.sql', '/%2e%2e/package.json', '/.env']) {
      const r = await entorno.pedir('GET', ruta);
      assert.equal(r.estado, 404, ruta);
    }
  });
});
