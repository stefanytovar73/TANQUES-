import axios from 'axios';
import { loadCatalog, mergeApiTanquesWithCatalog } from '../src/config/tankCatalog.js';

const API_URL = process.env.VITE_API_URL || 'http://127.0.0.1:8001/api';

const TARGETS = {
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

const fmt = (v) => (v == null ? 'N/A' : Math.round(v * 100) / 100);

(async () => {
  const apiTanques = await fetchApiTanques();
  const catalog = loadCatalog();
  const merged = mergeApiTanquesWithCatalog(apiTanques, catalog);

  console.log('Cálculo de alturas propuestas (usando nivel API actual):');
  for (const [name, ibal] of Object.entries(TARGETS)) {
    const found = merged.find((t) => (t.display_name || t.nombre || '').toLowerCase() === name.toLowerCase());
    if (!found) {
      console.log(`${name}: MISSING`);
      continue;
    }
    const nivel = Number.isFinite(Number(found.valor_m)) ? Number(found.valor_m) : null;
    if (nivel == null) {
      console.log(`${name}: no tiene nivel`);
      continue;
    }
    const altura_propuesta = nivel / (ibal / 100);
    console.log(`${name} | nivel: ${nivel} | IBAL: ${ibal}% | altura propuesta: ${fmt(altura_propuesta)}`);
  }
})();
