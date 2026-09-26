module.exports = {
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-cambiar-en-produccion',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  port: Number(process.env.PORT) || 3000,
  // Porcentajes del semáforo (sección 6.4 del documento)
  semaforo: { amarillo: 0.7, rojo: 0.9 },
};
