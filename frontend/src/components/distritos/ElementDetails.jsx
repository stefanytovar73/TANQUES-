import React, { useEffect, useState } from 'react';
import { Drawer, Box, Typography, Divider, Button, TextField } from '@mui/material';
import { useNavigate } from 'react-router-dom';
export default function ElementDetails({ open, onClose, node, onShowConnections, nodes = [], connections = [], onDelete, onRenameNode }) {
  const navigate = useNavigate();
  const [draftName, setDraftName] = useState('');

  const data = node?.data || {};
  const nestedData = data.nodeData || {};
  const metricSource = { ...data, ...nestedData };
  const safeNode = node || {};
  const derivedLabel = safeNode.label || data.label || nestedData.label || data.nodeData?.label || data.nodeData?.display_name || nestedData.display_name || data.display_name || nestedData.nombre || data.nombre || safeNode.customName || data.customName || nestedData.customName || node?.id || 'Sin nombre';
  const effectiveName = nestedData.customName || data.customName || safeNode.customName || nestedData.display_name || data.display_name || nestedData.nombre || data.nombre || derivedLabel || 'Sin nombre';
  const nivelValue = metricSource.valor_m ?? metricSource.nivel ?? metricSource.level ?? metricSource.level_m ?? null;
  const porcentajeValue = metricSource.porcentaje ?? metricSource.porcentaje_capacidad ?? metricSource.porcentaje_api ?? metricSource.pct ?? null;
  const capacidadActual = metricSource.capacidad_actual_m3 ?? metricSource.capacidad_actual ?? metricSource.capacidad_m3 ?? null;
  const capacidadMaxima = metricSource.capacidad_maxima_m3 ?? metricSource.capacidad_maxima ?? null;

  useEffect(() => {
    if (!node?.id) {
      setDraftName('');
      return;
    }

    setDraftName((prev) => {
      if (prev && prev.trim() && prev !== effectiveName && prev !== '') {
        return prev;
      }
      return effectiveName || '';
    });
    try { console.info('[SELECTION TRACE] ELEMENT_DETAILS_NODE_ID=' + (node && node.id)); } catch (e) {}
    try { console.info('[SELECTION TRACE] NAME_FIELD_RENDERED=' + true); } catch (e) {}
    try { if (typeof window !== 'undefined') { window.__SELECTION_TRACE = window.__SELECTION_TRACE || []; window.__SELECTION_TRACE.push('ELEMENT_DETAILS_NODE_ID:' + (node && node.id)); window.__SELECTION_TRACE.push('NAME_FIELD_RENDERED:true'); } } catch (e) {}
  }, [node?.id, effectiveName]);

  if (!node) return null;

  const handleRename = () => {
    const nextValue = (draftName || '').replace(/\s+/g, ' ').trim();
    if (typeof onRenameNode !== 'function') return;
    const finalValue = nextValue || effectiveName || 'Sin nombre';
    onRenameNode(finalValue);
    setDraftName(finalValue);
  };

  const onHistoricos = () => {
    navigate('/historicos', { state: { selectedTankName: effectiveName } });
  };

  const onMonitoreo = () => {
    navigate('/monitoreo');
  };

  // compute entradas / salidas from provided connections when available
  const entradas = [];
  const salidas = [];
  if (Array.isArray(connections)) {
    for (const c of connections) {
      if (c.to === node.id) entradas.push(c.from);
      if (c.from === node.id) salidas.push(c.to);
    }
  }

  const labelFor = (id) => {
    const n = (nodes || []).find(x => x.id === id);
    return n ? (n.label || n.id) : id;
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 360, p: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>{effectiveName}</Typography>
        <Box sx={{ my: 2 }}>
          <Typography variant="subtitle2" sx={{ color: '#475569' }}>Nombre</Typography>
          <TextField
            fullWidth
            size="small"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleRename();
              }
            }}
            placeholder="Nombre del elemento"
            sx={{ mt: 1 }}
          />
          <Button variant="contained" size="small" sx={{ mt: 1 }} onClick={handleRename}>Guardar nombre</Button>
        </Box>
        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" sx={{ color: '#475569' }}>Nivel</Typography>
        <Typography sx={{ mb: 1 }}>{nivelValue != null ? `${Number(nivelValue).toFixed(2)} m` : 'Sin datos'}</Typography>

        <Typography variant="subtitle2" sx={{ color: '#475569' }}>Última lectura</Typography>
        <Typography sx={{ mb: 1 }}>{metricSource.fecha_hora || metricSource.fecha || metricSource.timestamp || metricSource.ultimo_update || metricSource.last_update || 'Sin datos'}</Typography>

        <Typography variant="subtitle2" sx={{ color: '#475569' }}>Porcentaje</Typography>
        <Typography sx={{ mb: 1 }}>{porcentajeValue != null ? `${Math.round(Number(porcentajeValue))} %` : 'Sin datos'}</Typography>

        <Typography variant="subtitle2" sx={{ color: '#475569' }}>Estado</Typography>
        <Typography sx={{ mb: 2 }}>{metricSource.estado || metricSource.status || 'Sin datos'}</Typography>

        <Typography variant="subtitle2" sx={{ color: '#475569' }}>Capacidad actual</Typography>
        <Typography sx={{ mb: 1 }}>{capacidadActual != null ? `${Number(capacidadActual).toFixed(2)} m³` : 'Sin datos'}</Typography>

        <Typography variant="subtitle2" sx={{ color: '#475569' }}>Capacidad máxima</Typography>
        <Typography sx={{ mb: 2 }}>{capacidadMaxima != null ? `${Number(capacidadMaxima).toFixed(2)} m³` : 'Sin datos'}</Typography>

        <Typography variant="subtitle2" sx={{ color: '#475569' }}>Entradas</Typography>
        {entradas.length ? (
          entradas.map((id) => <Typography key={`in-${id}`} sx={{ fontSize: 13 }}>• {labelFor(id)}</Typography>)
        ) : (
          <Typography sx={{ fontSize: 13 }}>Sin datos</Typography>
        )}

        <Typography variant="subtitle2" sx={{ color: '#475569', mt: 1 }}>Salidas</Typography>
        {salidas.length ? (
          salidas.map((id) => <Typography key={`out-${id}`} sx={{ fontSize: 13 }}>• {labelFor(id)}</Typography>)
        ) : (
          <Typography sx={{ fontSize: 13 }}>Sin datos</Typography>
        )}

        <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}> 
          <Button variant="outlined" size="small" onClick={onHistoricos}>Históricos</Button>
          <Button variant="contained" size="small" onClick={onMonitoreo}>Monitoreo</Button>
          <Button variant="text" size="small" onClick={() => { if (typeof onShowConnections === 'function') onShowConnections(); }}>Ver conexiones</Button>
          <Button variant="contained" color="error" size="small" onClick={() => {
            if (typeof onDelete === 'function') {
              const ok = window.confirm('¿Eliminar este elemento?');
              if (ok) onDelete();
            }
          }}>Eliminar</Button>
        </Box>
      </Box>
    </Drawer>
  );
}
