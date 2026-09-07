import React, { useCallback, useEffect, useState, useRef, useImperativeHandle } from 'react';
import { format as formatDateFn } from 'date-fns';
import ReactFlow, { addEdge, Background, MarkerType, Handle, Position, applyNodeChanges, applyEdgeChanges } from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import TankNode from './TankNode';
import tanqueService from '../../services/tanqueService';
import diagramService from '../../services/diagramService';
import { NODES as STATIC_NODES } from './districtLayout';
import { calculateDisplayPorcentaje } from '../../config/tankCatalog';
import { isValidSavedEdge, normalizeSavedEdge } from './edgeUtils';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 160;
const nodeHeight = 80;


// ── Métricas dinámicas del diagrama ───────────────────────────────────────────
// Se reutiliza una sola consulta a /ptap para todos los elementos dinámicos.
// No se crean ni mueven nodos: el dato se pinta sobre las formas ya existentes.
const MACKENFLOC_SHAPE_TAGS = {
  // Planta 1: tres tanques Mackenfloc confirmados por la API.
  'forma-1787684914863-aek53': 'PTAP_CAPACIDAD_MACKENFLOC_P1_T1',
  'forma-1787684915758-97jih': 'PTAP_CAPACIDAD_MACKENFLOC_P1_T2',
  'forma-1787684917494-hn23j': 'PTAP_CAPACIDAD_MACKENFLOC_P1_T3',
  // Planta 2: dos tanques Mackenfloc confirmados por la API.
  'forma-1787684915758-97jih-copy-1787686548169-906v3': 'PTAP_CAPACIDAD_MACKENFLOC_P2_T1',
  'forma-1787684915758-97jih-copy-1787686549046-0u9o4': 'PTAP_CAPACIDAD_MACKENFLOC_P2_T2',
};

let _ptapMetricsMap = null;
let _ptapMetricsLoading = null;
let _ptapMetricsPollingStarted = false;
const _ptapMetricsListeners = new Set();

function _notifyPtapMetrics(map) {
  _ptapMetricsMap = map;
  _ptapMetricsListeners.forEach((listener) => {
    try { listener(map); } catch (_) {}
  });
}

// Tank metrics polling (from /tanques) — used to find coagulant-related tank values
// NOTE: tank-specific metrics (used previously to auto-fill coagulant values)
// were removed to avoid altering diagram layout. Keep PTAP polling for flow
// metrics; tank polling was reverted per user request.

async function _loadPtapMetrics() {
  if (_ptapMetricsLoading) return _ptapMetricsLoading;
  _ptapMetricsLoading = tanqueService.getPtap()
    .then((res) => {
      const map = {};
      for (const variable of (res?.variables || [])) {
        if (variable?.tag) map[variable.tag] = variable;
      }
      _notifyPtapMetrics(map);
      return map;
    })
    .catch(() => null)
    .finally(() => { _ptapMetricsLoading = null; });
  return _ptapMetricsLoading;
}

function _ensurePtapMetricsPolling() {
  if (_ptapMetricsPollingStarted) return;
  _ptapMetricsPollingStarted = true;
  _loadPtapMetrics();
  setInterval(_loadPtapMetrics, 60000);
}

function parseMetricNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const clean = String(value).trim();
  if (!clean) return null;

  const normalized = clean.replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function _formatMetric(variable) {
  if (!variable) return null;
  // treat common placeholders as empty (dot, bullet)
  const raw = (variable.valor ?? '');
  if (raw === null || raw === undefined) return null;
  const rawStr = String(raw).trim();
  if (rawStr === '' || rawStr === '.' || rawStr === '•' || rawStr === '\u2022') return null;

  // prefer explicit display fields if present
  const fallbackText = (variable.valor_texto || variable.valor_display || variable.valor_bruto || variable.raw || null);
  if (fallbackText && String(fallbackText).trim() && !/^[\.•\s]+$/.test(String(fallbackText))) {
    return `${String(fallbackText).trim()} ${variable.unidad || ''}`.trim();
  }

  const numeric = parseMetricNumber(rawStr);
  if (numeric == null) return null;
  const value = Number.isInteger(numeric)
    ? String(Math.round(numeric))
    : numeric.toFixed(2).replace(/\.0+$|(?<=\.\d)0+$/g, '');
  return `${value} ${variable.unidad || ''}`.trim();
}

function getBaseNodeName(node) {
  const source = node?.data?.nodeData || node?.data || {};
  return source.apiName || source.originalName || source.tag || source.display_name || source.nombre || source.label || node?.label || node?.id || 'Sin nombre';
}

function getCustomNodeName(node) {
  const source = node?.data?.nodeData || node?.data || {};
  return source.customName || node?.customName || source.diagramName || source.displayName || '';
}

function getNodeDisplayName(node) {
  const custom = getCustomNodeName(node);
  const base = getBaseNodeName(node);
  if (custom && String(custom).trim()) return String(custom).trim();
  return base || 'Sin nombre';
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeViewport(vp = {}) {
  try {
    if (!vp || typeof vp !== 'object') return { x: 0, y: 0, zoom: 1 };
    return {
      x: toFiniteNumber(vp.x, 0),
      y: toFiniteNumber(vp.y, 0),
      zoom: toFiniteNumber(vp.zoom, 1),
    };
  } catch (e) { return { x: 0, y: 0, zoom: 1 }; }
}

function sanitizePosition(position = {}) {
  return {
    x: toFiniteNumber(position.x, 0),
    y: toFiniteNumber(position.y, 0),
  };
}

function sanitizePersistedNodeVisual(entry = {}) {
  const source = entry && typeof entry === 'object' ? entry : {};
  const safeCustomName = typeof source.customName === 'string' ? source.customName : (typeof source.label === 'string' ? source.label : '');
  const safeLabel = typeof source.label === 'string' ? source.label : (safeCustomName || source.apiName || source.originalName || source.tag || source.id || 'Sin nombre');
  const safeX = Number.isFinite(Number(source.x)) ? Number(source.x) : 0;
  const safeY = Number.isFinite(Number(source.y)) ? Number(source.y) : 0;
  return {
    id: source.id ?? null,
    type: source.type || 'tank',
    x: safeX,
    y: safeY,
    label: safeLabel,
    customName: safeCustomName,
    nameLocked: !!source.nameLocked,
    color: source.color || source.customColor || '',
    customColor: source.customColor || source.color || '',
    shapeType: source.shapeType || 'box',
    width: Number.isFinite(Number(source.width)) ? Number(source.width) : null,
    height: Number.isFinite(Number(source.height)) ? Number(source.height) : null,
    rotation: Number.isFinite(Number(source.rotation)) ? Number(source.rotation) : 0,
    lockedPosition: !!source.lockedPosition,
    // preserve common metric/display fields so they survive sanitize -> localStorage roundtrip
    valor_m: source.valor_m ?? source.nivel ?? null,
    nivel: source.nivel ?? source.valor_m ?? null,
    porcentaje: (source.porcentaje ?? source.porcentaje_capacidad ?? source.porcentaje_api) ?? null,
    capacidad_actual_m3: source.capacidad_actual_m3 ?? source.capacidad_m3 ?? null,
    capacidad_maxima_m3: source.capacidad_maxima_m3 ?? null,
    volumen_restante_m3: source.volumen_restante_m3 ?? null,
    altura_rebose: source.altura_rebose ?? source.altura_rebose_m ?? null,
    altura_rebose_calibrada: source.altura_rebose_calibrada ?? source.altura_rebose_m ?? null,
    tag: source.tag ?? null,
    display_name: source.display_name ?? source.nombre ?? source.label ?? null,
  };
}

function getAutoShapeSize(label = '', currentWidth = 120, currentHeight = 68) {
  const text = String(label || '').trim();
  const length = Math.max(1, text.length || 1);
  const autoWidth = Math.max(80, Math.min(220, Math.round(length * 7.2 + 28)));
  const autoHeight = Math.max(52, Math.min(120, 46 + Math.ceil(length / 8) * 10));
  const nextWidth = Number.isFinite(Number(currentWidth)) && Number(currentWidth) > 0 ? Number(currentWidth) : autoWidth;
  const nextHeight = Number.isFinite(Number(currentHeight)) && Number(currentHeight) > 0 ? Number(currentHeight) : autoHeight;
  return {
    width: Math.max(autoWidth, nextWidth),
    height: Math.max(autoHeight, nextHeight),
  };
}

const FLOW_METRIC_CONFIG = {
  'ptap-chembe': { service: 'ptap', tag: 'PTAP_CAUDAL_CAY_16', defaultUnit: 'L/s' },
  'ptap-pola-1': { service: 'captacion', tag: 'CAPTACION_CAUDAL_SALIDA_24', defaultUnit: 'L/s' },
  'ptap-pola-2': { service: 'captacion', tag: 'CAPTACION_CAUDAL_SALIDA_27', defaultUnit: 'L/s' },
};

function getMetricConfigForNodeId(nodeId) {
  const key = String(nodeId || '').trim();
  if (!key) return null;

  const direct = FLOW_METRIC_CONFIG[key];
  if (direct) return direct;

  const legacyTag = MACKENFLOC_SHAPE_TAGS[key];
  if (legacyTag) {
    return { service: 'ptap', tag: legacyTag, defaultUnit: 'L/s' };
  }

  return null;
}

function formatFlowMetricVariable(variable, fallbackUnit = 'L/s') {
  if (!variable || variable.valor == null || variable.valor === '') return null;

  const rawValue = parseMetricNumber(variable.valor);
  const unit = variable.unidad || fallbackUnit;

  if (rawValue == null) {
    const cleaned = String(variable.valor).trim();
    return cleaned ? `${cleaned} ${unit}`.trim() : null;
  }

  const valueText = Number.isInteger(rawValue)
    ? String(Math.round(rawValue))
    : rawValue.toFixed(2).replace(/\.0+$|(?<=\.\d)0+$/g, '');

  return `${valueText} ${unit}`.trim();
}

async function loadFlowMetricForNodeId(nodeId) {
  const config = getMetricConfigForNodeId(nodeId);
  if (!config) return null;

  try {
    const response = config.service === 'ptap'
      ? await tanqueService.getPtap()
      : await tanqueService.getCaptacion();

    const variables = (response && response.variables) || [];
    const variable = variables.find((item) => item && item.tag === config.tag);
    return variable ? formatFlowMetricVariable(variable, config.defaultUnit) : null;
  } catch (error) {
    return null;
  }
}

function getCalibratedReboseHeight(source = {}) {
  const candidates = [
    source.tag,
    source.nombre,
    source.display_name,
    source.apiName,
    source.originalName,
    source.label,
    source.name,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const normalized = String(candidate).trim().toUpperCase();
    if (normalized === 'CALUCAIMA') return 5.02;
    if (normalized === 'ZONA INDUSTRIAL') return 16.6;
    if (normalized === 'MIRAMAR') return 7.56;
  }

  return null;
}

function enrichTankNodeMetrics(data = {}) {
  const source = { ...(data || {}) };
  const nivel = source.valor_m ?? source.nivel ?? source.valor ?? source.level ?? source.level_m ?? null;
  const nivelNumber = Number.isFinite(Number(nivel)) ? Number(nivel) : null;

  // La API IBAL puede devolver altura_rebose_m (con _m) o altura_rebose.
  // Cuando falte esa altura para los tanques calibrados, usar la referencia matemática del catálogo.
  const calibratedFallbackHeight = getCalibratedReboseHeight(source);
  const resolvedHeight = source.altura_rebose ?? source.altura_rebose_m ?? source.alturaRebose ?? calibratedFallbackHeight ?? null;
  const heightNumber = resolvedHeight != null && Number.isFinite(Number(resolvedHeight)) ? Number(resolvedHeight) : null;

  // La API IBAL devuelve porcentaje_capacidad (no porcentaje).
  // También acepta porcentaje_api o porcentaje directo como fallback.
  const ibalPct = Number.isFinite(Number(source.porcentaje_capacidad)) ? Number(source.porcentaje_capacidad)
    : (Number.isFinite(Number(source.porcentaje_api)) ? Number(source.porcentaje_api)
      : (Number.isFinite(Number(source.porcentaje)) ? Number(source.porcentaje) : null));

  // calidad=DUDOSA o sin_datos=true → no mostrar porcentaje (Sin datos)
  const isBadQuality = source.calidad === 'DUDOSA' || source.sin_datos === true;
  let percentage = null;
  if (!isBadQuality) {
    if (ibalPct != null) {
      percentage = ibalPct;
    } else if (nivelNumber != null && heightNumber != null && heightNumber > 0) {
      // Calcular dinámicamente desde valor_m y altura de rebose.
      percentage = calculateDisplayPorcentaje({ ...source, valor_m: nivelNumber, altura_rebose: heightNumber });
    }
  }

  return {
    ...source,
    valor_m: nivelNumber,
    nivel: nivelNumber,
    altura_rebose: heightNumber ?? source.altura_rebose_m ?? null,
    altura_rebose_calibrada: heightNumber ?? source.altura_rebose_m ?? null,
    // Normalizar campos de capacidad desde la API
    capacidad_actual_m3: source.capacidad_actual_m3 ?? source.capacidad_m3 ?? null,
    porcentaje: percentage,
  };
}

function ensureNodeData(node) {
  const source = node?.data?.nodeData || node?.data || {};
  const resolvedId = node?.id ?? source.id ?? source.nodeId ?? 'unknown-node';
  const resolvedType = source.type ?? node?.type ?? 'tank';
  const originalName = source.apiName || source.originalName || source.tag || source.display_name || source.nombre || source.label || node?.label || resolvedId || 'Sin nombre';
  const customName = source.customName || node?.customName || source.diagramName || source.displayName || '';
  const widthValue = source.width != null ? toFiniteNumber(source.width, 170) : (node?.width != null ? toFiniteNumber(node.width, 170) : null);
  const heightValue = source.height != null ? toFiniteNumber(source.height, 100) : (node?.height != null ? toFiniteNumber(node.height, 100) : null);
  const enrichedSource = resolvedType === 'tank' ? enrichTankNodeMetrics(source) : source;
  return {
    ...enrichedSource,
    id: resolvedId,
    type: resolvedType,
    apiName: source.apiName || source.originalName || source.tag || originalName,
    originalName: source.originalName || source.apiName || source.tag || originalName,
    customName,
    label: customName || source.label || node?.label || originalName,
    color: source.color || source.customColor || '',
    customColor: source.customColor || source.color || '',
    shapeType: source.shapeType || 'box',
    width: widthValue,
    height: heightValue,
    position: sanitizePosition(node?.position || source.position),
  };
}

function getLayoutedElements(nodes, edges, direction = 'LR') {
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const n = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: n.x - nodeWidth / 2,
        y: n.y - nodeHeight / 2,
      },
      data: node.data,
    };
  });

  const layoutedEdges = edges.map((e) => ({ ...e, markerEnd: { type: MarkerType.ArrowClosed } }));
  return { nodes: layoutedNodes, edges: layoutedEdges };
}

// Wrapper node components for React Flow
function FlowTankNode(props) {
  const { data, ...rest } = props || {};
  const { InputProps, updateNodeDimensions, onNodeMouseDown, ...safeProps } = rest || {};
  const { nodeData, onSelect, onDuplicate, onConnectNode, onDeleteSelected, onRename, editMode, mode, deleteMode } = data || {};
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(getNodeDisplayName({ data: nodeData }));
  const tankWidth = (nodeData?.width != null && Number.isFinite(Number(nodeData.width)) && Number(nodeData.width) > 0) ? Number(nodeData.width) : 160;
  const tankHeight = (nodeData?.height != null && Number.isFinite(Number(nodeData.height)) && Number(nodeData.height) > 0) ? Number(nodeData.height) : 200;
  const tankScale = Math.max(0.45, Math.min(1.4, Math.min(tankWidth / 160, tankHeight / 200) || 1));
  const innerOffsetX = (tankWidth - 160 * tankScale) / 2;
  const innerOffsetY = (tankHeight - 200 * tankScale) / 2;

  useEffect(() => {
    setDraft(getNodeDisplayName({ data: nodeData }));
  }, [nodeData?.customName, nodeData?.label, nodeData?.display_name, nodeData?.nombre, nodeData?.apiName]);

  useEffect(() => {
    if (data && data.openEditor) {
      setIsEditing(true);
      try { if (typeof data.onEditorShown === 'function') data.onEditorShown(nodeData?.id || data?.id); } catch (e) {}
    }
  }, [data?.openEditor]);

  const labelText = getNodeDisplayName({ data: nodeData });
  const isPending = Boolean(data && data.pendingConnect);
  const handleClick = (ev) => {
    ev.stopPropagation();
    if (isEditing) return;
    if (editMode && deleteMode) {
      if (onDeleteSelected) onDeleteSelected(nodeData.id);
      return;
    }
    if (editMode && mode === 'duplicate') {
      if (onDuplicate) onDuplicate(nodeData.id);
      return;
    }
    if (editMode && mode === 'connect') {
      if (onConnectNode) {
        try {
          const rect = ev.currentTarget.getBoundingClientRect ? ev.currentTarget.getBoundingClientRect() : null;
          const offsetX = rect ? (ev.clientX - rect.left) : (ev.nativeEvent && ev.nativeEvent.offsetX) || 0;
          const offsetY = rect ? (ev.clientY - rect.top) : (ev.nativeEvent && ev.nativeEvent.offsetY) || 0;
          onConnectNode(nodeData.id, { offsetX, offsetY });
        } catch (e) { onConnectNode(nodeData.id, null); }
      }
      return;
    }
    if (onSelect) onSelect(nodeData.id);
  };
  const beginEdit = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    setDraft(labelText);
    setIsEditing(true);
  };

  const saveLabel = () => {
    const clean = (draft || '').replace(/\s+/g, ' ').trim();
    const finalValue = clean || labelText;
    if (onRename) onRename(nodeData.id, finalValue);
    setDraft(finalValue);
    setIsEditing(false);
  };

  const handleStyle = {
    width: 10, height: 10, background: '#2563eb',
    border: '2px solid #ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    borderRadius: '50%', zIndex: 10,
    opacity: editMode ? 1 : 0, pointerEvents: editMode ? 'auto' : 'none',
  };
  const btnStyle = { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, width: 22, height: 22, cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, padding: 0 };

  // compute handle positions accounting for rotation
  const rotation = Number(nodeData?.rotation ?? data?.rotation ?? 0) || 0;
  const cx = tankWidth / 2;
  const cy = tankHeight / 2;
  const rotatePoint = (x, y, angleDeg) => {
    const rad = (Number(angleDeg) || 0) * Math.PI / 180;
    const dx = x - cx;
    const dy = y - cy;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
    return { left: cx + rx, top: cy + ry };
  };
  // El cilindro se dibuja entre x=20..100 e y=36..126 (antes de escalar).
  // Los puntos quedan pegados a su contorno y repartidos, no agrupados.
  const tankCenterX = innerOffsetX + 60 * tankScale;
  const tankMiddleY = innerOffsetY + 81 * tankScale;
  const leftHandle = rotatePoint(innerOffsetX + 20 * tankScale, tankMiddleY, rotation);
  const rightHandle = rotatePoint(innerOffsetX + 100 * tankScale, tankMiddleY, rotation);
  const topHandle = rotatePoint(tankCenterX, innerOffsetY + 36 * tankScale, rotation);
  const bottomHandle = rotatePoint(tankCenterX, innerOffsetY + 126 * tankScale, rotation);
  const topLeftHandle = rotatePoint(innerOffsetX + 28 * tankScale, innerOffsetY + 48 * tankScale, rotation);
  const topRightHandle = rotatePoint(innerOffsetX + 92 * tankScale, innerOffsetY + 48 * tankScale, rotation);
  const bottomLeftHandle = rotatePoint(innerOffsetX + 28 * tankScale, innerOffsetY + 114 * tankScale, rotation);
  const bottomRightHandle = rotatePoint(innerOffsetX + 92 * tankScale, innerOffsetY + 114 * tankScale, rotation);

  return (
    <div onClick={handleClick} onDoubleClick={beginEdit} style={{ width: tankWidth, height: tankHeight, position: 'relative', cursor: 'pointer' }}>
      {/* Handles — solo visibles en editMode */}
      <Handle type="target" position={Position.Left}   id="t-left"   style={{ ...handleStyle, left: leftHandle.left, top: leftHandle.top }} />
      <Handle type="source" position={Position.Right}  id="s-right"  style={{ ...handleStyle, left: rightHandle.left, top: rightHandle.top }} />
      <Handle type="target" position={Position.Top}    id="t-top"    style={{ ...handleStyle, left: topHandle.left, top: topHandle.top }} />
      <Handle type="source" position={Position.Bottom} id="s-bottom" style={{ ...handleStyle, left: bottomHandle.left, top: bottomHandle.top }} />

      {/* Cuatro puntos extra, alternados en las esquinas del tanque. */}
      <Handle type="target" position={Position.Left} id="t-top-left" style={{ ...handleStyle, left: topLeftHandle.left, top: topLeftHandle.top }} />
      <Handle type="source" position={Position.Right} id="s-top-right" style={{ ...handleStyle, left: topRightHandle.left, top: topRightHandle.top }} />
      <Handle type="source" position={Position.Left} id="s-bottom-left" style={{ ...handleStyle, left: bottomLeftHandle.left, top: bottomLeftHandle.top }} />
      <Handle type="target" position={Position.Right} id="t-bottom-right" style={{ ...handleStyle, left: bottomRightHandle.left, top: bottomRightHandle.top }} />

      <div style={{ width: tankWidth, height: tankHeight, overflow: 'visible' }}>
        <svg width={tankWidth} height={tankHeight}>
          {(() => {
            const rotation = Number(nodeData?.rotation ?? data?.rotation ?? 0) || 0;
            const cx = tankWidth / 2;
            const cy = tankHeight / 2;
            const transform = `translate(${innerOffsetX}, ${innerOffsetY}) translate(${cx}, ${cy}) rotate(${rotation}) translate(${-cx}, ${-cy}) scale(${tankScale})`;
            // Ensure TankNode receives metric fields whether they're on nodeData or top-level data
            const mergedNodeData = {
              ...(nodeData || {}),
              valor_m: (nodeData && nodeData.valor_m != null) ? nodeData.valor_m : (data && data.valor_m != null ? data.valor_m : null),
              nivel:   (nodeData && nodeData.nivel   != null) ? nodeData.nivel   : (data && data.nivel   != null ? data.nivel   : null),
              porcentaje: (nodeData && nodeData.porcentaje != null) ? nodeData.porcentaje : (data && data.porcentaje != null ? data.porcentaje : null),
            };
            return (
              <g transform={transform}>
                <TankNode data={mergedNodeData} selected={data?.selected || isPending} />
              </g>
            );
          })()}

          {isPending && (
            <g>
              <circle cx={80} cy={12} r={14} fill="rgba(239,68,68,0.18)" stroke="#ef4444" strokeWidth={2} />
              <text x={80} y={16} fontSize={10} fontWeight={900} fill="#b91c1c" textAnchor="middle">ORIGEN</text>
            </g>
          )}

          {isEditing ? (
            <foreignObject x={-20} y={cy + (tankHeight * 0.55)} width={144} height={32}>
              <div className="nodrag" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); saveLabel(); }
                    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDraft(labelText); setIsEditing(false); }
                  }}
                  onBlur={() => saveLabel()}
                  style={{ width: 110, border: '1px solid #cbd5e1', borderRadius: 4, background: '#fff', color: '#0b2447', fontSize: 11, fontWeight: 700, textAlign: 'center', padding: '2px 4px', outline: 'none' }}
                />
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); saveLabel(); }}
                  style={{ border: '1px solid #cbd5e1', borderRadius: 4, background: '#2563eb', color: '#fff', fontSize: 10, fontWeight: 800, width: 20, height: 20, cursor: 'pointer', padding: 0 }}
                >✓</button>
              </div>
            </foreignObject>
          ) : (
            <text
              x={tankWidth / 2 - 20} y={innerOffsetY + 135 * tankScale + 8}
              fontSize={13} fontWeight={700}
              fill="#0b2447"
              textAnchor="middle"
              dominantBaseline="hanging"
              onClick={beginEdit} onDoubleClick={beginEdit}
              style={{ cursor: 'pointer' }}
            >{labelText}</text>
          )}
        </svg>
      </div>
    </div>
  );
}


function FlowPlantNode(props) {
  const { data, ...rest } = props || {};
  const { InputProps, updateNodeDimensions, onNodeMouseDown, ...safeProps } = rest || {};
  const { nodeData, onSelect, onDuplicate, onConnectNode, onDeleteSelected, onRename, editMode, mode, deleteMode } = data || {};
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(getNodeDisplayName({ data: nodeData }));
  const customColor = nodeData?.customColor || nodeData?.color;

  useEffect(() => {
    setDraft(getNodeDisplayName({ data: nodeData }));
  }, [nodeData?.customName, nodeData?.label, nodeData?.display_name, nodeData?.nombre, nodeData?.apiName]);

  const handleClick = (ev) => {
    ev.stopPropagation();
    if (isEditing) return;
    if (editMode && deleteMode) {
      if (onDeleteSelected) onDeleteSelected(nodeData.id);
      return;
    }
    if (editMode && mode === 'duplicate') {
      if (onDuplicate) onDuplicate(nodeData.id);
      return;
    }
    if (editMode && mode === 'connect') {
      if (onConnectNode) {
        try {
          const rect = ev.currentTarget.getBoundingClientRect ? ev.currentTarget.getBoundingClientRect() : null;
          const offsetX = rect ? (ev.clientX - rect.left) : (ev.nativeEvent && ev.nativeEvent.offsetX) || 0;
          const offsetY = rect ? (ev.clientY - rect.top) : (ev.nativeEvent && ev.nativeEvent.offsetY) || 0;
          onConnectNode(nodeData.id, { offsetX, offsetY });
        } catch (e) { onConnectNode(nodeData.id, null); }
      }
      return;
    }
    if (onSelect) onSelect(nodeData.id);
  };
  const isPending = Boolean(data && data.pendingConnect);
  const labelText = getNodeDisplayName({ data: nodeData });
  const [metricLabel, setMetricLabel] = useState(null);
  const beginEdit = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    setDraft(labelText);
    setIsEditing(true);
  };

  useEffect(() => {
    let mounted = true;
    const nodeId = nodeData?.id ?? nodeData?.nodeId ?? data?.id ?? data?.nodeId;

    (async () => {
      try {
        if (!nodeId || !getMetricConfigForNodeId(nodeId)) {
          if (mounted) setMetricLabel(null);
          return;
        }

        const label = await loadFlowMetricForNodeId(nodeId);
        if (mounted) setMetricLabel(label);
      } catch (error) {
        if (mounted) setMetricLabel(null);
      }
    })();

    return () => { mounted = false; };
  }, [nodeData?.id, nodeData?.nodeId, data?.id, data?.nodeId]);

  useEffect(() => {
    if (data && data.openEditor) {
      setIsEditing(true);
      try { if (typeof data.onEditorShown === 'function') data.onEditorShown(nodeData?.id || data?.id); } catch (e) {}
    }
  }, [data?.openEditor]);

  const saveLabel = () => {
    const clean = (draft || '').replace(/\s+/g, ' ').trim();
    const finalValue = clean || labelText;
    if (onRename) onRename(nodeData.id, finalValue);
    setDraft(finalValue);
    setIsEditing(false);
  };

  const handleStyle = {
    width: 10,
    height: 10,
    background: customColor || '#073B70',
    border: '2px solid #ffffff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    borderRadius: '50%',
    zIndex: 10,
  };

  const rotation = Number(nodeData?.rotation ?? data?.rotation ?? 0) || 0;
  const w = 200; const h = 80; const cx = w / 2; const cy = h / 2;
  const rotatePoint = (x, y, angleDeg) => {
    const rad = (Number(angleDeg) || 0) * Math.PI / 180;
    const dx = x - cx; const dy = y - cy;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
    return { left: cx + rx, top: cy + ry };
  };
  const leftHandle = rotatePoint(6, 40, rotation);
  const rightHandle = rotatePoint(w - 6, 40, rotation);
  const topHandle = rotatePoint(cx, 14, rotation);
  const bottomHandle = rotatePoint(cx, h - 14, rotation);

  return (
    <div onClick={handleClick} onDoubleClick={beginEdit} style={{ width: 200, height: 80, position: 'relative', cursor: 'pointer' }}>
      <Handle type="target" position={Position.Left} id="t-left" style={{ ...handleStyle, left: leftHandle.left, top: leftHandle.top }} />
      <Handle type="source" position={Position.Right} id="s-right" style={{ ...handleStyle, left: rightHandle.left, top: rightHandle.top }} />
      <Handle type="target" position={Position.Top} id="t-top" style={{ ...handleStyle, left: topHandle.left, top: topHandle.top }} />
      <Handle type="source" position={Position.Bottom} id="s-bottom" style={{ ...handleStyle, left: bottomHandle.left, top: bottomHandle.top }} />

      {Boolean(nodeData && FLOW_METRIC_CONFIG[String(nodeData.id)]) && (
        <>
          <div style={{ position: 'absolute', left: -6, top: 28, width: 8, height: 8, borderRadius: '50%', background: '#fff', border: `2px solid ${customColor || '#073B70'}`, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          <div style={{ position: 'absolute', right: -6, top: 28, width: 8, height: 8, borderRadius: '50%', background: '#fff', border: `2px solid ${customColor || '#073B70'}`, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
        </>
      )}

      <div style={{ width: 200, height: 80, overflow: 'visible' }}>
        <svg width={200} height={80}>
          <g transform={`translate(${100}, ${40}) rotate(${Number(nodeData?.rotation ?? data?.rotation ?? 0) || 0})`}>
            {isEditing ? (
              <foreignObject x={-80} y={-18} width={160} height={42}>
                <div className="nodrag" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        event.stopPropagation();
                        saveLabel();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        event.stopPropagation();
                        setDraft(labelText);
                        setIsEditing(false);
                      }
                    }}
                    onBlur={() => saveLabel()}
                    style={{
                      width: Math.max(90, Math.min(140, (draft.length || 1) * 8 + 12)),
                      border: '1px solid #cbd5e1',
                      borderRadius: 4,
                      background: '#fff',
                      color: '#073B70',
                      fontSize: 12,
                      fontWeight: 800,
                      textAlign: 'center',
                      padding: '2px 6px',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      saveLabel();
                    }}
                    style={{
                      border: '1px solid #cbd5e1',
                      borderRadius: 4,
                      background: '#073B70',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 800,
                      width: 20,
                      height: 20,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    ✓
                  </button>
                </div>
              </foreignObject>
            ) : (
              <>
                {metricLabel ? (
                  <div style={{
                    position: 'absolute',
                    left: '50%',
                    top: -14,
                    transform: 'translateX(-50%)',
                    background: '#fff',
                    border: '1px solid #94a3b8',
                    borderRadius: 6,
                    padding: '4px 8px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.18)',
                    whiteSpace: 'nowrap',
                    fontSize: 11,
                    fontWeight: 900,
                    color: '#0b2447',
                    zIndex: 20,
                  }}>
                    {metricLabel}
                  </div>
                ) : null}
                <rect x={-90} y={-22} width={180} height={44} rx={22} ry={22} fill={isPending ? '#fee2e2' : (customColor ? `${customColor}22` : '#e6f2ff')} stroke={isPending ? '#ef4444' : (customColor || '#073B70')} strokeWidth={isPending || data?.selected ? 3 : 2} />
                <text x={0} y={6} fontFamily="Roboto, Arial" fontSize={13} fontWeight={800} fill={isPending ? '#b91c1c' : (customColor || '#073B70')} textAnchor="middle" onClick={beginEdit} onDoubleClick={beginEdit} style={{ cursor: 'pointer' }}>{labelText}</text>
              </>
            )}
          </g>
        </svg>
      </div>
    </div>
  );
}

function FlowDistrictNode(props) {
  const { data, ...rest } = props || {};
  const { InputProps, updateNodeDimensions, onNodeMouseDown, ...safeProps } = rest || {};
  const { nodeData, onSelect, onDuplicate, onConnectNode, onDeleteSelected, onRename, editMode, mode, deleteMode } = data || {};
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(getNodeDisplayName({ data: nodeData }));
  const customColor = nodeData?.customColor || nodeData?.color;

  useEffect(() => {
    setDraft(getNodeDisplayName({ data: nodeData }));
  }, [nodeData?.customName, nodeData?.label, nodeData?.display_name, nodeData?.nombre, nodeData?.apiName]);

  const handleClick = (ev) => {
    ev.stopPropagation();
    if (isEditing) return;
    if (editMode && deleteMode) {
      if (onDeleteSelected) onDeleteSelected(nodeData.id);
      return;
    }
    if (editMode && mode === 'duplicate') {
      if (onDuplicate) onDuplicate(nodeData.id);
      return;
    }
    if (editMode && mode === 'connect') {
      if (onConnectNode) onConnectNode(nodeData.id);
      return;
    }
    if (onSelect) onSelect(nodeData.id);
  };
  const isPending = Boolean(data && data.pendingConnect);
  const labelText = getNodeDisplayName({ data: nodeData });

  const beginEdit = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    setDraft(labelText);
    setIsEditing(true);
  };

  const saveLabel = () => {
    const clean = (draft || '').replace(/\s+/g, ' ').trim();
    const finalValue = clean || labelText;
    if (onRename) onRename(nodeData.id, finalValue);
    setDraft(finalValue);
    setIsEditing(false);
  };

  const handleStyle = {
    width: 10,
    height: 10,
    background: customColor || '#475569',
    border: '2px solid #ffffff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    borderRadius: '50%',
    zIndex: 10,
  };

  const rotation = Number(nodeData?.rotation ?? data?.rotation ?? 0) || 0;
  const w = 160; const h = 48; const cx = w / 2; const cy = h / 2;
  const rotatePoint = (x, y, angleDeg) => {
    const rad = (Number(angleDeg) || 0) * Math.PI / 180;
    const dx = x - cx; const dy = y - cy;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
    return { left: cx + rx, top: cy + ry };
  };
  const leftHandle = rotatePoint(6, cy, rotation);
  const rightHandle = rotatePoint(w - 6, cy, rotation);
  const topHandle = rotatePoint(cx, 4, rotation);
  const bottomHandle = rotatePoint(cx, h - 4, rotation);

  return (
    <div onClick={handleClick} onDoubleClick={beginEdit} style={{ width: 160, height: 48, position: 'relative', cursor: 'pointer' }}>
      <Handle type="target" position={Position.Left} id="t-left" style={{ ...handleStyle, left: leftHandle.left, top: leftHandle.top }} />
      <Handle type="source" position={Position.Right} id="s-right" style={{ ...handleStyle, left: rightHandle.left, top: rightHandle.top }} />
      <Handle type="target" position={Position.Top} id="t-top" style={{ ...handleStyle, left: topHandle.left, top: topHandle.top }} />
      <Handle type="source" position={Position.Bottom} id="s-bottom" style={{ ...handleStyle, left: bottomHandle.left, top: bottomHandle.top }} />

      <div style={{ width: 160, height: 48, overflow: 'visible' }}>
        <svg width={160} height={48}>
          <g transform={`translate(${80}, ${24}) rotate(${Number(nodeData?.rotation ?? data?.rotation ?? 0) || 0})`}>
            {isEditing ? (
              <foreignObject x={-55} y={-12} width={110} height={26}>
                <div className="nodrag" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        event.stopPropagation();
                        saveLabel();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        event.stopPropagation();
                        setDraft(labelText);
                        setIsEditing(false);
                      }
                    }}
                    onBlur={() => saveLabel()}
                    style={{
                      width: Math.max(70, Math.min(90, (draft.length || 1) * 7 + 10)),
                      border: '1px solid #cbd5e1',
                      borderRadius: 4,
                      background: '#fff',
                      color: '#475569',
                      fontSize: 11,
                      fontWeight: 700,
                      textAlign: 'center',
                      padding: '2px 4px',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      saveLabel();
                    }}
                    style={{
                      border: '1px solid #cbd5e1',
                      borderRadius: 4,
                      background: '#475569',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 800,
                      width: 18,
                      height: 18,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    ✓
                  </button>
                </div>
              </foreignObject>
            ) : (
              <>
                <rect rx={6} ry={6} x={-78} y={-17} width={156} height={34} fill={isPending ? '#fee2e2' : (customColor ? `${customColor}18` : '#fff')} stroke={isPending ? '#ef4444' : (customColor || (data?.selected ? '#2563eb' : '#6b7280'))} strokeWidth={isPending || data?.selected ? 2.5 : 1} />
                <text x={0} y={5} fontFamily="Roboto, Arial" fontSize={12} fill={isPending ? '#b91c1c' : (customColor || '#475569')} fontWeight={700} textAnchor="middle" onClick={beginEdit} onDoubleClick={beginEdit} style={{ cursor: 'pointer' }}>{labelText}</text>
              </>
            )}
          </g>
        </svg>
      </div>
    </div>
  );
}

// Shape / Note / Text Card Node — soporta formas SVG tipo Paint
function FlowShapeNode(props) {
  const { data, ...rest } = props || {};
  const { InputProps, updateNodeDimensions, onNodeMouseDown, ...safeProps } = rest || {};
  const { nodeData, onSelect, onDuplicate, onConnectNode, onDeleteSelected, onRename, editMode, mode, deleteMode } = data || {};
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(nodeData?.label || 'Texto / Forma');
  const [metricLabel, setMetricLabel] = useState(null);
  const customColor = nodeData?.customColor || nodeData?.color || '#3b82f6';
  const safeColor = /^#[0-9a-fA-F]{3,8}$/.test(customColor) ? customColor : '#3b82f6';
  const baseSize = getAutoShapeSize(draft, nodeData?.width, nodeData?.height);
  const width = Number.isFinite(Number(nodeData?.width)) ? Number(nodeData.width) : Number.isFinite(Number(baseSize.width)) ? Number(baseSize.width) : 120;
  const height = Number.isFinite(Number(nodeData?.height)) ? Number(nodeData.height) : Number.isFinite(Number(baseSize.height)) ? Number(baseSize.height) : 68;
  const shapeType = nodeData?.shapeType || 'rect';

  useEffect(() => {
    setDraft(nodeData?.label || nodeData?.customName || 'Texto / Forma');
  }, [nodeData?.label, nodeData?.customName]);


  // No dynamic metrics for shape nodes to preserve original layout.

  useEffect(() => {
    if (data && data.openEditor) {
      setIsEditing(true);
      try { if (typeof data.onEditorShown === 'function') data.onEditorShown(nodeData?.id || data?.id); } catch (e) {}
    }
  }, [data?.openEditor]);

  const handleClick = (ev) => {
    ev.stopPropagation();
    if (isEditing) return;
    if (editMode && deleteMode) { if (onDeleteSelected) onDeleteSelected(nodeData.id); return; }
    if (editMode && mode === 'duplicate') { if (onDuplicate) onDuplicate(nodeData.id); return; }
    if (editMode && mode === 'connect') {
      if (onConnectNode) {
        // compute click coordinates relative to node element
        try {
          const rect = ev.currentTarget.getBoundingClientRect ? ev.currentTarget.getBoundingClientRect() : null;
          const offsetX = rect ? (ev.clientX - rect.left) : (ev.nativeEvent && ev.nativeEvent.offsetX) || 0;
          const offsetY = rect ? (ev.clientY - rect.top) : (ev.nativeEvent && ev.nativeEvent.offsetY) || 0;
          onConnectNode(nodeData.id, { offsetX, offsetY });
        } catch (e) {
          onConnectNode(nodeData.id, null);
        }
      }
      return;
    }
    if (onSelect) onSelect(nodeData.id);
  };

  const beginEdit = (ev) => { ev.preventDefault(); ev.stopPropagation(); setDraft(getNodeDisplayName({ data: nodeData })); setIsEditing(true); };
  const saveLabel = () => {
    const clean = (draft || '').trim() || 'Texto';
    if (onRename) onRename(nodeData.id, clean);
    setDraft(clean);
    setIsEditing(false);
  };

  const isPending = Boolean(data && data.pendingConnect);
  const handleStyle = { width: 10, height: 10, background: safeColor, border: '2px solid #ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', borderRadius: '50%', zIndex: 10, opacity: editMode ? 1 : 0, pointerEvents: editMode ? 'auto' : 'none' };
  const btnStyle = { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, width: 22, height: 22, cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, padding: 0 };

  const renderShape = () => {
    const fill = `${safeColor}33`;
    const stroke = data?.selected || isPending ? '#ef4444' : safeColor;
    const sw = data?.selected ? 3 : 2;
    switch (shapeType) {
      case 'circle':
        return <ellipse cx={width / 2} cy={height / 2} rx={width / 2 - 2} ry={height / 2 - 2} fill={fill} stroke={stroke} strokeWidth={sw} />;
      case 'cylinder': {
        const bodyHeight = height - 10;
        return (
          <>
            <ellipse cx={width / 2} cy={9} rx={width / 2 - 6} ry={9} fill={fill} stroke={stroke} strokeWidth={sw} />
            <rect x={6} y={9} width={width - 12} height={bodyHeight - 2} fill={fill} stroke={stroke} strokeWidth={sw} />
            <ellipse cx={width / 2} cy={9 + bodyHeight - 2} rx={width / 2 - 6} ry={9} fill={fill} stroke={stroke} strokeWidth={sw} />
          </>
        );
      }
      case 'triangle':
        return <polygon points={`${width / 2},4 ${width - 4},${height - 4} 4,${height - 4}`} fill={fill} stroke={stroke} strokeWidth={sw} />;
      case 'diamond':
        return <polygon points={`${width / 2},4 ${width - 4},${height / 2} ${width / 2},${height - 4} 4,${height / 2}`} fill={fill} stroke={stroke} strokeWidth={sw} />;
      case 'hexagon': {
        const cx = width / 2, cy = height / 2, rx = width / 2 - 4, ry = height / 2 - 4;
        const pts = Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i - Math.PI / 6; return `${cx + rx * Math.cos(a)},${cy + ry * Math.sin(a)}`; }).join(' ');
        return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={sw} />;
      }
      case 'pentagon': {
        const cx = width / 2, cy = height / 2, rx = width / 2 - 4, ry = height / 2 - 4;
        const pts = Array.from({ length: 5 }, (_, i) => { const a = (Math.PI * 2 / 5) * i - Math.PI / 2; return `${cx + rx * Math.cos(a)},${cy + ry * Math.sin(a)}`; }).join(' ');
        return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={sw} />;
      }
      case 'arrow-right': {
        const h = height, w = width, aw = w * 0.35;
        return <polygon points={`0,${h * 0.25} ${w - aw},${h * 0.25} ${w - aw},0 ${w},${h / 2} ${w - aw},${h} ${w - aw},${h * 0.75} 0,${h * 0.75}`} fill={fill} stroke={stroke} strokeWidth={sw} />;
      }
      case 'star': {
        const cx = width / 2, cy = height / 2, outerR = Math.min(width, height) / 2 - 4, innerR = outerR * 0.45;
        const pts = Array.from({ length: 10 }, (_, i) => { const a = (Math.PI / 5) * i - Math.PI / 2; const r = i % 2 === 0 ? outerR : innerR; return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`; }).join(' ');
        return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={sw} />;
      }
      case 'speech-bubble': {
        const tw = 20, th = 16;
        return (<><rect x={0} y={0} width={width} height={height - th} rx={12} fill={fill} stroke={stroke} strokeWidth={sw} /><polygon points={`${width * 0.2},${height - th} ${width * 0.2 + tw},${height - th} ${width * 0.2},${height}`} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" /></>);
      }
      case 'line':
        return <line x1={4} y1={height / 2} x2={width - 4} y2={height / 2} stroke={stroke} strokeWidth={sw + 1} strokeLinecap="round" />;
      default:
        return <rect x={2} y={2} width={width - 4} height={height - 4} rx={8} fill={fill} stroke={stroke} strokeWidth={sw} />;
    }
  };

  return (
    <div onClick={handleClick} onDoubleClick={beginEdit} style={{ width, height, position: 'relative', cursor: 'pointer', overflow: 'visible' }}>
      <Handle type="target" position={Position.Left} id="t-left" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="s-right" style={handleStyle} />
      <Handle type="target" position={Position.Top} id="t-top" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="s-bottom" style={handleStyle} />
      <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
        <g transform={`translate(${width / 2}, ${height / 2}) rotate(${Number(nodeData?.rotation ?? data?.rotation ?? 0) || 0}) translate(${-width / 2}, ${-height / 2})`}>
          {renderShape()}
          {!isEditing && shapeType !== 'line' ? (
            <foreignObject x={0} y={0} width={width} height={height} style={{ overflow: 'visible' }}>
              <div xmlns="http://www.w3.org/1999/xhtml" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', wordBreak: 'break-word', color: '#0b2447', fontSize: 13, fontWeight: 700, padding: '4px 8px', boxSizing: 'border-box', pointerEvents: 'none', width: '100%', height: '100%' }}>
                {draft}
              </div>
            </foreignObject>
          ) : null}
        </g>
      </svg>
      {isPending && (<div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 900, padding: '1px 6px', borderRadius: 4 }}>ORIGEN</div>)}
      {isEditing ? (
        <div className="nodrag" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: width - 20, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 10 }}>
          <textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveLabel(); } if (e.key === 'Escape') { e.preventDefault(); setIsEditing(false); } }}
            onBlur={() => saveLabel()}
            style={{ width: '100%', minHeight: 48, fontSize: 12, fontFamily: 'inherit', fontWeight: 700, color: '#0b2447', border: `1px solid ${safeColor}`, borderRadius: 4, padding: 4, boxSizing: 'border-box', outline: 'none', resize: 'none', background: 'rgba(255,255,255,0.95)' }} />
          <button type="button" onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }} onClick={e => { e.preventDefault(); e.stopPropagation(); saveLabel(); }} style={{ alignSelf: 'flex-end', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 4, background: safeColor, color: '#fff', border: 'none', cursor: 'pointer' }}>✓ Guardar</button>
        </div>
      ) : null}
    </div>
  );
}

// Node types defined at module scope to avoid recreating object on each render
const NODE_TYPES = { tank: FlowTankNode, plant: FlowPlantNode, district: FlowDistrictNode, shape: FlowShapeNode };

function formatDateLabel(isoDate, fmt = 'dd/MM/yyyy') {
  try {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return isoDate;
    return formatDateFn(d, fmt);
  } catch (e) { return isoDate || ''; }
}

const DistrictFlow = React.forwardRef(function DistrictFlow({ initialNodes = [], initialEdges = [], onNodeSelect, onEdgeSelect, editMode = false, mode = 'select', deleteMode = false, containerRef = null, focusNodeId = null, filterState = 'all', apiError = false, edgeLineType, diagramModeExternal, onDiagramModeChange, onDirtyChanged }, ref) {

  // Note: avoid updateNodeDimensions to prevent React Flow from hiding nodes while measuring
  try { console.debug('[DISTRICT DEBUG] DistrictFlow init props initialNodes.length:', (initialNodes || []).length, 'initialEdges.length:', (initialEdges || []).length); } catch (e) {}
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [rfInstance, setRfInstance] = useState(null);
  // Force-visible CSS as a robust fallback when React Flow sets inline visibility:hidden
  useEffect(() => {
    try {
      if (!document.getElementById('district-force-visible')) {
        const s = document.createElement('style');
        s.id = 'district-force-visible';
        s.innerHTML = '.react-flow__node{visibility: visible !important; opacity: 1 !important;} .react-flow__node *{visibility: visible !important;}';
        document.head.appendChild(s);
      }
    } catch (e) {}
  }, []);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const selectedNodeIdRef = useRef(null);

  useEffect(() => {
    if ((nodes || []).length > 0) return;
    if (!Array.isArray(initialNodes) || initialNodes.length > 0) return;

    const fallbackNodes = STATIC_NODES.map((node) => {
      if (node.type === 'plant' || node.type === 'district') {
        return { id: node.id, type: node.type, label: node.label, position: node.position, data: { display_name: node.label } };
      }
      return { id: node.id, type: 'tank', label: node.label, position: node.position, data: { display_name: node.label, __placeholder: true } };
    });

    const fallbackEdges = (STATIC_CONNECTIONS || []).map((c) => ({
      id: `${c.from}-${c.to}`,
      source: c.from,
      target: c.to,
      label: c.label,
      type: 'step',
      markerEnd: { type: MarkerType.ArrowClosed, color: '#000' },
      style: { stroke: '#000', strokeWidth: 3, strokeLinecap: 'round' },
      animated: false,
    }));

    setNodes(fallbackNodes);
    nodesRef.current = fallbackNodes;
    setEdges(fallbackEdges);
    edgesRef.current = fallbackEdges;
  }, [initialNodes, nodes]);

  const _setSelectedNodeId = useCallback((id) => {
    selectedNodeIdRef.current = typeof id === 'function' ? id(selectedNodeIdRef.current) : id;
    setSelectedNodeId(id);
  }, []);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);

  const [connectPendingId, setConnectPendingId] = useState(null);
  const connectPendingHandleRef = useRef(null);

  // Compute nearest handle id based on click position within the node (normalized positions)
  const getNearestHandle = useCallback((pos, isSource) => {
    try {
      const nx = pos && pos.offsetX != null && pos.width ? (pos.offsetX / pos.width) : (pos && pos.offsetX != null ? pos.offsetX : 0.5);
      const ny = pos && pos.offsetY != null && pos.height ? (pos.offsetY / pos.height) : (pos && pos.offsetY != null ? pos.offsetY : 0.5);
      // normalized anchor points (based on tank geometry constants)
      const anchors = {
        left: { x: 20 / 120, y: 81 / 200 },
        right: { x: 100 / 120, y: 81 / 200 },
        top: { x: 60 / 120, y: 36 / 200 },
        bottom: { x: 60 / 120, y: 126 / 200 },
        topLeft: { x: 28 / 120, y: 48 / 200 },
        topRight: { x: 92 / 120, y: 48 / 200 },
        bottomLeft: { x: 28 / 120, y: 114 / 200 },
        bottomRight: { x: 92 / 120, y: 114 / 200 },
      };
      let best = null;
      let bestD = Number.POSITIVE_INFINITY;
      for (const k of Object.keys(anchors)) {
        const a = anchors[k];
        const dx = (nx - a.x);
        const dy = (ny - a.y);
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = k; }
      }
      if (!best) return undefined;
      const sourceMap = {
        left: 's-bottom-left', topLeft: 's-bottom-left', bottomLeft: 's-bottom-left',
        right: 's-right', topRight: 's-top-right', bottomRight: 's-right',
        top: 's-top-right', bottom: 's-bottom'
      };
      const targetMap = {
        left: 't-left', topLeft: 't-top-left', bottomLeft: 't-left',
        right: 't-bottom-right', topRight: 't-bottom-right', bottomRight: 't-bottom-right',
        top: 't-top', bottom: 't-bottom-right'
      };
      return isSource ? (sourceMap[best] || 's-right') : (targetMap[best] || 't-left');
    } catch (e) { return undefined; }
  }, []);
  const openEditorRef = useRef(new Set());
  const [showFlow, setShowFlow] = useState(false);
  const [connectDate, setConnectDate] = useState('');
  const [connectDateFormat, setConnectDateFormat] = useState(() => {
    try { return localStorage.getItem('district_connect_date_format') || 'dd/MM/yyyy'; } catch (e) { return 'dd/MM/yyyy'; }
  });
  const [saveMsg, setSaveMsg] = useState(null); // null | 'ok' | 'error'
  // 'edit' = nodos arrastrables | 'view' = solo visual (no se puede tocar nada)
  // diagramMode: se controla desde el padre (DistrictMap) via prop, pero también tiene estado local como fallback
  const [diagramMode, setDiagramMode] = useState(() => {
    try { return localStorage.getItem('district_diagram_mode') || 'view'; } catch (e) { return 'view'; }
  });
  // Sincronizar con el prop externo cuando cambia
  useEffect(() => {
    if (diagramModeExternal && diagramModeExternal !== diagramMode) {
      setDiagramMode(diagramModeExternal);
    }
  }, [diagramModeExternal]);
  const [wsQueueSize, setWsQueueSize] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [debugWsEnabled, setDebugWsEnabled] = useState(false);
  const [overlayPos, setOverlayPos] = useState(() => {
    try {
      const raw = localStorage.getItem('district_ws_overlay_pos');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { useRight: true, right: 12, top: 12, x: null, y: 12 };
  });
  const overlayRef = useRef(null);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef(0);
  const autoSaveTimerRef = useRef(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const autoSaveEnabledRef = useRef(autoSaveEnabled);
  useEffect(() => { try { autoSaveEnabledRef.current = !!autoSaveEnabled; } catch (e) {} }, [autoSaveEnabled]);
  const wsRef = useRef(null);
  // Tipo de arista por defecto (se puede cambiar desde DistrictMap via ref)
  const [defaultEdgeType, setDefaultEdgeTypeState] = useState(() => edgeLineType || 'straight');
  // Sincronizar con prop cuando cambia desde fuera
  useEffect(() => { if (edgeLineType && edgeLineType !== defaultEdgeType) setDefaultEdgeTypeState(edgeLineType); }, [edgeLineType]);
  const reconnectRef = useRef({ attempts: 0, timeoutId: null });
  const sendQueueRef = useRef([]);
  const wsConnectTimerRef = useRef(null);
  // max queued WS messages to avoid unbounded memory growth when disconnected
  const SEND_QUEUE_MAX = 100;
  // server save debounce/backoff refs
  const pendingServerSaveRef = useRef(null);
  const serverSaveTimerRef = useRef(null);
  const serverBackoffRef = useRef({ attempts: 0, timeoutId: null });
  const heartbeatRef = useRef(null);

  // Expose helpers to inspect and manage the send queue
  const flushSendQueue = useCallback(async () => {
    try {
      const q = Array.isArray(sendQueueRef.current) ? [...sendQueueRef.current] : [];
      if (!q.length) return true;
      // If WS is open, try to send all
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        let sent = 0;
        while (sendQueueRef.current && sendQueueRef.current.length) {
          const m = sendQueueRef.current.shift();
          try { wsRef.current.send(m); sent += 1; } catch (e) { console.warn('[WS CLIENT] flushSendQueue send error', e && e.message); sendQueueRef.current.unshift(m); break; }
        }
        try { localStorage.setItem('district_ws_queue', JSON.stringify(sendQueueRef.current || [])); } catch (e) {}
        console.log('[WS CLIENT] flushSendQueue sent', sent);
        return sent > 0;
      }

      // Fallback: POST the most recent queued state to the server
      try {
        const last = q[q.length - 1];
        const parsed = JSON.parse(last || '{}');
        const state = parsed.state || parsed;
        if (state && typeof state === 'object') {
          await diagramService.saveState(state);
          sendQueueRef.current = [];
          try { localStorage.removeItem('district_ws_queue'); } catch (e) {}
          console.log('[DIAGRAM] flushSendQueue fallback: posted latest queued state to server');
          return true;
        }
      } catch (e) { console.warn('[DIAGRAM] flushSendQueue fallback failed', e && e.message); }
    } catch (e) { console.warn('[WS CLIENT] flushSendQueue error', e && e.message); }
    return false;
  }, []);

  const clearSendQueue = useCallback(() => {
    try {
      sendQueueRef.current = [];
      try { localStorage.removeItem('district_ws_queue'); } catch (e) {}
      setWsQueueSize(0);
      console.log('[WS CLIENT] clearSendQueue: queue cleared');
      return true;
    } catch (e) { console.warn('[WS CLIENT] clearSendQueue error', e && e.message); return false; }
  }, []);

  const readDiagramState = useCallback(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('district_state') || '{}');
      if (!raw || typeof raw !== 'object') return {};
      const normalizedNodes = raw.nodes && typeof raw.nodes === 'object'
        ? Object.fromEntries(
            Object.entries(raw.nodes).map(([id, entry]) => [id, sanitizePersistedNodeVisual(entry)] )
          )
        : {};
      raw.nodes = normalizedNodes;
      raw.hiddenNodeIds = Array.isArray(raw.hiddenNodeIds) ? [...new Set(raw.hiddenNodeIds.filter((id) => id != null && String(id).trim() !== ''))] : [];
      raw.deletedNodeIds = Array.isArray(raw.deletedNodeIds) ? [...new Set(raw.deletedNodeIds.filter((id) => id != null && String(id).trim() !== ''))] : [];
      return raw;
    } catch (e) {
      return {};
    }
  }, []);

  const readAuthoritativeDiagramState = useCallback(async () => {
    try {
      const remote = await diagramService.getState();
      const remoteHasState = !!(
        remote &&
        typeof remote === 'object' &&
        (
          (remote.nodes && typeof remote.nodes === 'object' && Object.keys(remote.nodes).length > 0) ||
          (Array.isArray(remote.edges) && remote.edges.length > 0)
        )
      );
      if (!remoteHasState) return readDiagramState();

      const normalized = { ...remote };
      normalized.nodes = normalized.nodes && typeof normalized.nodes === 'object'
        ? Object.fromEntries(Object.entries(normalized.nodes).map(([id, entry]) => [id, sanitizePersistedNodeVisual(entry)]))
        : {};
      normalized.hiddenNodeIds = Array.isArray(normalized.hiddenNodeIds) ? [...new Set(normalized.hiddenNodeIds.filter((id) => id != null && String(id).trim() !== ''))] : [];
      normalized.deletedNodeIds = Array.isArray(normalized.deletedNodeIds) ? [...new Set(normalized.deletedNodeIds.filter((id) => id != null && String(id).trim() !== ''))] : [];
      try { localStorage.setItem('district_state', JSON.stringify(normalized)); } catch (e) {}
      return normalized;
    } catch (e) {
      return readDiagramState();
    }
  }, [readDiagramState]);

  const _validateBeforeSave = (candidate, baseline) => {
    try {
      const candNodes = candidate && candidate.nodes && typeof candidate.nodes === 'object' ? Object.keys(candidate.nodes).length : 0;
      const baseNodes = baseline && baseline.nodes && typeof baseline.nodes === 'object' ? Object.keys(baseline.nodes).length : 0;
      if (baseNodes >= 59 && candNodes < baseNodes) {
        console.warn('[DIAGRAM] Validation failed: candidate node count is less than baseline', candNodes, '<', baseNodes);
        return false;
      }
      // ensure nodes have positions
      if (candidate && candidate.nodes && typeof candidate.nodes === 'object') {
        for (const [id, n] of Object.entries(candidate.nodes)) {
          if (n == null) continue;
          const hasPos = (typeof n.x === 'number' || (n.position && typeof n.position.x === 'number')) && (typeof n.y === 'number' || (n.position && typeof n.position.y === 'number'));
          if (!hasPos) {
            console.warn('[DIAGRAM] Validation failed: node missing position for', id);
            return false;
          }
        }
      }
      // edges must be array
      if (candidate && candidate.edges && !Array.isArray(candidate.edges)) {
        console.warn('[DIAGRAM] Validation failed: edges not an array');
        return false;
      }
      return true;
    } catch (e) { return false; }
  };

  // Serialized debounced save: keep only the latest pending state and ensure
  // only one server request runs at a time. Maintain a local backup before
  // overwriting server state. localStorage is only cache; React Flow is
  // source of truth for state passed into this function.
  const savingRef = useRef(false);
  const writeDiagramState = useCallback((nextState) => {
    try {
      const safe = nextState && typeof nextState === 'object' ? nextState : {};
      try { safe._updatedAt = new Date().toISOString(); } catch (e) { /* ignore */ }
      safe.hiddenNodeIds = Array.isArray(safe.hiddenNodeIds) ? [...new Set(safe.hiddenNodeIds.filter((id) => id != null && String(id).trim() !== ''))] : [];
      safe.deletedNodeIds = Array.isArray(safe.deletedNodeIds) ? [...new Set(safe.deletedNodeIds.filter((id) => id != null && String(id).trim() !== ''))] : [];
      if (safe.nodes && typeof safe.nodes === 'object') {
        safe.nodes = Object.fromEntries(
          Object.entries(safe.nodes).map(([id, entry]) => [id, sanitizePersistedNodeVisual(entry)])
        );
      }

      // Validate against local baseline only (do not fetch remote state here).
      try {
        const baseline = readDiagramState();
        if (!_validateBeforeSave(safe, baseline)) {
          console.warn('[DIAGRAM] Aborting server save: payload failed validation');
          try { localStorage.setItem('district_state', JSON.stringify(safe)); } catch (e) {}
          try { if (typeof onDirtyChanged === 'function') onDirtyChanged(true); } catch (e) {}
          return;
        }
      } catch (e) { /* proceed conservatively */ }

      // write local cache and keep a backup of previous cached state
      try {
        const prevRaw = (function() { try { return JSON.parse(localStorage.getItem('district_state') || '{}'); } catch (e) { return {}; } })();
        try { localStorage.setItem('district_state_backup', JSON.stringify(prevRaw)); } catch (e) {}
        try { localStorage.setItem('district_state', JSON.stringify(safe)); } catch (e) {}
      } catch (e) {}

      console.log('[DIAGRAM] writeDiagramState: local saved _updatedAt=', safe._updatedAt);

      // Set latest pending payload and schedule debounced processing
      pendingServerSaveRef.current = safe;
      // clear any existing timer
      try { if (serverSaveTimerRef.current) { clearTimeout(serverSaveTimerRef.current); serverSaveTimerRef.current = null; } } catch (e) {}

      const processPending = async () => {
        if (savingRef.current) return; // already running
        savingRef.current = true;
        // reset backoff attempts only on explicit start of processing
        serverBackoffRef.current.attempts = serverBackoffRef.current.attempts || 0;
        while (pendingServerSaveRef.current) {
          const payload = pendingServerSaveRef.current;
          // capture latest and clear so new updates can arrive
          pendingServerSaveRef.current = null;
          try {
            await diagramService.saveState(payload);
            console.log('[DIAGRAM] saved to server');
            serverBackoffRef.current.attempts = 0;
            try { if (typeof onDirtyChanged === 'function') onDirtyChanged(false); } catch (e) {}
          } catch (err) {
            // on failure, restore payload as pending and schedule retry with backoff
            serverBackoffRef.current.attempts = (serverBackoffRef.current.attempts || 0) + 1;
            const attempt = Math.min(serverBackoffRef.current.attempts, 6);
            const delay = Math.min(30000, Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 1000));
            console.warn('[DIAGRAM] save to server failed, scheduling retry in', delay, 'ms', err && err.message);
            pendingServerSaveRef.current = payload;
            try { if (serverBackoffRef.current.timeoutId) clearTimeout(serverBackoffRef.current.timeoutId); } catch (e) {}
            serverBackoffRef.current.timeoutId = setTimeout(() => {
              serverBackoffRef.current.timeoutId = null;
              processPending();
            }, delay);
            break; // exit loop; retry will re-enter
          }
        }
        savingRef.current = false;
      };

      serverSaveTimerRef.current = setTimeout(() => { processPending(); serverSaveTimerRef.current = null; }, 800);

      // WebSocket notification (best-effort); keep queue behavior
      try {
        const msg = JSON.stringify({ type: 'diagram:update', updated_at: safe._updatedAt || new Date().toISOString(), state: safe });
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          try { wsRef.current.send(msg); } catch (e) { console.warn('[WS CLIENT] send failed', e && e.message); }
        } else {
          try {
            sendQueueRef.current = sendQueueRef.current || [];
            sendQueueRef.current.push(msg);
            if (sendQueueRef.current.length > SEND_QUEUE_MAX) {
              const dropped = sendQueueRef.current.length - SEND_QUEUE_MAX;
              sendQueueRef.current.splice(0, dropped);
              console.warn('[WS CLIENT] send queue exceeded max; dropped', dropped, 'oldest messages');
            }
            try { localStorage.setItem('district_ws_queue', JSON.stringify(sendQueueRef.current)); } catch (e) {}
          } catch (e) { console.warn('[WS CLIENT] enqueue failed', e && e.message); }
        }
      } catch (e) { console.error('[WS CLIENT] send error', e && e.message); }
    } catch (e) { console.error('[DIAGRAM] writeDiagramState error', e && e.message); }
  }, []);

  // Poll server periodically to detect remote updates and reload local state when newer
  useEffect(() => {
    // WebSocket connection for real-time sync with reconnection, queueing and heartbeat
    let mounted = true;
    const envWs = import.meta.env.VITE_WS_URL;
    const wsUrl = envWs || `ws://127.0.0.1:8080`;
    console.log('[WS CLIENT] using wsUrl=', wsUrl, envWs ? '(from VITE_WS_URL)' : '(forced to 127.0.0.1 for debug)');

    const connect = () => {
      try {
        console.log('[WS CLIENT] connecting to', wsUrl);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.addEventListener('open', () => {
          console.log('[WS CLIENT] open');
          reconnectRef.current.attempts = 0;
          // flush send queue
          try {
            // restore persisted queue if any
            try {
              const raw = localStorage.getItem('district_ws_queue');
              if (raw) {
                try { sendQueueRef.current = JSON.parse(raw) || sendQueueRef.current; } catch (e) { sendQueueRef.current = sendQueueRef.current; }
              }
            } catch (e) {}

            while ((sendQueueRef.current || []).length > 0) {
              const m = sendQueueRef.current.shift();
              try { ws.send(m); } catch (e) { console.warn('[WS CLIENT] flush send error', e && e.message); sendQueueRef.current.unshift(m); break; }
            }
            try { if ((sendQueueRef.current || []).length === 0) localStorage.removeItem('district_ws_queue'); else localStorage.setItem('district_ws_queue', JSON.stringify(sendQueueRef.current)); } catch (e) {}
          } catch (e) {}
          // start heartbeat
          try { clearInterval(heartbeatRef.current); } catch (e) {}
          heartbeatRef.current = setInterval(() => {
            try { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping', ts: new Date().toISOString() })); } catch (e) {}
          }, 25000);
          setWsConnected(true);
        });

        ws.addEventListener('message', (ev) => {
          try { console.log('[WS CLIENT] received raw message', ev.data); } catch (e) {}
          try {
            const msg = JSON.parse(ev.data || '{}');
            if (!msg || typeof msg !== 'object') return;
            if (msg.type === 'diagram:update') {
              const remote = msg.state || {};
              const remoteTs = (remote.updated_at || remote.updatedAt || remote._updatedAt || msg.updated_at || '').toString();
              const localRaw = (function() { try { return localStorage.getItem('district_state') || '{}'; } catch (e) { return '{}'; }})();
              const local = JSON.parse(localRaw || '{}');
              const localTs = (local.updated_at || local.updatedAt || local._updatedAt || '').toString();
              try {
                const locked = (function() { try { return localStorage.getItem('district_locked') === '1'; } catch (e) { return false; } })();
                if (locked) {
                  console.log('[WS CLIENT] remote diagram:update ignored because district_locked=1');
                } else if (remoteTs && (!localTs || new Date(remoteTs).getTime() > new Date(localTs).getTime())) {
                  try { applyRemoteState(remote); } catch (e) {}
                }
              } catch (e) {}
            }
          } catch (e) {}
        });

        ws.addEventListener('close', (ev) => {
          console.log('[WS CLIENT] close', ev && ev.code);
          wsRef.current = null;
          try { clearInterval(heartbeatRef.current); } catch (e) {}
          setWsConnected(false);
          scheduleReconnect();
        });

        ws.addEventListener('error', (err) => {
          console.error('[WS CLIENT] error', err && err.message);
          try { ws.close(); } catch (e) {}
        });
      } catch (e) {
        console.error('[WS CLIENT] connect exception', e && e.message);
        scheduleReconnect();
      }
    };

    const scheduleReconnect = () => {
      try {
        reconnectRef.current.attempts = (reconnectRef.current.attempts || 0) + 1;
        const attempt = Math.min(reconnectRef.current.attempts, 6);
        const delay = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 1000);
        console.log('[WS CLIENT] scheduling reconnect in', delay, 'ms (attempt', reconnectRef.current.attempts, ')');
        try { clearTimeout(reconnectRef.current.timeoutId); } catch (e) {}
        reconnectRef.current.timeoutId = setTimeout(() => { if (mounted) connect(); }, delay);
      } catch (e) {}
    };

    // initial connect (delayed slightly to let UI render faster)
    try {
      wsConnectTimerRef.current = setTimeout(() => connect(), 250);
    } catch (e) { connect(); }

    // fallback polling if WS repeatedly fails (ensure clients eventually sync)
    const pollingInterval = setInterval(async () => {
      try {
        const remote = await diagramService.getState();
        if (!remote || typeof remote !== 'object') return;
        const localRaw = (function() { try { return localStorage.getItem('district_state') || '{}'; } catch (e) { return '{}'; }})();
        const local = JSON.parse(localRaw || '{}');
        const remoteTs = (remote.updated_at || remote.updatedAt || remote._updatedAt || '').toString();
        const localTs = (local.updated_at || local.updatedAt || local._updatedAt || '').toString();
        if (remoteTs && (!localTs || new Date(remoteTs).getTime() > new Date(localTs).getTime())) {
          try {
            const locked = (function() { try { return localStorage.getItem('district_locked') === '1'; } catch (e) { return false; } })();
            if (mounted && typeof applyRemoteState === 'function' && !locked) {
              applyRemoteState(remote);
            } else if (locked) {
              console.log('[POLL] remote state ignored because district_locked=1');
            }
          } catch (e) {}
        }
      } catch (e) {}
    }, 15000);
    return () => { mounted = false; try { clearInterval(pollingInterval); } catch (e) {}; try { clearInterval(heartbeatRef.current); } catch (e) {}; if (wsRef.current) { try { wsRef.current.close(); } catch (e) {} } if (reconnectRef.current.timeoutId) { try { clearTimeout(reconnectRef.current.timeoutId); } catch (e) {} } try { if (wsConnectTimerRef.current) clearTimeout(wsConnectTimerRef.current); } catch (e) {} };
  }, []);

  // Load full tank info asynchronously and merge into nodes' data (non-blocking).
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await tanqueService.getTanques();
        const list = (res && res.tanques) || [];
        if (!list || !list.length) return;

        const map = new Map();
        for (const t of list) {
          if (!t) continue;
          const key = String((t.tag || t.apiName || t.nombre || t.display_name || t.id || '')).toLowerCase();
          map.set(key, t);
        }

        const updated = (nodesRef.current || []).map((n) => {
          try {
            const nd = (n.data && n.data.nodeData) ? n.data.nodeData : (n.data || {});
            const candidates = [nd.apiName, nd.originalName, nd.tag, nd.display_name, nd.nombre, nd.label, n.id].map(x => String(x || '').toLowerCase());
            let found = null;
            for (const c of candidates) {
              if (!c) continue;
              if (map.has(c)) { found = map.get(c); break; }
            }
            if (!found) return n;

            const nameLocked = Boolean(nd.nameLocked || n.nameLocked || (nd && nd.nameLocked));
            const preservedCustom = nameLocked ? (nd.customName || n.customName || '') : (nd.customName || found.display_name || '');

            const enriched = enrichTankNodeMetrics(found || {});
            const mergedNodeData = { ...nd, ...enriched, customName: preservedCustom || nd.customName, display_name: preservedCustom || enriched.display_name || nd.display_name };

            return { ...n, data: { ...(n.data || {}), nodeData: mergedNodeData, ...mergedNodeData } };
          } catch (e) { return n; }
        });

        if (mounted) {
          nodesRef.current = updated;
          setNodes([...updated]);
        }
      } catch (e) {}
    })();
    return () => { mounted = false; };
  }, []);

  // monitor queue size and ws status periodically for UI
  useEffect(() => {
    const id = setInterval(() => {
      try { setWsQueueSize((sendQueueRef.current || []).length); } catch (e) { setWsQueueSize(0); }
      try { setWsConnected(Boolean(wsRef.current && wsRef.current.readyState === WebSocket.OPEN)); } catch (e) { setWsConnected(false); }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // debug flag: read from localStorage and support Ctrl+Shift+D toggle
  useEffect(() => {
    try { const v = (localStorage.getItem('district_debug_ws') || 'false') === 'true'; setDebugWsEnabled(v); } catch (e) { setDebugWsEnabled(false); }
    const handler = (ev) => {
      if (ev.ctrlKey && ev.shiftKey && ev.key.toLowerCase() === 'd') {
        try {
          const next = !debugWsEnabled;
          setDebugWsEnabled(next);
          try { localStorage.setItem('district_debug_ws', next ? 'true' : 'false'); } catch (e) {}
          console.log('[DISTRICT] toggled district_debug_ws ->', next);
        } catch (e) {}
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [debugWsEnabled]);

  // Drag handlers for overlay
  useEffect(() => {
    const onMove = (ev) => {
      if (!draggingRef.current) return;
      try {
        const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
        const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
        const left = Math.max(8, Math.min(window.innerWidth - (overlayRef.current?.offsetWidth || 200) - 8, clientX - dragOffsetRef.current));
        const top = Math.max(8, Math.min(window.innerHeight - (overlayRef.current?.offsetHeight || 60) - 8, clientY - 8));
        const next = { useRight: false, x: Math.round(left), y: Math.round(top), right: null, top: Math.round(top) };
        setOverlayPos(next);
        try { localStorage.setItem('district_ws_overlay_pos', JSON.stringify(next)); } catch (e) {}
      } catch (e) {}
    };

    const onUp = () => { draggingRef.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, []);

  // On mount try to fetch remote saved state and populate localStorage when local is empty
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const remote = await diagramService.getState();
        if (!remote || typeof remote !== 'object') return;

        const hasRemoteNodes = (remote.nodes && (Array.isArray(remote.nodes) ? remote.nodes.length > 0 : Object.keys(remote.nodes).length > 0));
        const localRaw = (function() { try { return localStorage.getItem('district_state') || '{}'; } catch (e) { return '{}'; }})();
        const local = JSON.parse(localRaw || '{}');
        const hasLocalNodes = (local && local.nodes && (Array.isArray(local.nodes) ? local.nodes.length > 0 : Object.keys(local.nodes).length > 0));

        if (hasRemoteNodes && !hasLocalNodes) {
          try {
            // Apply remote state in-memory to avoid disrupting user's layout; do not overwrite localStorage unless autosave enabled
            try {
              const locked = (function() { try { return localStorage.getItem('district_locked') === '1'; } catch (e) { return false; } })();
              if (mounted && typeof applyRemoteState === 'function' && !locked) {
                applyRemoteState(remote);
              } else if (locked) {
                console.log('[INIT] remote state load skipped because district_locked=1');
              }
            } catch (e) {}
          } catch (e) {}
        }
      } catch (e) {}
    })();
    return () => { mounted = false; };
  }, [readDiagramState]);

  const getPersistedNodeEntry = useCallback((node, previous = {}) => {
    const prev = sanitizePersistedNodeVisual(previous && typeof previous === 'object' ? previous : {});
    const source = node?.data?.nodeData || node?.data || {};
    const baseName = source.apiName || source.originalName || source.tag || source.display_name || source.nombre || source.label || node?.label || node?.id || 'Sin nombre';
    const customName = node?.customName || source.customName || source.diagramName || source.displayName || prev.customName || '';
    const label = String(customName || baseName || prev.label || node?.id || 'Sin nombre').trim();
    const safeX = Number.isFinite(Number(node?.position?.x)) ? Number(node.position.x) : Number.isFinite(Number(prev.x)) ? Number(prev.x) : 0;
    const safeY = Number.isFinite(Number(node?.position?.y)) ? Number(node.position.y) : Number.isFinite(Number(prev.y)) ? Number(prev.y) : 0;
    const safeWidth = Number.isFinite(Number(source.width)) ? Number(source.width) : Number.isFinite(Number(prev.width)) ? Number(prev.width) : null;
    const safeHeight = Number.isFinite(Number(source.height)) ? Number(source.height) : Number.isFinite(Number(prev.height)) ? Number(prev.height) : null;
    const safeRotation = Number.isFinite(Number(source.rotation)) ? Number(source.rotation) : Number.isFinite(Number(prev.rotation)) ? Number(prev.rotation) : 0;
    return {
      id: node?.id || prev.id || null,
      type: node?.type || prev.type || 'tank',
      x: safeX,
      y: safeY,
      label,
      customName: customName || prev.customName || '',
      nameLocked: prev.nameLocked || false,
      color: source.color || source.customColor || prev.color || prev.customColor || '',
      customColor: source.customColor || source.color || prev.customColor || prev.color || '',
      shapeType: source.shapeType || prev.shapeType || 'box',
      width: safeWidth,
      height: safeHeight,
      rotation: safeRotation,
      lockedPosition: prev.lockedPosition || false,
      // persist key metric/display fields so duplicated or user-added nodes keep their values
      valor_m: source.valor_m ?? source.nivel ?? prev.valor_m ?? prev.nivel ?? null,
      nivel: source.nivel ?? source.valor_m ?? prev.nivel ?? prev.valor_m ?? null,
      porcentaje: (source.porcentaje ?? source.porcentaje_capacidad ?? source.porcentaje_api) ?? (prev.porcentaje ?? prev.porcentaje_capacidad ?? prev.porcentaje_api) ?? null,
      capacidad_actual_m3: source.capacidad_actual_m3 ?? source.capacidad_m3 ?? prev.capacidad_actual_m3 ?? prev.capacidad_m3 ?? null,
      capacidad_maxima_m3: source.capacidad_maxima_m3 ?? prev.capacidad_maxima_m3 ?? null,
      volumen_restante_m3: source.volumen_restante_m3 ?? prev.volumen_restante_m3 ?? null,
      altura_rebose: source.altura_rebose ?? source.altura_rebose_m ?? prev.altura_rebose ?? prev.altura_rebose_m ?? null,
      altura_rebose_calibrada: source.altura_rebose_calibrada ?? prev.altura_rebose_calibrada ?? source.altura_rebose_m ?? prev.altura_rebose_m ?? null,
      tag: source.tag ?? prev.tag ?? null,
      display_name: source.display_name ?? source.nombre ?? source.label ?? prev.display_name ?? prev.nombre ?? prev.label ?? null,
    };
  }, []);
  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const nodesRef = useRef([]);
  const edgesRef = useRef([]);
  // Ref estable para onNodeSelect — evita recrear callbacks cuando el padre re-renderiza
  const onNodeSelectRef = useRef(onNodeSelect);
  useEffect(() => { onNodeSelectRef.current = onNodeSelect; }, [onNodeSelect]);
  // Refs estables para todos los callbacks — declarados aquí arriba para que estén disponibles
  // en cualquier closure (init effect, withControls, etc.) sin problemas de TDZ.
  const moveNodeRef = useRef(null);
  const handleConnectSelectionRef = useRef(null);
  const duplicateSelectedNodeRef = useRef(null);
  const applyNodeRenameRef = useRef(null);
  const deleteSelectedNodeRef = useRef(null);


  const moveNode = useCallback((id, dx, dy) => {
    setNodes((nds) => {
      const before = nds.map(n => ({ id: n.id, position: n.position }));
      pastRef.current.push({ nodes: Object.fromEntries(before.map(b => [b.id, b.position])), edges: edgesRef.current });
      futureRef.current = [];
      const updated = nds.map(n => n.id === id ? ({ ...n, position: { x: (n.position.x || 0) + dx, y: (n.position.y || 0) + dy } }) : n);
      try {
        // Do not persist on each immediate move; mark as dirty so the parent UI
        // can show "Cambios no guardados". Actual persistence happens on explicit save.
        try { if (typeof onDirtyChanged === 'function') onDirtyChanged(true); } catch (e) {}
      } catch (e) {}
      return updated;
    });
  }, [readDiagramState, writeDiagramState, getPersistedNodeEntry]);

  const persistDistrictState = useCallback(async (nextNodes = nodesRef.current, nextEdges = edgesRef.current, options = {}) => {
    try {
      // Use local cache as baseline; do NOT fetch remote authoritative state here
      const baseline = readDiagramState();
      const raw = { ...(baseline || {}) };
      const savedNodes = {};
      (nextNodes || []).forEach((n) => {
        const prev = raw.nodes && raw.nodes[n.id] && typeof raw.nodes[n.id] === 'object' ? raw.nodes[n.id] : {};
        savedNodes[n.id] = getPersistedNodeEntry(n, prev);
      });
      raw.nodes = savedNodes;
      raw.edges = Array.isArray(nextEdges) ? nextEdges : [];
      raw.hiddenNodeIds = Array.isArray(options.hiddenNodeIds) ? options.hiddenNodeIds : (Array.isArray(raw.hiddenNodeIds) ? raw.hiddenNodeIds : []);
      raw.deletedNodeIds = Array.isArray(options.deletedNodeIds) ? options.deletedNodeIds : (Array.isArray(raw.deletedNodeIds) ? raw.deletedNodeIds : []);
      // Only persist to localStorage/server when autosave is enabled.
      if (autoSaveEnabledRef.current) {
        // Validate before attempting server save
        try {
          if (!_validateBeforeSave(raw, baseline)) {
            console.warn('[DIAGRAM] Persist aborted: payload failed validation');
            try { if (typeof onDirtyChanged === 'function') onDirtyChanged(true); } catch (e) {}
          } else {
            writeDiagramState(raw);
            try { if (typeof onDirtyChanged === 'function') onDirtyChanged(false); } catch (e) {}
          }
        } catch (e) { /* validation errors -> mark dirty */ try { if (typeof onDirtyChanged === 'function') onDirtyChanged(true); } catch (err) {} }
      } else {
        // Mark as dirty (changes pending save) when autosave is disabled
        try { if (typeof onDirtyChanged === 'function') onDirtyChanged(true); } catch (e) {}
      }
    } catch (e) {}
  }, [getPersistedNodeEntry, readDiagramState, writeDiagramState]);

  const applyNodeRename = useCallback((id, label) => {
    const clean = (label || '').replace(/\s+/g, ' ').trim();
    if (!clean) return;

    const nextNodes = (nodesRef.current || []).map((n) => {
      if (n.id !== id) return n;

      const nextLabel = clean;
      const sourceData = (n.data && n.data.nodeData) || (n.data || {});
      const originalName = sourceData.apiName || sourceData.originalName || sourceData.tag || sourceData.display_name || sourceData.nombre || sourceData.label || n.label || n.id;
      const currentWidth = Number.isFinite(Number(sourceData.width)) ? Number(sourceData.width) : null;
      const currentHeight = Number.isFinite(Number(sourceData.height)) ? Number(sourceData.height) : null;
      const shouldAutoFitShape = n.type === 'shape' && (currentWidth == null || Math.abs(currentWidth - 120) < 0.5 || currentHeight == null || Math.abs(currentHeight - 68) < 0.5);
      const autoShapeSize = n.type === 'shape' && shouldAutoFitShape ? getAutoShapeSize(nextLabel, null, null) : null;
      const nextNodeData = {
        ...sourceData,
        id: n.id,
        type: n.type,
        customName: nextLabel,
        nameLocked: true,
        label: nextLabel,
        display_name: nextLabel,
        nombre: nextLabel,
        originalName,
        apiName: sourceData.apiName || sourceData.originalName || sourceData.tag || sourceData.display_name || sourceData.nombre || originalName,
        width: autoShapeSize ? autoShapeSize.width : sourceData.width,
        height: autoShapeSize ? autoShapeSize.height : sourceData.height,
      };

      return {
        ...n,
        customName: nextLabel,
        nameLocked: true,
        label: nextLabel,
        data: {
          ...((n.data && { ...n.data }) || {}),
          id: n.id,
          type: n.type,
          customName: nextLabel,
          nameLocked: true,
          label: nextLabel,
          display_name: nextLabel,
          nombre: nextLabel,
          originalName,
          apiName: sourceData.apiName || sourceData.originalName || sourceData.tag || sourceData.display_name || sourceData.nombre || originalName,
          width: autoShapeSize ? autoShapeSize.width : sourceData.width,
          height: autoShapeSize ? autoShapeSize.height : sourceData.height,
          nodeData: nextNodeData,
        },
      };
    });

    setNodes(nextNodes);
    nodesRef.current = nextNodes;
    persistDistrictState(nextNodes, edgesRef.current);
  }, [persistDistrictState]);

  const changeSelectedNodeColor = useCallback((color, targetId = selectedNodeId) => {
    const idToUpdate = targetId || selectedNodeId;
    if (!idToUpdate || !color) return;
    setNodes((nds) => {
      const updated = nds.map(n => {
        if (n.id !== idToUpdate) return n;
        const sourceData = (n.data && n.data.nodeData) || (n.data || {});
        const nextNodeData = {
          ...sourceData,
          customColor: color,
          color,
        };
        return {
          ...n,
          data: {
            ...n.data,
            customColor: color,
            color,
            nodeData: nextNodeData,
          },
        };
      });
      nodesRef.current = updated;
      persistDistrictState(updated, edgesRef.current);
      return updated;
    });
  }, [selectedNodeId, persistDistrictState]);

  const toggleLockSelectedNode = useCallback(() => {
    try {
      const id = selectedNodeIdRef.current || selectedNodeId;
      if (!id) return;
      const saved = readDiagramState();
      saved.nodes = saved.nodes || {};
      const prev = saved.nodes[id] && typeof saved.nodes[id] === 'object' ? saved.nodes[id] : {};
      const nextLocked = !Boolean(prev.lockedPosition);
      saved.nodes[id] = { ...(prev || {}), lockedPosition: nextLocked };
      try { if (autoSaveEnabledRef.current) localStorage.setItem('district_state', JSON.stringify(saved)); } catch (e) {}

      // reflect in-memory nodes
      const updated = (nodesRef.current || []).map((n) => {
        if (n.id !== id) return n;
        const prevData = (n.data && n.data.nodeData) || (n.data || {});
        const newNodeData = { ...(prevData || {}), lockedPosition: nextLocked };
        return { ...n, data: { ...(n.data || {}), nodeData: newNodeData } };
      });
      nodesRef.current = updated;
      try { setNodes([...updated]); } catch (e) {}
    } catch (e) { console.warn('[DISTRICT] toggleLockSelectedNode failed', e && e.message); }
  }, [selectedNodeId]);

  const isSelectedNodeLocked = useCallback(() => {
    try {
      const id = selectedNodeIdRef.current || selectedNodeId;
      if (!id) return false;
      const saved = readDiagramState();
      const prev = saved.nodes && typeof saved.nodes[id] === 'object' ? saved.nodes[id] : {};
      return Boolean(prev.lockedPosition);
    } catch (e) { return false; }
  }, [selectedNodeId]);

  const editUnlockAllNodes = useCallback(() => {
    try {
      // Obtener nodos actuales de ReactFlow (posiciones exactas en pantalla)
      const currentNodes = rfInstance && typeof rfInstance.getNodes === 'function'
        ? rfInstance.getNodes()
        : (nodesRef.current || []);

      const updated = currentNodes.map((n) => {
        const prevData = (n.data && n.data.nodeData) || (n.data || {});
        const newNodeData = { ...(prevData || {}), lockedPosition: false };
        return { ...n, data: { ...(n.data || {}), nodeData: newNodeData } };
      });
      nodesRef.current = updated;
      try { setNodes([...updated]); } catch (e) {}

      // Actualizar localStorage: desbloquear todos
      const saved = readDiagramState();
      saved.nodes = saved.nodes || {};
      for (const id of Object.keys(saved.nodes)) saved.nodes[id] = { ...(saved.nodes[id] || {}), lockedPosition: false };
      try { if (autoSaveEnabledRef.current) localStorage.setItem('district_state', JSON.stringify(saved)); } catch (e) {}
    } catch (e) { console.warn('[DISTRICT] editUnlockAllNodes failed', e && e.message); }
  }, [rfInstance]);

  const saveAndLockAllNodes = useCallback(() => {
    try {
      // Obtener nodos actuales de ReactFlow (posiciones exactas donde el usuario los dejó)
      const currentNodes = rfInstance && typeof rfInstance.getNodes === 'function'
        ? rfInstance.getNodes()
        : (nodesRef.current || []);

      const updated = currentNodes.map((n) => {
        const prevData = (n.data && n.data.nodeData) || (n.data || {});
        const newNodeData = { ...(prevData || {}), lockedPosition: true };
        return { ...n, data: { ...(n.data || {}), nodeData: newNodeData } };
      });
      nodesRef.current = updated;
      try { setNodes([...updated]); } catch (e) {}

      // Persistir con las posiciones actuales exactas
      try { persistDistrictState(updated, edgesRef.current); } catch (e) {}
    } catch (e) { console.warn('[DISTRICT] saveAndLockAllNodes failed', e && e.message); }
  }, [rfInstance, persistDistrictState]);

  const rotateSelectedNode = useCallback((targetId = selectedNodeId, direction = 'right') => {
    try { console.debug('[DistrictFlow] rotateSelectedNode called (immediate):', targetId, direction); } catch (e) {}
    if (!targetId) return;
    try {
      const current = Array.isArray(nodesRef.current) ? [...nodesRef.current] : [];
      const updated = current.map((n) => {
        if (n.id !== targetId) return n;
        const source = (n.data && n.data.nodeData) || (n.data || {});
        const prev = Number.isFinite(Number(source.rotation)) ? Number(source.rotation) : (Number.isFinite(Number(n.rotation)) ? Number(n.rotation) : 0);
        const delta = direction === 'left' ? -90 : 90;
        const next = (Number(prev) || 0) + delta;
        const newNodeData = { ...(source || {}), rotation: next };
        return { ...n, rotation: next, data: { ...(n.data || {}), nodeData: newNodeData } };
      });
      nodesRef.current = updated;
      try { setNodes([...updated]); } catch (e) {}
      persistDistrictState(updated, edgesRef.current);
      try { console.debug('[DistrictFlow] rotateSelectedNode applied for', targetId, 'rotation=', (updated.find(x => x.id === targetId) || {}).rotation); } catch (e) {}
    } catch (e) { console.error(e); }
  }, [selectedNodeId, persistDistrictState]);

  const setSelectedNodeRotation = useCallback((targetId = selectedNodeId, angle = 0) => {
    if (!targetId) return;
    setNodes((nds) => {
      const updated = nds.map((n) => {
        if (n.id !== targetId) return n;
        const source = (n.data && n.data.nodeData) || (n.data || {});
        const next = Number(angle) || 0;
        const newNodeData = { ...(source || {}), rotation: next };
        return { ...n, rotation: next, data: { ...(n.data || {}), nodeData: newNodeData } };
      });
      nodesRef.current = updated;
      persistDistrictState(updated, edgesRef.current);
      return updated;
    });
  }, [selectedNodeId, persistDistrictState]);

  const persistConnection = useCallback((nextEdges) => {
    try {
      // Persist via the central persistDistrictState so it's guarded by autosave preference
      persistDistrictState(nodesRef.current, nextEdges || []);
    } catch (e) {}
  }, [getPersistedNodeEntry, readDiagramState, writeDiagramState]);

  const resizeSelectedNode = useCallback((targetId = selectedNodeId, dw = 0, dh = 0) => {
    try { console.debug('[DistrictFlow] resizeSelectedNode called (immediate):', targetId, dw, dh); } catch (e) {}
    if (!targetId) return;
    try {
      const current = Array.isArray(nodesRef.current) ? [...nodesRef.current] : [];
      const updated = current.map((n) => {
        if (n.id !== targetId) return n;
        const source = (n.data && n.data.nodeData) || (n.data || {});
        const nextWidth = Math.max(20, (Number.isFinite(Number(source.width)) ? Number(source.width) : (Number.isFinite(Number(n.width)) ? Number(n.width) : 120)) + Number(dw || 0));
        const nextHeight = Math.max(20, (Number.isFinite(Number(source.height)) ? Number(source.height) : (Number.isFinite(Number(n.height)) ? Number(n.height) : 68)) + Number(dh || 0));
        const newNodeData = { ...(source || {}), width: nextWidth, height: nextHeight };
        return { ...n, width: nextWidth, height: nextHeight, data: { ...(n.data || {}), nodeData: newNodeData } };
      });
      nodesRef.current = updated;
      try { setNodes([...updated]); } catch (e) {}
      persistDistrictState(updated, edgesRef.current);
      try { console.debug('[DistrictFlow] resizeSelectedNode applied for', targetId, 'w,h=', (updated.find(x => x.id === targetId) || {}).width, (updated.find(x => x.id === targetId) || {}).height); } catch (e) {}
    } catch (e) { console.error(e); }
  }, [selectedNodeId, persistDistrictState]);

  const updateSelectedConnectionStyle = useCallback((edgeId = selectedEdgeId, nextStyle = {}) => {
    if (!edgeId) return;
    const updated = (edgesRef.current || []).map((e) => e.id === edgeId ? ({ ...e, style: { ...(e.style || {}), ...(nextStyle || {}) } }) : e);
    setEdges(updated);
    edgesRef.current = updated;
    try { persistDistrictState(nodesRef.current, updated); } catch (e) {}
  }, [selectedEdgeId, readDiagramState, writeDiagramState]);

  const updateSelectedEdgeLabel = useCallback((edgeId = selectedEdgeId, newLabel = '') => {
    if (!edgeId) return;
    const updated = (edgesRef.current || []).map((e) => e.id === edgeId ? ({ ...e, label: newLabel }) : e);
    setEdges(updated);
    edgesRef.current = updated;
    try { persistDistrictState(nodesRef.current, updated); } catch (e) {}
  }, [selectedEdgeId, readDiagramState, writeDiagramState]);

  const upsertOrToggleConnection = useCallback((sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;

    const nextEdges = [...(edgesRef.current || [])];
    const duplicateIndex = nextEdges.findIndex((edge) => edge.source === sourceId && edge.target === targetId);
    if (duplicateIndex >= 0) return;

    const nextEdge = {
      id: `${sourceId}-${targetId}`,
      source: sourceId,
      target: targetId,
      // include specific handle attachments if previously chosen
      ...(connectPendingHandleRef.current && connectPendingHandleRef.current.source === sourceId && connectPendingHandleRef.current.sourceHandle ? { sourceHandle: connectPendingHandleRef.current.sourceHandle } : {}),
      ...(connectPendingHandleRef.current && connectPendingHandleRef.current.target === targetId && connectPendingHandleRef.current.targetHandle ? { targetHandle: connectPendingHandleRef.current.targetHandle } : {}),
      markerEnd: { type: MarkerType.ArrowClosed, color: '#000' },
      type: defaultEdgeType || 'step',
      animated: false,
      style: { stroke: '#000', strokeWidth: 5, strokeLinecap: 'round' },
    };

    if (connectDate) {
      nextEdge.data = { ...(nextEdge.data || {}), date: connectDate };
      nextEdge.label = formatDateLabel(connectDate, connectDateFormat || 'dd/MM/yyyy');
    }

    const created = addEdge(nextEdge, nextEdges);
    setEdges(created);
    edgesRef.current = created;
    persistConnection(created);
  }, [connectDate, connectDateFormat, persistConnection, defaultEdgeType]);

  const beginConnectSelection = useCallback((nodeId, pos) => {
    if (!nodeId) return;
    if (!editMode || mode !== 'connect') return;

    if (!connectPendingId) {
      setConnectPendingId(nodeId);
      setSelectedNodeId(nodeId);
      // choose a source handle based on click position
      try {
        const node = (nodesRef.current || []).find(n => n.id === nodeId) || {};
        const w = Number.isFinite(Number(node.width)) ? Number(node.width) : (node.data && node.data.nodeData && node.data.nodeData.width) || 120;
        const h = Number.isFinite(Number(node.height)) ? Number(node.height) : (node.data && node.data.nodeData && node.data.nodeData.height) || 68;
        const x = pos && pos.offsetX != null ? pos.offsetX : w / 2;
        const y = pos && pos.offsetY != null ? pos.offsetY : h / 2;
        // choose nearest handle more precisely
        const handle = getNearestHandle({ offsetX: x, offsetY: y, width: w, height: h }, true);
        connectPendingHandleRef.current = { source: nodeId, sourceHandle: handle };
      } catch (e) { connectPendingHandleRef.current = null; }
      return;
    }

    if (connectPendingId === nodeId) {
      setConnectPendingId(null);
      setSelectedNodeId(nodeId);
      connectPendingHandleRef.current = null;
      return;
    }

    // choose target handle based on click position
    try {
      const node = (nodesRef.current || []).find(n => n.id === nodeId) || {};
      const w = Number.isFinite(Number(node.width)) ? Number(node.width) : (node.data && node.data.nodeData && node.data.nodeData.width) || 120;
      const h = Number.isFinite(Number(node.height)) ? Number(node.height) : (node.data && node.data.nodeData && node.data.nodeData.height) || 68;
      const x = pos && pos.offsetX != null ? pos.offsetX : w / 2;
      const y = pos && pos.offsetY != null ? pos.offsetY : h / 2;
      const handle = getNearestHandle({ offsetX: x, offsetY: y, width: w, height: h }, false);
      // attach target info in the pending ref
      connectPendingHandleRef.current = { ...(connectPendingHandleRef.current || {}), target: nodeId, targetHandle: handle };
    } catch (e) {}

    upsertOrToggleConnection(connectPendingId, nodeId);
    setConnectPendingId(null);
    setSelectedNodeId(nodeId);
    connectPendingHandleRef.current = null;
  }, [connectPendingId, editMode, mode, upsertOrToggleConnection]);

  const handleConnectSelection = useCallback((nodeId, pos) => {
    beginConnectSelection(nodeId, pos);
  }, [beginConnectSelection]);

  const deleteSelectedNode = useCallback((overriddenId = selectedNodeId) => {
    const targetId = overriddenId || selectedNodeId;
    if (!targetId) return false;

    // Guardar para Deshacer/Undo
    try {
      const before = (nodesRef.current || []).map(n => ({ id: n.id, position: n.position }));
      pastRef.current.push({ nodes: Object.fromEntries(before.map(b => [b.id, b.position])), edges: edgesRef.current });
      futureRef.current = [];
    } catch (e) {}

    const nextNodes = (nodesRef.current || []).filter((n) => n.id !== targetId);
    const nextEdges = (edgesRef.current || []).filter((edge) => edge.source !== targetId && edge.target !== targetId);

    const state = readDiagramState();
    const filteredSavedNodes = { ...(state.nodes || {}) };
    delete filteredSavedNodes[targetId];
    const filteredSavedHidden = (Array.isArray(state.hiddenNodeIds) ? state.hiddenNodeIds : []).filter((id) => id !== targetId);
    const deletedList = Array.isArray(state.deletedNodeIds) ? state.deletedNodeIds : [];
    const nextDeletedIds = [...new Set([...deletedList, targetId].filter((id) => id != null && String(id).trim() !== ''))];

    const nextState = {
      ...state,
      nodes: filteredSavedNodes,
      edges: nextEdges,
      hiddenNodeIds: filteredSavedHidden,
      deletedNodeIds: nextDeletedIds,
    };

    setNodes(nextNodes);
    setEdges(nextEdges);
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    setSelectedNodeId(null);
    if (onNodeSelect) onNodeSelect(null);

    try {
      persistDistrictState(nextNodes, nextEdges, { deletedNodeIds: nextDeletedIds, hiddenNodeIds: filteredSavedHidden });
    } catch (err) { console.warn('[DistrictFlow] persist on delete failed', err && err.message); }
    return true;
  }, [persistDistrictState, readDiagramState, selectedNodeId, writeDiagramState, onNodeSelect]);

  // Apply remote persisted state incrementally without reloading the page
  const applyRemoteState = useCallback((remote) => {
    try {
      if (!remote || typeof remote !== 'object') return;
      const remoteNodes = remote.nodes && typeof remote.nodes === 'object' ? remote.nodes : {};
      const remoteEdges = Array.isArray(remote.edges) ? remote.edges : [];

      const sanitizedRemote = Object.fromEntries(Object.entries(remoteNodes).map(([id, entry]) => [id, sanitizePersistedNodeVisual(entry)]));

      const current = Array.isArray(nodesRef.current) ? [...nodesRef.current] : [];
      const existingIds = new Set(current.map(n => n.id));

      const updated = current.map((n) => {
        const r = sanitizedRemote[n.id];
        if (!r) return n;
        // Preserve existing client-side position to avoid moving nodes unexpectedly.
        const hasLocalPos = n && n.position && n.position.x != null && n.position.y != null;
        const isLocked = !!(n && n.data && n.data.nodeData && n.data.nodeData.lockedPosition);
        const position = (hasLocalPos || isLocked) ? n.position : sanitizePosition({ x: r.x, y: r.y });
        const nodeData = ensureNodeData({ id: n.id, type: r.type, label: r.label, position, data: { ...(n.data && n.data.nodeData ? n.data.nodeData : {}), ...r } });
        return {
          ...n,
          position,
          customName: r.customName || n.customName || nodeData.customName || '',
          label: r.label || n.label || nodeData.label || n.id,
          data: { ...(n.data || {}), ...r, nodeData },
        };
      });

      // Add nodes that exist remotely but not locally
      for (const [id, r] of Object.entries(sanitizedRemote)) {
        if (existingIds.has(id)) continue;
        const position = sanitizePosition({ x: r.x, y: r.y });
        const nodeData = ensureNodeData({ id, type: r.type, label: r.label, position, data: r });
        updated.push({ id, type: r.type || 'tank', position, customName: r.customName || '', nameLocked: !!r.nameLocked, label: r.label || id, data: { ...r, customName: r.customName || '', label: r.label || id, nodeData } });
      }

      const normalizedEdges = (remoteEdges || []).filter(isValidSavedEdge).map((edge) => normalizeSavedEdge(edge, {
        animated: !!showFlow,
        type: 'step',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#000' },
        style: { stroke: '#000', strokeWidth: 5, strokeLinecap: 'round' },
      })).filter((edge) => edge && edge.source && edge.target);

      // Update in-memory and UI state
      nodesRef.current = updated;
      edgesRef.current = normalizedEdges;
      try { setNodes([...updated]); } catch (e) {}
      try { setEdges(normalizedEdges); } catch (e) {}

      // Persist to localStorage only if autosave is enabled (respect user's preference)
      try { if (autoSaveEnabledRef.current) localStorage.setItem('district_state', JSON.stringify(remote)); } catch (e) {}
    } catch (e) { /* ignore */ }
  }, [showFlow]);


  const duplicateSelectedNode = useCallback((sourceId = selectedNodeId) => {
    const targetId = sourceId || selectedNodeId;
    if (!targetId) return null;
    const sourceNode = (nodesRef.current || []).find((n) => n.id === targetId);
    if (!sourceNode) return null;

    const sourceData = sourceNode.data?.nodeData || sourceNode.data || {};
    const baseSourceName = getBaseNodeName({ data: sourceData, label: sourceNode.label, id: sourceNode.id }) || sourceNode.id || 'Elemento';
    const customName = getCustomNodeName({ data: sourceData, customName: sourceNode.customName }) || '';
    const baseName = customName || baseSourceName;
    const copySuffix = ' (copia)';
    const copyLabel = `${baseName}${copySuffix}`;
    const uniqueId = `${sourceNode.id}-copy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const copyPosition = {
      x: (sourceNode.position?.x ?? 0) + 55,
      y: (sourceNode.position?.y ?? 0) + 55,
    };

    // deep-clone source data to avoid accidental shared references
    let clonedSource = {};
    try { clonedSource = sourceNode.data && typeof sourceNode.data === 'object' ? JSON.parse(JSON.stringify(sourceNode.data)) : JSON.parse(JSON.stringify(sourceData)); } catch (e) { clonedSource = { ...(sourceData || {}) }; }
    // ensure ids/labels updated on the clone
    clonedSource = {
      ...(clonedSource || {}),
      id: uniqueId,
      type: sourceNode.type || 'tank',
      customName: copyLabel,
      label: copyLabel,
      display_name: copyLabel,
      nombre: copyLabel,
      apiName: clonedSource.apiName || clonedSource.originalName || clonedSource.tag || baseSourceName,
      originalName: clonedSource.originalName || clonedSource.apiName || clonedSource.tag || baseSourceName,
      customColor: clonedSource.customColor || clonedSource.color || '',
      color: clonedSource.color || clonedSource.customColor || '',
    };

    const copiedNodeData = ensureNodeData({
      id: uniqueId,
      type: sourceNode.type || 'tank',
      label: copyLabel,
      position: copyPosition,
      data: clonedSource,
    });
    // Ensure dynamic metric fields are explicitly copied so the duplicate shows the same values
    try {
      const srcMetrics = sourceNode.data && sourceNode.data.nodeData ? sourceNode.data.nodeData : sourceData;
      const metricFields = ['valor_m', 'nivel', 'porcentaje', 'capacidad_actual_m3', 'capacidad_maxima_m3', 'volumen_restante_m3', 'altura_rebose', 'altura_rebose_calibrada', 'tag', 'display_name', 'porcentaje_capacidad', 'porcentaje_api', 'altura_rebose_m'];
      for (const f of metricFields) {
        if (srcMetrics && srcMetrics[f] !== undefined && srcMetrics[f] !== null) {
          copiedNodeData[f] = srcMetrics[f];
          copiedNodeData.nodeData = copiedNodeData.nodeData || {};
          copiedNodeData.nodeData[f] = srcMetrics[f];
          clonedSource[f] = srcMetrics[f];
        }
      }
    } catch (e) {}

    const nextNode = {
      id: uniqueId,
      type: sourceNode.type || 'tank',
      position: copyPosition,
      label: copyLabel,
      customName: copyLabel,
      nameLocked: false,
      data: {
        ...clonedSource,
        ...((typeof extraMetrics === 'object' && extraMetrics) || {}),
        id: uniqueId,
        type: sourceNode.type || 'tank',
        customName: copyLabel,
        nameLocked: false,
        label: copyLabel,
        display_name: copyLabel,
        nombre: copyLabel,
        customColor: clonedSource.customColor || clonedSource.color || '',
        color: clonedSource.color || clonedSource.customColor || '',
        nodeData: copiedNodeData,
        onSelect: (nodeId) => { setSelectedNodeId(nodeId); if (onNodeSelect) onNodeSelect(nodeId); },
        onMove: (nodeId, dx, dy) => moveNode(nodeId, dx, dy),
        onConnectNode: (nodeId, pos) => handleConnectSelection(nodeId, pos),
        onDuplicate: (nodeId) => duplicateSelectedNode(nodeId),
        onRename: applyNodeRename,
        onDeleteSelected: (nodeId) => deleteSelectedNode(nodeId),
        editMode,
        mode,
        deleteMode,
        selected: true,
        pendingConnect: false,
      },
    };

    // mark this node to open editor immediately (transient, not persisted)
    try { openEditorRef.current.add(uniqueId); } catch (e) {}

    const nextNodes = [...(nodesRef.current || []), nextNode];
    setNodes(nextNodes);
    nodesRef.current = nextNodes;
    setSelectedNodeId(uniqueId);
    if (onNodeSelect) onNodeSelect(uniqueId);
    // expose the duplicated node for easy inspection in browser console/tests
    try {
      if (typeof window !== 'undefined') {
        window.__LAST_DUPLICATE = nextNode;
        console.debug('[DistrictFlow] duplicateSelectedNode -> nextNode.data', nextNode.data);
      }
    } catch (e) { /* ignore */ }
    // ensure we copy the metric fields deeply into both data and data.nodeData so TankNode reads them
    try {
      const srcMetrics = (sourceNode.data && sourceNode.data.nodeData) ? sourceNode.data.nodeData : (sourceNode.data || {});
      const deepCopy = JSON.parse(JSON.stringify(srcMetrics || {}));
      // put the deep copy in both places the UI may read from
      nextNode.data.nodeData = { ...(nextNode.data.nodeData || {}), ...deepCopy };
      for (const key of ['valor_m', 'nivel', 'porcentaje', 'capacidad_actual_m3', 'capacidad_maxima_m3', 'volumen_restante_m3', 'altura_rebose', 'altura_rebose_calibrada', 'tag', 'display_name', 'porcentaje_capacidad', 'porcentaje_api', 'altura_rebose_m']) {
        if (deepCopy[key] !== undefined) {
          nextNode.data[key] = deepCopy[key];
        }
      }
    } catch (e) { /* ignore deep-copy errors */ }

    // EXTRA SAFEGUARD: ensure TankNode reads the expected top-level fields
    try {
      const srcMetrics = (sourceNode.data && sourceNode.data.nodeData) ? sourceNode.data.nodeData : (sourceNode.data || {});
      const keysToEnsure = ['valor_m', 'nivel', 'porcentaje'];
      for (const k of keysToEnsure) {
        const val = srcMetrics && (srcMetrics[k] !== undefined) ? srcMetrics[k] : (sourceNode.data && sourceNode.data[k] !== undefined ? sourceNode.data[k] : undefined);
        if (val !== undefined && val !== null) {
          nextNode.data = nextNode.data || {};
          nextNode.data[k] = val;
          nextNode.data.nodeData = nextNode.data.nodeData || {};
          nextNode.data.nodeData[k] = val;
        }
      }
      try { console.debug('[DistrictFlow] duplicateSelectedNode ensured metrics on new node:', uniqueId, { valor_m: nextNode.data.valor_m, porcentaje: nextNode.data.porcentaje, nivel: nextNode.data.nivel }); } catch (err) {}
    } catch (e) { /* ignore */ }

    try {
      if (typeof window !== 'undefined') {
        try { console.debug('[DistrictFlow] persisting district_state (duplicate) - node id:', uniqueId); } catch (e) {}
      }
    } catch (e) {}

    persistDistrictState(nextNodes, edgesRef.current);
    return uniqueId;
  }, [selectedNodeId, onNodeSelect, editMode, mode, deleteMode, moveNode, handleConnectSelection, applyNodeRename, deleteSelectedNode, persistDistrictState]);

  const addDiagramNode = useCallback(() => {
    const id = `nodo-visual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const baseName = 'Nuevo Tanque';
    const position = {
      x: 220 + ((nodesRef.current || []).length % 6) * 120,
      y: 120 + ((nodesRef.current || []).length % 4) * 100,
    };
    const nodeData = ensureNodeData({
      id,
      type: 'tank',
      label: baseName,
      position,
      data: {
        id,
        type: 'tank',
        customName: baseName,
        label: baseName,
        display_name: baseName,
        nombre: baseName,
        originalName: baseName,
        apiName: baseName,
      },
    });
    const nextNode = {
      id,
      type: 'tank',
      position,
      customName: baseName,
      nameLocked: false,
      label: baseName,
      data: {
        id,
        type: 'tank',
        label: baseName,
        customName: baseName,
        nameLocked: false,
        display_name: baseName,
        nombre: baseName,
        originalName: baseName,
        apiName: baseName,
        nodeData,
        onSelect: (nodeId) => { setSelectedNodeId(nodeId); if (onNodeSelect) onNodeSelect(nodeId); },
        onMove: (nodeId, dx, dy) => moveNode(nodeId, dx, dy),
        onConnectNode: (nodeId, pos) => handleConnectSelection(nodeId, pos),
        onDuplicate: (nodeId) => duplicateSelectedNode(nodeId),
        onRename: applyNodeRename,
        onDeleteSelected: (nodeId) => deleteSelectedNode(nodeId),
        editMode,
        mode,
        deleteMode,
        selected: true,
        pendingConnect: false,
      },
    };

    const nextNodes = [...(nodesRef.current || []), nextNode];
    setNodes(nextNodes);
    nodesRef.current = nextNodes;
    setSelectedNodeId(id);
    if (onNodeSelect) onNodeSelect(id);
    persistDistrictState(nextNodes, edgesRef.current);
  }, [editMode, mode, deleteMode, onNodeSelect, moveNode, handleConnectSelection, duplicateSelectedNode, applyNodeRename, deleteSelectedNode, persistDistrictState]);


  const addShapeNode = useCallback((shapeType = 'rect') => {
    const id = `forma-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const baseName = 'Texto / Forma';
    const fallbackPosition = {
      x: 250 + ((nodesRef.current || []).length % 5) * 140,
      y: 150 + ((nodesRef.current || []).length % 4) * 100,
    };
    const safePosition = {
      x: Number.isFinite(Number(fallbackPosition.x)) ? Number(fallbackPosition.x) : 250,
      y: Number.isFinite(Number(fallbackPosition.y)) ? Number(fallbackPosition.y) : 150,
    };
    const autoSize = getAutoShapeSize(baseName, null, null);
    const width = Number.isFinite(Number(autoSize.width)) ? Number(autoSize.width) : 120;
    const height = Number.isFinite(Number(autoSize.height)) ? Number(autoSize.height) : 68;
    const nodeData = ensureNodeData({
      id,
      type: 'shape',
      label: baseName,
      position: safePosition,
      width,
      height,
      data: {
        id, type: 'shape', customName: baseName, label: baseName,
        display_name: baseName, nombre: baseName, originalName: baseName, apiName: baseName,
        customColor: '#3b82f6', color: '#3b82f6', width, height, shapeType,
      },
    });
    const nextNode = {
      id, type: 'shape', position: safePosition, customName: baseName, nameLocked: false, label: baseName,
      data: {
        id, type: 'shape', label: baseName, customName: baseName, nameLocked: false,
        display_name: baseName, nombre: baseName, originalName: baseName, apiName: baseName,
        customColor: '#3b82f6', color: '#3b82f6', width, height, shapeType,
        nodeData, selected: true, pendingConnect: false,
        editMode, mode, deleteMode,
        onSelect: (nodeId) => { setSelectedNodeId(nodeId); if (onNodeSelect) onNodeSelect(nodeId); },
        onMove: (nodeId, dx, dy) => moveNode(nodeId, dx, dy),
        onConnectNode: (nodeId, pos) => handleConnectSelection(nodeId, pos),
        onDuplicate: (nodeId) => duplicateSelectedNode(nodeId),
        onRename: applyNodeRename,
        onDeleteSelected: (nodeId) => deleteSelectedNode(nodeId),
      },
    };

    const nextNodes = [...(nodesRef.current || []), nextNode];
    setNodes(nextNodes);
    nodesRef.current = nextNodes;
    setSelectedNodeId(id);
    if (onNodeSelect) onNodeSelect(id);
    persistDistrictState(nextNodes, edgesRef.current);
  }, [editMode, mode, deleteMode, onNodeSelect, moveNode, handleConnectSelection, duplicateSelectedNode, applyNodeRename, deleteSelectedNode, persistDistrictState]);


  const onConnect = useCallback((params) => {
    try {
      const before = nodesRef.current.map(n => ({ id: n.id, position: n.position }));
      pastRef.current.push({ nodes: Object.fromEntries(before.map(b => [b.id, b.position])), edges: edgesRef.current });
      futureRef.current = [];
      if (!params || !params.source || !params.target || params.source === params.target) return;
      upsertOrToggleConnection(params.source, params.target);
    } catch (e) {}
  }, [upsertOrToggleConnection]);

  const deleteSelectedConnection = useCallback((edgeId = selectedEdgeId) => {
    const targetId = edgeId || selectedEdgeId;
    if (!targetId) return false;

    try {
      const before = (nodesRef.current || []).map(n => ({ id: n.id, position: n.position }));
      pastRef.current.push({ nodes: Object.fromEntries(before.map(b => [b.id, b.position])), edges: edgesRef.current });
      futureRef.current = [];
    } catch (e) {}

    const next = (edgesRef.current || []).filter((edge) => edge.id !== targetId);
    setEdges(next);
    edgesRef.current = next;
    setSelectedEdgeId(null);
    persistConnection(next);
    return true;
  }, [persistConnection, selectedEdgeId]);

  const onEdgesDelete = useCallback((deleted) => {
    if (!deleted || !deleted.length) return;
    try {
      const before = (nodesRef.current || []).map(n => ({ id: n.id, position: n.position }));
      pastRef.current.push({ nodes: Object.fromEntries(before.map(b => [b.id, b.position])), edges: edgesRef.current });
      futureRef.current = [];
      const ids = new Set(deleted.map(d => d.id));
      const next = (edgesRef.current || []).filter(e => !ids.has(e.id));
      setEdges(next);
      edgesRef.current = next;
      persistConnection(next);
      setSelectedEdgeId(null);
    } catch (e) {}
  }, [persistConnection]);

  const doUndo = useCallback(() => {
    const past = pastRef.current;
    if (!past.length) return;
    const last = past.pop();
    const cur = { nodes: Object.fromEntries((nodesRef.current || []).map(n => [n.id, n.position])), edges: edgesRef.current };
    futureRef.current.push(cur);
    const restoredNodes = (nodesRef.current || []).map(n => ({ ...n, position: last.nodes[n.id] || n.position }));
    setNodes(restoredNodes);
    setEdges(last.edges || []);
  }, []);

  const doRedo = useCallback(() => {
    const future = futureRef.current;
    if (!future.length) return;
    const next = future.pop();
    const cur = { nodes: Object.fromEntries((nodesRef.current || []).map(n => [n.id, n.position])), edges: edgesRef.current };
    pastRef.current.push(cur);
    const restoredNodes = (nodesRef.current || []).map(n => ({ ...n, position: next.nodes[n.id] || n.position }));
    setNodes(restoredNodes);
    setEdges(next.edges || []);
  }, []);

  const doAutoLayout = useCallback(() => {
    const currentNodes = nodesRef.current || [];
    const currentEdges = edgesRef.current || [];

    const adj = new Map();
    for (const n of currentNodes) adj.set(n.id, new Set());
    for (const ed of currentEdges) {
      if (!adj.has(ed.source)) adj.set(ed.source, new Set());
      if (!adj.has(ed.target)) adj.set(ed.target, new Set());
      adj.get(ed.source).add(ed.target);
      adj.get(ed.target).add(ed.source);
    }

    const plants = currentNodes.filter(n => n.type === 'plant');
    const tanks = currentNodes.filter(n => n.type === 'tank');

    const tankToPlant = new Map();
    for (const t of tanks) {
      const q = [t.id];
      const seen = new Set([t.id]);
      let assigned = null;
      while (q.length && !assigned) {
        const cur = q.shift();
        if (plants.find(p => p.id === cur)) { assigned = cur; break; }
        for (const nb of (adj.get(cur) || [])) {
          if (seen.has(nb)) continue; seen.add(nb); q.push(nb);
        }
      }
      if (assigned && plants.find(p => p.id === assigned)) tankToPlant.set(t.id, assigned);
      else if (plants.length) tankToPlant.set(t.id, plants[0].id);
      else tankToPlant.set(t.id, null);
    }

    const groups = new Map();
    for (const p of plants) groups.set(p.id, { plant: p, inputs: [], outputs: [], intermediates: [] });
    for (const t of tanks) {
      const pid = tankToPlant.get(t.id);
      const g = groups.get(pid) || { plant: null, inputs: [], outputs: [], intermediates: [] };
      const hasToPlant = currentEdges.find(ed => ed.source === t.id && ed.target === pid);
      const hasFromPlant = currentEdges.find(ed => ed.source === pid && ed.target === t.id);
      if (hasToPlant) g.inputs.push(t);
      else if (hasFromPlant) g.outputs.push(t);
      else g.intermediates.push(t);
      groups.set(pid, g);
    }

    const unconnected = tanks.filter(t => !(currentEdges.find(ed => ed.source === t.id || ed.target === t.id)));

    const colGap = 520;
    const leftOffset = 220;
    const rightOffset = 220;
    const rowGap = 120;
    const baseY = 80;

    const newPositions = {};
    let plantIndex = 0;
    for (const [pid, g] of groups.entries()) {
      const colX = 120 + plantIndex * colGap;
      let cursorY = baseY;

      let iy = cursorY;
      for (const tn of g.inputs) {
        newPositions[tn.id] = { x: colX - leftOffset, y: iy };
        iy += rowGap;
      }

      const plantY = cursorY + (Math.max(1, g.inputs.length) * rowGap) / 2 - (nodeHeight / 2);
      newPositions[pid] = { x: colX, y: plantY };

      let my = cursorY;
      for (const tn of g.intermediates) {
        newPositions[tn.id] = { x: colX + (rightOffset / 2), y: my };
        my += rowGap;
      }

      let oy = cursorY;
      for (const tn of g.outputs) {
        newPositions[tn.id] = { x: colX + rightOffset, y: oy };
        oy += rowGap;
      }

      try {
        const groupNodeIds = [pid, ...g.inputs.map(x => x.id), ...g.intermediates.map(x => x.id), ...g.outputs.map(x => x.id)];
        const groupNodes = (currentNodes || []).filter(n => groupNodeIds.includes(n.id)).map(n => ({ id: n.id, data: n.data, type: n.type }));
        const groupEdges = (currentEdges || []).filter(ed => groupNodeIds.includes(ed.source) && groupNodeIds.includes(ed.target)).map(ed => ({ id: ed.id, source: ed.source, target: ed.target }));
        if (groupNodes.length > 1) {
          const layouted = getLayoutedElements(groupNodes, groupEdges, 'TB');
          const avgX = layouted.nodes.reduce((s, n) => s + n.position.x, 0) / layouted.nodes.length;
          const minY = Math.min(...layouted.nodes.map(n => n.position.y));
          for (const ln of layouted.nodes) {
            const relX = ln.position.x - avgX;
            const relY = ln.position.y - minY;
            newPositions[ln.id] = { x: Math.round(colX + relX), y: Math.round(baseY + relY) };
          }
        }
      } catch (e) { /* non-fatal */ }
      plantIndex += 1;
    }

    if (unconnected.length) {
      const baseXUn = 120 + plantIndex * colGap + 200;
      let uy = baseY;
      for (const t of unconnected) {
        newPositions[t.id] = { x: baseXUn, y: uy };
        uy += rowGap;
      }
    }

    let fallbackX = 80 + plantIndex * colGap;
    let fallbackY = baseY;
    for (const n of currentNodes) {
      if (!newPositions[n.id]) {
        newPositions[n.id] = { x: fallbackX, y: fallbackY };
        fallbackY += rowGap;
        if (fallbackY > baseY + 4 * rowGap) { fallbackY = baseY; fallbackX += colGap / 2; }
      }
    }

    // Respect any user-locked positions saved previously
    const savedState = readDiagramState();
    const prevMap = savedState.nodes && typeof savedState.nodes === 'object' ? savedState.nodes : {};
    const updatedNodes = (currentNodes || []).map((n) => {
      const locked = prevMap[n.id] && prevMap[n.id].lockedPosition;
      const pos = locked ? (n.position || { x: 100, y: 100 }) : (newPositions[n.id] || n.position || { x: 100, y: 100 });
      return { ...n, position: pos };
    });
    setNodes(updatedNodes);

    try {
      const saved = savedState || {};
      saved.nodes = Object.fromEntries(updatedNodes.map((nn) => [nn.id, getPersistedNodeEntry(nn, prevMap[nn.id] || {})]));
      saved.edges = currentEdges;
      try { if (autoSaveEnabledRef.current) localStorage.setItem('district_state', JSON.stringify(saved)); } catch (e) {}
    } catch (e) {}

    try { pastRef.current.push({ nodes: Object.fromEntries((currentNodes || []).map(n => [n.id, n.position])), edges: currentEdges }); futureRef.current = []; } catch (e) {}
  }, [getPersistedNodeEntry]);

  const doSave = useCallback(async () => {
    try {
      // Use local cached state as baseline for saving; avoid fetching remote state
      const savedState = readDiagramState();
      // Capture exact runtime positions from React Flow when available
      const runtimeNodes = (rfInstance && typeof rfInstance.getNodes === 'function') ? rfInstance.getNodes() : (nodesRef.current || []);
      const runtimeEdges = (rfInstance && typeof rfInstance.getEdges === 'function') ? rfInstance.getEdges() : (edgesRef.current || []);
      const saved = {
        ...savedState,
        nodes: Object.fromEntries((runtimeNodes || []).map(n => {
          const prev = savedState.nodes && savedState.nodes[n.id] && typeof savedState.nodes[n.id] === 'object' ? savedState.nodes[n.id] : {};
          return [n.id, getPersistedNodeEntry(n, prev)];
        })),
        edges: Array.isArray(runtimeEdges) ? runtimeEdges : (edgesRef.current || []),
      };
      // Validate before attempting to write to server
      try {
        const localBaseline = savedState || {};
        if (!_validateBeforeSave(saved, localBaseline)) {
          console.warn('[DIAGRAM] doSave aborted: payload failed validation');
          try { if (typeof onDirtyChanged === 'function') onDirtyChanged(true); } catch (e) {}
          setSaveMsg('error');
          setTimeout(() => setSaveMsg(null), 3000);
          return;
        }
      } catch (e) { /* proceed conservatively */ }
      writeDiagramState(saved);
      try { if (typeof onDirtyChanged === 'function') onDirtyChanged(false); } catch (e) {}
      // Toast no bloqueante — no usa alert() que congela JS
      setSaveMsg('ok');
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (e) {
      setSaveMsg('error');
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }, [getPersistedNodeEntry, readDiagramState, writeDiagramState, rfInstance]);

  const doRestoreInitial = useCallback(() => {
    try {
      localStorage.removeItem('district_state');
      window.location.reload();
    } catch (e) { alert('Error al restaurar.'); }
  }, []);

  const doViewAll = useCallback(() => { if (rfInstance && rfInstance.fitView) rfInstance.fitView({ padding: 0.12 }); }, [rfInstance]);

  const toggleShowFlow = useCallback(() => {
    setShowFlow(s => {
      const next = !s;
      setEdges(eds => eds.map(e => ({ ...e, animated: next })));
      return next;
    });
  }, []);

  const onNodesChange = useCallback((changes) => {
    setNodes((nds) => {
      const next = applyNodeChanges(changes, nds);
      // Siempre mantener nodesRef sincronizado con las posiciones reales de ReactFlow
      nodesRef.current = next;
      // Solo persistir en localStorage en cambios que NO sean de posición durante drag
      // (la posición final se persiste en onNodeDragStop)
      const hasPositionChange = changes.some(c => c.type === 'position' && c.dragging);
      if (!hasPositionChange) {
        persistDistrictState(next, edgesRef.current);
      }
      return next;
    });
  }, [persistDistrictState]);

  const onEdgesChange = useCallback((changes) => {
    setEdges((eds) => {
      const next = applyEdgeChanges(changes, eds);
      edgesRef.current = next;
      persistDistrictState(nodesRef.current, next);
      return next;
    });
  }, [persistDistrictState]);

  const onNodeDragStop = useCallback((event, node) => {
    try {
      const before = nodesRef.current.map(n => ({ id: n.id, position: n.position }));
      pastRef.current.push({ nodes: Object.fromEntries(before.map(b => [b.id, b.position])), edges: edgesRef.current });
      futureRef.current = [];

      // Actualizar nodesRef con la posición FINAL del nodo arrastrado
      // ReactFlow ya actualizó su estado interno; reflejamos eso en nodesRef
      const newNodes = (nodesRef.current || []).map(n =>
        n.id === node.id ? { ...n, position: { x: node.position.x, y: node.position.y } } : n
      );
      nodesRef.current = newNodes;
      setNodes([...newNodes]);

      // Guardar posición inmediatamente en localStorage
      persistDistrictState(newNodes, edgesRef.current);

      // restore overlay visibility after drag
      try { setOverlayVisible(true); } catch (e) {}
    } catch (e) {}
  }, [persistDistrictState]);

  const onNodeDragStart = useCallback(() => {
    try { setOverlayVisible(false); } catch (e) {}
  }, []);

  const didInitDiagramRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const freshApiNodes = Array.isArray(initialNodes) ? initialNodes : [];

    const loadInitialDiagramState = async () => {
      const saved = await readAuthoritativeDiagramState();
      if (cancelled) return;
      const hasSavedState = saved && typeof saved === 'object' && (
        (Object.keys(saved.nodes || {}).length > 0) ||
        (Array.isArray(saved.edges) && saved.edges.length > 0)
      );

      if (!didInitDiagramRef.current) {
        didInitDiagramRef.current = true;

        if (hasSavedState && freshApiNodes.length > 0) {
        const savedNodesById = new Map(Object.entries(saved.nodes || {}).map(([id, entry]) => [id, sanitizePersistedNodeVisual(entry)]));
        const deletedIds = Array.isArray(saved.deletedNodeIds) ? saved.deletedNodeIds : [];

        const mergedNodes = freshApiNodes
          .filter(fn => !(deletedIds.includes(fn.id))) // do not recreate nodes the user deleted
          .map((freshNode) => {
            const persistedVisual = savedNodesById.get(freshNode.id) || {};
            const rawPosition = persistedVisual && (Number.isFinite(Number(persistedVisual.x)) || Number.isFinite(Number(persistedVisual.y)))
              ? { x: Number(persistedVisual.x), y: Number(persistedVisual.y) }
              : freshNode.position || { x: 0, y: 0 };
            const rawNode = { ...(freshNode.data || freshNode), ...persistedVisual, position: rawPosition };
            const hydrated = ensureNodeData({ id: freshNode.id, type: freshNode.type, label: freshNode.label, position: rawPosition, data: rawNode });
            const customName = String(persistedVisual.customName || '').trim();
            const nameLocked = !!persistedVisual.nameLocked;
            const label = customName || hydrated.label || freshNode.label || freshNode.id;
            const finalNodeData = { ...hydrated, customName, nameLocked, label, position: sanitizePosition(rawPosition) };
            return {
              id: freshNode.id,
              type: freshNode.type || 'tank',
              position: sanitizePosition(rawPosition),
              customName,
              nameLocked,
              label,
              data: { ...rawNode, customName, nameLocked, label, nodeData: finalNodeData },
            };
          });

        const mergedNodesMap = new Map((mergedNodes || []).map(n => [n.id, n]));

        // Add any saved nodes that are not present in the API's list
        for (const [savedId, entry] of Object.entries(saved.nodes || {})) {
          if (!savedId) continue;
          if (deletedIds.includes(savedId)) continue;
          if (mergedNodesMap.has(savedId)) continue;
          try {
            const persistedVisual = sanitizePersistedNodeVisual(entry);
            const rawPosition = { x: Number(persistedVisual.x || 0), y: Number(persistedVisual.y || 0) };
            const rawNode = { ...persistedVisual, position: rawPosition };
            const hydrated = ensureNodeData({ id: savedId, type: persistedVisual.type || 'tank', label: persistedVisual.label || savedId, position: rawPosition, data: rawNode });
            const customName = String(persistedVisual.customName || '').trim();
            const nameLocked = !!persistedVisual.nameLocked;
            const label = customName || hydrated.label || persistedVisual.label || savedId;
            const finalNodeData = { ...hydrated, customName, nameLocked, label, position: sanitizePosition(rawPosition) };
            const userNode = {
              id: savedId,
              type: persistedVisual.type || 'tank',
              position: sanitizePosition(rawPosition),
              customName,
              nameLocked,
              label,
              data: { ...persistedVisual, customName, nameLocked, label, nodeData: finalNodeData },
            };
            mergedNodes.push(userNode);
            mergedNodesMap.set(savedId, userNode);
          } catch (err) {
            // ignore malformed saved entries
          }
        }

        const savedEdges = (Array.isArray(saved.edges) ? saved.edges : [])
          .filter(isValidSavedEdge)
          .map((edge) => normalizeSavedEdge(edge, {
            animated: !!showFlow,
            type: 'step',
            markerEnd: { type: MarkerType.ArrowClosed, color: '#000' },
            style: { stroke: '#000', strokeWidth: 5, strokeLinecap: 'round' },
          }))
          .filter((edge) => edge.source && edge.target && !deletedIds.includes(edge.source) && !deletedIds.includes(edge.target));

        nodesRef.current = mergedNodes;
        edgesRef.current = savedEdges;
        setNodes(mergedNodes);
        setEdges(savedEdges);
        return;
      }

        if (hasSavedState && freshApiNodes.length === 0) {
          const savedNodes = Object.entries(saved.nodes || {}).map(([id, entry]) => {
            if (!entry || typeof entry !== 'object') return null;
            const type = entry.type || 'tank';
            const label = String(entry.customName || entry.label || id).trim() || id;
            const position = { x: Number.isFinite(Number(entry.x)) ? Number(entry.x) : 0, y: Number.isFinite(Number(entry.y)) ? Number(entry.y) : 0 };
            const nodeData = ensureNodeData({ id, type, label, position, data: { ...entry, id, customName: entry.customName || '', label } });
            return {
              id,
              type,
              position,
              customName: entry.customName || '',
              label,
              data: { ...entry, customName: entry.customName || '', label, nodeData },
            };
          }).filter(Boolean);

          const savedEdges = (Array.isArray(saved.edges) ? saved.edges : [])
            .filter(isValidSavedEdge)
            .map((edge) => normalizeSavedEdge(edge, {
              animated: !!showFlow,
              type: 'step',
              markerEnd: { type: MarkerType.ArrowClosed, color: '#000' },
              style: { stroke: '#000', strokeWidth: 5, strokeLinecap: 'round' },
            }))
            .filter((edge) => edge.source && edge.target);

          nodesRef.current = savedNodes;
          edgesRef.current = savedEdges;
          setNodes(savedNodes);
          setEdges(savedEdges);
          return;
        }

        try { console.debug('[DISTRICT DEBUG] initialNodes received:', freshApiNodes.length); } catch (e) {}
        const sourceNodes = freshApiNodes.length ? freshApiNodes : STATIC_NODES.map(s => {
          if (s.type === 'plant' || s.type === 'district') return { id: s.id, type: s.type, label: s.label, position: s.position, data: { display_name: s.label } };
          return { id: s.id, type: 'tank', label: s.label, position: s.position, data: { display_name: s.label, __placeholder: true } };
        });
        const n = sourceNodes.map(x => {
          const resolvedData = ensureNodeData({ id: x.id, type: x.type, label: x.label, position: x.position, data: x.data || x });
          return {
            id: x.id,
            data: { nodeData: resolvedData, onSelect: onNodeSelect },
            type: x.type === 'tank' ? 'tank' : (x.type === 'plant' ? 'plant' : (x.type === 'district' ? 'district' : (x.type === 'shape' ? 'shape' : 'tank'))),
            position: x.position,
          };
        });
        const e = (initialEdges || []).map(x => {
          const source = x.source || x.from || x.fromId || null;
          const target = x.target || x.to || x.toId || null;
          return { id: x.id || `${source || 'unknown'}-${target || 'unknown'}`, source, target, label: x.label || x.name || '', style: { stroke: '#000', strokeWidth: 3, strokeLinecap: 'round' } };
        }).filter(ed => ed.source && ed.target);

        const rfNodes = n.map(nd => ({ id: nd.id, type: nd.type, position: nd.position || null, data: nd.data }));
        const rfEdges = e.map(ed => ({ id: ed.id, source: ed.source, target: ed.target, markerEnd: { type: MarkerType.ArrowClosed, color: '#000' }, animated: false, type: 'step', label: ed.label, style: { stroke: '#000', strokeWidth: 3, strokeLinecap: 'round' } }));

        const withControls = rfNodes.map(rn => {
          const outer = rn.data || {};
          const candidate = ensureNodeData({ id: rn.id, type: rn.type, label: rn.label, position: rn.position, data: outer.nodeData || outer });
          const nodeDataWithId = ensureNodeData({ id: rn.id, type: rn.type, label: rn.label, position: rn.position, data: candidate });
          return { ...rn, data: { ...outer, nodeData: nodeDataWithId } };
        });
        nodesRef.current = withControls;
        edgesRef.current = rfEdges;
        setNodes(withControls);
        setEdges(rfEdges);
        return;
      }

      if (!freshApiNodes.length) return;
    };

    loadInitialDiagramState();
    return () => { cancelled = true; };
  }, [initialNodes, initialEdges, readAuthoritativeDiagramState, showFlow]);

  // Actualización periódica de métricas: solo actualizar datos de API, NUNCA las posiciones
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await tanqueService.getTanques();
        const list = (res && res.tanques) || [];
        if (!list || !list.length) return;

        const map = new Map();
        for (const t of list) {
          if (!t) continue;
          const key = String((t.tag || t.apiName || t.nombre || t.display_name || t.id || '')).toLowerCase();
          map.set(key, t);
        }

        const updated = (nodesRef.current || []).map((n) => {
          try {
            const nd = (n.data && n.data.nodeData) ? n.data.nodeData : (n.data || {});
            const candidates = [nd.apiName, nd.originalName, nd.tag, nd.display_name, nd.nombre, nd.label, n.id].map(x => String(x || '').toLowerCase());
            let found = null;
            for (const c of candidates) {
              if (!c) continue;
              if (map.has(c)) { found = map.get(c); break; }
            }
            if (!found) return n;

            const nameLocked = Boolean(nd.nameLocked || n.nameLocked || (nd && nd.nameLocked));
            const preservedCustom = nameLocked ? (nd.customName || n.customName || '') : (nd.customName || found.display_name || '');

            const enriched = enrichTankNodeMetrics(found || {});
            const mergedNodeData = { ...nd, ...enriched, customName: preservedCustom || nd.customName, display_name: preservedCustom || enriched.display_name || nd.display_name };

            return { ...n, data: { ...(n.data || {}), nodeData: mergedNodeData, ...mergedNodeData } };
          } catch (e) { return n; }
        });

        if (mounted) {
          nodesRef.current = updated;
          setNodes([...updated]);
        }
      } catch (e) {}
    })();
    return () => { mounted = false; };
  }, []);

  // monitor queue size and ws status periodically for UI
  useEffect(() => {
    const id = setInterval(() => {
      try { setWsQueueSize((sendQueueRef.current || []).length); } catch (e) { setWsQueueSize(0); }
      try { setWsConnected(Boolean(wsRef.current && wsRef.current.readyState === WebSocket.OPEN)); } catch (e) { setWsConnected(false); }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // debug flag: read from localStorage and support Ctrl+Shift+D toggle
  useEffect(() => {
    try { const v = (localStorage.getItem('district_debug_ws') || 'false') === 'true'; setDebugWsEnabled(v); } catch (e) { setDebugWsEnabled(false); }
    const handler = (ev) => {
      if (ev.ctrlKey && ev.shiftKey && ev.key.toLowerCase() === 'd') {
        try {
          const next = !debugWsEnabled;
          setDebugWsEnabled(next);
          try { localStorage.setItem('district_debug_ws', next ? 'true' : 'false'); } catch (e) {}
          console.log('[DISTRICT] toggled district_debug_ws ->', next);
        } catch (e) {}
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [debugWsEnabled]);

  // Actualización periódica de métricas: solo actualizar datos de API, NUNCA las posiciones
  useEffect(() => {
    const freshApiNodes = Array.isArray(initialNodes) ? initialNodes : [];
    if (!freshApiNodes.length) return undefined;

    setNodes((nds) => {
      const updated = nds.map((n) => {
        const freshApiNode = freshApiNodes.find((x) => x.id === n.id);
        if (!freshApiNode) return n;

        const freshData = ensureNodeData({ id: freshApiNode.id, type: freshApiNode.type, label: freshApiNode.label, position: n.position || freshApiNode.position, data: freshApiNode.data || freshApiNode });
        const currentNd = n.data?.nodeData || {};
        const currentCustomName = String((n.customName || currentNd.customName || currentNd.label || '') || '').trim();
        const currentNameLocked = Boolean((currentNd && currentNd.nameLocked) || n.nameLocked || (n.data && n.data.nameLocked));
        const preservedCustomName = currentNameLocked ? currentCustomName : (currentCustomName || String((freshData.customName || '')).trim());
        const nextLabel = preservedCustomName || (freshData.label && String(freshData.label).trim()) || currentNd.label || n.label || freshApiNode.label || n.id;

        const percentageCandidates = [
          freshData.porcentaje_capacidad,
          freshData.porcentaje_capacidad_api,
          freshData.porcentaje_api,
          freshData.porcentaje,
          currentNd.porcentaje_capacidad,
          currentNd.porcentaje_capacidad_api,
          currentNd.porcentaje_api,
          currentNd.porcentaje,
        ];
        const nextPercent = percentageCandidates.find((value) => value !== null && value !== undefined && value !== '') != null
          ? Number(percentageCandidates.find((value) => value !== null && value !== undefined && value !== ''))
          : null;

        const merged = {
          ...currentNd,
          ...freshData,
          // IMPORTANTE: preservar la posición actual del nodo, nunca sobreescribir con la de la API
          position: n.position,
          nameLocked: Boolean((currentNd && currentNd.nameLocked) || n.nameLocked || false),
          customName: preservedCustomName,
          label: nextLabel,
          originalName: currentNd.originalName || freshData.originalName || freshData.apiName || currentNd.apiName || n.label || n.id,
          apiName: currentNd.apiName || freshData.apiName || freshData.originalName || currentNd.originalName || freshApiNode.id,
          valor_m: freshData.valor_m ?? currentNd.valor_m,
          nivel: freshData.nivel ?? currentNd.nivel ?? freshData.valor_m ?? currentNd.valor_m ?? null,
          capacidad_actual_m3: freshData.capacidad_actual_m3 ?? currentNd.capacidad_actual_m3,
          capacidad_maxima_m3: freshData.capacidad_maxima_m3 ?? currentNd.capacidad_maxima_m3,
          altura_rebose_calibrada: freshData.altura_rebose_calibrada ?? currentNd.altura_rebose_calibrada,
          altura_rebose: freshData.altura_rebose ?? currentNd.altura_rebose,
          porcentaje: nextPercent,
          tag: freshData.tag ?? currentNd.tag,
        };
        return {
          ...n,
          // NUNCA cambiar la posición del nodo al actualizar datos de la API
          position: n.position,
          customName: preservedCustomName,
          label: nextLabel,
          data: {
            ...n.data,
            customName: preservedCustomName,
            label: nextLabel,
            nodeData: merged,
          },
        };
      });
      // Mantener nodesRef sincronizado
      nodesRef.current = updated;
      return updated;
    });
    return undefined;
  }, [initialNodes, initialEdges, readDiagramState, showFlow]);

  // Efecto separado: solo actualiza animated en edges cuando cambia showFlow
  useEffect(() => {
    setEdges(eds => eds.map(e => ({ ...e, animated: showFlow })));
  }, [showFlow]);

  // Efecto separado: re-formatea labels de edges cuando cambia connectDateFormat
  useEffect(() => {
    if (!connectDateFormat) return;
    setEdges(eds => eds.map(e => {
      if (e.data && e.data.date) {
        try { return { ...e, label: formatDateLabel(e.data.date, connectDateFormat) }; } catch (err) {}
      }
      return e;
    }));
  }, [connectDateFormat]);



  // keep selected flag, edit mode, and tools in node data synced
  useEffect(() => {
    setNodes((nds) => nds.map(n => ({
      ...n,
      data: {
        ...n.data,
        editMode,
        mode,
        deleteMode,
        selected: n.id === selectedNodeId || n.id === connectPendingId,
        pendingConnect: n.id === connectPendingId,
        onSelect: (id) => { setSelectedNodeId(id); if (onNodeSelect) onNodeSelect(id); },
        onMove: (id, dx, dy) => moveNode(id, dx, dy),
        onConnectNode: (id) => handleConnectSelection(id),
        onDuplicate: (id) => duplicateSelectedNode(id),
        onRename: applyNodeRename,
        onDeleteSelected: (id) => deleteSelectedNode(id),
      }
    })));
  }, [selectedNodeId, connectPendingId, editMode, mode, deleteMode, onNodeSelect, moveNode, handleConnectSelection, duplicateSelectedNode, applyNodeRename, deleteSelectedNode]);

  // include transient openEditor hint and callback in node data
  useEffect(() => {
    setNodes((nds) => nds.map(n => ({
      ...n,
      data: {
        ...n.data,
        openEditor: Boolean(openEditorRef.current && openEditorRef.current.has && openEditorRef.current.has(n.id)),
        onEditorShown: (id) => { try { openEditorRef.current.delete(id); } catch (e) {} },
      }
    })));
  }, []);

  // Cuando la API (IBAL) falla, limpiar únicamente los campos dinámicos de los nodos
  useEffect(() => {
    if (!apiError) return;
    try {
      setNodes((nds) => {
        const updated = (nds || []).map((n) => {
          try {
            const current = (n.data && n.data.nodeData) || (n.data || {});
            const cleared = {
              ...current,
              valor_m: null,
              altura_rebose: null,
              porcentaje: null,
              fecha_hora: null,
            };
            return { ...n, data: { ...(n.data || {}), nodeData: cleared } };
          } catch (err) { return n; }
        });
        nodesRef.current = updated;
        return updated;
      });
    } catch (e) {}
  }, [apiError]);


  // apply filter state: dim non-matching nodes
  useEffect(() => {
    setNodes((nds) => nds.map(n => {
      const d = n.data && n.data.nodeData ? n.data.nodeData : (n.data || {});
      const pct = calculateDisplayPorcentaje(d);
      let stateLabel = 'sin datos';
      try {
        if (pct != null) {
          const v = Number(pct);
          if (v < 20) stateLabel = 'critico';
          else if (v < 40) stateLabel = 'atencion';
          else stateLabel = 'normal';
        }
      } catch (e) {}
      const matches = filterState === 'all' || (filterState === 'normal' && stateLabel === 'normal') || (filterState === 'atencion' && stateLabel === 'atencion') || (filterState === 'critico' && stateLabel === 'critico') || (filterState === 'sin-datos' && stateLabel === 'sin datos');
      return { ...n, style: { ...(n.style || {}), opacity: matches ? 1 : 0.16 } };
    }));
  }, [filterState]);

  // keep refs in sync to allow stable callbacks
  useEffect(() => { nodesRef.current = nodes; edgesRef.current = edges; }, [nodes, edges]);

  // Resaltar edge seleccionada en rojo para dar feedback visual antes de eliminarla
  useEffect(() => {
    setEdges((eds) => eds.map(e => ({
      ...e,
      style: e.id === selectedEdgeId
        ? { stroke: '#ef4444', strokeWidth: 6, strokeLinecap: 'round' }
        : { stroke: '#000', strokeWidth: 5, strokeLinecap: 'round' },
      markerEnd: e.id === selectedEdgeId
        ? { type: MarkerType.ArrowClosed, color: '#ef4444' }
        : { type: MarkerType.ArrowClosed, color: '#000' },
    })));
  }, [selectedEdgeId]);


  // Solo hacer fitView la PRIMERA vez que se cargan los nodos.
  // Después, restaurar el viewport guardado para que la pantalla no se mueva.
  const didFitView = useRef(false);

  useEffect(() => {
    if (!rfInstance || nodes.length === 0) return undefined;

    // Arreglar visibilidad de nodos ocultos por React Flow
    const timer = setTimeout(() => {
      try {
        const all = Array.from(document.querySelectorAll('.react-flow__node'));
        all.forEach(n => {
          try {
            if (n && n.style && String(n.style.visibility) === 'hidden') n.style.visibility = 'visible';
            if (n && n.style && n.style.opacity && n.style.opacity !== '1') n.style.opacity = '';
          } catch (err) {}
        });
      } catch (err) {}

      // Solo hacer fitView la primera vez
      if (!didFitView.current) {
        didFitView.current = true;
        try {
          const saved = localStorage.getItem('district_viewport');
          if (saved) {
            let vp = JSON.parse(saved);
            vp = sanitizeViewport(vp);
            rfInstance.setViewport(vp, { duration: 0 });
          } else {
            rfInstance.fitView({ padding: 0.12 });
          }
        } catch (err) {
          try { rfInstance.fitView({ padding: 0.12 }); } catch (e) {}
        }
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [rfInstance, nodes.length]); // solo reacciona al cambio de cantidad, no a cada actualización

  // validation: ensure at least 20 tanks are present and each node has a valid position
  useEffect(() => {
    try {
      const tankCount = (nodes || []).filter(n => n.type === 'tank').length;
      const plantCount = (nodes || []).filter(n => n.type === 'plant').length;
      const edgeCount = (edges || []).length;
      const unconnected = (nodes || []).filter(n => n.type === 'tank' && !(edges || []).find(ed => ed.source === n.id || ed.target === n.id)).length;
      console.log(`[DistrictFlow] Tanques encontrados: ${tankCount} | Plantas encontradas: ${plantCount} | Conexiones: ${edgeCount} | Tanques sin conexión: ${unconnected}`);
      if (tankCount < 20) console.warn(`[DistrictFlow] WARNING: Se esperaban 20 tanques pero se encontraron ${tankCount}`);
      for (const n of (nodes || [])) {
        if (!n.position || n.position.x == null || n.position.y == null) console.warn('Nodo sin posición válida:', n.id);
      }
    } catch (e) { console.error(e); }
  }, [nodes]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); doUndo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); doRedo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [doUndo, doRedo]);

  // focus on node when requested from parent
  useEffect(() => {
    if (!focusNodeId || !rfInstance) return;
    const n = nodes.find(x => x.id === focusNodeId);
    if (!n) return;
    try { rfInstance.setCenter(n.position, { duration: 400 }); } catch (e) { if (rfInstance && rfInstance.fitView) rfInstance.fitView(); }
  }, [focusNodeId, rfInstance, nodes]);

  // expose imperative methods to parent via ref
  useImperativeHandle(ref, () => ({
    doAutoLayout,
    doSave,
    doRestoreInitial,
    doViewAll,
    doUndo,
    doRedo,
    toggleShowFlow,
    addDiagramNode,
    addShapeNode,
    changeSelectedNodeColor,
    duplicateSelectedNode,
    deleteSelectedNode,
    rotateSelectedNode,
    setSelectedNodeRotation,
    editUnlockAllNodes,
    saveAndLockAllNodes,
    dumpState: () => {
      try {
        const saved = readDiagramState();
        console.debug('[DistrictFlow] dumpState persisted:', saved);
      } catch (e) { console.error(e); }
      try { console.debug('[DistrictFlow] dumpState nodesRef:', nodesRef.current); } catch (e) {}
      try { console.debug('[DistrictFlow] dumpState edgesRef:', edgesRef.current); } catch (e) {}
    },
    getSelectedNodeId: () => selectedNodeId,
    getSelectedEdgeId: () => selectedEdgeId,
    getShowFlow: () => showFlow,
    deleteSelectedConnection,
    resizeSelectedNode,
    updateSelectedConnectionStyle,
    updateSelectedEdgeLabel,
    startAutoSave: () => setAutoSaveEnabled(true),
    stopAutoSave: () => setAutoSaveEnabled(false),
    setDefaultEdgeType: (type) => {
      if (!type) return;
      // Sólo actualizar el valor por defecto para nuevas conexiones.
      setDefaultEdgeTypeState(type);
    },
    // Cambiar el tipo de una arista/edge individual por su id
    updateEdgeType: (edgeId, type) => {
      if (!edgeId || !type) return;
      try {
        const updated = (edgesRef.current || []).map(e => e.id === edgeId ? ({ ...e, type }) : e);
        setEdges(updated);
        edgesRef.current = updated;
        try { persistDistrictState(nodesRef.current, updated); } catch (e2) {}
      } catch (e) { console.error('[DistrictFlow] updateEdgeType error', e && e.message); }
    },
  }), [doAutoLayout, doSave, doRestoreInitial, doViewAll, doUndo, doRedo, toggleShowFlow, addDiagramNode, addShapeNode, changeSelectedNodeColor, duplicateSelectedNode, deleteSelectedNode, rotateSelectedNode, setSelectedNodeRotation, editUnlockAllNodes, saveAndLockAllNodes, selectedNodeId, selectedEdgeId, showFlow, deleteSelectedConnection]);

  // Autosave interval: guarda nodes+edges y viewport cada segundo cuando está habilitado
  useEffect(() => {
    if (!autoSaveEnabled) {
      if (autoSaveTimerRef.current) { clearInterval(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
      return;
    }
    if (autoSaveTimerRef.current) return; // ya corriendo
    autoSaveTimerRef.current = setInterval(() => {
      try {
        persistDistrictState(nodesRef.current, edgesRef.current);
      } catch (e) {}
        try {
        if (rfInstance && typeof rfInstance.getViewport === 'function') {
          let vp = rfInstance.getViewport();
          vp = sanitizeViewport(vp);
          try { localStorage.setItem('district_viewport', JSON.stringify(vp)); } catch (e) {}
        }
      } catch (e) {}
    }, 1000);
    return () => { if (autoSaveTimerRef.current) { clearInterval(autoSaveTimerRef.current); autoSaveTimerRef.current = null; } };
  }, [autoSaveEnabled, persistDistrictState, rfInstance]);

  // Flush pending server save and persist WS queue on unload/navigation
  useEffect(() => {
    const handleUnload = () => {
      try {
        // persist latest local state
        try { if (autoSaveEnabledRef.current) { const saved = readDiagramState(); localStorage.setItem('district_state', JSON.stringify(saved)); } } catch (e) {}

        // try to send pending server save using Beacon or fetch keepalive
        try {
          const apiBase = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001/api').replace(/\/$/, '');
          const url = `${apiBase}/diagram/state`;
          const payload = pendingServerSaveRef.current || (autoSaveEnabledRef.current ? JSON.parse(localStorage.getItem('district_state') || '{}') : null);
          if (autoSaveEnabledRef.current && payload) {
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            if (navigator && typeof navigator.sendBeacon === 'function') {
              try { navigator.sendBeacon(url, blob); } catch (e) {}
            } else {
              try { fetch(url, { method: 'POST', body: JSON.stringify(payload), keepalive: true, headers: { 'Content-Type': 'application/json' } }); } catch (e) {}
            }
          }
        } catch (e) {}

        // persist WS queue to localStorage
        try { if (sendQueueRef.current && sendQueueRef.current.length) localStorage.setItem('district_ws_queue', JSON.stringify(sendQueueRef.current)); } catch (e) {}
      } catch (e) {}
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [readDiagramState]);

  const overlayElement = overlayVisible ? (
    <div
      ref={overlayRef}
      style={{ pointerEvents: 'none', position: 'absolute', zIndex: 2000, background: 'transparent', padding: 0, ...(overlayPos.useRight ? { right: overlayPos.right, top: overlayPos.top } : { left: overlayPos.x, top: overlayPos.y }) }}>
      <div style={{ pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.72)', color: '#fff', padding: '6px 8px', borderRadius: 8, fontSize: 12 }}>
        <div
          onMouseDown={(e) => {
            try {
              draggingRef.current = true;
              const rect = overlayRef.current.getBoundingClientRect();
              dragOffsetRef.current = e.clientX - rect.left;
            } catch (ev) {}
          }}
          onTouchStart={(e) => {
            try {
              draggingRef.current = true;
              const rect = overlayRef.current.getBoundingClientRect();
              const clientX = e.touches ? e.touches[0].clientX : e.clientX;
              dragOffsetRef.current = clientX - rect.left;
            } catch (ev) {}
          }}
          style={{ pointerEvents: 'auto', cursor: 'grab', padding: '4px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
          title="Arrastra para mover"
        >
          <div style={{ fontSize: 11, fontWeight: 800 }}>WS</div>
        </div>

        <div style={{ pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontWeight: 700, pointerEvents: 'none' }}>WS: {wsConnected ? 'Conectado' : 'Desconectado'}</div>
          <div style={{ pointerEvents: 'none' }}>Cola: {wsQueueSize}</div>
        </div>

        <div style={{ display: 'flex', gap: 6, pointerEvents: 'auto' }}>
          <button type="button" onClick={() => { flushSendQueue(); }} style={{ padding: '6px 8px', borderRadius: 6, border: 'none', background: '#2b6cb0', color: '#fff', cursor: 'pointer' }}>Forzar envío</button>
          <button type="button" onClick={() => { clearSendQueue(); }} style={{ padding: '6px 8px', borderRadius: 6, border: 'none', background: '#b91c1c', color: '#fff', cursor: 'pointer' }}>Vaciar cola</button>
          <button
            type="button"
            onClick={() => { toggleLockSelectedNode(); }}
            style={{ padding: '6px 8px', borderRadius: 6, border: 'none', background: '#f59e0b', color: '#062b1f', cursor: 'pointer' }}
            title="Bloquear/Desbloquear posición del nodo seleccionado"
          >
            {isSelectedNodeLocked() ? 'Desbloquear' : 'Bloquear'}
          </button>
          <button type="button" onClick={() => { editUnlockAllNodes(); }} style={{ padding: '6px 8px', borderRadius: 6, border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer' }} title="Editar todo: desbloquear posiciones">Editar todo</button>
          <button type="button" onClick={() => { saveAndLockAllNodes(); }} style={{ padding: '6px 8px', borderRadius: 6, border: 'none', background: '#0ea5e9', color: '#fff', cursor: 'pointer' }} title="Guardar y fijar posiciones">Guardar y fijar</button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div ref={containerRef} style={{ width: '100%', height: '72vh', position: 'relative' }}>
      {/* WS Queue status overlay (diagnostic) */}
      {/* Always visible overlay container that does not block pointer events by default */}
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, left: 0, pointerEvents: 'none', zIndex: 1999 }}>
        {overlayElement}
      </div>

      {/* edit-mode connect date picker */}
      {(editMode && mode === 'connect') ? (
        <div style={{ position: 'absolute', right: 12, top: 12, zIndex: 50, background: 'rgba(255,255,255,0.96)', padding: 8, borderRadius: 6, boxShadow: '0 1px 6px rgba(0,0,0,0.12)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: '#0b2447', fontWeight: 600 }}>Fecha</label>
          <input type="date" value={connectDate} onChange={(e) => setConnectDate(e.target.value)} style={{ fontSize: 13, padding: '4px 6px' }} />
          <select value={connectDateFormat} onChange={(e) => { setConnectDateFormat(e.target.value); try { localStorage.setItem('district_connect_date_format', e.target.value); } catch (err) {} }} style={{ fontSize: 13, padding: '4px 6px' }}>
            <option value="dd/MM/yyyy">DD/MM/YYYY</option>
            <option value="dd MMM yyyy">DD MMM YYYY</option>
            <option value="dd/MM/yyyy HH:mm">DD/MM/YYYY HH:mm</option>
          </select>
          <button onClick={() => setConnectDate('')} style={{ fontSize: 12, padding: '4px 6px' }}>Limpiar</button>
        </div>
      ) : null}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeDragStart={onNodeDragStart}
        onConnect={onConnect}
        onNodeClick={(_, node) => {
          setSelectedEdgeId(null);
          if (editMode && deleteMode) {
            const removed = deleteSelectedNode(node.id);
            if (removed) {
              setConnectPendingId(null);
              if (onNodeSelect) onNodeSelect(null);
            }
            return;
          }

          if (editMode && mode === 'connect') {
            beginConnectSelection(node.id);
            return;
          }

          if (editMode && mode === 'duplicate') {
            duplicateSelectedNode(node.id);
            return;
          }

          setSelectedNodeId(node.id);
          if (onNodeSelect) onNodeSelect(node.id);
        }}
        onEdgeClick={(_, edge) => {
          setSelectedNodeId(null);
          setSelectedEdgeId(edge.id);
          if (onEdgeSelect) onEdgeSelect(edge.id);
        }}
        onNodeMouseDown={(_, node) => {
          if (editMode && mode === 'connect') {
            return;
          }
        }}
        onPaneClick={() => {
          setSelectedEdgeId(null);
          if (editMode && mode === 'connect') setConnectPendingId(null);
          if (editMode && deleteMode) {
            setConnectPendingId(null);
          }
        }}
        onEdgesDelete={onEdgesDelete}
        nodeTypes={NODE_TYPES}
        updateNodeDimensions={false}
        attributionPosition="bottom-left"
        onInit={(inst) => { setRfInstance(inst); }}
        onMoveEnd={(_, viewport) => {
          try {
            const vp = sanitizeViewport(viewport);
            localStorage.setItem('district_viewport', JSON.stringify(vp));
          } catch (e) {}
        }}
        connectionLineType="smoothstep"
        connectionLineStyle={{ stroke: '#000', strokeWidth: 5 }}
        panOnScroll={false}
        zoomOnScroll={true}
        panOnDrag
        snapToGrid={false}
        nodesDraggable={diagramMode === 'edit'}
        elementsSelectable={diagramMode === 'edit'}
        nodesConnectable={editMode && diagramMode === 'edit'}
        connectOnClick={editMode && diagramMode === 'edit'}
        connectionMode="loose"
      >
        <Background gap={16} />
      </ReactFlow>

      {/* Toast de guardado — no bloqueante */}
      {saveMsg && (
        <div style={{
          position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: saveMsg === 'ok' ? '#22c55e' : '#ef4444',
          color: '#fff', padding: '10px 24px', borderRadius: 8,
          fontWeight: 700, fontSize: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          zIndex: 9999, pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          {saveMsg === 'ok' ? '✓ Cambios guardados correctamente' : '✗ Error al guardar'}
        </div>
      )}
    </div>
  );
});

export default DistrictFlow;
