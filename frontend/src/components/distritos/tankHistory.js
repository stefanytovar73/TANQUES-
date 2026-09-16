const STORAGE_KEY = 'district:tank-level-history:v1';
const MAX_AGE_MS = 35 * 24 * 60 * 60 * 1000;
const MAX_POINTS_PER_TANK = 1600;

const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const getTankHistoryKey = (tank = {}) => {
  const tag = String(tank?.tag || tank?.apiTag || '').trim();
  if (tag) return tag.toUpperCase();
  const name = tank?.originalName || tank?.apiName || tank?.display_name || tank?.nombre || tank?.label || tank?.id || '';
  return normalize(name);
};

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const getHistoryStatus = (tank = {}) => {
  const level = toNumberOrNull(tank?.valor_m ?? tank?.nivel);
  if (tank?.sin_datos === true || level === null) return 'SIN DATOS';

  const quality = String(tank?.calidad || tank?.alarmas_calidad || '').trim().toUpperCase();
  if (quality === 'DUDOSA') return 'DUDOSA';

  const levelState = String(tank?.estado_nivel || '').trim().toUpperCase();
  if (tank?.alerta === true || levelState === 'REBOSE' || levelState === 'VACIO' || levelState === 'CRITICO') {
    return 'CRITICO';
  }

  return 'OK';
};

const parseTimestamp = (tank = {}) => {
  const raw = tank?.fecha_hora || tank?.timestamp || tank?.updated_at || tank?.updatedAt || null;
  if (raw) {
    const normalized = String(raw).includes('T') ? String(raw) : String(raw).replace(' ', 'T');
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
  }
  return Date.now();
};

const readAll = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
};

const writeAll = (payload) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    // Histórico local: si el navegador no permite escribir, no afecta la telemetría.
  }
};

export const appendTankHistory = (tanks = []) => {
  if (typeof window === 'undefined' || !Array.isArray(tanks) || !tanks.length) return;

  const store = readAll();
  const now = Date.now();
  const cutoff = now - MAX_AGE_MS;

  for (const tank of tanks) {
    if (!tank || typeof tank !== 'object') continue;
    const key = getTankHistoryKey(tank);
    if (!key) continue;

    const timestamp = parseTimestamp(tank);
    const nivel = toNumberOrNull(tank?.valor_m ?? tank?.nivel);
    const porcentaje = toNumberOrNull(
      tank?.porcentaje_capacidad ??
      tank?.porcentaje ??
      tank?.porcentaje_api ??
      tank?.pct
    );

    const point = {
      t: timestamp,
      nivel,
      porcentaje,
      status: getHistoryStatus(tank),
      calidad: tank?.calidad ?? null,
      estado_nivel: tank?.estado_nivel ?? null,
    };

    const current = Array.isArray(store[key]) ? store[key] : [];
    const filtered = current.filter((item) => item && Number(item.t) >= cutoff);
    const last = filtered[filtered.length - 1];

    if (last && Number(last.t) === timestamp) {
      filtered[filtered.length - 1] = point;
    } else {
      filtered.push(point);
    }

    store[key] = filtered.slice(-MAX_POINTS_PER_TANK);
  }

  writeAll(store);
};

export const readTankHistory = (tank = {}, range = '24h') => {
  if (typeof window === 'undefined') return [];
  const key = getTankHistoryKey(tank);
  if (!key) return [];

  const store = readAll();
  const rows = Array.isArray(store[key]) ? store[key] : [];
  const now = Date.now();
  const rangeMs = range === 'month'
    ? 30 * 24 * 60 * 60 * 1000
    : range === 'week'
      ? 7 * 24 * 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;
  const cutoff = now - rangeMs;

  const filtered = rows
    .filter((item) => item && Number(item.t) >= cutoff)
    .sort((a, b) => Number(a.t) - Number(b.t));

  // Mantener la gráfica ágil incluso después de acumular un mes completo.
  if (filtered.length <= 320) return filtered;
  const stride = Math.ceil(filtered.length / 320);
  return filtered.filter((_, index) => index % stride === 0 || index === filtered.length - 1);
};
