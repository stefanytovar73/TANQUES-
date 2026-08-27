import React, { useCallback, useEffect, useState, useRef, useImperativeHandle } from 'react';
import { format as formatDateFn } from 'date-fns';
import ReactFlow, { addEdge, Background, MarkerType, Handle, Position, applyNodeChanges, applyEdgeChanges } from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import TankNode from './TankNode';
import { NODES as STATIC_NODES } from './districtLayout';
import { calculateDisplayPorcentaje } from '../../config/tankCatalog';
import { isValidSavedEdge, normalizeSavedEdge } from './edgeUtils';
import tanqueService from '../../services/tanqueService';

// ── Caudales dinámicos: COMBEIMA 1, COMBEIMA 2, CAY ──────────────────────────
// Mapeo label (normalizado a mayúsculas) → { tag, servicio }
const CAUDAL_NODE_CONFIG = {
  'COMBEIMA 1': { tag: 'CAPTACION_CAUDAL_SALIDA_24', service: 'captacion' },
  'COMBEIMA 2': { tag: 'CAPTACION_CAUDAL_SALIDA_27', service: 'captacion' },
  'CAY':        { tag: 'PTAP_CAUDAL_CAY_16',         service: 'ptap'      },
};

// Cache compartida a nivel de módulo: { [tag]: { valor, unidad, sin_datos } }
// Evita múltiples llamadas HTTP cuando hay varias instancias de FlowDistrictNode.
let _caudalMap = null;
const _caudalListeners = new Set();

function _notifyCaudalListeners(map) {
  _caudalMap = map;
  _caudalListeners.forEach((fn) => fn(map));
}

async function _loadCaudales() {
  try {
    const [captacion, ptap] = await Promise.all([
      tanqueService.getCaptacion(),
      tanqueService.getPtap(),
    ]);
    const map = {};
    for (const v of (captacion?.variables || [])) map[v.tag] = v;
    for (const v of (ptap?.variables || []))      map[v.tag] = v;
    _notifyCaudalListeners(map);
  } catch (_) { /* silencioso — no rompe el diagrama */ }
}

let _caudalPollingStarted = false;
function _ensureCaudalPolling() {
  if (_caudalPollingStarted) return;
  _caudalPollingStarted = true;
  _loadCaudales();                         // primera carga inmediata
  setInterval(_loadCaudales, 60000);       // refresco cada 60 s (igual que useTanques)
}

function _formatCaudalValor(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return String(valor);
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1);
}
// ─────────────────────────────────────────────────────────────────────────────

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 160;
const nodeHeight = 80;

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

function sanitizePosition(position = {}) {
  return {
    x: toFiniteNumber(position.x, 0),
    y: toFiniteNumber(position.y, 0),
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

function enrichTankNodeMetrics(data = {}) {
  const source = { ...(data || {}) };
  const nivel = source.valor_m ?? source.nivel ?? source.valor ?? source.level ?? source.level_m ?? null;
  const nivelNumber = Number.isFinite(Number(nivel)) ? Number(nivel) : null;
  const resolvedHeight = source.altura_rebose_calibrada ?? source.altura_rebose_m ?? source.altura_rebose ?? source.alturaRebose ?? source.alturaReboseCalibrada ?? null;
  const percentage = source.porcentaje != null && Number.isFinite(Number(source.porcentaje))
    ? Number(source.porcentaje)
    : (nivelNumber != null && resolvedHeight != null && Number(resolvedHeight) > 0
      ? calculateDisplayPorcentaje({ ...source, valor_m: nivelNumber, altura_rebose_calibrada: Number(resolvedHeight) })
      : null);

  return {
    ...source,
    valor_m: nivelNumber,
    nivel: nivelNumber,
    altura_rebose_calibrada: resolvedHeight != null && Number.isFinite(Number(resolvedHeight)) ? Number(resolvedHeight) : null,
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
  const rotationValue = source.rotation != null ? toFiniteNumber(source.rotation, 0) : (node?.rotation != null ? toFiniteNumber(node.rotation, 0) : 0);
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
    rotation: rotationValue,
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
function FlowTankNode({ data }) {
  const { nodeData, onSelect, onDuplicate, onConnectNode, onDeleteSelected, onRename, editMode, mode, deleteMode } = data || {};
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(getNodeDisplayName({ data: nodeData }));
  const tankWidth = (nodeData?.width != null && Number.isFinite(Number(nodeData.width)) && Number(nodeData.width) > 0) ? Number(nodeData.width) : 160;
  const tankHeight = (nodeData?.height != null && Number.isFinite(Number(nodeData.height)) && Number(nodeData.height) > 0) ? Number(nodeData.height) : 200;
  const tankScale = Math.max(0.45, Math.min(1.4, Math.min(tankWidth / 160, tankHeight / 200) || 1));
  const innerOffsetX = (tankWidth - 160 * tankScale) / 2;
  const innerOffsetY = (tankHeight - 200 * tankScale) / 2;
  const rotation = (nodeData?.rotation != null && Number.isFinite(Number(nodeData.rotation))) ? Number(nodeData.rotation) : 0;

  useEffect(() => {
    setDraft(getNodeDisplayName({ data: nodeData }));
  }, [nodeData?.customName, nodeData?.label, nodeData?.display_name, nodeData?.nombre, nodeData?.apiName]);

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
      if (onConnectNode) onConnectNode(nodeData.id);
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

  return (
    <div onClick={handleClick} onDoubleClick={beginEdit} style={{ width: tankWidth, height: tankHeight, position: 'relative', cursor: 'pointer', transform: rotation ? `rotate(${rotation}deg)` : undefined, transformOrigin: 'center center' }}>
      {/* Handles — solo visibles en editMode */}
      <Handle type="target" position={Position.Left}   id="t-left"   style={{ ...handleStyle, left: tankWidth * 0.2, top: tankHeight / 2 }} />
      <Handle type="source" position={Position.Right}  id="s-right"  style={{ ...handleStyle, right: tankWidth * 0.2, top: tankHeight / 2 }} />
      <Handle type="target" position={Position.Top}    id="t-top"    style={{ ...handleStyle, top: tankHeight * 0.14, left: tankWidth / 2 }} />
      <Handle type="source" position={Position.Bottom} id="s-bottom" style={{ ...handleStyle, bottom: tankHeight * 0.12, left: tankWidth / 2 }} />

      <div style={{ width: tankWidth, height: tankHeight, overflow: 'visible' }}>
        <svg width={tankWidth} height={tankHeight} overflow="visible">
          <g transform={`translate(${innerOffsetX}, ${innerOffsetY}) scale(${tankScale})`}>
            <TankNode data={nodeData} selected={data?.selected || isPending} />
          </g>

          {isPending && (
            <g>
              <circle cx={80} cy={12} r={14} fill="rgba(239,68,68,0.18)" stroke="#ef4444" strokeWidth={2} />
              <text x={80} y={16} fontSize={10} fontWeight={900} fill="#b91c1c" textAnchor="middle">ORIGEN</text>
            </g>
          )}

          {isEditing ? (
            <foreignObject x={8} y={162} width={144} height={32}>
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


function FlowPlantNode({ data }) {
  const { nodeData, onSelect, onDuplicate, onConnectNode, onDeleteSelected, onRename, editMode, mode, deleteMode } = data || {};
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(getNodeDisplayName({ data: nodeData }));
  const customColor = nodeData?.customColor || nodeData?.color;

  // ── Caudal dinámico ───────────────────────────────────────────────────────
  const [caudalMap, setCaudalMap] = useState(_caudalMap);
  useEffect(() => {
    _ensureCaudalPolling();
    _caudalListeners.add(setCaudalMap);
    return () => { _caudalListeners.delete(setCaudalMap); };
  }, []);
  // ─────────────────────────────────────────────────────────────────────────

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
  const rotation = (nodeData?.rotation != null && Number.isFinite(Number(nodeData.rotation))) ? Number(nodeData.rotation) : 0;
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
    background: customColor || '#073B70',
    border: '2px solid #ffffff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    borderRadius: '50%',
    zIndex: 10,
  };

  // Caudal
  const caudalConfig = CAUDAL_NODE_CONFIG[labelText.trim().toUpperCase()] || CAUDAL_NODE_CONFIG[labelText.trim()];
  const caudalEntry = caudalConfig && caudalMap ? caudalMap[caudalConfig.tag] : null;
  const caudalValor = caudalEntry != null ? caudalEntry.valor : null;
  const caudalUnidad = caudalEntry?.unidad || 'L/s';

  return (
    <div onClick={handleClick} onDoubleClick={beginEdit} style={{ width: 200, height: 104, position: 'relative', cursor: 'pointer', transform: rotation ? `rotate(${rotation}deg)` : undefined, transformOrigin: 'center center' }}>
      <Handle type="target" position={Position.Left} id="t-left" style={{ ...handleStyle, left: 6, top: 64 }} />
      <Handle type="source" position={Position.Right} id="s-right" style={{ ...handleStyle, right: 6, top: 64 }} />
      <Handle type="target" position={Position.Top} id="t-top" style={{ ...handleStyle, top: 14, left: 100 }} />
      <Handle type="source" position={Position.Bottom} id="s-bottom" style={{ ...handleStyle, bottom: 14, left: 100 }} />

      <div style={{ width: 200, height: 104, overflow: 'visible' }}>
        <svg width={200} height={104} overflow="visible">
          <g transform={`translate(${100}, ${64})`}>
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
                <rect x={-90} y={-22} width={180} height={44} rx={22} ry={22} fill={isPending ? '#fee2e2' : (customColor ? `${customColor}22` : '#e6f2ff')} stroke={isPending ? '#ef4444' : (customColor || '#073B70')} strokeWidth={isPending || data?.selected ? 3 : 2} />
                <text x={0} y={6} fontFamily="Roboto, Arial" fontSize={13} fontWeight={800} fill={isPending ? '#b91c1c' : (customColor || '#073B70')} textAnchor="middle" onClick={beginEdit} onDoubleClick={beginEdit} style={{ cursor: 'pointer' }}>{labelText}</text>
                {/* Badge caudal encima del nodo — mismo patrón que TankNode */}
                {caudalValor != null && (
                  <>
                    <rect
                      x={-38} y={-46} width={76} height={22}
                      rx={5}
                      fill="#ffffff"
                      stroke="#94a3b8"
                      strokeWidth={1.2}
                      style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.18))', pointerEvents: 'none' }}
                    />
                    <text
                      x={0} y={-35}
                      fontFamily="Roboto, Arial, sans-serif"
                      fontSize={11} fontWeight={800}
                      fill="#0b2447"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{ pointerEvents: 'none' }}
                    >
                      {_formatCaudalValor(caudalValor)} {caudalUnidad}
                    </text>
                  </>
                )}
              </>
            )}
          </g>
        </svg>
      </div>
    </div>
  );
}


function FlowDistrictNode({ data }) {
  const { nodeData, onSelect, onDuplicate, onConnectNode, onDeleteSelected, onRename, editMode, mode, deleteMode } = data || {};
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(getNodeDisplayName({ data: nodeData }));
  const customColor = nodeData?.customColor || nodeData?.color;

  // ── Caudal dinámico ───────────────────────────────────────────────────────
  const [caudalMap, setCaudalMap] = useState(_caudalMap);
  useEffect(() => {
    _ensureCaudalPolling();
    _caudalListeners.add(setCaudalMap);
    return () => { _caudalListeners.delete(setCaudalMap); };
  }, []);
  // ─────────────────────────────────────────────────────────────────────────

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
  const rotation = (nodeData?.rotation != null && Number.isFinite(Number(nodeData.rotation))) ? Number(nodeData.rotation) : 0;

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

  return (
    <div onClick={handleClick} onDoubleClick={beginEdit} style={{ width: 160, height: 72, position: 'relative', cursor: 'pointer', transform: rotation ? `rotate(${rotation}deg)` : undefined, transformOrigin: 'center center' }}>
      <Handle type="target" position={Position.Left} id="t-left" style={{ ...handleStyle, left: 6, top: 48 }} />
      <Handle type="source" position={Position.Right} id="s-right" style={{ ...handleStyle, right: 6, top: 48 }} />
      <Handle type="target" position={Position.Top} id="t-top" style={{ ...handleStyle, top: 4, left: 80 }} />
      <Handle type="source" position={Position.Bottom} id="s-bottom" style={{ ...handleStyle, bottom: 4, left: 80 }} />

      <div style={{ width: 160, height: 72, overflow: 'visible' }}>
        <svg width={160} height={72} overflow="visible">
          <g transform={`translate(${80}, ${48})`}>
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
            ) : (() => {
              // Caudal dinámico: buscar configuración por label normalizado
              const caudalConfig = CAUDAL_NODE_CONFIG[labelText.trim().toUpperCase()] || CAUDAL_NODE_CONFIG[labelText.trim()];
              const caudalEntry = caudalConfig && caudalMap ? caudalMap[caudalConfig.tag] : null;
              const caudalValor = caudalEntry != null ? caudalEntry.valor : null;
              const caudalUnidad = caudalEntry?.unidad || 'L/s';
              return (
                <>
                  {/* Rect principal del nodo */}
                  <rect rx={6} ry={6} x={-70} y={-17} width={140} height={34} fill={isPending ? '#fee2e2' : (customColor ? `${customColor}18` : '#fff')} stroke={isPending ? '#ef4444' : (customColor || (data?.selected ? '#2563eb' : '#6b7280'))} strokeWidth={isPending || data?.selected ? 2.5 : 1} />
                  <text x={0} y={5} fontFamily="Roboto, Arial" fontSize={12} fill={isPending ? '#b91c1c' : (customColor || '#475569')} fontWeight={700} textAnchor="middle" onClick={beginEdit} onDoubleClick={beginEdit} style={{ cursor: 'pointer' }}>{labelText}</text>
                  {/* Badge caudal dinámico encima del nodo — mismo patrón que TankNode */}
                  {caudalValor != null && (
                    <>
                      <rect
                        x={-38} y={-42} width={76} height={22}
                        rx={5}
                        fill="#ffffff"
                        stroke="#94a3b8"
                        strokeWidth={1.2}
                        style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.18))', pointerEvents: 'none' }}
                      />
                      <text
                        x={0} y={-31}
                        fontFamily="Roboto, Arial, sans-serif"
                        fontSize={11} fontWeight={800}
                        fill="#0b2447"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        style={{ pointerEvents: 'none' }}
                      >
                        {_formatCaudalValor(caudalValor)} {caudalUnidad}
                      </text>
                    </>
                  )}
                </>
              );
            })()}
          </g>
        </svg>
      </div>
    </div>
  );
}

// Shape / Note / Text Card Node — soporta formas SVG tipo Paint
function FlowShapeNode({ data }) {
  const { nodeData, onSelect, onDuplicate, onConnectNode, onDeleteSelected, onRename, editMode, mode, deleteMode } = data || {};
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(nodeData?.label || 'Texto / Forma');
  const customColor = nodeData?.customColor || nodeData?.color || '#3b82f6';
  const safeColor = /^#[0-9a-fA-F]{3,8}$/.test(customColor) ? customColor : '#3b82f6';
  const baseSize = getAutoShapeSize(draft, nodeData?.width, nodeData?.height);
  const width = Number.isFinite(Number(nodeData?.width)) ? Number(nodeData.width) : Number.isFinite(Number(baseSize.width)) ? Number(baseSize.width) : 120;
  const height = Number.isFinite(Number(nodeData?.height)) ? Number(nodeData.height) : Number.isFinite(Number(baseSize.height)) ? Number(baseSize.height) : 68;
  const shapeType = nodeData?.shapeType || 'rect';
  const rotation = (nodeData?.rotation != null && Number.isFinite(Number(nodeData.rotation))) ? Number(nodeData.rotation) : 0;

  // ── Caudal dinámico ───────────────────────────────────────────────────────
  const [caudalMap, setCaudalMap] = useState(_caudalMap);
  useEffect(() => {
    _ensureCaudalPolling();
    _caudalListeners.add(setCaudalMap);
    return () => { _caudalListeners.delete(setCaudalMap); };
  }, []);
  const caudalConfig = CAUDAL_NODE_CONFIG[(draft || '').trim().toUpperCase()] || CAUDAL_NODE_CONFIG[(draft || '').trim()];
  const caudalEntry = caudalConfig && caudalMap ? caudalMap[caudalConfig.tag] : null;
  const caudalValor = caudalEntry != null ? caudalEntry.valor : null;
  const caudalUnidad = caudalEntry?.unidad || 'L/s';
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    setDraft(nodeData?.label || nodeData?.customName || 'Texto / Forma');
  }, [nodeData?.label, nodeData?.customName]);

  const handleClick = (ev) => {
    ev.stopPropagation();
    if (isEditing) return;
    if (editMode && deleteMode) { if (onDeleteSelected) onDeleteSelected(nodeData.id); return; }
    if (editMode && mode === 'duplicate') { if (onDuplicate) onDuplicate(nodeData.id); return; }
    if (editMode && mode === 'connect') { if (onConnectNode) onConnectNode(nodeData.id); return; }
    if (onSelect) onSelect(nodeData.id);
  };

  const beginEdit = (ev) => { ev.preventDefault(); ev.stopPropagation(); setDraft(nodeData?.label || ''); setIsEditing(true); };
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
    <div onClick={handleClick} onDoubleClick={beginEdit} style={{ width, height, position: 'relative', cursor: 'pointer', overflow: 'visible', transform: rotation ? `rotate(${rotation}deg)` : undefined, transformOrigin: 'center center' }}>
      <Handle type="target" position={Position.Left} id="t-left" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="s-right" style={handleStyle} />
      <Handle type="target" position={Position.Top} id="t-top" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="s-bottom" style={handleStyle} />
      <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>{renderShape()}</svg>
      {isPending && (<div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 900, padding: '1px 6px', borderRadius: 4 }}>ORIGEN</div>)}
      {/* Badge caudal encima del nodo — solo si hay valor */}
      {!isEditing && caudalValor != null && (
        <div style={{
          position: 'absolute',
          top: -28,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#ffffff',
          border: '1.2px solid #94a3b8',
          borderRadius: 5,
          boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
          padding: '2px 8px',
          fontSize: 11,
          fontWeight: 800,
          color: '#0b2447',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          fontFamily: 'Roboto, Arial, sans-serif',
        }}>
          {_formatCaudalValor(caudalValor)} {caudalUnidad}
        </div>
      )}
      {isEditing ? (
        <div className="nodrag" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: width - 20, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 10 }}>
          <textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveLabel(); } if (e.key === 'Escape') { e.preventDefault(); setIsEditing(false); } }}
            onBlur={() => saveLabel()}
            style={{ width: '100%', minHeight: 48, fontSize: 12, fontFamily: 'inherit', fontWeight: 700, color: '#0b2447', border: `1px solid ${safeColor}`, borderRadius: 4, padding: 4, boxSizing: 'border-box', outline: 'none', resize: 'none', background: 'rgba(255,255,255,0.95)' }} />
          <button type="button" onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }} onClick={e => { e.preventDefault(); e.stopPropagation(); saveLabel(); }} style={{ alignSelf: 'flex-end', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 4, background: safeColor, color: '#fff', border: 'none', cursor: 'pointer' }}>✓ Guardar</button>
        </div>
      ) : shapeType !== 'line' ? (
        <div style={{ position: 'absolute', top: 0, left: 0, width, height: shapeType === 'speech-bubble' ? height - 16 : height, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', wordBreak: 'break-word', color: '#0b2447', fontSize: 13, fontWeight: 700, padding: '4px 8px', boxSizing: 'border-box', pointerEvents: 'none' }}>
          {draft}
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

const DistrictFlow = React.forwardRef(function DistrictFlow({ initialNodes = [], initialEdges = [], onNodeSelect, onEdgeSelect, editMode = false, mode = 'select', deleteMode = false, containerRef = null, focusNodeId = null, filterState = 'all', edgeLineType = 'straight' }, ref) {

  // Note: avoid updateNodeDimensions to prevent React Flow from hiding nodes while measuring
  try { console.debug('[DISTRICT DEBUG] DistrictFlow init props initialNodes.length:', (initialNodes || []).length, 'initialEdges.length:', (initialEdges || []).length); } catch (e) {}
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [rfInstance, setRfInstance] = useState(null);
  // Tipo de línea activo — se sincroniza con la prop edgeLineType del padre y se puede cambiar desde el imperativeHandle
  const [currentEdgeType, setCurrentEdgeType] = useState(edgeLineType || 'straight');
  const currentEdgeTypeRef = useRef(edgeLineType || 'straight');
  useEffect(() => {
    currentEdgeTypeRef.current = edgeLineType || 'straight';
    setCurrentEdgeType(edgeLineType || 'straight');
  }, [edgeLineType]);
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
      type: 'straight',
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
  const [showFlow, setShowFlow] = useState(false);
  const [connectDate, setConnectDate] = useState('');
  const [connectDateFormat, setConnectDateFormat] = useState(() => {
    try { return localStorage.getItem('district_connect_date_format') || 'dd/MM/yyyy'; } catch (e) { return 'dd/MM/yyyy'; }
  });
  const [saveMsg, setSaveMsg] = useState(null); // null | 'ok' | 'error'

  const readDiagramState = useCallback(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('district_state') || '{}');
      if (!raw || typeof raw !== 'object') return {};
      raw.hiddenNodeIds = Array.isArray(raw.hiddenNodeIds) ? [...new Set(raw.hiddenNodeIds.filter((id) => id != null && String(id).trim() !== ''))] : [];
      raw.deletedNodeIds = Array.isArray(raw.deletedNodeIds) ? [...new Set(raw.deletedNodeIds.filter((id) => id != null && String(id).trim() !== ''))] : [];
      return raw;
    } catch (e) {
      return {};
    }
  }, []);

  const writeDiagramState = useCallback((nextState) => {
    try {
      const safe = nextState && typeof nextState === 'object' ? nextState : {};
      safe.hiddenNodeIds = Array.isArray(safe.hiddenNodeIds) ? [...new Set(safe.hiddenNodeIds.filter((id) => id != null && String(id).trim() !== ''))] : [];
      safe.deletedNodeIds = Array.isArray(safe.deletedNodeIds) ? [...new Set(safe.deletedNodeIds.filter((id) => id != null && String(id).trim() !== ''))] : [];
      localStorage.setItem('district_state', JSON.stringify(safe));
    } catch (e) {}
  }, []);

  const getPersistedNodeEntry = useCallback((node, previous = {}) => {
    const prev = previous && typeof previous === 'object' ? previous : {};
    const source = node?.data?.nodeData || node?.data || {};
    const baseName = source.apiName || source.originalName || source.tag || source.display_name || source.nombre || source.label || node?.label || node?.id || 'Sin nombre';
    const customName = node?.customName || source.customName || source.diagramName || source.displayName || prev.customName || '';
    const label = String(customName || baseName || prev.label || node?.id || 'Sin nombre').trim();
    const safeX = Number.isFinite(Number(node?.position?.x)) ? Number(node.position.x) : Number.isFinite(Number(prev.x)) ? Number(prev.x) : 0;
    const safeY = Number.isFinite(Number(node?.position?.y)) ? Number(node.position.y) : Number.isFinite(Number(prev.y)) ? Number(prev.y) : 0;
    const safeWidth = Number.isFinite(Number(source.width)) ? Number(source.width) : Number.isFinite(Number(prev.width)) ? Number(prev.width) : null;
    const safeHeight = Number.isFinite(Number(source.height)) ? Number(source.height) : Number.isFinite(Number(prev.height)) ? Number(prev.height) : null;
    return {
      ...(prev || {}),
      id: node?.id || prev.id || null,
      type: node?.type || prev.type || 'tank',
      x: safeX,
      y: safeY,
      label,
      customName: customName || prev.customName || '',
      apiName: source.apiName || source.originalName || source.tag || prev.apiName || baseName,
      originalName: source.originalName || source.apiName || source.tag || prev.originalName || baseName,
      color: source.color || source.customColor || prev.color || prev.customColor || '',
      customColor: source.customColor || source.color || prev.customColor || prev.color || '',
      shapeType: source.shapeType || prev.shapeType || 'box',
      width: safeWidth,
      height: safeHeight,
      rotation: source.rotation != null ? toFiniteNumber(source.rotation, 0) : (prev.rotation != null ? toFiniteNumber(prev.rotation, 0) : 0),
      valor_m: source.valor_m ?? prev.valor_m ?? null,
      altura_rebose_calibrada: source.altura_rebose_calibrada ?? prev.altura_rebose_calibrada ?? null,
      altura_rebose: source.altura_rebose ?? prev.altura_rebose ?? null,
      capacidad_actual_m3: source.capacidad_actual_m3 ?? prev.capacidad_actual_m3 ?? null,
      capacidad_maxima_m3: source.capacidad_maxima_m3 ?? prev.capacidad_maxima_m3 ?? null,
      tag: source.tag ?? prev.tag ?? null,
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
        const saved = readDiagramState();
        const nextNodes = {};
        (updated || []).forEach((n) => {
          const prev = saved.nodes && saved.nodes[n.id] && typeof saved.nodes[n.id] === 'object' ? saved.nodes[n.id] : {};
          nextNodes[n.id] = getPersistedNodeEntry(n, prev);
        });
        saved.nodes = nextNodes;
        saved.edges = edgesRef.current || [];
        writeDiagramState(saved);
      } catch (e) {}
      return updated;
    });
  }, [readDiagramState, writeDiagramState, getPersistedNodeEntry]);

  const persistDistrictState = useCallback((nextNodes = nodesRef.current, nextEdges = edgesRef.current) => {
    try {
      const raw = readDiagramState();
      const savedNodes = {};
      (nextNodes || []).forEach((n) => {
        const prev = raw.nodes && raw.nodes[n.id] && typeof raw.nodes[n.id] === 'object' ? raw.nodes[n.id] : {};
        savedNodes[n.id] = getPersistedNodeEntry(n, prev);
      });
      raw.nodes = savedNodes;
      // Limpiar campos temporales de resaltado antes de guardar
      raw.edges = Array.isArray(nextEdges) ? nextEdges.map(e => {
        if (!e._originalStyle && !e._originalMarkerEnd) return e;
        const { _originalStyle, _originalMarkerEnd, ...clean } = e;
        return clean;
      }) : [];
      raw.hiddenNodeIds = Array.isArray(raw.hiddenNodeIds) ? raw.hiddenNodeIds : [];
      raw.deletedNodeIds = Array.isArray(raw.deletedNodeIds) ? raw.deletedNodeIds : [];
      writeDiagramState(raw);
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
        label: nextLabel,
        originalName,
        apiName: sourceData.apiName || sourceData.originalName || sourceData.tag || sourceData.display_name || sourceData.nombre || originalName,
        width: autoShapeSize ? autoShapeSize.width : sourceData.width,
        height: autoShapeSize ? autoShapeSize.height : sourceData.height,
      };

      return {
        ...n,
        customName: nextLabel,
        label: nextLabel,
        data: {
          ...((n.data && { ...n.data }) || {}),
          id: n.id,
          type: n.type,
          customName: nextLabel,
          label: nextLabel,
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

  const resizeSelectedNode = useCallback((targetId, dw, dh) => {
    const id = targetId || selectedNodeId;
    if (!id) return;
    setNodes((nds) => {
      const updated = nds.map(n => {
        if (n.id !== id) return n;
        const sourceData = (n.data && n.data.nodeData) || (n.data || {});
        const currentW = Number.isFinite(Number(sourceData.width)) && Number(sourceData.width) > 0 ? Number(sourceData.width) : (n.type === 'tank' ? 160 : (n.type === 'plant' ? 200 : 120));
        const currentH = Number.isFinite(Number(sourceData.height)) && Number(sourceData.height) > 0 ? Number(sourceData.height) : (n.type === 'tank' ? 200 : (n.type === 'plant' ? 80 : 68));
        const nextW = Math.max(40, Math.min(500, currentW + (Number(dw) || 0)));
        const nextH = Math.max(40, Math.min(500, currentH + (Number(dh) || 0)));
        const nextNodeData = { ...sourceData, width: nextW, height: nextH };
        return {
          ...n,
          data: {
            ...n.data,
            width: nextW,
            height: nextH,
            nodeData: nextNodeData,
          },
        };
      });
      nodesRef.current = updated;
      persistDistrictState(updated, edgesRef.current);
      return updated;
    });
  }, [selectedNodeId, persistDistrictState]);

  const rotateSelectedNode = useCallback((targetId, direction) => {
    const id = targetId || selectedNodeId;
    if (!id) return;
    setNodes((nds) => {
      const updated = nds.map(n => {
        if (n.id !== id) return n;
        const sourceData = (n.data && n.data.nodeData) || (n.data || {});
        const currentRotation = Number.isFinite(Number(sourceData.rotation)) ? Number(sourceData.rotation) : 0;
        const delta = direction === 'left' ? -90 : 90;
        const nextRotation = ((currentRotation + delta) % 360 + 360) % 360;
        const nextNodeData = { ...sourceData, rotation: nextRotation };
        return {
          ...n,
          data: {
            ...n.data,
            rotation: nextRotation,
            nodeData: nextNodeData,
          },
        };
      });
      nodesRef.current = updated;
      persistDistrictState(updated, edgesRef.current);
      return updated;
    });
  }, [selectedNodeId, persistDistrictState]);

  const updateSelectedConnectionStyle = useCallback((edgeId, style) => {
    const id = edgeId || selectedEdgeId;
    if (!id || !style) return;
    setEdges((eds) => {
      const updated = eds.map(e => {
        if (e.id !== id) return e;
        const currentStyle = e._originalStyle || e.style || {};
        const nextStyle = {
          ...currentStyle,
          ...(style.strokeWidth != null ? { strokeWidth: Number(style.strokeWidth) } : {}),
          ...(style.stroke != null ? { stroke: style.stroke } : {}),
          strokeLinecap: 'round',
        };
        // Actualizar markerEnd para que la flecha coincida con el color de la línea
        const strokeColor = nextStyle.stroke || currentStyle.stroke || '#000';
        const nextMarkerEnd = { type: MarkerType.ArrowClosed, color: strokeColor };
        return { ...e, style: nextStyle, markerEnd: nextMarkerEnd, _originalStyle: nextStyle, _originalMarkerEnd: nextMarkerEnd };
      });
      edgesRef.current = updated;
      try {
        const saved = readDiagramState();
        saved.edges = updated;
        writeDiagramState(saved);
      } catch (e) {}
      return updated;
    });
  }, [selectedEdgeId, readDiagramState, writeDiagramState]);

  const updateSelectedEdgeLabel = useCallback((edgeId, label) => {
    const id = edgeId || selectedEdgeId;
    if (!id) return;
    setEdges((eds) => {
      const updated = eds.map(e => e.id === id ? { ...e, label: label || '' } : e);
      edgesRef.current = updated;
      try {
        const saved = readDiagramState();
        saved.edges = updated;
        writeDiagramState(saved);
      } catch (e) {}
      return updated;
    });
  }, [selectedEdgeId, readDiagramState, writeDiagramState]);

  const persistConnection = useCallback((nextEdges) => {
    try {
      const saved = readDiagramState();
      const mergedNodes = {};
      (nodesRef.current || []).forEach((n) => {
        const prev = saved.nodes && saved.nodes[n.id] && typeof saved.nodes[n.id] === 'object' ? saved.nodes[n.id] : {};
        mergedNodes[n.id] = getPersistedNodeEntry(n, prev);
      });
      saved.nodes = mergedNodes;
      saved.edges = nextEdges || [];
      writeDiagramState(saved);
    } catch (e) {}
  }, [getPersistedNodeEntry, readDiagramState, writeDiagramState]);

  const upsertOrToggleConnection = useCallback((sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;

    const nextEdges = [...(edgesRef.current || [])];
    const duplicateIndex = nextEdges.findIndex((edge) => edge.source === sourceId && edge.target === targetId);
    if (duplicateIndex >= 0) return;

    const nextEdge = {
      id: `${sourceId}-${targetId}`,
      source: sourceId,
      target: targetId,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#000' },
      type: currentEdgeTypeRef.current || 'straight',
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
  }, [connectDate, connectDateFormat, persistConnection]);

  const beginConnectSelection = useCallback((nodeId) => {
    if (!nodeId) return;
    if (!editMode || mode !== 'connect') return;

    if (!connectPendingId) {
      setConnectPendingId(nodeId);
      setSelectedNodeId(nodeId);
      return;
    }

    if (connectPendingId === nodeId) {
      setConnectPendingId(null);
      setSelectedNodeId(nodeId);
      return;
    }

    upsertOrToggleConnection(connectPendingId, nodeId);
    setConnectPendingId(null);
    setSelectedNodeId(nodeId);
  }, [connectPendingId, editMode, mode, upsertOrToggleConnection]);

  const handleConnectSelection = useCallback((nodeId) => {
    beginConnectSelection(nodeId);
  }, [beginConnectSelection]);

  const deleteSelectedNode = useCallback((overriddenId = selectedNodeId) => {
    const targetId = overriddenId || selectedNodeId;
    if (!targetId) return;
    const ok = window.confirm('¿Eliminar el elemento seleccionado?');
    if (!ok) return;

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
    writeDiagramState(nextState);

    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelectedNodeId(null);
    persistDistrictState(nextNodes, nextEdges);
    return true;
  }, [persistDistrictState, readDiagramState, selectedNodeId, writeDiagramState]);


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

    const copiedNodeData = ensureNodeData({
      id: uniqueId,
      type: sourceNode.type || 'tank',
      label: copyLabel,
      position: copyPosition,
      data: {
        ...sourceData,
        id: uniqueId,
        type: sourceNode.type || 'tank',
        customName: copyLabel,
        label: copyLabel,
        display_name: copyLabel,
        nombre: copyLabel,
        apiName: sourceData.apiName || sourceData.originalName || sourceData.tag || baseSourceName,
        originalName: sourceData.originalName || sourceData.apiName || sourceData.tag || baseSourceName,
        customColor: sourceData.customColor || sourceData.color || '',
        color: sourceData.color || sourceData.customColor || '',
      },
    });

    const nextNode = {
      id: uniqueId,
      type: sourceNode.type || 'tank',
      position: copyPosition,
      label: copyLabel,
      customName: copyLabel,
      data: {
        ...sourceData,
        id: uniqueId,
        type: sourceNode.type || 'tank',
        customName: copyLabel,
        label: copyLabel,
        display_name: copyLabel,
        nombre: copyLabel,
        customColor: sourceData.customColor || sourceData.color || '',
        color: sourceData.color || sourceData.customColor || '',
        nodeData: copiedNodeData,
        onSelect: (nodeId) => { setSelectedNodeId(nodeId); if (onNodeSelect) onNodeSelect(nodeId); },
        onMove: (nodeId, dx, dy) => moveNode(nodeId, dx, dy),
        onConnectNode: (nodeId) => handleConnectSelection(nodeId),
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
    setSelectedNodeId(uniqueId);
    if (onNodeSelect) onNodeSelect(uniqueId);
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
      label: baseName,
      data: {
        id,
        type: 'tank',
        label: baseName,
        customName: baseName,
        display_name: baseName,
        nombre: baseName,
        originalName: baseName,
        apiName: baseName,
        nodeData,
        onSelect: (nodeId) => { setSelectedNodeId(nodeId); if (onNodeSelect) onNodeSelect(nodeId); },
        onMove: (nodeId, dx, dy) => moveNode(nodeId, dx, dy),
        onConnectNode: (nodeId) => handleConnectSelection(nodeId),
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
      id, type: 'shape', position: safePosition, customName: baseName, label: baseName,
      data: {
        id, type: 'shape', label: baseName, customName: baseName,
        display_name: baseName, nombre: baseName, originalName: baseName, apiName: baseName,
        customColor: '#3b82f6', color: '#3b82f6', width, height, shapeType,
        nodeData, selected: true, pendingConnect: false,
        editMode, mode, deleteMode,
        onSelect: (nodeId) => { setSelectedNodeId(nodeId); if (onNodeSelect) onNodeSelect(nodeId); },
        onMove: (nodeId, dx, dy) => moveNode(nodeId, dx, dy),
        onConnectNode: (nodeId) => handleConnectSelection(nodeId),
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

  const deleteSelectedConnection = useCallback(() => {
    if (!selectedEdgeId) return;
    const ok = window.confirm('¿Eliminar la conexión seleccionada?');
    if (!ok) return;

    const next = (edgesRef.current || []).filter((edge) => edge.id !== selectedEdgeId);
    setEdges(next);
    edgesRef.current = next;
    setSelectedEdgeId(null);
    persistConnection(next);
  }, [persistConnection, selectedEdgeId]);

  const onEdgesDelete = useCallback((deleted) => {
    if (!deleted || !deleted.length) return;
    const ok = window.confirm('¿Eliminar la conexión seleccionada?');
    if (!ok) return;
    try {
      const before = nodesRef.current.map(n => ({ id: n.id, position: n.position }));
      pastRef.current.push({ nodes: Object.fromEntries(before.map(b => [b.id, b.position])), edges: edgesRef.current });
      futureRef.current = [];
      const ids = new Set(deleted.map(d => d.id));
      const next = (edgesRef.current || []).filter(e => !ids.has(e.id));
      setEdges(next);
      edgesRef.current = next;
      try {
        const saved = JSON.parse(localStorage.getItem('district_state') || '{}');
        saved.edges = next;
        saved.nodes = Object.fromEntries(nodesRef.current.map(n => [n.id, n.position]));
        localStorage.setItem('district_state', JSON.stringify(saved));
      } catch (e) {}
      setSelectedEdgeId(null);
    } catch (e) {}
  }, []);

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
    const ok = window.confirm('⚠️ ¿Reorganizar el diagrama automáticamente?\n\nEsta acción cambiará las posiciones de TODOS los nodos.\nSolo hazlo si realmente lo necesitas — se perderá tu disposición actual.');
    if (!ok) return;

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

    const updatedNodes = (currentNodes || []).map(n => ({ ...n, position: newPositions[n.id] || n.position || { x: 100, y: 100 } }));
    setNodes(updatedNodes);

    try {
      const saved = JSON.parse(localStorage.getItem('district_state') || '{}');
      const prevMap = saved.nodes && typeof saved.nodes === 'object' ? saved.nodes : {};
      saved.nodes = Object.fromEntries(updatedNodes.map((nn) => [nn.id, getPersistedNodeEntry(nn, prevMap[nn.id] || {})]));
      saved.edges = currentEdges;
      localStorage.setItem('district_state', JSON.stringify(saved));
    } catch (e) {}

    try { pastRef.current.push({ nodes: Object.fromEntries((currentNodes || []).map(n => [n.id, n.position])), edges: currentEdges }); futureRef.current = []; } catch (e) {}
  }, [getPersistedNodeEntry]);

  const doSave = useCallback(() => {
    try {
      const savedState = readDiagramState();
      // Limpiar campos temporales de resaltado de edges
      const cleanEdges = (edgesRef.current || []).map(e => {
        if (!e._originalStyle && !e._originalMarkerEnd) return e;
        const { _originalStyle, _originalMarkerEnd, ...clean } = e;
        return clean;
      });
      const saved = {
        ...savedState,
        nodes: Object.fromEntries((nodesRef.current || []).map(n => {
          const prev = savedState.nodes && savedState.nodes[n.id] && typeof savedState.nodes[n.id] === 'object' ? savedState.nodes[n.id] : {};
          return [n.id, getPersistedNodeEntry(n, prev)];
        })),
        edges: cleanEdges,
      };
      writeDiagramState(saved);
      // Toast no bloqueante — no usa alert() que congela JS
      setSaveMsg('ok');
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (e) {
      setSaveMsg('error');
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }, [getPersistedNodeEntry, readDiagramState, writeDiagramState]);

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
      nodesRef.current = next;
      persistDistrictState(next, edgesRef.current);
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
      const newNodes = (nodesRef.current || []).map(n => n.id === node.id ? { ...n, position: node.position } : n);
      setNodes(newNodes);
      persistDistrictState(newNodes, edgesRef.current);
    } catch (e) {}
  }, [persistDistrictState]);

  // Ref para detectar si el init ya corrió con estos mismos IDs de API (evita re-init en cada polling)
  const prevApiKeyRef = useRef(null);

  useEffect(() => {
    // Compara los IDs de nodos de API. Si son los mismos y el diagrama ya tiene nodos, no re-inicializar.
    const apiKey = (initialNodes || []).map(n => n.id).sort().join(',');
    if (prevApiKeyRef.current === apiKey && nodesRef.current.length > 0) {
      // Mismos nodos de API — solo actualiza los datos de valor en los nodos existentes (sin resetear posiciones)
      setNodes(nds => nds.map(n => {
        const freshApiNode = (initialNodes || []).find(x => x.id === n.id);
        if (!freshApiNode) return n;
        const freshData = ensureNodeData({ id: freshApiNode.id, type: freshApiNode.type, label: freshApiNode.label, position: freshApiNode.position, data: freshApiNode.data || freshApiNode });
        const currentNd = n.data?.nodeData || {};
        const currentCustomName = String((n.customName || currentNd.customName || currentNd.label || '') || '').trim();
        const preservedCustomName = currentCustomName || String((freshData.customName || '')).trim();
        const nextLabel = preservedCustomName || (freshData.label && String(freshData.label).trim()) || currentNd.label || n.label || freshApiNode.label || n.id;
        const nextPercent = freshData.porcentaje != null
          ? freshData.porcentaje
          : (freshData.valor_m != null && freshData.altura_rebose_calibrada != null
            ? calculateDisplayPorcentaje({ ...freshData, valor_m: freshData.valor_m, altura_rebose_calibrada: freshData.altura_rebose_calibrada })
            : currentNd.porcentaje ?? null);
        const merged = {
          ...currentNd,
          ...freshData,
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
          customName: preservedCustomName,
          label: nextLabel,
          data: {
            ...n.data,
            customName: preservedCustomName,
            label: nextLabel,
            nodeData: merged,
          },
        };
      }));
      return; // No re-inicializar el diagrama completo
    }
    prevApiKeyRef.current = apiKey;

    // prepare nodes/edges in format for layout
    try { console.debug('[DISTRICT DEBUG] initialNodes received:', (initialNodes || []).length); } catch (e) {}
    const sourceNodes = (initialNodes && initialNodes.length) ? initialNodes : STATIC_NODES.map(s => {
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

    // try to load saved state from localStorage
    const saved = readDiagramState();
    const hiddenIds = new Set(
      Array.isArray(saved?.hiddenNodeIds) ? saved.hiddenNodeIds : []
    );
    const deletedIds = new Set(
      Array.isArray(saved?.deletedNodeIds) ? saved.deletedNodeIds : []
    );
    try {
      if (saved && Array.isArray(saved.edges)) {
        const cleanedSavedEdges = saved.edges
          .filter(isValidSavedEdge)
          .map((edge) => normalizeSavedEdge(edge, {
            animated: showFlow,
            type: 'straight',
            markerEnd: { type: MarkerType.ArrowClosed, color: '#000' },
            style: { stroke: '#000', strokeWidth: 5, strokeLinecap: 'round' },
          }));
        if (cleanedSavedEdges.length !== saved.edges.length) {
          saved.edges = cleanedSavedEdges;
          try { localStorage.setItem('district_state', JSON.stringify(saved)); } catch (err) {}
        }
      }
    } catch (err) {}

    let rfNodes = n.filter(nd => !hiddenIds.has(nd.id) && !deletedIds.has(nd.id)).map(nd => ({ id: nd.id, type: nd.type, position: nd.position || null, data: nd.data }));
    const existingNodeIds = new Set(rfNodes.map((node) => node.id));
    for (const staticNode of STATIC_NODES) {
      if (deletedIds.has(staticNode.id) || hiddenIds.has(staticNode.id)) continue;
      if (!existingNodeIds.has(staticNode.id)) {
        rfNodes.push({
          id: staticNode.id,
          type: staticNode.type,
          position: staticNode.position || { x: 0, y: 0 },
          data: { display_name: staticNode.label, __placeholder: true },
        });
        existingNodeIds.add(staticNode.id);
      }
    }
    let rfEdges = e.filter(ed => !hiddenIds.has(ed.source) && !hiddenIds.has(ed.target) && !deletedIds.has(ed.source) && !deletedIds.has(ed.target)).map(ed => ({ id: ed.id, source: ed.source, target: ed.target, markerEnd: { type: MarkerType.ArrowClosed, color: '#000' }, animated: false, type: 'straight', label: ed.label, style: { stroke: '#000', strokeWidth: 3, strokeLinecap: 'round' } }));

    if (saved && saved.nodes) {
      const savedPos = saved.nodes || {};
      rfNodes = rfNodes.map(rn => {
        const savedEntry = savedPos[rn.id];
        const position = (savedEntry && typeof savedEntry === 'object') ? { x: savedEntry.x ?? rn.position?.x ?? 0, y: savedEntry.y ?? rn.position?.y ?? 0 } : (rn.position || { x: 0, y: 0 });
        const originalName = rn.data?.nodeData?.apiName || rn.data?.nodeData?.originalName || rn.data?.apiName || rn.data?.originalName || rn.data?.display_name || rn.data?.nombre || rn.data?.label || rn.label || rn.id;
        const customFromSaved = savedEntry && typeof savedEntry === 'object' ? (savedEntry.customName || savedEntry.displayName || savedEntry.diagramName || '') : '';
        const resolvedCustom = customFromSaved || getCustomNodeName({ data: rn.data, customName: rn.customName }) || '';
        const resolvedLabel = resolvedCustom || originalName || rn.id;
        return {
          ...rn,
          customName: resolvedCustom || rn.customName || '',
          label: resolvedLabel,
          position,
          data: {
            ...(rn.data || {}),
            customName: resolvedCustom || rn.data?.customName || '',
            label: resolvedLabel,
            originalName,
            nodeData: {
              ...((rn.data && rn.data.nodeData) || {}),
              customName: resolvedCustom || ((rn.data && rn.data.nodeData && rn.data.nodeData.customName) || ''),
              label: resolvedLabel,
              originalName,
              apiName: ((rn.data && rn.data.nodeData && rn.data.nodeData.apiName) || (rn.data && rn.data.apiName) || originalName),
              rotation: savedEntry && typeof savedEntry === 'object' && savedEntry.rotation != null ? toFiniteNumber(savedEntry.rotation, 0) : ((rn.data && rn.data.nodeData && rn.data.nodeData.rotation) || 0),
              width: savedEntry && typeof savedEntry === 'object' && savedEntry.width != null ? toFiniteNumber(savedEntry.width, null) : ((rn.data && rn.data.nodeData && rn.data.nodeData.width) || null),
              height: savedEntry && typeof savedEntry === 'object' && savedEntry.height != null ? toFiniteNumber(savedEntry.height, null) : ((rn.data && rn.data.nodeData && rn.data.nodeData.height) || null),
            },
          },
        };
      });

      const existingIds = new Set(rfNodes.map(rn => rn.id));
      Object.keys(savedPos).forEach((savedId) => {
        if (existingIds.has(savedId) || hiddenIds.has(savedId) || deletedIds.has(savedId)) return;
        const entry = savedPos[savedId];
        if (!entry || typeof entry !== 'object') return;
        // Descartar nodos shape con IDs auto-generados (residuos de Copilot).
        // Los nodos shape creados por el USUARIO tienen el mismo prefijo pero se
        // guardan con sus posiciones — los ignoramos solo si no tienen customName y son shapes.
        const isAutoGeneratedShape = entry.type === 'shape' && /^forma-\d+/.test(savedId) && !entry.customName;
        if (isAutoGeneratedShape) return;
        const label = entry.customName || entry.label || entry.originalName || entry.apiName || savedId;
        const nodeData = ensureNodeData({
          id: savedId,
          type: entry.type || 'tank',
          label,
          position: { x: entry.x ?? 0, y: entry.y ?? 0 },
          data: {
            ...entry,
            id: savedId,
            customName: entry.customName || '',
            label,
            apiName: entry.apiName || entry.originalName || label,
            originalName: entry.originalName || entry.apiName || label,
          },
        });
        rfNodes.push({
          id: savedId,
          type: entry.type || 'tank',
          position: { x: entry.x ?? 0, y: entry.y ?? 0 },
          customName: entry.customName || '',
          label,
          data: {
            customName: entry.customName || '',
            label,
            originalName: nodeData.originalName,
            apiName: nodeData.apiName,
            nodeData,
          },
        });
        existingIds.add(savedId);
      });


      if (saved.edges) {
        const nodeIds = new Set(rfNodes.map(n => n.id));
        rfEdges = saved.edges
          .filter(isValidSavedEdge)
          .map((ed) => {
            const cleaned = normalizeSavedEdge(ed, {
              animated: !!showFlow,
              type: 'straight',
              markerEnd: { type: MarkerType.ArrowClosed, color: '#000' },
              style: { stroke: '#000', strokeWidth: 5, strokeLinecap: 'round' },
            });
            // Usar el estilo guardado (puede ser personalizado). Solo poner defaults si falta.
            const savedStyle = cleaned.style || { stroke: '#000', strokeWidth: 5, strokeLinecap: 'round' };
            const savedMarker = cleaned.markerEnd || { type: MarkerType.ArrowClosed, color: savedStyle.stroke || '#000' };
            return {
              ...cleaned,
              label: cleaned.label || cleaned.name || '',
              animated: !!showFlow,
              style: { ...savedStyle, strokeLinecap: savedStyle.strokeLinecap || 'round' },
              markerEnd: savedMarker,
            };
          })
          .filter(e => e.source && e.target && nodeIds.has(e.source) && nodeIds.has(e.target) && !deletedIds.has(e.source) && !deletedIds.has(e.target));
      }
    } else {
      const nodesNeedingLayout = rfNodes.filter(x => !x.position || x.position.x == null || x.position.y == null);
      if (nodesNeedingLayout.length > 0) {
        const layouted = getLayoutedElements(rfNodes.map(r => ({ id: r.id, data: r.data, type: r.type })), rfEdges.map(e => ({ id: e.id, source: e.source, target: e.target })), 'TB');
        const layoutPosMap = Object.fromEntries(layouted.nodes.map(nl => [nl.id, nl.position]));
        rfNodes = rfNodes.map(rn => ({ ...rn, position: (rn.position && rn.position.x != null) ? rn.position : (layoutPosMap[rn.id] || { x: 100, y: 100 }) }));
      } else {
        rfNodes = rfNodes.map(rn => ({ ...rn, position: rn.position || { x: 100, y: 100 } }));
      }
      rfEdges = rfEdges.map(ed => ({ ...ed, animated: showFlow }));
    }

    const withControls = rfNodes.map(rn => {
      const outer = rn.data || {};
      const candidate = ensureNodeData({ id: rn.id, type: rn.type, label: rn.label, position: rn.position, data: outer.nodeData || outer });
      const nodeDataWithId = ensureNodeData({ id: rn.id, type: rn.type, label: rn.label, position: rn.position, data: candidate });
      return {
        ...rn,
        data: {
          ...outer,
          nodeData: nodeDataWithId,
        }
      };
    });
    setNodes(withControls);
    try { console.debug('[DISTRICT DEBUG] DistrictFlow rendered nodes count:', withControls.length); } catch (err) {}


    // ── Cargar edges guardadas ──
    // Siempre usar saved.edges si existen, independiente de si saved.nodes existe.
    let finalRfEdges = rfEdges; // edges de API por defecto
    if (saved && Array.isArray(saved.edges) && saved.edges.length > 0) {
      const nodeIds = new Set(rfNodes.map(n => n.id));
      const loadedEdges = saved.edges
        .filter(isValidSavedEdge)
        .map((ed) => {
          const copy = normalizeSavedEdge(ed, {
            animated: showFlow,
            type: 'straight',
            markerEnd: { type: MarkerType.ArrowClosed, color: '#000' },
            style: { stroke: '#000', strokeWidth: 5, strokeLinecap: 'round' },
          });
          if (copy.data && copy.data.date) {
            try { copy.label = formatDateLabel(copy.data.date, connectDateFormat || 'dd/MM/yyyy'); } catch (err) {}
          }
          // Preservar el estilo guardado personalizado — NO sobrescribir con negro fijo
          const savedStyle = copy.style || { stroke: '#000', strokeWidth: 5, strokeLinecap: 'round' };
          const savedMarker = copy.markerEnd || { type: MarkerType.ArrowClosed, color: savedStyle.stroke || '#000' };
          return {
            type: 'straight',
            ...copy,
            id: copy.id || `${copy.source}-${copy.target}`,
            animated: showFlow,
            style: { ...savedStyle, strokeLinecap: savedStyle.strokeLinecap || 'round' },
            markerEnd: savedMarker,
          };
        })
        .filter(e => e.source && e.target && nodeIds.has(e.source) && nodeIds.has(e.target) && !deletedIds.has(e.source) && !deletedIds.has(e.target));

      if (loadedEdges.length > 0) finalRfEdges = loadedEdges;
    }

    setEdges(finalRfEdges);
  // IMPORTANTE: NO incluir editMode/mode/deleteMode/callbacks ni showFlow ni connectDateFormat en deps.
  // Esos cambios no deben re-inicializar el diagrama completo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNodes, initialEdges, readDiagramState]);

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

  // Resaltar edge seleccionada en rojo para dar feedback visual — SIN destruir el estilo guardado
  useEffect(() => {
    setEdges((eds) => eds.map(e => {
      if (e.id === selectedEdgeId) {
        // Guardar el estilo original antes de resaltar (si no está ya guardado)
        const originalStyle = e._originalStyle || e.style || {};
        const originalMarker = e._originalMarkerEnd || e.markerEnd;
        return {
          ...e,
          _originalStyle: originalStyle,
          _originalMarkerEnd: originalMarker,
          style: { ...originalStyle, stroke: '#ef4444', strokeWidth: 6, strokeLinecap: 'round' },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' },
        };
      }
      // Restaurar estilo original si tenía uno guardado temporalmente
      if (e._originalStyle) {
        const { _originalStyle, _originalMarkerEnd, ...rest } = e;
        return {
          ...rest,
          style: _originalStyle,
          markerEnd: _originalMarkerEnd || { type: MarkerType.ArrowClosed, color: _originalStyle?.stroke || '#000' },
        };
      }
      return e;
    }));
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
            const vp = JSON.parse(saved);
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
    resizeSelectedNode,
    rotateSelectedNode,
    updateSelectedConnectionStyle,
    updateSelectedEdgeLabel,
    getSelectedNodeId: () => selectedNodeId,
    getSelectedEdgeId: () => selectedEdgeId,
    getShowFlow: () => showFlow,
    deleteSelectedConnection,
    setDefaultEdgeType: (type) => {
      currentEdgeTypeRef.current = type || 'straight';
      setCurrentEdgeType(type || 'straight');
    },
  }), [doAutoLayout, doSave, doRestoreInitial, doViewAll, doUndo, doRedo, toggleShowFlow, addDiagramNode, addShapeNode, changeSelectedNodeColor, duplicateSelectedNode, deleteSelectedNode, resizeSelectedNode, rotateSelectedNode, updateSelectedConnectionStyle, updateSelectedEdgeLabel, selectedNodeId, selectedEdgeId, showFlow, deleteSelectedConnection]);


  return (
    <div ref={containerRef} style={{ width: '100%', height: '72vh', position: 'relative' }}>
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
          try { localStorage.setItem('district_viewport', JSON.stringify(viewport)); } catch (e) {}
        }}
        connectionLineType="straight"
        connectionLineStyle={{ stroke: '#000', strokeWidth: 5 }}
        panOnScroll={false}
        zoomOnScroll={true}
        panOnDrag
        snapToGrid={false}
        nodesDraggable={true}
        nodesConnectable={editMode}
        connectOnClick={editMode}
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