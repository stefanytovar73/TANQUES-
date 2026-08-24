import { DEFAULT_CATALOG, findCatalogEntry, updateCatalogEntry, normalizeText } from './src/config/tankCatalog.js';

const testNames = [
  { input: { nombre: 'La 2', display_name: 'La 2', tag: 'La 2' }, expectedId: 'tanque 2' },
  { input: { nombre: 'Tanque La 2', display_name: 'Tanque La 2', tag: 'Tanque La 2' }, expectedId: 'tanque 2' },
  { input: { nombre: 'La 29', display_name: 'La 29', tag: 'La 29' }, expectedId: 'tanque la 29' },
  { input: { nombre: 'Tanque La 29', display_name: 'Tanque La 29', tag: 'Tanque La 29' }, expectedId: 'tanque la 29' },
  { input: { nombre: 'La 30', display_name: 'La 30', tag: 'La 30' }, expectedId: 'tanque la 30' },
  { input: { nombre: 'Tanque La 30', display_name: 'Tanque La 30', tag: 'Tanque La 30' }, expectedId: 'tanque la 30' },
  { input: { nombre: 'La 15', display_name: 'La 15', tag: 'La 15' }, expectedId: 'tanque la 15' },
  { input: { nombre: 'Tanque La 15', display_name: 'Tanque La 15', tag: 'Tanque La 15' }, expectedId: 'tanque la 15' },
  { input: { nombre: 'La Aurora', display_name: 'La Aurora', tag: 'La Aurora' }, expectedId: 'la aurora' },
  { input: { nombre: 'Calucaima', display_name: 'Calucaima', tag: 'Calucaima' }, expectedId: 'calucaima' },
  { input: { nombre: 'Miramar', display_name: 'Miramar', tag: 'Miramar' }, expectedId: 'miramar' },
  { input: { nombre: 'Picaleña 1', display_name: 'Picaleña 1', tag: 'Picaleña 1' }, expectedId: 'picalena 1' },
  { input: { nombre: 'Picaleña 2', display_name: 'Picaleña 2', tag: 'Picaleña 2' }, expectedId: 'picalena 2' },
  { input: { nombre: 'Interlaken', display_name: 'Interlaken', tag: 'Interlaken' }, expectedId: 'interlaken' },
  { input: { nombre: 'Ambala 1', display_name: 'Ambala 1', tag: 'Ambala 1' }, expectedId: 'ambala 1' },
];

const wait = (message) => console.log(`\n=== ${message} ===`);

wait('IDENTIFICATION TESTS');
for (const test of testNames) {
  const found = findCatalogEntry(test.input, DEFAULT_CATALOG);
  const pass = found?.id === test.expectedId;
  console.log(`INPUT: ${test.input.display_name}`);
  console.log(`  FOUND: ${found?.display_name ?? 'null'} (${found?.id ?? 'null'})`);
  console.log(`  PASS: ${pass}`);
  if (!pass) process.exitCode = 1;
}

// verify numeric titles do not collide
const collisionTests = [
  { a: { nombre: 'La 2', display_name: 'La 2', tag: 'La 2' }, b: { nombre: 'La 29', display_name: 'La 29', tag: 'La 29' } },
  { a: { nombre: 'La 29', display_name: 'La 29', tag: 'La 29' }, b: { nombre: 'La 30', display_name: 'La 30', tag: 'La 30' } },
  { a: { nombre: 'Picaleña 1', display_name: 'Picaleña 1', tag: 'Picaleña 1' }, b: { nombre: 'Picaleña 2', display_name: 'Picaleña 2', tag: 'Picaleña 2' } },
];

wait('NUMERIC COLLISION TESTS');
for (const { a, b } of collisionTests) {
  const foundA = findCatalogEntry(a, DEFAULT_CATALOG);
  const foundB = findCatalogEntry(b, DEFAULT_CATALOG);
  console.log(`A: ${a.display_name} => ${foundA?.id}`);
  console.log(`B: ${b.display_name} => ${foundB?.id}`);
  console.log(`  DISTINCT: ${foundA?.id && foundB?.id && foundA.id !== foundB.id}`);
  if (!(foundA?.id && foundB?.id && foundA.id !== foundB.id)) process.exitCode = 1;
}

wait('CATALOG ALIASES SANITY');
for (const entry of DEFAULT_CATALOG) {
  if (!entry.aliases || entry.aliases.length === 0) continue;
  const alias = entry.aliases[0];
  const found = findCatalogEntry({ nombre: alias, display_name: alias, tag: alias }, DEFAULT_CATALOG);
  const pass = found?.id === entry.id;
  if (!pass) {
    console.log(`ALIAS MISMATCH for ${entry.id}: alias=${alias} found=${found?.id}`);
    process.exitCode = 1;
  }
}
console.log('ALIASES OK');

wait('PERSISTENCE TEST');
const refTank = { nombre: 'Tanque La 29', display_name: 'Tanque La 29', tag: 'Tanque La 29' };
const found = findCatalogEntry(refTank, DEFAULT_CATALOG);
const updated = updateCatalogEntry(DEFAULT_CATALOG, found.id, {
  area_m2: 999,
  altura_rebose: 12.34,
  altura_total: 15.67,
  volumen: 888,
  largo: 22,
  ancho: 11,
  compartimientos: 3,
  cota_entrada: 1.1,
  cota_salida: 2.2,
  cota_fondo: 3.3,
  cota_rebose: 4.4,
  capacidad_actual_m3: 150,
  capacidad_maxima_m3: 555,
  volumen_restante_m3: 30,
  nivel_maximo: 2.5,
});
const after = findCatalogEntry(refTank, updated);
console.log('UPDATED FOUND', after?.display_name, after?.id);
console.log('  area_m2', after?.area_m2);
console.log('  altura_rebose', after?.altura_rebose);
console.log('  capacidad_actual_m3', after?.capacidad_actual_m3);
console.log('  volumen_restante_m3', after?.volumen_restante_m3);
console.log('  PASS AREA', after?.area_m2 === 999);
console.log('  PASS ALTURA_REBOSE', after?.altura_rebose === 12.34);
console.log('  PASS CAP_ACTUAL', after?.capacidad_actual_m3 === 150);
console.log('  PASS VOLUMEN_REST', after?.volumen_restante_m3 === 30);
console.log('  PASS NIVEL_MAXIMO', after?.nivel_maximo === 2.5);
