-- =============================================================
-- Módulo de Inventario · Esquema de la base de datos (SQLite)
-- Se ejecuta al iniciar el servidor; IF NOT EXISTS evita duplicar tablas.
-- =============================================================

PRAGMA foreign_keys = ON;

-- Comedores comunitarios que reciben donaciones
CREATE TABLE IF NOT EXISTS comedores (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre    TEXT    NOT NULL UNIQUE,
  direccion TEXT
);

-- Capacidad de cada tipo de almacenamiento por comedor (kg o litros equivalentes)
CREATE TABLE IF NOT EXISTS capacidades (
  comedor_id     INTEGER NOT NULL REFERENCES comedores (id) ON DELETE CASCADE,
  almacenamiento TEXT    NOT NULL CHECK (almacenamiento IN ('seco', 'refrigerado', 'congelado')),
  capacidad      REAL    NOT NULL CHECK (capacidad >= 0),
  PRIMARY KEY (comedor_id, almacenamiento)
);

-- Usuarios del sistema: rol Usuario (responsable de un comedor) o Administrador
CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT    NOT NULL,
  correo        TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  rol           TEXT    NOT NULL CHECK (rol IN ('Usuario', 'Administrador')),
  comedor_id    INTEGER REFERENCES comedores (id),
  activo        INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  CHECK (rol = 'Administrador' OR comedor_id IS NOT NULL)
);

-- Productos del inventario de cada comedor
CREATE TABLE IF NOT EXISTS productos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  comedor_id     INTEGER NOT NULL REFERENCES comedores (id),
  nombre         TEXT    NOT NULL,
  categoria      TEXT    NOT NULL,
  almacenamiento TEXT    NOT NULL CHECK (almacenamiento IN ('seco', 'refrigerado', 'congelado')),
  unidad         TEXT    NOT NULL CHECK (unidad IN ('kg', 'l')),
  stock          REAL    NOT NULL DEFAULT 0 CHECK (stock >= 0),
  consumo_diario REAL    NOT NULL CHECK (consumo_diario > 0),
  dias_cobertura INTEGER NOT NULL CHECK (dias_cobertura BETWEEN 1 AND 365),
  lote           TEXT    NOT NULL,
  caducidad      TEXT    NOT NULL, -- formato AAAA-MM-DD
  activo         INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)), -- 0 = eliminado (baja lógica)
  creado_en      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Un producto activo no se puede repetir (mismo nombre y lote) dentro del mismo comedor
CREATE UNIQUE INDEX IF NOT EXISTS ux_productos_nombre_lote
  ON productos (comedor_id, nombre COLLATE NOCASE, lote COLLATE NOCASE)
  WHERE activo = 1;

CREATE INDEX IF NOT EXISTS ix_productos_comedor ON productos (comedor_id, activo);

-- Historial de entradas, salidas y mermas (trazabilidad)
CREATE TABLE IF NOT EXISTS movimientos (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  comedor_id         INTEGER NOT NULL REFERENCES comedores (id),
  producto_id        INTEGER NOT NULL REFERENCES productos (id),
  tipo               TEXT    NOT NULL CHECK (tipo IN ('entrada', 'salida', 'merma')),
  cantidad           REAL    NOT NULL CHECK (cantidad > 0),
  cantidad_rechazada REAL    NOT NULL DEFAULT 0 CHECK (cantidad_rechazada >= 0),
  excepcion          INTEGER NOT NULL DEFAULT 0 CHECK (excepcion IN (0, 1)),
  motivo             TEXT,
  usuario_id         INTEGER NOT NULL REFERENCES usuarios (id),
  fecha              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS ix_movimientos_comedor ON movimientos (comedor_id, id);
