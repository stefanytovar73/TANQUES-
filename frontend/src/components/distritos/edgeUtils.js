export function isValidSavedEdge(edge) {
  if (!edge || typeof edge !== 'object') return false;

  const source = edge.source ?? edge.from ?? edge.sourceId ?? null;
  const target = edge.target ?? edge.to ?? edge.targetId ?? null;

  if (!source || !target) return false;

  return true;
}

export function normalizeSavedNodeCollection(rawNodes = []) {
  if (Array.isArray(rawNodes)) {
    return rawNodes.filter((entry) => entry && typeof entry === 'object');
  }

  if (rawNodes && typeof rawNodes === 'object') {
    return Object.values(rawNodes).filter((entry) => entry && typeof entry === 'object');
  }

  return [];
}

export function normalizeSavedNodeMap(rawNodes = []) {
  if (!rawNodes || typeof rawNodes !== 'object') return {};

  if (Array.isArray(rawNodes)) {
    return Object.fromEntries(rawNodes
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => {
        const id = String(entry.id ?? entry.nodeId ?? entry.tag ?? entry.name ?? Math.random().toString(36).slice(2));
        return [id, { ...entry, id }];
      }));
  }

  return Object.fromEntries(Object.entries(rawNodes)
    .filter(([, entry]) => entry && typeof entry === 'object')
    .map(([key, entry]) => {
      const id = String(entry.id ?? entry.nodeId ?? entry.tag ?? entry.name ?? key);
      return [id, { ...entry, id }];
    }));
}

export function normalizeSavedEdge(edge, defaults = {}) {
  const source = edge?.source ?? edge?.from ?? edge?.sourceId ?? null;
  const target = edge?.target ?? edge?.to ?? edge?.targetId ?? null;

  const normalized = { ...edge, id: edge?.id || `${source}-${target}`, source, target };

  if (normalized.from) delete normalized.from;
  if (normalized.to) delete normalized.to;
  if (normalized.sourceId) delete normalized.sourceId;
  if (normalized.targetId) delete normalized.targetId;

  if (normalized.sourceHandle == null || String(normalized.sourceHandle).trim() === 'undefined') delete normalized.sourceHandle;
  if (normalized.targetHandle == null || String(normalized.targetHandle).trim() === 'undefined') delete normalized.targetHandle;

  // Preservar markerEnd guardado; solo usar defaults si no existe
  if (!normalized.markerEnd) {
    normalized.markerEnd = defaults.markerEnd || { type: 'arrowClosed', color: '#000' };
  }
  // Preservar el estilo guardado (color/grosor personalizado); solo usar defaults si no existe
  if (!normalized.style) {
    normalized.style = defaults.style || { stroke: '#000', strokeWidth: 5, strokeLinecap: 'round' };
  }
  // Asegurarse de que strokeLinecap esté siempre presente
  if (normalized.style && !normalized.style.strokeLinecap) {
    normalized.style = { ...normalized.style, strokeLinecap: 'round' };
  }
  // Usar el tipo guardado en el edge si existe y es válido, luego el default, y como fallback 'straight'
  const validEdgeTypes = new Set(['smart', 'straight', 'default', 'smoothstep', 'step']);
  if (normalized.type && validEdgeTypes.has(normalized.type)) {
    // mantener el tipo guardado
  } else if (defaults.type && validEdgeTypes.has(defaults.type)) {
    normalized.type = defaults.type;
  } else {
    normalized.type = 'straight';
  }
  if (normalized.animated == null) normalized.animated = Boolean(defaults.animated);

  // Remove legacy textual labels like "salida" — keep label only when meaningful
  if (normalized.label && typeof normalized.label === 'string') {
    const l = normalized.label.trim().toLowerCase();
    if (l === 'salida' || l === 'salida ' || l === ' salida') normalized.label = '';
  }

  return normalized;
}
