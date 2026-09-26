// Almacenamiento en memoria. Se reinicia con cada arranque (suficiente para la demo;
// en la siguiente versión se sustituye por una base de datos, ver plan de mejora).
const bcrypt = require('bcryptjs');

function seed() {
  return {
    usuarios: [
      { id: 1, nombre: 'Admin General', correo: 'admin@donaciones.mx', hash: bcrypt.hashSync('Admin123!', 10), rol: 'Administrador', estado: 'activo', comedorId: null },
      { id: 2, nombre: 'Responsable Comedor A', correo: 'usuario@donaciones.mx', hash: bcrypt.hashSync('Usuario123!', 10), rol: 'Usuario', estado: 'activo', comedorId: 1 },
      { id: 3, nombre: 'Usuario bloqueado', correo: 'bloqueado@donaciones.mx', hash: bcrypt.hashSync('Usuario123!', 10), rol: 'Usuario', estado: 'bloqueado', comedorId: 1 },
    ],
    comedores: [
      { id: 1, nombre: 'Comedor A', capacidad: { seco: 2000, refrigerado: 400, congelado: 300 } },
      { id: 2, nombre: 'Comedor B', capacidad: { seco: 1500, refrigerado: 300, congelado: 200 } },
    ],
    productos: [
      { id: 1, comedorId: 1, nombre: 'Arroz', categoria: 'Granos', almacenamiento: 'seco', unidad: 'kg', stock: 120, consumoDiario: 10, diasCobertura: 15, lote: 'A-102', caducidad: '2027-03-01' },
      { id: 2, comedorId: 1, nombre: 'Leche', categoria: 'Lacteos', almacenamiento: 'refrigerado', unidad: 'L', stock: 250, consumoDiario: 40, diasCobertura: 10, lote: 'L-55', caducidad: '2026-12-01' },
      { id: 3, comedorId: 2, nombre: 'Frijol', categoria: 'Granos', almacenamiento: 'seco', unidad: 'kg', stock: 300, consumoDiario: 8, diasCobertura: 45, lote: 'F-01', caducidad: '2027-06-01' },
    ],
    enCamino: [], // { comedorId, almacenamiento, cantidad }
    movimientos: [],
    excepciones: [],
    nextId: { producto: 4, movimiento: 1 },
  };
}

let db = seed();
module.exports = {
  get db() { return db; },
  reset() { db = seed(); },
};
