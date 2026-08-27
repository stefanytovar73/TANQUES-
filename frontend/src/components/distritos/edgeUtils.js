export function isValidSavedEdge(edge) {
  if (!edge || typeof edge !== 'object') return false;

  const source = edge.source ?? edge.from ?? edge.sourceId ?? null;
  const target = edge.target ?? edge.to ?? edge.targetId ?? null;

  if (!source || !target) return false;

  return true;
}

export function normalizeSavedEdge(edge, defaults = {}) {
  const source = edge?.source ?? edge?.from ?? edge?.sourceId ?? null;
  const target = edge?.target ?? edge?.to ?? edge?.targetId ?? null;

  const normalized = { ...edge, id: edge?.id || `${source}-${target}`, source, target };

  if (normalized.from) delete normalized.from;
  if (normalized.to) delete normalized.to;
  if (normalized.sourceId) delete normalized.sourceId;
  if (normalized.targetId) delete normalized.targetId;

  if (normalized.sourceHandle && String(normalized.sourceHandle) === 'undefined') delete normalized.sourceHandle;
  if (normalized.targetHandle && String(normalized.targetHandle) === 'undefined') delete normalized.targetHandle;

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
  // Siempre forzar tipo straight (líneas rectas sin routing)
  normalized.type = 'straight';
  if (normalized.animated == null) normalized.animated = Boolean(defaults.animated);

  return normalized;
}
