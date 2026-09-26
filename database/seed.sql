-- =============================================================
-- Datos de demostración (solo se cargan si la base está vacía)
--
-- Usuarios de prueba (cambiar en un entorno real):
--   admin@comedores.test          Admin#2026      Administrador
--   responsable.a@comedores.test  ComedorA#2026   Usuario · Comedor A
--   responsable.b@comedores.test  ComedorB#2026   Usuario · Comedor B
--   bloqueado@comedores.test      Bloqueado#2026  Usuario bloqueado
-- Las contraseñas se guardan con scrypt (nunca en texto plano).
-- =============================================================

INSERT INTO comedores (id, nombre, direccion) VALUES
  (1, 'Comedor Comunitario A', 'Col. Centro'),
  (2, 'Comedor Comunitario B', 'Col. Independencia');

INSERT INTO capacidades (comedor_id, almacenamiento, capacidad) VALUES
  (1, 'seco', 1000), (1, 'refrigerado', 400), (1, 'congelado', 200),
  (2, 'seco', 800),  (2, 'refrigerado', 300), (2, 'congelado', 150);

INSERT INTO usuarios (id, nombre, correo, password_hash, rol, comedor_id, activo) VALUES
  (1, 'Administrador General', 'admin@comedores.test',
   'scrypt$16384$8$5$Fdcp1chKBswKHatpVcFXqQ==$lp0RcaQJ/rBIn8D1fcyTsektCEsNvQpBSOY27CE+aKU=', 'Administrador', NULL, 1),
  (2, 'Responsable Comedor A', 'responsable.a@comedores.test',
   'scrypt$16384$8$5$iE9e41ShYGT1fqB/2GxUuQ==$zabPawPNKlZMMb9uSjio6dR39V7PgN1+UeZbIo94zYw=', 'Usuario', 1, 1),
  (3, 'Responsable Comedor B', 'responsable.b@comedores.test',
   'scrypt$16384$8$5$l4SfsUBJQEhnBq9U32F9cw==$nTSzBgRhIZUqU8Lg9HHL3fX1p8tYqkvDrDk2GWE+DEU=', 'Usuario', 2, 1),
  (4, 'Usuario Bloqueado', 'bloqueado@comedores.test',
   'scrypt$16384$8$5$2IuIfIR3Q+HiJL38iUk7sA==$m5JffQ3nYGsITAB0Au9ttbEnIv0dcyWHZXcrBd5i9FY=', 'Usuario', 1, 0);

-- Las fechas de caducidad son relativas a hoy para que la demostración no caduque.
-- Se calculan con la hora del centro de México (UTC−6), la misma zona que usa la API.
INSERT INTO productos
  (id, comedor_id, nombre, categoria, almacenamiento, unidad, stock, consumo_diario, dias_cobertura, lote, caducidad)
VALUES
  (1, 1, 'Arroz',        'Granos',    'seco',        'kg', 120, 10, 30, 'AR-2601', date('now', '-6 hours', '+280 days')),
  (2, 1, 'Frijol',       'Granos',    'seco',        'kg',  90,  8, 30, 'FR-2602', date('now', '-6 hours', '+250 days')),
  (3, 1, 'Leche',        'Lácteos',   'refrigerado', 'l',  180, 20, 10, 'LE-2609', date('now', '-6 hours', '+110 days')),
  (4, 1, 'Pollo',        'Carnes',    'congelado',   'kg',  60,  6, 15, 'PO-2609', date('now', '-6 hours', '+85 days')),
  (5, 1, 'Yogur',        'Lácteos',   'refrigerado', 'l',   24,  4,  7, 'YO-2609', date('now', '-6 hours', '+5 days')),
  (6, 2, 'Arroz',        'Granos',    'seco',        'kg', 200, 12, 30, 'AR-2603', date('now', '-6 hours', '+280 days')),
  (7, 2, 'Aceite',       'Abarrotes', 'seco',        'l',   40,  2, 30, 'AC-2601', date('now', '-6 hours', '+340 days')),
  (8, 2, 'Queso',        'Lácteos',   'refrigerado', 'kg', 250, 10, 30, 'QU-2609', date('now', '-6 hours', '+65 days')),
  (9, 2, 'Carne de res', 'Carnes',    'congelado',   'kg', 140,  8, 20, 'RE-2609', date('now', '-6 hours', '+95 days'));

-- El inventario inicial queda registrado como entradas para conservar la trazabilidad
INSERT INTO movimientos (comedor_id, producto_id, tipo, cantidad, motivo, usuario_id)
SELECT comedor_id, id, 'entrada', stock, 'Inventario inicial', 1
FROM productos
ORDER BY id;
