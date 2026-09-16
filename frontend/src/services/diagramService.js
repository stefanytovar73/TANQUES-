import api from '../api/axios';

let stateCache = null;
let stateCacheExpiresAt = 0;
let pendingStateRequest = null;
const STATE_CACHE_TTL_MS = 5000;

const diagramService = {
  getState: async (forceRefresh = false) => {
    const now = Date.now();
    if (!forceRefresh && stateCache && now < stateCacheExpiresAt) {
      return stateCache;
    }
    if (!forceRefresh && pendingStateRequest) {
      return pendingStateRequest;
    }

    pendingStateRequest = api.get('/diagram/state')
      .then((res) => {
        stateCache = res.data || {};
        stateCacheExpiresAt = Date.now() + STATE_CACHE_TTL_MS;
        return stateCache;
      })
      .catch(() => stateCache || {})
      .finally(() => {
        pendingStateRequest = null;
      });

    return pendingStateRequest;
  },

  saveState: async (state) => {
    const payload = state && typeof state === 'object' ? state : {};
    await api.post('/diagram/state', payload);
    stateCache = payload;
    stateCacheExpiresAt = Date.now() + STATE_CACHE_TTL_MS;
    return true;
  },

  peekState: () => stateCache,
};

export default diagramService;