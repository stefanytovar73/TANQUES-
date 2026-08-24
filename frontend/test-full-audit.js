import http from 'node:http';
import { loadCatalog, saveCatalog, mergeApiTanquesWithCatalog, findCatalogEntry, updateCatalogEntry, normalizeText, DEFAULT_CATALOG } from './src/config/tankCatalog.js';

// ensure localStorage exists in Node so saveCatalog/loadCatalog persist during this run
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    _store: {},
    getItem(k) { return this._store[k] ?? null; },
    setItem(k, v) { this._store[k] = String(v); },
    removeItem(k) { delete this._store[k]; }
  };
}

const url = 'http://127.0.0.1:8001/api/tanques';

const fetchTanks = () => new Promise((resolve, reject) => {
  http.get(url, (res) => {
    let data = '';
    res.on('data', (c) => data += c);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        resolve(json.tanques || []);
      } catch (err) { reject(err); }
    });
  }).on('error', reject);
});

const run = async () => {
  console.log('Cargando catálogo local...');
  let catalog = loadCatalog();

  console.log('Solicitando tanques desde API...');
  const tanks = await fetchTanks();
  const total = tanks.length;

  console.log(`Tanques API recibidos: ${total}`);

  // 1) Matching
  const matched = [];
  const unmatched = [];
  for (const t of tanks) {
    const entry = findCatalogEntry(t, catalog);
    if (entry) matched.push({ tank: t, entry })
    else unmatched.push(t);
  }

  console.log(`Emparejados: ${matched.length}`);
  console.log(`No emparejados: ${unmatched.length}`);

  // 2) Ensure La 2 / La 29 / La 30 / Picaleña distinct
  const la2 = findCatalogEntry({ nombre: 'La 2', display_name: 'La 2', tag: 'La 2' }, catalog);
  const la29 = findCatalogEntry({ nombre: 'La 29', display_name: 'La 29', tag: 'La 29' }, catalog);
  const la30 = findCatalogEntry({ nombre: 'La 30', display_name: 'La 30', tag: 'La 30' }, catalog);
  const p1 = findCatalogEntry({ nombre: 'Picaleña 1', display_name: 'Picaleña 1', tag: 'Picaleña 1' }, catalog);
  const p2 = findCatalogEntry({ nombre: 'Picaleña 2', display_name: 'Picaleña 2', tag: 'Picaleña 2' }, catalog);

  console.log('La2 id ->', la2?.id ?? null);
  console.log('La29 id ->', la29?.id ?? null);
  console.log('La30 id ->', la30?.id ?? null);
  console.log('P1 id ->', p1?.id ?? null);
  console.log('P2 id ->', p2?.id ?? null);

  const distinctLa2La29 = !!la2 && !!la29 && la2.id !== la29.id;
  const distinctLa29La30 = !!la29 && !!la30 && la29.id !== la30.id;
  const distinctP1P2 = !!p1 && !!p2 && p1.id !== p2.id;

  console.log('La2 != La29 ?', distinctLa2La29);
  console.log('La29 != La30 ?', distinctLa29La30);
  console.log('Picaleña1 != Picaleña2 ?', distinctP1P2);

  // 3) Simular guardado de todos los campos físicos para cada tanque
  let canOpenCount = 0;
  let savedCount = 0;
  let persistedCount = 0;

  for (let i = 0; i < tanks.length; i++) {
    const t = tanks[i];
    const entry = findCatalogEntry(t, catalog);
    // consider editor openable if we can produce a catalog id or at least a stable id
    const canOpen = !!entry || !!t.id || !!t.tag || !!t.nombre || !!t.display_name;
    if (canOpen) canOpenCount++;

    const catalogId = entry?.id || normalizeText(t.tag || t.display_name || t.nombre || (t.id != null ? String(t.id) : ''));

    const updates = {
      nombre: t.display_name || t.nombre || catalogId,
      display_name: t.display_name || t.nombre || catalogId,
      area_m2: 1000 + i,
      altura_rebose: 5 + (i % 10) / 10,
      altura_total: 6 + (i % 10) / 10,
      volumen: 2000 + i,
      largo: 10 + i,
      ancho: 5 + i,
      compartimientos: (i % 4) + 1,
      cota_entrada: 1.1 + (i % 5),
      cota_salida: 2.2 + (i % 5),
      cota_fondo: 3.3 + (i % 5),
      cota_rebose: 4.4 + (i % 5),
      capacidad_maxima_m3: 500 + i,
      capacidad_actual_m3: 50 + i,
      volumen_restante_m3: 25 + i,
      nivel_maximo: 10 + (i % 5),
    };

    try {
      const updatedCatalog = updateCatalogEntry(catalog, catalogId, updates);
      saveCatalog(updatedCatalog);
      catalog = loadCatalog();
      savedCount++;

      const persisted = findCatalogEntry(t, catalog);
      const persistedOk = persisted &&
        persisted.area_m2 === updates.area_m2 &&
        persisted.capacidad_actual_m3 === updates.capacidad_actual_m3 &&
        persisted.volumen_restante_m3 === updates.volumen_restante_m3;
      if (persistedOk) persistedCount++;
    } catch (err) {
      console.error('Error guardando para', t.nombre || t.display_name || t.tag || t.id, err.message || err);
    }
  }

  console.log('\n--- RESUMEN ---');
  console.log('Total tanques API:', total);
  console.log('Emparejados:', matched.length);
  console.log('Sin emparejar:', unmatched.length);
  console.log('Puede abrir editor (estimado):', canOpenCount);
  console.log('Guardados (intentos):', savedCount);
  console.log('Persistidos correctamente:', persistedCount);
  console.log('La2 != La29:', distinctLa2La29);
  console.log('La29 != La30:', distinctLa29La30);
  console.log('P1 != P2:', distinctP1P2);

  process.exit(0);
};

run().catch((err) => { console.error('FALLA AUDITORÍA', err); process.exit(2); });
