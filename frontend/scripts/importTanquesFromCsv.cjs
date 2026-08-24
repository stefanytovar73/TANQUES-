const fs = require('fs');
const path = require('path');

if (process.argv.length < 3) {
  console.error('Uso: node importTanquesFromCsv.cjs <archivo.csv>');
  process.exit(1);
}

const csvPath = process.argv[2];
const outJson = path.resolve(__dirname, '..', 'src', 'config', 'tanquesConfig.json');
const backupPath = outJson + '.bak';

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter(Boolean);
  const header = lines.shift().split(/,|;|\t/).map(h => h.trim());
  return lines.map(line => {
    const cols = line.split(/,|;|\t/);
    const obj = {};
    header.forEach((h, i) => obj[h] = cols[i] ? cols[i].trim() : '');
    return obj;
  });
}

function makeAlias(name) {
  const base = name.toString();
  return [base, `tanque ${base}`, base.replace(/\s+/g,' '), base.toLowerCase()];
}

(async () => {
  try {
    const content = fs.readFileSync(csvPath, 'utf8');
    const rows = parseCsv(content);
    const result = rows.map(r => {
      const name = r['LocalizacionRelativa'] || r['Nombre'] || r['Nombre del Tanque'] || r['NOMBRE'] || r['localizacion'] || '';
      const area = Number(r['AREA'] ?? r['Area'] ?? r['area'] ?? (r['AREA_m2']));
      const alturaRebose = Number(r['ALTURA DE REBOSE'] ?? r['Altura rebose'] ?? r['CotaRebose_NumCompart'] ?? r['CotaRebose'] ?? r['AlturaTotal_m']);
      const alturaTotal = Number(r['AlturaTotal_m'] ?? r['Altura Total'] ?? r['AlturaTotal']);
      const volumen = Number(r['Volumen_m3'] ?? r['Volumen'] ?? r['volumen_m3']);
      return {
        aliases: makeAlias(name).map(a => a.toString()),
        displayName: name,
        areaTanque: Number.isFinite(area) && area > 0 ? area : undefined,
        alturaRebose: Number.isFinite(alturaRebose) && alturaRebose > 0 ? alturaRebose : undefined,
        alturaTotal: Number.isFinite(alturaTotal) && alturaTotal > 0 ? alturaTotal : undefined,
        volumen_m3: Number.isFinite(volumen) && volumen > 0 ? volumen : undefined,
      };
    }).filter(x => x.displayName);

    // backup
    if (fs.existsSync(outJson)) fs.copyFileSync(outJson, backupPath);
    fs.writeFileSync(outJson, JSON.stringify(result, null, 2), 'utf8');
    console.log('Archivo escrito:', outJson, '(backup en', backupPath, ')');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
