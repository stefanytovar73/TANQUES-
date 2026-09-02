import api from "../api/axios";

let cache = null;
let cacheExpiresAt = 0;
let pendingRequest = null;
const CACHE_TTL_MS = 30000;

const tankServiceInternal = {};

const invalidateCache = () => {
  cache = null;
  cacheExpiresAt = 0;
  pendingRequest = null;
};

const tanqueService = {
  getTanques: async (forceRefresh = false) => {
    const now = Date.now();
    if (!forceRefresh && cache && now < cacheExpiresAt) {
      return cache;
    }

    if (pendingRequest && !forceRefresh) {
      return pendingRequest;
    }

    pendingRequest = api.get("/tanques").then((response) => {
      cache = response.data;
      cacheExpiresAt = Date.now() + CACHE_TTL_MS;
      pendingRequest = null;
      return cache;
    }).catch((error) => {
      pendingRequest = null;
      throw error;
    });

    return pendingRequest;
  },

  getCaptacion: async (forceRefresh = false) => {
    // cache específico para captacion
    if (!tankServiceInternal.captacionCache) {
      tankServiceInternal.captacionCache = null;
      tankServiceInternal.captacionExpiresAt = 0;
      tankServiceInternal.captacionPending = null;
    }

    const now = Date.now();
    if (!forceRefresh && tankServiceInternal.captacionCache && now < tankServiceInternal.captacionExpiresAt) {
      return tankServiceInternal.captacionCache;
    }

    if (tankServiceInternal.captacionPending && !forceRefresh) {
      return tankServiceInternal.captacionPending;
    }

    tankServiceInternal.captacionPending = api.get('/caudales/captacion').then((res) => {
      tankServiceInternal.captacionCache = res.data;
      tankServiceInternal.captacionExpiresAt = Date.now() + CACHE_TTL_MS;
      tankServiceInternal.captacionPending = null;
      return tankServiceInternal.captacionCache;
    }).catch((err) => { tankServiceInternal.captacionPending = null; throw err; });

    return tankServiceInternal.captacionPending;
  },

  getPtap: async (forceRefresh = false) => {
    if (!tankServiceInternal.ptapCache) {
      tankServiceInternal.ptapCache = null;
      tankServiceInternal.ptapExpiresAt = 0;
      tankServiceInternal.ptapPending = null;
    }

    const now = Date.now();
    if (!forceRefresh && tankServiceInternal.ptapCache && now < tankServiceInternal.ptapExpiresAt) {
      return tankServiceInternal.ptapCache;
    }

    if (tankServiceInternal.ptapPending && !forceRefresh) {
      return tankServiceInternal.ptapPending;
    }

    tankServiceInternal.ptapPending = api.get('/caudales/ptap').then((res) => {
      tankServiceInternal.ptapCache = res.data;
      tankServiceInternal.ptapExpiresAt = Date.now() + CACHE_TTL_MS;
      tankServiceInternal.ptapPending = null;
      return tankServiceInternal.ptapCache;
    }).catch((err) => { tankServiceInternal.ptapPending = null; throw err; });

    return tankServiceInternal.ptapPending;
  },

  getTanqueById: async (id) => {
    const response = await api.get(`/tanques/${id}`);
    return response.data;
  },
  createTanque: async (payload) => {
    invalidateCache();
    const response = await api.post('/tanques', payload);
    return response.data;
  },
  updateTanque: async (id, payload) => {
    invalidateCache();
    const response = await api.put(`/tanques/${id}`, payload);
    return response.data;
  },
  deleteTanque: async (id) => {
    invalidateCache();
    const response = await api.delete(`/tanques/${id}`);
    return response.data;
  }
};

export default tanqueService;
