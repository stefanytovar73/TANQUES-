const fs = require('fs');
const https = require('https');
const http = require('http');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      let d = '';
      res.on('data', (c) => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function normalizeText(value) {
  if (!value) return '';
  return value.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, '').trim();
}

function parseConfigEntries(text) {
  const start = text.indexOf('const TANQUES_CONFIG = [');
  const end = text.indexOf('];', start);
  if (start < 0 || end < 0) return [];
  const arrText = text.slice(start + 'const TANQUES_CONFIG = ['.length, end).trim();
  // split by objects (rough but works for this file)
  const parts = arrText.split(/},\s*\n\s*\{/g).map((s, i, arr) => {
    let str = s;
    if (i > 0) str = '{' + str;
    if (i < arr.length - 1) str = str + '}';
    return str;
  });
  const entries = parts.map(str => {
    const get = (re) => { const m = str.match(re); return m ? m[1].trim() : null; };
    const display = get(/display_name:\s*"([^"]+)"/m);
    const aliasesRaw = get(/aliases:\s*\[([^\]]*)\]/m);
    let aliases = [];
    if (aliasesRaw) {
      const am = aliasesRaw.match(/"([^"\n]+)"/g);
      if (am) aliases = am.map(a => a.replace(/"/g, ''));
    }
    const area = get(/area:\s*(null|[0-9\.]+)/m);
    const altura_rebose = get(/altura_rebose:\s*(null|[0-9\.]+)/m);
    const altura_rebose_calibrada = get(/altura_rebose_calibrada:\s*(null|[0-9\.]+)/m);
    const volumen = get(/volumen:\s*(null|[0-9\.]+)/m);
    return {
      display,
      aliases,
      area: area === 'null' ? null : (area ? Number(area) : null),
      altura_rebose: altura_rebose === 'null' ? null : (altura_rebose ? Number(altura_rebose) : null),
      altura_rebose_calibrada: altura_rebose_calibrada === 'null' ? null : (altura_rebose_calibrada ? Number(altura_rebose_calibrada) : null),
      volumen: volumen === 'null' ? null : (volumen ? Number(volumen) : null),
    };
  });
  return entries;
}

function buildCatalog(entries) {
  return entries.map(e => ({
    id: e.display ? normalizeText(e.display) : '',
    display_name: e.display,
    aliases: (e.aliases || []).map(normalizeText).filter(Boolean),
    area_m2: e.area,
    altura_rebose: e.altura_rebose,
    altura_rebose_calibrada: e.altura_rebose_calibrada,
    volumen: e.volumen,
  }));
}

function findCatalogEntry(tank, catalog) {
  if (!tank) return null;
  const normalizeCandidate = (v) => (v != null ? normalizeText(String(v)) : '');
  const idCandidate = tank.id != null && String(tank.id).length ? normalizeCandidate(tank.id) : null;
  const tagCandidate = tank.tag != null && String(tank.tag).length ? normalizeCandidate(String(tank.tag).replace(/_/g, ' ')).replace(/^nivel\s+/, '') : null;
  const nameCandidates = [tank.display_name, tank.nombre, tagCandidate, tank.tag, tank.id != null ? String(tank.id) : null]
    .filter(Boolean)
    .map(normalizeCandidate)
    .filter(Boolean);
  if (idCandidate) {
    const byId = catalog.find(e => e.id === idCandidate);
    if (byId) return byId;
  }
  if (tagCandidate) {
    const byTag = catalog.find(e => e.id === tagCandidate || (e.aliases || []).includes(tagCandidate));
    if (byTag) return byTag;
  }
  if (!nameCandidates.length) return null;
  const exact = catalog.find(entry => nameCandidates.some(n => entry.id === n || (entry.aliases || []).includes(n)));
  if (exact) return exact;
  return null;
}

function calcPorcentaje(valor_m, altura_rebose) {
  if (valor_m === null || valor_m === undefined || valor_m === '') return null;
  if (altura_rebose === null || altura_rebose === undefined || altura_rebose === '') return null;
  if (!Number.isFinite(Number(valor_m))) return null;
  if (!Number.isFinite(Number(altura_rebose))) return null;
  if (Number(altura_rebose) <= 0) return null;
  return (Number(valor_m) / Number(altura_rebose)) * 100;
}

(async function main(){
  try{
    const api = await fetchJson('http://127.0.0.1:8001/api/tanques');
    const tc = fs.readFileSync('src/config/tanquesConfig.js','utf8');
    const entries = parseConfigEntries(tc);
    const catalog = buildCatalog(entries);
    const targets=['Aurora','Ambala 1','Ambala 2','Alsacia','Calucaima','Interlaken','La 15','La 29','Miramar','Picaleña 1'];
    const list = api.tanques || api;
    targets.forEach(name=>{
      console.log('\n--- '+name+' ---');
      const tank = list.find(x=>[x.display_name,x.nombre,x.tag,String(x.id)].some(s=> s && String(s).toLowerCase().includes(name.toLowerCase())));
      if(!tank){ console.log('AUSENTE'); return; }
      console.log('\nAPI RAW:\n'+JSON.stringify(tank,null,2));
      const config = findCatalogEntry(tank, catalog);
      const nivelActual = Number.isFinite(Number(tank.valor_m)) ? Number(tank.valor_m) : null;
      const computedAltura = (tank.altura_rebose !== null && tank.altura_rebose !== undefined && tank.altura_rebose !== '') && Number.isFinite(Number(tank.altura_rebose)) ? Number(tank.altura_rebose) : null;
      const merged = {
        ...tank,
        area_m2: config?.area_m2 ?? tank.area_m2 ?? null,
        altura_rebose: computedAltura,
        altura_rebose_calibrada: config?.altura_rebose_calibrada ?? tank.altura_rebose_calibrada ?? null,
        altura_total: config?.altura_total ?? tank.altura_total ?? null,
        volumen: config?.volumen ?? tank.volumen ?? tank.volumen_m3 ?? null,
        largo: config?.largo ?? tank.largo ?? null,
        ancho: config?.ancho ?? tank.ancho ?? null,
        compartimientos: config?.compartimientos ?? tank.compartimientos ?? null,
        cota_entrada: config?.cota_entrada ?? tank.cota_entrada ?? null,
        cota_salida: config?.cota_salida ?? tank.cota_salida ?? null,
        cota_fondo: config?.cota_fondo ?? tank.cota_fondo ?? null,
        cota_rebose: config?.cota_rebose ?? tank.cota_rebose ?? null,
        nivel_maximo: config?.nivel_maximo ?? tank.nivel_maximo ?? null,
        capacidad_actual_m3: config?.capacidad_actual_m3 ?? tank.capacidad_actual_m3 ?? tank.capacidad_actual ?? null,
        capacidad_maxima_m3: config?.capacidad_maxima_m3 ?? tank.capacidad_maxima_m3 ?? tank.capacidad_maxima ?? null,
        volumen_restante_m3: config?.volumen_restante_m3 ?? tank.volumen_restante_m3 ?? tank.rebose ?? null,
        display_name: config?.display_name ?? tank.display_name ?? tank.nombre ?? tank.tag ?? null,
        porcentaje: null,
        nivel: nivelActual,
        valor_m: tank.valor_m,
      };
      console.log('\nMERGED:\n'+JSON.stringify(merged,null,2));
      const rawCalcApi = calcPorcentaje(tank.valor_m, tank.altura_rebose);
      const dispCalcApi = rawCalcApi==null? null: Math.round(rawCalcApi);
      const rawCalcMerged = calcPorcentaje(merged.nivel, merged.altura_rebose);
      const dispCalcMerged = rawCalcMerged==null? null: Math.round(rawCalcMerged);
      console.log('\nCALCULATIONS:\nrawCalcApi: '+(rawCalcApi==null? 'null': rawCalcApi.toFixed(6))+'\ndispCalcApi: '+(dispCalcApi==null? 'null': dispCalcApi)+'\nrawCalcMerged: '+(rawCalcMerged==null? 'null': rawCalcMerged.toFixed(6))+'\ndispCalcMerged: '+(dispCalcMerged==null? 'null': dispCalcMerged));
      console.log('\napi.porcentaje: '+(tank.porcentaje==null? 'null': tank.porcentaje));
      const equalRaw = (tank.porcentaje==null && rawCalcApi==null) || (tank.porcentaje!=null && rawCalcApi!=null && Math.abs(Number(tank.porcentaje)-Number(rawCalcApi))<0.5);
      const conclusion = equalRaw? 'IGUALES (raw vs api.porcentaje aproximadamente iguales)': 'DIFERENTES (raw vs api.porcentaje)';
      console.log('\nCONCLUSION: '+conclusion+'\n');
    });
  }catch(e){ console.error('ERROR',e); process.exit(1); }
})();
