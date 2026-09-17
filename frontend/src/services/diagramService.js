import api from '../api/axios';

const FILTERS_SPACING_MIGRATION_KEY = 'district_filters_nuevos_spacing_v2';

const normalizeName = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const getNodeName = (id, entry = {}) => normalizeName(
  entry.customName
  || entry.label
  || entry.display_name
  || entry.nombre
  || entry.name
  || id
);

const getPosition = (entry = {}) => ({
  x: Number.isFinite(Number(entry.x))
    ? Number(entry.x)
    : (Number.isFinite(Number(entry.position?.x)) ? Number(entry.position.x) : 0),
  y: Number.isFinite(Number(entry.y))
    ? Number(entry.y)
    : (Number.isFinite(Number(entry.position?.y)) ? Number(entry.position.y) : 0),
});

const getSize = (entry = {}) => ({
  width: Number.isFinite(Number(entry.width)) && Number(entry.width) > 0 ? Number(entry.width) : 120,
  height: Number.isFinite(Number(entry.height)) && Number(entry.height) > 0 ? Number(entry.height) : 68,
});

const setPosition = (entry = {}, x, y) => ({
  ...entry,
  x,
  y,
  ...(entry.position && typeof entry.position === 'object'
    ? { position: { ...entry.position, x, y } }
    : {}),
});

const getCenter = (entry = {}) => {
  const position = getPosition(entry);
  const size = getSize(entry);
  return {
    x: position.x + size.width / 2,
    y: position.y + size.height / 2,
    width: size.width,
    height: size.height,
  };
};

const getEdgeEndpoints = (edge = {}) => ({
  source: edge.source ?? edge.from ?? edge.sourceId ?? null,
  target: edge.target ?? edge.to ?? edge.targetId ?? null,
});

const applyFiltersSpacingMigration = (inputState) => {
  const state = inputState && typeof inputState === 'object' ? inputState : {};
  const rawNodes = state.nodes;
  const nodeEntries = Array.isArray(rawNodes)
    ? rawNodes.filter(Boolean).map((entry) => [String(entry.id || ''), entry])
    : (rawNodes && typeof rawNodes === 'object' ? Object.entries(rawNodes) : []);

  if (!nodeEntries.length) return { state, changed: false, handled: false };

  const nodes = Object.fromEntries(
    nodeEntries
      .filter(([id]) => id)
      .map(([id, entry]) => [id, entry && typeof entry === 'object' ? { ...entry } : entry])
  );
  const entries = Object.entries(nodes);
  const findNode = (predicate) => entries.find(([id, entry]) => predicate(getNodeName(id, entry), id, entry)) || null;

  const filters = findNode((name) => name.includes('filtro') && name.includes('nuev'));
  const camera = findNode((name) => name.includes('camara') && name.includes('quiebre'));
  if (!filters) return { state, changed: false, handled: false };

  const [filtersId, filtersEntry] = filters;
  const edges = Array.isArray(state.edges) ? state.edges : [];
  let neighborId = null;

  if (camera) {
    const cameraId = camera[0];
    const directEdge = edges.find((edge) => {
      const { source, target } = getEdgeEndpoints(edge || {});
      return (source === filtersId && target === cameraId) || (source === cameraId && target === filtersId);
    });
    if (directEdge) neighborId = cameraId;
  }

  if (!neighborId) {
    const incident = edges.find((edge) => {
      const { source, target } = getEdgeEndpoints(edge || {});
      return source === filtersId || target === filtersId;
    });
    if (incident) {
      const { source, target } = getEdgeEndpoints(incident);
      neighborId = source === filtersId ? target : source;
    }
  }

  if (!neighborId && camera) neighborId = camera[0];
  const neighborEntry = neighborId ? nodes[neighborId] : null;
  if (!neighborEntry) return { state, changed: false, handled: false };

  const filtersCenter = getCenter(filtersEntry);
  const neighborCenter = getCenter(neighborEntry);
  const dx = filtersCenter.x - neighborCenter.x;
  const dy = filtersCenter.y - neighborCenter.y;
  const distance = Math.hypot(dx, dy);

  if (!Number.isFinite(distance) || distance <= 0) {
    return { state, changed: false, handled: true };
  }

  const ux = dx / distance;
  const uy = dy / distance;
  const filtersRadius = Math.abs(ux) * filtersCenter.width / 2 + Math.abs(uy) * filtersCenter.height / 2;
  const neighborRadius = Math.abs(ux) * neighborCenter.width / 2 + Math.abs(uy) * neighborCenter.height / 2;
  const desiredDistance = filtersRadius + neighborRadius + 78;

  // Solo corregir un hueco claramente excesivo. Si el usuario ya lo dejó cerca,
  // la migración no modifica su posición manual.
  if (distance <= desiredDistance + 110) {
    return { state, changed: false, handled: true };
  }

  const nextCenterX = neighborCenter.x + ux * desiredDistance;
  const nextCenterY = neighborCenter.y + uy * desiredDistance;
  const nextX = Math.round((nextCenterX - filtersCenter.width / 2) * 10) / 10;
  const nextY = Math.round((nextCenterY - filtersCenter.height / 2) * 10) / 10;
  nodes[filtersId] = setPosition(filtersEntry, nextX, nextY);

  const nextNodes = Array.isArray(rawNodes)
    ? rawNodes.map((entry) => String(entry?.id || '') === filtersId ? nodes[filtersId] : entry)
    : nodes;
  const now = new Date().toISOString();

  return {
    state: {
      ...state,
      nodes: nextNodes,
      updated_at: now,
      _updatedAt: now,
      updatedAt: now,
    },
    changed: true,
    handled: true,
  };
};

const hasCompletedSpacingMigration = () => {
  try {
    return typeof localStorage !== 'undefined'
      && localStorage.getItem(FILTERS_SPACING_MIGRATION_KEY) === '1';
  } catch {
    return false;
  }
};

const markSpacingMigrationComplete = () => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(FILTERS_SPACING_MIGRATION_KEY, '1');
    }
  } catch {}
};

const diagramService = {
  getState: async () => {
    const res = await api.get('diagram/state');
    const remote = res.data || {};

    if (hasCompletedSpacingMigration()) return remote;

    const migrated = applyFiltersSpacingMigration(remote);
    if (!migrated.handled) return remote;

    if (!migrated.changed) {
      markSpacingMigrationComplete();
      return remote;
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('district_state', JSON.stringify(migrated.state));
      }
    } catch {}

    // Se devuelve de inmediato el estado corregido para que la interfaz lo pinte.
    // El marcador se fija solo cuando el servidor confirma el guardado, evitando
    // perder la corrección si la red falla en este primer intento.
    api.post('diagram/state', migrated.state)
      .then(() => markSpacingMigrationComplete())
      .catch(() => {});

    return migrated.state;
  },

  saveState: async (state) => {
    const payload = (state && typeof state === 'object')
      ? JSON.parse(JSON.stringify(state))
      : null;

    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const hasNodesKey = Object.prototype.hasOwnProperty.call(payload, 'nodes');
    const hasEdgesKey = Object.prototype.hasOwnProperty.call(payload, 'edges');
    const hasOtherKey = Object.keys(payload).some((key) => key !== 'nodes' && key !== 'edges');

    if (!hasNodesKey && !hasEdgesKey && !hasOtherKey) {
      return false;
    }

    await api.post('diagram/state', payload);
    return true;
  },
};

export default diagramService;
