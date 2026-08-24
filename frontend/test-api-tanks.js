import http from 'node:http';
import { mergeApiTanquesWithCatalog, findCatalogEntry, loadCatalog, normalizeText } from './src/config/tankCatalog.js';

const url = 'http://127.0.0.1:8001/api/tanques';

const req = http.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => (data += chunk));
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      const tanks = json.tanques || [];
      const catalog = loadCatalog();
      const merged = mergeApiTanquesWithCatalog(tanks, catalog);
      const targets = ['la 2', 'tanque la 2', 'la 29', 'tanque la 29', 'la 30', 'tanque la 30', 'la 15', 'tanque la 15', 'la aurora', 'picaleña', 'miramar', 'calucaima'];
      for (const tank of merged) {
        const rawName = String(tank.nombre || tank.display_name || tank.tag || '').toLowerCase();
        if (targets.some((t) => rawName.includes(t))) {
          const entry = findCatalogEntry(tank, catalog);
          console.log(JSON.stringify({nombre: tank.nombre, display_name: tank.display_name, tag: tank.tag, id: tank.id, matchedDisplay: entry?.display_name, matchedId: entry?.id, mergedDisplay: tank.display_name}, null, 2));
        }
      }
      const unmatched = tanks.filter((tank) => !findCatalogEntry(tank, catalog));
      console.log('UNMATCHED COUNT', unmatched.length);
      if (unmatched.length > 0) console.log('UNMATCHED SAMPLE', unmatched.slice(0, 20).map((t) => ({nombre:t.nombre, display_name:t.display_name, tag:t.tag, id:t.id})));
      console.log('TOTAL_TANKS', tanks.length);
    } catch (err) {
      console.error('PARSE_ERROR', err.message);
      console.error(data.slice(0, 1000));
    }
  });
});
req.on('error', (err) => console.error('REQUEST_ERROR', err.message));
