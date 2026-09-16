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

const normalizeTanquesResponse = (payload) => {
  if (!payload || typeof payload !== "object") {
    const error = new Error("Respuesta inválida de /api/tanques");
    error.code = "INVALID_TANQUES_RESPONSE";
    throw error;
  }

  const status = String(payload.status || "").toLowerCase();
  if (status === "error" || status === "invalid" || status === "fallback") {
    const error = new Error(payload.mensaje || "IBAL no devolvió datos válidos");
    error.code = "IBAL_CONNECTION_ERROR";
    throw error;
  }

  if (!Array.isArray(payload.tanques)) {
    const error = new Error("La respuesta de /api/tanques no incluye tanques válidos");
    error.code = "INVALID_TANQUES_RESPONSE";
    throw error;
  }

  return payload;
};

const tanqueService = {
  getTanques: async (forceRefresh = false) => {
    const now = Date.now();
    if (!forceRefresh && cache && now < cacheExpiresAt) {
      return cache;
    }

    // If the page included an early inline fetch, reuse its payload to avoid extra network delays.
    try {
      if (!forceRefresh && !cache && typeof window !== 'undefined' && window.__INITIAL_TANQUES) {
        cache = window.__INITIAL_TANQUES;
        cacheExpiresAt = Date.now() + CACHE_TTL_MS;
        return cache;
      }
    } catch (e) {}

    if (pendingRequest && !forceRefresh) {
      return pendingRequest;
    }

    pendingRequest = api.get("/tanques").then((response) => {
      const payload = normalizeTanquesResponse(response.data);
      cache = payload;
      cacheExpiresAt = Date.now() + CACHE_TTL_MS;
      pendingRequest = null;
      return cache;
    }).catch((error) => {
      cache = null;
      cacheExpiresAt = 0;
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

    // Reuse inline-initialized PTAP payload if available to avoid duplicated network delay.
    try {
      if (!forceRefresh && !tankServiceInternal.ptapCache && typeof window !== 'undefined' && window.__INITIAL_PTAP) {
        tankServiceInternal.ptapCache = window.__INITIAL_PTAP;
        tankServiceInternal.ptapExpiresAt = Date.now() + CACHE_TTL_MS;
        return tankServiceInternal.ptapCache;
      }
    } catch (e) {}

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
