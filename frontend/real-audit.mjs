import http from 'node:http';
import { loadCatalog, mergeApiTanquesWithCatalog } from './src/config/tankCatalog.js';

const url = 'http://127.0.0.1:8001/api/tanques';

const fetchTanks = () => new Promise((resolve, reject) => {
  http.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        resolve(json.tanques || []);
      } catch (err) {
        reject(err);
      }
    });
  }).on('error', reject);
});

const formatDashboard = (value) => {
  if (!Number.isFinite(Number(value))) return 'N/A';
  return `${Number(value).toFixed(1)} %`;
};

const formatInicio = (value) => {
  if (!Number.isFinite(Number(value))) return 'N/A';
  return `${Math.round(Number(value))}%`;
};

const run = async () => {
  const tanks = await fetchTanks();
  const catalog = loadCatalog();
  const merged = mergeApiTanquesWithCatalog(tanks, catalog);

  console.log('REAL DATA AUDIT');
  console.log('----------------');
  for (const tank of merged) {
    const api = tanks.find((t) =>
      t.id != null && tank.id != null && String(t.id) === String(tank.id)
    ) || tanks.find((t) =>
      t.nombre === tank.nombre || t.display_name === tank.display_name || t.tag === tank.tag
    );
    const apiPorcentaje = api ? api.porcentaje : tank.porcentaje;
    console.log(`Tanque: ${tank.display_name ?? tank.nombre ?? tank.tag ?? tank.id ?? 'sin-nombre'}`);
    console.log(`  API porcentaje: ${apiPorcentaje}`);
    console.log(`  Después del merge: ${tank.porcentaje}`);
    console.log(`  UI Dashboard: ${formatDashboard(tank.porcentaje)}`);
    console.log(`  UI Inicio: ${formatInicio(tank.porcentaje)}`);
    console.log('');
  }
  console.log(`TOTAL tanques API: ${tanks.length}`);
  console.log(`TOTAL tanques merge: ${merged.length}`);
};

run().catch((err) => {
  console.error('Audit failed', err);
  process.exit(1);
});
