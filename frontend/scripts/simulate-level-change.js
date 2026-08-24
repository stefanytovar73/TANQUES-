import { loadCatalog, mergeApiTanquesWithCatalog, calculateAutomaticPorcentaje } from '../src/config/tankCatalog.js';
import axios from 'axios';

const API_URL = process.env.VITE_API_URL || 'http://127.0.0.1:8001/api';

const fetchApiTanques = async () => {
  const url = `${API_URL.replace(/\/+$/, '')}/tanques`;
  const resp = await axios.get(url);
  if (resp?.data?.tanques) return resp.data.tanques;
  if (Array.isArray(resp?.data)) return resp.data;
  return [];
};

(async () => {
  const apiTanques = await fetchApiTanques();
  const catalog = loadCatalog();
  const merged = mergeApiTanquesWithCatalog(apiTanques, catalog);

  const targets = [
    'Alsacia',
    'Picaleña 1',
  ];

  console.log('Simulación de cambio de nivel (sin persistir):');
  for (const name of targets) {
    const t = merged.find((x) => (x.display_name || x.nombre || '').toLowerCase() === name.toLowerCase());
    if (!t) {
      console.log(`No encontrado: ${name}`);
      continue;
    }
    const originalNivel = Number.isFinite(Number(t.valor_m)) ? Number(t.valor_m) : null;
    const alturaEf = t.altura_rebose_calibrada != null ? t.altura_rebose_calibrada : t.altura_rebose;
    console.log('-------------------------------------------');
    console.log('Tanque:', name);
    console.log('  Nivel original:', originalNivel);
    console.log('  Altura efectiva:', alturaEf);
    const originalPct = calculateAutomaticPorcentaje(originalNivel, alturaEf);
    console.log('  % original (calc):', originalPct != null ? Math.round(originalPct) : 'N/A');

    for (const delta of [-0.1, 0.1]) {
      const newNivel = originalNivel != null ? Math.max(0, originalNivel + delta) : null;
      const newPct = calculateAutomaticPorcentaje(newNivel, alturaEf);
      console.log(`  Nivel simulado ${delta >=0 ? '+' : ''}${delta}: ${newNivel} -> % calc: ${newPct != null ? Math.round(newPct) : 'N/A'}`);
    }
  }
})();
