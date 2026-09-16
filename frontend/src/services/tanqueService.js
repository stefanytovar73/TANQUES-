import api from "../api/axios";

let cache = null;
let cacheExpiresAt = 0;
let pendingRequest = null;

const CACHE_TTL_MS = 30000;
const LAST_KNOWN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const STORAGE_KEYS = {
  tanquesFresh: 'tanques_api_fresh_v1',
  tanquesLast: 'tanques_api_last_v1',
  captacionFresh: 'captacion_api_fresh_v1',
  captacionLast: 'captacion_api_last_v1',
  ptapFresh: 'ptap_api_fresh_v1',
  ptapLast: 'ptap_api_last_v1',
};

const tankServiceInternal = {
  captacionCache: null,
  captacionExpiresAt: 0,
  captacionPending: null,
  ptapCache: null,
  ptapExpiresAt: 0,
  ptapPending: null,
};

const readStored = (storage, key, maxAgeMs = null) => {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Object.prototype.hasOwnProperty.call(parsed, 'data')) return null;

    const savedAt = Number(parsed.savedAt || 0);
    if (maxAgeMs != null && (!savedAt || Date.now() - savedAt > maxAgeMs)) return null;
    if (parsed.expiresAt != null && Date.now() >= Number(parsed.expiresAt)) return null;
    return parsed.data;
  } catch {
    return null;
  }
};

const writeStored = (storage, key, data, expiresAt = null) => {
  try {
    storage.setItem(key, JSON.stringify({
      data,
      savedAt: Date.now(),
      ...(expiresAt != null ? { expiresAt } : {}),
    }));
  } catch {
    // El caché es solo una optimización.
  }
};

const readFreshSession = (key) => {
  try { return readStored(sessionStorage, key); } catch { return null; }
};
const readLastKnown = (key) => {
  try { return readStored(localStorage, key, LAST_KNOWN_MAX_AGE_MS); } catch { return null; }
};

const invalidateCache = () => {
  cache = null;
  cacheExpiresAt = 0;
  pendingRequest = null;
  try { sessionStorage.removeItem(STORAGE_KEYS.tanquesFresh); } catch {}
  try { localStorage.removeItem(STORAGE_KEYS.tanquesLast); } catch {}
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

const getMetric = async ({ kind, url, freshKey, lastKey, initialWindowKey, forceRefresh = false }) => {
  const cacheKey = `${kind}Cache`;
  const expiresKey = `${kind}ExpiresAt`;
  const pendingKey = `${kind}Pending`;
  const now = Date.now();

  if (!forceRefresh && tankServiceInternal[cacheKey] && now < tankServiceInternal[expiresKey]) {
    return tankServiceInternal[cacheKey];
  }

  if (!forceRefresh && !tankServiceInternal[cacheKey]) {
    try {
      const initial = typeof window !== 'undefined' ? window[initialWindowKey] : null;
      if (initial) {
        tankServiceInternal[cacheKey] = initial;
        tankServiceInternal[expiresKey] = now + CACHE_TTL_MS;
        return initial;
      }
    } catch {}

    const fresh = readFreshSession(freshKey);
    if (fresh) {
      tankServiceInternal[cacheKey] = fresh;
      tankServiceInternal[expiresKey] = now + CACHE_TTL_MS;
      return fresh;
    }
  }

  // Nunca duplicar una llamada en curso; todos los consumidores comparten la misma promesa.
  if (tankServiceInternal[pendingKey]) return tankServiceInternal[pendingKey];

  tankServiceInternal[pendingKey] = api.get(url)
    .then((res) => {
      const data = res.data;
      const expiresAt = Date.now() + CACHE_TTL_MS;
      tankServiceInternal[cacheKey] = data;
      tankServiceInternal[expiresKey] = expiresAt;
      writeStored(sessionStorage, freshKey, data, expiresAt);
      writeStored(localStorage, lastKey, data);
      return data;
    })
    .finally(() => {
      tankServiceInternal[pendingKey] = null;
    });

  return tankServiceInternal[pendingKey];
};

const peekMetric = (kind, freshKey, lastKey) => {
  const cacheKey = `${kind}Cache`;
  const expiresKey = `${kind}ExpiresAt`;
  if (tankServiceInternal[cacheKey] && Date.now() < tankServiceInternal[expiresKey]) {
    return tankServiceInternal[cacheKey];
  }
  return readFreshSession(freshKey) || readLastKnown(lastKey);
};

const tanqueService = {
  getTanques: async (forceRefresh = false) => {
    const now = Date.now();
    if (!forceRefresh && cache && now < cacheExpiresAt) return cache;

    if (!forceRefresh && !cache) {
      try {
        if (typeof window !== 'undefined' && window.__INITIAL_TANQUES) {
          cache = normalizeTanquesResponse(window.__INITIAL_TANQUES);
          cacheExpiresAt = now + CACHE_TTL_MS;
          return cache;
        }
      } catch {}

      const fresh = readFreshSession(STORAGE_KEYS.tanquesFresh);
      if (fresh) {
        cache = normalizeTanquesResponse(fresh);
        cacheExpiresAt = now + CACHE_TTL_MS;
        return cache;
      }
    }

    if (pendingRequest) return pendingRequest;

    pendingRequest = api.get("/tanques")
      .then((response) => {
        cache = normalizeTanquesResponse(response.data);
        cacheExpiresAt = Date.now() + CACHE_TTL_MS;
        writeStored(sessionStorage, STORAGE_KEYS.tanquesFresh, cache, cacheExpiresAt);
        writeStored(localStorage, STORAGE_KEYS.tanquesLast, cache);
        return cache;
      })
      .finally(() => {
        pendingRequest = null;
      });

    return pendingRequest;
  },

  peekTanques: () => {
    if (cache && Date.now() < cacheExpiresAt) return cache;
    const candidate = readFreshSession(STORAGE_KEYS.tanquesFresh) || readLastKnown(STORAGE_KEYS.tanquesLast);
    try { return candidate ? normalizeTanquesResponse(candidate) : null; } catch { return null; }
  },

  getCaptacion: async (forceRefresh = false) => getMetric({
    kind: 'captacion',
    url: '/caudales/captacion',
    freshKey: STORAGE_KEYS.captacionFresh,
    lastKey: STORAGE_KEYS.captacionLast,
    initialWindowKey: '__INITIAL_CAPTACION',
    forceRefresh,
  }),

  peekCaptacion: () => peekMetric('captacion', STORAGE_KEYS.captacionFresh, STORAGE_KEYS.captacionLast),

  getPtap: async (forceRefresh = false) => getMetric({
    kind: 'ptap',
    url: '/caudales/ptap',
    freshKey: STORAGE_KEYS.ptapFresh,
    lastKey: STORAGE_KEYS.ptapLast,
    initialWindowKey: '__INITIAL_PTAP',
    forceRefresh,
  }),

  peekPtap: () => peekMetric('ptap', STORAGE_KEYS.ptapFresh, STORAGE_KEYS.ptapLast),

  // Inicia las tres fuentes de Distritos al mismo tiempo.
  preloadDistrictData: async (forceRefresh = false) => {
    const [tanques, captacion, ptap] = await Promise.allSettled([
      tanqueService.getTanques(forceRefresh),
      tanqueService.getCaptacion(forceRefresh),
      tanqueService.getPtap(forceRefresh),
    ]);
    return {
      tanques: tanques.status === 'fulfilled' ? tanques.value : null,
      captacion: captacion.status === 'fulfilled' ? captacion.value : null,
      ptap: ptap.status === 'fulfilled' ? ptap.value : null,
    };
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
