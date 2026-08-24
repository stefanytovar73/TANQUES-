const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'tmp_api_tanques.json');
const raw = fs.readFileSync(file, 'utf8');
let tanques = [];
try { tanques = JSON.parse(raw); } catch (e) { console.error('No se pudo parsear tmp_api_tanques.json', e); process.exit(1); }

function calc(valor_m, altura_rebose) {
  const v = Number(valor_m);
  const a = Number(altura_rebose);
  if (!Number.isFinite(v) || !Number.isFinite(a) || a <= 0) return null;
  const p = (v / a) * 100;
  return Math.max(0, Math.min(100, p));
}

console.log('Validación matemática de porcentajes (raw -> mostrado)\n');
for (const t of tanques) {
  const nombre = t.display_name || t.nombre || t.tag || t.id;
  const valor_m = t.valor_m == null ? null : Number(t.valor_m);
  const altura = t.altura_rebose == null ? null : Number(t.altura_rebose);
  const raw = calc(valor_m, altura);
  const mostrado = raw == null ? null : Math.round(raw);
  console.log('Tanque:', nombre);
  console.log('  valor_m:', valor_m);
  console.log('  altura_rebose:', altura);
  console.log('  porcentaje calculado (raw):', raw == null ? 'null' : raw.toFixed(6));
  console.log('  porcentaje mostrado (Math.round):', mostrado == null ? 'Sin datos' : `${mostrado}%`);

  // pruebas dinámicas +0.10 / -0.10
  if (valor_m != null && altura != null) {
    const plus = calc(valor_m + 0.10, altura);
    const minus = calc(valor_m - 0.10, altura);
    console.log('  +0.10 -> raw:', plus == null ? 'null' : plus.toFixed(6), ' mostrado:', plus == null ? 'null' : Math.round(plus));
    console.log('  -0.10 -> raw:', minus == null ? 'null' : minus.toFixed(6), ' mostrado:', minus == null ? 'null' : Math.round(minus));
  }
  console.log('');
}
