'use strict';

// Pruebas unitarias de JWT, contraseñas, limitador de intentos, enrutador y configuración
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { firmarToken, verificarToken } = require('../src/utils/jwt');
const { generarHash, verificarPassword } = require('../src/utils/password');
const { LimitadorIntentos, obtenerIp } = require('../src/middleware/limitador');
const { autenticar, autorizar, verificarAccesoComedor } = require('../src/middleware/auth');
const { Enrutador } = require('../src/router');
const { cargarConfiguracion } = require('../src/config');
const { decodificar } = require('./helpers');

const SECRETO = crypto.randomBytes(32).toString('hex');
const AHORA = 1_790_000_000;

function base64Url(objeto) {
  return Buffer.from(JSON.stringify(objeto)).toString('base64url');
}

describe('JWT (utils/jwt.js)', () => {
  test('CP-12 · el token es HS256 y contiene sub, rol, comedorId, iat y exp', () => {
    const token = firmarToken({ sub: 2, rol: 'Usuario', comedorId: 1 }, SECRETO, 3600, AHORA);
    const [encabezado, carga] = token.split('.');
    assert.deepEqual(decodificar(encabezado), { alg: 'HS256', typ: 'JWT' });
    assert.deepEqual(decodificar(carga), { sub: 2, rol: 'Usuario', comedorId: 1, iat: AHORA, exp: AHORA + 3600 });
    assert.equal(verificarToken(token, SECRETO, AHORA + 10).rol, 'Usuario');
  });

  test('CP-09 · un token con la carga alterada se rechaza', () => {
    const [encabezado, , firma] = firmarToken({ sub: 2, rol: 'Usuario' }, SECRETO, 3600, AHORA).split('.');
    const alterado = `${encabezado}.${base64Url({ sub: 2, rol: 'Administrador', iat: AHORA, exp: AHORA + 3600 })}.${firma}`;
    assert.throws(() => verificarToken(alterado, SECRETO, AHORA), { estado: 401, message: 'Token inválido' });
  });

  test('CP-10 · un token expirado se rechaza', () => {
    const token = firmarToken({ sub: 2, rol: 'Usuario' }, SECRETO, 3600, AHORA);
    assert.throws(() => verificarToken(token, SECRETO, AHORA + 3600), { estado: 401, message: 'Token expirado' });
  });

  test('CP-11 · se rechaza otra clave, alg "none" y formatos inválidos', () => {
    const otraClave = firmarToken({ sub: 2, rol: 'Usuario' }, crypto.randomBytes(32).toString('hex'), 3600, AHORA);
    const sinFirma = `${base64Url({ alg: 'none', typ: 'JWT' })}.${base64Url({ sub: 1, rol: 'Administrador', exp: AHORA + 99 })}.`;
    const tipoIncorrecto = `${base64Url({ alg: 'HS256', typ: 'XYZ' })}.${base64Url({ sub: 1 })}.x`;
    for (const token of [otraClave, sinFirma, tipoIncorrecto, 'abc.def', 'no-es-json.eyJ9.x', undefined]) {
      assert.throws(() => verificarToken(token, SECRETO, AHORA), { estado: 401 });
    }
  });

  test('CP-10 · un token sin exp se considera expirado', () => {
    const contenido = `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url({ sub: 1, rol: 'Usuario' })}`;
    const firma = crypto.createHmac('sha256', SECRETO).update(contenido).digest('base64url');
    assert.throws(() => verificarToken(`${contenido}.${firma}`, SECRETO, AHORA), { message: 'Token expirado' });
  });
});

describe('Autenticación y autorización (middleware/auth.js)', () => {
  const token = firmarToken({ sub: 2, rol: 'Usuario', comedorId: 1 }, SECRETO, 3600);

  test('CP-14 · autenticar() devuelve el usuario del token', () => {
    assert.deepEqual(autenticar(`Bearer ${token}`, SECRETO), { id: 2, rol: 'Usuario', comedorId: 1 });
  });

  test('CP-08/CP-11 · autenticar() exige "Bearer <token>" y un rol válido', () => {
    assert.throws(() => autenticar(undefined, SECRETO), { message: 'Token no proporcionado' });
    assert.throws(() => autenticar(`Token ${token}`, SECRETO), { estado: 401 });
    assert.throws(() => autenticar(`Bearer ${token} extra`, SECRETO), { estado: 401 });
    const rolDesconocido = firmarToken({ sub: 9, rol: 'SuperUsuario' }, SECRETO, 3600);
    assert.throws(() => autenticar(`Bearer ${rolDesconocido}`, SECRETO), { message: 'Token inválido' });
  });

  test('CP-20 · autorizar() rechaza roles no permitidos', () => {
    assert.throws(() => autorizar({ rol: 'Usuario' }, ['Administrador']), { estado: 403 });
    assert.doesNotThrow(() => autorizar({ rol: 'Administrador' }, ['Administrador']));
  });

  test('CP-15/CP-16 · verificarAccesoComedor() limita al Usuario a su comedor', () => {
    assert.throws(() => verificarAccesoComedor({ rol: 'Usuario', comedorId: 1 }, 2), { estado: 403 });
    assert.doesNotThrow(() => verificarAccesoComedor({ rol: 'Usuario', comedorId: 1 }, 1));
    assert.doesNotThrow(() => verificarAccesoComedor({ rol: 'Administrador', comedorId: null }, 2));
  });
});

describe('Contraseñas con scrypt (utils/password.js)', () => {
  test('CP-05 · el hash verifica la contraseña correcta y rechaza la incorrecta', async () => {
    const hash = await generarHash('Clave#Segura1');
    assert.match(hash, /^scrypt\$16384\$8\$5\$/);
    assert.equal(await verificarPassword('Clave#Segura1', hash), true);
    assert.equal(await verificarPassword('otra', hash), false);
    assert.equal(await verificarPassword('Clave#Segura1', 'md5$abc'), false);
  });
});

describe('Limitador de intentos (middleware/limitador.js)', () => {
  test('CP-61 · bloquea al superar el máximo y se reinicia al terminar la ventana', () => {
    const limitador = new LimitadorIntentos({ maximo: 2, ventanaMs: 1000 });
    assert.equal(limitador.registrar('ip', 0).permitido, true);
    assert.equal(limitador.registrar('ip', 10).permitido, true);
    const bloqueado = limitador.registrar('ip', 20);
    assert.equal(bloqueado.permitido, false);
    assert.equal(bloqueado.reinicioSegundos, 1);
    assert.equal(limitador.registrar('ip', 1000).permitido, true);
    limitador.limpiar(5000);
    assert.equal(limitador.registros.size, 0);
  });

  test('CP-61 · consultar() no cuenta intentos y reiniciar() desbloquea la cuenta', () => {
    const limitador = new LimitadorIntentos({ maximo: 2, ventanaMs: 1000 });
    assert.equal(limitador.consultar('cuenta', 0).permitido, true);
    limitador.registrar('cuenta', 0);
    limitador.registrar('cuenta', 10);
    const estado = limitador.consultar('cuenta', 20);
    assert.equal(estado.permitido, false);
    assert.equal(estado.reinicioSegundos, 1);
    assert.equal(limitador.consultar('cuenta', 1000).permitido, true);
    limitador.reiniciar('cuenta');
    assert.equal(limitador.registros.has('cuenta'), false);
  });

  test('obtenerIp() solo usa X-Forwarded-For cuando se confía en el proxy', () => {
    const req = { headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }, socket: { remoteAddress: '10.0.0.1' } };
    assert.equal(obtenerIp(req, true), '203.0.113.7');
    assert.equal(obtenerIp(req, false), '10.0.0.1');
    assert.equal(obtenerIp({ headers: {}, socket: {} }, false), 'desconocida');
  });
});

describe('Enrutador y configuración', () => {
  test('CP-58 · el enrutador distingue ruta inexistente (404) y método no permitido (405)', () => {
    const enrutador = new Enrutador();
    enrutador.get('/api/comedores/:id/inventario', {}, () => null);
    assert.deepEqual(enrutador.buscar('GET', '/api/comedores/7/inventario').params, { id: '7' });
    assert.deepEqual(enrutador.buscar('POST', '/api/comedores/7/inventario'), { permitidos: ['GET'] });
    assert.equal(enrutador.buscar('GET', '/api/otra'), null);
  });

  test('la configuración exige JWT_SECRET en producción y un secreto largo', () => {
    assert.throws(() => cargarConfiguracion({ NODE_ENV: 'production' }), /obligatorio/);
    assert.throws(() => cargarConfiguracion({ JWT_SECRET: 'corto' }), /al menos 32/);
    const desarrollo = cargarConfiguracion({});
    assert.equal(desarrollo.secretoTemporal, true);
    assert.equal(desarrollo.puerto, 3000);
    const produccion = cargarConfiguracion({ NODE_ENV: 'production', JWT_SECRET: SECRETO, PORT: '8080', TRUST_PROXY: 'true', LOGIN_MAX_FALLOS_CUENTA: '5' });
    assert.equal(produccion.puerto, 8080);
    assert.equal(produccion.confiarEnProxy, true);
    assert.equal(produccion.secretoTemporal, false);
    assert.equal(produccion.loginMaxFallosCuenta, 5);
    assert.equal(desarrollo.loginMaxFallosCuenta, 10);
  });
});
