-- =============================================================
-- Consultas útiles para revisar la base en DB Browser for SQLite
-- (abrir data/inventario.db → pestaña "Ejecutar SQL")
-- =============================================================

-- 1) Inventario de cada comedor con stock máximo y días para caducar
SELECT c.nombre                                   AS comedor,
       p.nombre                                   AS producto,
       p.almacenamiento,
       p.stock || ' ' || p.unidad                 AS stock,
       p.consumo_diario * p.dias_cobertura        AS stock_maximo,
       p.caducidad,
       CAST(julianday(p.caducidad) - julianday('now', 'localtime', 'start of day') AS INTEGER) AS dias_para_caducar
FROM productos p
JOIN comedores c ON c.id = p.comedor_id
WHERE p.activo = 1
ORDER BY c.id, p.nombre;

-- 2) Ocupación y semáforo por tipo de almacenamiento (misma regla que la API)
SELECT c.nombre AS comedor,
       k.almacenamiento,
       k.capacidad,
       COALESCE(SUM(p.stock), 0) AS ocupado,
       ROUND(COALESCE(SUM(p.stock), 0) * 100.0 / k.capacidad, 1) AS porcentaje,
       CASE
         WHEN COALESCE(SUM(p.stock), 0) * 100.0 / k.capacidad >= 90 THEN 'rojo'
         WHEN COALESCE(SUM(p.stock), 0) * 100.0 / k.capacidad >= 70 THEN 'amarillo'
         ELSE 'verde'
       END AS semaforo
FROM capacidades k
JOIN comedores c ON c.id = k.comedor_id
LEFT JOIN productos p
       ON p.comedor_id = k.comedor_id AND p.almacenamiento = k.almacenamiento AND p.activo = 1
GROUP BY k.comedor_id, k.almacenamiento
ORDER BY c.id, k.almacenamiento;

-- 3) Historial de movimientos con el producto y la persona que lo registró
SELECT m.id, m.fecha, m.tipo, p.nombre AS producto, m.cantidad, m.cantidad_rechazada,
       CASE m.excepcion WHEN 1 THEN 'Sí' ELSE 'No' END AS excepcion,
       m.motivo, u.nombre AS registro
FROM movimientos m
JOIN productos p ON p.id = m.producto_id
JOIN usuarios  u ON u.id = m.usuario_id
ORDER BY m.id DESC
LIMIT 50;

-- 4) Productos que caducan en los próximos 7 días
SELECT c.nombre AS comedor, p.nombre, p.lote, p.stock, p.unidad, p.caducidad
FROM productos p
JOIN comedores c ON c.id = p.comedor_id
WHERE p.activo = 1
  AND p.caducidad <= date('now', 'localtime', '+7 days')
ORDER BY p.caducidad;

-- 5) Control de integridad: el stock debe coincidir con entradas − salidas − mermas
SELECT p.id, p.nombre, p.stock,
       SUM(CASE m.tipo WHEN 'entrada' THEN m.cantidad ELSE -m.cantidad END) AS stock_segun_movimientos
FROM productos p
LEFT JOIN movimientos m ON m.producto_id = p.id
GROUP BY p.id
HAVING ROUND(p.stock, 2) <> ROUND(COALESCE(stock_segun_movimientos, 0), 2);  -- vacío = todo cuadra

-- 6) Mermas por comedor y motivo (base para la propuesta de innovación)
SELECT c.nombre AS comedor, m.motivo, COUNT(*) AS registros, SUM(m.cantidad) AS cantidad_perdida
FROM movimientos m
JOIN comedores c ON c.id = m.comedor_id
WHERE m.tipo = 'merma'
GROUP BY c.id, m.motivo
ORDER BY cantidad_perdida DESC;

-- 7) Usuarios y roles (las contraseñas se guardan como hash scrypt, nunca en texto plano)
SELECT u.id, u.nombre, u.correo, u.rol, c.nombre AS comedor,
       CASE u.activo WHEN 1 THEN 'Activo' ELSE 'Bloqueado' END AS estado
FROM usuarios u
LEFT JOIN comedores c ON c.id = u.comedor_id
ORDER BY u.id;

-- 8) Merma por caducidad al mes, por comedor y unidad (indicador de la propuesta de innovación)
SELECT strftime('%Y-%m', m.fecha) AS mes, c.nombre AS comedor, p.unidad,
       SUM(m.cantidad) AS cantidad_perdida
FROM movimientos m
JOIN comedores c ON c.id = m.comedor_id
JOIN productos p ON p.id = m.producto_id
WHERE m.tipo = 'merma' AND lower(m.motivo) LIKE '%caduc%'
GROUP BY mes, c.id, p.unidad
ORDER BY mes DESC, c.id;
