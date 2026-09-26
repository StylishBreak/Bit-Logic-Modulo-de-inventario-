const calc = require('../src/services/calculos');

describe('Reglas de cálculo del límite de recepción (unitarias)', () => {
  test('CP-21 espacio disponible = capacidad − inventario − en camino', () => {
    expect(calc.espacioDisponible(2000, 1200, 300)).toBe(500);
    expect(calc.espacioDisponible(400, 280, 70)).toBe(50);
  });

  test('el espacio disponible nunca es negativo', () => {
    expect(calc.espacioDisponible(300, 280, 70)).toBe(0);
  });

  test('CP-23 stock máximo = consumo diario × días de cobertura', () => {
    expect(calc.stockMaximo(10, 15)).toBe(150);
  });

  test.each([
    [0.5, 'verde'], [0.699, 'verde'], [0.7, 'amarillo'], [0.89, 'amarillo'], [0.9, 'rojo'], [1.2, 'rojo'],
  ])('semáforo con ocupación %p es %p', (oc, esperado) => {
    expect(calc.semaforo(oc)).toBe(esperado);
  });

  test('ocupación con capacidad 0 se considera llena', () => {
    expect(calc.ocupacion(0, 0, 0)).toBe(1);
  });

  test('CP-21 recepción completa cuando hay espacio', () => {
    expect(calc.calcularRecepcion({ cantidad: 400, espacio: 500, stockMax: 5000, stockActual: 0 }))
      .toEqual({ cantidadAceptada: 400, cantidadRedirigida: 0 });
  });

  test('CP-22 recepción parcial por falta de espacio', () => {
    expect(calc.calcularRecepcion({ cantidad: 100, espacio: 80, stockMax: 1000, stockActual: 0 }))
      .toEqual({ cantidadAceptada: 80, cantidadRedirigida: 20 });
  });

  test('CP-23 recepción parcial por límite del producto aunque haya espacio', () => {
    expect(calc.calcularRecepcion({ cantidad: 50, espacio: 1000, stockMax: 150, stockActual: 120 }))
      .toEqual({ cantidadAceptada: 30, cantidadRedirigida: 20 });
  });

  test('días para caducar', () => {
    expect(calc.diasParaCaducar('2026-01-03', new Date(2026, 0, 1))).toBe(2);
  });
});
