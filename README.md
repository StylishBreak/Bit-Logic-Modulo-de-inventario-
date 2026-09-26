# Módulo de Inventario — Sistema de donaciones (Equipo 6)

API REST en Node.js + Express con autenticación JWT y roles **Usuario** y **Administrador**.

## Ejecutar

```bash
npm install
cp .env.example .env      # opcional; cambia JWT_SECRET
npm start                 # http://localhost:3000
npm test                  # pruebas + cobertura (coverage/index.html)
npm run build             # genera dist/
```

Usuarios de prueba (datos en memoria, se reinician al arrancar):

| Correo | Contraseña | Rol |
|---|---|---|
| admin@donaciones.mx | Admin123! | Administrador |
| usuario@donaciones.mx | Usuario123! | Usuario (Comedor A) |
| bloqueado@donaciones.mx | Usuario123! | Usuario bloqueado |

## Endpoints

| Método | Ruta | Rol |
|---|---|---|
| POST | /api/auth/login | Público |
| GET | /api/comedores/:id/inventario | Usuario (solo su comedor), Administrador |
| POST | /api/comedores/:id/entradas | Usuario, Administrador (`excepcion: true` solo Admin) |
| POST | /api/comedores/:id/salidas | Usuario, Administrador |
| POST | /api/comedores/:id/mermas | Usuario, Administrador |
| GET | /api/inventario | Administrador |
| POST | /api/comedores/:id/productos | Administrador |
| DELETE | /api/comedores/:id/productos/:productoId | Administrador |
| PUT | /api/comedores/:id/capacidad | Administrador |

Todas las rutas `/api` (excepto login) requieren `Authorization: Bearer <token>`.

## CI/CD

`.github/workflows/ci-cd.yml`: Pruebas → Build → Despliegue (Render) → Escaneo OWASP ZAP.

Configurar en GitHub (Settings → Secrets and variables → Actions):

- Secret `RENDER_DEPLOY_HOOK`: URL del Deploy Hook del servicio en Render.
- Variable `APP_URL`: URL pública del servicio (ej. https://modulo-inventario.onrender.com).
- Secret `SONAR_TOKEN` (opcional) y variable `SONAR_HOST_URL` para SonarQube/SonarCloud.
- En Render: variable de entorno `JWT_SECRET` con una clave larga.
