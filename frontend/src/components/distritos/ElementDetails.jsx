import React from 'react';
import { Drawer, Box, Typography, Divider, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
export default function ElementDetails({ open, onClose, node, onShowConnections, nodes = [], connections = [], onDelete }) {
  const navigate = useNavigate();
  if (!node) return null;

  const data = node.data || {};
  const effectiveName = data.customName || node.customName || data.display_name || data.nombre || node.label || 'Sin nombre';

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
        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" sx={{ color: '#475569' }}>Nivel</Typography>
        <Typography sx={{ mb: 1 }}>{data.valor_m != null ? `${Number(data.valor_m).toFixed(2)} m` : 'Sin datos'}</Typography>

        <Typography variant="subtitle2" sx={{ color: '#475569' }}>Última lectura</Typography>
        <Typography sx={{ mb: 1 }}>{data.fecha_hora || data.fecha || data.timestamp || data.ultimo_update || data.last_update || 'Sin datos'}</Typography>

        <Typography variant="subtitle2" sx={{ color: '#475569' }}>Porcentaje</Typography>
        <Typography sx={{ mb: 1 }}>{data.porcentaje != null ? `${Math.round(data.porcentaje)} %` : 'Sin datos'}</Typography>

        <Typography variant="subtitle2" sx={{ color: '#475569' }}>Estado</Typography>
        <Typography sx={{ mb: 2 }}>{data.estado || data.status || 'Sin datos'}</Typography>

        <Typography variant="subtitle2" sx={{ color: '#475569' }}>Capacidad actual</Typography>
        <Typography sx={{ mb: 1 }}>{data.capacidad_actual_m3 != null ? `${data.capacidad_actual_m3} m³` : (data.capacidad_actual != null ? `${data.capacidad_actual} m³` : 'Sin datos')}</Typography>

        <Typography variant="subtitle2" sx={{ color: '#475569' }}>Capacidad máxima</Typography>
        <Typography sx={{ mb: 2 }}>{data.capacidad_maxima_m3 != null ? `${data.capacidad_maxima_m3} m³` : (data.capacidad_maxima != null ? `${data.capacidad_maxima} m³` : 'Sin datos')}</Typography>

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
