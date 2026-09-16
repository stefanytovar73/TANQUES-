import React, { useEffect, useMemo, useState } from 'react';
import { Drawer, Box, Typography, IconButton, TextField, Button, Stack, Chip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const PERIODS = [
  { key: '24h', label: '24 horas', ms: 24 * 60 * 60 * 1000 },
  { key: '7d', label: 'Semanal', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: 'Mensual', ms: 30 * 24 * 60 * 60 * 1000 },
];

const normalizeStatus = (value, level) => {
  const raw = String(value || '').trim().toUpperCase();
  if (raw.includes('DUDOSA')) return 'DUDOSA';
  if (raw.includes('CRIT')) return 'CRITICO';
  if (raw.includes('SIN') && raw.includes('DATO')) return 'SIN DATOS';
  if (raw.includes('OK') || raw.includes('NORMAL')) return 'OK';
  return level == null ? 'SIN DATOS' : 'OK';
};

const formatHour = (timestamp) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

export default function TankDetailsDrawer({ open, onClose, node, tank, history = [], onRename }) {
  const nodeData = node?.data?.nodeData || node?.data || {};
  const displayName = nodeData.customName || node?.customName || nodeData.display_name || nodeData.nombre || node?.label || tank?.display_name || tank?.nombre || 'Tanque';
  const [draftName, setDraftName] = useState(displayName);
  const [period, setPeriod] = useState('24h');

  useEffect(() => {
    setDraftName(displayName || '');
  }, [displayName, node?.id]);

  const selectedPeriod = PERIODS.find((item) => item.key === period) || PERIODS[0];
  const chartData = useMemo(() => {
    const cutoff = Date.now() - selectedPeriod.ms;
    return (history || [])
      .filter((row) => Number(row?.ts) >= cutoff)
      .sort((a, b) => Number(a.ts) - Number(b.ts))
      .map((row) => ({
        ...row,
        level: row.level == null ? null : Number(row.level),
        hour: formatHour(row.ts),
        status: normalizeStatus(row.status, row.level),
      }));
  }, [history, selectedPeriod.ms]);

  const currentLevel = tank?.valor_m ?? nodeData.valor_m ?? nodeData.nivel ?? null;
  const currentStatus = normalizeStatus(tank?.calidad || tank?.estado || nodeData.calidad || nodeData.estado, currentLevel);

  const statusCounts = useMemo(() => {
    const base = { OK: 0, DUDOSA: 0, CRITICO: 0, 'SIN DATOS': 0 };
    for (const row of chartData) base[row.status] = (base[row.status] || 0) + 1;
    return base;
  }, [chartData]);

  const commitName = () => {
    const clean = String(draftName || '').replace(/\s+/g, ' ').trim();
    if (!clean || typeof onRename !== 'function') return;
    onRename(clean);
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: 260,
          maxWidth: '92vw',
          boxSizing: 'border-box',
          borderLeft: '1px solid #dbe4ef',
        },
      }}
    >
      <Box sx={{ bgcolor: '#073B70', color: '#fff', px: 2, py: 1.4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography sx={{ fontWeight: 900, fontSize: 15 }}>Detalle del tanque</Typography>
          <Typography sx={{ fontSize: 11, opacity: 0.82 }}>Historial de nivel</Typography>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ color: '#fff' }} aria-label="Cerrar">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ p: 2, overflowY: 'auto' }}>
        <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#64748b', mb: 0.7 }}>NOMBRE</Typography>
        <TextField
          fullWidth
          size="small"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitName();
            }
          }}
        />
        <Button fullWidth size="small" variant="contained" onClick={commitName} sx={{ mt: 1, bgcolor: '#073B70' }}>
          Guardar nombre
        </Button>

        <Box sx={{ mt: 2, p: 1.2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <Typography sx={{ fontSize: 11, color: '#64748b' }}>Nivel actual</Typography>
          <Typography sx={{ fontWeight: 900, color: '#0b2447', fontSize: 18 }}>
            {currentLevel != null && Number.isFinite(Number(currentLevel)) ? `${Number(currentLevel).toFixed(2)} m` : 'Sin datos'}
          </Typography>
          <Chip
            size="small"
            label={currentStatus}
            sx={{ mt: 0.5, fontWeight: 800, fontSize: 10 }}
          />
        </Box>

        <Typography sx={{ mt: 2, fontWeight: 900, color: '#0b2447', fontSize: 13 }}>Historial de nivel</Typography>
        <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
          {PERIODS.map((item) => (
            <Button
              key={item.key}
              size="small"
              variant={period === item.key ? 'contained' : 'outlined'}
              onClick={() => setPeriod(item.key)}
              sx={{ minWidth: 0, px: 1, fontSize: 10 }}
            >
              {item.label}
            </Button>
          ))}
        </Stack>

        <Box sx={{ height: 190, mt: 1.2 }}>
          {chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" tick={{ fontSize: 9 }} minTickGap={26} />
                <YAxis tick={{ fontSize: 9 }} domain={['auto', 'auto']} />
                <Tooltip
                  formatter={(value, name, payload) => [value == null ? 'Sin datos' : `${Number(value).toFixed(2)} m`, payload?.payload?.status || name]}
                  labelFormatter={(label) => label}
                />
                <Area type="monotone" dataKey="level" stroke="#2563eb" fill="#bfdbfe" connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', textAlign: 'center', color: '#64748b', fontSize: 11, px: 1 }}>
              Aún no hay lecturas históricas guardadas para este periodo.
            </Box>
          )}
        </Box>

        <Typography sx={{ mt: 1.5, fontSize: 11, fontWeight: 800, color: '#64748b' }}>ESTADO DE LAS LECTURAS</Typography>
        <Stack spacing={0.7} sx={{ mt: 0.8 }}>
          {['OK', 'DUDOSA', 'CRITICO', 'SIN DATOS'].map((status) => (
            <Box key={status} sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, borderBottom: '1px solid #eef2f7', pb: 0.5 }}>
              <span>{status}</span>
              <strong>{statusCounts[status] || 0}</strong>
            </Box>
          ))}
        </Stack>

        <Typography sx={{ mt: 1.5, fontSize: 10, color: '#94a3b8', lineHeight: 1.35 }}>
          La gráfica usa lecturas reales recibidas por este navegador y las conserva por hasta 30 días.
        </Typography>
      </Box>
    </Drawer>
  );
}
