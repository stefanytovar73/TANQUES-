import fs from 'fs';
import path from 'path';
const data = JSON.parse(fs.readFileSync(path.join('frontend','tmp_tanques.json'),'utf8'));
const adjustments = {
  'Piedra Pintada 1':7,
  'Piedra Pintada 2':7,
  'Pintada 1':7,
  'Pintada 2':7,
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

const results = [];
for(const t of data.tanques){
  for(const name in adjustments){
    const n = norm(name.replace(/ñ/g,'n'));
    const dn = norm(t.display_name || t.nombre);
    if(dn.includes(n) || dn.includes(norm(name))){
      const valor_m = t.valor_m;
      const porcentaje_actual = t.porcentaje;
      const ajuste = adjustments[name];
      if(valor_m==null || porcentaje_actual==null){
        results.push({name,valor_m,porcentaje_actual,ajuste, objetivo:null, nueva_altura:null});
      } else {
        const objetivo = porcentaje_actual - ajuste;
        if(objetivo<=0){
          results.push({name,valor_m,porcentaje_actual,ajuste,objetivo,nueva_altura:null});
        } else {
          const nueva_altura = (valor_m * 100) / objetivo;
          results.push({name,valor_m,porcentaje_actual,ajuste,objetivo,nueva_altura});
        }
      }
    }
  }
}
console.log(JSON.stringify(results,null,2));
