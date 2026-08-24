import axios from 'axios';
import { calculateDisplayPorcentajeFromValues, loadCatalog, mergeApiTanquesWithCatalog } from '../src/config/tankCatalog.js';

const API_URL = process.env.VITE_API_URL || 'http://127.0.0.1:8001/api';
const TARGETS = ['Alsacia','Ambala 1','Ambala 2','La Aurora','Picaleña 1'];

const fetchTanques = async () => {
  const url = `${API_URL.replace(/\/+$/, '')}/tanques`;
  const resp = await axios.get(url);
  return resp?.data?.tanques ?? resp?.data ?? [];
};

(async () => {
  try {
    const apiTanques = await fetchTanques();
    console.log('Simulación dinámica de porcentajes usando altura_rebose (API)');
    for (const name of TARGETS) {
      const t = apiTanques.find(x => (x.display_name || x.nombre || '').toLowerCase() === name.toLowerCase());
      if (!t) {
        console.log('No encontrado:', name);
        continue;
      }
      const valor_m = Number.isFinite(Number(t.valor_m)) ? Number(t.valor_m) : null;
      const altura = Number.isFinite(Number(t.altura_rebose)) ? Number(t.altura_rebose) : null;
      const pct = calculateDisplayPorcentajeFromValues(valor_m, altura);
      console.log('-------------------------------------------');
      console.log('Tanque:', name);
      console.log('  valor_m:', valor_m);
      console.log('  altura_rebose (denominador):', altura);
      console.log('  porcentaje calculado:', pct != null ? pct.toFixed(6) : 'N/A', '->', pct != null ? Math.round(pct) + '%' : 'N/A');
      // simulate +/-0.1
      for (const delta of [-0.1, 0.1]) {
        const newNivel = valor_m != null ? Math.max(0, valor_m + delta) : null;
        const newPct = calculateDisplayPorcentajeFromValues(newNivel, altura);
        console.log(`  Nivel ${delta>=0?'+':''}${delta}: ${newNivel} -> ${newPct != null ? Math.round(newPct) + '%' : 'N/A'}`);
      }
    }
  } catch (err) {
    console.error('Error en simulación:', err.message || err);
    process.exit(2);
  }
})();
