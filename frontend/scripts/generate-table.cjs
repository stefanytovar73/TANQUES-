const http = require('http');
const https = require('https');
const fs = require('fs');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

(async function(){
  const api = await fetchJson('http://127.0.0.1:8001/api/tanques');
  const list = api.tanques || api;
  const targets=['La Aurora','Ambala 1','Ambala 2','Alsacia','Calucaima','Interlaken','La 15','La 29','La 30','Miramar','Picaleña 1','Picaleña 2'];
  const tankCatalog = require('../src/config/tankCatalog.js');
  const calibrations = require('../src/config/calibrations.js').default || require('../src/config/calibrations.js');

  // Reference values provided by user for verification (valor_referencia, porcentaje_referencia)
  const reference = {
    "La Aurora": { valor: 2.49, pct: 65 },
    "Ambala 1": { valor: 2.83, pct: 44 },
    "Ambala 2": { valor: 2.65, pct: 41 },
    "Alsacia": { valor: 3.89, pct: 35 },
    "Calucaima": { valor: 4.07, pct: 81 },
    "Interlaken": { valor: 1.69, pct: 32 },
    "La 15": { valor: 2.68, pct: 32 },
    "La 29": { valor: 1.49, pct: 41 },
    "La 30": { valor: 1.86, pct: 27 },
    "Miramar": { valor: 4.78, pct: 64 },
    "Picaleña 1": { valor: 0.65, pct: 24 },
    "Picaleña 2": { valor: 0.86, pct: 23 },
  };

  console.log('Tanque | valor_m API | porcentaje API | altura usada | porcentaje calculado | porcentaje mostrado');
  targets.forEach(name=>{
    const tank = list.find(x=>[x.display_name,x.nombre,x.tag,String(x.id)].some(s=> s && String(s).toLowerCase().includes(name.toLowerCase())));
    if(!tank){ console.log(name+' | AUSENTE'); return; }
    const valor_m = Number.isFinite(Number(tank.valor_m))? Number(tank.valor_m): null;
    const pct_api = Number.isFinite(Number(tank.porcentaje))? Number(tank.porcentaje): null;
    // altura usada = calibration if present; otherwise null
    const calibKey = tank.display_name || tank.nombre || tank.tag || '';
    const alturaCalib = calibrations[calibKey] || calibrations[tank.display_name] || calibrations[tank.nombre] || null;
    const pct_calc = tankCatalog.calculateDisplayPorcentaje(tank);
    // compute percentage using reference valor to verify calibrations
    const ref = reference[calibKey] || reference[tank.display_name] || reference[tank.nombre] || null;
    let pct_ref_calc = null;
    if (ref && alturaCalib && Number.isFinite(Number(ref.valor))) {
      pct_ref_calc = Math.round((Number(ref.valor) / Number(alturaCalib)) * 100);
    }
    console.log(`${tank.display_name||tank.nombre} | ${valor_m} | ${pct_api===null?'null':pct_api} | ${alturaCalib===null? 'null': alturaCalib} | ${pct_calc===null?'null':pct_calc} | ${pct_calc===null?'Sin datos':pct_calc+'%'} | ref_pct_expected: ${ref?ref.pct:'-'} | ref_pct_calc: ${pct_ref_calc===null?'-':pct_ref_calc+'%'}`);
  });
})();
