import api from "../api/axios";

let cache = null;
let cacheExpiresAt = 0;
let pendingRequest = null;

let districtBootstrapCache = null;
let districtBootstrapExpiresAt = 0;
let districtBootstrapPending = null;

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

const seedTanques = (payload) => {
  const normalized = normalizeTanquesResponse(payload);
  const expiresAt = Date.now() + CACHE_TTL_MS;
  cache = normalized;
  cacheExpiresAt = expiresAt;
  writeStored(sessionStorage, STORAGE_KEYS.tanquesFresh, normalized, expiresAt);
  writeStored(localStorage, STORAGE_KEYS.tanquesLast, normalized);
  return normalized;
};

const seedMetric = (kind, payload, freshKey, lastKey) => {
  if (!payload || typeof payload !== 'object') return null;
  const expiresAt = Date.now() + CACHE_TTL_MS;
  tankServiceInternal[`${kind}Cache`] = payload;
  tankServiceInternal[`${kind}ExpiresAt`] = expiresAt;
  writeStored(sessionStorage, freshKey, payload, expiresAt);
  writeStored(localStorage, lastKey, payload);
  return payload;
};

const peekTanquesInternal = () => {
  if (cache && Date.now() < cacheExpiresAt) return cache;
  const candidate = readFreshSession(STORAGE_KEYS.tanquesFresh) || readLastKnown(STORAGE_KEYS.tanquesLast);
  try { return candidate ? normalizeTanquesResponse(candidate) : null; } catch { return null; }
};

const peekMetric = (kind, freshKey, lastKey) => {
  const cacheKey = `${kind}Cache`;
  const expiresKey = `${kind}ExpiresAt`;
  if (tankServiceInternal[cacheKey] && Date.now() < tankServiceInternal[expiresKey]) {
    return tankServiceInternal[cacheKey];
  }
  return readFreshSession(freshKey) || readLastKnown(lastKey);
};

const peekDistrictDataInternal = () => {
  const tanques = peekTanquesInternal();
  const captacion = peekMetric('captacion', STORAGE_KEYS.captacionFresh, STORAGE_KEYS.captacionLast);
  const ptap = peekMetric('ptap', STORAGE_KEYS.ptapFresh, STORAGE_KEYS.ptapLast);
  if (!tanques || !captacion || !ptap) return null;
  return { tanques, captacion, ptap };
};

const fetchTanquesDirect = async (forceRefresh = false) => {
  const now = Date.now();
  if (!forceRefresh && cache && now < cacheExpiresAt) return cache;

  if (!forceRefresh && !cache) {
    try {
      if (typeof window !== 'undefined' && window.__INITIAL_TANQUES) {
        return seedTanques(window.__INITIAL_TANQUES);
      }
    } catch {}

    const fresh = readFreshSession(STORAGE_KEYS.tanquesFresh);
    if (fresh) return seedTanques(fresh);
  }

  if (pendingRequest) return pendingRequest;

  pendingRequest = api.get("/tanques")
    .then((response) => seedTanques(response.data))
    .finally(() => {
      pendingRequest = null;
    });

  return pendingRequest;
};

const fetchMetricDirect = async ({ kind, url, freshKey, lastKey, initialWindowKey, forceRefresh = false }) => {
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
      if (initial) return seedMetric(kind, initial, freshKey, lastKey);
    } catch {}

    const fresh = readFreshSession(freshKey);
    if (fresh) return seedMetric(kind, fresh, freshKey, lastKey);
  }

  if (tankServiceInternal[pendingKey]) return tankServiceInternal[pendingKey];

  tankServiceInternal[pendingKey] = api.get(url)
    .then((res) => seedMetric(kind, res.data, freshKey, lastKey))
    .finally(() => {
      tankServiceInternal[pendingKey] = null;
    });

  return tankServiceInternal[pendingKey];
};

const seedBootstrap = (payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Respuesta inválida de /api/distritos/bootstrap');
  }

  const tanques = payload.tanques ? seedTanques(payload.tanques) : null;
  const captacion = payload.captacion
    ? seedMetric('captacion', payload.captacion, STORAGE_KEYS.captacionFresh, STORAGE_KEYS.captacionLast)
    : null;
  const ptap = payload.ptap
    ? seedMetric('ptap', payload.ptap, STORAGE_KEYS.ptapFresh, STORAGE_KEYS.ptapLast)
    : null;

  if (!tanques || !captacion || !ptap) {
    throw new Error('El bootstrap de Distritos llegó incompleto');
  }

  districtBootstrapCache = { tanques, captacion, ptap };
  districtBootstrapExpiresAt = Date.now() + CACHE_TTL_MS;
  return districtBootstrapCache;
};

const invalidateCache = () => {
  cache = null;
  cacheExpiresAt = 0;
  pendingRequest = null;
  districtBootstrapCache = null;
  districtBootstrapExpiresAt = 0;
  districtBootstrapPending = null;
  try { sessionStorage.removeItem(STORAGE_KEYS.tanquesFresh); } catch {}
  try { localStorage.removeItem(STORAGE_KEYS.tanquesLast); } catch {}
};

const tanqueService = {
  // Fuente principal de Distritos. El backend consulta tanques + captación + PTAP
  // en paralelo y no se libera el render hasta tener las tres fuentes.
  getDistrictBootstrap: async (forceRefresh = false) => {
    const now = Date.now();

    if (!forceRefresh && districtBootstrapCache && now < districtBootstrapExpiresAt) {
      return districtBootstrapCache;
    }

    if (!forceRefresh) {
      const cachedBundle = peekDistrictDataInternal();
      if (cachedBundle) {
        districtBootstrapCache = cachedBundle;
        districtBootstrapExpiresAt = now + CACHE_TTL_MS;
        // Refrescar en segundo plano sin bloquear la UI que ya tiene las tres fuentes.
        if (!districtBootstrapPending) {
          districtBootstrapPending = api.get('/distritos/bootstrap')
            .then((res) => seedBootstrap(res.data))
            .catch(() => cachedBundle)
            .finally(() => { districtBootstrapPending = null; });
        }
        return cachedBundle;
      }
    }

    if (districtBootstrapPending) return districtBootstrapPending;

    districtBootstrapPending = api.get('/distritos/bootstrap')
      .then((res) => seedBootstrap(res.data))
      .catch(async (bootstrapError) => {
        // Compatibilidad temporal si el backend local aún no se reinició o la
        // nueva ruta todavía no está disponible.
        const [tanquesResult, captacionResult, ptapResult] = await Promise.allSettled([
          fetchTanquesDirect(forceRefresh),
          fetchMetricDirect({
            kind: 'captacion',
            url: '/caudales/captacion',
            freshKey: STORAGE_KEYS.captacionFresh,
            lastKey: STORAGE_KEYS.captacionLast,
            initialWindowKey: '__INITIAL_CAPTACION',
            forceRefresh,
          }),
          fetchMetricDirect({
            kind: 'ptap',
            url: '/caudales/ptap',
            freshKey: STORAGE_KEYS.ptapFresh,
            lastKey: STORAGE_KEYS.ptapLast,
            initialWindowKey: '__INITIAL_PTAP',
            forceRefresh,
          }),
        ]);

        if (tanquesResult.status !== 'fulfilled' || captacionResult.status !== 'fulfilled' || ptapResult.status !== 'fulfilled') {
          throw bootstrapError;
        }

        districtBootstrapCache = {
          tanques: tanquesResult.value,
          captacion: captacionResult.value,
          ptap: ptapResult.value,
        };
        districtBootstrapExpiresAt = Date.now() + CACHE_TTL_MS;
        return districtBootstrapCache;
      })
      .finally(() => {
        districtBootstrapPending = null;
      });

    return districtBootstrapPending;
  },

  peekDistrictData: () => peekDistrictDataInternal(),

  getTanques: async (forceRefresh = false) => {
    const bundle = await tanqueService.getDistrictBootstrap(forceRefresh);
    return bundle.tanques;
  },

  peekTanques: () => peekTanquesInternal(),

  getCaptacion: async (forceRefresh = false) => {
    const bundle = await tanqueService.getDistrictBootstrap(forceRefresh);
    return bundle.captacion;
  },

  peekCaptacion: () => peekMetric('captacion', STORAGE_KEYS.captacionFresh, STORAGE_KEYS.captacionLast),

  getPtap: async (forceRefresh = false) => {
    const bundle = await tanqueService.getDistrictBootstrap(forceRefresh);
    return bundle.ptap;
  },

  peekPtap: () => peekMetric('ptap', STORAGE_KEYS.ptapFresh, STORAGE_KEYS.ptapLast),

  preloadDistrictData: async (forceRefresh = false) => tanqueService.getDistrictBootstrap(forceRefresh),

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
