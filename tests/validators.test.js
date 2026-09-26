const v = require('../src/utils/validators');

describe('Validaciones de datos (unitarias)', () => {
  test('campos obligatorios vacíos lanzan error 400 con la lista de faltantes', () => {
    try {
      v.requeridos({ nombre: ' ', lote: 'A1' }, ['nombre', 'lote', 'caducidad']);
      throw new Error('no lanzó');
    } catch (e) {
      expect(e.status).toBe(400);
      expect(e.details.faltantes).toEqual(['nombre', 'caducidad']);
    }
  });

  test.each([[0], [-5], [10001], ['diez'], [NaN]])('cantidad inválida %p es rechazada', (valor) => {
    expect(() => v.cantidadValida(valor)).toThrow();
  });

  test('cantidad válida no lanza error', () => {
    expect(() => v.cantidadValida(50)).not.toThrow();
  });

  test.each([['25/12/2026'], ['2026-13-45'], [20261225]])('fecha con formato incorrecto %p es rechazada', (f) => {
    expect(() => v.fechaValida(f)).toThrow('AAAA-MM-DD');
  });

  test('producto caducado es rechazado', () => {
    expect(() => v.noCaducado('2020-01-01', new Date(2026, 0, 1))).toThrow('caducado');
    expect(() => v.noCaducado('2026-01-01', new Date(2026, 0, 1, 10))).not.toThrow();
  });

  test('texto con caracteres peligrosos es rechazado', () => {
    expect(() => v.textoValido('<script>alert(1)</script>', 'nombre')).toThrow('formato inválido');
    expect(() => v.textoValido('Arroz blanco', 'nombre')).not.toThrow();
  });

  test('identificador inválido', () => {
    expect(() => v.idValido('abc')).toThrow('Identificador inválido');
    expect(v.idValido('3')).toBe(3);
  });
});
