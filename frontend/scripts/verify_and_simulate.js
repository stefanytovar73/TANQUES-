import fs from 'fs';
import path from 'path';
const tmp = JSON.parse(fs.readFileSync(path.join('frontend','tmp_tanques.json'),'utf8'));
import { TANQUES_CONFIG } from '../src/config/tanquesConfig.js';

const adjustments = {
  'Piedra Pintada 1':7,
  'Piedra Pintada 2':7,
  'Picaleña 2':2,
  'Picaleña 1':6,
  'Mirolindo':2,
  'Interlaken':2,
  'Ciudad':2,
  'Cerro Gordo 2':2,
  'Cerro Gordo 1':2,
  'Ambala 2':2,
  'Ambala 1':1,
  'Alsacia':2
};

const norm = s=> s? s.toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'') : '';

function findApiTank(name){
  const n = norm(name.replace(/ñ/g,'n'));
  let found = tmp.tanques.find(t => {
    const dn = norm(t.display_name||t.nombre);
    return dn.includes(n) || dn.includes(norm(name));
  });
  if(!found && name.toLowerCase().includes('piedra')){
    // try without 'piedra'
    const alt = name.toLowerCase().replace('piedra ','');
    const na = norm(alt);
    found = tmp.tanques.find(t => norm(t.display_name||t.nombre).includes(na));
  }
  return found;
}

function findConfigTank(name){
  const n = norm(name.replace(/ñ/g,'n'));
  return TANQUES_CONFIG.find(t => {
    const dn = norm(t.display_name||t.aliases?.[0]||'');
    return dn.includes(n) || dn.includes(norm(name));
  });
}

const rows = [];
for(const name in adjustments){
  const api = findApiTank(name);
  const cfg = findConfigTank(name);
  if(!api || !cfg){
    rows.push({name, api: api? 'ok':'MISSING', cfg: cfg? 'ok':'MISSING'});
    continue;
  }
  const valor_m = api.valor_m;
  const pct_actual = api.porcentaje;
  const ajuste = adjustments[name];
  const objetivo = pct_actual - ajuste;
  const nueva_altura = cfg.altura_rebose_calibrada;
  const computed_pct = (valor_m / nueva_altura) * 100;
  rows.push({name,valor_m,pct_actual,ajuste,objetivo,nueva_altura,computed_pct});
}

console.log('Tabla: Tanque | valor_m | % actual | ajuste | % objetivo | nueva altura calibrada | verificación (calc %)');
for(const r of rows){
  if(r.api==='MISSING' || r.cfg==='MISSING'){
    console.log(r);
  } else {
    console.log(`${r.name} | ${r.valor_m.toFixed(4)} | ${r.pct_actual.toFixed(6)} | ${r.ajuste} | ${r.objetivo.toFixed(6)} | ${r.nueva_altura.toFixed(12)} | ${((r.computed_pct)).toFixed(12)}`);
  }
}

// Simulaciones
console.log('\nSimulaciones:');
const sim = [
  {name:'Piedra Pintada 1', new_val: findApiTank('Piedra Pintada 1').valor_m + 0.1},
  {name:'Picaleña 1', new_val: findApiTank('Picaleña 1').valor_m + 0.5}
];
for(const s of sim){
  const cfg = findConfigTank(s.name);
  const new_pct = (s.new_val / cfg.altura_rebose_calibrada) * 100;
  console.log(`${s.name} sim -> valor_m ${s.new_val.toFixed(4)} => porcentaje ${new_pct.toFixed(6)} (altura_calibrada ${cfg.altura_rebose_calibrada.toFixed(12)})`);
}
