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

const safeNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const clamp = (v) => (v == null ? null : Math.min(100, Math.max(0, v)));

(async () => {
  const apiTanques = await fetchApiTanques();
  const catalog = loadCatalog();
  const merged = mergeApiTanquesWithCatalog(apiTanques, catalog);

  const models = {
    volumen: (t) => {
      const a = safeNum(t.capacidad_actual_m3);
      const m = safeNum(t.capacidad_maxima_m3);
      if (a == null || m == null || m === 0) return null;
      return clamp((a / m) * 100);
    },
    altura_maxima: (t) => {
      const v = safeNum(t.valor_m);
      const m = safeNum(t.altura_maxima ?? t.altura_total);
      if (v == null || m == null || m === 0) return null;
      return clamp((v / m) * 100);
    },
    altura_rebose: (t) => {
      const v = safeNum(t.valor_m);
      const m = safeNum(t.altura_rebose);
      if (v == null || m == null || m === 0) return null;
      return clamp((v / m) * 100);
    },
    minmax_norm: (t) => {
      // attempt using "altura_restante_m" to compute bottom? We'll try using altura_maxima and altura_restante.
      const v = safeNum(t.valor_m);
      const m = safeNum(t.altura_maxima ?? t.altura_total);
      const rest = safeNum(t.altura_restante_m);
      // altura_restante_m = m - v ? But API shows altura_restante_m exists.
      if (v == null || m == null) return null;
      // try: percent = (v / (m - min)) *100 ; assume min = 0 for now
      return clamp((v / m) * 100);
    },
  };

  const results = {};
  for (const [name, ref] of Object.entries(IBAL_REFERENCE)) {
    const t = merged.find((x) => (x.display_name || x.nombre || '').toLowerCase() === name.toLowerCase());
    if (!t) continue;
    results[name] = { ibal: ref.ibal, models: {} };
    for (const [key, fn] of Object.entries(models)) {
      const v = fn(t);
      results[name].models[key] = v == null ? null : Math.round(v);
    }
  }

  // Compute aggregate errors (MAE)
  const errors = {};
  for (const modelName of Object.keys(models)) {
    let sumAbs = 0;
    let count = 0;
    for (const [name, data] of Object.entries(results)) {
      const predicted = data.models[modelName];
      const ibal = data.ibal;
      if (predicted == null || ibal == null) continue;
      sumAbs += Math.abs(predicted - ibal);
      count += 1;
    }
    errors[modelName] = { mae: count ? sumAbs / count : null, count };
  }

  console.log('Resultados por tanque (predicciones redondeadas):');
  for (const [name, data] of Object.entries(results)) {
    console.log(`${name} | IBAL: ${data.ibal} | volumen: ${data.models.volumen} | altura_maxima: ${data.models.altura_maxima} | altura_rebose: ${data.models.altura_rebose}`);
  }

  console.log('\nErrores agregados (MAE):');
  console.log(errors);

})();
