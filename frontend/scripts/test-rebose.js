import { calculateAutomaticPorcentaje, calculateDisplayPorcentaje } from '../src/config/tankCatalog.js';

const cases = [
  { name: 'Alsacia', nivel: 0.87, expected: 35 },
  { name: 'Ambala 1', nivel: 4.44, expected: 68 },
  { name: 'Ambala 2', nivel: 4.25, expected: 65 },
  { name: 'La Aurora', nivel: 3.18, expected: 80 },
  { name: 'Calucaima', nivel: 4.13, expected: 83 },
  { name: 'Cerro Gordo 1', nivel: 2.72, expected: 68 },
  { name: 'Cerro Gordo 2', nivel: 2.09, expected: 52 },
  { name: 'De Zona Industrial', nivel: 2.40, expected: 15 },
  { name: 'Interlaken', nivel: 2.46, expected: 48 },
  { name: 'La 15', nivel: 4.87, expected: 57 },
  { name: 'La 29', nivel: 1.77, expected: 49 },
  { name: 'La 30', nivel: 1.90, expected: 28 },
  { name: 'Miramar', nivel: 4.78, expected: null },
  { name: 'Picaleña 1', nivel: 2.09, expected: 75 },
  { name: 'Picaleña 2', nivel: 2.20, expected: 58 },
  { name: 'Piedra Pintada 1', nivel: 2.46, expected: 57 },
  { name: 'Piedra Pintada 2', nivel: 3.45, expected: 72 },
];

// Heights calibrated (from user) mapping
const heights = {
  'Alsacia': 2.49,
  'Ambala 1': 6.53,
  'Ambala 2': 6.54,
  'La Aurora': 3.98,
  'Calucaima': 4.98,
  'Cerro Gordo 1': 4.00,
  'Cerro Gordo 2': 4.02,
  'De Zona Industrial': 16.00,
  'Interlaken': 5.13,
  'La 15': 8.54,
  'La 29': 3.61,
  'La 30': 6.79,
  'Miramar': null,
  'Picaleña 1': 2.79,
  'Picaleña 2': 3.79,
  'Piedra Pintada 1': 4.32,
  'Piedra Pintada 2': 4.79,
};

const apiContractChecks = [
  { label: 'API percentage wins', tank: { valor_m: 4.78, porcentaje_capacidad: 42 }, expected: 42 },
  { label: 'API decimal percentage is preserved', tank: { valor_m: 1.4517, porcentaje_capacidad: 32.99, altura_rebose_m: 4.4 }, expected: 32.99 },
  { label: 'API zero is preserved', tank: { valor_m: 4.78, porcentaje_capacidad: 0 }, expected: 0 },
  { label: 'API null stays null even when a local height could calculate a value', tank: { valor_m: 4.78, porcentaje_capacidad: null, altura_rebose_m: 5 }, expected: null },
  { label: 'Miramar API value is trusted', tank: { nombre: 'Miramar', display_name: 'Miramar', tag: 'NIVEL_MIRAMAR', valor_m: 4.78, porcentaje_capacidad: 0 }, expected: 0 },
];

let failed = false;
for (const c of cases) {
  const altura = heights[c.name];
  const tank = c.name === 'Miramar'
    ? { nombre: 'Miramar', display_name: 'Miramar', tag: 'NIVEL_MIRAMAR', valor_m: c.nivel }
    : null;
  const p = tank ? calculateDisplayPorcentaje(tank) : calculateAutomaticPorcentaje(c.nivel, altura ?? 0);
  const rounded = p == null ? null : Math.round(p);
  if (rounded !== c.expected) {
    console.error(`Mismatch ${c.name}: expected ${c.expected}, got ${rounded} (raw ${p})`);
    failed = true;
  } else {
    console.log(`OK ${c.name}: ${rounded}%`);
  }
}

for (const c of apiContractChecks) {
  const p = calculateDisplayPorcentaje(c.tank);
  if (p !== c.expected) {
    console.error(`API contract mismatch for ${c.label}: expected ${c.expected}, got ${p}`);
    failed = true;
  } else {
    console.log(`OK ${c.label}: ${p}`);
  }
}

if (failed) process.exit(2);
console.log('All tests passed');
