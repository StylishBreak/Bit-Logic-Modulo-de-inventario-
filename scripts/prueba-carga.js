'use strict';

/**
 * Prueba de carga básica (sin dependencias): N usuarios concurrentes consultan el módulo
 * durante S segundos y se reportan los tiempos de respuesta.
 *
 * Uso:
 *   CORREO=responsable.a@comedores.test CLAVE='ComedorA#2026' npm run carga
 * Variables opcionales: BASE_URL (http://localhost:3000), USUARIOS (50), SEGUNDOS (20)
 */
const http = require('node:http');
const https = require('node:https');

const BASE = new URL(process.env.BASE_URL || 'http://localhost:3000');
const USUARIOS = Number(process.env.USUARIOS || 50);
const SEGUNDOS = Number(process.env.SEGUNDOS || 20);
const LIMITE_CONSULTA_MS = 1500; // requisito del primer avance: consultas a la BD en menos de 1.5 s
const LIMITE_PAGINA_MS = 3000; // requisito del primer avance: el tablero carga en menos de 3 s

const cliente = BASE.protocol === 'https:' ? https : http;
const agente = new cliente.Agent({ keepAlive: true, maxSockets: USUARIOS });

function pedir(metodo, ruta, { token, cuerpo } = {}) {
  return new Promise((resolve) => {
    const inicio = process.hrtime.bigint();
    const datos = cuerpo ? JSON.stringify(cuerpo) : undefined;
    const encabezados = {};
    if (token) encabezados.Authorization = `Bearer ${token}`;
    if (datos) encabezados['Content-Type'] = 'application/json';
    const milisegundos = () => Number(process.hrtime.bigint() - inicio) / 1e6;
    const peticion = cliente.request(new URL(ruta, BASE), { method: metodo, agent: agente, headers: encabezados }, (res) => {
      const partes = [];
      res.on('data', (parte) => partes.push(parte));
      res.on('end', () => resolve({ estado: res.statusCode, ms: milisegundos(), cuerpo: Buffer.concat(partes).toString() }));
    });
    peticion.on('error', () => resolve({ estado: 0, ms: milisegundos(), cuerpo: '' }));
    if (datos) peticion.write(datos);
    peticion.end();
  });
}

function percentil(valores, p) {
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.max(0, Math.ceil((p / 100) * orden.length) - 1)];
}

const formato = (valor) => valor.toFixed(1).padStart(9);

async function main() {
  if (!process.env.CORREO || !process.env.CLAVE) {
    console.error('Indica las credenciales con las variables CORREO y CLAVE (ver el README).');
    process.exit(1);
  }
  const login = await pedir('POST', '/api/auth/login', { cuerpo: { correo: process.env.CORREO, password: process.env.CLAVE } });
  if (login.estado !== 200) {
    console.error(`No se pudo iniciar sesión (HTTP ${login.estado}): ${login.cuerpo}`);
    process.exit(1);
  }
  const { token, usuario } = JSON.parse(login.cuerpo);
  const comedor = usuario.comedorId || 1;
  const rutas = [`/api/comedores/${comedor}/inventario`, `/api/comedores/${comedor}/movimientos`, '/'];
  const tiempos = new Map(rutas.map((ruta) => [ruta, []]));
  let errores = 0;
  const fin = Date.now() + SEGUNDOS * 1000;

  async function usuarioVirtual(numero) {
    let i = numero;
    while (Date.now() < fin) {
      const ruta = rutas[i % rutas.length];
      i += 1;
      const respuesta = await pedir('GET', ruta, { token });
      if (respuesta.estado !== 200) errores += 1;
      tiempos.get(ruta).push(respuesta.ms);
    }
  }

  console.log(`Prueba de carga · ${USUARIOS} usuarios concurrentes · ${SEGUNDOS} s · ${BASE.origin}`);
  await Promise.all(Array.from({ length: USUARIOS }, (_, n) => usuarioVirtual(n)));
  agente.destroy();

  console.log('');
  console.log('Ruta                              Peticiones  Prom. (ms)   p95 (ms)   p99 (ms)   Máx. (ms)');
  let total = 0;
  let peorConsulta = 0;
  let peorPagina = 0;
  for (const [ruta, valores] of tiempos) {
    total += valores.length;
    const promedio = valores.reduce((a, b) => a + b, 0) / valores.length;
    const p95 = percentil(valores, 95);
    if (ruta === '/') peorPagina = Math.max(peorPagina, p95);
    else peorConsulta = Math.max(peorConsulta, p95);
    console.log(
      `${ruta.padEnd(32)} ${String(valores.length).padStart(10)} ${formato(promedio)}  ${formato(p95)}  ${formato(percentil(valores, 99))}  ${formato(Math.max(...valores))}`
    );
  }
  console.log('');
  console.log(`Total: ${total} peticiones (${(total / SEGUNDOS).toFixed(0)} por segundo) · respuestas con error: ${errores}`);
  const cumple = peorConsulta < LIMITE_CONSULTA_MS && peorPagina < LIMITE_PAGINA_MS && errores === 0;
  console.log(
    `Requisito del avance (consultas < ${LIMITE_CONSULTA_MS} ms y página < ${LIMITE_PAGINA_MS} ms en el p95): ` +
      `${cumple ? 'CUMPLE' : 'NO CUMPLE'} (consultas ${peorConsulta.toFixed(1)} ms, página ${peorPagina.toFixed(1)} ms)`
  );
  process.exitCode = cumple ? 0 : 1;
}

main();
