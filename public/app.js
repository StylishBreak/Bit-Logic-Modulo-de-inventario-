'use strict';

/*
 * Página de prueba del Módulo de Inventario.
 * El contenido se inserta siempre con textContent (nunca innerHTML) para evitar XSS.
 * El token se guarda solo en memoria: al recargar la página hay que iniciar sesión de nuevo.
 */
(function () {
  const estado = { token: null, usuario: null, comedorId: null, productos: [] };
  const $ = (id) => document.getElementById(id);

  // ---------- utilidades de interfaz ----------
  function crear(etiqueta, opciones = {}, hijos = []) {
    const elemento = document.createElement(etiqueta);
    if (opciones.clase) elemento.className = opciones.clase;
    if (opciones.texto !== undefined) elemento.textContent = String(opciones.texto);
    for (const hijo of hijos) elemento.appendChild(hijo);
    return elemento;
  }

  function celda(texto, clase) {
    return crear('td', { texto, clase });
  }

  function vaciar(elemento) {
    while (elemento.firstChild) elemento.removeChild(elemento.firstChild);
  }

  function mostrar(elemento, visible) {
    elemento.classList.toggle('oculto', !visible);
  }

  function aJson(valor) {
    return JSON.stringify(valor, null, 2);
  }

  // ---------- comunicación con la API ----------
  function mostrarRespuesta(metodo, ruta, codigo, datos) {
    $('resp-peticion').textContent = `${metodo} ${ruta}`;
    const etiqueta = $('resp-estado');
    etiqueta.textContent = `HTTP ${codigo}`;
    etiqueta.className = `estado ${codigo < 400 ? 'ok' : 'error'}`;
    $('resp-cuerpo').textContent = aJson(datos);
  }

  async function api(metodo, ruta, cuerpo, { sinToken = false, silencioso = false } = {}) {
    const encabezados = {};
    if (cuerpo !== undefined) encabezados['Content-Type'] = 'application/json';
    if (estado.token && !sinToken) encabezados.Authorization = `Bearer ${estado.token}`;
    const respuesta = await fetch(ruta, {
      method: metodo,
      headers: encabezados,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!silencioso) mostrarRespuesta(metodo, ruta, respuesta.status, datos);
    return { codigo: respuesta.status, datos };
  }

  // ---------- JWT ----------
  function decodificarParte(parte) {
    const base64 = parte.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function fechaLocal(segundos) {
    return new Date(segundos * 1000).toLocaleString('es-MX');
  }

  function mostrarToken() {
    const [encabezado, carga] = estado.token.split('.');
    const datos = decodificarParte(carga);
    $('jwt-token').textContent = estado.token;
    $('jwt-encabezado').textContent = aJson(decodificarParte(encabezado));
    $('jwt-carga').textContent = aJson(datos);
    const lista = $('jwt-fechas');
    vaciar(lista);
    const minutos = Math.max(0, Math.round((datos.exp * 1000 - Date.now()) / 60000));
    for (const [termino, valor] of [
      ['Emitido (iat)', fechaLocal(datos.iat)],
      ['Expira (exp)', fechaLocal(datos.exp)],
      ['Vigencia restante', `${minutos} min`],
    ]) {
      lista.appendChild(crear('dt', { texto: termino }));
      lista.appendChild(crear('dd', { texto: valor }));
    }
    mostrar($('panel-jwt'), true);
    $('panel-jwt').open = true;
  }

  // ---------- sesión ----------
  async function iniciarSesion(evento) {
    evento.preventDefault();
    // Mientras se verifica la contraseña el botón se desactiva, para no mandar intentos repetidos
    const boton = $('boton-entrar');
    if (boton.disabled) return;
    boton.disabled = true;
    boton.textContent = 'Verificando…';
    let respuesta;
    try {
      respuesta = await api('POST', '/api/auth/login', {
        correo: $('login-correo').value,
        password: $('login-password').value,
      });
    } finally {
      boton.disabled = false;
      boton.textContent = 'Entrar';
    }
    const { codigo, datos } = respuesta;
    if (codigo !== 200) return;
    estado.token = datos.token;
    estado.usuario = datos.usuario;
    estado.comedorId = datos.usuario.comedorId || 1;
    $('login-password').value = '';
    await entrar();
  }

  async function entrar() {
    const esAdmin = estado.usuario.rol === 'Administrador';
    $('sesion-nombre').textContent = estado.usuario.nombre;
    $('sesion-rol').textContent = estado.usuario.rol;
    $('sesion-rol').className = `insignia ${esAdmin ? 'admin' : 'usuario'}`;
    document.body.classList.toggle('es-admin', esAdmin);
    mostrar($('sesion-actual'), true);
    mostrar($('vista-login'), false);
    mostrar($('vista-inventario'), true);
    mostrarToken();
    llenarComedores();
    // Se conserva en pantalla la respuesta del inicio de sesión
    await cargarInventario({ silencioso: true });
  }

  function salir() {
    estado.token = null;
    estado.usuario = null;
    // No se deja información de la sesión anterior en los formularios
    document.querySelectorAll('form').forEach((formulario) => formulario.reset());
    document.body.classList.remove('es-admin');
    mostrar($('sesion-actual'), false);
    mostrar($('vista-login'), true);
    mostrar($('vista-inventario'), false);
    mostrar($('panel-jwt'), false);
    mostrar($('seccion-general'), false);
  }

  function llenarComedores() {
    const selector = $('sel-comedor');
    vaciar(selector);
    const opciones = estado.usuario.rol === 'Administrador' ? [1, 2] : [estado.usuario.comedorId];
    for (const id of opciones) {
      const opcion = crear('option', { texto: `Comedor ${id === 1 ? 'A' : 'B'} (id ${id})` });
      opcion.value = String(id);
      selector.appendChild(opcion);
    }
    selector.value = String(estado.comedorId);
    selector.disabled = opciones.length === 1;
  }

  // ---------- inventario ----------
  function tarjetaSemaforo(almacen) {
    const barra = crear('div', { clase: 'barra-progreso' }, [
      crear('div', { clase: `relleno ${almacen.semaforo} p${Math.min(100, Math.round(almacen.porcentaje / 5) * 5)}` }),
    ]);
    return crear('div', { clase: `semaforo ${almacen.semaforo}` }, [
      crear('div', { clase: 'semaforo-titulo', texto: almacen.tipo }),
      crear('div', { clase: 'semaforo-valor', texto: `${almacen.porcentaje} %` }),
      barra,
      crear('div', { clase: 'semaforo-detalle', texto: `${almacen.ocupado} de ${almacen.capacidad} · libre ${almacen.disponible}` }),
      crear('span', { clase: `luz ${almacen.semaforo}`, texto: almacen.semaforo }),
    ]);
  }

  function filaProducto(p) {
    const caducidad = crear('td', { texto: p.caducidad });
    if (p.estadoCaducidad === 'por_caducar') {
      caducidad.appendChild(crear('span', { clase: 'aviso', texto: `Por caducar (${p.diasParaCaducar} d)` }));
    }
    const acciones = crear('td', { clase: 'solo-admin' });
    const boton = crear('button', { clase: 'boton peligro pequeno', texto: 'Eliminar' });
    boton.type = 'button';
    boton.addEventListener('click', () => eliminarProducto(p.id));
    acciones.appendChild(boton);
    return crear('tr', {}, [
      celda(p.id),
      celda(p.nombre),
      celda(p.categoria),
      celda(p.almacenamiento),
      celda(`${p.stock} / ${p.stockMaximo} ${p.unidad}`),
      celda(p.lote),
      caducidad,
      acciones,
    ]);
  }

  function pintarInventario(datos) {
    $('titulo-comedor').textContent = `Inventario · ${datos.comedor.nombre}`;
    const semaforos = $('semaforos');
    vaciar(semaforos);
    datos.almacenamiento.forEach((a) => semaforos.appendChild(tarjetaSemaforo(a)));

    const alertas = $('alertas');
    vaciar(alertas);
    datos.alertas.forEach((a) => alertas.appendChild(crear('li', { clase: a.tipo, texto: a.mensaje })));

    const cuerpo = $('tabla-productos').querySelector('tbody');
    vaciar(cuerpo);
    datos.productos.forEach((p) => cuerpo.appendChild(filaProducto(p)));

    estado.productos = datos.productos;
    const selector = $('mov-producto');
    const seleccionado = selector.value;
    vaciar(selector);
    for (const p of datos.productos) {
      const opcion = crear('option', { texto: `${p.nombre} · lote ${p.lote} (${p.stock} ${p.unidad})` });
      opcion.value = String(p.id);
      selector.appendChild(opcion);
    }
    if (datos.productos.some((p) => String(p.id) === seleccionado)) selector.value = seleccionado;
  }

  function pintarMovimientos(datos) {
    const cuerpo = $('tabla-movimientos').querySelector('tbody');
    vaciar(cuerpo);
    for (const m of datos.movimientos) {
      cuerpo.appendChild(
        crear('tr', {}, [
          celda(m.id),
          celda(new Date(m.fecha).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23' })),
          celda(m.tipo, `tipo ${m.tipo}`),
          celda(m.producto),
          celda(`${m.cantidad} ${m.unidad}`),
          celda(m.cantidadRechazada > 0 ? `${m.cantidadRechazada} ${m.unidad}` : '—'),
          celda(m.motivo || '—'),
          celda(m.usuario),
        ])
      );
    }
  }

  async function cargarInventario({ silencioso = false } = {}) {
    const ruta = `/api/comedores/${estado.comedorId}`;
    const movimientos = await api('GET', `${ruta}/movimientos`, undefined, { silencioso: true });
    if (movimientos.codigo === 200) pintarMovimientos(movimientos.datos);
    const inventario = await api('GET', `${ruta}/inventario`, undefined, { silencioso });
    if (inventario.codigo === 200) pintarInventario(inventario.datos);
  }

  function textoOcupacion(almacen) {
    return `${almacen.porcentaje} % (${almacen.semaforo})`;
  }

  async function verInventarioGeneral() {
    const { codigo, datos } = await api('GET', '/api/inventario');
    const seccion = $('seccion-general');
    mostrar(seccion, codigo === 200);
    if (codigo !== 200) return;
    const cuerpo = $('tabla-general').querySelector('tbody');
    vaciar(cuerpo);
    for (const c of datos.comedores) {
      const [seco, refrigerado, congelado] = c.almacenamiento;
      cuerpo.appendChild(
        crear('tr', {}, [
          celda(c.nombre),
          celda(c.totalProductos),
          celda(c.productosPorCaducar),
          celda(textoOcupacion(seco), seco.semaforo),
          celda(textoOcupacion(refrigerado), refrigerado.semaforo),
          celda(textoOcupacion(congelado), congelado.semaforo),
        ])
      );
    }
  }

  // ---------- formularios ----------
  function numeroOVacio(id) {
    const valor = $(id).value;
    return valor === '' ? undefined : Number(valor);
  }

  function textoOVacio(id) {
    const valor = $(id).value.trim();
    return valor === '' ? undefined : valor;
  }

  async function registrarMovimiento(evento) {
    evento.preventDefault();
    const cuerpo = {
      productoId: Number($('mov-producto').value),
      cantidad: numeroOVacio('mov-cantidad'),
      motivo: textoOVacio('mov-motivo'),
    };
    const tipo = $('mov-tipo').value;
    if (tipo === 'entradas' && $('mov-excepcion').checked) cuerpo.excepcion = true;
    const { codigo } = await api('POST', `/api/comedores/${estado.comedorId}/${tipo}`, cuerpo);
    if (codigo === 201) await refrescarConservandoRespuesta();
  }

  async function crearProducto(evento) {
    evento.preventDefault();
    const cuerpo = {
      nombre: textoOVacio('prod-nombre'),
      categoria: textoOVacio('prod-categoria'),
      almacenamiento: $('prod-almacenamiento').value,
      unidad: $('prod-unidad').value,
      consumoDiario: numeroOVacio('prod-consumo'),
      diasCobertura: numeroOVacio('prod-dias'),
      lote: textoOVacio('prod-lote'),
      caducidad: textoOVacio('prod-caducidad'),
    };
    const { codigo } = await api('POST', `/api/comedores/${estado.comedorId}/productos`, cuerpo);
    if (codigo === 201) await refrescarConservandoRespuesta();
  }

  async function configurarCapacidad(evento) {
    evento.preventDefault();
    const cuerpo = {};
    for (const tipo of ['seco', 'refrigerado', 'congelado']) {
      const valor = numeroOVacio(`cap-${tipo}`);
      if (valor !== undefined) cuerpo[tipo] = valor;
    }
    const { codigo } = await api('PUT', `/api/comedores/${estado.comedorId}/capacidad`, cuerpo);
    if (codigo === 200) await refrescarConservandoRespuesta();
  }

  async function eliminarProducto(productoId) {
    const { codigo } = await api('DELETE', `/api/comedores/${estado.comedorId}/productos/${productoId}`);
    if (codigo === 200) await refrescarConservandoRespuesta();
  }

  /** Recarga tablas sin reemplazar la respuesta que el usuario acaba de ver. */
  async function refrescarConservandoRespuesta() {
    const ruta = `/api/comedores/${estado.comedorId}`;
    const [inventario, movimientos] = await Promise.all([
      api('GET', `${ruta}/inventario`, undefined, { silencioso: true }),
      api('GET', `${ruta}/movimientos`, undefined, { silencioso: true }),
    ]);
    if (inventario.codigo === 200) pintarInventario(inventario.datos);
    if (movimientos.codigo === 200) pintarMovimientos(movimientos.datos);
  }

  // ---------- eventos ----------
  document.addEventListener('DOMContentLoaded', () => {
    $('form-login').addEventListener('submit', iniciarSesion);
    $('btn-salir').addEventListener('click', salir);
    $('btn-sin-token').addEventListener('click', () =>
      api('GET', '/api/comedores/1/inventario', undefined, { sinToken: true })
    );
    document.querySelectorAll('.chip').forEach((chip) =>
      chip.addEventListener('click', () => {
        $('login-correo').value = chip.dataset.correo;
        $('login-password').focus();
      })
    );
    $('sel-comedor').addEventListener('change', (e) => {
      estado.comedorId = Number(e.target.value);
      cargarInventario();
    });
    $('btn-actualizar').addEventListener('click', () => cargarInventario());
    $('btn-general').addEventListener('click', verInventarioGeneral);
    $('form-movimiento').addEventListener('submit', registrarMovimiento);
    $('form-producto').addEventListener('submit', crearProducto);
    $('form-capacidad').addEventListener('submit', configurarCapacidad);
  });
})();
