import axios from 'axios';
import TANQUES_CONFIG from '../src/config/tanquesConfig.js';

const API_BASE = process.env.VITE_API_URL || 'http://127.0.0.1:8001/api';
const api = axios.create({ baseURL: API_BASE, timeout: 10000 });

function normalizeText(value) {
  if (!value) return '';
  return value.toString().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9 ]+/g, '').trim();
}

function parseNumber(v){ return Number.isFinite(Number(v)) ? Number(v) : null; }

function buildCatalogFromConfig(config){
  return config.map(item => {
    const displayName = item.display_name || (item.aliases && item.aliases[0]) || '';
    const aliases = [displayName, ...(item.aliases||[])].map(normalizeText).filter(Boolean);
    const area = parseNumber(item.area ?? item.area_m2);
    const alturaRebose = parseNumber(item.altura_rebose ?? item.altura_rebose);
    const alturaTotal = parseNumber(item.altura_total ?? item.alturaTotal);
    const volumen = parseNumber(item.volumen ?? item.volumen_m3 ?? item.volumen);
    const capacidadMaxima = null;
    return {
      id: normalizeText(displayName),
      nombre: displayName,
      display_name: displayName,
      aliases,
      area_m2: area,
      altura_rebose: alturaRebose,
      altura_total: alturaTotal,
      volumen,
      capacidad_maxima_m3: capacidadMaxima,
    };
  });
}

function findCatalogEntryForTank(tank, catalog){
  const name = normalizeText(tank.display_name || tank.nombre || tank.tag || '');
  if (!name) return null;
  for (const entry of catalog){
    if (entry.id === name) return entry;
    if ((entry.aliases||[]).includes(name)) return entry;
  }
  for (const entry of catalog){
    for (const alias of (entry.aliases||[])){
      if (alias.includes(name) || name.includes(alias)) return entry;
    }
  }
  return null;
}

function mergeTankWithCatalog(tank, catalogEntry){
  const merged = {
    ...tank,
    area_m2: catalogEntry?.area_m2 ?? tank.area_m2 ?? null,
    altura_rebose: catalogEntry?.altura_rebose ?? tank.altura_rebose ?? null,
    altura_total: catalogEntry?.altura_total ?? tank.altura_total ?? null,
    capacidad_actual_m3: catalogEntry?.capacidad_actual_m3 ?? tank.capacidad_actual_m3 ?? tank.capacidad_actual ?? null,
    capacidad_maxima_m3: catalogEntry?.capacidad_maxima_m3 ?? tank.capacidad_maxima_m3 ?? tank.capacidad_maxima ?? null,
    volumen_restante_m3: catalogEntry?.volumen_restante_m3 ?? tank.volumen_restante_m3 ?? tank.rebose ?? null,
    display_name: catalogEntry?.display_name ?? tank.display_name ?? tank.nombre ?? tank.tag ?? null,
  };
  const porcentaje = (Number.isFinite(Number(merged.valor_m)) && Number.isFinite(Number(merged.altura_rebose)) && Number(merged.altura_rebose) > 0)
    ? (Number(merged.valor_m) / Number(merged.altura_rebose)) * 100
    : null;
  merged.porcentaje = porcentaje;
  return merged;
}

function updateCatalogEntryInMemory(catalog, id, updates){
  const normalizedUpdates = { ...updates };
  for (const k of ['area_m2','altura_rebose','altura_total','volumen','largo','ancho','cota_entrada','cota_salida','cota_fondo','cota_rebose','nivel_maximo','porcentaje','capacidad_actual_m3','capacidad_maxima_m3','volumen_restante_m3']){
    if (normalizedUpdates[k] !== undefined) normalizedUpdates[k] = parseNumber(normalizedUpdates[k]);
  }
  const existing = catalog.find(item => item.id === id);
  if (existing){
    const merged = { ...existing, ...normalizedUpdates };
    const baseAliases = Array.isArray(merged.aliases) ? merged.aliases.map(normalizeText) : [];
    const displayAlias = normalizeText(merged.display_name || merged.nombre || '');
    const idAlias = normalizeText(merged.nombre || merged.id || '');
    merged.aliases = Array.from(new Set([displayAlias, idAlias, ...baseAliases].filter(Boolean)));
    return catalog.map(item => item.id === id ? merged : item);
  }
  const newEntry = {
    id,
    nombre: normalizedUpdates.nombre || id,
    display_name: normalizedUpdates.display_name || normalizedUpdates.nombre || id,
    aliases: [normalizeText(normalizedUpdates.display_name || normalizedUpdates.nombre || id)],
    ...normalizedUpdates
  };
  return [...catalog, newEntry];
}

(async function main(){
  try {
    console.log('Using API base', API_BASE);
    const res = await api.get('/tanques');
    const tanques = res.data?.tanques || [];
    console.log('Tanques from API:', tanques.length);
    const catalog = buildCatalogFromConfig(TANQUES_CONFIG);

    const report = [];
    for (const t of tanques){
      const entry = findCatalogEntryForTank(t, catalog);
      const merged = mergeTankWithCatalog(t, entry);
      const id = normalizeText(t.display_name || t.nombre || t.tag || String(t.id || ''));
      // simulate an update to altura_rebose
      const updatedCatalog = updateCatalogEntryInMemory(catalog, id, { altura_rebose: (entry?.altura_rebose ?? t.altura_rebose ?? 0) + 0.01 });
      const reloaded = updatedCatalog.find(e => e.id === id) || null;
      const mergedAfter = mergeTankWithCatalog(t, reloaded);
      // checks
      const checks = {
        id,
        foundCatalogEntry: !!entry,
        altura_before: entry?.altura_rebose ?? t.altura_rebose ?? null,
        altura_after_saved: reloaded?.altura_rebose ?? null,
        valor_m_api: t.valor_m ?? null,
        valor_m_preserved_after_save: mergedAfter.valor_m === t.valor_m,
        porcentaje_calculated_after: mergedAfter.porcentaje,
      };
      report.push(checks);
    }

    // summarize
    const notFound = report.filter(r => !r.foundCatalogEntry).map(r=>r.id);
    console.log('Total tanks:', report.length);
    console.log('Catalog entries not found (by id):', notFound.length ? notFound : '(none)');
    if (notFound.length) console.log(notFound.join('\n'));
    // report example
    console.log('Sample checks (first 10):', report.slice(0,10));
    // exit code
    process.exit(0);
  } catch (err) {
    console.error('Error during verification:', err.message || err);
    process.exit(2);
  }
})();
