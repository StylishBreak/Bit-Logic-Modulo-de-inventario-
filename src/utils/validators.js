'use strict';

const { errores } = require('./errores');
const { esFechaValida } = require('./fechas');

const ALMACENAMIENTOS = ['seco', 'refrigerado', 'congelado'];
const UNIDADES = ['kg', 'l'];
const LIMITES = {
  cantidadMin: 1,
  cantidadMax: 10000,
  consumoMax: 10000,
  diasCoberturaMax: 365,
  capacidadMax: 100000,
};

// Expresiones sin cuantificadores anidados ambiguos (evitan ReDoS)
const REGEX_CORREO = /^[\w.+-]+@[\w-]+(?:\.[\w-]+)+$/;
const REGEX_TEXTO = /^[\p{L}\p{N} .,;:()#%°/_-]+$/u; // sin < > { } $ ` \ ni comillas
const REGEX_LOTE = /^[A-Za-z0-9-]+$/;
const REGEX_ID = /^\d{1,9}$/;

function estaVacio(valor) {
  return valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '');
}

function revisarCamposPermitidos(datos, permitidos, lista) {
  for (const campo of Object.keys(datos)) {
    if (!permitidos.includes(campo)) lista.push(`Campo no permitido: ${campo.slice(0, 30)}`);
  }
}

function leerTexto(datos, campo, reglas, lista) {
  const { min = 1, max, requerido = true, patron = REGEX_TEXTO, mensajePatron, mensajeRequerido } = reglas;
  const valor = datos[campo];
  if (estaVacio(valor)) {
    if (requerido) lista.push(mensajeRequerido || `El campo ${campo} es obligatorio`);
    return undefined;
  }
  if (typeof valor !== 'string') {
    lista.push(`El campo ${campo} debe ser texto`);
    return undefined;
  }
  const limpio = valor.trim();
  if (limpio.length < min || limpio.length > max) {
    lista.push(`El campo ${campo} debe tener entre ${min} y ${max} caracteres`);
    return undefined;
  }
  if (!patron.test(limpio)) {
    lista.push(mensajePatron || `El campo ${campo} contiene caracteres no permitidos`);
    return undefined;
  }
  return limpio;
}

function tieneMaximoDosDecimales(valor) {
  return Math.abs(Math.round(valor * 100) - valor * 100) < 1e-6;
}

function leerNumero(datos, campo, reglas, lista) {
  const { min, max, entero = false } = reglas;
  const valor = datos[campo];
  if (estaVacio(valor)) {
    lista.push(`El campo ${campo} es obligatorio`);
    return undefined;
  }
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    lista.push(`El campo ${campo} debe ser numérico`);
    return undefined;
  }
  if (entero && !Number.isInteger(valor)) {
    lista.push(`El campo ${campo} debe ser un número entero`);
    return undefined;
  }
  if (!entero && !tieneMaximoDosDecimales(valor)) {
    lista.push(`El campo ${campo} admite máximo 2 decimales`);
    return undefined;
  }
  if (valor < min || valor > max) {
    lista.push(`El campo ${campo} debe estar entre ${min} y ${max}`);
    return undefined;
  }
  return valor;
}

function leerOpcion(datos, campo, opciones, lista) {
  const valor = datos[campo];
  if (estaVacio(valor)) {
    lista.push(`El campo ${campo} es obligatorio`);
    return undefined;
  }
  if (!opciones.includes(valor)) {
    lista.push(`El campo ${campo} debe ser uno de: ${opciones.join(', ')}`);
    return undefined;
  }
  return valor;
}

function leerFecha(datos, campo, lista) {
  const valor = datos[campo];
  if (estaVacio(valor)) {
    lista.push(`El campo ${campo} es obligatorio`);
    return undefined;
  }
  if (!esFechaValida(valor)) {
    lista.push(`El campo ${campo} debe tener el formato AAAA-MM-DD`);
    return undefined;
  }
  return valor;
}

function leerBooleano(datos, campo, lista) {
  const valor = datos[campo];
  if (valor === undefined) return false;
  if (typeof valor !== 'boolean') {
    lista.push(`El campo ${campo} debe ser true o false`);
    return false;
  }
  return valor;
}

function terminar(lista, resultado) {
  if (lista.length > 0) throw errores.datosInvalidos(lista);
  return resultado;
}

/** POST /api/auth/login */
function validarCredenciales(datos) {
  const lista = [];
  revisarCamposPermitidos(datos, ['correo', 'password'], lista);

  let correo;
  if (estaVacio(datos.correo)) {
    lista.push('El campo correo es obligatorio');
  } else if (
    typeof datos.correo !== 'string' ||
    datos.correo.length > 100 ||
    !REGEX_CORREO.test(datos.correo.trim())
  ) {
    lista.push('El correo no tiene un formato válido');
  } else {
    correo = datos.correo.trim().toLowerCase();
  }

  let password;
  if (estaVacio(datos.password)) {
    lista.push('El campo password es obligatorio');
  } else if (typeof datos.password !== 'string' || datos.password.length > 100) {
    lista.push('La contraseña debe ser texto de máximo 100 caracteres');
  } else {
    password = datos.password;
  }

  return terminar(lista, { correo, password });
}

const CAMPOS_PRODUCTO = [
  'nombre',
  'categoria',
  'almacenamiento',
  'unidad',
  'consumoDiario',
  'diasCobertura',
  'lote',
  'caducidad',
];

/** POST /api/comedores/:id/productos */
function validarProducto(datos, fechaHoy) {
  const lista = [];
  revisarCamposPermitidos(datos, CAMPOS_PRODUCTO, lista);
  const producto = {
    nombre: leerTexto(datos, 'nombre', { min: 2, max: 60 }, lista),
    categoria: leerTexto(datos, 'categoria', { min: 2, max: 40 }, lista),
    almacenamiento: leerOpcion(datos, 'almacenamiento', ALMACENAMIENTOS, lista),
    unidad: leerOpcion(datos, 'unidad', UNIDADES, lista),
    consumoDiario: leerNumero(datos, 'consumoDiario', { min: 0.01, max: LIMITES.consumoMax }, lista),
    diasCobertura: leerNumero(
      datos,
      'diasCobertura',
      { min: 1, max: LIMITES.diasCoberturaMax, entero: true },
      lista
    ),
    lote: leerTexto(
      datos,
      'lote',
      { min: 1, max: 30, patron: REGEX_LOTE, mensajePatron: 'El lote solo admite letras, números y guiones' },
      lista
    ),
    caducidad: leerFecha(datos, 'caducidad', lista),
  };
  if (producto.caducidad && producto.caducidad <= fechaHoy) {
    lista.push('El producto ya caducó o caduca hoy; no se puede registrar');
  }
  return terminar(lista, producto);
}

/** POST /entradas, /salidas y /mermas */
function validarMovimiento(datos, tipo) {
  const lista = [];
  const permitidos = ['productoId', 'cantidad', 'motivo'];
  if (tipo === 'entrada') permitidos.push('excepcion');
  revisarCamposPermitidos(datos, permitidos, lista);

  const productoId = leerNumero(
    datos,
    'productoId',
    { min: 1, max: Number.MAX_SAFE_INTEGER, entero: true },
    lista
  );
  const cantidad = leerNumero(
    datos,
    'cantidad',
    { min: LIMITES.cantidadMin, max: LIMITES.cantidadMax },
    lista
  );
  const excepcion = tipo === 'entrada' ? leerBooleano(datos, 'excepcion', lista) : false;

  let mensajeRequerido = 'El campo motivo es obligatorio';
  if (tipo === 'merma') mensajeRequerido = 'El motivo de la merma es obligatorio';
  if (excepcion) mensajeRequerido = 'El motivo es obligatorio para autorizar una excepción';
  const motivo = leerTexto(
    datos,
    'motivo',
    { min: 5, max: 200, requerido: tipo === 'merma' || excepcion, mensajeRequerido },
    lista
  );

  return terminar(lista, { productoId, cantidad, excepcion, motivo: motivo ?? null });
}

/** PUT /api/comedores/:id/capacidad */
function validarCapacidad(datos) {
  const lista = [];
  revisarCamposPermitidos(datos, ALMACENAMIENTOS, lista);
  const cambios = {};
  for (const tipo of ALMACENAMIENTOS) {
    if (datos[tipo] !== undefined) {
      const valor = leerNumero(datos, tipo, { min: 0, max: LIMITES.capacidadMax }, lista);
      if (valor !== undefined) cambios[tipo] = valor;
    }
  }
  if (Object.keys(datos).length === 0) {
    lista.push('Indica al menos un almacenamiento: seco, refrigerado o congelado');
  }
  return terminar(lista, cambios);
}

/** Parámetros de la URL como :id */
function validarId(valor, nombre) {
  if (!REGEX_ID.test(String(valor)) || Number(valor) < 1) {
    throw errores.solicitudIncorrecta(`El ${nombre} debe ser un número entero positivo`);
  }
  return Number(valor);
}

module.exports = {
  ALMACENAMIENTOS,
  UNIDADES,
  LIMITES,
  validarCredenciales,
  validarProducto,
  validarMovimiento,
  validarCapacidad,
  validarId,
};
