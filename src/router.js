'use strict';

/**
 * Enrutador mínimo: relaciona método + ruta (con parámetros como :id)
 * con la función que atiende la petición.
 */
class Enrutador {
  constructor() {
    this.rutas = [];
  }

  registrar(metodo, patron, opciones, manejador) {
    const nombres = [];
    const expresion = patron.replace(/:(\w+)/g, (_, nombre) => {
      nombres.push(nombre);
      return '([^/]+)';
    });
    this.rutas.push({ metodo, patron, regex: new RegExp(`^${expresion}$`), nombres, opciones, manejador });
  }

  get(patron, opciones, manejador) {
    this.registrar('GET', patron, opciones, manejador);
  }

  post(patron, opciones, manejador) {
    this.registrar('POST', patron, opciones, manejador);
  }

  put(patron, opciones, manejador) {
    this.registrar('PUT', patron, opciones, manejador);
  }

  delete(patron, opciones, manejador) {
    this.registrar('DELETE', patron, opciones, manejador);
  }

  /**
   * Devuelve { ruta, params } si hay coincidencia, { permitidos } si la ruta existe
   * con otro método (405) o null si no existe (404).
   */
  buscar(metodo, ruta) {
    const permitidos = [];
    for (const definicion of this.rutas) {
      const coincidencia = definicion.regex.exec(ruta);
      if (!coincidencia) continue;
      if (definicion.metodo !== metodo) {
        permitidos.push(definicion.metodo);
        continue;
      }
      const params = {};
      definicion.nombres.forEach((nombre, i) => {
        params[nombre] = decodeURIComponent(coincidencia[i + 1]);
      });
      return { ruta: definicion, params };
    }
    return permitidos.length > 0 ? { permitidos } : null;
  }
}

module.exports = { Enrutador };
