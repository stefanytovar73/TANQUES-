import api from '../api/axios';

const LAYOUT_FIX_MIGRATION_KEY = 'district_camera_filters_layout_v3';

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

const getRect = (entry = {}, padding = 0) => {
  const position = getPosition(entry);
  const size = getSize(entry);
  return {
    left: position.x - padding,
    right: position.x + size.width + padding,
    top: position.y - padding,
    bottom: position.y + size.height + padding,
  };
};

const getEdgeEndpoints = (edge = {}) => ({
  source: edge.source ?? edge.from ?? edge.sourceId ?? null,
  target: edge.target ?? edge.to ?? edge.targetId ?? null,
});

const segmentIntersectsRect = (a, b, rect) => {
  if (!a || !b || !rect) return false;

  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  if (maxX < rect.left || minX > rect.right || maxY < rect.top || minY > rect.bottom) return false;

  const inside = (point) => (
    point.x >= rect.left && point.x <= rect.right
    && point.y >= rect.top && point.y <= rect.bottom
  );
  if (inside(a) || inside(b)) return true;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const hitsVertical = (x) => {
    if (Math.abs(dx) < 0.000001) return false;
    const t = (x - a.x) / dx;
    if (t <= 0 || t >= 1) return false;
    const y = a.y + (dy * t);
    return y >= rect.top && y <= rect.bottom;
  };
  const hitsHorizontal = (y) => {
    if (Math.abs(dy) < 0.000001) return false;
    const t = (y - a.y) / dy;
    if (t <= 0 || t >= 1) return false;
    const x = a.x + (dx * t);
    return x >= rect.left && x <= rect.right;
  };

  return hitsVertical(rect.left)
    || hitsVertical(rect.right)
    || hitsHorizontal(rect.top)
    || hitsHorizontal(rect.bottom);
};

const applyCameraAndFiltersFix = (inputState) => {
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
  const protectedNodes = [camera, filters].filter(Boolean);
  if (!protectedNodes.length) return { state, changed: false, handled: false };

  let changed = false;
  let edges = Array.isArray(state.edges)
    ? state.edges.map((edge) => edge && typeof edge === 'object' ? { ...edge } : edge)
    : [];

  // Filtros Nuevos debe quedar a una separación visual parecida al resto del diagrama.
  // Se conserva la dirección actual y solamente se reduce un hueco excesivo.
  if (filters) {
    const [filtersId, filtersEntry] = filters;
    const incidentNeighborIds = edges
      .map((edge) => {
        const { source, target } = getEdgeEndpoints(edge || {});
        if (source === filtersId) return target;
        if (target === filtersId) return source;
        return null;
      })
      .filter((id) => id && nodes[id]);

    let neighborId = null;
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
    if (neighborEntry) {
      const filtersCenter = getCenter(filtersEntry);
      const neighborCenter = getCenter(neighborEntry);
      const dx = filtersCenter.x - neighborCenter.x;
      const dy = filtersCenter.y - neighborCenter.y;
      const distance = Math.hypot(dx, dy);

      if (Number.isFinite(distance) && distance > 0) {
        const ux = dx / distance;
        const uy = dy / distance;
        const filtersRadius = Math.abs(ux) * filtersCenter.width / 2 + Math.abs(uy) * filtersCenter.height / 2;
        const neighborRadius = Math.abs(ux) * neighborCenter.width / 2 + Math.abs(uy) * neighborCenter.height / 2;
        const desiredGap = 28;
        const desiredDistance = filtersRadius + neighborRadius + desiredGap;

        if (distance > desiredDistance + 20) {
          const nextCenterX = neighborCenter.x + (ux * desiredDistance);
          const nextCenterY = neighborCenter.y + (uy * desiredDistance);
          const nextX = Math.round((nextCenterX - filtersCenter.width / 2) * 10) / 10;
          const nextY = Math.round((nextCenterY - filtersCenter.height / 2) * 10) / 10;
          nodes[filtersId] = setPosition(filtersEntry, nextX, nextY);
          changed = true;
        }
      }
    }
  }

  // Las conexiones que tocan o atraviesan Cámara de Quiebre / Filtros Nuevos
  // siempre usan el enrutador Smart. Además se liberan handles manuales para que
  // React Flow elija el borde más cercano en vez de dibujar la línea por dentro.
  edges = edges.map((edge) => {
    if (!edge || typeof edge !== 'object') return edge;
    const { source, target } = getEdgeEndpoints(edge);
    if (!source || !target || !nodes[source] || !nodes[target]) return edge;

    const touchesProtected = protectedNodes.some(([id]) => id === source || id === target);
    const sourceCenter = getCenter(nodes[source]);
    const targetCenter = getCenter(nodes[target]);
    const crossesProtected = protectedNodes.some(([id, entry]) => {
      if (id === source || id === target) return false;
      return segmentIntersectsRect(sourceCenter, targetCenter, getRect(entry, 10));
    });

    if (!touchesProtected && !crossesProtected) return edge;

    const nextData = {
      ...(edge.data && typeof edge.data === 'object' ? edge.data : {}),
      routeMode: 'smart',
      manualPorts: false,
      autoPorts: true,
    };
    const alreadySmart = edge.type === 'smart'
      && edge.data?.routeMode === 'smart'
      && edge.data?.manualPorts === false
      && !edge.sourceHandle
      && !edge.targetHandle;

    if (alreadySmart) return edge;
    changed = true;
    const { sourceHandle, targetHandle, ...rest } = edge;
    return {
      ...rest,
      type: 'smart',
      data: nextData,
    };
  });

  if (!changed) return { state, changed: false, handled: true };

  const nextNodes = Array.isArray(rawNodes)
    ? rawNodes.map((entry) => {
        const id = String(entry?.id || '');
        return id && nodes[id] ? nodes[id] : entry;
      })
    : nodes;
  const now = new Date().toISOString();

  return {
    state: {
      ...state,
      nodes: nextNodes,
      edges,
      updated_at: now,
      _updatedAt: now,
      updatedAt: now,
    },
    changed: true,
    handled: true,
  };
};

const hasCompletedLayoutFix = () => {
  try {
    return typeof localStorage !== 'undefined'
      && localStorage.getItem(LAYOUT_FIX_MIGRATION_KEY) === '1';
  } catch {
    return false;
  }
};

const markLayoutFixComplete = () => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LAYOUT_FIX_MIGRATION_KEY, '1');
    }
  } catch {}
};

const diagramService = {
  getState: async () => {
    const res = await api.get('diagram/state');
    const remote = res.data || {};

    if (hasCompletedLayoutFix()) return remote;

    const migrated = applyCameraAndFiltersFix(remote);
    if (!migrated.handled) return remote;

    if (!migrated.changed) {
      markLayoutFixComplete();
      return remote;
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('district_state', JSON.stringify(migrated.state));
      }
    } catch {}

    // Pintar el estado corregido inmediatamente y persistir la misma corrección
    // en el backend para que sobreviva recargas y sea compartida entre clientes.
    api.post('diagram/state', migrated.state)
      .then(() => markLayoutFixComplete())
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
