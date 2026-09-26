const router = require('express').Router();
const { autenticar, autorizar } = require('../middleware/auth');
const svc = require('../services/inventario.service');

const ADMIN = 'Administrador';
const AMBOS = ['Usuario', ADMIN];
const h = (fn, status = 200) => (req, res, next) => {
  try { res.status(status).json(fn(req)); } catch (e) { next(e); }
};

router.use(autenticar);

// Usuario y Administrador
router.get('/comedores/:id/inventario', autorizar(...AMBOS), h((req) => svc.consultarInventario(req.usuario, req.params.id)));
router.post('/comedores/:id/entradas', autorizar(...AMBOS), h((req) => svc.registrarEntrada(req.usuario, req.params.id, req.body), 201));
router.post('/comedores/:id/salidas', autorizar(...AMBOS), h((req) => svc.registrarSalida(req.usuario, req.params.id, req.body, 'salida'), 201));
router.post('/comedores/:id/mermas', autorizar(...AMBOS), h((req) => svc.registrarSalida(req.usuario, req.params.id, req.body, 'merma'), 201));

// Solo Administrador
router.get('/inventario', autorizar(ADMIN), h(() => svc.consultarTodos()));
router.post('/comedores/:id/productos', autorizar(ADMIN), h((req) => svc.crearProducto(req.params.id, req.body), 201));
router.delete('/comedores/:id/productos/:productoId', autorizar(ADMIN), h((req) => svc.eliminarProducto(req.params.id, req.params.productoId)));
router.put('/comedores/:id/capacidad', autorizar(ADMIN), h((req) => svc.actualizarCapacidad(req.params.id, req.body)));

module.exports = router;
