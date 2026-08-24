import fs from 'fs';
import path from 'path';
import { TANQUES_CONFIG } from '../src/config/tanquesConfig.js';

const apiPath = path.join('frontend','tmp_tanques.json');
if(!fs.existsSync(apiPath)){
  console.error('Falta frontend/tmp_tanques.json — ejecuta curl para descargar los datos de la API.');
  process.exit(1);
}
const api = JSON.parse(fs.readFileSync(apiPath,'utf8'));
const targets = [
  'Alsacia','Ambala 1','Ambala 2','Cerro Gordo 1','Cerro Gordo 2','Ciudad','Interlaken','Picaleña 1','Picaleña 2'
];
const norm = s => s? s.toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'') : '';

function findApi(name){
  const n = norm(name.replace(/ñ/g,'n'));
  return api.tanques.find(t => {
    const dn = norm(t.display_name||t.nombre);
    return dn.includes(n) || dn.includes(norm(name));
  }) || null;
}

function findCfg(name){
  const n = norm(name.replace(/ñ/g,'n'));
  return TANQUES_CONFIG.find(t => {
    const dn = norm(t.display_name||'');
    return dn.includes(n) || (t.aliases && t.aliases.some(a=>norm(a).includes(n)));
  }) || null;
}

const rows = [];
for(const name of targets){
  const apiEntry = findApi(name);
  const cfgEntry = findCfg(name);
  if(!apiEntry) {
    console.log(`FALTA EN API: ${name}`);
    process.exit(2);
  }
  if(!cfgEntry){
    console.log(`FALTA EN CONFIG: ${name}`);
    process.exit(2);
  }
  const valor_m = apiEntry.valor_m;
  const pct = apiEntry.porcentaje;
  if(valor_m==null || pct==null){
    console.log(`DATOS INCOMPLETOS PARA ${name}: valor_m=${valor_m}, porcentaje=${pct}`);
    process.exit(3);
  }
  const altura = valor_m / (pct/100);
  rows.push({name,valor_m,pct,altura, cfgIndex: TANQUES_CONFIG.indexOf(cfgEntry)});
}

console.log('Tabla 1: Tanque | valor_m IBAL | % IBAL | altura_rebose_calibrada calculada | % aplicación (verificación)');
for(const r of rows){
  const verif = (r.valor_m / r.altura) * 100;
  console.log(`${r.name} | ${r.valor_m.toFixed(4)} | ${r.pct.toFixed(6)} | ${r.altura.toFixed(12)} | ${verif.toFixed(12)}`);
}

console.log('\nSimulación (cambio de valor_m):');
const sims = [ ['Picaleña 1', rows.find(x=>x.name==='Picaleña 1').valor_m + 0.5], ['Ambala 1', rows.find(x=>x.name==='Ambala 1').valor_m + 0.2] ];
for(const [name,newVal] of sims){
  const row = rows.find(x=>x.name===name);
  const newPct = (newVal / row.altura) * 100;
  console.log(`${name} | valor_m original ${row.valor_m.toFixed(4)} | valor_m simulado ${newVal.toFixed(4)} | % orig ${row.pct.toFixed(6)} | % sim ${newPct.toFixed(12)}`);
}

// Emitir JSON útil para aplicar patches
console.log('\nJSON_OUTPUT_START');
console.log(JSON.stringify(rows,null,2));
console.log('JSON_OUTPUT_END');
