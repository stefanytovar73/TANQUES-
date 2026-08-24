import axios from 'axios';
import { loadCatalog, mergeApiTanquesWithCatalog } from '../src/config/tankCatalog.js';
const API_URL = process.env.VITE_API_URL || 'http://127.0.0.1:8001/api';
const IBAL_REFERENCE = {
  Alsacia: { ibal: 35 },
  'Ambala 1': { ibal: 68 },
  'Ambala 2': { ibal: 65 },
  'La Aurora': { ibal: 80 },
  'Belén': { ibal: 86 },
  Calucaima: { ibal: 83 },
  'Cerro Gordo 1': { ibal: 68 },
  'Cerro Gordo 2': { ibal: 52 },
  Ciudad: { ibal: 74 },
  'Zona Industrial': { ibal: 15 },
  Interlaken: { ibal: 48 },
  'La 15': { ibal: 57 },
  'La 29': { ibal: 49 },
  'La 30': { ibal: 28 },
  Miramar: { ibal: 64 },
  Mirolindo: { ibal: 94 },
  'Picaleña 1': { ibal: 75 },
  'Picaleña 2': { ibal: 58 },
  'Piedra Pintada 1': { ibal: 57 },
  'Piedra Pintada 2': { ibal: 72 },
};
const fetchApiTanques = async () => {
  const url = `${API_URL.replace(/\/+$/, '')}/tanques`;
  const resp = await axios.get(url);
  if (resp?.data?.tanques) return resp.data.tanques;
  if (Array.isArray(resp?.data)) return resp.data;
  return [];
};
const fmt = (v) => (v == null ? 'N/A' : Number.isFinite(Number(v)) ? Number(Number(v).toFixed(4)) : 'N/A');
(async () => {
  const apiTanques = await fetchApiTanques();
  const catalog = loadCatalog();
  const merged = mergeApiTanquesWithCatalog(apiTanques, catalog);
  console.log('Tanque | valor_m | IBAL% | D_implícito | altura_rebose | ratio D/altura_rebose | altura_maxima | ratio D/altura_maxima');
  for (const [name, ref] of Object.entries(IBAL_REFERENCE)) {
    const t = merged.find((x) => (x.display_name || x.nombre || '').toLowerCase() === name.toLowerCase());
    if (!t) { console.log(`${name} | MISSING`); continue; }
    const v = Number.isFinite(Number(t.valor_m)) ? Number(t.valor_m) : null;
    const ib = Number.isFinite(Number(ref.ibal)) ? Number(ref.ibal) : null;
    if (v == null || ib == null || ib === 0) { console.log(`${name} | insufficient`); continue; }
    const D = v / (ib / 100);
    const ar = Number.isFinite(Number(t.altura_rebose)) ? Number(t.altura_rebose) : null;
    const am = Number.isFinite(Number(t.altura_maxima ?? t.altura_total)) ? Number(t.altura_maxima ?? t.altura_total) : null;
    const r1 = ar != null ? D / ar : null;
    const r2 = am != null ? D / am : null;
    console.log(`${name} | ${fmt(v)} | ${ib} | ${fmt(D)} | ${fmt(ar)} | ${fmt(r1)} | ${fmt(am)} | ${fmt(r2)}`);
  }
})();
