const fs = require('fs');
const path = require('path');
const apiPath = path.join(__dirname,'..','tmp_tanques.json');
if(!fs.existsSync(apiPath)){
  console.error('Missing', apiPath);
  process.exit(1);
}
const api = JSON.parse(fs.readFileSync(apiPath,'utf8'));
const targets = ['Alsacia','Ambala 1','Ambala 2','Cerro Gordo 1','Cerro Gordo 2','Ciudad','Interlaken','Picaleña 1','Picaleña 2'];
const norm = s=> s? s.toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'') : '';
function findApi(name){
  const n = norm(name.replace(/ñ/g,'n'));
  return api.tanques.find(t => {
    const dn = norm(t.display_name||t.nombre);
    return dn.includes(n) || dn.includes(norm(name));
  }) || null;
}
const rows = [];
for(const name of targets){
  const apiEntry = findApi(name);
  if(!apiEntry){
    console.error('MISSING API ENTRY:', name);
    process.exit(2);
  }
  const valor_m = apiEntry.valor_m;
  const pct = apiEntry.porcentaje;
  if(valor_m==null || pct==null){
    console.error('INCOMPLETE DATA for',name, 'valor_m=',valor_m,'pct=',pct);
    process.exit(3);
  }
  const altura = valor_m / (pct/100);
  rows.push({name,valor_m,pct,altura});
}
console.log('Tabla 1: Tanque | valor_m IBAL | % IBAL | altura_rebose_calibrada calculada | % aplicación (verificación)');
for(const r of rows){
  const verif = (r.valor_m / r.altura) * 100;
  console.log(`${r.name} | ${r.valor_m.toFixed(4)} | ${r.pct.toFixed(6)} | ${r.altura.toFixed(12)} | ${verif.toFixed(12)}`);
}
console.log('\nJSON_OUTPUT_START');
console.log(JSON.stringify(rows,null,2));
console.log('JSON_OUTPUT_END');
