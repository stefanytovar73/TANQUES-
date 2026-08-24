import fs from 'fs';
import path from 'path';
const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/,'$1'));
const data = JSON.parse(fs.readFileSync(path.join(__dirname,'..','tmp_tanques.json'),'utf8'));
const targets = [
  'Piedra Pintada 1','Piedra Pintada 2','Picaleña 2','Picaleña 1','Mirolindo','Interlaken','Ciudad','Cerro Gordo 2','Cerro Gordo 1','Ambala 2','Ambala 1','Alsacia'
];
const norm = (s='')=>s.toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
const out = [];
for(const t of data.tanques){
  const dn = norm(t.display_name||t.nombre||'');
  for(const target of targets){
    if(dn.includes(norm(target.replace(/ñ/g,'n')) ) || dn.includes(norm(target)) ){
      out.push({display_name:t.display_name||t.nombre,valor_m:t.valor_m,porcentaje:t.porcentaje,id:t.id});
      break;
    }
  }
}
console.log(JSON.stringify(out,null,2));
