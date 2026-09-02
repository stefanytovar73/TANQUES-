import http from 'node:http';
import { mergeApiTanquesWithCatalog, loadCatalog } from '../src/config/tankCatalog.js';
import { NODES as STATIC_NODES } from '../src/components/distritos/districtLayout.js';

const url = 'http://127.0.0.1:8001/api/tanques';

const req = http.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => (data += chunk));
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      const tanks = json.tanques || [];
      const merged = mergeApiTanquesWithCatalog(tanks, loadCatalog());

      console.log('TOTAL_TANKS_API:', tanks.length);
      const mapped = [];
      for (const node of STATIC_NODES) {
        if (node.type !== 'tank') continue;
        const nodeLabelNorm = (node.label || node.id || '').toString().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9 ]+/g, '').trim();
        const match = merged.find((t) => {
          if (!t) return false;
          const candidates = [t.id != null ? String(t.id) : '', t.tag, t.display_name, t.nombre, ...(t.aliases || [])].filter(Boolean).map(s => s.toString().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9 ]+/g, '').trim());
          return candidates.some(c => c === nodeLabelNorm || c.includes(nodeLabelNorm) || nodeLabelNorm.includes(c));
        });
        mapped.push({ nodeId: node.id, label: node.label, matched: match ? { id: match.id, tag: match.tag, display_name: match.display_name, valor_m: match.valor_m, porcentaje: match.porcentaje } : null });
      }
      console.table(mapped);
      const missing = mapped.filter(m => !m.matched);
      console.log('NODES_WITHOUT_MATCH:', missing.length, missing.map(m => m.nodeId));
    } catch (err) {
      console.error('PARSE_ERROR', err.message);
    }
  });
});
req.on('error', (err) => console.error('REQUEST_ERROR', err.message));
