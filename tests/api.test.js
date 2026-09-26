const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const store = require('../src/data/store');
const config = require('../src/config');

const ADMIN = { correo: 'admin@donaciones.mx', contrasena: 'Admin123!' };
const USUARIO = { correo: 'usuario@donaciones.mx', contrasena: 'Usuario123!' };
let tokenAdmin;
let tokenUsuario;

const login = (cred) => request(app).post('/api/auth/login').send(cred);
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const fechaEnDias = (d) => { const f = new Date(); f.setDate(f.getDate() + d); return f.toISOString().slice(0, 10); };
const productoValido = (extra = {}) => ({
  nombre: 'Pasta', categoria: 'Granos', almacenamiento: 'seco', unidad: 'kg',
  lote: 'P-10', caducidad: '2099-01-01', consumoDiario: 20, diasCobertura: 30, ...extra,
});

beforeAll(async () => {
  tokenAdmin = (await login(ADMIN)).body.token;
  tokenUsuario = (await login(USUARIO)).body.token;
});
beforeEach(() => store.reset());

describe('Autenticación con JWT', () => {
  test('CP-01 login válido devuelve un JWT con el rol', async () => {
    const res = await login(ADMIN);
    expect(res.status).toBe(200);
    const payload = jwt.verify(res.body.token, config.jwtSecret);
    expect(payload.rol).toBe('Administrador');
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  test('CP-02 login con campos vacíos', async () => {
    const res = await login({ correo: '', contrasena: '' });
    expect(res.status).toBe(400);
    expect(res.body.detalles.faltantes).toEqual(['correo', 'contrasena']);
  });

  test('CP-03 login con correo en formato incorrecto', async () => {
    expect((await login({ correo: 'admin.donaciones', contrasena: 'x' })).status).toBe(400);
  });

  test('CP-04 login con contraseña incorrecta', async () => {
    const res = await login({ ...ADMIN, contrasena: 'Mala123' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Credenciales incorrectas');
  });

  test('CP-05 usuario bloqueado no puede iniciar sesión', async () => {
    expect((await login({ correo: 'bloqueado@donaciones.mx', contrasena: 'Usuario123!' })).status).toBe(403);
  });

  test('CP-06 petición sin token es rechazada', async () => {
    expect((await request(app).get('/api/comedores/1/inventario')).status).toBe(401);
  });

  test('CP-07 token alterado es rechazado', async () => {
    const res = await request(app).get('/api/comedores/1/inventario').set(auth(`${tokenUsuario}x`));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token inválido');
  });

  test('CP-08 token expirado es rechazado', async () => {
    const vencido = jwt.sign({ sub: 2, rol: 'Usuario', comedorId: 1 }, config.jwtSecret, { expiresIn: -10 });
    const res = await request(app).get('/api/comedores/1/inventario').set(auth(vencido));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token expirado');
  });

  test('CP-08b token firmado con otra clave es rechazado', async () => {
    const falso = jwt.sign({ sub: 2, rol: 'Administrador' }, 'otra-clave');
    expect((await request(app).get('/api/inventario').set(auth(falso))).status).toBe(401);
  });
});

describe('Permisos por rol', () => {
  test('CP-09 Usuario consulta el inventario de su comedor', async () => {
    const res = await request(app).get('/api/comedores/1/inventario').set(auth(tokenUsuario));
    expect(res.status).toBe(200);
    expect(res.body.comedor).toBe('Comedor A');
    expect(res.body.ocupacion).toHaveLength(3);
  });

  test('CP-10 Usuario no puede consultar otro comedor', async () => {
    expect((await request(app).get('/api/comedores/2/inventario').set(auth(tokenUsuario))).status).toBe(403);
  });

  test('CP-11 Usuario no puede ver el inventario general', async () => {
    const res = await request(app).get('/api/inventario').set(auth(tokenUsuario));
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/permiso/);
  });

  test('CP-12 Administrador ve el inventario de todos los comedores', async () => {
    const res = await request(app).get('/api/inventario').set(auth(tokenAdmin));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test('CP-14 Usuario no puede crear productos', async () => {
    expect((await request(app).post('/api/comedores/1/productos').set(auth(tokenUsuario)).send(productoValido())).status).toBe(403);
  });

  test('CP-34 Usuario no puede cambiar la capacidad del comedor', async () => {
    const res = await request(app).put('/api/comedores/1/capacidad').set(auth(tokenUsuario)).send({ seco: 1, refrigerado: 1, congelado: 1 });
    expect(res.status).toBe(403);
  });

  test('CP-35 Administrador actualiza la capacidad', async () => {
    const res = await request(app).put('/api/comedores/1/capacidad').set(auth(tokenAdmin)).send({ seco: 2500, refrigerado: 500, congelado: 300 });
    expect(res.status).toBe(200);
    expect(res.body.capacidad.seco).toBe(2500);
  });

  test('CP-35b capacidad con valores inválidos', async () => {
    const res = await request(app).put('/api/comedores/1/capacidad').set(auth(tokenAdmin)).send({ seco: -1, refrigerado: 500, congelado: 300 });
    expect(res.status).toBe(400);
  });
});

describe('Productos (Administrador)', () => {
  const crear = (body, id = 1) => request(app).post(`/api/comedores/${id}/productos`).set(auth(tokenAdmin)).send(body);

  test('CP-13 crear producto con datos válidos', async () => {
    const res = await crear(productoValido());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ nombre: 'Pasta', stock: 0, comedorId: 1 });
  });

  test('CP-15 crear producto con campos obligatorios vacíos', async () => {
    const res = await crear({ nombre: 'Pasta' });
    expect(res.status).toBe(400);
    expect(res.body.detalles.faltantes).toContain('lote');
  });

  test.each([
    [{ caducidad: '25/12/2099' }],
    [{ almacenamiento: 'nevera' }],
    [{ unidad: 'toneladas' }],
    [{ nombre: '<script>alert(1)</script>' }],
    [{ diasCobertura: 0 }],
  ])('CP-16 crear producto con formato incorrecto %p', async (extra) => {
    expect((await crear(productoValido(extra))).status).toBe(400);
  });

  test('CP-17 crear producto caducado', async () => {
    const res = await crear(productoValido({ caducidad: '2020-01-01' }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/caducado/);
  });

  test('CP-18 crear producto duplicado (mismo nombre y lote)', async () => {
    const res = await crear(productoValido({ nombre: 'Arroz', lote: 'A-102' }));
    expect(res.status).toBe(409);
  });

  test('CP-19 eliminar producto inexistente', async () => {
    expect((await request(app).delete('/api/comedores/1/productos/999').set(auth(tokenAdmin))).status).toBe(404);
  });

  test('CP-19b eliminar producto existente', async () => {
    expect((await request(app).delete('/api/comedores/1/productos/1').set(auth(tokenAdmin))).status).toBe(200);
  });

  test('CP-20 consultar un comedor inexistente', async () => {
    expect((await request(app).get('/api/comedores/99/inventario').set(auth(tokenAdmin))).status).toBe(404);
  });

  test('CP-38 producto próximo a caducar se marca en el inventario', async () => {
    await crear(productoValido({ nombre: 'Yogur', lote: 'Y-1', almacenamiento: 'refrigerado', caducidad: fechaEnDias(2) }));
    const res = await request(app).get('/api/comedores/1/inventario').set(auth(tokenUsuario));
    const yogur = res.body.productos.find((p) => p.nombre === 'Yogur');
    expect(yogur.proximoACaducar).toBe(true);
  });
});

describe('Entradas y límite de recepción', () => {
  const entrada = (body, t = tokenUsuario, id = 1) => request(app).post(`/api/comedores/${id}/entradas`).set(auth(t)).send(body);

  test('CP-21 entrada completa dentro de la capacidad', async () => {
    store.db.productos[0].consumoDiario = 100; // stock máximo 1500 kg
    const res = await entrada({ productoId: 1, cantidad: 100 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ cantidadAceptada: 100, cantidadRedirigida: 0, stock: 220, semaforo: 'verde' });
  });

  test('CP-22 recepción parcial por falta de espacio (refrigerado)', async () => {
    store.db.enCamino.push({ comedorId: 1, almacenamiento: 'refrigerado', cantidad: 70 });
    store.db.productos[1].consumoDiario = 100; // quita el límite por producto
    const res = await entrada({ productoId: 2, cantidad: 100 });
    expect(res.body).toMatchObject({ cantidadAceptada: 80, cantidadRedirigida: 20 });
  });

  test('CP-23 límite por producto aunque haya espacio', async () => {
    const res = await entrada({ productoId: 1, cantidad: 50 });
    expect(res.body).toMatchObject({ cantidadAceptada: 30, cantidadRedirigida: 20, stock: 150 });
  });

  test('CP-24 semáforo amarillo: recibe y avisa', async () => {
    store.db.productos[0].stock = 1400;
    store.db.productos[0].consumoDiario = 200;
    const res = await entrada({ productoId: 1, cantidad: 100 });
    expect(res.body.semaforo).toBe('amarillo');
    expect(res.body.aviso).toBeDefined();
  });

  test('CP-25 semáforo rojo: bloquea y redirige todo', async () => {
    store.db.productos[1].stock = 370; // 370/400 = 92.5 %
    const res = await entrada({ productoId: 2, cantidad: 10 });
    expect(res.body).toMatchObject({ cantidadAceptada: 0, cantidadRedirigida: 10, semaforo: 'rojo' });
  });

  test('CP-26 Usuario no puede autorizar excepciones', async () => {
    store.db.productos[1].stock = 370;
    expect((await entrada({ productoId: 2, cantidad: 10, excepcion: true })).status).toBe(403);
  });

  test('CP-27 Administrador autoriza excepción y queda registrado quién', async () => {
    store.db.productos[1].stock = 370;
    const res = await entrada({ productoId: 2, cantidad: 10, excepcion: true }, tokenAdmin);
    expect(res.status).toBe(201);
    expect(res.body.cantidadAceptada).toBe(10);
    expect(store.db.excepciones[0].autorizadoPor).toBe(1);
  });

  test.each([[0], [-5], [10001]])('CP-30 cantidad fuera de límites %p', async (cantidad) => {
    expect((await entrada({ productoId: 1, cantidad })).status).toBe(400);
  });

  test('CP-31 cantidad con formato incorrecto', async () => {
    expect((await entrada({ productoId: 1, cantidad: 'diez' })).status).toBe(400);
  });

  test('CP-31b entrada a producto inexistente', async () => {
    expect((await entrada({ productoId: 999, cantidad: 5 })).status).toBe(404);
  });
});

describe('Salidas y mermas', () => {
  const post = (tipo, body) => request(app).post(`/api/comedores/1/${tipo}`).set(auth(tokenUsuario)).send(body);

  test('CP-28 salida válida baja el stock', async () => {
    const res = await post('salidas', { productoId: 1, cantidad: 20 });
    expect(res.status).toBe(201);
    expect(res.body.stock).toBe(100);
  });

  test('CP-29 salida mayor al stock', async () => {
    const res = await post('salidas', { productoId: 1, cantidad: 150 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Stock insuficiente');
    expect(store.db.productos[0].stock).toBe(120);
  });

  test('CP-32 merma válida con motivo', async () => {
    const res = await post('mermas', { productoId: 2, cantidad: 4, motivo: 'Caducado' });
    expect(res.status).toBe(201);
    expect(res.body.movimiento).toMatchObject({ tipo: 'merma', motivo: 'Caducado' });
  });

  test('CP-33 merma sin motivo', async () => {
    expect((await post('mermas', { productoId: 2, cantidad: 4 })).status).toBe(400);
  });
});

describe('Manejo de errores y seguridad', () => {
  test('CP-36 JSON mal formado', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"correo":');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('JSON mal formado');
  });

  test('CP-37 encabezados de seguridad presentes y sin X-Powered-By', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('ruta inexistente devuelve 404', async () => {
    expect((await request(app).get('/no-existe')).status).toBe(404);
  });

  test('error inesperado devuelve 500 sin detalles internos', async () => {
    const svc = require('../src/services/inventario.service');
    const spy = jest.spyOn(svc, 'consultarTodos').mockImplementation(() => { throw new Error('fallo interno'); });
    const res = await request(app).get('/api/inventario').set(auth(tokenAdmin));
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Error interno del servidor');
    spy.mockRestore();
  });
});
