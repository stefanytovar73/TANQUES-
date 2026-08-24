import axios from 'axios';
import { loadCatalog, mergeApiTanquesWithCatalog, calculateAutomaticPorcentaje } from '../src/config/tankCatalog.js';

const API_URL = process.env.VITE_API_URL || 'http://127.0.0.1:8001/api';

const proposals = {
  'La Aurora': 3.62,
  Interlaken: 4.95,
  'Picaleña 1': 2.51,
  'Picaleña 2': 3.52,
  'Piedra Pintada 1': 3.76,
  'Piedra Pintada 2': 4.36,
};

const IBAL_REFERENCE = {
  'La Aurora': 80,
  Interlaken: 48,
  'Picaleña 1': 75,
  'Picaleña 2': 58,
  'Piedra Pintada 1': 57,
  'Piedra Pintada 2': 72,
};

const fetchApiTanques = async () => {
  const url = `${API_URL.replace(/\/+$/, '')}/tanques`;
  const resp = await axios.get(url);
  if (resp?.data?.tanques) return resp.data.tanques;
  if (Array.isArray(resp?.data)) return resp.data;
  return [];
};

const roundPct = (v) => (v == null ? null : Math.round(v));

(async () => {
  try {
    console.log('Verificando propuestas (sin persistir)...');
    const apiTanques = await fetchApiTanques();
    const catalog = loadCatalog();
    const merged = mergeApiTanquesWithCatalog(apiTanques, catalog);

    const results = [];

    for (const [name, alturaProp] of Object.entries(proposals)) {
      const found = merged.find((t) => (t.display_name || t.nombre || '').toLowerCase() === name.toLowerCase());
      if (!found) {
        console.log(`No encontrado en merge: ${name}`);
        results.push({ name, ok: false, reason: 'not found' });
        continue;
      }
      const nivelApi = Number.isFinite(Number(found.valor_m)) ? Number(found.valor_m) : null;
      const ibal = IBAL_REFERENCE[name];
      const porcentaje_calc_raw = calculateAutomaticPorcentaje(nivelApi, alturaProp);
      const porcentaje_calc_round = roundPct(porcentaje_calc_raw);
      const ok = porcentaje_calc_round === ibal;
      results.push({ name, nivelApi, alturaProp, porcentaje_calc_raw, porcentaje_calc_round, ibal, ok });
    }

    console.log('\nResultados de verificación:');
    for (const r of results) {
      if (r.ok) console.log(`${r.name}: OK -> nivel ${r.nivelApi} => ${r.porcentaje_calc_round}% (target ${r.ibal}%) con altura ${r.alturaProp}`);
      else console.log(`${r.name}: FAIL -> nivel ${r.nivelApi} => ${r.porcentaje_calc_round}% (target ${r.ibal}%) con altura ${r.alturaProp}`);
    }

    const allOk = results.every((r) => r.ok === true);
    console.log('\nVerificación completa. Todos OK?:', allOk);
    process.exit(allOk ? 0 : 1);
  } catch (err) {
    console.error('Error verificando propuestas:', err.message || err);
    process.exit(2);
  }
})();
