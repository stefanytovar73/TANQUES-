import axios from 'axios';
import { loadCatalog, mergeApiTanquesWithCatalog, calculateAutomaticPorcentaje, findCatalogEntry } from '../src/config/tankCatalog.js';

const API_URL = process.env.VITE_API_URL || 'http://127.0.0.1:8001/api';

const IBAL_REFERENCE = {
  Alsacia: { nivel: 0.87, ibal: 35 },
  'Ambala 1': { nivel: 4.44, ibal: 68 },
  'Ambala 2': { nivel: 4.25, ibal: 65 },
  'La Aurora': { nivel: 3.18, ibal: 80 },
  'Belén': { nivel: 3.26, ibal: 86 },
  Calucaima: { nivel: 4.13, ibal: 83 },
  'Cerro Gordo 1': { nivel: 2.82, ibal: 68 },
  'Cerro Gordo 2': { nivel: 2.09, ibal: 52 },
  Ciudad: { nivel: 2.82, ibal: 74 },
  'Zona Industrial': { nivel: 2.4, ibal: 15 },
  Interlaken: { nivel: 2.46, ibal: 48 },
  'La 15': { nivel: 4.87, ibal: 57 },
  'La 29': { nivel: 1.77, ibal: 49 },
  'La 30': { nivel: 1.9, ibal: 28 },
  Miramar: { nivel: 4.78, ibal: 64 },
  Mirolindo: { nivel: 2.82, ibal: 94 },
  'Picaleña 1': { nivel: 2.09, ibal: 75 },
  'Picaleña 2': { nivel: 2.2, ibal: 58 },
  'Piedra Pintada 1': { nivel: 2.46, ibal: 57 },
  'Piedra Pintada 2': { nivel: 3.45, ibal: 72 },
};

const fetchApiTanques = async () => {
  const url = `${API_URL.replace(/\/+$/, '')}/tanques`;
  const resp = await axios.get(url);
  // API returns { status: 'ok', tanques: [...] }
  if (resp?.data?.tanques) return resp.data.tanques;
  if (Array.isArray(resp?.data)) return resp.data;
  return [];
};

const round = (v) => (v == null ? null : Math.round(v));

(async () => {
  try {
    console.log('Conectando a API en', API_URL);
    const apiTanques = await fetchApiTanques();
    console.log(`Recibidos ${apiTanques.length} tanques desde API`);

    const catalog = loadCatalog();
    const merged = mergeApiTanquesWithCatalog(apiTanques, catalog);

    console.log('\nAUDITORÍA POR TANQUE:');
    for (const m of merged) {
      const nombre = m.display_name ?? m.nombre ?? m.tag ?? 'Sin nombre';
      const valor_m_api = Number.isFinite(Number(m.valor_m)) ? Number(m.valor_m) : (Number.isFinite(Number(m.valor_m)) ? Number(m.valor_m) : m.valor_m ?? null);
      const porcentaje_api = Number.isFinite(Number(m.porcentaje)) ? Number(m.porcentaje) : null;
      const altura_original = m.altura_rebose ?? null;
      const altura_calibrada = m.altura_rebose_calibrada ?? null;
      const effectiveAltura = altura_calibrada != null ? altura_calibrada : altura_original;
      const porcentaje_calculado_raw = calculateAutomaticPorcentaje(m.valor_m, effectiveAltura);
      const porcentaje_calculado = porcentaje_calculado_raw != null ? Math.min(100, Math.max(0, porcentaje_calculado_raw)) : null;
      // determine what UI will show: calculated from valor_m + effective altura if possible, otherwise API porcentaje
      const porcentaje_mostrado = Number.isFinite(Number(m.valor_m)) && effectiveAltura != null ? Math.round(porcentaje_calculado) : (m.porcentaje != null ? Math.round(Number(m.porcentaje)) : null);

      console.log('-------------------------------------------');
      console.log('Nombre:', nombre);
      console.log('  valor_m API:', valor_m_api);
      console.log('  porcentaje API:', porcentaje_api);
      console.log('  altura_rebose original:', altura_original);
      console.log('  altura_rebose_calibrada:', altura_calibrada);
      console.log('  porcentaje calculado (raw):', porcentaje_calculado_raw);
      console.log('  porcentaje calculado (rounded):', porcentaje_calculado != null ? round(porcentaje_calculado) : null);
      console.log('  porcentaje finalmente mostrado:', porcentaje_mostrado != null ? round(porcentaje_mostrado) : null);
    }

    // Table comparing IBAL vs calculado for reference tanks
    // Generar reporte de validación: sólo propuestas (diff > 1 punto)
    const proposals = [];
    for (const [name, ref] of Object.entries(IBAL_REFERENCE)) {
      const found = merged.find((t) => {
        const display = (t.display_name || t.nombre || '').toLowerCase();
        return display === name.toLowerCase();
      });
      if (!found) continue;

      const nivelApi = Number.isFinite(Number(found.valor_m)) ? Number(found.valor_m) : (Number.isFinite(Number(ref.nivel)) ? ref.nivel : null);
      const altura_original = found.altura_rebose ?? null;
      const altura_calibrada_existente = found.altura_rebose_calibrada ?? null;
      const altura_efectiva_actual = altura_calibrada_existente != null ? altura_calibrada_existente : altura_original;

      const porcentaje_actual_raw = calculateAutomaticPorcentaje(nivelApi, altura_efectiva_actual);
      const porcentaje_actual = porcentaje_actual_raw == null ? null : Math.round(porcentaje_actual_raw);
      const ibalPercent = ref.ibal;
      const diff = porcentaje_actual == null ? null : Math.abs(porcentaje_actual - ibalPercent);

      let altura_propuesta = null;
      let porcentaje_despues = null;
      let cambio_percent_altura = null;
      if (nivelApi != null && Number.isFinite(Number(ibalPercent)) && diff != null && diff > 1) {
        altura_propuesta = nivelApi / (ibalPercent / 100);
        porcentaje_despues = calculateAutomaticPorcentaje(nivelApi, altura_propuesta);
        if (altura_original != null && altura_original !== 0) {
          cambio_percent_altura = ((altura_propuesta - altura_original) / altura_original) * 100;
        }
        proposals.push({
          name,
          nivelApi,
          ibalPercent,
          porcentaje_actual,
          altura_original,
          altura_propuesta,
          porcentaje_despues,
          cambio_percent_altura,
          diff,
        });
      }
    }

    // Imprimir detalle por tanque con propuesta
    console.log('\nREPORTE DE VALIDACIÓN (propuestas, solo diff > 1 punto):');
    if (proposals.length === 0) console.log('No hay propuestas de calibración.');
    for (const p of proposals) {
      console.log('-------------------------------------------');
      console.log('Nombre:', p.name);
      console.log('  valor_m API:', p.nivelApi);
      console.log('  porcentaje IBAL:', p.ibalPercent);
      console.log('  porcentaje calculado actual:', p.porcentaje_actual);
      console.log('  altura_rebose original:', p.altura_original);
      console.log('  altura_rebose_calibrada propuesta:', p.altura_propuesta != null ? Math.round(p.altura_propuesta * 100) / 100 : 'N/A');
      console.log('  diferencia porcentual altura (original→propuesta):', p.cambio_percent_altura != null ? `${Math.round(p.cambio_percent_altura * 100) / 100} %` : 'N/A');
    }

    // Tabla final solicitada
    console.log('\nTABLA FINAL (TANQUE | % IBAL | % ACTUAL | DIF | ALTURA ORIGINAL | ALTURA PROPUESTA | CAMBIO %)');
    if (proposals.length === 0) console.log('Sin filas.');
    for (const p of proposals) {
      const cambioFmt = p.cambio_percent_altura == null ? 'N/A' : `${Math.round(p.cambio_percent_altura * 100) / 100} %`;
      console.log(`${p.name} | ${p.ibalPercent} | ${p.porcentaje_actual} | ${p.diff} | ${p.altura_original ?? 'N/A'} | ${p.altura_propuesta != null ? (Math.round(p.altura_propuesta * 100) / 100) : 'N/A'} | ${cambioFmt}`);
    }

    // Check code-level facts: where porcentaje from localStorage is ignored when loading
    console.log('\nNOTAS DE CÓDIGO:');
    console.log("- `loadCatalog` descarta propiedades 'porcentaje' y 'nivel' al cargar entradas guardadas (ver 'tankCatalog.js').");
    console.log("- `mergeTankWithCatalog` prioriza 'porcentaje' que venga en la API y solo calcula si no hay porcentaje en API.");

    process.exit(0);
  } catch (err) {
    console.error('Error en auditoría:', err.message || err);
    process.exit(2);
  }
})();
