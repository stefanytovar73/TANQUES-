const axios = require('axios');

const apiBase = process.env.VITE_API_URL || 'http://localhost:8000/api';
const api = axios.create({ baseURL: apiBase, timeout: 10000, headers: { 'Content-Type': 'application/json' } });

const provided = [
  { name: 'aurora', nivel: 2.98, capacidad: 1412, capacidadMaxima: 1600 },
  { name: 'belen', nivel: 2.57, capacidad: 2038, capacidadMaxima: 3000 },
  { name: 'ciudad', nivel: 1.84, capacidad: 1453, capacidadMaxima: 3000 },
  { name: 'interlaken', nivel: 1.41, capacidad: 160, capacidadMaxima: null },
  { name: 'ambala 1', nivel: 3.05, capacidad: 2540, capacidadMaxima: null },
  { name: 'ambala 2', nivel: 2.88, capacidad: 2390, capacidadMaxima: null },
  { name: 'alsacia', nivel: 0.87, capacidad: 2390, capacidadMaxima: null },
  { name: 'calucaima', nivel: 4.11, capacidad: 82, capacidadMaxima: 100 },
  { name: 'la quince', nivel: 4.01, capacidad: 1888, capacidadMaxima: null },
  { name: 'miramar', nivel: 4.79, capacidad: 1277, capacidadMaxima: 2000 },
  { name: 'zona industrial', nivel: 3.34, capacidad: 0, capacidadMaxima: 0 },
  { name: 'piedra pintada 1', nivel: 0.61, capacidad: 142, capacidadMaxima: null },
  { name: 'piedra pintada 2', nivel: 1.58, capacidad: 1316, capacidadMaxima: null },
  { name: 'la 30', nivel: 1.87, capacidad: 551, capacidadMaxima: 1000 },
  { name: 'la 29', nivel: 1.56, capacidad: 1733, capacidadMaxima: 1000 },
  { name: 'tanque cerro 1', nivel: 2.48, capacidad: 575, capacidadMaxima: 1000 },
  { name: 'tanque cerro 2', nivel: 1.81, capacidad: 419, capacidadMaxima: 1000 },
  { name: 'mirolindo', nivel: 1.78, capacidad: 637, capacidadMaxima: null },
  { name: 'picaleña 1', nivel: 1.38, capacidad: 144, capacidadMaxima: null },
  { name: 'picaleña 2', nivel: 1.52, capacidad: 542, capacidadMaxima: null },
];

function normalize(s) {
  if (!s) return '';
  return s.toString().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9 ]+/g, '').trim();
}

async function getTanques() {
  const res = await api.get('/tanques');
  return res.data.tanques || [];
}

async function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

(async () => {
  try {
    console.log('Obteniendo lista de tanques desde', apiBase);
    const tanques = await getTanques();
    console.log('Tanques obtenidos:', tanques.length);

    let matched = 0, persisted = 0, failed = 0;
    const failedList = [];

    for (const item of provided) {
      const found = tanques.find(t => {
        const display = normalize(t.nombre || t.tag || '');
        const raw = normalize(t.nombre || '');
        return display.includes(item.name) || raw.includes(item.name);
      });

      if (!found) {
        console.log('No encontrado:', item.name);
        continue;
      }
      matched++;

      const areaCalculated = (item.capacidad != null && Number(item.nivel) && Number(item.nivel) > 0) ? Number(item.capacidad) / Number(item.nivel) : (found.area_m2 ?? found.area ?? null);

      const payload = {
        nombre: found.nombre,
        valor_m: Number(item.nivel),
        nivel_maximo: found.nivel_maximo ? Number(found.nivel_maximo) : null,
        porcentaje: found.porcentaje ? Number(found.porcentaje) : null,
        capacidad_actual_m3: item.capacidad != null ? Number(item.capacidad) : (found.capacidad_actual_m3 ?? found.capacidad_actual ?? null),
        capacidad_actual: item.capacidad != null ? Number(item.capacidad) : (found.capacidad_actual ?? found.capacidad_actual_m3 ?? null),
        capacidad_maxima_m3: item.capacidadMaxima != null ? Number(item.capacidadMaxima) : (found.capacidad_maxima_m3 ?? found.capacidad_maxima ?? null),
        capacidad_maxima: item.capacidadMaxima != null ? Number(item.capacidadMaxima) : (found.capacidad_maxima ?? found.capacidad_maxima_m3 ?? null),
        area_m2: item.area != null ? Number(item.area) : (areaCalculated != null ? Number(areaCalculated) : (found.area_m2 ?? found.area ?? null)),
        area: item.area != null ? Number(item.area) : (areaCalculated != null ? Number(areaCalculated) : (found.area ?? found.area_m2 ?? null)),
        altura_rebose_m: item.alturaRebose != null ? Number(item.alturaRebose) : (found.altura_rebose_m ?? found.altura_rebose ?? null),
        altura_total_m: item.alturaTotal != null ? Number(item.alturaTotal) : (found.altura_total_m ?? found.altura_total ?? null),
        volumen_m3: item.volumen != null ? Number(item.volumen) : (found.volumen_m3 ?? found.volumen ?? null),
      };

      const maxAttempts = 3;
      let attempt = 0;
      let ok = false;
      while (attempt < maxAttempts && !ok) {
        attempt++;
        try {
          if (found.id && String(found.id).match(/^\d+$/)) {
            const r = await api.put(`/tanques/${found.id}`, payload);
            console.log(`Actualizado ${found.nombre} (id=${found.id})`);
          } else {
            const r = await api.post('/tanques', payload);
            console.log(`Creado/Actualizado por nombre ${found.nombre}`);
          }
          persisted++;
          ok = true;
        } catch (err) {
          console.error(`Intento ${attempt} falló para ${found.nombre}: ${err.message}`);
          if (attempt < maxAttempts) await sleep(300 * attempt);
          else {
            failed++;
            failedList.push({ nombre: found.nombre, error: err.message });
          }
        }
      }
    }

    console.log('Resultado: encontrados=', matched, 'persistidos=', persisted, 'fallidos=', failed);
    if (failedList.length) console.log('Fallos:', failedList);
  } catch (err) {
    console.error('Error ejecutando lote:', err.message);
  }
})();
