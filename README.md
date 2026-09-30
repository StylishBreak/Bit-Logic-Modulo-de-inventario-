# Módulo de Inventario · Plataforma de donaciones (Equipo 6)

API REST y página web para controlar el inventario de los comedores comunitarios: productos, entradas, salidas, mermas, límite de recepción por espacio y stock máximo, y semáforo de ocupación.

- **Autenticación:** JWT (HS256, 1 hora) y contraseñas guardadas como hash scrypt.
- **Fuerza bruta:** solo cuentan los intentos fallidos. Tras 5 fallos con un correo se bloquea **solo ese correo** durante 15 min (los demás siguen entrando) y tras 50 fallos desde una misma IP se bloquea esa IP. Los accesos correctos no cuentan y el botón de la página se desactiva mientras se verifica la contraseña. Se ajusta con `LOGIN_MAX_FALLOS_CUENTA`, `LOGIN_MAX_FALLOS_IP` y `LOGIN_VENTANA_MINUTOS`; los bloqueos se guardan en memoria, así que reiniciar el servicio los borra.
- **Roles:** Usuario (responsable de un comedor) y Administrador.
- **Base de datos:** SQLite (un solo archivo, `data/inventario.db`).
- **Sin dependencias externas:** todo usa módulos incluidos en Node.js 22 (`http`, `crypto`, `node:sqlite`, `node:test`).

## 1. Requisitos

Solo **Node.js 22 LTS** (22.13 o más reciente): <https://nodejs.org>. No hace falta `npm install`.

## 2. Ejecutar en tu computadora

```bash
npm start
```

Abre <http://localhost:3000>. La primera vez se crea `data/inventario.db` con datos de ejemplo.

- En desarrollo, si no defines `JWT_SECRET`, se genera un secreto temporal (las sesiones se pierden al reiniciar).
- En producción `JWT_SECRET` es obligatorio (mínimo 32 caracteres).
- Para reiniciar los datos, detén el servidor y borra la carpeta `data/`.

Otras variables están en `.env.example`.

### Usuarios de prueba

| Correo | Contraseña | Rol |
|---|---|---|
| admin@comedores.test | Admin#2026 | Administrador |
| responsable.a@comedores.test | ComedorA#2026 | Usuario · Comedor A |
| responsable.b@comedores.test | ComedorB#2026 | Usuario · Comedor B |
| bloqueado@comedores.test | Bloqueado#2026 | Usuario bloqueado (para probar el 403) |

## 3. Roles y permisos

| Acción | Endpoint | Usuario | Administrador |
|---|---|---|---|
| Iniciar sesión | `POST /api/auth/login` | Sí | Sí |
| Consultar inventario de un comedor | `GET /api/comedores/:id/inventario` | Solo su comedor | Todos |
| Ver historial de movimientos | `GET /api/comedores/:id/movimientos` | Solo su comedor | Todos |
| Registrar entrada | `POST /api/comedores/:id/entradas` | Solo su comedor | Todos |
| Registrar salida | `POST /api/comedores/:id/salidas` | Solo su comedor | Todos |
| Registrar merma | `POST /api/comedores/:id/mermas` | Solo su comedor | Todos |
| Ver inventario general | `GET /api/inventario` | No (403) | Sí |
| Crear producto | `POST /api/comedores/:id/productos` | No (403) | Sí |
| Eliminar producto sin existencias | `DELETE /api/comedores/:id/productos/:productoId` | No (403) | Sí |
| Configurar capacidad | `PUT /api/comedores/:id/capacidad` | No (403) | Sí |
| Autorizar excepción al límite | `POST .../entradas` con `"excepcion": true` | No (403) | Sí |

La especificación completa está en `docs/openapi.yaml` (se puede abrir en <https://editor.swagger.io>).

**Reglas del límite de recepción:** stock máximo = consumo diario × días de cobertura; se acepta el menor valor entre el espacio libre del almacenamiento y lo que le falta al producto para su stock máximo. Si llega más, la recepción es parcial. Semáforo de ocupación: verde < 70 %, amarillo 70–89 %, rojo ≥ 90 %.

## 4. Base de datos SQLite

- `database/schema.sql`: tablas `comedores`, `capacidades`, `usuarios`, `productos`, `movimientos`.
- `database/seed.sql`: datos de ejemplo (solo se cargan si la base está vacía).
- `database/consultas.sql`: consultas listas para revisar inventario, semáforo, historial e integridad.

Para ver los datos: instala **DB Browser for SQLite** (<https://sqlitebrowser.org>), abre `data/inventario.db` y usa la pestaña *Ejecutar SQL*. Todas las consultas de la API usan parámetros (`?`), así que no se puede inyectar SQL.

## 5. Pruebas y cobertura

```bash
npm test
```

Ejecuta las pruebas de `tests/` con el ejecutor de pruebas de Node. Cada prueba lleva el ID del caso de la matriz (CP-01…CP-64). Genera:

- `coverage/lcov.info`: cobertura (la usa SonarQube).
- `reports/junit.xml`: resultados en formato JUnit.

La ejecución falla si la cobertura baja de 90 % de líneas, 80 % de ramas o 90 % de funciones.

### Prueba de carga

```bash
CORREO=responsable.a@comedores.test CLAVE='ComedorA#2026' npm run carga
```

Simula 50 usuarios concurrentes durante 20 segundos contra `BASE_URL` (por defecto `http://localhost:3000`) y compara el percentil 95 con el requisito del primer avance: consultas en menos de 1.5 s y página en menos de 3 s. Se puede cambiar con `USUARIOS`, `SEGUNDOS` y `BASE_URL` (por ejemplo, la URL de Render).

## 6. Build

```bash
npm run build
```

Revisa la sintaxis de todos los archivos JavaScript, comprueba que el SQL carga sin errores y genera `dist/` con `build-info.json`.

## 7. Pipeline CI/CD (GitHub Actions)

Archivo: `.github/workflows/ci-cd.yml`. Se activa con cada *push* o *pull request* a `main`.

1. **Código:** GitHub descarga el repositorio y prepara Node.js 22.
2. **Pruebas:** `npm ci --ignore-scripts`, `npm audit`, `npm test` con cobertura, reportes como artefacto y análisis de SonarQube Cloud (si hay `SONAR_TOKEN`).
3. **Build:** `npm run build`, prueba de humo del paquete (`/health`, página y 401 sin token) y artefacto `dist/`.
4. **Despliegue:** solo en *push* a `main`; dispara el Deploy Hook de Render con el commit probado y espera a que `/health` responda con esa versión.
5. **Seguridad:** escaneo base de OWASP ZAP sobre la URL publicada; el reporte queda como artefacto.

Todas las Actions están fijadas por su SHA completo (con la versión en un comentario) y `.github/dependabot.yml` propone sus actualizaciones cada semana. `npm ci` se ejecuta con `--ignore-scripts` para que ningún paquete pueda correr scripts de instalación.

### Configuración en GitHub

| Dónde | Tipo | Nombre | Valor |
|---|---|---|---|
| Settings → Environments → `produccion` | Secret | `RENDER_DEPLOY_HOOK` | Deploy Hook del servicio en Render |
| Settings → Environments → `produccion` | Variable | `APP_URL` | URL pública, por ejemplo `https://modulo-inventario.onrender.com` |
| Settings → Secrets and variables → Actions | Secret | `SONAR_TOKEN` | Token de SonarQube Cloud |
| Settings → Secrets and variables → Actions | Variable | `SONAR_ORGANIZATION` | Clave de la organización en SonarQube Cloud |
| Settings → Secrets and variables → Actions | Variable | `SONAR_PROJECT_KEY` | Clave del proyecto en SonarQube Cloud |

Los jobs de Despliegue y Seguridad usan el entorno `produccion`, por eso ahí se guardan el Deploy Hook y la URL.

## 8. Despliegue en Render (gratis)

1. Crea una cuenta en <https://render.com> entrando con GitHub.
2. **New → Blueprint**, elige este repositorio y confirma (usa `render.yaml`: plan gratuito, `JWT_SECRET` generado automáticamente y despliegue automático apagado, porque lo controla el pipeline).
3. En el servicio: **Settings → Deploy Hook**, copia la URL y guárdala en GitHub como el secret `RENDER_DEPLOY_HOOK` del entorno `produccion`.
4. Copia la URL pública del servicio y guárdala como la variable `APP_URL` del mismo entorno.
5. Haz un *push* a `main` (o *Run workflow* en Actions) y revisa que las 5 etapas terminen en verde.

> En el plan gratuito el disco no es permanente: al reiniciar o desplegar, la base vuelve a los datos de ejemplo. Para uso real se necesita un disco persistente o una base administrada.

## 9. SonarQube Cloud (gratis)

1. Entra a <https://sonarcloud.io> con tu cuenta de GitHub e importa la organización y el repositorio.
2. En el proyecto: **Administration → Analysis Method** → desactiva *Automatic Analysis* (el análisis lo hace el pipeline).
3. Genera un token en **My Account → Security** y guárdalo en GitHub como `SONAR_TOKEN`.
4. Guarda la clave de la organización y del proyecto como las variables `SONAR_ORGANIZATION` y `SONAR_PROJECT_KEY`.
5. Ejecuta el pipeline; el panel mostrará bugs, vulnerabilidades, code smells, deuda técnica, cobertura y duplicación.

`sonar-project.properties` define qué se analiza (`src`, `public`, `scripts` y los workflows de `.github`) y excluye `docs/evidencias/`, porque ahí solo hay reportes y capturas generados por otras herramientas (por ejemplo, los HTML de ZAP). Si se deja el *Automatic Analysis* encendido, SonarQube Cloud no lee ese archivo sino `.sonarcloud.properties`, que tiene las mismas exclusiones; en ese modo no se importa la cobertura.

## 10. OWASP ZAP

- **Pipeline:** escaneo base (pasivo) de la URL publicada con las reglas de `.zap/rules.tsv`.
- **Escaneo completo local:** con ZAP instalado y el servidor corriendo, ejecuta el plan `.zap/automation.yaml` (importa `docs/openapi.yaml`, recorre la página y hace el escaneo activo con un token de Administrador). Las instrucciones están al inicio del archivo.

## 11. Estructura

```
src/
  app.js                 rutas, archivos públicos y manejo de errores
  server.js              arranque del servidor
  config.js              variables de entorno
  router.js · http.js    enrutador mínimo y lectura/respuesta JSON
  db/database.js         conexión SQLite, esquema, datos y transacciones
  middleware/            auth.js (JWT y roles), limitador.js, seguridad.js (encabezados)
  routes/                auth.routes.js, inventario.routes.js
  services/              auth.service.js, inventario.service.js, calculos.js (reglas puras)
  utils/                 jwt.js, password.js, validators.js, errores.js, fechas.js
public/                  página web (HTML, CSS y JavaScript sin librerías)
database/                schema.sql, seed.sql, consultas.sql
tests/                   pruebas unitarias y de API (node:test)
docs/openapi.yaml        especificación de la API
scripts/                 build.js (build) y prueba-carga.js (prueba de carga)
.github/workflows/       pipeline CI/CD
.zap/                    reglas y plan de OWASP ZAP
render.yaml              configuración de Render
sonar-project.properties configuración de SonarQube
```
