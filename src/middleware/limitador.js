'use strict';

/**
 * Limita los intentos fallidos por clave (IP o cuenta) dentro de una ventana de tiempo.
 * Se usa en el inicio de sesión para frenar ataques de fuerza bruta.
 */
class LimitadorIntentos {
  constructor({ maximo, ventanaMs }) {
    this.maximo = maximo;
    this.ventanaMs = ventanaMs;
    this.registros = new Map();
  }

  registrar(clave, ahora = Date.now()) {
    let registro = this.registros.get(clave);
    if (!registro || ahora >= registro.reinicio) {
      registro = { conteo: 0, reinicio: ahora + this.ventanaMs };
      this.registros.set(clave, registro);
    }
    registro.conteo += 1;
    if (this.registros.size > 10000) this.limpiar(ahora);

    return {
      permitido: registro.conteo <= this.maximo,
      restantes: Math.max(0, this.maximo - registro.conteo),
      reinicioSegundos: Math.ceil((registro.reinicio - ahora) / 1000),
    };
  }

  /** Revisa si la clave está bloqueada sin contar un intento nuevo. */
  consultar(clave, ahora = Date.now()) {
    const registro = this.registros.get(clave);
    if (!registro || ahora >= registro.reinicio) {
      return { permitido: true, restantes: this.maximo, reinicioSegundos: 0 };
    }
    return {
      permitido: registro.conteo < this.maximo,
      restantes: Math.max(0, this.maximo - registro.conteo),
      reinicioSegundos: Math.ceil((registro.reinicio - ahora) / 1000),
    };
  }

  /**
   * Aparta un intento antes de verificar la contraseña. Si la clave ya llegó al máximo
   * no cuenta nada. Como consultar y registrar ocurren en el mismo paso, varias peticiones
   * simultáneas no pueden pasar del máximo mientras la verificación está en curso.
   */
  reservar(clave, ahora = Date.now()) {
    const estado = this.consultar(clave, ahora);
    return estado.permitido ? this.registrar(clave, ahora) : estado;
  }

  /** Devuelve un intento apartado que al final no fue un fallo (por ejemplo, un inicio de sesión correcto). */
  liberar(clave, ahora = Date.now()) {
    const registro = this.registros.get(clave);
    if (registro && ahora < registro.reinicio && registro.conteo > 0) registro.conteo -= 1;
  }

  reiniciar(clave) {
    this.registros.delete(clave);
  }

  limpiar(ahora = Date.now()) {
    for (const [clave, registro] of this.registros) {
      if (ahora >= registro.reinicio) this.registros.delete(clave);
    }
  }
}

/**
 * IP del cliente. Detrás de un proxy (Render) se usa X-Forwarded-For si así se configura.
 * Ese encabezado lo puede alterar el cliente; por eso también se limita por cuenta.
 */
function obtenerIp(req, confiarEnProxy) {
  const reenviada = req.headers['x-forwarded-for'];
  if (confiarEnProxy && reenviada) return String(reenviada).split(',')[0].trim();
  return req.socket.remoteAddress || 'desconocida';
}

module.exports = { LimitadorIntentos, obtenerIp };
