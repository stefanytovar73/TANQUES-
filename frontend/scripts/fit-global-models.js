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
(async () => {
  const apiTanques = await fetchApiTanques();
  const catalog = loadCatalog();
  const merged = mergeApiTanquesWithCatalog(apiTanques, catalog);

  const data = [];
  for (const [name, ref] of Object.entries(IBAL_REFERENCE)) {
    const t = merged.find((x) => (x.display_name || x.nombre || '').toLowerCase() === name.toLowerCase());
    if (!t) continue;
    const v = Number.isFinite(Number(t.valor_m)) ? Number(t.valor_m) : null;
    const ib = Number.isFinite(Number(ref.ibal)) ? Number(ref.ibal) : null;
    if (v == null || ib == null) continue;
    data.push({ name, v, ib });
  }

  // Model 1: proportional k * v
  let num = 0, den = 0;
  for (const d of data) { num += d.v * d.ib; den += d.v * d.v; }
  const k = den !== 0 ? num / den : null;

  // Model 2: linear ib = a * v + b
  const n = data.length;
  const sumx = data.reduce((s,d)=>s+d.v,0);
  const sumy = data.reduce((s,d)=>s+d.ib,0);
  const sumxx = data.reduce((s,d)=>s+d.v*d.v,0);
  const sumxy = data.reduce((s,d)=>s+d.v*d.ib,0);
  const denom = n*sumxx - sumx*sumx;
  const a = denom !== 0 ? (n*sumxy - sumx*sumy)/denom : null;
  const b = denom !== 0 ? (sumy*sumxx - sumx*sumxy)/denom : null;

  const evalModel = (fn) => {
    let se = 0; let count = 0;
    for (const d of data) {
      const pred = fn(d.v);
      if (pred == null) continue;
      se += Math.pow(pred - d.ib, 2);
      count += 1;
    }
    const rmse = count ? Math.sqrt(se / count) : null;
    return { rmse };
  };

  const model1 = evalModel((v) => k * v);
  const model2 = evalModel((v) => a * v + b);

  console.log('n data points:', data.length);
  console.log('k (proportional):', k);
  console.log('a,b (linear):', a, b);
  console.log('RMSE proportional:', model1.rmse);
  console.log('RMSE linear:', model2.rmse);

  console.log('\nPer-tank predictions:');
  for (const d of data) {
    const p1 = k * d.v;
    const p2 = a * d.v + b;
    console.log(`${d.name} | valor_m: ${d.v} | IBAL: ${d.ib} | prop: ${Math.round(p1)} | lin: ${Math.round(p2)}`);
  }
})();
