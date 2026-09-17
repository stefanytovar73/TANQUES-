import api from '../api/axios';

// IMPORTANTE: estos ajustes NO deben cambiar type, handles, routeMode ni la forma
// de ninguna conexión. El único cambio de layout permitido aquí es acercar
// "Filtros Nuevos". Si el arreglo anterior alcanzó a convertir conexiones a
// Smart, intentamos restaurarlas desde el backup local que ya conserva DistrictFlow.
const FILTERS_SPACING_MIGRATION_KEY = 'district_filters_nuevos_spacing_v4_only';
const CONNECTION_RESTORE_KEY = 'district_restore_connections_after_v3_v1';
const BAD_LAYOUT_FIX_KEY = 'district_camera_filters_layout_v3';

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

const getEdgeLookupKey = (edge = {}) => {
  const { source, target } = getEdgeEndpoints(edge);
  return `${String(source || '')}|${String(target || '')}|${String(edge.label || '')}`;
};

const readLocalJson = (key) => {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const hasLocalFlag = (key) => {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};

const setLocalFlag = (key) => {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, '1');
  } catch {}
};

const restoreConnectionsFromBackup = (inputState) => {
  const state = inputState && typeof inputState === 'object' ? inputState : {};

  // Solo ejecutar esta recuperación si fue aplicado el arreglo que dañó rutas.
  if (!hasLocalFlag(BAD_LAYOUT_FIX_KEY) || hasLocalFlag(CONNECTION_RESTORE_KEY)) {
    return { state, changed: false, handled: false };
  }

  const backup = readLocalJson('district_state_backup');
  const backupEdges = Array.isArray(backup?.edges) ? backup.edges : [];
  const currentEdges = Array.isArray(state.edges) ? state.edges : [];
  if (!backupEdges.length || !currentEdges.length) {
    return { state, changed: false, handled: false };
  }

  const backupById = new Map();
  const backupByKey = new Map();
  for (const edge of backupEdges) {
    if (!edge || typeof edge !== 'object') continue;
    if (edge.id != null) backupById.set(String(edge.id), edge);
    backupByKey.set(getEdgeLookupKey(edge), edge);
  }

  let changed = false;
  const restoredEdges = currentEdges.map((edge) => {
    if (!edge || typeof edge !== 'object') return edge;

    // Firma exacta que dejó el arreglo anterior al forzar una conexión a Smart.
    const wasForcedByBadFix = edge.type === 'smart'
      && edge.data?.routeMode === 'smart'
      && edge.data?.manualPorts === false
      && edge.data?.autoPorts === true;

    if (!wasForcedByBadFix) return edge;

    const backupEdge = (edge.id != null ? backupById.get(String(edge.id)) : null)
      || backupByKey.get(getEdgeLookupKey(edge));
    if (!backupEdge) return edge;

    // Si el backup es distinto, devolver la conexión COMPLETA: tipo, handles,
    // estilo, etiqueta y cualquier configuración manual que tuviera el usuario.
    try {
      if (JSON.stringify(backupEdge) !== JSON.stringify(edge)) {
        changed = true;
        return JSON.parse(JSON.stringify(backupEdge));
      }
    } catch {}
    return edge;
  });

  return {
    state: changed ? { ...state, edges: restoredEdges } : state,
    changed,
    handled: true,
  };
};

const applyFiltersSpacingOnly = (inputState) => {
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

  // Preferir el elemento al que realmente está conectado Filtros Nuevos.
  const incidentNeighborIds = edges
    .map((edge) => {
      const { source, target } = getEdgeEndpoints(edge || {});
      if (String(source || '') === filtersId) return String(target || '');
      if (String(target || '') === filtersId) return String(source || '');
      return null;
    })
    .filter((id) => id && nodes[id]);

  if (camera && incidentNeighborIds.includes(camera[0])) {
    neighborId = camera[0];
  } else if (incidentNeighborIds.length) {
    const filtersCenter = getCenter(filtersEntry);
    neighborId = incidentNeighborIds
      .slice()
      .sort((a, b) => {
        const ca = getCenter(nodes[a]);
        const cb = getCenter(nodes[b]);
        return Math.hypot(ca.x - filtersCenter.x, ca.y - filtersCenter.y)
          - Math.hypot(cb.x - filtersCenter.x, cb.y - filtersCenter.y);
      })[0];
  } else if (camera) {
    neighborId = camera[0];
  }

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

  // Separación corta, similar al resto. Solo se mueve Filtros Nuevos; ninguna
  // conexión es recalculada, convertida ni reanclada.
  const desiredGap = 28;
  const desiredDistance = filtersRadius + neighborRadius + desiredGap;
  if (distance <= desiredDistance + 20) {
    return { state, changed: false, handled: true };
  }

  const nextCenterX = neighborCenter.x + (ux * desiredDistance);
  const nextCenterY = neighborCenter.y + (uy * desiredDistance);
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

const diagramService = {
  getState: async () => {
    const res = await api.get('diagram/state');
    const remote = res.data || {};

    let nextState = remote;
    let changed = false;
    let restoreHandled = false;
    let spacingHandled = false;

    const restored = restoreConnectionsFromBackup(nextState);
    nextState = restored.state;
    changed = changed || restored.changed;
    restoreHandled = restored.handled;

    if (!hasLocalFlag(FILTERS_SPACING_MIGRATION_KEY)) {
      const spaced = applyFiltersSpacingOnly(nextState);
      nextState = spaced.state;
      changed = changed || spaced.changed;
      spacingHandled = spaced.handled;
    }

    if (!changed) {
      if (restoreHandled) setLocalFlag(CONNECTION_RESTORE_KEY);
      if (spacingHandled) setLocalFlag(FILTERS_SPACING_MIGRATION_KEY);
      return nextState;
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('district_state', JSON.stringify(nextState));
      }
    } catch {}

    // Persistimos exactamente el estado recuperado/movido. No se toca ninguna
    // otra conexión ni se recalcula su geometría.
    api.post('diagram/state', nextState)
      .then(() => {
        if (restoreHandled) setLocalFlag(CONNECTION_RESTORE_KEY);
        if (spacingHandled) setLocalFlag(FILTERS_SPACING_MIGRATION_KEY);
      })
      .catch(() => {});

    return nextState;
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
