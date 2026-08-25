import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { Box, Paper, TextField, InputAdornment, IconButton, Autocomplete, Button, OutlinedInput, Snackbar } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import debounce from '../../utils/debounce';
import { loadCatalog, mergeApiTanquesWithCatalog, calculateDisplayPorcentaje, normalizeText, findCatalogEntry } from '../../config/tankCatalog';
import { getStatusMeta } from '../../utils/statusUtils';
import { NODES as STATIC_NODES, CONNECTIONS as STATIC_CONNECTIONS } from './districtLayout';
// TankNode/PlantNode/DistrictNode/Connection rendered inside DistrictFlow
import DistrictToolbar from './DistrictToolbar';
import ElementDetails from './ElementDetails';
import useTanques from '../../hooks/useTanques';
import Tooltip from '@mui/material/Tooltip';
import EditIcon from '@mui/icons-material/Edit';
import DoneIcon from '@mui/icons-material/Done';
import LinkIcon from '@mui/icons-material/Link';
import PanToolIcon from '@mui/icons-material/PanTool';
import SaveIcon from '@mui/icons-material/Save';
import RestoreIcon from '@mui/icons-material/Restore';
import UndoIcon from '@mui/icons-material/Undo';
import PaletteIcon from '@mui/icons-material/Palette';
import DistrictFlow from './DistrictFlow';

const COLOR_PRESETS = [
  { label: 'Azul', value: '#3b82f6' },
  { label: 'Cian', value: '#06b6d4' },
  { label: 'Verde', value: '#10b981' },
  { label: 'Ámbar', value: '#f59e0b' },
  { label: 'Rojo', value: '#ef4444' },
  { label: 'Morado', value: '#8b5cf6' },
  { label: 'Gris', value: '#64748b' },
];

export default function DistrictMap() {
  const { tanques, loading } = useTanques();
  try { console.debug('[DISTRICT DEBUG] useTanques returned:', Array.isArray(tanques) ? tanques.length : typeof tanques); } catch (e) {}
  try { console.debug('[DISTRICT DEBUG] STATIC_NODES count:', Array.isArray(STATIC_NODES) ? STATIC_NODES.length : typeof STATIC_NODES); } catch (e) {}
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [filterState, setFilterState] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [tooltip, setTooltip] = useState(null);
  const [viewAllToggle, setViewAllToggle] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editTool, setEditTool] = useState('select');
  const [deleteMode, setDeleteMode] = useState(false);
  const [showShapePicker, setShowShapePicker] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [connectionStrokeWidth, setConnectionStrokeWidth] = useState(3);
  const [connectionStrokeColor, setConnectionStrokeColor] = useState('#000000');
  const [connectionLabel, setConnectionLabel] = useState('');
  const [snack, setSnack] = useState({ open: false, msg: '' });

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
  // Build nodes and resolved connections from API + static layout
  const { nodes, resolvedConnections } = useMemo(() => {
    const baseNodes = STATIC_NODES.map((node) => {
      if (node.type === 'plant' || node.type === 'district') {
        return {
          ...node,
          data: { display_name: node.label },
        };
      }

      const matchedTank = (mergedTanques || []).find((tank) => {
        if (!tank) return false;
        const candidates = [
          tank.id != null ? String(tank.id) : '',
          tank.tag,
          tank.display_name,
          tank.nombre,
          tank.name,
          ...(tank.aliases || [])
        ].filter(Boolean).map(normalizeText);

        const labelCandidates = [node.label, node.id].filter(Boolean).map(normalizeText);
        return candidates.some((candidate) => labelCandidates.some((labelCandidate) => candidate === labelCandidate || candidate.includes(labelCandidate) || labelCandidate.includes(candidate)));
      });

      return {
        ...node,
        data: matchedTank ? { ...matchedTank, _api_id: matchedTank.id, display_name: node.label } : { display_name: node.label, __placeholder: true },
      };
    });

    return {
      nodes: baseNodes,
      resolvedConnections: STATIC_CONNECTIONS.map((c) => ({ id: `${c.from}-${c.to}`, from: c.from, to: c.to, label: c.label })),
    };
  }, [mergedTanques]);
  const containerRef = useRef(null);
  const flowRef = useRef(null);
  const [flowOn, setFlowOn] = useState(false);
  const flowNodes = useMemo(() => {
    if (nodes && nodes.length) return nodes;
    return STATIC_NODES.map(s => {
      if (s.type === 'plant' || s.type === 'district') return { id: s.id, type: s.type, label: s.label, position: s.position, data: { display_name: s.label } };
      return { id: s.id, type: 'tank', label: s.label, position: s.position, data: { display_name: s.label, __placeholder: true } };
    });
  }, [nodes]);

  useEffect(() => {
    // sync initial flow state from Flow component when mounted
    try {
      if (flowRef.current && flowRef.current.getShowFlow) setFlowOn(!!flowRef.current.getShowFlow());
    } catch (e) {}
  }, []);

  const pickNodeById = (id) => (nodes || []).find(n => n.id === id) || null;
  const selectedNode = selectedId ? pickNodeById(selectedId) : null;

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

  // attach non-passive wheel listener to allow preventDefault without browser warnings
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel, { passive: false });
  }, [handleWheel]);

  return (
    <Box sx={{ position: 'relative' }}>
      <DistrictToolbar onZoomIn={() => setScale(s => Math.min(2.5, s + 0.2))} onZoomOut={() => setScale(s => Math.max(0.4, s - 0.2))} onFit={() => { setScale(1); setOffset({ x: 0, y: 0 }); }} />

      <Paper elevation={1} sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 1 }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Box sx={{ p: 1, bgcolor: '#ffffff', borderRadius: 1, boxShadow: 1 }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>Tanques</div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{summary.total}</div>
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
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
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
            renderInput={(params) => {
              const { InputProps, ...restParams } = params;
              return (
                <TextField
                  {...restParams}
                  placeholder="Buscar tanque, PTAP o distrito..."
                  size="small"
                  sx={{ flex: 1 }}
                  slotProps={{
                    input: {
                      ...InputProps,
                      startAdornment: (
                        <>
                          <InputAdornment position="start"><SearchIcon /></InputAdornment>
                          {InputProps?.startAdornment}
                        </>
                      ),
                    },
                  }}
                />
              );
            }}
          />
          <Box sx={{ display: 'flex', gap: 1, ml: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button size="small" variant={filterState === 'all' ? 'contained' : 'outlined'} onClick={() => setFilterState('all')}>Todos</Button>
            <Button size="small" variant={filterState === 'normal' ? 'contained' : 'outlined'} onClick={() => setFilterState('normal')}>Normal</Button>
            <Button size="small" variant={filterState === 'atencion' ? 'contained' : 'outlined'} onClick={() => setFilterState('atencion')}>Atención</Button>
            <Button size="small" variant={filterState === 'critico' ? 'contained' : 'outlined'} onClick={() => setFilterState('critico')}>Crítico</Button>
            <Button size="small" variant={filterState === 'sin-datos' ? 'contained' : 'outlined'} onClick={() => setFilterState('sin-datos')}>Sin datos</Button>
            <Button size="small" startIcon={editMode ? <DoneIcon /> : <EditIcon />} variant={editMode ? 'contained' : 'outlined'} sx={{ ml: 1 }} onClick={() => setEditMode(e => !e)}>{editMode ? 'Finalizar edición' : 'Editar diagrama'}</Button>
          </Box>
        </Box>

        {editMode ? (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1, flexWrap: 'wrap', background: '#f8fafc', p: 1, borderRadius: 1.5, border: '1px solid #e2e8f0' }}>
            <Button
              size="small"
              startIcon={<PanToolIcon />}
              variant={editTool === 'select' && !deleteMode ? 'contained' : 'outlined'}
              onClick={() => { setEditTool('select'); setDeleteMode(false); }}
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
                  {[
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
                  ].map(s => (
                    <button key={s.type} title={s.label} onClick={() => { setDeleteMode(false); flowRef.current?.addShapeNode?.(s.type); setShowShapePicker(false); }} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 6, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = '#dbeafe'} onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}>
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
              onClick={() => { setDeleteMode(m => !m); setEditTool('select'); }}
            >
              Eliminar
            </Button>
            <Button size="small" variant="outlined" color="error" onClick={() => { flowRef.current?.deleteSelectedConnection?.(); }}>Eliminar conexión</Button>

            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Button size="small" variant="outlined" color="secondary" onClick={() => { setDeleteMode(false); const tid = selectedId || flowRef.current?.getSelectedNodeId?.(); console.debug('Tamaño - clicked, targetId=', tid); flowRef.current?.resizeSelectedNode?.(tid, -10, -10); setSnack({ open: true, msg: 'Tamaño - aplicado' }); }}>Tamaño -</Button>
              <Button size="small" variant="outlined" color="secondary" onClick={() => { setDeleteMode(false); const tid = selectedId || flowRef.current?.getSelectedNodeId?.(); console.debug('Tamaño + clicked, targetId=', tid); flowRef.current?.resizeSelectedNode?.(tid, 10, 10); setSnack({ open: true, msg: 'Tamaño + aplicado' }); }}>Tamaño +</Button>
              <Button size="small" variant="outlined" color="warning" onClick={() => { setDeleteMode(false); const tid = selectedId || flowRef.current?.getSelectedNodeId?.(); console.debug('Rotar left clicked, targetId=', tid); flowRef.current?.rotateSelectedNode?.(tid, 'left'); setSnack({ open: true, msg: 'Rotado -90°' }); }}>↺</Button>
              <Button size="small" variant="outlined" color="warning" onClick={() => { setDeleteMode(false); const tid = selectedId || flowRef.current?.getSelectedNodeId?.(); console.debug('Rotar right clicked, targetId=', tid); flowRef.current?.rotateSelectedNode?.(tid, 'right'); setSnack({ open: true, msg: 'Rotado +90°' }); }}>↻</Button>
            </Box>

            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', px: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', marginRight: 6 }}>Conexión</div>
              <button type="button" onClick={() => { const nextWidth = Math.max(1, Number(connectionStrokeWidth || 3) - 1); setConnectionStrokeWidth(nextWidth); flowRef.current?.updateSelectedConnectionStyle?.(selectedEdgeId, { strokeWidth: nextWidth }); }} style={{ width: 30, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>-</button>
              <span style={{ fontSize: 11, color: '#334155', minWidth: 28, textAlign: 'center', fontWeight: 700 }}>{connectionStrokeWidth}px</span>
              <button type="button" onClick={() => { const nextWidth = Math.min(12, Number(connectionStrokeWidth || 3) + 1); setConnectionStrokeWidth(nextWidth); flowRef.current?.updateSelectedConnectionStyle?.(selectedEdgeId, { strokeWidth: nextWidth }); }} style={{ width: 30, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>+</button>
              <input type="color" value={connectionStrokeColor} onChange={(e) => { const next = e.target.value; setConnectionStrokeColor(next); flowRef.current?.updateSelectedConnectionStyle?.(selectedEdgeId, { stroke: next, strokeWidth: connectionStrokeWidth || 3 }); }} style={{ width: 34, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', padding: 0 }} />
              <input type="text" placeholder="Etiqueta" value={connectionLabel} onChange={(e) => setConnectionLabel(e.target.value)} style={{ width: 120, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', padding: '4px 8px' }} />
              <Button size="small" onClick={() => { flowRef.current?.updateSelectedEdgeLabel?.(selectedEdgeId, connectionLabel); }}>Guardar etiqueta</Button>
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

            <Button size="small" startIcon={<SaveIcon />} variant="contained" color="primary" onClick={() => { flowRef.current?.doSave(); }}>Guardar</Button>
            <Button size="small" startIcon={<RestoreIcon />} onClick={() => { flowRef.current?.doRestoreInitial(); }}>Restaurar</Button>
            <Button size="small" startIcon={<UndoIcon />} onClick={() => { flowRef.current?.doUndo(); }}>Deshacer</Button>
          </Box>
        ) : null}

        <Box sx={{ width: '100%', height: '72vh', overflow: 'hidden', position: 'relative' }}>
          {/* Ensure we always pass at least the STATIC_NODES as fallback so the map shows even if API data is missing */}
          {(() => {
            try { console.debug('[DISTRICT DEBUG] Passing nodesTo DistrictFlow count:', flowNodes.length, flowNodes.map(n => n.id)); } catch (e) {}
            return <DistrictFlow ref={flowRef} initialNodes={flowNodes} initialEdges={resolvedConnections} onNodeSelect={(id) => { setSelectedId(id); setSelectedEdgeId(null); }} onEdgeSelect={(id) => { setSelectedEdgeId(id); }} editMode={editMode} mode={editTool} deleteMode={deleteMode} containerRef={containerRef} focusNodeId={selectedId} filterState={filterState} />;
          })()}
          {tooltip ? (
            <Box sx={{ position: 'absolute', pointerEvents: 'none', left: tooltip.x - (containerRef.current?.getBoundingClientRect().left || 0) + 8, top: tooltip.y - (containerRef.current?.getBoundingClientRect().top || 0) + 8, background: 'white', p: 1, borderRadius: 1, boxShadow: 2, fontSize: 12 }}>
              {String(tooltip.content).split('\n').map((l, i) => <div key={i}>{l}</div>)}
            </Box>
          ) : null}
        </Box>
      </Paper>

      <Snackbar
        open={snack.open}
        message={snack.msg}
        autoHideDuration={1400}
        onClose={() => setSnack({ open: false, msg: '' })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />

      <ElementDetails open={!editMode && !!selectedNode} onClose={() => { setSelectedId(null); setShowConnections(false); }} node={selectedNode || null} nodes={nodes} connections={resolvedConnections} onShowConnections={() => {
        if (!selectedNode) return;
        setShowConnections(s => !s);
        centerOn(selectedNode);
      }} onDelete={() => {
        if (flowRef.current && typeof flowRef.current.deleteSelectedNode === 'function') {
          flowRef.current.deleteSelectedNode();
          setSelectedId(null);
          setShowConnections(false);
        }
      }} />
    </Box>
  );
}
