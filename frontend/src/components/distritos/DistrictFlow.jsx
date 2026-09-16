import React, { useCallback, useEffect, useState, useRef, useImperativeHandle } from 'react';
import { format as formatDateFn } from 'date-fns';
import ReactFlow, { addEdge, Background, MarkerType, Handle, Position, BaseEdge, useStore, applyNodeChanges, applyEdgeChanges } from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import TankNode from './TankNode';
import tanqueService from '../../services/tanqueService';
import diagramService from '../../services/diagramService';
// Fallback import of persisted diagram for local dev verification when API is blocked by CORS
// authoritative diagram state must come from backend via diagramService.getState()
import { NODES as STATIC_NODES, CONNECTIONS as STATIC_CONNECTIONS } from './districtLayout';
import { calculateDisplayPorcentaje, mergeApiTanquesWithCatalog, loadCatalog } from '../../config/tankCatalog';
import ALTURAS_REBOSE_CALIBRADAS from '../../config/calibrations';
import { isValidSavedEdge, normalizeSavedEdge, normalizeSavedNodeCollection, normalizeSavedNodeMap } from './edgeUtils';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 160;
const nodeHeight = 80;


// ── Métricas dinámicas del diagrama ───────────────────────────────────────────
// Se reutiliza una sola consulta a /ptap para todos los elementos dinámicos.
// No se crean ni mueven nodos: el dato se pinta sobre las formas ya existentes.
const MACKENFLOC_SHAPE_TAGS = {
  // Exact live yellow coagulant shapes currently in the saved district state.
  'forma-1788988197049-fa9rk': 'PTAP_CAPACIDAD_MACKENFLOC_P1_T1',
  'forma-1788988196209-8q5qg': 'PTAP_CAPACIDAD_MACKENFLOC_P1_T2',
  'forma-1788988225120-3ngxj': 'PTAP_CAPACIDAD_MACKENFLOC_P1_T3',
  'forma-1789071196821-bz4z5': 'PTAP_CAPACIDAD_MACKENFLOC_P2_T1',
  'forma-1789071199125-uo8wb': 'PTAP_CAPACIDAD_MACKENFLOC_P2_T2',
};

const PTAP_TAG_ALIASES = {
  PTAP_CAPACIDAD_MACKENFLOC_P1_T1: ['PTAP_CAPACIDAD_MACKENFLOC_P1_T1'],
  PTAP_CAPACIDAD_MACKENFLOC_P1_T2: ['PTAP_CAPACIDAD_MACKENFLOC_P1_T2'],
  PTAP_CAPACIDAD_MACKENFLOC_P1_T3: ['PTAP_CAPACIDAD_MACKENFLOC_P1_T3'],
  PTAP_CAPACIDAD_MACKENFLOC_P2_T1: ['PTAP_CAPACIDAD_MACKENFLOC_P2_T1'],
  PTAP_CAPACIDAD_MACKENFLOC_P2_T2: ['PTAP_CAPACIDAD_MACKENFLOC_P2_T2'],
  PTAP_CAUDAL_PARSHALL: ['PTAP_CAUDAL_PARSHALL'],
  PTAP_CAUDAL_CREAGER: ['PTAP_CAUDAL_CREAGER'],
  PTAP_CAUDAL_CHEMBE_ENTRADA: ['PTAP_CAUDAL_CHEMBE_ENTRADA', 'PTAP_CAUDAL_CHEMBE_SALIDA'],
  PTAP_CAUDAL_CHEMBE_SALIDA: ['PTAP_CAUDAL_CHEMBE_SALIDA', 'PTAP_CAUDAL_CHEMBE_ENTRADA'],
};

const EXACT_TANK_TAG_BY_NODE_ID = {
  'tanque-belen-aurora': 'NIVEL_AURORA',
  'tanque-la-15': 'NIVEL_LA_15',
  'tanque-la-29': 'NIVEL_LA_29',
  'tanque-la-30': 'NIVEL_LA_30',
  'tanque-zona-industrial': 'NIVEL_DE_ZONA_INDUSTRIAL',
  'tanque-calucaima': 'NIVEL_CALUCAIMA',
  'tanque-miramar': 'NIVEL_MIRAMAR',
};

const OPERATIONAL_SHAPE_TAGS = {
  'forma-1788988194305-qxr6j': 'PTAP_CAUDAL_CREAGER',
  'forma-1788988197857-hiv9w': 'PTAP_CAUDAL_PARSHALL',
};

// Additional operational mappings for shapes that represent PTAP intake points
OPERATIONAL_SHAPE_TAGS['forma-1789388430360-lhtei'] = 'PTAP_CAUDAL_ENTRADA_24'; // COMBEIMA 1
OPERATIONAL_SHAPE_TAGS['forma-1788988209832-lango'] = 'PTAP_CAUDAL_ENTRADA_27'; // COMBEIMA 2
OPERATIONAL_SHAPE_TAGS['forma-1788988222632-8qpng'] = 'PTAP_CAUDAL_VALVULA_VRP'; // RETROLAVADO (fallback)
OPERATIONAL_SHAPE_TAGS['forma-1789073487871-bxwfy'] = 'PTAP_CAUDAL_CHEMBE_ENTRADA'; // CHEMBE (explicit PTAP tag)

const MACKENFLOC_LABEL_TAGS = {
  'MACKENFLOC P1 T1': 'PTAP_CAPACIDAD_MACKENFLOC_P1_T1',
  'MACKENFLOC P1 T2': 'PTAP_CAPACIDAD_MACKENFLOC_P1_T2',
  'MACKENFLOC P1 T3': 'PTAP_CAPACIDAD_MACKENFLOC_P1_T3',
  'MACKENFLOC P2 T1': 'PTAP_CAPACIDAD_MACKENFLOC_P2_T1',
  'MACKENFLOC P2 T2': 'PTAP_CAPACIDAD_MACKENFLOC_P2_T2',
  'P1 T1': 'PTAP_CAPACIDAD_MACKENFLOC_P1_T1',
  'P1 T2': 'PTAP_CAPACIDAD_MACKENFLOC_P1_T2',
  'P1 T3': 'PTAP_CAPACIDAD_MACKENFLOC_P1_T3',
  'P2 T1': 'PTAP_CAPACIDAD_MACKENFLOC_P2_T1',
  'P2 T2': 'PTAP_CAPACIDAD_MACKENFLOC_P2_T2',
};

const OPERATIONAL_LABEL_TAGS = {
  'PARSHALL': 'PTAP_CAUDAL_PARSHALL',
  'CREAGUER': 'PTAP_CAUDAL_CREAGER',
  'CREAGER': 'PTAP_CAUDAL_CREAGER',
};

const MACKENFLOC_ID_TO_LABEL = {
  'forma-1788988197049-fa9rk': 'MACKENFLOC P1 T1',
  'forma-1788988196209-8q5qg': 'MACKENFLOC P1 T2',
  'forma-1788988225120-3ngxj': 'MACKENFLOC P1 T3',
  'forma-1789071196821-bz4z5': 'MACKENFLOC P2 T1',
  'forma-1789071199125-uo8wb': 'MACKENFLOC P2 T2',
};

const STABLE_SHAPE_NAME_BY_ID = {
  ...MACKENFLOC_ID_TO_LABEL,
  'forma-1788988209832-lango': 'COMBEIMA 2',
  'forma-1789388430360-lhtei': 'COMBEIMA 1',
  'forma-1788988205128-xhpu4': 'COCORA',
  'forma-1788988222632-8qpng': 'RETROLAVADO',
  'forma-1789073487871-bxwfy': 'CHEMBE',
  'forma-1788988197857-hiv9w': 'PARSHALL',
  'forma-1788988194305-qxr6j': 'CREAGER',
  'forma-1788988225880-frv4k': 'BOMBEO',
};

function normalizeMetricLabelKey(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeComparableText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildComparableAliases(value) {
  const aliases = new Set();
  const raw = String(value || '').trim();
  if (!raw) return aliases;

  const normalized = normalizeComparableText(raw);
  if (!normalized) return aliases;

  aliases.add(normalized);

  const words = normalized.split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i += 1) {
    for (let j = i + 1; j <= words.length; j += 1) {
      const chunk = words.slice(i, j).join(' ');
      if (chunk) aliases.add(chunk);
    }
  }

  for (const alias of [...aliases]) {
    const stripped = alias.replace(/^(nivel|nive|de|del|la|el|los|las)\s+/i, '').trim();
    if (stripped && stripped !== alias) aliases.add(stripped);
  }

  return aliases;
}

function textMatchesComparableAlias(sourceValue, targetValue) {
  const sourceAliases = buildComparableAliases(sourceValue);
  const targetAliases = buildComparableAliases(targetValue);

  for (const sourceAlias of sourceAliases) {
    for (const targetAlias of targetAliases) {
      if (!sourceAlias || !targetAlias) continue;
      if (sourceAlias === targetAlias || sourceAlias.includes(targetAlias) || targetAlias.includes(sourceAlias)) {
        return true;
      }
    }
  }

  return false;
}

function getStableRuntimeShapeName(nodeData = {}) {
  const safeNodeData = nodeData && typeof nodeData === 'object' ? nodeData : {};
  const rawNodeId = String(safeNodeData.id || '').trim();
  if (rawNodeId && STABLE_SHAPE_NAME_BY_ID[rawNodeId]) return STABLE_SHAPE_NAME_BY_ID[rawNodeId];
  const fallback = [safeNodeData.customName, safeNodeData.label, safeNodeData.display_name, safeNodeData.nombre, safeNodeData.apiName, safeNodeData.originalName]
    .filter((value) => value != null && String(value).trim())
    .map((value) => String(value).trim())
    .find(Boolean);
  return fallback || 'Texto / Forma';
}

function getExactMackenflocTagForNode(node, fallbackNodeData = {}, metricMap = null) {
  const rawNodeId = node?.id ? String(node.id) : '';
  if (rawNodeId && MACKENFLOC_SHAPE_TAGS[rawNodeId]) {
    return MACKENFLOC_SHAPE_TAGS[rawNodeId];
  }
  if (rawNodeId && OPERATIONAL_SHAPE_TAGS[rawNodeId]) {
    return OPERATIONAL_SHAPE_TAGS[rawNodeId];
  }

  const source = fallbackNodeData && typeof fallbackNodeData === 'object' ? fallbackNodeData : {};
  const label = [source.label, source.display_name, source.nombre, source.customName, source.apiName, source.originalName, node?.label]
    .filter((value) => value != null && String(value).trim())
    .map((value) => String(value).trim())
  ;

  const labelText = label.join(' ');

  if (!labelText) return null;
  const normalized = normalizeMetricLabelKey(labelText);
  for (const [tag, candidateAliases] of Object.entries(PTAP_TAG_ALIASES)) {
    if (!candidateAliases || !candidateAliases.length) continue;
    for (const alias of candidateAliases) {
      if (!alias) continue;
      const aliasText = alias.replace(/^PTAP_/, '').replace(/_/g, ' ');
      const tagText = tag.replace(/^PTAP_/, '').replace(/_/g, ' ');
      if (normalized.includes(tagText) || normalized.includes(aliasText) || tagText.includes(normalized) || aliasText.includes(normalized)) {
        if (metricMap && Object.prototype.hasOwnProperty.call(metricMap, tag)) return tag;
      }
    }
  }

  const directByName = Object.keys(metricMap || {}).find((tag) => {
    if (!tag || !labelText) return false;
    const labelKey = normalizeMetricLabelKey(labelText);
    const tagKey = normalizeMetricLabelKey(tag);
    return tagKey.includes(labelKey) || labelKey.includes(tagKey);
  });

  if (directByName) return directByName;
  return null;
}

function resolveLivePtapTagForNode(node, metricMap = null, preferredTag = null) {
  const nodeData = (node && node.data && node.data.nodeData) ? node.data.nodeData : (node && node.data ? node.data : {});
  const rawNodeId = (node && node.id) ? String(node.id) : (nodeData && nodeData.id ? String(nodeData.id) : '');

  if (preferredTag && metricMap && Object.prototype.hasOwnProperty.call(metricMap, preferredTag)) {
    return preferredTag;
  }

  if (rawNodeId && MACKENFLOC_SHAPE_TAGS[rawNodeId]) {
    return MACKENFLOC_SHAPE_TAGS[rawNodeId];
  }
  if (rawNodeId && OPERATIONAL_SHAPE_TAGS[rawNodeId]) {
    return OPERATIONAL_SHAPE_TAGS[rawNodeId];
  }

  const labels = [
    nodeData?.label,
    nodeData?.display_name,
    nodeData?.nombre,
    nodeData?.customName,
    nodeData?.apiName,
    nodeData?.originalName,
    node?.label,
    rawNodeId,
  ].filter((value) => value != null && String(value).trim()).map((value) => String(value).trim());

  const combinedLabel = labels.join(' ');
  if (combinedLabel) {
    const normalizedLabel = normalizeMetricLabelKey(combinedLabel);
    const directByLabel = Object.keys(metricMap || {}).find((tag) => {
      const tagKey = normalizeMetricLabelKey(tag);
      return tagKey.includes(normalizedLabel) || normalizedLabel.includes(tagKey);
    });
    if (directByLabel) return directByLabel;

    const explicitLabelMap = { ...MACKENFLOC_LABEL_TAGS, ...OPERATIONAL_LABEL_TAGS };
    for (const [labelKey, tag] of Object.entries(explicitLabelMap)) {
      const labelNorm = normalizeMetricLabelKey(labelKey);
      if (labelNorm && (normalizedLabel.includes(labelNorm) || labelNorm.includes(normalizedLabel))) {
        return tag;
      }
    }
  }

  const fromAliases = Object.entries(PTAP_TAG_ALIASES).find(([tag, aliases]) => {
    if (!aliases || !aliases.length) return false;
    const labelNorm = normalizeMetricLabelKey(combinedLabel || '');
    const anyMatch = aliases.some((alias) => {
      const aliasText = normalizeMetricLabelKey(alias || '');
      return !!labelNorm && !!aliasText && (labelNorm.includes(aliasText) || aliasText.includes(labelNorm));
    });
    return anyMatch && metricMap && Object.prototype.hasOwnProperty.call(metricMap, tag);
  });

  if (fromAliases) return fromAliases[0];

  return preferredTag || null;
}

function findMetricVariableForNode(node, metricMap) {
  if (!node || !metricMap) return { tag: null, variable: null };

  const nodeData = node?.data?.nodeData || node?.data || {};
  const directTag = getExactMackenflocTagForNode(node, nodeData, metricMap) || OPERATIONAL_SHAPE_TAGS[node?.id || nodeData?.id || ''] || null;
  const candidates = [];

  if (directTag) candidates.push(directTag);
  if (node?.id) candidates.push(String(node.id));
  if (nodeData?.id) candidates.push(String(nodeData.id));
  if (nodeData?.tag) candidates.push(String(nodeData.tag));
  if (nodeData?.apiName) candidates.push(String(nodeData.apiName));
  if (nodeData?.originalName) candidates.push(String(nodeData.originalName));
  if (nodeData?.display_name) candidates.push(String(nodeData.display_name));
  if (nodeData?.nombre) candidates.push(String(nodeData.nombre));
  if (nodeData?.label) candidates.push(String(nodeData.label));
  if (nodeData?.customName) candidates.push(String(nodeData.customName));

  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate) continue;
    const trimmed = String(candidate).trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    if (Object.prototype.hasOwnProperty.call(metricMap, trimmed)) {
      return { tag: trimmed, variable: metricMap[trimmed] };
    }
  }

  const labelText = candidates
    .filter((value) => value && String(value).trim())
    .map((value) => String(value).trim())
    .join(' ');

  if (!labelText) return { tag: null, variable: null };

  const matchedTag = resolveLivePtapTagForNode(node, metricMap, directTag);
  if (matchedTag && metricMap[matchedTag]) {
    return { tag: matchedTag, variable: metricMap[matchedTag] };
  }

  const normalizedLabel = normalizeMetricLabelKey(labelText);
  const exactAlias = Object.keys(metricMap).find((tag) => {
    const tagKey = normalizeMetricLabelKey(tag);
    return tagKey.includes(normalizedLabel) || normalizedLabel.includes(tagKey);
  });

  if (exactAlias) {
    return { tag: exactAlias, variable: metricMap[exactAlias] };
  }

  return { tag: null, variable: null };
}

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
  // Pintar primero el último PTAP conocido para que Mackenfloc/caudales aparezcan
  // al mismo tiempo que los tanques durante una recarga.
  try {
    const cached = tanqueService.peekPtap?.();
    if (cached) {
      const cachedMap = {};
      for (const variable of (cached?.variables || [])) {
        if (variable?.tag) cachedMap[variable.tag] = variable;
      }
      if (Object.keys(cachedMap).length) _notifyPtapMetrics(cachedMap);
    }
  } catch (e) {}

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

  const clean = String(value).trim().replace(/\s+/g, '');
  if (!clean) return null;

  // Accept both US (1,234.56) and EU (1.234,56 / 688,8125) formats.
  const sign = clean.startsWith('-') ? '-' : '';
  const unsigned = sign ? clean.slice(1) : clean;

  if (!/^[0-9.,+-]+$/.test(unsigned)) {
    const numeric = Number(clean);
    return Number.isFinite(numeric) ? numeric : null;
  }

  const hasComma = unsigned.includes(',');
  const hasDot = unsigned.includes('.');

  if (!hasComma && !hasDot) {
    const numeric = Number(unsigned);
    return Number.isFinite(numeric) ? (sign ? -numeric : numeric) : null;
  }

  if (hasComma && hasDot) {
    const lastComma = unsigned.lastIndexOf(',');
    const lastDot = unsigned.lastIndexOf('.');
    const decimalIndex = Math.max(lastComma, lastDot);
    const decimalSeparator = decimalIndex === lastComma ? ',' : '.';
    const integerPart = unsigned.slice(0, decimalIndex).replace(/[.,]/g, '');
    const decimalPart = unsigned.slice(decimalIndex + 1).replace(/[.,]/g, '');
    const normalized = decimalPart ? `${integerPart}.${decimalPart}` : integerPart;
    const parsed = Number(`${sign}${normalized}`);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (hasComma) {
    const decimalIndex = unsigned.lastIndexOf(',');
    const integerPart = unsigned.slice(0, decimalIndex).replace(/\./g, '').replace(/,/g, '');
    const decimalPart = unsigned.slice(decimalIndex + 1).replace(/,/g, '');
    const normalized = decimalPart ? `${integerPart}.${decimalPart}` : integerPart;
    const parsed = Number(`${sign}${normalized}`);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const decimalIndex = unsigned.lastIndexOf('.');
  const integerPart = unsigned.slice(0, decimalIndex).replace(/,/g, '');
  const decimalPart = unsigned.slice(decimalIndex + 1).replace(/,/g, '');
  const normalized = decimalPart ? `${integerPart}.${decimalPart}` : integerPart;
  const parsed = Number(`${sign}${normalized}`);
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

function stripRuntimeTelemetry(data = {}) {
  const source = data && typeof data === 'object' ? data : {};
  const cleaned = { ...source };
  const telemetryKeys = [
    'ptapMetricText', 'ptapMetricLabel', 'ptapMetricAbove', 'ptapMetricRaw',
    'metricText', 'metricLabel', 'metricAbove', 'metricRaw',
  ];
  for (const key of telemetryKeys) {
    if (Object.prototype.hasOwnProperty.call(cleaned, key)) {
      delete cleaned[key];
    }
  }
  return cleaned;
}

function preserveLiveMetricValues(current = {}, incoming = {}) {
  const currentData = stripRuntimeTelemetry(current && typeof current === 'object' ? current : {});
  const incomingData = stripRuntimeTelemetry(incoming && typeof incoming === 'object' ? incoming : {});
  const merged = { ...currentData, ...incomingData };
  const metricKeys = [
    'valor_m', 'nivel', 'porcentaje', 'porcentaje_capacidad', 'porcentaje_api',
    'capacidad_actual_m3', 'capacidad_maxima_m3', 'volumen_restante_m3',
    'altura_rebose', 'altura_rebose_calibrada', 'altura_rebose_m',
    'manual_porcentaje', 'manual_rebose_override', 'tag', 'display_name', 'nombre', 'color', 'customColor'
  ];

  for (const key of metricKeys) {
    if (incomingData[key] == null || incomingData[key] === '' || incomingData[key] === 'null') {
      if (currentData[key] != null && currentData[key] !== '' && currentData[key] !== 'null') {
        merged[key] = currentData[key];
      }
    }
  }

  const isPositiveFinite = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
  const keepCurrentSizeIfAutoFallback = (key) => {
    const currentValue = currentData[key];
    const incomingValue = incomingData[key];
    if (!isPositiveFinite(currentValue) || !isPositiveFinite(incomingValue)) return;
    const currentNum = Number(currentValue);
    const incomingNum = Number(incomingValue);
    const autoFallback = key === 'width' ? 120 : 68;
    const isLikelyAutoRehydration = incomingNum <= autoFallback && currentNum > autoFallback;
    if (isLikelyAutoRehydration) {
      merged[key] = currentNum;
    }
  };

  keepCurrentSizeIfAutoFallback('width');
  keepCurrentSizeIfAutoFallback('height');

  if ((incomingData.customName == null || incomingData.customName === '') && (currentData.customName != null && currentData.customName !== '')) {
    merged.customName = currentData.customName;
  }
  if ((incomingData.label == null || incomingData.label === '') && (currentData.label != null && currentData.label !== '')) {
    merged.label = currentData.label;
  }
  return merged;
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
    // manual override fields (persist minimal config only)
    manual_porcentaje: (source.manual_porcentaje != null) ? source.manual_porcentaje : null,
    manual_rebose_override: (source.manual_rebose_override != null) ? source.manual_rebose_override : null,
    tag: source.tag ?? null,
    display_name: source.display_name ?? source.nombre ?? source.label ?? null,
  };
}

const HISTORY_RUNTIME_KEYS = new Set([
  'valor_m', 'nivel', 'porcentaje', 'porcentaje_capacidad', 'porcentaje_api',
  'capacidad_actual_m3', 'capacidad_maxima_m3', 'volumen_restante_m3',
  'altura_rebose', 'altura_rebose_calibrada', 'altura_rebose_m',
  'manual_porcentaje', 'manual_rebose_override', 'tag', 'display_name', 'nombre', 'apiName', 'originalName',
  'fecha_hora', 'ptapMetricText', 'ptapMetricLabel', 'ptapMetricAbove', 'ptapMetricRaw',
  'metricText', 'metricLabel', 'metricAbove', 'metricRaw', 'updated_at', '_updatedAt', 'updatedAt'
]);

function stripHistoryRuntimeFields(entry = {}) {
  const copy = { ...(entry && typeof entry === 'object' ? entry : {}) };
  for (const key of HISTORY_RUNTIME_KEYS) {
    if (Object.prototype.hasOwnProperty.call(copy, key)) delete copy[key];
  }
  return copy;
}

function buildDesignHistorySnapshot(state = {}) {
  const source = state && typeof state === 'object' ? state : {};
  const rawNodes = source.nodes && typeof source.nodes === 'object' ? source.nodes : {};
  const nodes = {};
  for (const [id, entry] of Object.entries(rawNodes)) {
    const cleaned = stripHistoryRuntimeFields(sanitizePersistedNodeVisual(entry || {}));
    nodes[id] = {
      ...cleaned,
      id: String(id),
      x: Number.isFinite(Number(cleaned.x)) ? Number(cleaned.x) : 0,
      y: Number.isFinite(Number(cleaned.y)) ? Number(cleaned.y) : 0,
      width: Number.isFinite(Number(cleaned.width)) ? Number(cleaned.width) : null,
      height: Number.isFinite(Number(cleaned.height)) ? Number(cleaned.height) : null,
      rotation: Number.isFinite(Number(cleaned.rotation)) ? Number(cleaned.rotation) : 0,
      label: String(cleaned.label || id || 'Sin nombre'),
    };
  }
  const edges = Array.isArray(source.edges)
    ? source.edges.map((edge) => {
        const safe = edge && typeof edge === 'object' ? { ...edge } : {};
        if (safe.data && typeof safe.data === 'object') {
          const nextData = { ...safe.data };
          for (const key of HISTORY_RUNTIME_KEYS) delete nextData[key];
          safe.data = nextData;
        }
        return safe;
      })
    : [];
  return { nodes, edges };
}

function snapshotDesignEquals(a = {}, b = {}) {
  try {
    return JSON.stringify(buildDesignHistorySnapshot(a)) === JSON.stringify(buildDesignHistorySnapshot(b));
  } catch (e) {
    return false;
  }
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
  'ptap-chembe': { service: 'ptap', tag: 'PTAP_CAUDAL_CHEMBE_ENTRADA', defaultUnit: 'L/s' },
  'ptap-pola-1': { service: 'ptap', tag: 'PTAP_CAUDAL_ENTRADA_24', defaultUnit: 'L/s' },
  'ptap-pola-2': { service: 'ptap', tag: 'PTAP_CAUDAL_ENTRADA_27', defaultUnit: 'L/s' },
};

function getMetricConfigForNodeId(nodeId) {
  const key = String(nodeId || '').trim();
  if (!key) return null;

  const direct = FLOW_METRIC_CONFIG[key];
  if (direct) return direct;

  const mackenTag = MACKENFLOC_SHAPE_TAGS[key];
  if (mackenTag) {
    return { service: 'ptap', tag: mackenTag, defaultUnit: 'm³' };
  }

  const operationalTag = OPERATIONAL_SHAPE_TAGS[key];
  if (operationalTag) {
    return { service: 'ptap', tag: operationalTag, defaultUnit: 'L/s' };
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

function getCachedFlowMetricForNodeId(nodeId) {
  const config = getMetricConfigForNodeId(nodeId);
  if (!config) return null;

  try {
    const response = config.service === 'ptap'
      ? tanqueService.peekPtap?.()
      : tanqueService.peekCaptacion?.();
    const variables = (response && response.variables) || [];
    const variable = variables.find((item) => item && item.tag === config.tag);
    return variable ? formatFlowMetricVariable(variable, config.defaultUnit) : null;
  } catch (error) {
    return null;
  }
}

function normalizeCalibrationKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
    source.id,
  ].filter(Boolean);

  const calibrationEntries = Object.entries(ALTURAS_REBOSE_CALIBRADAS || {});
  for (const candidate of candidates) {
    const normalized = normalizeCalibrationKey(candidate);
    if (!normalized) continue;

    for (const [label, value] of calibrationEntries) {
      const key = normalizeCalibrationKey(label);
      if (!key) continue;
      if (normalized === key || normalized.includes(key) || key.includes(normalized)) {
        const numeric = Number(value);
        if (Number.isFinite(numeric) && numeric > 0) return numeric;
      }
    }
  }

  return null;
}

function enrichTankNodeMetrics(data = {}) {
  const source = { ...(data || {}) };
  const nivel = source.valor_m ?? source.nivel ?? source.valor ?? source.level ?? source.level_m ?? null;
  const nivelNumber = Number.isFinite(Number(nivel)) ? Number(nivel) : null;

  // Prefer explicit calibrated height fields when present so each tanque uses
  // its own catalog calibration rather than a generic fallback.
  const calibratedFallbackHeight = getCalibratedReboseHeight(source);
  const resolvedHeight = source.altura_rebose_calibrada ?? source.altura_rebose ?? source.altura_rebose_m ?? source.alturaRebose ?? calibratedFallbackHeight ?? null;
  const heightNumber = resolvedHeight != null && Number.isFinite(Number(resolvedHeight)) ? Number(resolvedHeight) : null;

  const usableExplicitValue = (value) => {
    if (value === null || value === undefined || value === '') return false;
    return Number.isFinite(Number(value));
  };

  const ibalPct = usableExplicitValue(source.porcentaje_capacidad) ? Number(source.porcentaje_capacidad)
    : (usableExplicitValue(source.porcentaje_api) ? Number(source.porcentaje_api)
      : (usableExplicitValue(source.porcentaje) ? Number(source.porcentaje) : null));

  const manualPct = Number.isFinite(Number(source.manual_porcentaje)) ? Number(source.manual_porcentaje)
    : (Number.isFinite(Number(source.manualPorcentaje)) ? Number(source.manualPorcentaje) : null);
  const normalizedManualPct = manualPct;
  const manualRebose = Number.isFinite(Number(source.manual_rebose_override)) ? Number(source.manual_rebose_override)
    : (Number.isFinite(Number(source.manualReboseOverride)) ? Number(source.manualReboseOverride) : null);

  const isBadQuality = source.calidad === 'DUDOSA' || source.sin_datos === true;
  const hasExplicitPercentage = ibalPct != null || normalizedManualPct != null;
  let percentage = null;
  if (normalizedManualPct != null) {
    percentage = normalizedManualPct;
  } else if (ibalPct != null) {
    percentage = ibalPct;
  } else if (!isBadQuality || hasExplicitPercentage) {
    // The API can still carry a valid percentage even when the quality is marked as DUDOSA.
    // Only suppress automatic math when the source is actually missing the required values.
    if (nivelNumber != null && heightNumber != null && heightNumber > 0) {
      try {
        const computed = calculateDisplayPorcentaje(nivelNumber, heightNumber);
        if (computed != null) percentage = computed;
      } catch (e) { /* ignore compute errors */ }
    }
  }

  const finalNivel = nivelNumber ?? (source.valor_m != null ? Number(source.valor_m) : null);
  const finalPercentage = percentage ?? (usableExplicitValue(source.porcentaje) ? Number(source.porcentaje) : null);

  return {
    ...source,
    valor_m: finalNivel,
    nivel: finalNivel,
    porcentaje: finalPercentage,
    porcentaje_capacidad: finalPercentage ?? source.porcentaje_capacidad ?? null,
    altura_rebose: heightNumber ?? source.altura_rebose ?? source.altura_rebose_m ?? null,
    altura_rebose_calibrada: heightNumber ?? source.altura_rebose_calibrada ?? source.altura_rebose_m ?? null,
    manual_porcentaje: manualPct ?? source.manual_porcentaje ?? null,
    manual_rebose_override: manualRebose ?? source.manual_rebose_override ?? null,
    customColor: source.customColor || source.color || '',
    shapeType: source.shapeType || 'box',
    position: sanitizePosition(source.position || {}),
    rotation: Number.isFinite(Number(source.rotation)) ? Number(source.rotation) : 0,
    label: source.label || source.display_name || source.nombre || source.apiName || source.originalName || source.tag || 'Sin nombre',
  };
}

function mergeTelemetryPreservingVisual(current = {}, telemetry = {}, nodeType = null) {
  const currentData = current && typeof current === 'object' ? current : {};
  const telemetryData = telemetry && typeof telemetry === 'object' ? telemetry : {};
  const merged = { ...currentData, ...telemetryData };

  const visualKeys = ['type', 'shapeType', 'width', 'height', 'rotation', 'customColor', 'color', 'lockedPosition'];
  for (const key of visualKeys) {
    if (currentData[key] !== undefined && currentData[key] !== null && currentData[key] !== '') {
      merged[key] = currentData[key];
    }
  }
  if (nodeType && (!merged.type || merged.type === 'tank')) {
    merged.type = currentData.type || nodeType;
  }
  return merged;
}

function getCachedTankTelemetryForNode(nodeId, nodeData = {}) {
  try {
    const response = tanqueService.peekTanques?.();
    const list = Array.isArray(response?.tanques) ? response.tanques : [];
    if (!list.length) return null;

    const idKey = String(nodeId || nodeData?.id || '').trim();
    const explicitTag = EXACT_TANK_TAG_BY_NODE_ID[idKey] || nodeData?.tag || null;
    let found = null;

    if (explicitTag) {
      const wanted = String(explicitTag).trim().toUpperCase();
      found = list.find((tank) => String(tank?.tag || '').trim().toUpperCase() === wanted) || null;
    }

    if (!found) {
      const candidates = [
        nodeData?.apiName,
        nodeData?.originalName,
        nodeData?.tag,
        nodeData?.display_name,
        nodeData?.nombre,
        nodeData?.label,
        idKey,
      ].filter((value) => value != null && String(value).trim());

      found = list.find((tank) => {
        const tankCandidates = [tank?.tag, tank?.nombre, tank?.display_name, tank?.id]
          .filter((value) => value != null && String(value).trim());
        return candidates.some((candidate) => tankCandidates.some((tankValue) =>
          textMatchesComparableAlias(candidate, tankValue)
        ));
      }) || null;
    }

    if (!found) return null;
    const merged = (mergeApiTanquesWithCatalog([found], loadCatalog()) || [found])[0] || found;
    return enrichTankNodeMetrics(merged || {});
  } catch (e) {
    return null;
  }
}

function normalizeDiagramNodeEntries(rawNodes) {
  if (Array.isArray(rawNodes)) return rawNodes.filter((entry) => entry && typeof entry === 'object');
  if (rawNodes && typeof rawNodes === 'object') return Object.values(rawNodes).filter((entry) => entry && typeof entry === 'object');
  return [];
}

function normalizeDiagramEdgeEntries(rawEdges) {
  if (Array.isArray(rawEdges)) return rawEdges.filter((edge) => edge && typeof edge === 'object');
  if (rawEdges && typeof rawEdges === 'object') return Object.values(rawEdges).filter((edge) => edge && typeof edge === 'object');
  return [];
}

function ensureNodeData({ id, type = 'tank', label = '', position = {}, data = {} } = {}) {
  const source = data && typeof data === 'object' ? { ...data } : {};
  const nodeId = id ?? source.id ?? label ?? 'node';
  const nodeLabel = typeof label === 'string' && label.trim() ? label : (typeof source.label === 'string' ? source.label : nodeId);
  const normalizedPosition = sanitizePosition(position || source.position || {});
  const normalized = {
    ...source,
    id: nodeId,
    type: type || source.type || 'tank',
    label: nodeLabel,
    customName: source.customName || source.diagramName || source.displayName || '',
    display_name: source.display_name ?? source.nombre ?? nodeLabel,
    nombre: source.nombre ?? source.display_name ?? nodeLabel,
    apiName: source.apiName || source.originalName || source.tag || nodeLabel,
    originalName: source.originalName || source.apiName || source.tag || nodeLabel,
    tag: source.tag ?? source.id ?? nodeId,
    width: Number.isFinite(Number(source.width)) ? Number(source.width) : null,
    height: Number.isFinite(Number(source.height)) ? Number(source.height) : null,
    rotation: Number.isFinite(Number(source.rotation)) ? Number(source.rotation) : 0,
    customColor: source.customColor || source.color || '',
    color: source.color || source.customColor || '',
    shapeType: source.shapeType || 'box',
    position: normalizedPosition,
  };
  try {
    // TRACE: diagnostic for single node to find who mutates size during reload
    if (typeof window !== 'undefined' && window.__TRACE_NODE_ID === undefined) {
      // keep disabled by default; tests will set window.__TRACE_NODE_ID to enable
    }
    if (typeof window !== 'undefined' && window.__TRACE_NODE_ID && String(window.__TRACE_NODE_ID) === String(id)) {
      try { console.debug('[TRACE] ensureNodeData for', id, 'source.width=', source.width, 'source.height=', source.height, '-> normalized.width=', normalized.width, 'normalized.height=', normalized.height); } catch (e) {}
    }
  } catch (e) {}

  return normalized;
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

const AUTO_PORT_COUNT = 8;
const AUTO_PORT_FRACTIONS = Array.from({ length: AUTO_PORT_COUNT }, (_, index) =>
  0.14 + ((0.72 * index) / Math.max(1, AUTO_PORT_COUNT - 1))
);

const AUTO_HANDLE_STYLE = {
  width: 3,
  height: 3,
  opacity: 0,
  background: 'transparent',
  border: 'none',
  boxShadow: 'none',
  pointerEvents: 'none',
  zIndex: 0,
};

function AutoInvisibleHandles({ left = 0, right = 120, top = 0, bottom = 68 }) {
  const width = Math.max(1, Number(right) - Number(left));
  const height = Math.max(1, Number(bottom) - Number(top));
  return (
    <>
      {AUTO_PORT_FRACTIONS.map((fraction, index) => {
        const y = Number(top) + (height * fraction);
        const x = Number(left) + (width * fraction);
        return (
          <React.Fragment key={index}>
            <Handle type="source" position={Position.Left} id={`s-left-${index}`} style={{ ...AUTO_HANDLE_STYLE, left, top: y }} />
            <Handle type="target" position={Position.Left} id={`t-left-${index}`} style={{ ...AUTO_HANDLE_STYLE, left, top: y }} />
            <Handle type="source" position={Position.Right} id={`s-right-${index}`} style={{ ...AUTO_HANDLE_STYLE, left: right, top: y }} />
            <Handle type="target" position={Position.Right} id={`t-right-${index}`} style={{ ...AUTO_HANDLE_STYLE, left: right, top: y }} />
            <Handle type="source" position={Position.Top} id={`s-top-${index}`} style={{ ...AUTO_HANDLE_STYLE, left: x, top }} />
            <Handle type="target" position={Position.Top} id={`t-top-${index}`} style={{ ...AUTO_HANDLE_STYLE, left: x, top }} />
            <Handle type="source" position={Position.Bottom} id={`s-bottom-${index}`} style={{ ...AUTO_HANDLE_STYLE, left: x, top: bottom }} />
            <Handle type="target" position={Position.Bottom} id={`t-bottom-${index}`} style={{ ...AUTO_HANDLE_STYLE, left: x, top: bottom }} />
          </React.Fragment>
        );
      })}
    </>
  );
}

function getRoutingNodeSize(node = {}) {
  const data = node?.data?.nodeData || node?.data || {};
  const type = String(node?.type || data?.type || 'shape').toLowerCase();
  const width = Number(node?.width ?? data?.width);
  const height = Number(node?.height ?? data?.height);
  return {
    width: Number.isFinite(width) && width > 0 ? width : (type === 'tank' ? 160 : type === 'plant' ? 200 : type === 'district' ? 160 : 120),
    height: Number.isFinite(height) && height > 0 ? height : (type === 'tank' ? 200 : type === 'plant' ? 80 : type === 'district' ? 48 : 68),
  };
}

function getRoutingNodeBox(node = {}) {
  const size = getRoutingNodeSize(node);
  const position = node?.positionAbsolute || node?.internals?.positionAbsolute || node?.position || { x: 0, y: 0 };
  const x = Number(position?.x || 0);
  const y = Number(position?.y || 0);
  return {
    id: String(node?.id || ''),
    x,
    y,
    width: size.width,
    height: size.height,
    left: x,
    right: x + size.width,
    top: y,
    bottom: y + size.height,
    cx: x + (size.width / 2),
    cy: y + (size.height / 2),
    shapeType: String(node?.data?.nodeData?.shapeType || node?.data?.shapeType || '').toLowerCase(),
  };
}

function getPreferredConnectionSides(sourceBox, targetBox) {
  const dx = targetBox.cx - sourceBox.cx;
  const dy = targetBox.cy - sourceBox.cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  }
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

function getPortFractionForSide(box, side, otherBox) {
  if (side === 'left' || side === 'right') {
    return Math.max(0.14, Math.min(0.86, (otherBox.cy - box.top) / Math.max(1, box.height)));
  }
  return Math.max(0.14, Math.min(0.86, (otherBox.cx - box.left) / Math.max(1, box.width)));
}

function chooseAutoPortIndex({ nodeId, side, otherBox, nodeBox, edges = [], source = true }) {
  const prefix = source ? 's' : 't';
  const desired = getPortFractionForSide(nodeBox, side, otherBox);
  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let index = 0; index < AUTO_PORT_COUNT; index += 1) {
    const handleId = `${prefix}-${side}-${index}`;
    const occupancy = edges.reduce((count, edge) => {
      if (source) return count + ((String(edge?.source || '') === String(nodeId) && edge?.sourceHandle === handleId) ? 1 : 0);
      return count + ((String(edge?.target || '') === String(nodeId) && edge?.targetHandle === handleId) ? 1 : 0);
    }, 0);
    const score = (occupancy * 100) + Math.abs(AUTO_PORT_FRACTIONS[index] - desired);
    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function assignAutoConnectionHandles(sourceId, targetId, nodes = [], edges = []) {
  const sourceNode = nodes.find((node) => String(node?.id) === String(sourceId));
  const targetNode = nodes.find((node) => String(node?.id) === String(targetId));
  if (!sourceNode || !targetNode) {
    return { sourceHandle: 's-right-3', targetHandle: 't-left-3' };
  }

  const sourceBox = getRoutingNodeBox(sourceNode);
  const targetBox = getRoutingNodeBox(targetNode);
  const [sourceSide, targetSide] = getPreferredConnectionSides(sourceBox, targetBox);
  const sourceIndex = chooseAutoPortIndex({ nodeId: sourceId, side: sourceSide, otherBox: targetBox, nodeBox: sourceBox, edges, source: true });
  const targetIndex = chooseAutoPortIndex({ nodeId: targetId, side: targetSide, otherBox: sourceBox, nodeBox: targetBox, edges, source: false });

  return {
    sourceHandle: `s-${sourceSide}-${sourceIndex}`,
    targetHandle: `t-${targetSide}-${targetIndex}`,
  };
}

function rebalanceSmartConnectionPorts(nodes = [], edges = []) {
  const routed = [];
  for (const edge of (edges || [])) {
    const handles = assignAutoConnectionHandles(edge.source, edge.target, nodes, routed);
    const routeMode = edge?.data?.routeMode === 'manual' ? 'manual' : 'smart';
    routed.push({
      ...edge,
      ...handles,
      type: routeMode === 'manual' ? (edge.type || 'step') : 'smart',
      data: { ...(edge.data || {}), routeMode, autoPorts: true },
    });
  }
  return routed;
}

function getPositionVector(position, fallbackX = 1, fallbackY = 0) {
  if (position === Position.Left) return { x: -1, y: 0 };
  if (position === Position.Right) return { x: 1, y: 0 };
  if (position === Position.Top) return { x: 0, y: -1 };
  if (position === Position.Bottom) return { x: 0, y: 1 };
  if (Math.abs(fallbackX) >= Math.abs(fallbackY)) return { x: fallbackX >= 0 ? 1 : -1, y: 0 };
  return { x: 0, y: fallbackY >= 0 ? 1 : -1 };
}

function compactOrthogonalPoints(points = []) {
  const clean = [];
  for (const point of points) {
    if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) continue;
    const p = { x: Number(point.x), y: Number(point.y) };
    const previous = clean[clean.length - 1];
    if (previous && previous.x === p.x && previous.y === p.y) continue;
    clean.push(p);
  }
  let changed = true;
  while (changed && clean.length > 2) {
    changed = false;
    for (let i = 1; i < clean.length - 1; i += 1) {
      const a = clean[i - 1];
      const b = clean[i];
      const d = clean[i + 1];
      if ((a.x === b.x && b.x === d.x) || (a.y === b.y && b.y === d.y)) {
        clean.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return clean;
}

function segmentHitsRect(a, b, rect) {
  const pad = 12;
  const left = rect.left - pad;
  const right = rect.right + pad;
  const top = rect.top - pad;
  const bottom = rect.bottom + pad;
  if (a.x === b.x) {
    return a.x > left && a.x < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom;
  }
  if (a.y === b.y) {
    return a.y > top && a.y < bottom && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right;
  }
  return false;
}

function scoreOrthogonalRoute(points, obstacles) {
  let collisions = 0;
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    length += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    for (const rect of obstacles) {
      if (segmentHitsRect(a, b, rect)) collisions += 1;
    }
  }
  return (collisions * 100000) + length + (Math.max(0, points.length - 2) * 8);
}

function buildRoundedOrthogonalPath(points = [], radius = 7) {
  const p = compactOrthogonalPoints(points);
  if (!p.length) return '';
  if (p.length === 1) return `M ${p[0].x} ${p[0].y}`;

  let path = `M ${p[0].x} ${p[0].y}`;
  for (let i = 1; i < p.length - 1; i += 1) {
    const previous = p[i - 1];
    const current = p[i];
    const next = p[i + 1];
    const incoming = Math.abs(current.x - previous.x) + Math.abs(current.y - previous.y);
    const outgoing = Math.abs(next.x - current.x) + Math.abs(next.y - current.y);
    const r = Math.min(radius, incoming / 2, outgoing / 2);
    const before = {
      x: current.x + (previous.x === current.x ? 0 : (previous.x < current.x ? -r : r)),
      y: current.y + (previous.y === current.y ? 0 : (previous.y < current.y ? -r : r)),
    };
    const after = {
      x: current.x + (next.x === current.x ? 0 : (next.x < current.x ? -r : r)),
      y: current.y + (next.y === current.y ? 0 : (next.y < current.y ? -r : r)),
    };
    path += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`;
  }
  const last = p[p.length - 1];
  path += ` L ${last.x} ${last.y}`;
  return path;
}

function SmartDistrictEdge(props) {
  const nodeInternals = useStore((state) => state.nodeInternals);
  const storeEdges = useStore((state) => state.edges);

  const {
    id, source, target, sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition, markerEnd, style, selected,
  } = props;

  const internals = Array.from(nodeInternals?.values?.() || []);
  const obstacleRects = internals
    .filter((node) => String(node?.id) !== String(source) && String(node?.id) !== String(target))
    .map(getRoutingNodeBox)
    .filter((box) => box.shapeType !== 'line');

  const siblings = (storeEdges || [])
    .filter((edge) => String(edge?.source) === String(source))
    .slice()
    .sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')));
  const siblingIndex = Math.max(0, siblings.findIndex((edge) => String(edge?.id) === String(id)));
  const laneOffset = (siblingIndex - ((Math.max(1, siblings.length) - 1) / 2)) * 9;

  const sx = Number(sourceX);
  const sy = Number(sourceY);
  const tx = Number(targetX);
  const ty = Number(targetY);
  const sourceVector = getPositionVector(sourcePosition, tx - sx, ty - sy);
  const targetVector = getPositionVector(targetPosition, sx - tx, sy - ty);
  const stubDistance = 24 + Math.min(22, Math.abs(laneOffset));
  const sourceStub = { x: sx + (sourceVector.x * stubDistance), y: sy + (sourceVector.y * stubDistance) };
  const targetStub = { x: tx + (targetVector.x * stubDistance), y: ty + (targetVector.y * stubDistance) };

  const allRects = obstacleRects.length ? obstacleRects : [{ left: Math.min(sx, tx), right: Math.max(sx, tx), top: Math.min(sy, ty), bottom: Math.max(sy, ty) }];
  const minLeft = Math.min(sx, tx, ...allRects.map((r) => r.left));
  const maxRight = Math.max(sx, tx, ...allRects.map((r) => r.right));
  const minTop = Math.min(sy, ty, ...allRects.map((r) => r.top));
  const maxBottom = Math.max(sy, ty, ...allRects.map((r) => r.bottom));
  const midX = ((sourceStub.x + targetStub.x) / 2) + laneOffset;
  const midY = ((sourceStub.y + targetStub.y) / 2) + laneOffset;
  const outerGap = 30 + Math.abs(laneOffset);

  const candidates = [
    [
      { x: sx, y: sy }, sourceStub,
      { x: midX, y: sourceStub.y },
      { x: midX, y: targetStub.y },
      targetStub, { x: tx, y: ty },
    ],
    [
      { x: sx, y: sy }, sourceStub,
      { x: sourceStub.x, y: midY },
      { x: targetStub.x, y: midY },
      targetStub, { x: tx, y: ty },
    ],
    [
      { x: sx, y: sy }, sourceStub,
      { x: sourceStub.x, y: minTop - outerGap },
      { x: targetStub.x, y: minTop - outerGap },
      targetStub, { x: tx, y: ty },
    ],
    [
      { x: sx, y: sy }, sourceStub,
      { x: sourceStub.x, y: maxBottom + outerGap },
      { x: targetStub.x, y: maxBottom + outerGap },
      targetStub, { x: tx, y: ty },
    ],
    [
      { x: sx, y: sy }, sourceStub,
      { x: minLeft - outerGap, y: sourceStub.y },
      { x: minLeft - outerGap, y: targetStub.y },
      targetStub, { x: tx, y: ty },
    ],
    [
      { x: sx, y: sy }, sourceStub,
      { x: maxRight + outerGap, y: sourceStub.y },
      { x: maxRight + outerGap, y: targetStub.y },
      targetStub, { x: tx, y: ty },
    ],
  ].map(compactOrthogonalPoints);

  const best = candidates
    .map((points) => ({ points, score: scoreOrthogonalRoute(points, obstacleRects) }))
    .sort((a, b) => a.score - b.score)[0]?.points || candidates[0];

  const path = buildRoundedOrthogonalPath(best);
  const visibleStyle = {
    ...(style || {}),
    fill: 'none',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    ...(selected ? { filter: 'drop-shadow(0 0 2px rgba(37,99,235,0.55))' } : {}),
  };

  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={visibleStyle} />;
}

const EDGE_TYPES = { smart: SmartDistrictEdge };

// Wrapper node components for React Flow
function FlowTankNode(props) {
  const { data } = props || {};
  const { nodeData, onSelect, onDuplicate, onConnectNode, onDeleteSelected, onRename, editMode, mode, deleteMode } = data || {};
  const cachedTankTelemetry = getCachedTankTelemetryForNode(nodeData?.id ?? data?.id, nodeData || data || {});
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(getNodeDisplayName({ data: nodeData }));
  const inputRef = useRef(null);
  const tankWidth = (nodeData?.width != null && Number.isFinite(Number(nodeData.width)) && Number(nodeData.width) > 0) ? Number(nodeData.width) : 160;
  const tankHeight = (nodeData?.height != null && Number.isFinite(Number(nodeData.height)) && Number(nodeData.height) > 0) ? Number(nodeData.height) : 200;
  const tankScale = Math.max(0.45, Math.min(1.4, Math.min(tankWidth / 160, tankHeight / 200) || 1));
  const innerOffsetX = (tankWidth - 160 * tankScale) / 2;
  const innerOffsetY = (tankHeight - 200 * tankScale) / 2;

  useEffect(() => {
    setDraft(getNodeDisplayName({ data: nodeData }));
  }, [nodeData?.customName, nodeData?.label, nodeData?.display_name, nodeData?.nombre, nodeData?.apiName]);

  useEffect(() => {
    if (isEditing) {
      try { if (inputRef && inputRef.current && typeof inputRef.current.focus === 'function') { inputRef.current.focus(); inputRef.current.select && inputRef.current.select(); } } catch (e) {}
    }
  }, [isEditing]);

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
  // Diagnostic: mark when node wrapper's onSelect is invoked
  try { if (typeof window !== 'undefined') { /* noop to keep tool happy */ } } catch (e) {}
  const beginEdit = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    setDraft(labelText);
    setIsEditing(true);
    try { if (typeof window !== 'undefined') window.__LAST_BEGIN_EDIT = nodeData?.id || data?.id || null; } catch (e) {}
  };

  const saveLabel = () => {
    const clean = (draft || '').replace(/\s+/g, ' ').trim();
    const finalValue = clean || labelText;
    if (onRename) onRename(nodeData.id, finalValue);
    setDraft(finalValue);
    setIsEditing(false);
  };

  const handleStyle = {
    width: 3, height: 3, background: 'transparent',
    border: 'none', boxShadow: 'none',
    borderRadius: '50%', zIndex: 0,
    opacity: 0, pointerEvents: 'none',
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
    <div onClick={handleClick} style={{ width: tankWidth, height: tankHeight, position: 'relative', cursor: 'pointer' }}>
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
      <AutoInvisibleHandles
        left={innerOffsetX + 20 * tankScale}
        right={innerOffsetX + 100 * tankScale}
        top={innerOffsetY + 36 * tankScale}
        bottom={innerOffsetY + 126 * tankScale}
      />

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
              valor_m: cachedTankTelemetry?.valor_m ?? ((nodeData && nodeData.valor_m != null) ? nodeData.valor_m : (data && data.valor_m != null ? data.valor_m : null)),
              nivel: cachedTankTelemetry?.nivel ?? ((nodeData && nodeData.nivel != null) ? nodeData.nivel : (data && data.nivel != null ? data.nivel : null)),
              porcentaje: cachedTankTelemetry?.porcentaje ?? ((nodeData && nodeData.porcentaje != null) ? nodeData.porcentaje : (data && data.porcentaje != null ? data.porcentaje : null)),
              porcentaje_capacidad: cachedTankTelemetry?.porcentaje_capacidad ?? nodeData?.porcentaje_capacidad ?? null,
              altura_rebose: cachedTankTelemetry?.altura_rebose ?? nodeData?.altura_rebose ?? null,
              altura_rebose_calibrada: cachedTankTelemetry?.altura_rebose_calibrada ?? nodeData?.altura_rebose_calibrada ?? null,
              // keep id and attach manual pct handler for the TankNode UI
              id: nodeData && nodeData.id ? nodeData.id : (data && data.id ? data.id : null),
              onManualPctChange: (p) => { try { setNodeManualPercentage((nodeData && nodeData.id) || (data && data.id), p); } catch (e) {} },
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
                  ref={inputRef}
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
              style={{ cursor: 'pointer' }}
            >{labelText}</text>
          )}
        </svg>
      </div>
    </div>
  );
}


function FlowPlantNode(props) {
  const { data } = props || {};
  const { nodeData, onSelect, onDuplicate, onConnectNode, onDeleteSelected, onRename, editMode, mode, deleteMode } = data || {};
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(getNodeDisplayName({ data: nodeData }));
  const inputRef = useRef(null);
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
    try { if (typeof window !== 'undefined') { window.__SELECTION_TRACE = window.__SELECTION_TRACE || []; window.__SELECTION_TRACE.push('FLOWPLANTNODE_HANDLECLICK:' + (nodeData && nodeData.id)); } } catch (e) {}
    if (onSelect) onSelect(nodeData.id);
  };
  const isPending = Boolean(data && data.pendingConnect);
  const labelText = getNodeDisplayName({ data: nodeData });
  const metricNodeId = nodeData?.id ?? nodeData?.nodeId ?? data?.id ?? data?.nodeId;
  const [metricLabel, setMetricLabel] = useState(() => getCachedFlowMetricForNodeId(metricNodeId));
  const beginEdit = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    setDraft(labelText);
    setIsEditing(true);
    try { if (typeof window !== 'undefined') window.__LAST_BEGIN_EDIT = nodeData?.id || data?.id || null; } catch (e) {}
  };

  useEffect(() => {
    let mounted = true;

    const cachedLabel = getCachedFlowMetricForNodeId(metricNodeId);
    if (cachedLabel != null) setMetricLabel(cachedLabel);

    (async () => {
      try {
        if (!metricNodeId || !getMetricConfigForNodeId(metricNodeId)) {
          if (mounted) setMetricLabel(null);
          return;
        }

        const label = await loadFlowMetricForNodeId(metricNodeId);
        if (mounted && label != null) setMetricLabel(label);
      } catch (error) {
        // Conservar el último dato visible si el refresco falla.
      }
    })();

    return () => { mounted = false; };
  }, [metricNodeId]);

  const saveLabel = () => {
    const clean = (draft || '').replace(/\s+/g, ' ').trim();
    const finalValue = clean || labelText;
    if (onRename) onRename(nodeData.id, finalValue);
    setDraft(finalValue);
    setIsEditing(false);
  };

  const handleStyle = {
    width: 3,
    height: 3,
    background: 'transparent',
    border: 'none',
    boxShadow: 'none',
    borderRadius: '50%',
    zIndex: 0,
    opacity: 0,
    pointerEvents: 'none',
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
    <div onClick={handleClick} style={{ width: 200, height: 80, position: 'relative', cursor: 'pointer' }}>
      <Handle type="target" position={Position.Left} id="t-left" style={{ ...handleStyle, left: leftHandle.left, top: leftHandle.top }} />
      <Handle type="source" position={Position.Right} id="s-right" style={{ ...handleStyle, left: rightHandle.left, top: rightHandle.top }} />
      <Handle type="target" position={Position.Top} id="t-top" style={{ ...handleStyle, left: topHandle.left, top: topHandle.top }} />
      <Handle type="source" position={Position.Bottom} id="s-bottom" style={{ ...handleStyle, left: bottomHandle.left, top: bottomHandle.top }} />
      <AutoInvisibleHandles left={6} right={w - 6} top={14} bottom={h - 14} />

      <div style={{ width: 200, height: 80, overflow: 'visible' }}>
        <svg width={200} height={80}>
          <g transform={`translate(${100}, ${40}) rotate(${Number(nodeData?.rotation ?? data?.rotation ?? 0) || 0})`}>
            {isEditing ? (
              <foreignObject x={-80} y={-18} width={160} height={42}>
                <div className="nodrag" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    autoFocus
                    ref={inputRef}
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
                <text x={0} y={6} fontFamily="Roboto, Arial" fontSize={13} fontWeight={800} fill={isPending ? '#b91c1c' : (customColor || '#073B70')} textAnchor="middle" style={{ cursor: 'pointer' }}>{labelText}</text>
              </>
            )}
          </g>
        </svg>
      </div>
    </div>
  );
}

function FlowDistrictNode(props) {
  const { data } = props || {};
  const { nodeData, onSelect, onDuplicate, onConnectNode, onDeleteSelected, onRename, editMode, mode, deleteMode } = data || {};
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(getNodeDisplayName({ data: nodeData }));
  const inputRef = useRef(null);
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
    try { if (typeof window !== 'undefined') { window.__SELECTION_TRACE = window.__SELECTION_TRACE || []; window.__SELECTION_TRACE.push('FLOWDISTRICTNODE_HANDLECLICK:' + (nodeData && nodeData.id)); } } catch (e) {}
    if (onSelect) onSelect(nodeData.id);
  };
  const isPending = Boolean(data && data.pendingConnect);
  const labelText = getNodeDisplayName({ data: nodeData });

  const beginEdit = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    setDraft(labelText);
    setIsEditing(true);
    try { if (typeof window !== 'undefined') window.__LAST_BEGIN_EDIT = nodeData?.id || data?.id || null; } catch (e) {}
  };

  const saveLabel = () => {
    const clean = (draft || '').replace(/\s+/g, ' ').trim();
    const finalValue = clean || labelText;
    if (onRename) onRename(nodeData.id, finalValue);
    setDraft(finalValue);
    setIsEditing(false);
  };

  const handleStyle = {
    width: 3,
    height: 3,
    background: 'transparent',
    border: 'none',
    boxShadow: 'none',
    borderRadius: '50%',
    zIndex: 0,
    opacity: 0,
    pointerEvents: 'none',
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
    <div onClick={handleClick} style={{ width: 160, height: 48, position: 'relative', cursor: 'pointer' }}>
      <Handle type="target" position={Position.Left} id="t-left" style={{ ...handleStyle, left: leftHandle.left, top: leftHandle.top }} />
      <Handle type="source" position={Position.Right} id="s-right" style={{ ...handleStyle, left: rightHandle.left, top: rightHandle.top }} />
      <Handle type="target" position={Position.Top} id="t-top" style={{ ...handleStyle, left: topHandle.left, top: topHandle.top }} />
      <Handle type="source" position={Position.Bottom} id="s-bottom" style={{ ...handleStyle, left: bottomHandle.left, top: bottomHandle.top }} />
      <AutoInvisibleHandles left={6} right={w - 6} top={4} bottom={h - 4} />

      <div style={{ width: 160, height: 48, overflow: 'visible' }}>
        <svg width={160} height={48}>
          <g transform={`translate(${80}, ${24}) rotate(${Number(nodeData?.rotation ?? data?.rotation ?? 0) || 0})`}>
            {isEditing ? (
              <foreignObject x={-55} y={-12} width={110} height={26}>
                <div className="nodrag" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    autoFocus
                    ref={inputRef}
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
                <text x={0} y={5} fontFamily="Roboto, Arial" fontSize={12} fill={isPending ? '#b91c1c' : (customColor || '#475569')} fontWeight={700} textAnchor="middle" style={{ cursor: 'pointer' }}>{labelText}</text>
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
  const { data } = props || {};
  const runtimeNodeData = data?.nodeData || data || {};
  const { nodeData = runtimeNodeData, onSelect, onDuplicate, onConnectNode, onDeleteSelected, onRename, editMode, mode, deleteMode } = data || {};
  const [isEditing, setIsEditing] = useState(false);
  const runtimeDisplayName = getStableRuntimeShapeName(nodeData);
  const [draft, setDraft] = useState(runtimeDisplayName);
  const inputRef = useRef(null);
  const isMackenflocById = Boolean(nodeData && nodeData.id && MACKENFLOC_ID_TO_LABEL[String(nodeData.id)]);
  const customColor = nodeData?.customColor || nodeData?.color || (isMackenflocById ? '#f59e0b' : '#3b82f6');
  const safeColor = /^#[0-9a-fA-F]{3,8}$/.test(customColor) ? customColor : (isMackenflocById ? '#f59e0b' : '#3b82f6');
  const baseSize = getAutoShapeSize(draft, nodeData?.width, nodeData?.height);
  const width = Number.isFinite(Number(nodeData?.width)) ? Number(nodeData.width) : Number.isFinite(Number(baseSize.width)) ? Number(baseSize.width) : 120;
  const height = Number.isFinite(Number(nodeData?.height)) ? Number(nodeData.height) : Number.isFinite(Number(baseSize.height)) ? Number(baseSize.height) : 68;
  const shapeType = nodeData?.shapeType || 'rect';

  useEffect(() => {
    setDraft(runtimeDisplayName);
  }, [runtimeDisplayName]);

  const cachedMetricText = getCachedFlowMetricForNodeId(runtimeNodeData?.id ?? data?.id);
  const metricText = (runtimeNodeData && runtimeNodeData.ptapMetricText != null && runtimeNodeData.ptapMetricText !== '')
    ? String(runtimeNodeData.ptapMetricText)
    : cachedMetricText;
  const metricLabel = (runtimeNodeData && runtimeNodeData.ptapMetricLabel != null && runtimeNodeData.ptapMetricLabel !== '')
    ? String(runtimeNodeData.ptapMetricLabel)
    : null;
  const isChembeNode = String(runtimeNodeData?.id ?? '').trim() === 'ptap-chembe';
  const _resolvedExactTag = getExactMackenflocTagForNode({ id: runtimeNodeData && runtimeNodeData.id, label: runtimeNodeData && runtimeNodeData.label }, runtimeNodeData, _ptapMetricsMap);
  const isMackenflocShape = Boolean(_resolvedExactTag && String(_resolvedExactTag).toUpperCase().includes('MACKENFLOC'));

  // Respect zero as a valid API value while still suppressing null/undefined.
  const effectiveMetricText = (metricText !== null && metricText !== undefined && metricText !== '') ? String(metricText).trim() : null;
  const shouldRenderMetricBadge = !isMackenflocShape && effectiveMetricText !== null;
  const shouldRenderMackenflocInline = isMackenflocShape && effectiveMetricText !== null;

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
    try { if (typeof window !== 'undefined') { window.__SELECTION_TRACE = window.__SELECTION_TRACE || []; window.__SELECTION_TRACE.push('FLOWSHAPENODE_HANDLECLICK:' + (nodeData && nodeData.id)); } } catch (e) {}
    if (onSelect) onSelect(nodeData.id);
  };

  const beginEdit = (ev) => { ev.preventDefault(); ev.stopPropagation(); setDraft(getNodeDisplayName({ data: nodeData })); setIsEditing(true); try { if (typeof window !== 'undefined') window.__LAST_BEGIN_EDIT = nodeData?.id || data?.id || null; } catch (e) {} };
  const saveLabel = () => {
    const clean = (draft || '').trim() || 'Texto';
    if (onRename) onRename(nodeData.id, clean);
    setDraft(clean);
    setIsEditing(false);
  };

  const isPending = Boolean(data && data.pendingConnect);
  const handleStyle = { width: 3, height: 3, background: 'transparent', border: 'none', boxShadow: 'none', borderRadius: '50%', zIndex: 0, opacity: 0, pointerEvents: 'none' };
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
    <div onClick={handleClick} style={{ width, height, position: 'relative', cursor: 'pointer', overflow: 'visible' }}>
      <Handle type="target" position={Position.Left} id="t-left" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="s-right" style={handleStyle} />
      <Handle type="target" position={Position.Top} id="t-top" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="s-bottom" style={handleStyle} />
      <AutoInvisibleHandles left={2} right={width - 2} top={2} bottom={height - 2} />
      <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
        <g transform={`translate(${width / 2}, ${height / 2}) rotate(${Number(nodeData?.rotation ?? data?.rotation ?? 0) || 0}) translate(${-width / 2}, ${-height / 2})`}>
          {renderShape()}
          {(() => {
            try {
              if (shouldRenderMetricBadge) {
                const badgeText = effectiveMetricText || '';
                const boxW = Math.min(120, Math.max(64, String(badgeText || '').length * 8));
                const boxX = Math.max(2, Math.round((width - boxW) / 2));
                return (
                  <foreignObject x={boxX} y={-28} width={boxW} height={22} style={{ overflow: 'visible' }}>
                    <div xmlns="http://www.w3.org/1999/xhtml" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid #94a3b8', borderRadius: 6, padding: '2px 6px', boxShadow: '0 2px 6px rgba(0,0,0,0.12)', fontSize: 11, fontWeight: 900, color: '#0b2447', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                      {badgeText}
                    </div>
                  </foreignObject>
                );
              }

              if (shouldRenderMackenflocInline) {
                const titleY = Math.round(height / 2) - 4;
                const valueY = Math.round(height / 2) + 12;
                return (
                  <>
                    <text x={width / 2} y={titleY} fontFamily="Roboto, Arial" fontSize={12} fill="#0b2447" fontWeight={800} textAnchor="middle" style={{ pointerEvents: 'none' }}>{runtimeDisplayName}</text>
                    <text x={width / 2} y={valueY} fontFamily="Roboto, Arial" fontSize={12} fill="#0b2447" fontWeight={700} textAnchor="middle" style={{ pointerEvents: 'none' }}>{effectiveMetricText || ''}</text>
                  </>
                );
              }
            } catch (e) {}
            return null;
          })()}
          {!isEditing && shapeType !== 'line' && !isMackenflocShape ? (
            <foreignObject x={0} y={0} width={width} height={height} style={{ overflow: 'visible' }}>
              <div xmlns="http://www.w3.org/1999/xhtml" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', wordBreak: 'break-word', color: '#0b2447', fontSize: 13, fontWeight: 700, padding: '4px 8px', boxSizing: 'border-box', pointerEvents: 'none', width: '100%', height: '100%' }}>
                <div style={{ width: '100%', lineHeight: 1.2 }}>{shouldRenderMetricBadge ? (STABLE_SHAPE_NAME_BY_ID[String(nodeData?.id || '')] || draft) : draft}</div>
              </div>
            </foreignObject>
          ) : null}
        </g>
      </svg>
      {isPending && (<div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 900, padding: '1px 6px', borderRadius: 4 }}>ORIGEN</div>)}
      {isEditing ? (
        <div className="nodrag" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: width - 20, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 10 }}>
          <textarea ref={inputRef} autoFocus value={draft} onChange={e => setDraft(e.target.value)}
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

const DistrictFlow = React.forwardRef(function DistrictFlow({ initialNodes, initialEdges, onNodeSelect, onEdgeSelect, editMode = false, mode = 'select', deleteMode = false, containerRef = null, focusNodeId = null, filterState = 'all', apiError = false, edgeLineType, diagramModeExternal, onDiagramModeChange, onDirtyChanged }, ref) {

  // Note: avoid updateNodeDimensions to prevent React Flow from hiding nodes while measuring
  try { console.debug('[DISTRICT DEBUG] DistrictFlow init props initialNodes.length:', (initialNodes || []).length, 'initialEdges.length:', (initialEdges || []).length); } catch (e) {}

  // (Removed synthetic-event polyfill) Do not alter global event constructors.
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

// Render an SVG <mask> that hides edge strokes only under the visible node body.
// White badges and labels are intentionally excluded so they remain readable and
// arrowheads keep their full visual footprint.
const EdgesOcclusionMask = React.memo(function EdgesOcclusionMask({ nodes = [] }) {
  try {
    if (!Array.isArray(nodes) || !nodes.length) return null;
    return (
      <svg style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
        <defs>
          <mask id="rf-nodes-occlusion-mask" maskUnits="userSpaceOnUse">
            <rect x={-10000} y={-10000} width={20000} height={20000} fill="white" />
            {nodes.map((n) => {
              const px = n.position && Number.isFinite(Number(n.position.x)) ? Number(n.position.x) : 0;
              const py = n.position && Number.isFinite(Number(n.position.y)) ? Number(n.position.y) : 0;
              const rawW = Number.isFinite(Number(n.width)) && Number(n.width) > 0 ? Number(n.width) : (n.data && n.data.nodeData && Number.isFinite(Number(n.data.nodeData.width)) ? Number(n.data.nodeData.width) : 120);
              const rawH = Number.isFinite(Number(n.height)) && Number(n.height) > 0 ? Number(n.height) : (n.data && n.data.nodeData && Number.isFinite(Number(n.data.nodeData.height)) ? Number(n.data.nodeData.height) : 68);
              const isTank = String(n.type || n.data?.type || '').toLowerCase() === 'tank';
              const inset = isTank ? 22 : 10;
              const bodyX = px + inset;
              const bodyY = isTank ? py + 32 : py + 12;
              const bodyW = Math.max(24, rawW - inset * 2);
              const bodyH = Math.max(20, rawH - (isTank ? 50 : 22));
              return <rect key={String(n.id)} x={bodyX} y={bodyY} width={bodyW} height={bodyH} rx={isTank ? 12 : 8} ry={isTank ? 12 : 8} fill="black" />;
            })}
          </mask>
        </defs>
      </svg>
    );
  } catch (e) {
    return null;
  }
}, (prev, next) => {
  try {
    const a = Array.isArray(prev.nodes) ? prev.nodes : [];
    const b = Array.isArray(next.nodes) ? next.nodes : [];
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      const na = a[i];
      const nb = b[i];
      if (!na || !nb) return false;
      if (String(na.id) !== String(nb.id)) return false;
      const pax = na.position && Number.isFinite(Number(na.position.x)) ? Number(na.position.x) : 0;
      const pay = na.position && Number.isFinite(Number(na.position.y)) ? Number(na.position.y) : 0;
      const pbx = nb.position && Number.isFinite(Number(nb.position.x)) ? Number(nb.position.x) : 0;
      const pby = nb.position && Number.isFinite(Number(nb.position.y)) ? Number(nb.position.y) : 0;
      if (pax !== pbx || pay !== pby) return false;
      const aw = Number.isFinite(Number(na.width)) && Number(na.width) > 0 ? Number(na.width) : (na.data && na.data.nodeData && Number.isFinite(Number(na.data.nodeData.width)) ? Number(na.data.nodeData.width) : 120);
      const ah = Number.isFinite(Number(na.height)) && Number(na.height) > 0 ? Number(na.height) : (na.data && na.data.nodeData && Number.isFinite(Number(na.data.nodeData.height)) ? Number(na.data.nodeData.height) : 68);
      const bw = Number.isFinite(Number(nb.width)) && Number(nb.width) > 0 ? Number(nb.width) : (nb.data && nb.data.nodeData && Number.isFinite(Number(nb.data.nodeData.width)) ? Number(nb.data.nodeData.width) : 120);
      const bh = Number.isFinite(Number(nb.height)) && Number(nb.height) > 0 ? Number(nb.height) : (nb.data && nb.data.nodeData && Number.isFinite(Number(nb.data.nodeData.height)) ? Number(nb.data.nodeData.height) : 68);
      if (aw !== bw || ah !== bh) return false;
    }
    return true;
  } catch (e) { return false; }
});

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const selectedNodeIdRef = useRef(null);
  const initialSelectionIgnoredRef = useRef(false);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  const [bootstrapStatus, setBootstrapStatus] = useState('loading');

  useEffect(() => {
    if ((nodes || []).length > 0 || (edges || []).length > 0) return;
    if (bootstrapStatus !== 'loading') return;
    if (!Array.isArray(initialNodes) || initialNodes.length > 0) return;
    if (!Array.isArray(initialEdges) || initialEdges.length > 0) return;
  }, [initialNodes, initialEdges, edges, nodes, bootstrapStatus]);

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
  const [showFlow, setShowFlow] = useState(false);
  const [connectDate, setConnectDate] = useState('');
  const [connectDateFormat, setConnectDateFormat] = useState(() => {
    try { return localStorage.getItem('district_connect_date_format') || 'dd/MM/yyyy'; } catch (e) { return 'dd/MM/yyyy'; }
  });
  const [saveMsg, setSaveMsg] = useState(null); // null | 'ok' | 'error'
  // 'edit' = nodos arrastrables | 'view' = solo visual (no se puede tocar nada)
  // diagramMode: se controla desde el padre (DistrictMap) via prop, pero también tiene estado local como fallback
  const [diagramMode, setDiagramMode] = useState(() => {
    try {
      const saved = localStorage.getItem('district_diagram_mode');
      return saved === 'view' ? 'view' : 'edit';
    } catch (e) { return 'edit'; }
  });
  // Sincronizar con el prop externo cuando cambia
  useEffect(() => {
    if (diagramModeExternal && diagramModeExternal !== diagramMode) {
      setDiagramMode(diagramModeExternal);
    }
  }, [diagramModeExternal]);

  // Mientras el usuario está moviendo/editando, las posiciones locales son
  // autoritativas. Un eco WS atrasado no debe devolver los nodos a posiciones viejas.
  const diagramModeRef = useRef(diagramMode);
  const draftPositionsRef = useRef(new Map());
  useEffect(() => {
    diagramModeRef.current = diagramMode;
    const editing = diagramMode === 'edit';
    setNodes((current) => {
      const updated = (current || []).map((node) => {
        const nd = node?.data?.nodeData || node?.data || {};
        return {
          ...node,
          draggable: editing,
          data: {
            ...(node.data || {}),
            lockedPosition: editing ? false : Boolean(node.data?.lockedPosition),
            nodeData: {
              ...nd,
              lockedPosition: editing ? false : Boolean(nd.lockedPosition),
            },
          },
        };
      });
      nodesRef.current = updated;
      return updated;
    });
  }, [diagramMode]);

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
  const [overlayVisible, setOverlayVisible] = useState(false);
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef(0);
  const dragMovedRef = useRef(false);
  const dragStartPositionRef = useRef({ x: 0, y: 0 });
  const suppressClickAfterDragRef = useRef(false);
  const suppressSelectionAfterDragRef = useRef(false);
  const dragSuppressUntilRef = useRef(0);
  const autoSaveTimerRef = useRef(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
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
  // Track the operation id associated with the pendingServerSaveRef (diagnostic only)
  const pendingOpIdRef = useRef(null);
  const heartbeatRef = useRef(null);
  // Guard to aggressively suppress any server writes while applying a remote update
  const suppressServerWritesRef = useRef(false);

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
          // support diagnostic-wrapped entries: { msg, _diagOpId }
          let toSend = m;
          try {
            if (m && typeof m === 'object' && m.msg) toSend = m.msg;
            if (typeof m === 'string') {
              try { const parsed = JSON.parse(m); if (parsed && parsed.msg) toSend = parsed.msg; } catch (e) {}
            }
          } catch (e) {}
          try { wsRef.current.send(toSend); sent += 1; } catch (e) { console.warn('[WS CLIENT] flushSendQueue send error', e && e.message); sendQueueRef.current.unshift(m); break; }
        }
        try { localStorage.setItem('district_ws_queue', JSON.stringify(sendQueueRef.current || [])); } catch (e) {}
        console.log('[WS CLIENT] flushSendQueue sent', sent);
        return sent > 0;
      }

      // Fallback: POST the most recent queued state to the server
      try {
        const last = q[q.length - 1];
        let parsed = null;
        if (typeof last === 'string') {
          try { parsed = JSON.parse(last || '{}'); } catch (e) { parsed = last; }
        } else parsed = last;
        // if wrapped, dig into msg
        let state = null;
        try {
          if (parsed && parsed.msg) {
            try { state = JSON.parse(parsed.msg); } catch (e) { state = parsed.msg; }
          } else {
            state = parsed.state || parsed;
          }
        } catch (e) { state = parsed; }
        if (state && typeof state === 'object') {
          // Respect suppression guard: do not perform server writes while
          // applying remote authoritative state.
          if (suppressServerWritesRef.current || applyingRemoteRef.current) {
            try { console.debug('[DIAGRAM] flushSendQueue suppressed due to applyingRemote/suppress flag'); } catch (e) {}
            return false;
          }
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
      const normalizedNodes = normalizeSavedNodeMap(raw.nodes);
      const sanitizedNodes = Object.fromEntries(
        Object.entries(normalizedNodes).map(([id, entry]) => [id, sanitizePersistedNodeVisual({ ...(entry || {}), id })])
      );
      const hiddenNodeIds = Array.isArray(raw.hiddenNodeIds) ? [...new Set(raw.hiddenNodeIds.filter((id) => id != null && String(id).trim() !== ''))] : [];
      const deletedNodeIds = Array.isArray(raw.deletedNodeIds) ? [...new Set(raw.deletedNodeIds.filter((id) => id != null && String(id).trim() !== ''))] : [];
      const removedIds = new Set([...hiddenNodeIds, ...deletedNodeIds]);
      const filteredNodes = Object.fromEntries(Object.entries(normalizedNodes).filter(([id]) => !removedIds.has(id)));
      return {
        ...raw,
        nodes: Object.fromEntries(Object.entries(filteredNodes).map(([id, entry]) => [id, sanitizePersistedNodeVisual({ ...(entry || {}), id })])),
        hiddenNodeIds,
        deletedNodeIds,
        edges: Array.isArray(raw.edges) ? raw.edges.filter((edge) => {
          const source = edge && edge.source != null ? String(edge.source) : '';
          const target = edge && edge.target != null ? String(edge.target) : '';
          return !removedIds.has(source) && !removedIds.has(target);
        }) : [],
      };
    } catch (e) {
      return {};
    }
  }, []);

  const readAuthoritativeDiagramState = useCallback(async () => {
    // Strict: return authoritative diagram state from backend only.
    // Any network or API error must propagate so callers treat it as a real error.
    return await diagramService.getState();
  }, []);

  const _validateBeforeSave = (candidate, baseline) => {
    try {
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
  const writeDiagramState = useCallback((nextState, options = {}) => {
    try {
      const source = String(options && options.source ? options.source : 'local').toLowerCase();
      const sendToServer = Boolean(options && options.sendToServer === true);
      const safe = nextState && typeof nextState === 'object' ? nextState : {};
      const isStructuralState = (p) => {
        try {
          if (!p || typeof p !== 'object') return false;
          const hasNodesKey = Object.prototype.hasOwnProperty.call(p, 'nodes');
          const hasEdgesKey = Object.prototype.hasOwnProperty.call(p, 'edges');
          const hasOtherKey = Object.keys(p).some(k => k !== 'nodes' && k !== 'edges');
          return hasNodesKey || hasEdgesKey || hasOtherKey;
        } catch (e) { return false; }
      };

      if (!isStructuralState(safe)) return;

      const timestamp = source === 'remote'
        ? (safe.updated_at || safe._updatedAt || safe.updatedAt || new Date().toISOString())
        : new Date().toISOString();
      safe.updated_at = timestamp;
      safe._updatedAt = timestamp;
      safe.updatedAt = timestamp;
      safe.hiddenNodeIds = Array.isArray(safe.hiddenNodeIds) ? [...new Set(safe.hiddenNodeIds.filter((id) => id != null && String(id).trim() !== ''))] : [];
      safe.deletedNodeIds = Array.isArray(safe.deletedNodeIds) ? [...new Set(safe.deletedNodeIds.filter((id) => id != null && String(id).trim() !== ''))] : [];
      if (safe.nodes && typeof safe.nodes === 'object') {
        const normalizedNodeMap = normalizeSavedNodeMap(safe.nodes);
        safe.nodes = Object.fromEntries(
          Object.entries(normalizedNodeMap).map(([id, entry]) => [id, sanitizePersistedNodeVisual({ ...(entry || {}), id })])
        );
      }

      const prevRaw = (function() { try { return JSON.parse(localStorage.getItem('district_state') || '{}'); } catch (e) { return {}; } })();
      const prevTs = (prevRaw && (prevRaw.updated_at || prevRaw._updatedAt || prevRaw.updatedAt || '')) || '';
      if (source === 'remote' && prevTs && timestamp && new Date(timestamp).getTime() < new Date(prevTs).getTime()) {
        return;
      }

      try { localStorage.setItem('district_state_backup', JSON.stringify(prevRaw)); } catch (e) {}
      try { localStorage.setItem('district_state', JSON.stringify(safe)); } catch (e) {}

      // By default do NOT send to server automatically. To trigger server
      // persistence and WS broadcast use explicit doSaveToServer which calls
      // writeDiagramState with sendToServer=true.
      if (sendToServer) {
        if (suppressServerWritesRef.current || applyingRemoteRef.current) {
          return;
        }

        // Serializar escrituras: nunca permitir que una petición vieja termine
        // después de una nueva y restaure un diseño anterior.
        pendingServerSaveRef.current = JSON.parse(JSON.stringify(safe));
        if (!savingRef.current) {
          savingRef.current = true;
          (async () => {
            try {
              while (pendingServerSaveRef.current) {
                const payload = pendingServerSaveRef.current;
                pendingServerSaveRef.current = null;
                await diagramService.saveState(payload);
              }
              try { if (typeof onDirtyChanged === 'function') onDirtyChanged(false); } catch (e) {}
            } catch (err) {
              console.warn('[DIAGRAM] saveState failed', err);
            } finally {
              savingRef.current = false;
            }
          })();
        }
      }
    } catch (e) {}
  }, []);

  // Poll server periodically to detect remote updates and reload local state when newer
  useEffect(() => {
    // WebSocket connection for real-time sync with reconnection, queueing and heartbeat
    let mounted = true;
    const envWs = import.meta.env.VITE_WS_URL;
    const wsHost = (window.location && window.location.hostname) ? window.location.hostname : 'localhost';
    const wsUrl = envWs || `ws://${wsHost}:8080`;
    console.log('[WS CLIENT] using wsUrl=', wsUrl, envWs ? '(from VITE_WS_URL)' : '(derived from browser host)');

    const connect = () => {
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.addEventListener('open', () => {
          reconnectRef.current.attempts = 0;
          try {
            const raw = localStorage.getItem('district_ws_queue');
            if (raw) {
              try { sendQueueRef.current = JSON.parse(raw) || sendQueueRef.current; } catch (e) { sendQueueRef.current = sendQueueRef.current; }
            }
            while ((sendQueueRef.current || []).length > 0) {
              const m = sendQueueRef.current.shift();
              let toSend = m;
              try {
                if (m && typeof m === 'object' && m.msg) toSend = m.msg;
                if (typeof m === 'string') {
                  try { const parsed = JSON.parse(m); if (parsed && parsed.msg) toSend = parsed.msg; } catch (e) {}
                }
              } catch (e) {}
              try { ws.send(toSend); } catch (e) { sendQueueRef.current.unshift(m); break; }
            }
            try { if ((sendQueueRef.current || []).length === 0) localStorage.removeItem('district_ws_queue'); else localStorage.setItem('district_ws_queue', JSON.stringify(sendQueueRef.current)); } catch (e) {}
          } catch (e) {}
          try { clearInterval(heartbeatRef.current); } catch (e) {}
          heartbeatRef.current = setInterval(() => {
            try { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping', ts: new Date().toISOString() })); } catch (e) {}
          }, 25000);
          setWsConnected(true);
        });

        ws.addEventListener('message', (ev) => {
          try {
            const msg = JSON.parse(ev.data || '{}');
            if (!msg || typeof msg !== 'object') return;
            if (msg.type === 'diagram:update') {
              if (savingRef.current || pendingServerSaveRef.current || dragMovedRef.current) return;
              const remote = msg.state || {};
              const remoteTs = (remote.updated_at || remote.updatedAt || remote._updatedAt || msg.updated_at || '').toString();
              const localRaw = (function() { try { return localStorage.getItem('district_state') || '{}'; } catch (e) { return '{}'; }})();
              const local = JSON.parse(localRaw || '{}');
              const localTs = (local.updated_at || local.updatedAt || local._updatedAt || '').toString();
              if (remoteTs && (!localTs || new Date(remoteTs).getTime() > new Date(localTs).getTime())) {
                applyingRemoteRef.current = true;
                pendingServerSaveRef.current = null;
                try { if (serverSaveTimerRef.current) { clearTimeout(serverSaveTimerRef.current); serverSaveTimerRef.current = null; } } catch (e) {}
                applyRemoteState(remote);
                setTimeout(() => { applyingRemoteRef.current = false; }, 150);
              }
            }
          } catch (e) {}
        });

        ws.addEventListener('close', () => {
          wsRef.current = null;
          try { clearInterval(heartbeatRef.current); } catch (e) {}
          setWsConnected(false);
          scheduleReconnect();
        });

        ws.addEventListener('error', () => {
          try { ws.close(); } catch (e) {}
        });
      } catch (e) {
        scheduleReconnect();
      }
    };

    const scheduleReconnect = () => {
      try {
        reconnectRef.current.attempts = (reconnectRef.current.attempts || 0) + 1;
        const attempt = Math.min(reconnectRef.current.attempts, 6);
        const delay = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 1000);
        try { clearTimeout(reconnectRef.current.timeoutId); } catch (e) {}
        reconnectRef.current.timeoutId = setTimeout(() => { if (mounted) connect(); }, delay);
      } catch (e) {}
    };

    try {
      wsConnectTimerRef.current = setTimeout(() => connect(), 250);
    } catch (e) { connect(); }

    return () => { mounted = false; try { clearInterval(heartbeatRef.current); } catch (e) {}; if (wsRef.current) { try { wsRef.current.close(); } catch (e) {} } if (reconnectRef.current.timeoutId) { try { clearTimeout(reconnectRef.current.timeoutId); } catch (e) {} } try { if (wsConnectTimerRef.current) clearTimeout(wsConnectTimerRef.current); } catch (e) {} };
  }, []);

  // Load full tank info asynchronously and merge into nodes' data (non-blocking).
  useEffect(() => {
    let mounted = true;
      // Poll telemetry periodically and merge only into existing nodes in-memory.
      let pollId = null;
      const doPoll = async () => {
        try {
          const res = await tanqueService.getTanques();
          // instrumentation: record response timestamp
          try { window.__TIMINGS = window.__TIMINGS || {}; window.__TIMINGS.tanques = window.__TIMINGS.tanques || {}; window.__TIMINGS.tanques.response = Date.now(); } catch (e) {}
          const list = (res && res.tanques) || [];
          if (!list || !list.length) return;
          // Fast-path: build direct lookups by tag/id/display_name for immediate update
          const directTagMap = new Map();
          const directIdMap = new Map();
          for (const t of list) {
            if (!t) continue;
            const tagKey = String(t.tag || '').toUpperCase();
            if (tagKey) directTagMap.set(tagKey, t);
            try { if (t.id) directIdMap.set(String(t.id), t); } catch (e) {}
            try { if (t.apiName) directTagMap.set(String(t.apiName).toUpperCase(), t); } catch (e) {}
            try { if (t.display_name) directTagMap.set(String(t.display_name).toUpperCase(), t); } catch (e) {}
          }

          // quick pass: only exact matches (by explicit mapping, tag, id, apiName, display_name)
          const quickMatchedIds = new Set();
          const catalogForQuick = loadCatalog();
          const quickUpdated = (nodesRef.current || []).map((n) => {
            try {
              const nd = (n.data && n.data.nodeData) ? n.data.nodeData : (n.data || {});
              const exactTankTag = EXACT_TANK_TAG_BY_NODE_ID[String(n.id || nd.id || '')] || null;
              let found = null;

              // PROTECT: do not attempt to match generic shape nodes (forma-*) to tanks
              const nodeIdKey = String(n.id || nd.id || '').trim();
              const nodeTypeKey = String(n.type || nd.type || '').toLowerCase();
              const isGenericShape = nodeTypeKey === 'shape' || nodeIdKey.startsWith('forma-');
              const explicitlyMapped = Boolean(EXACT_TANK_TAG_BY_NODE_ID[nodeIdKey] || MACKENFLOC_SHAPE_TAGS[nodeIdKey] || OPERATIONAL_SHAPE_TAGS[nodeIdKey] || FLOW_METRIC_CONFIG[nodeIdKey]);
              if (isGenericShape && !explicitlyMapped) {
                // skip matching for decorative/generic shapes
                return n;
              }

              if (exactTankTag) {
                const key = String(exactTankTag || '').toUpperCase();
                found = directTagMap.get(key) || null;
              }

              // direct tag/id/apiName/display_name fast matches
              if (!found) {
                const tagCandidate = String(nd.tag || nd.apiName || nd.display_name || nd.nombre || '').toUpperCase();
                if (tagCandidate && directTagMap.has(tagCandidate)) {
                  found = directTagMap.get(tagCandidate);
                }
              }
              if (!found) {
                const idCandidate = String(n.id || nd.id || '').trim();
                if (idCandidate && directIdMap.has(idCandidate)) found = directIdMap.get(idCandidate);
              }

              // If quick pass didn't find, leave original node (defer fuzzy matching)
              if (!found) return n;

              if (!found) {
                const candidateValues = [nd.apiName, nd.originalName, nd.tag, nd.display_name, nd.nombre, nd.label, nd.customName, n.id, n.label];
                for (const candidate of candidateValues) {
                  if (candidate == null || String(candidate).trim() === '') continue;
                  const aliases = buildComparableAliases(candidate);
                  for (const alias of aliases) {
                    if (!alias) continue;
                    const direct = aliasMap.get(alias);
                    const fuzzy = !direct ? Array.from(aliasMap.entries()).find(([key, value]) => key && (key === alias || textMatchesComparableAlias(key, alias)))?.[1] : null;
                    const match = direct || fuzzy;
                    if (match) {
                      found = match;
                      try {
                          // diagnostic removed
                      } catch (e) {}
                      break;
                    }
                  }
                  if (found) break;
                }
              }

              if (!found) {
                const labelText = [nd.label, nd.display_name, nd.nombre, nd.customName, nd.apiName, nd.originalName, n.label]
                  .filter((value) => value != null && String(value).trim())
                  .map((value) => String(value).trim())
                  .join(' ');
                if (labelText) {
                  for (const t of list) {
                    if (!t) continue;
                    const tankLabels = [t.tag, t.apiName, t.originalName, t.nombre, t.display_name, t.id, t.label];
                    if (tankLabels.some((value) => value != null && textMatchesComparableAlias(labelText, value))) {
                      found = t;
                      try {
                        // diagnostic removed
                      } catch (e) {}
                      break;
                    }
                  }
                }
              }

              if (!found) return n;

              // preserve any user-locked/custom name and avoid changing layout
              const nameLocked = Boolean(nd.nameLocked || n.nameLocked || (nd && nd.nameLocked));
              const preservedCustom = nameLocked ? (nd.customName || n.customName || '') : (nd.customName || found.display_name || '');

              // Merge API tank with local catalog (calibrated heights) to compute porcentaje consistently
              const mergedApi = (mergeApiTanquesWithCatalog([found || {}], catalogForQuick) || [found])[0] || found;
              const enriched = enrichTankNodeMetrics(mergedApi || {});
              const mergedNodeData = { ...mergeTelemetryPreservingVisual(nd, enriched, n.type), customName: preservedCustom || nd.customName, display_name: preservedCustom || enriched.display_name || nd.display_name };

              // IMPORTANT: do not spread mergedNodeData into the top-level `data` object.
              // Spreading it here previously overwrote visual/design properties (width, height,
              // label, display_name, etc.) causing shapes to resize and show incorrect names.
              // Keep telemetry inside `nodeData` only so design is preserved.
              quickMatchedIds.add(n.id);
              return { ...n, data: { ...(n.data || {}), nodeData: mergedNodeData } };
            } catch (e) { return n; }
          });

          // instrument: measure quick mapping time and changed count
          try {
            window.__TIMINGS = window.__TIMINGS || {};
            const t0 = performance.now();
            const changedCount = quickUpdated.reduce((acc, n, i) => acc + (n === nodesRef.current[i] ? 0 : (n && n.data && n.data.nodeData) !== (nodesRef.current[i] && nodesRef.current[i].data && nodesRef.current[i].data.nodeData) ? 1 : 0), 0);
            nodesRef.current = quickUpdated;
            window.__TIMINGS.district = window.__TIMINGS.district || {};
            window.__TIMINGS.district.quickMapMs = (window.__TIMINGS.district.quickMapMs || 0) + (performance.now() - t0);
            window.__TIMINGS.district.quickChangedCount = (window.__TIMINGS.district.quickChangedCount || 0) + changedCount;
          } catch (e) {}
          try { window.__TIMINGS.tanques.setNodes = Date.now(); } catch (e) {}
          try {
            // mark before setNodes so we can measure until next paint
            try { performance.mark('beforeSetNodes_quick'); } catch (e) {}
            if (rfInstance && typeof rfInstance.setNodes === 'function') {
              rfInstance.setNodes(quickUpdated);
            } else {
              setNodes([...quickUpdated]);
            }
            // measure until next paint (double RAF)
            try {
              requestAnimationFrame(() => requestAnimationFrame(() => {
                try { performance.mark('afterSetNodesPaint_quick'); performance.measure('setNodesToPaint_quick', 'beforeSetNodes_quick', 'afterSetNodesPaint_quick'); const m = performance.getEntriesByName('setNodesToPaint_quick').pop(); if (m) { window.__TIMINGS.district.setNodesToPaintQuickMs = (window.__TIMINGS.district.setNodesToPaintQuickMs || 0) + m.duration; }
                } catch (e) {}
              }));
            } catch (e) {}
          } catch (e) { try { setNodes([...quickUpdated]); } catch (er) {} }

          // schedule deferred full mapping (fuzzy) to avoid blocking the render
          setTimeout(() => {
            try {
                const aliasMap = new Map();
                try {
                  const am0 = performance.now();
                  for (const t of list) {
                    if (!t) continue;
                    const candidateValues = [t.tag, t.apiName, t.originalName, t.nombre, t.display_name, t.id, t.label];
                    for (const candidate of candidateValues) {
                      const aliases = buildComparableAliases(candidate);
                      for (const alias of aliases) {
                        if (alias && !aliasMap.has(alias)) aliasMap.set(alias, t);
                      }
                    }
                  }
                  window.__TIMINGS.district.aliasMapMs = (window.__TIMINGS.district.aliasMapMs || 0) + (performance.now() - am0);
                } catch (e) {}

              const catalogForFull = loadCatalog();
              const tFull0 = performance.now();
              const fullUpdated = (nodesRef.current || []).map((n) => {
                try {
                  // Skip nodes already updated by the quick pass
                  if (quickMatchedIds.has(n.id)) return n;
                  const nd = (n.data && n.data.nodeData) ? n.data.nodeData : (n.data || {});
                  const exactTankTag = EXACT_TANK_TAG_BY_NODE_ID[String(n.id || nd.id || '')] || null;
                  let found = null;

                  if (exactTankTag) {
                    found = list.find((item) => item && String(item.tag || '').toUpperCase() === String(exactTankTag).toUpperCase()) || null;
                  }

                  if (!found) {
                    const candidateValues = [nd.apiName, nd.originalName, nd.tag, nd.display_name, nd.nombre, nd.label, nd.customName, n.id, n.label];
                    for (const candidate of candidateValues) {
                      if (candidate == null || String(candidate).trim() === '') continue;
                      const aliases = buildComparableAliases(candidate);
                      for (const alias of aliases) {
                        if (!alias) continue;
                        const direct = aliasMap.get(alias);
                        const fuzzy = !direct ? Array.from(aliasMap.entries()).find(([key, value]) => key && (key === alias || textMatchesComparableAlias(key, alias)))?.[1] : null;
                        const match = direct || fuzzy;
                        if (match) { found = match; break; }
                      }
                      if (found) break;
                    }
                  }

                  if (!found) {
                    const labelText = [nd.label, nd.display_name, nd.nombre, nd.customName, nd.apiName, nd.originalName, n.label]
                      .filter((value) => value != null && String(value).trim())
                      .map((value) => String(value).trim())
                      .join(' ');
                    if (labelText) {
                      for (const t of list) {
                        if (!t) continue;
                        const tankLabels = [t.tag, t.apiName, t.originalName, t.nombre, t.display_name, t.id, t.label];
                        if (tankLabels.some((value) => value != null && textMatchesComparableAlias(labelText, value))) { found = t; break; }
                      }
                    }
                  }

                  if (!found) return n;

                  const nameLocked = Boolean(nd.nameLocked || n.nameLocked || (nd && nd.nameLocked));
                  const preservedCustom = nameLocked ? (nd.customName || n.customName || '') : (nd.customName || found.display_name || '');
                  const mergedApi = (mergeApiTanquesWithCatalog([found || {}], catalogForFull) || [found])[0] || found;
                  const enriched = enrichTankNodeMetrics(mergedApi || {});
                  const mergedNodeData = { ...mergeTelemetryPreservingVisual(nd, enriched, n.type), customName: preservedCustom || nd.customName, display_name: preservedCustom || enriched.display_name || nd.display_name };
                  return { ...n, data: { ...(n.data || {}), nodeData: mergedNodeData } };
                } catch (e) { return n; }
              });

              const fullMapMs = performance.now() - tFull0;
              try { window.__TIMINGS.district.fullMapMs = (window.__TIMINGS.district.fullMapMs || 0) + fullMapMs; } catch (e) {}
              nodesRef.current = fullUpdated;
              try { window.__TIMINGS.tanques.fullSetNodes = Date.now(); } catch (e) {}
              try {
                try { performance.mark('beforeSetNodes_full'); } catch (e) {}
                if (rfInstance && typeof rfInstance.setNodes === 'function') {
                  rfInstance.setNodes(fullUpdated);
                } else {
                  setNodes([...fullUpdated]);
                }
                try {
                  requestAnimationFrame(() => requestAnimationFrame(() => {
                    try { performance.mark('afterSetNodesPaint_full'); performance.measure('setNodesToPaint_full', 'beforeSetNodes_full', 'afterSetNodesPaint_full'); const m = performance.getEntriesByName('setNodesToPaint_full').pop(); if (m) { window.__TIMINGS.district.setNodesToPaintFullMs = (window.__TIMINGS.district.setNodesToPaintFullMs || 0) + m.duration; }
                    } catch (e) {}
                  }));
                } catch (e) {}
              } catch (e) { try { setNodes([...fullUpdated]); } catch (er) {} }
            } catch (e) {}
          }, 0);
        } catch (e) { /* ignore telemetry errors */ }
      };

      // initial poll and periodic refresh (5s)
      doPoll();
      pollId = setInterval(() => doPoll(), 5000);
      return () => { mounted = false; try { if (pollId) clearInterval(pollId); } catch (e) {} };
  }, []);

  // PTAP metrics (Mackenfloc capacities) — subscribe to module-scoped PTAP polling
  useEffect(() => {
    try {
      _ensurePtapMetricsPolling();
      const listener = (map) => {
        try {
          if (!map) return;
          // quick pass: direct tag matches
          const quickMatchedPtap = new Set();
          const quick = (nodesRef.current || []).map((n) => {
            try {
              const nd = (n.data && n.data.nodeData) ? { ...(n.data.nodeData) } : (n.data || {});
              let nextNodeData = { ...nd };
              const exactTag = getExactMackenflocTagForNode(n, nextNodeData, map);
              const resolvedShapeTag = resolveLivePtapTagForNode(n, map, exactTag);
              // try direct lookup by resolvedShapeTag or node's stored tag
              const keyTag = String(resolvedShapeTag || nextNodeData.tag || nextNodeData.id || '').toUpperCase();
              if (keyTag && map && map[keyTag]) {
                const variable = map[keyTag];
                const metricText = _formatMetric(variable);
                const finalTag = keyTag || '';
                const isMacken = String(finalTag || '').toUpperCase().includes('MACKENFLOC');
                nextNodeData = { ...nextNodeData, ptapMetricText: metricText || null, ptapMetricLabel: metricText ? null : null, ptapMetricAbove: isMacken ? false : true, ptapMetricRaw: variable || null };
                quickMatchedPtap.add(n.id);
                return { ...n, data: { ...(n.data || {}), nodeData: nextNodeData } };
              }
              return n;
            } catch (e) { return n; }
          });
          nodesRef.current = quick;
          try { window.__TIMINGS = window.__TIMINGS || {}; window.__TIMINGS.ptap = window.__TIMINGS.ptap || {}; window.__TIMINGS.ptap.setNodes = Date.now(); } catch (e) {}
          try {
            if (rfInstance && typeof rfInstance.setNodes === 'function') rfInstance.setNodes(quick);
            else setNodes([...quick]);
          } catch (e) { try { setNodes([...quick]); } catch (er) {} }

          // deferred full mapping
          setTimeout(() => {
            try {
              const updated = (nodesRef.current || []).map((n) => {
                try {
                  if (quickMatchedPtap.has(n.id)) return n;
                  const nd = (n.data && n.data.nodeData) ? { ...(n.data.nodeData) } : (n.data || {});
                  let nextNodeData = { ...nd };

                  const shapeTag = getExactMackenflocTagForNode(n, nextNodeData, map);
                  const resolvedShapeTag = resolveLivePtapTagForNode(n, map, shapeTag);
                  const runtimeMatch = findMetricVariableForNode(n, map);
                  if (resolvedShapeTag || runtimeMatch.tag) {
                    const variable = runtimeMatch.variable || (resolvedShapeTag && map && map[resolvedShapeTag] ? map[resolvedShapeTag] : null);
                    const metricText = _formatMetric(variable);
                    let metricLabel = null;
                    const finalTag = runtimeMatch.tag || resolvedShapeTag || '';
                    try {
                      if (String(finalTag || '').includes('MACKENFLOC')) {
                        const match = String(finalTag || '').match(/MACKENFLOC[_-]?P?([0-9]+)[_-]?T?([0-9]+)/i);
                        if (match) {
                          metricLabel = `Mackenfloc P${match[1]} T${match[2]}`;
                        } else {
                          metricLabel = 'Mackenfloc';
                        }
                      } else if (String(finalTag || '').includes('PARSHALL') || String(finalTag || '').includes('CREAGER')) {
                        metricLabel = 'Caudal';
                      }
                    } catch (e) {}
                    const isMacken = String(finalTag || '').toUpperCase().includes('MACKENFLOC');
                    nextNodeData = { ...nextNodeData, ptapMetricText: metricText || null, ptapMetricLabel: metricText ? (metricLabel || null) : null, ptapMetricAbove: isMacken ? false : true, ptapMetricRaw: variable || null };
                    return { ...n, data: { ...(n.data || {}), nodeData: nextNodeData } };
                  }

                  const nodeLabel = ((nd && (nd.label || nd.display_name || nd.customName || nd.nombre)) || n.label || '') + '';
                  const labelKey = (nodeLabel || '').toString().trim().toUpperCase();
                  if (labelKey) {
                    for (const [tag, variable] of Object.entries(map || {})) {
                      try {
                        const tUpper = String(tag || '').toUpperCase();
                        const normalizedLabel = labelKey.replace(/\s+/g, '_');
                        const isChembeMetric = String(n.id || nd.id || '').trim() === 'ptap-chembe';
                        if (tUpper.includes(normalizedLabel) || tUpper.includes(labelKey)) {
                          const metricText = _formatMetric(variable);
                          if (metricText !== null && metricText !== undefined && metricText !== '') {
                            nextNodeData = {
                              ...nextNodeData,
                              ptapMetricText: metricText,
                              ptapMetricAbove: !isChembeMetric ? true : true,
                              ptapMetricLabel: null,
                              ptapMetricRaw: variable || null,
                            };
                            break;
                          }
                        }
                      } catch (e) {}
                    }
                  }

                  return { ...n, data: { ...(n.data || {}), nodeData: nextNodeData } };
                } catch (e) { return n; }
              });
              nodesRef.current = updated;
              try {
                if (rfInstance && typeof rfInstance.setNodes === 'function') rfInstance.setNodes(updated);
                else setNodes([...updated]);
              } catch (e) { try { setNodes([...updated]); } catch (er) {} }
            } catch (e) {}
          }, 0);
        } catch (e) {}
      };

      _ptapMetricsListeners.add(listener);
      // initial load
      _loadPtapMetrics().then((m) => { try { listener(m); } catch (e) {} });
      return () => { try { _ptapMetricsListeners.delete(listener); } catch (e) {} };
    } catch (e) {}
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
              if (mounted && typeof applyRemoteState === 'function') {
                applyRemoteState(remote);
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
      lockedPosition: source.lockedPosition ?? node?.data?.lockedPosition ?? prev.lockedPosition ?? false,
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
  // Saved snapshots history (server-confirmed versions) used by Undo/Redo.
  // Transient drag/edit state must not feed the saved history stack.
  const savedPastRef = useRef([]);
  const savedFutureRef = useRef([]);
  const undoBusyRef = useRef(false);
  const clearTransientHistory = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
  }, []);
  const nodesRef = useRef([]);
  const edgesRef = useRef([]);
  // Guard to mark short-lived remote application so persistence handlers can ignore
  const applyingRemoteRef = useRef(false);
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
      // Transient drag/move edits are intentionally not part of the saved undo stack.
      clearTransientHistory();
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
      // If we're currently applying a remote authoritative state, do not persist.
      if (applyingRemoteRef.current) {
        try { console.debug('[DIAGRAM] persistDistrictState suppressed due to remote application'); } catch (e) {}
        return;
      }

      const currentNodes = Array.isArray(nodesRef.current) ? nodesRef.current : [];
      const currentEdges = Array.isArray(edgesRef.current) ? edgesRef.current : [];
      const resolvedNextNodes = Array.isArray(nextNodes) ? nextNodes : currentNodes;
      const resolvedNextEdges = Array.isArray(nextEdges) ? nextEdges : currentEdges;

      const currentNodeKeys = currentNodes.map((n) => n && n.id).filter(Boolean).join('|');
      const nextNodeKeys = resolvedNextNodes.map((n) => n && n.id).filter(Boolean).join('|');
      const currentEdgeKeys = currentEdges.map((e) => e && e.id).filter(Boolean).join('|');
      const nextEdgeKeys = resolvedNextEdges.map((e) => e && e.id).filter(Boolean).join('|');

      const staleSnapshot = !!(
        (currentNodeKeys && nextNodeKeys && currentNodeKeys !== nextNodeKeys) ||
        (currentNodeKeys && !nextNodeKeys && currentNodes.length > 0) ||
        (currentEdgeKeys && nextEdgeKeys && currentEdgeKeys !== nextEdgeKeys)
      );

      const authoritativeNodes = (!options.force && staleSnapshot) ? currentNodes : resolvedNextNodes;
      const authoritativeEdges = (!options.force && staleSnapshot) ? currentEdges : resolvedNextEdges;

      // Use local cache as baseline by default; caller can request skip via options.skipReadBaseline
      const baseline = options.skipReadBaseline ? {} : readDiagramState();
      const raw = { ...(baseline || {}) };
      const hiddenIds = new Set(Array.isArray(options.hiddenNodeIds) ? options.hiddenNodeIds.filter((id) => id != null && String(id).trim() !== '') : []);
      const deletedIds = new Set(Array.isArray(options.deletedNodeIds) ? options.deletedNodeIds.filter((id) => id != null && String(id).trim() !== '') : []);
      const persistedRemovedIds = new Set([
        ...(Array.isArray(raw.hiddenNodeIds) ? raw.hiddenNodeIds.filter((id) => id != null && String(id).trim() !== '') : []),
        ...(Array.isArray(raw.deletedNodeIds) ? raw.deletedNodeIds.filter((id) => id != null && String(id).trim() !== '') : []),
        ...hiddenIds,
        ...deletedIds,
      ]);
      const savedNodes = {};
      (authoritativeNodes || []).forEach((n) => {
        const prev = raw.nodes && raw.nodes[n.id] && typeof raw.nodes[n.id] === 'object' ? raw.nodes[n.id] : {};
        savedNodes[n.id] = getPersistedNodeEntry(n, prev);
      });
      raw.nodes = Object.fromEntries(Object.entries(savedNodes).filter(([id]) => !persistedRemovedIds.has(id)));
      raw.edges = Array.isArray(authoritativeEdges) ? authoritativeEdges.filter((edge) => {
        const source = edge && edge.source != null ? String(edge.source) : '';
        const target = edge && edge.target != null ? String(edge.target) : '';
        return !persistedRemovedIds.has(source) && !persistedRemovedIds.has(target);
      }) : [];
      // hiddenNodeIds: allow removal or explicit set via options
      if (Array.isArray(options.hiddenNodeIds)) {
        raw.hiddenNodeIds = options.hiddenNodeIds;
      } else if (Array.isArray(options.removeHiddenNodeIds)) {
        const existing = Array.isArray(raw.hiddenNodeIds) ? raw.hiddenNodeIds : [];
        raw.hiddenNodeIds = existing.filter(id => !((options.removeHiddenNodeIds || []).includes(id)));
      } else {
        raw.hiddenNodeIds = Array.isArray(raw.hiddenNodeIds) ? raw.hiddenNodeIds : [];
      }

      // deletedNodeIds: support append/overwrite semantics
      if (Array.isArray(options.deletedNodeIds) && options.appendDeletedIds) {
        const existingDeleted = Array.isArray(raw.deletedNodeIds) ? raw.deletedNodeIds : [];
        raw.deletedNodeIds = [...new Set([...(existingDeleted || []), ...(options.deletedNodeIds || [])].filter(id => id != null && String(id).trim() !== ''))];
      } else if (Array.isArray(options.deletedNodeIds)) {
        raw.deletedNodeIds = options.deletedNodeIds;
      } else {
        raw.deletedNodeIds = Array.isArray(raw.deletedNodeIds) ? raw.deletedNodeIds : [];
      }

      const finalRemovedIds = new Set([
        ...(Array.isArray(raw.hiddenNodeIds) ? raw.hiddenNodeIds.filter((id) => id != null && String(id).trim() !== '') : []),
        ...(Array.isArray(raw.deletedNodeIds) ? raw.deletedNodeIds.filter((id) => id != null && String(id).trim() !== '') : []),
      ]);
      raw.nodes = Object.fromEntries(Object.entries(raw.nodes).filter(([id]) => !finalRemovedIds.has(id)));
      raw.edges = Array.isArray(raw.edges) ? raw.edges.filter((edge) => {
        const source = edge && edge.source != null ? String(edge.source) : '';
        const target = edge && edge.target != null ? String(edge.target) : '';
        return !finalRemovedIds.has(source) && !finalRemovedIds.has(target);
      }) : [];
      // allow callers to force a server save even if autosave is disabled
      // and optionally set a global district lock flag that prevents remote updates
      const forceSave = !!options.force;
      const setLocked = !!options.locked;
      if (setLocked) {
        try { raw.district_locked = 1; } catch (e) {}
        try { localStorage.setItem('district_locked', '1'); } catch (e) {}
      }
      // Always persist changes — deletes, renames, and moves should always save
      if (true) {
        // Validate before attempting server save
        try {
          if (!_validateBeforeSave(raw, baseline)) {
            console.warn('[DIAGRAM] Persist aborted: payload failed validation');
            try { if (typeof onDirtyChanged === 'function') onDirtyChanged(true); } catch (e) {}
          } else {
            // Pass through diagnostic op id if present
            try {
              if (typeof window !== 'undefined' && window.__TRACE_NODE_ID) {
                try { console.debug('[TRACE] persistDistrictState preparing payload for', window.__TRACE_NODE_ID, (raw && raw.nodes) ? raw.nodes[window.__TRACE_NODE_ID] : null); } catch (e) {}
              }
            } catch (e) {}
            writeDiagramState(raw, { ...(options || {}), sendToServer: options.sendToServer !== false });
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

    const opId = `rename:${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    try { console.debug('[DIAG] applyNodeRename start', opId, 'id=', id, 'newLabel=', clean); } catch (e) {}

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
          openEditor: false,
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
    try { console.debug('[DIAG] applyNodeRename: post-update nodesRef snapshot for', id, nodesRef.current.find(n=>n.id===id)); } catch (e) {}
    // Persist rename using the current React Flow state as authoritative
    // and avoid reading baseline which could overwrite the new label.
    persistDistrictState(nextNodes, edgesRef.current, { skipReadBaseline: true, _diagOpId: opId });
    // UI update is handled by updating nodesRef.current and setNodes above.
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
      try { const opId = `color:${Date.now()}-${Math.random().toString(36).slice(2,7)}`; console.debug('[DIAG] changeSelectedNodeColor', opId, 'id=', idToUpdate, 'color=', color); persistDistrictState(updated, edgesRef.current, { _diagOpId: opId }); } catch (e) {}
      return updated;
    });
  }, [selectedNodeId, persistDistrictState]);

  const changeSelectedNodeShape = useCallback(async (targetId = selectedNodeId, nextShapeType = null) => {
    const idToUpdate = targetId || selectedNodeId;
    const nextType = String(nextShapeType || '').trim();
    if (!idToUpdate || !nextType) return false;

    const currentNodes = Array.isArray(nodesRef.current) ? nodesRef.current : [];
    const currentNode = currentNodes.find((n) => n.id === idToUpdate) || null;
    if (!currentNode) return false;

    const sourceData = (currentNode.data && currentNode.data.nodeData) || (currentNode.data || {});
    const currentShapeType = String(sourceData.shapeType || currentNode.shapeType || '').trim();
    if (currentNode.type === 'shape' && currentShapeType === nextType) return false;

    const updated = currentNodes.map((n) => {
      if (n.id !== idToUpdate) return n;
      const previousData = (n.data && n.data.nodeData) || (n.data || {});
      const nextNodeData = {
        ...previousData,
        id: n.id,
        type: 'shape',
        shapeType: nextType,
        width: Number.isFinite(Number(previousData.width)) ? Number(previousData.width) : 120,
        height: Number.isFinite(Number(previousData.height)) ? Number(previousData.height) : 68,
      };

      return {
        ...n,
        type: 'shape',
        shapeType: nextType,
        draggable: diagramModeRef.current === 'edit',
        data: {
          ...(n.data || {}),
          type: 'shape',
          shapeType: nextType,
          nodeData: nextNodeData,
        },
      };
    });

    nodesRef.current = updated;
    setNodes([...updated]);

    try {
      const previousState = readDiagramState();
      const payload = {
        ...(previousState && typeof previousState === 'object' ? previousState : {}),
        nodes: Object.fromEntries(updated.map((n) => {
          const previous = previousState?.nodes?.[n.id] || {};
          return [n.id, getPersistedNodeEntry(n, previous)];
        })),
        edges: Array.isArray(edgesRef.current) ? edgesRef.current : [],
        updated_at: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Persist exact figure locally first. If an older autosave is still
      // in flight, let it finish before sending this newer snapshot so it can
      // never overwrite the selected figure afterwards.
      writeDiagramState(payload, { source: 'local', sendToServer: false });
      let waits = 0;
      while (savingRef.current && waits < 80) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        waits += 1;
      }
      pendingServerSaveRef.current = null;

      const ok = await diagramService.saveState(payload);
      if (!ok) return false;
      writeDiagramState(payload, { source: 'remote', sendToServer: false });

      window.location.reload();
      return true;
    } catch (e) {
      console.warn('[DIAGRAM] cambio de figura no pudo guardarse', e);
      return false;
    }
  }, [selectedNodeId, readDiagramState, getPersistedNodeEntry, writeDiagramState]);

  // Set a manual percentage for a single node. Persist minimal config only.
  const setNodeManualPercentage = useCallback((id, pct) => {
    if (!id) return;
    const parsed = Number.isFinite(Number(pct)) ? Number(pct) : null;
    const updated = (nodesRef.current || []).map((n) => {
      if (n.id !== id) return n;
      const sourceData = (n.data && n.data.nodeData) || (n.data || {});
      const nivel = Number.isFinite(Number(sourceData.valor_m ?? sourceData.nivel)) ? Number(sourceData.valor_m ?? sourceData.nivel) : null;
      const manual_rebose_override = (parsed != null && nivel != null && parsed > 0) ? Number((nivel * 100) / parsed) : null;
      const nextNodeData = {
        ...(sourceData || {}),
        manual_porcentaje: parsed,
        manual_rebose_override: manual_rebose_override,
      };
      return { ...n, data: { ...(n.data || {}), nodeData: nextNodeData, ...nextNodeData } };
    });
    nodesRef.current = updated;
    try { setNodes([...updated]); } catch (e) {}
    try { persistDistrictState(updated, edgesRef.current); } catch (e) {}
  }, [persistDistrictState]);

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
      diagramModeRef.current = 'edit';

      // Obtener nodos actuales de ReactFlow (posiciones exactas en pantalla)
      const currentNodes = rfInstance && typeof rfInstance.getNodes === 'function'
        ? rfInstance.getNodes()
        : (nodesRef.current || []);

      draftPositionsRef.current = new Map((currentNodes || []).map((n) => [
        n.id,
        sanitizePosition(n.position || {}),
      ]));

      const updated = currentNodes.map((n) => {
        const prevData = (n.data && n.data.nodeData) || (n.data || {});
        const newNodeData = { ...(prevData || {}), lockedPosition: false };
        return {
          ...n,
          draggable: true,
          data: { ...(n.data || {}), lockedPosition: false, nodeData: newNodeData },
        };
      });
      nodesRef.current = updated;
      try { setNodes([...updated]); } catch (e) {}

      // Actualizar localStorage: desbloquear todos
      const saved = readDiagramState();
      saved.nodes = saved.nodes || {};
      for (const id of Object.keys(saved.nodes)) saved.nodes[id] = { ...(saved.nodes[id] || {}), lockedPosition: false };
      try { if (autoSaveEnabledRef.current) localStorage.setItem('district_state', JSON.stringify(saved)); } catch (e) {}
      try { localStorage.setItem('district_locked', '0'); } catch (e) {}
      try { persistDistrictState(nodesRef.current, edgesRef.current, { force: true, locked: false }); } catch (e) {}
    } catch (e) { console.warn('[DISTRICT] editUnlockAllNodes failed', e && e.message); }
  }, [rfInstance, persistDistrictState, readDiagramState]);

  const saveAndLockAllNodes = useCallback(async () => {
    try {
      diagramModeRef.current = 'view';

      // Obtener nodos actuales de ReactFlow (posiciones exactas donde el usuario los dejó)
      const currentNodes = rfInstance && typeof rfInstance.getNodes === 'function'
        ? rfInstance.getNodes()
        : (nodesRef.current || []);

      const updated = currentNodes.map((n) => {
        const prevData = (n.data && n.data.nodeData) || (n.data || {});
        const newNodeData = { ...(prevData || {}), lockedPosition: true };
        return {
          ...n,
          draggable: false,
          data: { ...(n.data || {}), lockedPosition: true, nodeData: newNodeData },
        };
      });
      nodesRef.current = updated;
      draftPositionsRef.current.clear();
      try { setNodes([...updated]); } catch (e) {}

      // Un solo camino de persistencia. Evita el POST duplicado + reload que
      // podía dejar ganar a un snapshot viejo y reubicar el diagrama.
      try {
        persistDistrictState(updated, edgesRef.current, {
          force: true,
          locked: true,
          sendToServer: true,
          skipReadBaseline: true,
        });
      } catch (e) {}
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
      try { const opId = `rotate:${Date.now()}-${Math.random().toString(36).slice(2,7)}`; console.debug('[DIAG] rotateSelectedNode', opId, 'id=', targetId, 'direction=', direction); persistDistrictState(updated, edgesRef.current, { _diagOpId: opId }); } catch (e) {}
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

  const persistConnection = useCallback((nextEdges, options = {}) => {
    try {
      // Persist via the central persistDistrictState so it's guarded by autosave preference
      persistDistrictState(nodesRef.current, nextEdges || [], options);
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
      // Do NOT persist on immediate size change; explicit save via `Guardar` must be used
      try { console.debug('[DistrictFlow] resizeSelectedNode applied for', targetId, 'w,h=', (updated.find(x => x.id === targetId) || {}).width, (updated.find(x => x.id === targetId) || {}).height); } catch (e) {}
    } catch (e) { console.error(e); }
  }, [selectedNodeId, persistDistrictState]);

  // Independent width / height controls (runtime-only until explicit save)
  const changeSelectedWidth = useCallback((delta = 0) => {
    try {
      if (!selectedNodeId) return;
      resizeSelectedNode(selectedNodeId, delta, 0);
    } catch (e) {}
  }, [selectedNodeId, resizeSelectedNode]);

  const changeSelectedHeight = useCallback((delta = 0) => {
    try {
      if (!selectedNodeId) return;
      resizeSelectedNode(selectedNodeId, 0, delta);
    } catch (e) {}
  }, [selectedNodeId, resizeSelectedNode]);

  const updateSelectedConnectionStyle = useCallback((edgeId = selectedEdgeId, nextStyle = {}) => {
    if (!edgeId) return;
    const updated = (edgesRef.current || []).map((e) => {
      if (e.id !== edgeId) return e;
      const style = { ...(e.style || {}), ...(nextStyle || {}) };
      const stroke = style.stroke || e.markerEnd?.color || '#000';
      return {
        ...e,
        style,
        markerEnd: { ...(e.markerEnd || {}), type: MarkerType.ArrowClosed, color: stroke, width: e.markerEnd?.width || 10, height: e.markerEnd?.height || 10 },
      };
    });
    setEdges(updated);
    edgesRef.current = updated;
    try { const opId = `edge-style:${Date.now()}-${Math.random().toString(36).slice(2,7)}`; persistDistrictState(nodesRef.current, updated, { _diagOpId: opId }); } catch (e) {}
  }, [selectedEdgeId, persistDistrictState]);

  const updateSelectedEdgeLabel = useCallback((edgeId = selectedEdgeId, newLabel = '') => {
    if (!edgeId) return;
    const updated = (edgesRef.current || []).map((e) => e.id === edgeId ? ({ ...e, label: newLabel }) : e);
    setEdges(updated);
    edgesRef.current = updated;
    try { const opId = `edge-label:${Date.now()}-${Math.random().toString(36).slice(2,7)}`; console.debug('[DIAG] updateSelectedEdgeLabel', opId, 'edge=', edgeId, 'label=', newLabel); persistDistrictState(nodesRef.current, updated, { _diagOpId: opId }); } catch (e) {}
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
      markerEnd: { type: MarkerType.ArrowClosed, color: '#000', width: 10, height: 10 },
      type: defaultEdgeType || 'step',
      animated: false,
      style: { stroke: '#000', strokeWidth: 3.5, strokeLinecap: 'round' },
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

    // In transient editing, do not feed saved undo history.
    clearTransientHistory();

    const nextNodes = (nodesRef.current || []).filter((n) => n.id !== targetId);
    const nextEdges = (edgesRef.current || []).filter((edge) => edge.source !== targetId && edge.target !== targetId);

    // Apply deletion locally first
    setNodes(nextNodes);
    setEdges(nextEdges);
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    setSelectedNodeId(null);
    if (onNodeSelect) onNodeSelect(null);

    try {
      // Persist deletion: append to deletedNodeIds and remove from hiddenNodeIds without rehydrating/restoring nodes
      const opId = `delete-node:${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
      try { console.debug('[DIAG] deleteSelectedNode start', opId, 'targetId=', targetId, 'nodesBefore=', (nodesRef.current||[]).length); } catch (e) {}
      persistDistrictState(nextNodes, nextEdges, { deletedNodeIds: [targetId], appendDeletedIds: true, removeHiddenNodeIds: [targetId], _diagOpId: opId });
      try { console.debug('[DIAG] deleteSelectedNode persisted, opId=', opId); } catch (e) {}
    } catch (err) { console.warn('[DistrictFlow] persist on delete failed', err && err.message); }
    return true;
  }, [persistDistrictState, readDiagramState, selectedNodeId, writeDiagramState, onNodeSelect]);

  // Apply remote persisted state incrementally without reloading the page
  const applyRemoteState = useCallback((remote) => {
    try {
      try { console.debug('[REMOTE APPLY] remote keys:', remote && typeof remote === 'object' ? Object.keys(remote).length : 0, 'nodesType:', remote && remote.nodes ? typeof remote.nodes : 'none'); } catch (e) {}
      if (!remote || typeof remote !== 'object') return;
      const remoteTs = (remote.updated_at || remote.updatedAt || remote._updatedAt || '').toString();
      const localRaw = (function() { try { return localStorage.getItem('district_state') || '{}'; } catch (e) { return '{}'; }})();
      const localState = JSON.parse(localRaw || '{}');
      const localTs = (localState.updated_at || localState.updatedAt || localState._updatedAt || '').toString();
      if (remoteTs && localTs) {
        const remoteTime = new Date(remoteTs).getTime();
        const localTime = new Date(localTs).getTime();
        if (Number.isFinite(remoteTime) && Number.isFinite(localTime) && remoteTime < localTime) return;
      }

      const remoteNodes = remote.nodes && typeof remote.nodes === 'object' ? remote.nodes : {};
      const remoteEdges = Array.isArray(remote.edges) ? remote.edges : [];
      const hiddenNodeIds = Array.isArray(remote.hiddenNodeIds) ? remote.hiddenNodeIds.filter((id) => id != null && String(id).trim() !== '') : [];
      const deletedNodeIds = Array.isArray(remote.deletedNodeIds) ? remote.deletedNodeIds.filter((id) => id != null && String(id).trim() !== '') : [];
      const removedIds = new Set([...hiddenNodeIds, ...deletedNodeIds]);

      const sanitizedRemote = Object.fromEntries(
        Object.entries(remoteNodes)
          .filter(([id]) => !removedIds.has(id))
          .map(([id, entry]) => [id, sanitizePersistedNodeVisual(entry)])
      );

      // Diagnostic tracing: record incoming vs current customName decisions
      try {
        if (typeof window !== 'undefined') {
          window.__REHYDRATION_TRACE = window.__REHYDRATION_TRACE || [];
          const remoteTsForTrace = remote._updatedAt || remote.updated_at || remote.updatedAt || '';
          Object.entries(sanitizedRemote).forEach(([rid, rEntry]) => {
            try {
              const curr = (nodesRef.current || []).find(n => n.id === rid) || {};
              const currData = (curr.data && curr.data.nodeData) ? curr.data.nodeData : (curr.data || {});
              const prevCustom = (currData && currData.customName) || curr.customName || '';
              const incomingCustom = rEntry && rEntry.customName ? rEntry.customName : '';
              const decision = ((incomingCustom == null || incomingCustom === '') && prevCustom) ? 'keep-prev' : (incomingCustom ? 'use-incoming' : 'none');
              window.__REHYDRATION_TRACE.push({ id: rid, prevCustom: prevCustom || null, incomingCustom: incomingCustom || null, decision, remoteTs: remoteTsForTrace, at: new Date().toISOString() });
            } catch (e) { /* ignore trace errors */ }
          });
        }
      } catch (e) {}

      const current = (Array.isArray(nodesRef.current) ? [...nodesRef.current] : []).filter((n) => !removedIds.has(n.id));
      const existingIds = new Set(current.map(n => n.id));

      const updated = current.map((n) => {
        const r = sanitizedRemote[n.id];
        if (!r) return n;
        const editing = diagramModeRef.current === 'edit';
        const currentNodeData = (n.data && n.data.nodeData) ? n.data.nodeData : (n.data || {});
        let mergedRemoteEntry = preserveLiveMetricValues(currentNodeData, r);

        if (editing) {
          // El usuario está editando: conservar el diseño local mientras sí
          // permitimos que la telemetría viva continúe actualizándose.
          mergedRemoteEntry = {
            ...mergedRemoteEntry,
            type: n.type || currentNodeData.type || r.type,
            shapeType: currentNodeData.shapeType ?? r.shapeType,
            width: currentNodeData.width ?? r.width,
            height: currentNodeData.height ?? r.height,
            rotation: currentNodeData.rotation ?? r.rotation,
            customColor: currentNodeData.customColor ?? r.customColor,
            color: currentNodeData.color ?? r.color,
            customName: currentNodeData.customName ?? r.customName,
            label: currentNodeData.label ?? r.label,
            lockedPosition: false,
          };
        }

        const mergedVisual = preserveLiveMetricValues(n.data || {}, mergedRemoteEntry);
        const draftPosition = draftPositionsRef.current.get(n.id);
        const position = editing
          ? sanitizePosition(draftPosition || n.position || { x: r.x, y: r.y })
          : sanitizePosition({ x: r.x, y: r.y });
        const effectiveType = editing ? (n.type || r.type || 'tank') : (r.type || n.type || 'tank');
        const nodeData = ensureNodeData({ id: n.id, type: effectiveType, label: mergedRemoteEntry.label || r.label, position, data: mergedVisual });

        try {
          const manualPct = Number.isFinite(Number(nodeData.manual_porcentaje)) ? Number(nodeData.manual_porcentaje) : null;
          const nivelNum = Number.isFinite(Number(nodeData.valor_m ?? nodeData.nivel)) ? Number(nodeData.valor_m ?? nodeData.nivel) : null;
          if (manualPct != null && nivelNum != null && manualPct > 0) {
            const recomputed = Number((nivelNum * 100) / manualPct);
            if (nodeData.manual_rebose_override == null || Number(nodeData.manual_rebose_override) !== recomputed) {
              nodeData.manual_rebose_override = recomputed;
            }
          }
        } catch (e) {}
        const visualData = stripRuntimeTelemetry({ ...(n.data || {}), ...mergedVisual });
        return {
          ...n,
          type: effectiveType,
          draggable: editing ? true : n.draggable,
          position,
          customName: nodeData.customName || n.customName || r.customName || '',
          label: nodeData.label || n.label || r.label || n.id,
          data: { ...visualData, type: effectiveType, lockedPosition: editing ? false : visualData.lockedPosition, nodeData },
        };
      });

      // Add nodes that exist remotely but not locally
      for (const [id, r] of Object.entries(sanitizedRemote)) {
        if (existingIds.has(id)) continue;
        const position = sanitizePosition({ x: r.x, y: r.y });
        const nodeData = ensureNodeData({ id, type: r.type, label: r.label, position, data: r });
        try {
          const manualPct = Number.isFinite(Number(nodeData.manual_porcentaje)) ? Number(nodeData.manual_porcentaje) : null;
          const nivelNum = Number.isFinite(Number(nodeData.valor_m ?? nodeData.nivel)) ? Number(nodeData.valor_m ?? nodeData.nivel) : null;
          if (manualPct != null && nivelNum != null && manualPct > 0) {
            const recomputed = Number((nivelNum * 100) / manualPct);
            if (nodeData.manual_rebose_override == null || Number(nodeData.manual_rebose_override) !== recomputed) {
              nodeData.manual_rebose_override = recomputed;
            }
          }
        } catch (e) {}
        updated.push({ id, type: r.type || 'tank', position, customName: r.customName || '', nameLocked: !!r.nameLocked, label: r.label || id, data: { ...r, customName: r.customName || '', label: r.label || id, nodeData } });
      }

      const normalizedEdges = (remoteEdges || [])
        .filter((edge) => !removedIds.has(String(edge && edge.source)) && !removedIds.has(String(edge && edge.target)))
        .filter(isValidSavedEdge)
        .map((edge) => normalizeSavedEdge(edge, {
          animated: !!showFlow,
          type: 'step',
          markerEnd: { type: MarkerType.ArrowClosed, color: '#000' },
          style: { stroke: '#000', strokeWidth: 5, strokeLinecap: 'round' },
        })).filter((edge) => edge && edge.source && edge.target);

      // Update in-memory and UI state.
      // Remote state is applied only as a view update; it must not trigger a save loop.
      try { applyingRemoteRef.current = true; } catch (e) {}
      try { if (serverBackoffRef.current && serverBackoffRef.current.timeoutId) { clearTimeout(serverBackoffRef.current.timeoutId); serverBackoffRef.current.timeoutId = null; } serverBackoffRef.current.attempts = 0; } catch (e) {}
      nodesRef.current = updated;
      edgesRef.current = normalizedEdges;
      try { console.debug('[REMOTE APPLY] sanitizedRemoteCount=', Object.keys(sanitizedRemote).length, 'updatedLen=', (updated||[]).length, 'edges=', (normalizedEdges||[]).length); } catch (e) {}
      try {
        if (typeof window !== 'undefined' && window.__TRACE_NODE_ID) {
          const t = String(window.__TRACE_NODE_ID);
          try {
            const incoming = sanitizedRemote[t] || null;
            const current = (nodesRef.current || []).find(n=>n.id===t) || null;
            const updatedNode = (updated || []).find(n=>n.id===t) || null;
            console.debug('[TRACE] applyRemoteState for', t, 'incoming=', incoming, 'current=', current && (current.data || current.data && current.data.nodeData) , 'updated=', updatedNode && (updatedNode.data || updatedNode.data && updatedNode.data.nodeData));
          } catch (e) {}
        }
      } catch (e) {}
      try { setNodes([...updated]); } catch (e) {}
      try { setEdges(normalizedEdges); } catch (e) {}
      // After applying remote visual state, proactively fetch live telemetry
      // for any nodes that lack metric fields so both clients display real data
      // independently (avoid showing "Sin datos" when server has telemetry).
      (async () => {
        try {
          const res = await tanqueService.getTanques();
          const list = (res && res.tanques) || [];
          if (!list || !list.length) return;
          const map = new Map();
          for (const t of list) {
            if (!t) continue;
            const candidates = [t.tag, t.apiName, t.nombre, t.display_name, t.id];
            for (const c of candidates) {
              try { if (c != null && String(c).trim()) map.set(String(c).toLowerCase(), t); } catch (e) {}
            }
          }

          let changed = false;
          const catalog = loadCatalog();
          const mergedNodes = (nodesRef.current || []).map((n) => {
            try {
              const nd = (n.data && n.data.nodeData) ? n.data.nodeData : (n.data || {});
              const hasMetrics = nd && (nd.valor_m != null || nd.porcentaje != null || nd.porcentaje_capacidad != null);
              if (hasMetrics) return n;

              const candidates = [nd.apiName, nd.originalName, nd.tag, nd.display_name, nd.nombre, nd.label, n.id].map(x => String(x || '').toLowerCase());
              let found = null;
              for (const c of candidates) { if (!c) continue; if (map.has(c)) { found = map.get(c); break; } }
              if (!found) return n;

              const mergedApi = (mergeApiTanquesWithCatalog([found || {}], catalog) || [found])[0] || found;
              const enriched = enrichTankNodeMetrics(mergedApi || {});

              const mergedRemoteEntry = mergeTelemetryPreservingVisual(nd, enriched, n.type);
              const mergedVisual = preserveLiveMetricValues(n.data || {}, mergedRemoteEntry);
              const visualData = stripRuntimeTelemetry({ ...(n.data || {}), ...mergedVisual });

              const updatedNode = {
                ...n,
                data: { ...visualData, nodeData: { ...(mergedRemoteEntry || {}) } },
              };
              changed = true;
              return updatedNode;
            } catch (e) { return n; }
          });

          if (changed) {
            nodesRef.current = mergedNodes;
            try { setNodes([...mergedNodes]); } catch (e) {}
          }
        } catch (e) { /* ignore telemetry merge errors */ }
      })();
      try { setTimeout(() => { applyingRemoteRef.current = false; }, 1200); } catch (e) {}
      try { suppressServerWritesRef.current = true; setTimeout(() => { suppressServerWritesRef.current = false; }, 1500); } catch (e) {}

      // IMPORTANT: Do NOT persist remote state back to server or overwrite localStorage here.
      // applyRemoteState must only update in-memory UI to reflect authoritative remote state.
      // Persisting immediately would risk older tabs overwriting newer server state and
      // cause position churn. The client GUI will save explicitly when the user presses
      // Save (doSave) which captures React Flow runtime positions.
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

  const addTankFromApi = useCallback((tankLike) => {
    if (!tankLike) return null;
    const rawName = String(tankLike.display_name || tankLike.nombre || tankLike.label || tankLike.name || tankLike.tag || 'Tanque').trim();
    const tankTag = String(tankLike.tag || tankLike.apiTag || tankLike.apiName || tankLike.id || rawName).trim();
    const baseId = String(tankTag || rawName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `tanque-${Date.now()}`;
    const id = `tanque-${baseId}`;

    const existing = (nodesRef.current || []).find((node) => {
      const nodeData = (node.data && node.data.nodeData) ? node.data.nodeData : (node.data || {});
      const candidates = [tankLike.tag, tankLike.apiName, tankLike.originalName, tankLike.display_name, tankLike.nombre, tankLike.id, rawName]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
      const nodeCandidates = [node.id, node.label, nodeData.tag, nodeData.apiName, nodeData.originalName, nodeData.display_name, nodeData.nombre, nodeData.id]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
      return candidates.some((candidate) => nodeCandidates.includes(candidate));
    });

    if (existing) {
      setSelectedNodeId(existing.id);
      if (onNodeSelect) onNodeSelect(existing.id);
      return existing.id;
    }

    const position = {
      x: 260 + ((nodesRef.current || []).length % 6) * 140,
      y: 120 + ((nodesRef.current || []).length % 5) * 110,
    };
    const apiPayload = enrichTankNodeMetrics({
      ...tankLike,
      display_name: rawName,
      nombre: rawName,
      label: rawName,
      apiName: tankLike.apiName || tankLike.originalName || tankLike.tag || rawName,
      originalName: tankLike.originalName || tankLike.apiName || tankLike.tag || rawName,
      tag: tankTag,
    });
    const nodeData = ensureNodeData({
      id,
      type: 'tank',
      label: rawName,
      position,
      data: {
        ...apiPayload,
        id,
        type: 'tank',
        label: rawName,
        customName: rawName,
        display_name: rawName,
        nombre: rawName,
        originalName: tankLike.originalName || tankLike.apiName || tankLike.tag || rawName,
        apiName: tankLike.apiName || tankLike.originalName || tankLike.tag || rawName,
        tag: tankTag,
      },
    });
    const nextNode = {
      id,
      type: 'tank',
      position,
      customName: rawName,
      nameLocked: false,
      label: rawName,
      data: {
        ...nodeData,
        id,
        type: 'tank',
        label: rawName,
        customName: rawName,
        nameLocked: false,
        display_name: rawName,
        nombre: rawName,
        originalName: tankLike.originalName || tankLike.apiName || tankLike.tag || rawName,
        apiName: tankLike.apiName || tankLike.originalName || tankLike.tag || rawName,
        tag: tankTag,
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
    return id;
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
      // Keep transient connection edits out of the saved history stack.
      clearTransientHistory();
      if (!params || !params.source || !params.target || params.source === params.target) return;
      upsertOrToggleConnection(params.source, params.target);
    } catch (e) {}
  }, [clearTransientHistory, upsertOrToggleConnection]);

  const deleteSelectedConnection = useCallback((edgeId = selectedEdgeId) => {
    const targetId = edgeId || selectedEdgeId;
    if (!targetId) return false;

    clearTransientHistory();

    const next = (edgesRef.current || []).filter((edge) => edge.id !== targetId);
    setEdges(next);
    edgesRef.current = next;
    setSelectedEdgeId(null);
    const opId = `delete-edge:${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    try { console.debug('[DIAG] deleteSelectedConnection start', opId, 'edgeId=', targetId); } catch (e) {}
    persistConnection(next, { _diagOpId: opId });
    return true;
  }, [persistConnection, selectedEdgeId]);

  const onEdgesDelete = useCallback((deleted) => {
    if (!deleted || !deleted.length) return;
    try {
      clearTransientHistory();
      const ids = new Set(deleted.map(d => d.id));
      const next = (edgesRef.current || []).filter(e => !ids.has(e.id));
      setEdges(next);
      edgesRef.current = next;
      const opId = `onEdgesDelete:${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
      try { console.debug('[DIAG] onEdgesDelete', opId, 'deletedIds=', Array.from(ids)); } catch (e) {}
      persistConnection(next, { _diagOpId: opId });
      setSelectedEdgeId(null);
    } catch (e) {}
  }, [persistConnection]);

  const doUndo = useCallback(async () => {
    if (undoBusyRef.current || savedPastRef.current.length < 2) return false;
    undoBusyRef.current = true;

    const previousRuntimeNodes = nodesRef.current || [];
    const previousRuntimeEdges = edgesRef.current || [];
    const previousPast = savedPastRef.current.slice();
    const previousFuture = savedFutureRef.current.slice();

    const savedPrevious = savedPastRef.current[savedPastRef.current.length - 2];
    const currentSaved = savedPastRef.current[savedPastRef.current.length - 1];
    const now = new Date().toISOString();
    const payload = {
      ...buildDesignHistorySnapshot({ nodes: Object.fromEntries(Object.entries(savedPrevious.nodes || {})), edges: savedPrevious.edges || [] }),
      updated_at: now,
      _updatedAt: now,
      updatedAt: now,
    };

    const targetNodes = Object.values(payload.nodes || {}).map((entry) => ({
      id: entry.id,
      type: entry.type || 'tank',
      position: { x: Number(entry.x || 0), y: Number(entry.y || 0) },
      customName: entry.customName || '',
      label: entry.label || entry.id || 'Sin nombre',
      data: { ...(entry || {}), customName: entry.customName || '', label: entry.label || entry.id || 'Sin nombre', nodeData: { ...(entry || {}) } },
    }));

    // Feedback inmediato: el usuario ve el deshacer antes de esperar la red.
    savedPastRef.current = savedPastRef.current.slice(0, -1);
    savedFutureRef.current.push(currentSaved);
    nodesRef.current = targetNodes;
    edgesRef.current = payload.edges || [];
    setNodes(targetNodes);
    setEdges(payload.edges || []);
    writeDiagramState(payload, { source: 'local', sendToServer: false });

    try {
      const ok = await diagramService.saveState(payload);
      if (!ok) throw new Error('Undo rejected by server');
      writeDiagramState(payload, { source: 'remote', sendToServer: false });
      return true;
    } catch (e) {
      // Si el servidor falla, restaurar exactamente lo que había antes.
      savedPastRef.current = previousPast;
      savedFutureRef.current = previousFuture;
      nodesRef.current = previousRuntimeNodes;
      edgesRef.current = previousRuntimeEdges;
      setNodes(previousRuntimeNodes);
      setEdges(previousRuntimeEdges);
      console.warn('[DIAGRAM] Undo rejected by server; state restored');
      return false;
    } finally {
      undoBusyRef.current = false;
    }
  }, [writeDiagramState]);

  const doRedo = useCallback(async () => {
    if (savedFutureRef.current.length === 0) return false;
    const nextDesign = savedFutureRef.current[savedFutureRef.current.length - 1];
    const payload = {
      ...buildDesignHistorySnapshot(nextDesign),
      updated_at: new Date().toISOString(),
      _updatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const ok = await diagramService.saveState(payload);
    if (!ok) {
      console.warn('[DIAGRAM] Redo rejected by server; history preserved');
      return false;
    }
    savedFutureRef.current = savedFutureRef.current.slice(0, -1);
    savedPastRef.current.push(nextDesign);
    writeDiagramState(payload, { source: 'remote' });
    const targetNodes = Object.values(payload.nodes || {}).map((entry) => ({
      id: entry.id,
      type: entry.type || 'tank',
      position: { x: Number(entry.x || 0), y: Number(entry.y || 0) },
      customName: entry.customName || '',
      label: entry.label || entry.id || 'Sin nombre',
      data: { ...(entry || {}), customName: entry.customName || '', label: entry.label || entry.id || 'Sin nombre', nodeData: { ...(entry || {}) } },
    }));
    nodesRef.current = targetNodes;
    edgesRef.current = payload.edges || [];
    setNodes(targetNodes);
    setEdges(payload.edges || []);
    return true;
  }, [writeDiagramState]);

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
      // Save directly — no validation that could block the save
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

  // Explicit server save flow used by the UI Save button. This captures the
  // exact runtime state (positions and visual properties), writes it to
  // localStorage, sends it to the backend and, on success, reloads the page
  // to ensure the newly persisted snapshot is loaded. Errors do NOT trigger
  // a reload and keep local changes intact.
  const doSaveToServer = useCallback(async () => {
    try {
      // Lightweight in-page trace array for automated tests (temporary)
      try { if (!window.__diagTrace) window.__diagTrace = []; window.__diagTrace.push('DO_SAVE_ENTER'); } catch (_) {}
      // Build authoritative snapshot from the current runtime view the user is seeing.
      // Do NOT read baseline, localStorage or prior savedState here — use nodesRef/edgesRef exactly.
      const runtimeNodes = (rfInstance && typeof rfInstance.getNodes === 'function')
        ? rfInstance.getNodes()
        : (Array.isArray(nodesRef.current) ? nodesRef.current : []);
      const runtimeEdges = (rfInstance && typeof rfInstance.getEdges === 'function')
        ? rfInstance.getEdges()
        : (Array.isArray(edgesRef.current) ? edgesRef.current : []);

      const saved = {
        // intentionally lightweight baseline fields omitted; we only persist nodes/edges
        nodes: Object.fromEntries((runtimeNodes || []).map(n => {
          // when persisting via explicit user action, derive persisted entry from node runtime and any existing persisted prev (if present)
          const prevRaw = (function(){ try { const raw = readDiagramState(); return raw && raw.nodes && raw.nodes[n.id] && typeof raw.nodes[n.id] === 'object' ? raw.nodes[n.id] : {}; } catch(e) { return {}; } })();
          return [n.id, getPersistedNodeEntry(n, prevRaw)];
        })),
        edges: Array.isArray(runtimeEdges) ? runtimeEdges : [],
      };

      try { window.__diagTrace.push('SNAPSHOT_READY'); } catch(_){}

      // persist to localStorage immediately (source: local)
      try { writeDiagramState(saved, { source: 'local' }); } catch (e) {}

      // Debug: trace payload node for traced id before server save
      try {
        if (typeof window !== 'undefined' && window.__TRACE_NODE_ID) {
          try { console.debug('[TRACE] doSaveToServer payload node', window.__TRACE_NODE_ID, saved && saved.nodes ? saved.nodes[window.__TRACE_NODE_ID] : null); } catch (e) {}
        }
      } catch (e) {}

      // Esperar cualquier escritura automática anterior antes del Guardar explícito.
      // Así el snapshot exacto que ve el usuario siempre es el último que llega al backend.
      try {
        let waits = 0;
        while (savingRef.current && waits < 80) {
          await new Promise((resolve) => setTimeout(resolve, 25));
          waits += 1;
        }
        pendingServerSaveRef.current = null;

        try { window.__diagTrace.push('SAVE_STATE_CALL'); } catch(_){}
        const ok = await diagramService.saveState(saved);
        try { window.__diagTrace.push('SAVE_RESPONSE:' + (ok? 'ok':'false')); } catch(_){}
        if (!ok) throw new Error('diagramService.saveState returned false');
      } catch (e) {
        try { window.__diagTrace.push('SAVE_RESPONSE_ERROR:' + (e && e.message ? e.message : String(e))); } catch(_){}
        throw e;
      }

      // on success, mark as remote baseline so clients do not re-send the same snapshot
      try { writeDiagramState(saved, { source: 'remote' }); } catch (e) {}
      try {
        const currentDesign = buildDesignHistorySnapshot(saved);
        const lastSaved = savedPastRef.current[savedPastRef.current.length - 1] || null;
        if (!lastSaved || !snapshotDesignEquals(lastSaved, currentDesign)) {
          savedPastRef.current.push(currentDesign);
          savedFutureRef.current = [];
        }
      } catch (e) {}

      // Guardar = confirmar en backend y recargar inmediatamente.
      // La recarga ocurre solo después del 200 para no perder cambios.
      window.location.reload();
      return true;
    } catch (err) {
      try { setSaveMsg('error'); setTimeout(() => setSaveMsg(null), 3000); } catch (e) {}
      console.warn('[DIAGRAM] doSaveToServer failed', err);
      return false;
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
      // Always keep the ref in sync with the exact React Flow snapshot before persisting.
      nodesRef.current = next;
      if (applyingRemoteRef.current) return next;
      const hasRemove = changes.some(c => c.type === 'remove');
      const hasStructuralChange = changes.some(c => c.type === 'add' || c.type === 'reset');
      if (hasRemove || hasStructuralChange) {
        persistDistrictState(next, edgesRef.current, {
          skipReadBaseline: true,
          force: true,
          sendToServer: true,
          _diagOpId: `onNodesChange-structural:${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
        });
      }
      // position durante drag se guarda en onNodeDragStop; select/dimensions son
      // cambios internos de ReactFlow y no deben generar POST.
      return next;
    });
  }, [persistDistrictState]);

  const onEdgesChange = useCallback((changes) => {
    setEdges((eds) => {
      const next = applyEdgeChanges(changes, eds);
      edgesRef.current = next;
      const hasDesignChange = (changes || []).some((change) => change?.type !== 'select');
      if (!applyingRemoteRef.current && hasDesignChange) {
        persistDistrictState(nodesRef.current, next, { force: true, sendToServer: true });
      }
      return next;
    });
  }, [persistDistrictState]);

  const onNodeDragStop = useCallback((event, node) => {
    try {
      // Drag changes are transient until the user explicitly saves a design snapshot.
      clearTransientHistory();

      // Use React Flow instance as the source of truth for final positions
      // (this obtains the exact runtime positions after the drag).
      const currentNodes = (rfInstance && typeof rfInstance.getNodes === 'function')
        ? rfInstance.getNodes()
        : (nodesRef.current || []);

      // Normalize positions to plain numbers and ensure node entries preserved
      const normalized = (currentNodes || []).map(n => ({
        ...n,
        position: { x: Number(n.position?.x || 0), y: Number(n.position?.y || 0) }
      }));

      nodesRef.current = normalized;
      if (node && node.id) {
        draftPositionsRef.current.set(node.id, sanitizePosition(node.position || {}));
      }
      // Reflect exact runtime snapshot into React state
      setNodes([...normalized]);

      // Persist using the exact snapshot; skip reading baseline to avoid overwriting
      if (!applyingRemoteRef.current) {
        const opId = `drag:${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
        try { console.debug('[DIAG] onNodeDragStop', opId, 'node=', node && node.id, 'rfNodes=', (rfInstance && rfInstance.getNodes) ? (rfInstance.getNodes()||[]).find(n=>n.id===node.id) : null); } catch (e) {}
        persistDistrictState(normalized, edgesRef.current, { skipReadBaseline: true, _diagOpId: opId });
      }
      try { setOverlayVisible(true); } catch (e) {}
    } catch (e) {}
    finally {
      // Keep the drag guard active long enough to absorb the React Flow post-drag click/selection
      // sequence. That sequence can otherwise reopen the details drawer even when the drag was legitimate.
      if (dragMovedRef.current) {
        suppressClickAfterDragRef.current = true;
        suppressSelectionAfterDragRef.current = true;
        dragSuppressUntilRef.current = Date.now() + 500;
      }
      _setSelectedNodeId(null);
      setSelectedEdgeId(null);
      if (onNodeSelect) onNodeSelect(null, null, { openDetails: false });
      dragStartPositionRef.current = { x: 0, y: 0 };
      window.setTimeout(() => {
        dragMovedRef.current = false;
        suppressClickAfterDragRef.current = false;
        suppressSelectionAfterDragRef.current = false;
        dragSuppressUntilRef.current = 0;
      }, 300);
    }
  }, [persistDistrictState, onNodeSelect, _setSelectedNodeId]);

  const onNodeDrag = useCallback((event, node) => {
    try {
      if (node?.id) {
        draftPositionsRef.current.set(node.id, sanitizePosition(node.position || {}));
      }
      const start = dragStartPositionRef.current || { x: 0, y: 0 };
      const dx = Math.abs((node?.position?.x ?? 0) - (start.x ?? 0));
      const dy = Math.abs((node?.position?.y ?? 0) - (start.y ?? 0));
      if (dx > 2 || dy > 2) {
        dragMovedRef.current = true;
        suppressClickAfterDragRef.current = true;
        suppressSelectionAfterDragRef.current = true;
      }
    } catch (e) {}
  }, []);

  const onNodeDragStart = useCallback((event, node) => {
    try {
      dragMovedRef.current = false;
      suppressClickAfterDragRef.current = false;
      suppressSelectionAfterDragRef.current = true;
      dragSuppressUntilRef.current = Date.now() + 500;
      dragStartPositionRef.current = {
        x: Number(node?.position?.x ?? 0),
        y: Number(node?.position?.y ?? 0),
      };
      if (node?.id) {
        draftPositionsRef.current.set(node.id, sanitizePosition(node.position || {}));
      }
      _setSelectedNodeId(null);
      setSelectedEdgeId(null);
      if (onNodeSelect) onNodeSelect(null, null, { openDetails: false });
      setOverlayVisible(false);
    } catch (e) {}
  }, [onNodeSelect, _setSelectedNodeId]);

  const didInitDiagramRef = useRef(false);

  // No dev fallback here: authoritative state must come from backend only.

  useEffect(() => {
    let cancelled = false;
    const loadInitialDiagramState = async () => {
      setBootstrapStatus('loading');
      let saved = null;
      try {
        saved = await readAuthoritativeDiagramState();
      } catch (e) {
        // Treat inability to read authoritative state as an error (no fallbacks)
        setBootstrapStatus('error');
        console.error('[DIAGRAM] readAuthoritativeDiagramState failed', e && e.message ? e.message : e);
        return;
      }
      if (cancelled) return;

      if (saved == null) {
        // Backend returned a valid empty snapshot or empty body; treat as loadedEmpty
        setBootstrapStatus('loadedEmpty');
        nodesRef.current = [];
        edgesRef.current = [];
        setNodes([]);
        setEdges([]);
        return;
      }

      const rawNodeEntries = normalizeSavedNodeCollection(saved && saved.nodes ? saved.nodes : []);
      const rawEdgeEntries = normalizeDiagramEdgeEntries(saved && saved.edges ? saved.edges : []);
      const hasExplicitSavedStructure = !!saved && typeof saved === 'object' && (
        Object.prototype.hasOwnProperty.call(saved, 'nodes') ||
        Object.prototype.hasOwnProperty.call(saved, 'edges') ||
        Object.prototype.hasOwnProperty.call(saved, 'hiddenNodeIds') ||
        Object.prototype.hasOwnProperty.call(saved, 'deletedNodeIds') ||
        Object.keys(saved).length > 0
      );
      const normalizedSavedKeys = Object.keys(saved || {}).filter((key) => !['updated_at', '_updatedAt', 'updatedAt'].includes(key));
      const hasSavedState = hasExplicitSavedStructure && (rawNodeEntries.length > 0 || rawEdgeEntries.length > 0 || normalizedSavedKeys.length > 0);
      // Respect any explicit saved snapshot, even if it contains an empty
      // `nodes: []`. A persisted snapshot with empty nodes is a valid
      // authoritative state (represents an explicitly emptied diagram).
      // Only fall back to static layout when there is no saved snapshot at all.
      const useStaticFallback = !saved;

      const fallbackNodes = (Array.isArray(STATIC_NODES) ? STATIC_NODES : []).map((entry) => {
        const id = String(entry && entry.id ? entry.id : 'unknown-node');
        const type = entry && entry.type ? entry.type : 'tank';
        const label = String(entry && (entry.label || entry.id) ? (entry.label || entry.id) : id).trim() || id;
        const position = {
          x: Number.isFinite(Number(entry && entry.position && entry.position.x)) ? Number(entry.position.x) : 0,
          y: Number.isFinite(Number(entry && entry.position && entry.position.y)) ? Number(entry.position.y) : 0,
        };
        const nodeData = ensureNodeData({ id, type, label, position, data: { ...(entry || {}), id, customName: '', label } });
        return {
          id,
          type,
          position,
          customName: '',
          label,
          data: { ...(entry || {}), customName: '', label, nodeData },
        };
      });

      const fallbackEdges = (Array.isArray(STATIC_CONNECTIONS) ? STATIC_CONNECTIONS : [])
        .filter(isValidSavedEdge)
        .map((edge) => normalizeSavedEdge(edge, {
          animated: !!showFlow,
          type: 'step',
          markerEnd: { type: MarkerType.ArrowClosed, color: '#000' },
          style: { stroke: '#000', strokeWidth: 5, strokeLinecap: 'round' },
        }))
        .filter((edge) => edge && edge.source && edge.target);

      const initialNodes = hasSavedState ? rawNodeEntries.filter(Boolean).map((entry) => {
        const id = String(entry.id || entry.nodeId || entry.tag || 'unknown-node');
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
      }) : fallbackNodes;

      const initialEdges = (hasSavedState)
        ? (Array.isArray(saved && saved.edges) ? saved.edges : [])
            .filter(isValidSavedEdge)
            .map((edge) => normalizeSavedEdge(edge, {
              animated: !!showFlow,
              type: 'step',
              markerEnd: { type: MarkerType.ArrowClosed, color: '#000' },
              style: { stroke: '#000', strokeWidth: 5, strokeLinecap: 'round' },
            }))
            .filter((edge) => edge && edge.source && edge.target)
        : fallbackEdges;

      // If saved structure exists but contains no explicit node/edge entries,
      // prefer falling back to the static layout or remote state instead of
      // aggressively clearing the UI. This avoids situations where an empty
      // persisted object (e.g. `{ nodes: {} }`) would hide the static nodes
      // and leave the canvas blank.

      if (!didInitDiagramRef.current) {
        didInitDiagramRef.current = true;
        setBootstrapStatus(hasSavedState ? 'loadedWithState' : 'loadedEmpty');

        const removedIds = new Set([
          ...(Array.isArray(saved && saved.hiddenNodeIds) ? saved.hiddenNodeIds : []),
          ...(Array.isArray(saved && saved.deletedNodeIds) ? saved.deletedNodeIds : []),
        ].filter((id) => id != null && String(id).trim() !== ''));

        const savedNodes = initialNodes.filter((entry) => {
          if (!entry || typeof entry !== 'object') return false;
          return !removedIds.has(String(entry.id));
        });

        nodesRef.current = savedNodes;
        edgesRef.current = initialEdges;
        setNodes(savedNodes);
        setEdges(initialEdges);
        try {
          const initialDesign = buildDesignHistorySnapshot({
            nodes: Object.fromEntries((savedNodes || []).map((n) => [n.id, getPersistedNodeEntry(n, (saved && saved.nodes && saved.nodes[n.id]) || {})])),
            edges: initialEdges,
          });
          savedPastRef.current = [initialDesign];
          savedFutureRef.current = [];
        } catch (e) {}
        try {
          if (typeof window !== 'undefined' && window.__TRACE_NODE_ID) {
            const t = String(window.__TRACE_NODE_ID);
            try { console.debug('[TRACE] loadInitialDiagramState applied saved node for', t, 'entry=', (savedNodes && savedNodes[t])); } catch (e) {}
          }
        } catch (e) {}
        return;
      }

      if (Array.isArray(initialNodes) && initialNodes.length) return;
    };

    loadInitialDiagramState();
    return () => { cancelled = true; };
  }, [readAuthoritativeDiagramState, showFlow]);

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
            const mergedNodeData = { ...mergeTelemetryPreservingVisual(nd, enriched, n.type), customName: preservedCustom || nd.customName, display_name: preservedCustom || enriched.display_name || nd.display_name };

            return { ...n, data: { ...(n.data || {}), nodeData: mergedNodeData } };
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
          ...mergeTelemetryPreservingVisual(currentNd, freshData, n.type),
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
      selected: n.id === selectedNodeId || n.id === connectPendingId,
      data: {
        ...n.data,
        editMode,
        mode,
        deleteMode,
        selected: n.id === selectedNodeId || n.id === connectPendingId,
        pendingConnect: n.id === connectPendingId,
        onSelect: (id) => { _setSelectedNodeId(id); if (onNodeSelect) onNodeSelect(id); },
        onMove: (id, dx, dy) => moveNode(id, dx, dy),
        onConnectNode: (id) => handleConnectSelection(id),
        onDuplicate: (id) => duplicateSelectedNode(id),
        onRename: applyNodeRename,
        onDeleteSelected: (id) => deleteSelectedNode(id),
      }
    })));
  }, [selectedNodeId, connectPendingId, editMode, mode, deleteMode, onNodeSelect, moveNode, handleConnectSelection, duplicateSelectedNode, applyNodeRename, deleteSelectedNode]);

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

  // expose imperative methods to parent via ref
  useImperativeHandle(ref, () => ({
    doAutoLayout,
    doSave,
    doSaveToServer,
    doRestoreInitial,
    doViewAll,
    doUndo,
    doRedo,
    toggleShowFlow,
    addDiagramNode,
    addTankFromApi,
    addShapeNode,
    changeSelectedNodeShape,
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
    getSelectedNodeId: () => selectedNodeIdRef.current || selectedNodeId,
    getSelectedNode: () => (nodesRef.current || []).find((n) => n.id === (selectedNodeIdRef.current || selectedNodeId)) || null,
    getNodeById: (id) => (nodesRef.current || []).find((n) => n.id === id) || null,
    getSelectedEdgeId: () => selectedEdgeId,
    getShowFlow: () => showFlow,
    renameSelectedNode: (id, label) => {
      const targetId = id || selectedNodeId;
      if (!targetId) return false;
      applyNodeRename(targetId, label);
      return true;
    },
    deleteSelectedConnection,
    resizeSelectedNode,
    updateSelectedConnectionStyle,
    updateSelectedEdgeLabel,
    // autosave disabled: no start/stop methods exposed
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
    // Debug helper: return copies of past/future stacks (design-only snapshots)
    getHistory: () => ({
      past: Array.isArray(pastRef.current) ? pastRef.current.slice() : [],
      future: Array.isArray(futureRef.current) ? futureRef.current.slice() : [],
      savedPast: Array.isArray(savedPastRef.current) ? savedPastRef.current.slice() : [],
      savedFuture: Array.isArray(savedFutureRef.current) ? savedFutureRef.current.slice() : [],
    }),
  }), [doAutoLayout, doSave, doRestoreInitial, doViewAll, doUndo, doRedo, toggleShowFlow, addDiagramNode, addTankFromApi, addShapeNode, changeSelectedNodeShape, changeSelectedNodeColor, duplicateSelectedNode, deleteSelectedNode, rotateSelectedNode, setSelectedNodeRotation, editUnlockAllNodes, saveAndLockAllNodes, selectedNodeId, selectedEdgeId, showFlow, deleteSelectedConnection]);

  // No periodic autosave: actualizaciones reales del usuario se persisten por acción explícita.

  // Flush pending server save and persist WS queue on unload/navigation
  useEffect(() => {
    const handleUnload = () => {
      try {
        // persist latest local state
        try { if (autoSaveEnabledRef.current) { const saved = readDiagramState(); localStorage.setItem('district_state', JSON.stringify(saved)); } } catch (e) {}

        // try to send pending server save using Beacon or fetch keepalive
        try {
          // Respect suppression guard: when applying remote authoritative state,
          // we must not issue any server writes (including beacon on unload).
          if (suppressServerWritesRef.current || applyingRemoteRef.current) {
            try { console.debug('[DIAGRAM] handleUnload: suppressed server write due to applyingRemote/suppress flag'); } catch (e) {}
          } else {
            const apiBase = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001/api').replace(/\/$/, '');
            const url = `${apiBase}/diagram/state`;
            // Prefer pending payload if present (most recent local change). Otherwise use persisted local snapshot
            let payload = null;
            try {
              if (pendingServerSaveRef.current) payload = pendingServerSaveRef.current;
              else if (autoSaveEnabledRef.current) {
                const raw = JSON.parse(localStorage.getItem('district_state') || 'null');
                if (raw && typeof raw === 'object') payload = raw; else payload = null;
              }
            } catch (e) { payload = null; }

            // Validate payload: only send if it's a structural state (has nodes/edges keys or other keys).
            // This avoids sending accidental `{}` which would wipe server state.
            const isValidPayload = (p) => {
              try {
                if (!p || typeof p !== 'object') return false;
                const hasNodesKey = Object.prototype.hasOwnProperty.call(p, 'nodes');
                const hasEdgesKey = Object.prototype.hasOwnProperty.call(p, 'edges');
                const hasOtherKey = Object.keys(p).some(k => k !== 'nodes' && k !== 'edges');
                return hasNodesKey || hasEdgesKey || hasOtherKey;
              } catch (e) { return false; }
            };

            if (isValidPayload(payload)) {
              const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
              if (navigator && typeof navigator.sendBeacon === 'function') {
                try { navigator.sendBeacon(url, blob); } catch (e) {}
              } else {
                try { fetch(url, { method: 'POST', body: JSON.stringify(payload), keepalive: true, headers: { 'Content-Type': 'application/json' } }); } catch (e) {}
              }
            } else {
              try { console.debug('[DIAGRAM] handleUnload: no valid payload to send (skipped beacon)'); } catch (e) {}
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

  // WS overlay UI removed — WS internals remain functional but panel hidden per UX request
  const overlayElement = null;

  return (
    <div ref={containerRef} style={{ width: '100%', height: '72vh', position: 'relative' }}>
      {/* WS Queue status overlay (diagnostic) */}
      {/* Always visible overlay container that does not block pointer events by default */}
      {/* WS overlay UI intentionally removed (internals preserved) */}

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
      {/* Compact independent size controls (runtime only; explicit Save persists) */}
      {(selectedNodeId && editMode) ? (
        <div style={{ position: 'absolute', right: 12, top: 72, zIndex: 60, background: 'rgba(255,255,255,0.92)', padding: 6, borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', display: 'flex', gap: 6, alignItems: 'center', pointerEvents: 'auto' }}>
          <button type="button" onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }} onClick={() => changeSelectedWidth(-8)} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#0b2447', cursor: 'pointer' }}>Ancho −</button>
          <button type="button" onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }} onClick={() => changeSelectedWidth(8)} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#0b2447', cursor: 'pointer' }}>Ancho +</button>
          <div style={{ width: 1, height: 28, background: '#e6e6e6' }} />
          <button type="button" onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }} onClick={() => changeSelectedHeight(-8)} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#0b2447', cursor: 'pointer' }}>Alto −</button>
          <button type="button" onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }} onClick={() => changeSelectedHeight(8)} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#0b2447', cursor: 'pointer' }}>Alto +</button>
        </div>
      ) : null}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodeDragStart={onNodeDragStart}
        onConnect={onConnect}
        onNodeClick={(event, node) => {
          const shouldSuppress = dragMovedRef.current || suppressClickAfterDragRef.current || suppressSelectionAfterDragRef.current || Date.now() < dragSuppressUntilRef.current;
          if (shouldSuppress) {
            dragMovedRef.current = false;
            suppressClickAfterDragRef.current = false;
            suppressSelectionAfterDragRef.current = false;
            return;
          }
          setSelectedEdgeId(null);
          if (editMode && deleteMode) {
            const removed = deleteSelectedNode(node.id);
            if (removed) {
              setConnectPendingId(null);
              if (onNodeSelect) onNodeSelect(null, null);
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

          const nextId = node?.id || null;
          _setSelectedNodeId(nextId);
          if (onNodeSelect && nextId) onNodeSelect(nextId, node, { openDetails: false });
        }}
        onSelectionChange={({ nodes: selectedNodes = [] }) => {
          const shouldSuppress = dragMovedRef.current || suppressClickAfterDragRef.current || suppressSelectionAfterDragRef.current || Date.now() < dragSuppressUntilRef.current;
          if (shouldSuppress) {
            dragMovedRef.current = false;
            suppressClickAfterDragRef.current = false;
            suppressSelectionAfterDragRef.current = false;
            return;
          }
          if (!initialSelectionIgnoredRef.current) {
            initialSelectionIgnoredRef.current = true;
            if (selectedNodes && selectedNodes.length) {
              try { _setSelectedNodeId(null); } catch (e) {}
            }
            return;
          }
          const nextNode = selectedNodes && selectedNodes.length ? selectedNodes[0] : null;
          const nextId = nextNode?.id || null;
          // If React Flow reports empty selection but onNodeClick already set a valid
          // selection in this same interaction, don't overwrite it.
          if (!nextId && selectedNodeIdRef.current) return;
          _setSelectedNodeId(nextId);
          if (onNodeSelect) {
            if (nextId) onNodeSelect(nextId, nextNode, { openDetails: false });
            else onNodeSelect(null, null, { openDetails: false });
          }
        }}
        onNodeDoubleClick={(event, node) => {
          try { event.preventDefault(); event.stopPropagation(); } catch (e) {}
          const shouldSuppress = dragMovedRef.current || suppressClickAfterDragRef.current || suppressSelectionAfterDragRef.current || Date.now() < dragSuppressUntilRef.current;
          if (shouldSuppress) {
            dragMovedRef.current = false;
            suppressClickAfterDragRef.current = false;
            suppressSelectionAfterDragRef.current = false;
            return;
          }
          try {
            const nextId = node?.id || null;
            setSelectedNodeId(nextId);
            if (onNodeSelect && nextId) onNodeSelect(nextId, node, { openDetails: true });
          } catch (e) {}
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
        onPaneClick={(event) => {
          const target = event?.target;
          const clickedInsideNode = !!(target && typeof target.closest === 'function' && (
            target.closest('.react-flow__node') || target.closest('.react-flow__node-default') || target.closest('.react-flow__node-tank') || target.closest('.react-flow__node-plant') || target.closest('.react-flow__node-district') || target.closest('.react-flow__node-shape')
          ));
          if (clickedInsideNode) return;

          _setSelectedNodeId(null);
          setSelectedEdgeId(null);
          if (onNodeSelect) onNodeSelect(null, null);
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
        elementsSelectable={true}
        nodesConnectable={editMode && (diagramMode === 'edit' || editMode)}
        connectOnClick={editMode && (diagramMode === 'edit' || editMode)}
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

