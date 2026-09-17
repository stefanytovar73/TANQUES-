import api from '../api/axios';

let stateCache = null;
let stateCacheExpiresAt = 0;
let pendingStateRequest = null;
const STATE_CACHE_TTL_MS = 5000;
const LOCAL_STATE_KEY = 'district_state';
const MIGRATION_KEY = '_layoutMigrations';

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

const getEdgeEndpoints = (edge = {}) => ({
  source: edge.source ?? edge.from ?? edge.sourceId ?? null,
  target: edge.target ?? edge.to ?? edge.targetId ?? null,
});

const getNodeCenter = (entry = {}) => {
  const position = getPosition(entry);
  const size = getSize(entry);
  return {
    x: position.x + size.width / 2,
    y: position.y + size.height / 2,
    width: size.width,
    height: size.height,
  };
};

const chooseBorderHandles = (sourceEntry, targetEntry) => {
  if (!sourceEntry || !targetEntry) return null;
  const source = getNodeCenter(sourceEntry);
  const target = getNodeCenter(targetEntry);
  const dx = target.x - source.x;
  const dy = target.y - source.y;

  // Los nodos del editor comparten estos cuatro anclajes: salida derecha / abajo
  // y entrada izquierda / arriba. Solo fijamos un par cuando la dirección puede
  // representarse sin invertir el sentido real de la conexión.
  if (Math.abs(dx) >= Math.abs(dy) && dx >= 0) {
    return { sourceHandle: 's-right', targetHandle: 't-left' };
  }
  if (Math.abs(dy) > Math.abs(dx) && dy >= 0) {
    return { sourceHandle: 's-bottom', targetHandle: 't-top' };
  }
  return null;
};

const applyDiagramMigrations = (inputState) => {
  const state = inputState && typeof inputState === 'object'
    ? { ...inputState }
    : {};
  const rawNodes = state.nodes && typeof state.nodes === 'object' && !Array.isArray(state.nodes)
    ? state.nodes
    : null;
  const rawEdges = Array.isArray(state.edges) ? state.edges : [];

  if (!rawNodes) return { state, changed: false };

  const nodes = Object.fromEntries(
    Object.entries(rawNodes).map(([id, entry]) => [id, entry && typeof entry === 'object' ? { ...entry } : entry])
  );
  let edges = rawEdges.map((edge) => edge && typeof edge === 'object' ? { ...edge } : edge);
  const migrations = {
    ...(state[MIGRATION_KEY] && typeof state[MIGRATION_KEY] === 'object' ? state[MIGRATION_KEY] : {}),
  };
  let changed = false;

  const entries = Object.entries(nodes);
  const findNode = (predicate) => entries.find(([id, entry]) => predicate(getNodeName(id, entry), id, entry)) || null;

  const camera = findNode((name) => name.includes('camara') && name.includes('quiebre'));
  const filters = findNode((name) => name.includes('filtro') && name.includes('nuev'));

  // 1) Evitar que las líneas atraviesen Cámara de Quiebre: para las conexiones
  // que la tocan (y las de Filtros Nuevos), fijar el handle del borde que mira
  // hacia el otro elemento. El resto de conexiones se conserva exactamente igual.
  if (!migrations.cameraBorderConnectionsV1 && (camera || filters)) {
    const targetIds = new Set([camera?.[0], filters?.[0]].filter(Boolean));
    let touchedEdges = false;

    edges = edges.map((edge) => {
      if (!edge || typeof edge !== 'object') return edge;
      const { source, target } = getEdgeEndpoints(edge);
      if (!source || !target || (!targetIds.has(source) && !targetIds.has(target))) return edge;

      const handles = chooseBorderHandles(nodes[source], nodes[target]);
      if (!handles) return edge;

      if (edge.sourceHandle === handles.sourceHandle && edge.targetHandle === handles.targetHandle) {
        return edge;
      }

      touchedEdges = true;
      return {
        ...edge,
        sourceHandle: handles.sourceHandle,
        targetHandle: handles.targetHandle,
      };
    });

    migrations.cameraBorderConnectionsV1 = true;
    changed = changed || touchedEdges || !state[MIGRATION_KEY]?.cameraBorderConnectionsV1;
  }

  // 2) Filtros Nuevos quedó excesivamente lejos. Acercarlo al elemento al que
  // realmente está conectado (priorizando Cámara de Quiebre) y conservar su
  // dirección relativa para no alterar el sentido visual del diagrama.
  if (!migrations.filtersNuevosSpacingV1 && filters) {
    const [filtersId, filtersEntry] = filters;
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
    if (neighborEntry) {
      const filtersCenter = getNodeCenter(filtersEntry);
      const neighborCenter = getNodeCenter(neighborEntry);
      const dx = filtersCenter.x - neighborCenter.x;
      const dy = filtersCenter.y - neighborCenter.y;
      const distance = Math.hypot(dx, dy);

      if (distance > 0) {
        const ux = dx / distance;
        const uy = dy / distance;
        const filtersRadius = Math.abs(ux) * filtersCenter.width / 2 + Math.abs(uy) * filtersCenter.height / 2;
        const neighborRadius = Math.abs(ux) * neighborCenter.width / 2 + Math.abs(uy) * neighborCenter.height / 2;
        const desiredDistance = filtersRadius + neighborRadius + 78;

        // Solo tocarlo si existe un hueco claramente excesivo. Así esta migración
        // no pisa una colocación manual ya razonable del usuario.
        if (distance > desiredDistance + 110) {
          const nextCenterX = neighborCenter.x + ux * desiredDistance;
          const nextCenterY = neighborCenter.y + uy * desiredDistance;
          const nextX = Math.round((nextCenterX - filtersCenter.width / 2) * 10) / 10;
          const nextY = Math.round((nextCenterY - filtersCenter.height / 2) * 10) / 10;
          nodes[filtersId] = setPosition(filtersEntry, nextX, nextY);
          changed = true;
        }
      }
    }

    migrations.filtersNuevosSpacingV1 = true;
    changed = changed || !state[MIGRATION_KEY]?.filtersNuevosSpacingV1;
  }

  if (!changed) return { state, changed: false };

  const timestamp = new Date().toISOString();
  return {
    state: {
      ...state,
      nodes,
      edges,
      [MIGRATION_KEY]: migrations,
      _updatedAt: timestamp,
      updated_at: timestamp,
    },
    changed: true,
  };
};

const migrateLocalState = () => {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = JSON.parse(localStorage.getItem(LOCAL_STATE_KEY) || '{}');
    const migrated = applyDiagramMigrations(raw);
    if (migrated.changed) {
      localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(migrated.state));
    }
    return migrated.state;
  } catch {
    return null;
  }
};

// Aplicar el ajuste también al estado local antes de que ReactFlow lo lea.
try { migrateLocalState(); } catch {}

const diagramService = {
  getState: async (forceRefresh = false) => {
    const now = Date.now();
    if (!forceRefresh && stateCache && now < stateCacheExpiresAt) {
      return stateCache;
    }
    if (!forceRefresh && pendingStateRequest) {
      return pendingStateRequest;
    }

    pendingStateRequest = api.get('/diagram/state')
      .then((res) => {
        const remote = res.data || {};
        const migrated = applyDiagramMigrations(remote);
        stateCache = migrated.state;
        stateCacheExpiresAt = Date.now() + STATE_CACHE_TTL_MS;

        if (migrated.changed) {
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(migrated.state));
            }
          } catch {}

          // Persistir la migración compartida sin bloquear la primera pintura.
          api.post('/diagram/state', migrated.state).catch(() => {});
        }

        return stateCache;
      })
      .catch(() => stateCache || migrateLocalState() || {})
      .finally(() => {
        pendingStateRequest = null;
      });

    return pendingStateRequest;
  },

  saveState: async (state) => {
    const payload = state && typeof state === 'object' ? state : {};
    await api.post('/diagram/state', payload);
    stateCache = payload;
    stateCacheExpiresAt = Date.now() + STATE_CACHE_TTL_MS;
    return true;
  },

  peekState: () => stateCache,
};

export default diagramService;
