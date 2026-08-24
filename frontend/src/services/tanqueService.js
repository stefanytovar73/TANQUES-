import api from "../api/axios";

let cache = null;
let cacheExpiresAt = 0;
let pendingRequest = null;
const CACHE_TTL_MS = 60000;

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
