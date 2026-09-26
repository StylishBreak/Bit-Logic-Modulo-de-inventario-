'use strict';

const { enTransaccion } = require('../db/database');
const { errores } = require('../utils/errores');
const { hoy, diasEntre } = require('../utils/fechas');
const {
  ALMACENAMIENTOS,
  validarProducto,
  validarMovimiento,
  validarCapacidad,
} = require('../utils/validators');
const calculos = require('./calculos');

const MAX_MOVIMIENTOS = 20;

// Todas las consultas usan parámetros (?) y nunca concatenan datos del usuario: evita inyección SQL
function prepararConsultas(db) {
  const columnasProducto = `
    id, comedor_id AS comedorId, nombre, categoria, almacenamiento, unidad, stock,
    consumo_diario AS consumoDiario, dias_cobertura AS diasCobertura, lote, caducidad`;
  return {
    comedor: db.prepare('SELECT id, nombre, direccion FROM comedores WHERE id = ?'),
    comedores: db.prepare('SELECT id, nombre FROM comedores ORDER BY id'),
    capacidades: db.prepare('SELECT almacenamiento, capacidad FROM capacidades WHERE comedor_id = ?'),
    ocupacion: db.prepare(`
      SELECT almacenamiento, COALESCE(SUM(stock), 0) AS ocupado
      FROM productos
      WHERE comedor_id = ? AND activo = 1
      GROUP BY almacenamiento`),
    productos: db.prepare(`
      SELECT ${columnasProducto} FROM productos
      WHERE comedor_id = ? AND activo = 1
      ORDER BY nombre, id`),
    producto: db.prepare(`
      SELECT ${columnasProducto} FROM productos
      WHERE id = ? AND comedor_id = ? AND activo = 1`),
    duplicado: db.prepare(`
      SELECT id FROM productos
      WHERE comedor_id = ? AND nombre = ? COLLATE NOCASE AND lote = ? COLLATE NOCASE AND activo = 1`),
    insertarProducto: db.prepare(`
      INSERT INTO productos
        (comedor_id, nombre, categoria, almacenamiento, unidad, stock, consumo_diario, dias_cobertura, lote, caducidad)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`),
    bajaProducto: db.prepare('UPDATE productos SET activo = 0 WHERE id = ?'),
    actualizarStock: db.prepare('UPDATE productos SET stock = ? WHERE id = ?'),
    insertarMovimiento: db.prepare(`
      INSERT INTO movimientos
        (comedor_id, producto_id, tipo, cantidad, cantidad_rechazada, excepcion, motivo, usuario_id, fecha)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    movimientos: db.prepare(`
      SELECT m.id, m.tipo, m.cantidad, m.cantidad_rechazada AS cantidadRechazada, m.excepcion,
             m.motivo, m.fecha, p.id AS productoId, p.nombre AS producto, p.unidad, u.nombre AS usuario
      FROM movimientos m
      JOIN productos p ON p.id = m.producto_id
      JOIN usuarios u ON u.id = m.usuario_id
      WHERE m.comedor_id = ?
      ORDER BY m.id DESC
      LIMIT ?`),
    guardarCapacidad: db.prepare(`
      INSERT INTO capacidades (comedor_id, almacenamiento, capacidad) VALUES (?, ?, ?)
      ON CONFLICT (comedor_id, almacenamiento) DO UPDATE SET capacidad = excluded.capacidad`),
  };
}

function crearServicioInventario({ db, config }) {
  const sql = prepararConsultas(db);
  const fechaDeHoy = () => hoy(config.zonaHoraria);

  function obtenerComedor(comedorId) {
    const comedor = sql.comedor.get(comedorId);
    if (!comedor) throw errores.noEncontrado('Comedor no encontrado');
    return comedor;
  }

  function obtenerProducto(productoId, comedorId) {
    const producto = sql.producto.get(productoId, comedorId);
    if (!producto) throw errores.noEncontrado('Producto no encontrado en este comedor');
    return producto;
  }

  /** Capacidad, ocupación y semáforo de cada tipo de almacenamiento del comedor. */
  function resumenAlmacenamiento(comedorId) {
    const capacidades = new Map(sql.capacidades.all(comedorId).map((c) => [c.almacenamiento, c.capacidad]));
    const ocupados = new Map(sql.ocupacion.all(comedorId).map((o) => [o.almacenamiento, o.ocupado]));
    return ALMACENAMIENTOS.map((tipo) => {
      const capacidad = capacidades.get(tipo) ?? 0;
      const ocupado = calculos.redondear(ocupados.get(tipo) ?? 0);
      const porcentaje = calculos.porcentajeOcupacion(ocupado, capacidad);
      return {
        tipo,
        capacidad,
        ocupado,
        disponible: calculos.redondear(Math.max(0, capacidad - ocupado)),
        porcentaje,
        semaforo: calculos.semaforo(porcentaje),
      };
    });
  }

  function describirProducto(producto, fecha) {
    const diasParaCaducar = diasEntre(fecha, producto.caducidad);
    return {
      ...producto,
      stockMaximo: calculos.stockMaximo(producto.consumoDiario, producto.diasCobertura),
      diasParaCaducar,
      estadoCaducidad: calculos.estadoCaducidad(diasParaCaducar, config.diasAlertaCaducidad),
    };
  }

  function construirAlertas(productos, almacenamiento) {
    const alertas = [];
    for (const p of productos) {
      if (p.estadoCaducidad === 'por_caducar') {
        alertas.push({ tipo: 'caducidad', mensaje: `${p.nombre} (lote ${p.lote}) caduca en ${p.diasParaCaducar} días` });
      }
    }
    for (const a of almacenamiento) {
      if (a.semaforo !== 'verde') {
        alertas.push({ tipo: 'ocupacion', mensaje: `Almacenamiento ${a.tipo} al ${a.porcentaje} % (${a.semaforo})` });
      }
    }
    return alertas;
  }

  /** Actualiza el stock y registra el movimiento en una sola transacción. */
  function guardarMovimiento({ comedorId, producto, tipo, cantidad, rechazada = 0, excepcion = false, motivo, usuario, nuevoStock }) {
    const fecha = new Date().toISOString();
    const stock = calculos.redondear(nuevoStock);
    const id = enTransaccion(db, () => {
      sql.actualizarStock.run(stock, producto.id);
      const resultado = sql.insertarMovimiento.run(
        comedorId, producto.id, tipo, cantidad, rechazada, excepcion ? 1 : 0, motivo ?? null, usuario.id, fecha
      );
      return Number(resultado.lastInsertRowid);
    });
    const movimiento = {
      id, tipo, comedorId, productoId: producto.id, producto: producto.nombre,
      cantidad, unidad: producto.unidad, usuarioId: usuario.id, fecha,
    };
    if (motivo) movimiento.motivo = motivo;
    return { movimiento, stock };
  }

  function registrarSalidaOMerma(tipo, comedorId, datos, usuario) {
    obtenerComedor(comedorId);
    const { productoId, cantidad, motivo } = validarMovimiento(datos, tipo);
    const producto = obtenerProducto(productoId, comedorId);
    if (cantidad > producto.stock) {
      throw errores.solicitudIncorrecta(
        `Stock insuficiente: hay ${producto.stock} ${producto.unidad} de ${producto.nombre}`
      );
    }
    return guardarMovimiento({ comedorId, producto, tipo, cantidad, motivo, usuario, nuevoStock: producto.stock - cantidad });
  }

  return {
    inventarioComedor(comedorId) {
      const comedor = obtenerComedor(comedorId);
      const fecha = fechaDeHoy();
      const productos = sql.productos.all(comedorId).map((p) => describirProducto(p, fecha));
      const almacenamiento = resumenAlmacenamiento(comedorId);
      return { comedor, fecha, almacenamiento, productos, alertas: construirAlertas(productos, almacenamiento) };
    },

    inventarioGeneral() {
      const fecha = fechaDeHoy();
      const comedores = sql.comedores.all().map((comedor) => {
        const productos = sql.productos.all(comedor.id).map((p) => describirProducto(p, fecha));
        return {
          id: comedor.id,
          nombre: comedor.nombre,
          totalProductos: productos.length,
          productosPorCaducar: productos.filter((p) => p.estadoCaducidad === 'por_caducar').length,
          almacenamiento: resumenAlmacenamiento(comedor.id),
        };
      });
      return { fecha, comedores };
    },

    listarMovimientos(comedorId) {
      obtenerComedor(comedorId);
      const movimientos = sql.movimientos
        .all(comedorId, MAX_MOVIMIENTOS)
        .map((m) => ({ ...m, excepcion: m.excepcion === 1 }));
      return { comedorId, movimientos };
    },

    registrarEntrada(comedorId, datos, usuario) {
      obtenerComedor(comedorId);
      if (datos.excepcion === true && usuario.rol !== 'Administrador') {
        throw errores.prohibido('Solo el Administrador puede autorizar una excepción al límite de recepción');
      }
      const entrada = validarMovimiento(datos, 'entrada');
      const producto = obtenerProducto(entrada.productoId, comedorId);
      const almacen = resumenAlmacenamiento(comedorId).find((a) => a.tipo === producto.almacenamiento);

      const recepcion = calculos.calcularRecepcion({
        cantidad: entrada.cantidad,
        stockActual: producto.stock,
        stockMax: calculos.stockMaximo(producto.consumoDiario, producto.diasCobertura),
        capacidad: almacen.capacidad,
        ocupado: almacen.ocupado,
        excepcion: entrada.excepcion,
      });
      if (recepcion.aceptada <= 0) {
        throw errores.conflicto(
          recepcion.limitadoPor === 'espacio'
            ? `Sin espacio disponible en el almacenamiento ${producto.almacenamiento}`
            : `${producto.nombre} ya alcanzó su stock máximo`
        );
      }

      const resultado = guardarMovimiento({
        comedorId,
        producto,
        tipo: 'entrada',
        cantidad: recepcion.aceptada,
        rechazada: recepcion.rechazada,
        excepcion: recepcion.excepcion,
        motivo: entrada.motivo ?? recepcion.motivo,
        usuario,
        nuevoStock: producto.stock + recepcion.aceptada,
      });
      const almacenamiento = resumenAlmacenamiento(comedorId).find((a) => a.tipo === producto.almacenamiento);
      return { ...resultado, recepcion, almacenamiento };
    },

    registrarSalida(comedorId, datos, usuario) {
      return registrarSalidaOMerma('salida', comedorId, datos, usuario);
    },

    registrarMerma(comedorId, datos, usuario) {
      return registrarSalidaOMerma('merma', comedorId, datos, usuario);
    },

    crearProducto(comedorId, datos) {
      obtenerComedor(comedorId);
      const fecha = fechaDeHoy();
      const nuevo = validarProducto(datos, fecha);
      if (sql.duplicado.get(comedorId, nuevo.nombre, nuevo.lote)) {
        throw errores.conflicto(`Ya existe ${nuevo.nombre} con el lote ${nuevo.lote} en este comedor`);
      }
      const { lastInsertRowid } = sql.insertarProducto.run(
        comedorId, nuevo.nombre, nuevo.categoria, nuevo.almacenamiento, nuevo.unidad,
        nuevo.consumoDiario, nuevo.diasCobertura, nuevo.lote, nuevo.caducidad
      );
      return describirProducto(obtenerProducto(Number(lastInsertRowid), comedorId), fecha);
    },

    eliminarProducto(comedorId, productoId) {
      obtenerComedor(comedorId);
      const producto = obtenerProducto(productoId, comedorId);
      if (producto.stock > 0) {
        throw errores.conflicto(
          `No se puede eliminar ${producto.nombre}: aún tiene ${producto.stock} ${producto.unidad} en existencia`
        );
      }
      sql.bajaProducto.run(producto.id);
      return { mensaje: `Producto ${producto.nombre} (lote ${producto.lote}) eliminado`, id: producto.id };
    },

    configurarCapacidad(comedorId, datos) {
      obtenerComedor(comedorId);
      const cambios = validarCapacidad(datos);
      const actual = resumenAlmacenamiento(comedorId);
      for (const [tipo, capacidad] of Object.entries(cambios)) {
        const { ocupado } = actual.find((a) => a.tipo === tipo);
        if (capacidad < ocupado) {
          throw errores.conflicto(
            `La capacidad de ${tipo} (${capacidad}) no puede ser menor a lo ocupado actualmente (${ocupado})`
          );
        }
      }
      enTransaccion(db, () => {
        for (const [tipo, capacidad] of Object.entries(cambios)) sql.guardarCapacidad.run(comedorId, tipo, capacidad);
      });
      return { comedorId, almacenamiento: resumenAlmacenamiento(comedorId) };
    },
  };
}

module.exports = { crearServicioInventario };
