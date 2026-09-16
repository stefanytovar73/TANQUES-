import api from '../api/axios';

const diagramService = {
  getState: async () => {
    const res = await api.get('diagram/state');
    return res.data || {};
  },
  saveState: async (state) => {
    try {
      const payload = (state && typeof state === 'object') ? JSON.parse(JSON.stringify(state)) : null;
      try {
        window.__diagTrace = Array.isArray(window.__diagTrace) ? window.__diagTrace : [];
        window.__diagTrace.push('DIAGRAM_SERVICE_SAVE_CALL');
        window.__diagTrace.push(`PAYLOAD_KEYS=${payload && typeof payload === 'object' ? Object.keys(payload).join(',') : 'missing'}`);
      } catch (_) {}
      console.info('[DIAGRAM TRACE] DIAGRAM_SERVICE_SAVE_CALL', payload && typeof payload === 'object' ? { keys: Object.keys(payload), nodeCount: Object.keys(payload.nodes || {}).length, edgeCount: Array.isArray(payload.edges) ? payload.edges.length : 0 } : { payload: 'missing' });
      if (!payload || typeof payload !== 'object') {
        try { console.log('[DIAGRAM SERVICE] skip saveState: payload missing or invalid'); } catch (e) {}
        return false;
      }
      const hasNodesKey = Object.prototype.hasOwnProperty.call(payload, 'nodes');
      const hasEdgesKey = Object.prototype.hasOwnProperty.call(payload, 'edges');
      const hasOtherKey = Object.keys(payload).some(k => k !== 'nodes' && k !== 'edges');
      if (!hasNodesKey && !hasEdgesKey && !hasOtherKey) {
        try { console.log('[DIAGRAM SERVICE] skip saveState: payload has no nodes/edges/other keys'); } catch (e) {}
        return false;
      }
      try { window.__diagTrace.push('POST_STARTED'); console.info('[DIAGRAM TRACE] POST_STARTED'); } catch (_) {}
      await api.post('diagram/state', payload || {});
      try { window.__diagTrace.push('POST_RESPONSE=200'); console.info('[DIAGRAM TRACE] POST_RESPONSE=200'); } catch (_) {}
      return true;
    } catch (e) {
      try { window.__diagTrace.push(`POST_ERROR=${e && e.message ? e.message : String(e)}`); console.info('[DIAGRAM TRACE] POST_ERROR', e && e.message ? e.message : String(e)); } catch (_) {}
      throw e;
    }
  }
};

export default diagramService;
