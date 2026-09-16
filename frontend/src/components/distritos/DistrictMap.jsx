import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { Box, Paper, TextField, InputAdornment, IconButton, Autocomplete, Button, OutlinedInput, Snackbar, Dialog, DialogTitle, DialogContent, DialogActions, Collapse } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import debounce from '../../utils/debounce';
import { loadCatalog, mergeApiTanquesWithCatalog, calculateDisplayPorcentaje, normalizeText, findCatalogEntry } from '../../config/tankCatalog';
import diagramService from '../../services/diagramService';
import { getStatusMeta } from '../../utils/statusUtils';
import { NODES as STATIC_NODES, CONNECTIONS as STATIC_CONNECTIONS } from './districtLayout';
// TankNode/PlantNode/DistrictNode/Connection rendered inside DistrictFlow
// DistrictToolbar removed to hide built-in zoom controls (lupas +, -, fit)
import ElementDetails from './ElementDetails';
import { appendTankHistory } from './tankHistory';
import useTanques from '../../hooks/useTanques';
import Tooltip from '@mui/material/Tooltip';
import EditIcon from '@mui/icons-material/Edit';
import DoneIcon from '@mui/icons-material/Done';
import LinkIcon from '@mui/icons-material/Link';
import PanToolIcon from '@mui/icons-material/PanTool';
import SaveIcon from '@mui/icons-material/Save';
import UndoIcon from '@mui/icons-material/Undo';
import PaletteIcon from '@mui/icons-material/Palette';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import LockClockIcon from '@mui/icons-material/LockClock';
import OpenWithIcon from '@mui/icons-material/OpenWith';
import DistrictFlow from './DistrictFlow';
import Alert from '@mui/material/Alert';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import ToggleOnIcon from '@mui/icons-material/ToggleOn';
import ToggleOffIcon from '@mui/icons-material/ToggleOff';

const COLOR_PRESETS = [
  { label: 'Azul', value: '#3b82f6' },
  { label: 'Cian', value: '#06b6d4' },
  { label: 'Verde', value: '#10b981' },
  { label: 'Ámbar', value: '#f59e0b' },
  { label: 'Rojo', value: '#ef4444' },
  { label: 'Morado', value: '#8b5cf6' },
  { label: 'Gris', value: '#64748b' },
];

const SHAPE_MENU_OPTIONS = [
  { type: 'rect', label: 'Rectángulo', svg: <rect x="2" y="4" width="20" height="16" rx="3" fill="#bfdbfe" stroke="#3b82f6" strokeWidth="1.5" /> },
  { type: 'circle', label: 'Círculo', svg: <ellipse cx="12" cy="12" rx="10" ry="10" fill="#bfdbfe" stroke="#3b82f6" strokeWidth="1.5" /> },
  { type: 'triangle', label: 'Triángulo', svg: <polygon points="12,2 22,22 2,22" fill="#bfdbfe" stroke="#3b82f6" strokeWidth="1.5" /> },
  { type: 'diamond', label: 'Rombo', svg: <polygon points="12,2 22,12 12,22 2,12" fill="#bfdbfe" stroke="#3b82f6" strokeWidth="1.5" /> },
  { type: 'hexagon', label: 'Hexágono', svg: <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" fill="#bfdbfe" stroke="#3b82f6" strokeWidth="1.5" /> },
  { type: 'pentagon', label: 'Pentágono', svg: <polygon points="12,2 22,9 18,21 6,21 2,9" fill="#bfdbfe" stroke="#3b82f6" strokeWidth="1.5" /> },
  { type: 'arrow-right', label: 'Flecha →', svg: <polygon points="2,8 14,8 14,4 22,12 14,20 14,16 2,16" fill="#bfdbfe" stroke="#3b82f6" strokeWidth="1.5" /> },
  { type: 'star', label: 'Estrella', svg: <polygon points="12,2 14.5,9 22,9 16,14 18.5,21 12,17 5.5,21 8,14 2,9 9.5,9" fill="#bfdbfe" stroke="#3b82f6" strokeWidth="1.5" /> },
  { type: 'speech-bubble', label: 'Globo', svg: <><rect x="2" y="2" width="20" height="15" rx="4" fill="#bfdbfe" stroke="#3b82f6" strokeWidth="1.5" /><polygon points="5,17 10,17 5,22" fill="#bfdbfe" stroke="#3b82f6" strokeWidth="1" strokeLinejoin="round" /></> },
  { type: 'line', label: 'Línea', svg: <line x1="2" y1="12" x2="22" y2="12" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" /> },
];

export default function DistrictMap() {
  const { tanques, loading, error } = useTanques();
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detailsDismissedId, setDetailsDismissedId] = useState(null);
  const [filterState, setFilterState] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [tooltip, setTooltip] = useState(null);
  const [viewAllToggle, setViewAllToggle] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [editMode, setEditMode] = useState(true);
  const [editTool, setEditTool] = useState('select');
  const [deleteMode, setDeleteMode] = useState(false);
  const [showShapePicker, setShowShapePicker] = useState(false);
  const [showChangeShapePicker, setShowChangeShapePicker] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [connectionStrokeWidth, setConnectionStrokeWidth] = useState(3);
  const [connectionStrokeColor, setConnectionStrokeColor] = useState('#000000');
  const [connectionLabel, setConnectionLabel] = useState('');
  const [snack, setSnack] = useState({ open: false, msg: '' });
  const [edgeLineType, setEdgeLineType] = useState(() => {
    try {
      const migrated = localStorage.getItem('district_smart_routing_v1') === '1';
      if (!migrated) {
        localStorage.setItem('district_smart_routing_v1', '1');
        localStorage.setItem('district_edge_line_type', 'smart');
        return 'smart';
      }
      return localStorage.getItem('district_edge_line_type') || 'smart';
    } catch (e) { return 'smart'; }
  });
  // Modo diagrama: 'edit' = arrastrables | 'view' = solo visual
  const [diagramMode, setDiagramMode] = useState(() => {
    try { return localStorage.getItem('district_diagram_mode') || 'view'; } catch (e) { return 'view'; }
  });

  const [autoSaveEnabled, setAutoSaveEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem('district_autosave');
      // Default to ON if never set
      if (stored === null) return true;
      return stored === '1';
    } catch (e) { return true; }
  });
  const [diagramLocked, setDiagramLocked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(() => {
    try { return localStorage.getItem('district_is_admin') === '1'; } catch (e) { return false; }
  });
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  // Helper to mark diagram as having unsaved changes
  const triggerUnsaved = () => setUnsavedChanges(true);
  const [errorDismissed, setErrorDismissed] = useState(false);

  useEffect(() => {
    try {
      if (!selectedEdgeId) { setConnectionLabel(''); return; }
      const raw = JSON.parse(localStorage.getItem('district_state') || '{}');
      const edges = Array.isArray(raw.edges) ? raw.edges : [];
      const e = edges.find(x => x.id === selectedEdgeId);
      if (e) {
        setConnectionLabel(e.label || '');
        const sw = (e.style && (e.style.strokeWidth || e.style.strokewidth)) || (e.strokeWidth) || 3;
        setConnectionStrokeWidth(sw);
        const stroke = (e.style && e.style.stroke) || e.stroke || '#000000';
        setConnectionStrokeColor(stroke || '#000000');
      } else {
        setConnectionLabel('');
        setConnectionStrokeWidth(3);
        setConnectionStrokeColor('#000000');
      }
    } catch (err) { setConnectionLabel(''); setConnectionStrokeWidth(3); setConnectionStrokeColor('#000000'); }
  }, [selectedEdgeId]);


  const catalog = useMemo(() => loadCatalog(), []);
  const mergedTanques = useMemo(() => mergeApiTanquesWithCatalog(tanques || [], catalog), [tanques, catalog]);
  useEffect(() => {
    try { appendTankHistory(mergedTanques || []); } catch (e) {}
  }, [mergedTanques]);
  const ibalConnectionState = useMemo(() => {
    if (loading) return { label: 'Conectando con IBAL...', tone: 'neutral' };
    if (error) return { label: 'IBAL sin conexión', tone: 'error' };
    return { label: 'IBAL conectado', tone: 'success' };
  }, [loading, error]);
  // Manual mapping persisted in localStorage under key 'district_manual_node_mapping'
  const [manualMappingVersion, setManualMappingVersion] = useState(0);
  
  const MANUAL_MAPPING_KEY = 'district_manual_node_mapping';
  const loadManualMappingFromLocal = useCallback(() => {
    try {
      const raw = localStorage.getItem(MANUAL_MAPPING_KEY) || '{}';
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) { return {}; }
  }, []);

  const [serverManualMapping, setServerManualMapping] = useState(null);
  // compose manual mapping: server override -> local override -> defaults
  const manualMapping = useMemo(() => {
    // Mapeo explícito por node ID para los tanques que deben seguir la telemetría IBAL
    // incluso cuando el nombre visible del nodo no coincide exactamente con el nombre API.
    const defaults = {
      'tanque-belen-aurora':     { tag: 'NIVEL_AURORA' },
      'tanque-la-15':            { tag: 'NIVEL_LA_15' },
      'tanque-interlaken':      { tag: 'NIVEL_INTERLAKEN' },
      'tanque-la-29':            { tag: 'NIVEL_LA_29' },
      'tanque-la-30':            { tag: 'NIVEL_LA_30' },
      'tanque-zona-industrial':  { tag: 'NIVEL_DE_ZONA_INDUSTRIAL' },
      'tanque-calucaima':        { tag: 'NIVEL_CALUCAIMA' },
      'tanque-miramar':          { tag: 'NIVEL_MIRAMAR' },
      'tanque-piedra-pintada-1': { tag: 'NIVEL_PIEDRA_PINTADA_1' },
      'tanque-piedra-pintada-2': { tag: 'NIVEL_PIEDRA_PINTADA_2' },
    };
    const local = loadManualMappingFromLocal() || {};
    const server = serverManualMapping || {};
    return { ...defaults, ...local, ...server };
  }, [loadManualMappingFromLocal, serverManualMapping, manualMappingVersion]);
  // Nodes to explicitly exclude from mapping
  const EXCLUDED_NODE_IDS = useMemo(() => new Set(['tanque-elevado', 'tanque-semienterrado']), []);

  // Mapping UI state
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [mappingDraft, setMappingDraft] = useState({});

  // load server mapping on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const state = await diagramService.getState();
        if (!mounted) return;
        const mapped = state && state.manual_node_mapping ? state.manual_node_mapping : null;
        setServerManualMapping(mapped);
      } catch (e) { /* ignore */ }
    })();
    return () => { mounted = false; };
  }, []);
  // compute display percentages and status counts
  const summary = useMemo(() => {
    const stats = { total: 0, normal: 0, atencion: 0, critico: 0, sinDatos: 0 };
    const sourceList = ((mergedTanques && mergedTanques.length) ? mergedTanques : STATIC_NODES.filter((n) => n.type === 'tank'));

    for (const t of sourceList) {
      stats.total += 1;
      const pct = t && typeof t === 'object' && 'porcentaje' in t ? calculateDisplayPorcentaje(t) : null;
      const status = getStatusMeta(pct != null ? pct : (t && typeof t === 'object' && t.porcentaje != null ? t.porcentaje : null));
      if (status.tone === 'danger') stats.critico += 1;
      else if (status.tone === 'warning') stats.atencion += 1;
      else if (status.tone === 'info' || status.tone === 'success') stats.normal += 1;
      else stats.sinDatos += 1;
    }
    return stats;
  }, [mergedTanques]);

  const nodes = STATIC_NODES;
  const resolvedConnections = STATIC_CONNECTIONS;
  const containerRef = useRef(null);
  const flowRef = useRef(null);
  const [flowOn, setFlowOn] = useState(false);
  const flowNodes = [];

  useEffect(() => {
    // sync initial flow state from Flow component when mounted
    try {
      if (flowRef.current && flowRef.current.getShowFlow) setFlowOn(!!flowRef.current.getShowFlow());
    } catch (e) {}
  }, []);

  // Expose flowRef for debugging/tests: window.__districtFlow
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.__districtFlow = flowRef.current || null;
      }
    } catch (e) {}
    return () => { try { if (typeof window !== 'undefined') window.__districtFlow = null; } catch (e) {} };
  }, [flowRef.current]);

  // Warn user if there are unsaved changes and they attempt to close/reload the page
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!unsavedChanges) return undefined;
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [unsavedChanges]);

  // Apply stored autosave preference to Flow on mount / when ref becomes available
  useEffect(() => {
    try {
      if (!flowRef.current) return;
      if (autoSaveEnabled) flowRef.current?.startAutoSave?.(); else flowRef.current?.stopAutoSave?.();
    } catch (e) { console.warn('apply autosave preference error', e); }
  }, [autoSaveEnabled]);

  const pickNodeById = (id) => (nodes || []).find(n => n.id === id) || null;
  const [selectedNode, setSelectedNode] = useState(null);
  // Live reference to the last node object received from DistrictFlow's onNodeSelect callback
  const [selectedFlowNode, setSelectedFlowNode] = useState(null);

  const selectedTankData = useMemo(() => {
    const node = selectedNode || selectedFlowNode;
    if (!node || node.type !== 'tank') return null;
    const nd = node?.data?.nodeData || node?.data || {};
    const wantedTag = String(nd?.tag || '').trim().toUpperCase();
    if (wantedTag) {
      const byTag = (mergedTanques || []).find((tank) => String(tank?.tag || '').trim().toUpperCase() === wantedTag);
      if (byTag) return byTag;
    }

    const candidates = [
      nd?.apiName, nd?.originalName, nd?.display_name, nd?.nombre, nd?.label,
      node?.label, node?.customName,
    ].filter(Boolean).map((value) => String(value).trim().toLowerCase());

    return (mergedTanques || []).find((tank) => {
      const tankNames = [tank?.display_name, tank?.nombre, tank?.tag]
        .filter(Boolean)
        .map((value) => String(value).trim().toLowerCase());
      return candidates.some((candidate) => tankNames.includes(candidate));
    }) || null;
  }, [selectedNode, selectedFlowNode, mergedTanques]);

  const handleNodeSelect = useCallback((id, node, options = {}) => {
    const resolvedId = id || node?.id || flowRef.current?.getSelectedNodeId?.() || null;
    const shouldOpenDetails = options && options.openDetails === true;

    setSelectedId(resolvedId);
    if (resolvedId) setSelectedEdgeId(null);

    const liveNode = resolvedId
      ? (node || flowRef.current?.getNodeById?.(resolvedId) || flowRef.current?.getSelectedNode?.() || pickNodeById(resolvedId) || null)
      : null;
    setSelectedFlowNode(resolvedId ? liveNode : null);

    // El panel lateral se abre únicamente con doble clic (openDetails=true).
    // Una selección simple, selección vacía o clic en el fondo no lo cierra;
    // el usuario lo cierra exclusivamente con la X.
    if (!shouldOpenDetails) return;
    if (!resolvedId || !liveNode) return;

    setDetailsDismissedId(null);
    setSelectedNode(liveNode);
  }, [pickNodeById]);

  // when selection changes, reset the showConnections toggle
  useEffect(() => {
    setShowConnections(false);
  }, [selectedId]);

  

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setScale(s => Math.max(0.4, Math.min(2.5, +(s + delta).toFixed(2))));
  }, []);

  function onMouseDown(e) {
    setDragging(true);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }

  function onMouseMove(e) {
    if (!dragging || !dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setOffset({ x: dragRef.current.ox + dx, y: dragRef.current.oy + dy });
  }

  function onMouseUp() { setDragging(false); dragRef.current = null; }

  const transform = `translate(${offset.x}, ${offset.y}) scale(${scale})`;

  const centerOn = (node) => {
    if (!containerRef.current || !node) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    // offset + scale * node.position = center
    const ox = Math.round(cx - scale * node.position.x);
    const oy = Math.round(cy - scale * node.position.y);
    setOffset({ x: ox, y: oy });
  };

  const onSelectTank = (value) => {
    if (!value) return;
    // value is merged tank object
    const name = (value.display_name || value.nombre || '').toLowerCase();
    const node = nodes.find(n => n.type === 'tank' && (n.label || '').toLowerCase().includes(name));
    if (node) {
      setSelectedId(node.id);
    }
  };

  const tankPickerOpen = useMemo(() => Boolean(false), []);
  const [tankButtonOpen, setTankButtonOpen] = useState(false);
  const selectedShapeNode = useMemo(() => {
    // "Cambiar figura" puede convertir cualquier elemento seleccionado a una
    // forma visual, no solamente nodos que ya nacieron como type="shape".
    return selectedFlowNode
      || flowRef.current?.getSelectedNode?.()
      || (selectedId ? flowRef.current?.getNodeById?.(selectedId) : null)
      || null;
  }, [selectedId, selectedFlowNode]);
  const isShapeChangeEnabled = Boolean(selectedShapeNode);
  const isTankAlreadyPresent = (tank) => {
    if (!tank) return true;
    const tankCandidates = [tank.tag, tank.apiName, tank.originalName, tank.display_name, tank.nombre, tank.id, tank.label]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    return (nodes || []).some((node) => {
      if (node.type !== 'tank') return false;
      const nodeCandidates = [node.id, node.label, node.data?.nodeData?.tag, node.data?.nodeData?.apiName, node.data?.nodeData?.originalName, node.data?.nodeData?.display_name, node.data?.nodeData?.nombre]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
      return tankCandidates.some((candidate) => nodeCandidates.includes(candidate));
    });
  };

  const tankOptions = useMemo(() => {
    const list = (mergedTanques || []).filter((tank) => !isTankAlreadyPresent(tank));
    return list.slice(0, 20);
  }, [mergedTanques, nodes]);

  // attach non-passive wheel listener to allow preventDefault without browser warnings
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel, { passive: false });
  }, [handleWheel]);

  return (
    <Box sx={{ position: 'relative', pointerEvents: 'auto' }} data-testid="dm-root">
      {/* DistrictToolbar intentionally removed per UX request */}

      <Paper elevation={1} sx={{ p: 2, pointerEvents: 'auto', position: 'relative' }} data-testid="dm-paper">
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 1 }} data-testid="dm-header">
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }} data-testid="dm-header-left">
            <Box sx={{ p: 1, bgcolor: '#ffffff', borderRadius: 1, boxShadow: 1 }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>Tanques</div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{summary.total}</div>
            </Box>

            <Box sx={{ ml: 'auto', position: 'relative' }}>
              <Button size="small" variant={tankButtonOpen ? 'contained' : 'outlined'} onClick={() => setTankButtonOpen(v => !v)} sx={{ mr: 1 }}>TANQUES</Button>
              {tankButtonOpen && (
                <Box sx={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 260, width: 320, maxHeight: 360, overflowY: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 2, boxShadow: '0 10px 25px rgba(15, 23, 42, 0.18)', p: 1 }}>
                  {tankOptions.length === 0 ? (
                    <Box sx={{ p: 1, color: '#64748b', fontSize: 12 }}>No hay tanques pendientes por añadir.</Box>
                  ) : (
                    tankOptions.map((tank) => (
                      <Box key={tank.tag || tank.id || tank.display_name || tank.nombre} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, p: 0.8, borderBottom: '1px solid #f1f5f9' }}>
                        <Box>
                          <Box sx={{ fontWeight: 700, fontSize: 12 }}>{tank.display_name || tank.nombre || tank.tag || tank.id}</Box>
                          <Box sx={{ fontSize: 10, color: '#64748b' }}>{tank.tag || tank.id || 'Sin tag'}</Box>
                        </Box>
                        <Button size="small" variant="outlined" onClick={() => {
                          flowRef.current?.addTankFromApi?.(tank);
                          setTankButtonOpen(false);
                        }}>Agregar</Button>
                      </Box>
                    ))
                  )}
                </Box>
              )}
              <Button size="small" variant="outlined" onClick={() => {
                // prepare draft mapping for unmapped nodes
                try {
                  const current = loadManualMapping();
                  const unmapped = (nodes || []).filter(n => n.type === 'tank' && !EXCLUDED_NODE_IDS.has(n.id) && !(current && current[n.id]));
                  const draft = {};
                  unmapped.forEach(n => { draft[n.id] = current && current[n.id] ? current[n.id] : null; });
                  setMappingDraft(draft);
                } catch (e) { setMappingDraft({}); }
                setMappingDialogOpen(true);
              }}>Mapear nodos sin mapear</Button>
            </Box>
            <Box sx={{ p: 1, bgcolor: '#ffffff', borderRadius: 1, boxShadow: 1, display: 'flex', gap: 2 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>Normal</div>
                <div style={{ fontWeight: 700 }}>{summary.normal}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>Atención</div>
                <div style={{ fontWeight: 700 }}>{summary.atencion}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>Crítico</div>
                <div style={{ fontWeight: 700 }}>{summary.critico}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>Sin datos</div>
                <div style={{ fontWeight: 700 }}>{summary.sinDatos}</div>
              </div>
            </Box>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1, pointerEvents: 'auto' }}>
          <Autocomplete
            freeSolo
            options={(mergedTanques || []).map(t => ({ label: t.display_name || t.nombre || t.id, value: t }))}
            filterOptions={(options, state) => {
              const q = (state.inputValue || '').toString().toLowerCase().trim();
              if (!q) return options;
              return options.filter(opt => {
                const v = opt.value;
                const label = (opt.label || '').toLowerCase();
                if (label.includes(q)) return true;
                if (v && Array.isArray(v.aliases)) {
                  for (const a of v.aliases) {
                    if (String(a || '').toLowerCase().includes(q)) return true;
                  }
                }
                if (v && v.tag && String(v.tag).toLowerCase().includes(q)) return true;
                if (v && v.id && String(v.id).toLowerCase().includes(q)) return true;
                return false;
              });
            }}
            onChange={(e, newValue) => {
              if (!newValue) return;
              onSelectTank(newValue.value);
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Buscar tanque, PTAP o distrito..."
                size="small"
                sx={{ flex: 1 }}
                InputProps={{
                  ...params.InputProps,
                  startAdornment: (
                    <>
                      <InputAdornment position="start"><SearchIcon /></InputAdornment>
                      {params.InputProps?.startAdornment}
                    </>
                  ),
                }}
              />
            )}
          />
          <Box sx={{ display: 'flex', gap: 1, ml: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button size="small" variant={filterState === 'all' ? 'contained' : 'outlined'} onClick={() => setFilterState('all')}>Todos</Button>
            <Button size="small" variant={filterState === 'normal' ? 'contained' : 'outlined'} onClick={() => setFilterState('normal')}>Normal</Button>
            <Button size="small" variant={filterState === 'atencion' ? 'contained' : 'outlined'} onClick={() => setFilterState('atencion')}>Atención</Button>
            <Button size="small" variant={filterState === 'critico' ? 'contained' : 'outlined'} onClick={() => setFilterState('critico')}>Crítico</Button>
            <Button size="small" variant={filterState === 'sin-datos' ? 'contained' : 'outlined'} onClick={() => setFilterState('sin-datos')}>Sin datos</Button>
            <Button size="small" startIcon={editMode ? <DoneIcon /> : <EditIcon />} variant={editMode ? 'contained' : 'outlined'} sx={{ ml: 1 }} onClick={() => setEditMode(e => !e)}>{editMode ? 'Finalizar edición' : 'Editar diagrama'}</Button>
            {/* Bloquear / Permitir modificar (junto a Editar) */}
            {diagramLocked ? (
              isAdmin ? (
                <Button size="small" startIcon={<LockIcon />} variant="contained" color="secondary" sx={{ ml: 1 }} onClick={() => {
                  try {
                    // Admin unlock: allow editing only via admin action
                    const ok = window.confirm('Confirmar desbloqueo de diagrama como administrador. ¿Continuar?');
                    if (!ok) return;
                    setDiagramLocked(false);
                    setEditTool('select');
                    setDeleteMode(false);
                    setDiagramMode('edit');
                    try {
                      localStorage.setItem('district_locked', '0');
                      localStorage.setItem('district_diagram_mode', 'edit');
                    } catch (e) {}
                    flowRef.current?.editUnlockAllNodes?.();
                    setSnack({ open: true, msg: 'Diagrama desbloqueado (admin)' });
                  } catch (e) { console.warn(e); }
                }}>Desbloquear (admin)</Button>
              ) : (
                <Button size="small" variant="outlined" color="inherit" sx={{ ml: 1 }} disabled>Bloqueado (solo admin)</Button>
              )
            ) : (
              <Button size="small" startIcon={<LockClockIcon />} variant="outlined" color="warning" sx={{ ml: 1 }} onClick={() => {
                try {
                  // Lock: save and fix positions, prevent further moves
                  flowRef.current?.saveAndLockAllNodes?.();
                  setDiagramLocked(true);
                  setDiagramMode('view');
                  try { localStorage.setItem('district_locked', '1'); } catch (e) {}
                  setSnack({ open: true, msg: 'Diagrama guardado y bloqueado' });
                } catch (e) { console.warn(e); }
              }}>Bloquear</Button>
            )}
          </Box>
        </Box>

        {editMode ? (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1, flexWrap: 'wrap', background: '#f8fafc', p: 1, borderRadius: 1.5, border: '1px solid #e2e8f0', pointerEvents: 'auto' }}>
            <Button
              size="small"
              startIcon={<PanToolIcon />}
              variant={editTool === 'select' && !deleteMode ? 'contained' : 'outlined'}
              onClick={() => {
                setEditTool('select');
                setDeleteMode(false);
                setDiagramLocked(false);
                setDiagramMode('edit');
                try {
                  localStorage.setItem('district_diagram_mode', 'edit');
                  localStorage.setItem('district_locked', '0');
                } catch (e) {}
                flowRef.current?.editUnlockAllNodes?.();
              }}
            >
              Seleccionar / Mover
            </Button>
            <Button
              size="small"
              startIcon={<LinkIcon />}
              variant={editTool === 'connect' && !deleteMode ? 'contained' : 'outlined'}
              color="primary"
              onClick={() => { setEditTool('connect'); setDeleteMode(false); }}
            >
              Conectar
            </Button>
            {/* Selector tipo de línea */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5, borderRadius: 1, border: '1px solid #cbd5e1', background: '#fff' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginRight: 2 }}>Línea:</span>
              {[
                { value: 'smart', label: 'Auto', icon: '└─' },
                { value: 'straight', label: 'Recta', icon: '─' },
                { value: 'default', label: 'Curva', icon: '⌒' },
                { value: 'smoothstep', label: 'Suave', icon: '⌣' },
                { value: 'step', label: 'Escalón', icon: '⌐' },
                ].map(opt => (
                <button
                  key={opt.value}
                  title={opt.label}
                  onClick={() => {
                    setEdgeLineType(opt.value);
                    try { localStorage.setItem('district_edge_line_type', opt.value); } catch(e){}
                    // Si hay una conexión seleccionada, cambiar sólo esa arista.
                    if (selectedEdgeId) {
                      flowRef.current?.updateEdgeType?.(selectedEdgeId, opt.value);
                    } else {
                      // Si no hay selección, cambiar el tipo por defecto para nuevas conexiones
                      flowRef.current?.setDefaultEdgeType?.(opt.value);
                    }
                  }}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 5,
                    border: edgeLineType === opt.value ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                    background: edgeLineType === opt.value ? '#dbeafe' : '#f8fafc',
                    fontWeight: edgeLineType === opt.value ? 800 : 500,
                    color: edgeLineType === opt.value ? '#1d4ed8' : '#475569',
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
                    lineHeight: 1.1,
                  }}
                >
                  <span style={{ fontSize: 15, lineHeight: 1 }}>{opt.icon}</span>
                  <span style={{ fontSize: 9 }}>{opt.label}</span>
                </button>
              ))}
            </Box>
            <Button
              size="small"
              variant={editTool === 'duplicate' && !deleteMode ? 'contained' : 'outlined'}
              color="success"
              onClick={() => {
                setDeleteMode(false);
                if (selectedId) {
                  flowRef.current?.duplicateSelectedNode?.(selectedId);
                }
                setEditTool('duplicate');
              }}
            >
              Duplicar
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="success"
              onClick={() => { setDeleteMode(false); flowRef.current?.addDiagramNode?.(); }}
            >
              + Tanque
            </Button>
            <div style={{ position: 'relative' }}>
              <Button
                size="small"
                variant={showShapePicker ? 'contained' : 'outlined'}
                color="info"
                onClick={() => setShowShapePicker(v => !v)}
              >
                + Forma / Texto ▾
              </Button>
              {showShapePicker && (
                <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 200, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, minWidth: 180 }}>
                  {SHAPE_MENU_OPTIONS.map(s => (
                    <button key={s.type} title={s.label} onClick={() => { setDeleteMode(false); flowRef.current?.addShapeNode?.(s.type); setShowShapePicker(false); }} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 6, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = '#dbeafe'} onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}>
                      <svg width="24" height="24" viewBox="0 0 24 24">{s.svg}</svg>
                      <span style={{ fontSize: 9, color: '#475569', fontWeight: 600, textAlign: 'center', lineHeight: 1.1 }}>{s.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <Button
                size="small"
                variant={showChangeShapePicker ? 'contained' : 'outlined'}
                color="secondary"
                disabled={!isShapeChangeEnabled}
                onClick={() => {
                  const activeNode = flowRef.current?.getSelectedNode?.()
                    || selectedFlowNode
                    || (selectedId ? flowRef.current?.getNodeById?.(selectedId) : null)
                    || null;
                  if (!activeNode) {
                    setSnack({ open: true, msg: 'Selecciona un elemento para cambiar su figura' });
                    return;
                  }
                  setShowChangeShapePicker(v => !v);
                }}
              >
                Cambiar figura
              </Button>
              {showChangeShapePicker && (
                <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 200, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, minWidth: 180 }}>
                  {SHAPE_MENU_OPTIONS.map(s => (
                    <button key={s.type} title={s.label} onClick={async () => {
                      setDeleteMode(false);
                      const activeId = flowRef.current?.getSelectedNodeId?.() || selectedId || null;
                      if (!activeId) return;
                      setShowChangeShapePicker(false);
                      const changed = await flowRef.current?.changeSelectedNodeShape?.(activeId, s.type);
                      if (!changed) setSnack({ open: true, msg: 'No se pudo guardar el cambio de figura' });
                    }} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 6, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = '#dbeafe'} onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}>
                      <svg width="24" height="24" viewBox="0 0 24 24">{s.svg}</svg>
                      <span style={{ fontSize: 9, color: '#475569', fontWeight: 600, textAlign: 'center', lineHeight: 1.1 }}>{s.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button
              size="small"
              variant={deleteMode ? 'contained' : 'outlined'}
              color="error"
              onClick={() => {
                if (selectedId) {
                  flowRef.current?.deleteSelectedNode?.(selectedId);
                  setSelectedId(null);
                  setDeleteMode(false);
                  setEditTool('select');
                  setSnack({ open: true, msg: 'Elemento eliminado' });
                } else if (selectedEdgeId) {
                  flowRef.current?.deleteSelectedConnection?.(selectedEdgeId);
                  setSelectedEdgeId(null);
                  setDeleteMode(false);
                  setEditTool('select');
                  setSnack({ open: true, msg: 'Conexión eliminada' });
                } else {
                  setDeleteMode(m => !m);
                  setEditTool('select');
                }
              }}
            >
              Eliminar
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={() => {
                if (selectedEdgeId) {
                  flowRef.current?.deleteSelectedConnection?.(selectedEdgeId);
                  setSelectedEdgeId(null);
                  setDeleteMode(false);
                  setEditTool('select');
                  setSnack({ open: true, msg: 'Conexión eliminada' });
                } else {
                  flowRef.current?.deleteSelectedConnection?.();
                }
              }}
            >
              Eliminar conexión
            </Button>

            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Button size="small" variant="outlined" color="secondary" onClick={() => {
                setDeleteMode(false);
                const tid = selectedId || flowRef.current?.getSelectedNodeId?.();
                flowRef.current?.resizeSelectedNode?.(tid, -10, -10);
                setSnack({ open: true, msg: 'Tamaño - aplicado' });
              }}>Tamaño -</Button>
              <Button size="small" variant="outlined" color="secondary" onClick={() => {
                setDeleteMode(false);
                const tid = selectedId || flowRef.current?.getSelectedNodeId?.();
                flowRef.current?.resizeSelectedNode?.(tid, 10, 10);
                setSnack({ open: true, msg: 'Tamaño + aplicado' });
              }}>Tamaño +</Button>
              <Button size="small" variant="outlined" color="warning" onClick={() => {
                setDeleteMode(false);
                const tid = selectedId || flowRef.current?.getSelectedNodeId?.();
                flowRef.current?.rotateSelectedNode?.(tid, 'left');
                setSnack({ open: true, msg: 'Rotado -90°' });
              }}>↺</Button>
              <Button size="small" variant="outlined" color="warning" onClick={() => {
                setDeleteMode(false);
                const tid = selectedId || flowRef.current?.getSelectedNodeId?.();
                flowRef.current?.rotateSelectedNode?.(tid, 'right');
                setSnack({ open: true, msg: 'Rotado +90°' });
              }}>↻</Button>
            </Box>

            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', px: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', marginRight: 6 }}>Conexión</div>
              <button type="button" onClick={() => { const nextWidth = Math.max(1, Number(connectionStrokeWidth || 3) - 1); setConnectionStrokeWidth(nextWidth); flowRef.current?.updateSelectedConnectionStyle?.(selectedEdgeId, { strokeWidth: nextWidth }); }} style={{ width: 30, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>-</button>
              <span style={{ fontSize: 11, color: '#334155', minWidth: 28, textAlign: 'center', fontWeight: 700 }}>{connectionStrokeWidth}px</span>
              <button type="button" onClick={() => { const nextWidth = Math.min(12, Number(connectionStrokeWidth || 3) + 1); setConnectionStrokeWidth(nextWidth); flowRef.current?.updateSelectedConnectionStyle?.(selectedEdgeId, { strokeWidth: nextWidth }); }} style={{ width: 30, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>+</button>
              <input type="color" value={connectionStrokeColor} onChange={(e) => { const next = e.target.value; setConnectionStrokeColor(next); flowRef.current?.updateSelectedConnectionStyle?.(selectedEdgeId, { stroke: next, strokeWidth: connectionStrokeWidth || 3 }); }} style={{ width: 34, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', padding: 0 }} />
              {/* connection label editing removed per UI requirements */}
            </Box>

            {/* Selector de color */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, px: 1, py: 0.4, borderRadius: 1, background: '#fff', border: '1px solid #cbd5e1' }}>
              <PaletteIcon sx={{ fontSize: 18, color: '#64748b' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginRight: 2 }}>Color:</span>
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={`Color ${c.label}`}
                  onClick={() => {
                    flowRef.current?.changeSelectedNodeColor?.(c.value, selectedId);
                  }}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: c.value,
                    border: '1.5px solid #fff',
                    boxShadow: '0 0 2px rgba(0,0,0,0.3)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
              <input
                type="color"
                title="Color personalizado"
                defaultValue="#3b82f6"
                onChange={(e) => {
                  flowRef.current?.changeSelectedNodeColor?.(e.target.value, selectedId);
                }}
                style={{
                  width: 22,
                  height: 22,
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  borderRadius: 4,
                }}
              />
            </Box>

            {/* Divisor visual */}
            <Box sx={{ width: '1px', height: 28, bgcolor: '#cbd5e1', mx: 0.5 }} />

            {/* ── Botones de modo diagrama ── */}
            <Tooltip title="Activar modo edición: arrastra los tanques libremente">
              <Button
                size="small"
                startIcon={<OpenWithIcon />}
                variant={diagramMode === 'edit' ? 'contained' : 'outlined'}
                color="success"
                onClick={() => {
                  setDiagramLocked(false);
                  setEditTool('select');
                  setDeleteMode(false);
                  setDiagramMode('edit');
                  try {
                    localStorage.setItem('district_diagram_mode', 'edit');
                    localStorage.setItem('district_locked', '0');
                  } catch (e) {}
                  flowRef.current?.editUnlockAllNodes?.();
                }}
                sx={{ fontWeight: 700, minWidth: 80 }}
              >
                Mover
              </Button>
            </Tooltip>

            <Tooltip title="Guardar posiciones del diagrama">
              <Button
                size="small"
                startIcon={<SaveIcon />}
                variant="contained"
                color="primary"
                onClick={async () => {
                  try {
                    const flow = flowRef.current;
                    window.__diagTrace = Array.isArray(window.__diagTrace) ? window.__diagTrace : [];
                    // The explicit server-save action is the single authoritative path for
                    // the user-triggered Save button. Avoid calling the lock+reload helper
                    // here because it performs its own save/reload cycle and can race with
                    // the actual persist request we need to verify in the browser.
                    const ok = await flowRef.current?.doSaveToServer?.();
                    if (ok) {
                      setSnack({ open: true, msg: '✓ Diagrama guardado' });
                    } else {
                      setSnack({ open: true, msg: 'Error guardando diagrama' });
                    }
                  } catch (e) { setSnack({ open: true, msg: 'Error guardando diagrama' }); }
                }}
                sx={{ fontWeight: 700, minWidth: 90 }}
              >
                Guardar
              </Button>
            </Tooltip>

            <Tooltip title="Modo solo visual: bloquea el diagrama, no se puede mover nada">
              <Button
                size="small"
                startIcon={<LockIcon />}
                variant={diagramMode === 'view' ? 'contained' : 'outlined'}
                color="secondary"
                onClick={() => {
                  flowRef.current?.saveAndLockAllNodes?.();
                  setDiagramMode('view');
                  try { localStorage.setItem('district_diagram_mode', 'view'); } catch (e) {}
                  setSnack({ open: true, msg: '🔒 Modo solo visual activado' });
                }}
                sx={{ fontWeight: 700, minWidth: 110 }}
              >
                Solo visual
              </Button>
            </Tooltip>

            <Button size="small" startIcon={<UndoIcon />} onClick={() => { flowRef.current?.doUndo(); }}>Deshacer</Button>
          </Box>
        ) : null}

      </Paper>

        <Box sx={{ width: '100%', height: '72vh', overflow: 'hidden', position: 'relative', pointerEvents: 'auto' }} data-testid="dm-canvas-wrap">
          <Box sx={{
            position: 'absolute', top: 12, right: 12, zIndex: 260,
            display: 'flex', alignItems: 'center', gap: 0.7,
            px: 1, py: 0.4, borderRadius: 999,
            fontSize: 11, fontWeight: 700,
            background: ibalConnectionState.tone === 'success'
              ? 'rgba(34,197,94,0.12)'
              : ibalConnectionState.tone === 'error'
                ? 'rgba(239,68,68,0.12)'
                : 'rgba(148,163,184,0.12)',
            color: ibalConnectionState.tone === 'success'
              ? '#166534'
              : ibalConnectionState.tone === 'error'
                ? '#991b1b'
                : '#334155',
            border: '1px solid',
            borderColor: ibalConnectionState.tone === 'success'
              ? 'rgba(34,197,94,0.35)'
              : ibalConnectionState.tone === 'error'
                ? 'rgba(239,68,68,0.35)'
                : 'rgba(148,163,184,0.35)',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.12)'
          }}>
            <Box sx={{
              width: 7, height: 7, borderRadius: '50%',
              background: ibalConnectionState.tone === 'success'
                ? '#22c55e'
                : ibalConnectionState.tone === 'error'
                  ? '#ef4444'
                  : '#94a3b8'
            }} />
            <span>{ibalConnectionState.label}</span>
          </Box>
          {/* Banner de error de conexión — discreto y colapsable */}
          {(error && !errorDismissed) ? (
            <Box sx={{
              position: 'absolute', bottom: 56, right: 12, zIndex: 250,
              display: 'flex', alignItems: 'center', gap: 1,
              background: 'rgba(30,41,59,0.88)', color: '#fbbf24',
              px: 1.5, py: 0.8, borderRadius: 2,
              fontSize: 12, fontWeight: 600,
              boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
              border: '1px solid rgba(251,191,36,0.3)',
              backdropFilter: 'blur(4px)',
            }}>
              <WifiOffIcon sx={{ fontSize: 15, color: '#fbbf24' }} />
              <span>Sin conexión IBAL — datos no disponibles</span>
              <button
                type="button"
                onClick={() => setErrorDismissed(true)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px', marginLeft: 4 }}
                title="Cerrar"
              >✕</button>
            </Box>
          ) : null}
          {/* No montar el diagrama hasta que tanques + PTAP + captación estén listos.
              Así Mackenfloc y caudales aparecen en el mismo primer render. */}
          {loading && !(tanques || []).length ? (
            <Box sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
              color: '#475569',
              background: '#f8fafc',
            }}>
              Cargando tanques, Mackenfloc y caudales…
            </Box>
          ) : (
            <DistrictFlow ref={flowRef} apiError={Boolean(error)} onNodeSelect={handleNodeSelect} onDeleteComplete={() => {
              setDeleteMode(false);
              setEditTool('select');
              setSelectedEdgeId(null);
            }} onEdgeSelect={(id, edge) => {
              setSelectedEdgeId(id || null);
              if (!id) return;
              const selectedEdge = edge || flowRef.current?.getEdgeById?.(id) || null;
              if (!selectedEdge) return;
              const nextType = selectedEdge.type || 'smart';
              const nextWidth = Number(selectedEdge.style?.strokeWidth || 3);
              const nextColor = selectedEdge.style?.stroke || selectedEdge.markerEnd?.color || '#000000';
              setEdgeLineType(nextType);
              setConnectionStrokeWidth(nextWidth);
              setConnectionStrokeColor(nextColor);
            }} editMode={editMode} mode={editTool} deleteMode={deleteMode} containerRef={containerRef} focusNodeId={selectedId} filterState={filterState} edgeLineType={edgeLineType} diagramModeExternal={diagramMode} onDiagramModeChange={setDiagramMode} onDirtyChanged={(v) => { try { setUnsavedChanges(!!v); } catch (e) {} }} />
          )}
          {tooltip ? (
            <Box sx={{ position: 'absolute', pointerEvents: 'none', left: tooltip.x - (containerRef.current?.getBoundingClientRect().left || 0) + 8, top: tooltip.y - (containerRef.current?.getBoundingClientRect().top || 0) + 8, background: 'white', p: 1, borderRadius: 1, boxShadow: 2, fontSize: 12 }}>
              {String(tooltip.content).split('\n').map((l, i) => <div key={i}>{l}</div>)}
            </Box>
          ) : null}
        </Box>

      <Dialog open={mappingDialogOpen} onClose={() => setMappingDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Mapear nodos manualmente</DialogTitle>
        <DialogContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(Object.keys(mappingDraft || {}) || []).length === 0 ? (
              <div>No hay nodos sin mapear o ya fueron mapeados.</div>
            ) : (
              Object.keys(mappingDraft).map((nid) => {
                const node = (nodes || []).find(x => x.id === nid) || { id: nid, label: nid };
                return (
                  <div key={nid} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ width: 220, fontWeight: 700 }}>{node.label || nid}</div>
                    <Autocomplete
                      sx={{ flex: 1 }}
                      options={(mergedTanques || []).map(t => ({ id: t.id, tag: t.tag, label: `${t.display_name || t.nombre} (${t.tag || t.id})` }))}
                      value={mappingDraft[nid] ? { id: mappingDraft[nid].id, tag: mappingDraft[nid].tag, label: `${mappingDraft[nid].tag || mappingDraft[nid].id}` } : null}
                      onChange={(e, v) => {
                        setMappingDraft(d => ({ ...d, [nid]: v ? { id: v.id, tag: v.tag } : null }));
                      }}
                      renderInput={(params) => <TextField {...params} label="Seleccionar tanque IBAL (tag/id)" />}
                    />
                    <Button size="small" color="secondary" onClick={() => setMappingDraft(d => ({ ...d, [nid]: null }))}>Limpiar</Button>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMappingDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={async () => {
            try {
              // persist locally
              const currentLocal = loadManualMappingFromLocal() || {};
              const mergedLocal = { ...currentLocal };
              Object.entries(mappingDraft || {}).forEach(([k, v]) => { if (v && (v.id || v.tag)) mergedLocal[k] = v; else delete mergedLocal[k]; });
              localStorage.setItem(MANUAL_MAPPING_KEY, JSON.stringify(mergedLocal));
              // persist to server: merge into server state under `manual_node_mapping`
              const serverState = await diagramService.getState();
              const serverMapping = serverState && serverState.manual_node_mapping ? serverState.manual_node_mapping : {};
              const mergedServer = { ...serverMapping, ...mergedLocal };
              const newState = { ...(serverState || {}), manual_node_mapping: mergedServer };
              await diagramService.saveState(newState);
              setServerManualMapping(mergedServer);
              setManualMappingVersion(v => v + 1);
            } catch (e) { console.warn('No se pudo guardar mapping en servidor', e); }
            setMappingDialogOpen(false);
          }}>Guardar mapeo</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack.open}
        message={snack.msg}
        autoHideDuration={1400}
        onClose={() => setSnack({ open: false, msg: '' })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />

      <ElementDetails open={!!selectedNode} onClose={() => { setDetailsDismissedId(selectedNode?.id || null); setSelectedNode(null); setShowConnections(false); }} node={selectedNode || null} tankData={selectedTankData} nodes={nodes} connections={resolvedConnections} onShowConnections={() => {
        if (!selectedNode) return;
        setShowConnections(s => !s);
        centerOn(selectedNode);
      }} onRenameNode={(nextLabel) => {
        const detailsId = selectedNode?.id || null;
        if (!detailsId) return;
        if (flowRef.current && typeof flowRef.current.renameSelectedNode === 'function') {
          flowRef.current.renameSelectedNode(detailsId, nextLabel);
          window.setTimeout(() => {
            try {
              const live = flowRef.current?.getNodeById?.(detailsId) || null;
              if (live) {
                setSelectedNode(live);
                if (selectedId === detailsId) setSelectedFlowNode(live);
              }
            } catch (e) {}
          }, 0);
        }
      }} onDelete={() => {
        const detailsId = selectedNode?.id || null;
        if (!detailsId) return;
        if (flowRef.current && typeof flowRef.current.deleteSelectedNode === 'function') {
          flowRef.current.deleteSelectedNode(detailsId);
          setSelectedNode(null);
          if (selectedId === detailsId) setSelectedId(null);
          setShowConnections(false);
        }
      }} />
    </Box>
  );
}
