import api from "../api/axios";

let cache = null;
let cacheExpiresAt = 0;
let pendingRequest = null;

const CACHE_TTL_MS = 30000;
const LAST_KNOWN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const STORAGE_KEYS = {
  tanquesFresh: 'ibal-tanques:tanques-cache',
  tanquesLast: 'ibal-tanques:tanques-last-known',
  captacionFresh: 'ibal-tanques:captacion-cache',
  captacionLast: 'ibal-tanques:captacion-last-known',
  ptapFresh: 'ibal-tanques:ptap-cache',
  ptapLast: 'ibal-tanques:ptap-last-known',
};

const readStored = (storage, key, maxAgeMs = null) => {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.data) return null;

    if (maxAgeMs != null) {
      const savedAt = Number(parsed.savedAt || 0);
      if (!savedAt || Date.now() - savedAt > maxAgeMs) return null;
    }

    if (parsed.expiresAt != null && Date.now() >= Number(parsed.expiresAt)) {
      return null;
    }

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
    // Cache is an optimization only.
  }
};

const readFreshSession = (key) => readStored(sessionStorage, key);
const readLastKnown = (key) => readStored(localStorage, key, LAST_KNOWN_MAX_AGE_MS);

const tankServiceInternal = {
  captacionCache: null,
  captacionExpiresAt: 0,
  captacionPending: null,
  ptapCache: null,
  ptapExpiresAt: 0,
  ptapPending: null,
};

const invalidateCache = () => {
  cache = null;
  cacheExpiresAt = 0;
  pendingRequest = null;
  try { sessionStorage.removeItem(STORAGE_KEYS.tanquesFresh); } catch {}
  try { localStorage.removeItem(STORAGE_KEYS.tanquesLast); } catch {}
};

const getMetric = async ({
  kind,
  url,
  freshKey,
  lastKey,
  forceRefresh = false,
}) => {
  const cacheKey = `${kind}Cache`;
  const expiresKey = `${kind}ExpiresAt`;
  const pendingKey = `${kind}Pending`;
  const now = Date.now();

  if (!forceRefresh && tankServiceInternal[cacheKey] && now < tankServiceInternal[expiresKey]) {
    return tankServiceInternal[cacheKey];
  }

  if (!forceRefresh && !tankServiceInternal[cacheKey]) {
    const fresh = readFreshSession(freshKey);
    if (fresh) {
      tankServiceInternal[cacheKey] = fresh;
      tankServiceInternal[expiresKey] = now + CACHE_TTL_MS;
      return fresh;
    }
  }

  if (!forceRefresh && tankServiceInternal[pendingKey]) {
    return tankServiceInternal[pendingKey];
  }

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

    if (!forceRefresh && cache && now < cacheExpiresAt) {
      return cache;
    }

    if (!forceRefresh && !cache) {
      const fresh = readFreshSession(STORAGE_KEYS.tanquesFresh);
      if (fresh) {
        cache = fresh;
        cacheExpiresAt = now + CACHE_TTL_MS;
        return cache;
      }
    }

    if (pendingRequest && !forceRefresh) {
      return pendingRequest;
    }

    pendingRequest = api.get("/tanques")
      .then((response) => {
        cache = response.data;
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
    return readFreshSession(STORAGE_KEYS.tanquesFresh)
      || readLastKnown(STORAGE_KEYS.tanquesLast);
  },

  getCaptacion: async (forceRefresh = false) => getMetric({
    kind: 'captacion',
    url: '/caudales/captacion',
    freshKey: STORAGE_KEYS.captacionFresh,
    lastKey: STORAGE_KEYS.captacionLast,
    forceRefresh,
  }),

  peekCaptacion: () => peekMetric(
    'captacion',
    STORAGE_KEYS.captacionFresh,
    STORAGE_KEYS.captacionLast,
  ),

  getPtap: async (forceRefresh = false) => getMetric({
    kind: 'ptap',
    url: '/caudales/ptap',
    freshKey: STORAGE_KEYS.ptapFresh,
    lastKey: STORAGE_KEYS.ptapLast,
    forceRefresh,
  }),

  peekPtap: () => peekMetric(
    'ptap',
    STORAGE_KEYS.ptapFresh,
    STORAGE_KEYS.ptapLast,
  ),

  // Dispara las tres fuentes que usa Distritos al mismo tiempo. Esto evita
  // esperar a que ReactFlow monte cada tarjeta para recién consultar PTAP/captación.
  preloadDistrictData: async (forceRefresh = false) => {
    const [tanquesResult, captacionResult, ptapResult] = await Promise.allSettled([
      tanqueService.getTanques(forceRefresh),
      tanqueService.getCaptacion(forceRefresh),
      tanqueService.getPtap(forceRefresh),
    ]);

    return {
      tanques: tanquesResult.status === 'fulfilled' ? tanquesResult.value : null,
      captacion: captacionResult.status === 'fulfilled' ? captacionResult.value : null,
      ptap: ptapResult.status === 'fulfilled' ? ptapResult.value : null,
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
  },
};

export default tanqueService;
