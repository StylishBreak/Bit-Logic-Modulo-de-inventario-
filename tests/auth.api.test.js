'use strict';

// Pruebas de la API: inicio de sesión y funcionamiento del JWT
const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { firmarToken } = require('../src/utils/jwt');
const { crearEntorno, USUARIOS_DEMO, decodificar } = require('./helpers');

const login = (entorno, correo, password) => entorno.pedir('POST', '/api/auth/login', { cuerpo: { correo, password } });

describe('Inicio de sesión (POST /api/auth/login)', () => {
  let entorno;
  beforeEach(async () => {
    entorno = await crearEntorno();
  });
  afterEach(() => entorno.cerrar());

  test('CP-01 · Administrador con datos válidos recibe un JWT', async () => {
    const { correo, clave } = USUARIOS_DEMO.admin;
    const r = await login(entorno, correo, clave);
    assert.equal(r.estado, 200);
    assert.equal(r.datos.tipo, 'Bearer');
    assert.equal(r.datos.expiraEn, 3600);
    assert.equal(r.datos.token.split('.').length, 3);
    assert.deepEqual(r.datos.usuario, { id: 1, nombre: 'Administrador General', rol: 'Administrador', comedorId: null });
  });

  test('CP-02 · Usuario con datos válidos recibe un JWT de su comedor', async () => {
    const { correo, clave } = USUARIOS_DEMO.usuarioA;
    const r = await login(entorno, correo.toUpperCase(), clave);
    assert.equal(r.estado, 200);
    assert.deepEqual(r.datos.usuario, { id: 2, nombre: 'Responsable Comedor A', rol: 'Usuario', comedorId: 1 });
  });

  test('CP-03 · campos obligatorios vacíos → 400', async () => {
    const r = await login(entorno, '', '');
    assert.equal(r.estado, 400);
    assert.deepEqual(r.datos.detalles, ['El campo correo es obligatorio', 'El campo password es obligatorio']);
  });

  test('CP-04 · correo con formato incorrecto → 400', async () => {
    const r = await login(entorno, 'admin-sin-arroba', 'Admin#2026');
    assert.equal(r.estado, 400);
    assert.deepEqual(r.datos.detalles, ['El correo no tiene un formato válido']);
  });

  test('CP-05 · contraseña incorrecta → 401', async () => {
    const r = await login(entorno, USUARIOS_DEMO.admin.correo, 'Incorrecta#1');
    assert.equal(r.estado, 401);
    assert.equal(r.datos.error, 'Credenciales incorrectas');
    assert.equal(r.datos.token, undefined);
  });

  test('CP-06 · correo no registrado → 401 con el mismo mensaje (no revela si existe)', async () => {
    const r = await login(entorno, 'noexiste@comedores.test', 'Cualquiera#1');
    assert.equal(r.estado, 401);
    assert.equal(r.datos.error, 'Credenciales incorrectas');
  });

  test('CP-07 · usuario bloqueado con contraseña correcta → 403', async () => {
    const { correo, clave } = USUARIOS_DEMO.bloqueado;
    const r = await login(entorno, correo, clave);
    assert.equal(r.estado, 403);
    assert.match(r.datos.error, /Usuario bloqueado/);
  });

  test('CP-13 · intentar elegir el rol al iniciar sesión → 400 (el rol solo viene de la base)', async () => {
    const { correo, clave } = USUARIOS_DEMO.usuarioA;
    const r = await entorno.pedir('POST', '/api/auth/login', {
      cuerpo: { correo, password: clave, rol: 'Administrador' },
    });
    assert.equal(r.estado, 400);
    assert.deepEqual(r.datos.detalles, ['Campo no permitido: rol']);
    assert.equal(r.datos.token, undefined);
  });

  test('CP-12 · el token emitido contiene rol, comedor, iat y exp (1 hora)', async () => {
    const { correo, clave } = USUARIOS_DEMO.usuarioA;
    const { datos } = await login(entorno, correo, clave);
    const [encabezado, carga] = datos.token.split('.');
    assert.deepEqual(decodificar(encabezado), { alg: 'HS256', typ: 'JWT' });
    const payload = decodificar(carga);
    assert.equal(payload.sub, 2);
    assert.equal(payload.rol, 'Usuario');
    assert.equal(payload.comedorId, 1);
    assert.equal(payload.exp - payload.iat, 3600);

    // El token recién emitido sirve para consultar el inventario de su comedor
    const r = await entorno.pedir('GET', '/api/comedores/1/inventario', { token: datos.token });
    assert.equal(r.estado, 200);
  });
});

describe('Protección con JWT en las rutas', () => {
  let entorno;
  beforeEach(async () => {
    entorno = await crearEntorno();
  });
  afterEach(() => entorno.cerrar());

  test('CP-08 · sin token → 401', async () => {
    const r = await entorno.pedir('GET', '/api/comedores/1/inventario');
    assert.equal(r.estado, 401);
    assert.deepEqual(r.datos, { error: 'Token no proporcionado' });
  });

  test('CP-09 · token alterado (rol cambiado a Administrador) → 401', async () => {
    const [encabezado, carga, firma] = entorno.tokens.usuarioA.split('.');
    const payload = { ...decodificar(carga), rol: 'Administrador' };
    const alterado = `${encabezado}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${firma}`;
    const r = await entorno.pedir('GET', '/api/inventario', { token: alterado });
    assert.equal(r.estado, 401);
    assert.equal(r.datos.error, 'Token inválido');
  });

  test('CP-10 · token expirado → 401', async () => {
    const haceDosHoras = Math.floor(Date.now() / 1000) - 7200;
    const expirado = firmarToken({ sub: 2, rol: 'Usuario', comedorId: 1 }, entorno.config.jwtSecreto, 3600, haceDosHoras);
    const r = await entorno.pedir('GET', '/api/comedores/1/inventario', { token: expirado });
    assert.equal(r.estado, 401);
    assert.equal(r.datos.error, 'Token expirado');
  });

  test('CP-11 · token firmado con otra clave o con formato de encabezado inválido → 401', async () => {
    const otraClave = firmarToken({ sub: 1, rol: 'Administrador' }, crypto.randomBytes(32).toString('hex'), 3600);
    const r1 = await entorno.pedir('GET', '/api/inventario', { token: otraClave });
    assert.equal(r1.estado, 401);
    const r2 = await entorno.pedir('GET', '/api/inventario', {
      encabezados: { Authorization: `Token ${entorno.tokens.admin}` },
    });
    assert.equal(r2.estado, 401);
    assert.match(r2.datos.error, /Bearer/);
  });
});
