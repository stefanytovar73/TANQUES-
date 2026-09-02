import fs from 'fs';
const file = 'c:/Users/Administrador/Desktop/ibal-tanques/tanques.json';
try {
  const raw = fs.readFileSync(file, 'utf8');
  const json = JSON.parse(raw);
  const tanks = Array.isArray(json.tanques) ? json.tanques : [];
  const missing = tanks.filter(t => t.valor_m == null || t.valor_m === '');
  console.log('TOTAL_TANKS:', tanks.length);
  console.log('MISSING valor_m:', missing.length);
  missing.forEach(t => console.log(t.nombre || t.display_name || t.tag || t.id, 'tag=', t.tag, 'id=', t.id));
  console.log('\nSAMPLE full list with valor_m:');
  tanks.forEach(t => console.log((t.nombre||t.display_name||t.tag||t.id), '=>', t.valor_m));
} catch (e) {
  console.error('ERROR', e.message);
}
