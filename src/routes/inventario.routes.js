'use strict';

const { verificarAccesoComedor } = require('../middleware/auth');
const { validarId } = require('../utils/validators');

const AMBOS_ROLES = ['Usuario', 'Administrador'];
const SOLO_ADMINISTRADOR = ['Administrador'];

/** Valida el :id de la URL y comprueba que el usuario pueda trabajar con ese comedor. */
function comedorDeLaRuta(ctx) {
  const comedorId = validarId(ctx.params.id, 'id del comedor');
  verificarAccesoComedor(ctx.usuario, comedorId);
  return comedorId;
}

const responder = (estado, datos) => ({ estado, datos });

function registrarRutasInventario(enrutador, { servicioInventario: servicio }) {
  // Solo Administrador: vista general de todos los comedores
  enrutador.get('/api/inventario', { roles: SOLO_ADMINISTRADOR }, () =>
    responder(200, servicio.inventarioGeneral())
  );

  // Usuario (solo su comedor) y Administrador (todos)
  enrutador.get('/api/comedores/:id/inventario', { roles: AMBOS_ROLES }, (ctx) =>
    responder(200, servicio.inventarioComedor(comedorDeLaRuta(ctx)))
  );
  enrutador.get('/api/comedores/:id/movimientos', { roles: AMBOS_ROLES }, (ctx) =>
    responder(200, servicio.listarMovimientos(comedorDeLaRuta(ctx)))
  );
  enrutador.post('/api/comedores/:id/entradas', { roles: AMBOS_ROLES, cuerpo: true }, (ctx) =>
    responder(201, servicio.registrarEntrada(comedorDeLaRuta(ctx), ctx.cuerpo, ctx.usuario))
  );
  enrutador.post('/api/comedores/:id/salidas', { roles: AMBOS_ROLES, cuerpo: true }, (ctx) =>
    responder(201, servicio.registrarSalida(comedorDeLaRuta(ctx), ctx.cuerpo, ctx.usuario))
  );
  enrutador.post('/api/comedores/:id/mermas', { roles: AMBOS_ROLES, cuerpo: true }, (ctx) =>
    responder(201, servicio.registrarMerma(comedorDeLaRuta(ctx), ctx.cuerpo, ctx.usuario))
  );

  // Solo Administrador
  enrutador.post('/api/comedores/:id/productos', { roles: SOLO_ADMINISTRADOR, cuerpo: true }, (ctx) =>
    responder(201, servicio.crearProducto(comedorDeLaRuta(ctx), ctx.cuerpo))
  );
  enrutador.delete('/api/comedores/:id/productos/:productoId', { roles: SOLO_ADMINISTRADOR }, (ctx) =>
    responder(
      200,
      servicio.eliminarProducto(comedorDeLaRuta(ctx), validarId(ctx.params.productoId, 'id del producto'))
    )
  );
  enrutador.put('/api/comedores/:id/capacidad', { roles: SOLO_ADMINISTRADOR, cuerpo: true }, (ctx) =>
    responder(200, servicio.configurarCapacidad(comedorDeLaRuta(ctx), ctx.cuerpo))
  );
}

module.exports = { registrarRutasInventario, AMBOS_ROLES, SOLO_ADMINISTRADOR };
