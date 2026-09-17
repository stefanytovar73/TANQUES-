const STORAGE_KEY = 'ibal-tanques:level-history:v1';
const SAMPLE_BUCKET_MS = 15 * 60 * 1000;
const RETENTION_MS = 31 * 24 * 60 * 60 * 1000;
const MAX_SAMPLES_PER_TANK = 3000;
const EMERGENCY_MAX_SAMPLES_PER_TANK = 1200;

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeKeyPart = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9_-]+/g, '-');

const getCandidateKeys = (tank = {}) => {
  const values = [
    tank.tag,
    tank._api_id,
    tank.id,
    tank.apiName,
    tank.originalName,
    tank.display_name,
    tank.nombre,
    tank.name,
    tank.label,
  ];

  return [...new Set(values.map(normalizeKeyPart).filter(Boolean))];
};

export const getTankHistoryKey = (tank = {}) => getCandidateKeys(tank)[0] || 'tanque-sin-id';

const readStore = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeStore = (store) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    // Si el navegador llega al límite de localStorage, conservar una ventana
    // más pequeña en vez de romper la actualización de /tanques.
    try {
      const compact = {};
      Object.entries(store || {}).forEach(([key, entry]) => {
        compact[key] = {
          ...entry,
          samples: Array.isArray(entry?.samples)
            ? entry.samples.slice(-EMERGENCY_MAX_SAMPLES_PER_TANK)
            : [],
        };
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
      return true;
    } catch {
      return false;
    }
  }
};

const resolveTimestamp = (tank = {}) => {
  const candidates = [
    tank.fecha_hora,
    tank.fechaHora,
    tank.updated_at,
    tank.updatedAt,
    tank.timestamp,
    tank.fecha,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = new Date(candidate).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }

  return Date.now();
};

const resolveHeight = (tank = {}) => toFiniteNumber(
  tank.altura_rebose
  ?? tank.altura_rebose_m
  ?? tank.altura_rebose_calibrada
  ?? tank.nivel_maximo
);

const resolveLevel = (tank = {}) => toFiniteNumber(
  tank.valor_m
  ?? tank.nivel
  ?? tank.valor
  ?? tank.level_m
  ?? tank.level
);

const resolvePercentage = (tank = {}, level = null, height = null) => {
  const direct = toFiniteNumber(
    tank.porcentaje_capacidad
    ?? tank.porcentaje_api
    ?? tank.porcentaje
  );
  if (direct !== null) return direct;
  if (level !== null && height !== null && height > 0) return (level / height) * 100;
  return null;
};

const resolveName = (tank = {}) => (
  tank.customName
  || tank.display_name
  || tank.nombre
  || tank.name
  || tank.label
  || tank.tag
  || 'Tanque'
);

const findEntryKey = (store, tank = {}) => {
  const candidates = getCandidateKeys(tank);
  for (const key of candidates) {
    if (store[key]) return key;
  }

  for (const [key, entry] of Object.entries(store || {})) {
    const aliases = Array.isArray(entry?.aliases) ? entry.aliases : [];
    if (candidates.some((candidate) => aliases.includes(candidate))) return key;
  }

  return candidates[0] || null;
};

export function recordTankHistoryPayload(payload) {
  if (typeof localStorage === 'undefined') return;

  const tanks = Array.isArray(payload?.tanques)
    ? payload.tanques
    : (Array.isArray(payload) ? payload : []);
  if (!tanks.length) return;

  const store = readStore();
  const cutoff = Date.now() - RETENTION_MS;
  let changed = false;

  for (const tank of tanks) {
    if (!tank || typeof tank !== 'object') continue;

    const level = resolveLevel(tank);
    if (level === null) continue;

    const aliases = getCandidateKeys(tank);
    const key = findEntryKey(store, tank) || aliases[0];
    if (!key) continue;

    const height = resolveHeight(tank);
    const percentage = resolvePercentage(tank, level, height);
    const rawTimestamp = resolveTimestamp(tank);
    const bucketTimestamp = Math.floor(rawTimestamp / SAMPLE_BUCKET_MS) * SAMPLE_BUCKET_MS;

    const previous = store[key] && typeof store[key] === 'object' ? store[key] : {};
    let samples = Array.isArray(previous.samples) ? [...previous.samples] : [];

    samples = samples.filter((sample) => Array.isArray(sample) && Number(sample[0]) >= cutoff);

    const nextSample = [
      bucketTimestamp,
      Number(level.toFixed(4)),
      percentage === null ? null : Number(percentage.toFixed(3)),
      height === null ? null : Number(height.toFixed(4)),
    ];

    const lastIndex = samples.length - 1;
    if (lastIndex >= 0 && Number(samples[lastIndex]?.[0]) === bucketTimestamp) {
      samples[lastIndex] = nextSample;
    } else {
      samples.push(nextSample);
    }

    if (samples.length > MAX_SAMPLES_PER_TANK) {
      samples = samples.slice(-MAX_SAMPLES_PER_TANK);
    }

    store[key] = {
      name: resolveName(tank),
      aliases: [...new Set([...(previous.aliases || []), ...aliases])].slice(0, 12),
      samples,
    };
    changed = true;
  }

  if (changed) writeStore(store);
}

export function getTankHistory(tank = {}, rangeMs = 24 * 60 * 60 * 1000) {
  if (typeof localStorage === 'undefined') return [];

  const store = readStore();
  const key = findEntryKey(store, tank);
  const entry = key ? store[key] : null;
  const cutoff = Date.now() - rangeMs;
  const samples = Array.isArray(entry?.samples) ? entry.samples : [];

  const rows = samples
    .filter((sample) => Array.isArray(sample) && Number(sample[0]) >= cutoff)
    .map((sample) => ({
      timestamp: Number(sample[0]),
      nivel: toFiniteNumber(sample[1]),
      porcentaje: toFiniteNumber(sample[2]),
      altura: toFiniteNumber(sample[3]),
    }))
    .filter((row) => Number.isFinite(row.timestamp) && row.nivel !== null);

  // Siempre incluir la lectura actual aunque aún no haya cerrado el bloque de 15 min.
  const currentLevel = resolveLevel(tank);
  if (currentLevel !== null) {
    const currentHeight = resolveHeight(tank);
    const currentPercentage = resolvePercentage(tank, currentLevel, currentHeight);
    const currentTimestamp = resolveTimestamp(tank);
    const last = rows[rows.length - 1];

    if (!last || Math.abs(last.timestamp - currentTimestamp) > 60 * 1000) {
      rows.push({
        timestamp: currentTimestamp,
        nivel: currentLevel,
        porcentaje: currentPercentage,
        altura: currentHeight,
      });
    } else {
      rows[rows.length - 1] = {
        timestamp: currentTimestamp,
        nivel: currentLevel,
        porcentaje: currentPercentage,
        altura: currentHeight,
      };
    }
  }

  return rows.sort((a, b) => a.timestamp - b.timestamp);
}

export function downsampleTankHistory(rows = [], maxPoints = 180) {
  if (!Array.isArray(rows) || rows.length <= maxPoints) return rows || [];

  const stride = Math.ceil(rows.length / maxPoints);
  const sampled = [];
  for (let index = 0; index < rows.length; index += stride) {
    const slice = rows.slice(index, index + stride);
    if (!slice.length) continue;

    const avg = (field) => {
      const values = slice.map((row) => toFiniteNumber(row[field])).filter((value) => value !== null);
      if (!values.length) return null;
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };

    sampled.push({
      timestamp: slice[Math.floor(slice.length / 2)].timestamp,
      nivel: avg('nivel'),
      porcentaje: avg('porcentaje'),
      altura: avg('altura'),
    });
  }

  const last = rows[rows.length - 1];
  if (sampled[sampled.length - 1]?.timestamp !== last?.timestamp) sampled.push(last);
  return sampled;
}

export const tankHistoryInternals = {
  STORAGE_KEY,
  SAMPLE_BUCKET_MS,
  RETENTION_MS,
};
