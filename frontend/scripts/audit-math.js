import axios from 'axios';
import { loadCatalog, mergeApiTanquesWithCatalog, calculateAutomaticPorcentaje } from '../src/config/tankCatalog.js';

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

const fmt = (v, decimals = 2) => (v == null || Number.isNaN(v) ? 'N/A' : Number.isFinite(Number(v)) ? (Math.round(Number(v) * Math.pow(10, decimals)) / Math.pow(10, decimals)) : 'N/A');

const roundPct = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v)); // regla única: redondeo al entero más cercano

(async () => {
  try {
    console.log('Conectando a API en', API_URL);
    const apiTanques = await fetchApiTanques();
    console.log(`Recibidos ${apiTanques.length} tanques desde API`);

    const catalog = loadCatalog();
    const merged = mergeApiTanquesWithCatalog(apiTanques, catalog);

    console.log('\nTABLA MATEMÁTICA DE VALIDACIÓN:');
    console.log('Tanque | Nivel API | IBAL % | Altura actual | % actual | Altura propuesta | % verificado | Diferencia');

    for (const [name, ref] of Object.entries(IBAL_REFERENCE)) {
      const found = merged.find((t) => {
        const display = (t.display_name || t.nombre || '').toLowerCase();
        return display === name.toLowerCase();
      });

      if (!found) {
        console.log(`${name} | MISSING`);
        continue;
      }

      const nivelApi = Number.isFinite(Number(found.valor_m)) ? Number(found.valor_m) : null;
      const ibalPercent = ref.ibal;
      const altura_calibrada = found.altura_rebose_calibrada ?? null;
      const altura_original = found.altura_rebose ?? null;

      // altura efectiva: usamos `altura_rebose_calibrada` si existe, sino la original
      const altura_efectiva = altura_calibrada != null ? altura_calibrada : altura_original;

      let porcentaje_actual_raw = null;
      let porcentaje_actual_rounded = null;
      if (nivelApi != null && altura_efectiva != null && altura_efectiva !== 0) {
        porcentaje_actual_raw = calculateAutomaticPorcentaje(nivelApi, altura_efectiva);
        porcentaje_actual_rounded = roundPct(porcentaje_actual_raw);
      }

      // diferencia en puntos entre porcentaje mostrado (usando la regla de redondeo) y IBAL
      const diferencia = porcentaje_actual_rounded == null ? 'N/A' : Math.abs(porcentaje_actual_rounded - ibalPercent);

      // propuesta si diff > 1
      let altura_propuesta = null;
      let porcentaje_verificado_raw = null;
      let porcentaje_verificado_rounded = null;
      if (nivelApi != null && Number.isFinite(Number(ibalPercent)) && porcentaje_actual_rounded != null && Math.abs(porcentaje_actual_rounded - ibalPercent) > 1) {
        altura_propuesta = nivelApi / (ibalPercent / 100);
        if (altura_propuesta != null && altura_propuesta !== 0) {
          porcentaje_verificado_raw = calculateAutomaticPorcentaje(nivelApi, altura_propuesta);
          porcentaje_verificado_rounded = roundPct(porcentaje_verificado_raw);
        }
      }

      const row = [
        name,
        fmt(nivelApi, 4),
        ibalPercent,
        altura_efectiva != null ? fmt(altura_efectiva, 2) : 'N/A',
        porcentaje_actual_rounded != null ? porcentaje_actual_rounded : 'N/A',
        altura_propuesta != null ? fmt(altura_propuesta, 2) : 'N/A',
        porcentaje_verificado_rounded != null ? porcentaje_verificado_rounded : 'N/A',
        diferencia,
      ];

      console.log(row.join(' | '));
    }

    process.exit(0);
  } catch (err) {
    console.error('Error en auditoría matemática:', err.message || err);
    process.exit(2);
  }
})();
