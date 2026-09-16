import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Drawer,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getHistoryStatus, readTankHistory } from './tankHistory';

const STATUS_COLORS = {
  OK: '#16a34a',
  DUDOSA: '#f59e0b',
  CRITICO: '#ef4444',
  'SIN DATOS': '#94a3b8',
};

const parseDateMs = (value) => {
  if (!value) return Date.now();
  const normalized = String(value).includes('T') ? String(value) : String(value).replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? Date.now() : date.getTime();
};

const toFiniteOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const formatAxisTime = (timestamp, range) => {
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return '';
  if (range === '24h') {
    return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' });
};

function HistoryTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload || {};
  const date = new Date(Number(point.t));
  return (
    <Box sx={{
      bgcolor: '#fff',
      border: '1px solid #dbe4ef',
      borderRadius: 1.5,
      px: 1,
      py: 0.8,
      boxShadow: '0 6px 18px rgba(15,23,42,.12)',
      fontSize: 11,
    }}>
      <div style={{ fontWeight: 800, marginBottom: 3 }}>
        {Number.isNaN(date.getTime()) ? 'Sin fecha' : date.toLocaleString('es-CO')}
      </div>
      <div>Nivel: {point.nivel != null ? `${Number(point.nivel).toFixed(2)} m` : 'Sin datos'}</div>
      <div style={{ color: STATUS_COLORS[point.status] || '#64748b', fontWeight: 800 }}>
        {point.status || 'SIN DATOS'}
      </div>
    </Box>
  );
}

function StatusDot(props) {
  const { cx, cy, payload } = props || {};
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || payload?.nivel == null) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3.2}
      fill={STATUS_COLORS[payload?.status] || '#2563eb'}
      stroke="#fff"
      strokeWidth={1}
    />
  );
}

export default function ElementDetails({
  open,
  onClose,
  node,
  tankData = null,
  onRenameNode,
}) {
  const [draftName, setDraftName] = useState('');
  const [range, setRange] = useState('24h');

  const data = node?.data || {};
  const nestedData = data.nodeData || {};
  const safeNode = node || {};

  const effectiveName =
    nestedData.customName ||
    data.customName ||
    safeNode.customName ||
    nestedData.label ||
    data.label ||
    safeNode.label ||
    nestedData.display_name ||
    data.display_name ||
    nestedData.nombre ||
    data.nombre ||
    node?.id ||
    'Sin nombre';

  useEffect(() => {
    if (!node?.id) {
      setDraftName('');
      return;
    }
    setDraftName(effectiveName || '');
    setRange('24h');
  }, [node?.id, effectiveName]);

  const isTank = node?.type === 'tank' || String(nestedData?.tag || '').toUpperCase().startsWith('NIVEL_');
  const metricSource = tankData || nestedData || data || {};

  const history = useMemo(() => {
    if (!isTank) return [];

    const source = {
      ...metricSource,
      tag: metricSource?.tag || nestedData?.tag,
      apiName: nestedData?.apiName,
      originalName: nestedData?.originalName,
      display_name: metricSource?.display_name || metricSource?.nombre || nestedData?.display_name,
      nombre: metricSource?.nombre || nestedData?.nombre,
    };

    const rows = readTankHistory(source, range);
    const currentLevel = toFiniteOrNull(metricSource?.valor_m ?? metricSource?.nivel);
    const currentTimestamp = parseDateMs(metricSource?.fecha_hora || metricSource?.timestamp);
    const current = {
      t: currentTimestamp,
      nivel: currentLevel,
      porcentaje: toFiniteOrNull(metricSource?.porcentaje_capacidad ?? metricSource?.porcentaje ?? metricSource?.porcentaje_api),
      status: getHistoryStatus(metricSource),
    };

    if (!rows.length) return [current];

    const last = rows[rows.length - 1];
    if (Number(last?.t) === currentTimestamp) {
      return [...rows.slice(0, -1), current];
    }
    return [...rows, current];
  }, [isTank, tankData, nestedData?.tag, nestedData?.apiName, nestedData?.originalName, nestedData?.display_name, nestedData?.nombre, metricSource, range]);

  const currentLevel = toFiniteOrNull(metricSource?.valor_m ?? metricSource?.nivel);
  const currentPct = toFiniteOrNull(metricSource?.porcentaje_capacidad ?? metricSource?.porcentaje ?? metricSource?.porcentaje_api);
  const currentStatus = isTank ? getHistoryStatus(metricSource) : null;

  const handleRename = () => {
    const nextValue = String(draftName || '').replace(/\s+/g, ' ').trim();
    if (!nextValue || typeof onRenameNode !== 'function') return;
    onRenameNode(nextValue);
    setDraftName(nextValue);
  };

  if (!node) return null;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: 260,
          boxSizing: 'border-box',
          borderLeft: '1px solid #dbe4ef',
          boxShadow: '-8px 0 24px rgba(15,23,42,.10)',
        },
      }}
    >
      <Box sx={{ width: 260, minHeight: '100%', bgcolor: '#f8fafc' }}>
        <Box sx={{
          height: 56,
          px: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          bgcolor: '#0d3b70',
          color: '#fff',
        }}>
          <Typography sx={{ fontWeight: 900, fontSize: 14 }}>Detalle del elemento</Typography>
          <IconButton size="small" onClick={onClose} sx={{ color: '#fff' }} aria-label="Cerrar">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        <Box sx={{ p: 1.5 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#64748b', mb: 0.7 }}>
            NOMBRE
          </Typography>
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
            sx={{ bgcolor: '#fff' }}
          />
          <Button
            fullWidth
            variant="contained"
            size="small"
            onClick={handleRename}
            sx={{ mt: 1, textTransform: 'none', fontWeight: 800 }}
          >
            Guardar nombre
          </Button>

          {isTank ? (
            <>
              <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <Box sx={{ bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: 1.5, p: 1 }}>
                  <Typography sx={{ fontSize: 10, color: '#64748b', fontWeight: 800 }}>NIVEL</Typography>
                  <Typography sx={{ fontSize: 15, color: '#0f172a', fontWeight: 900 }}>
                    {currentLevel != null ? `${currentLevel.toFixed(2)} m` : '—'}
                  </Typography>
                </Box>
                <Box sx={{ bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: 1.5, p: 1 }}>
                  <Typography sx={{ fontSize: 10, color: '#64748b', fontWeight: 800 }}>CAPACIDAD</Typography>
                  <Typography sx={{ fontSize: 15, color: '#0f172a', fontWeight: 900 }}>
                    {currentPct != null ? `${Math.round(currentPct)}%` : '—'}
                  </Typography>
                </Box>
              </Box>

              <Typography sx={{ mt: 1.7, mb: 0.7, fontSize: 12, fontWeight: 900, color: '#0f172a' }}>
                HISTORIAL DE NIVEL
              </Typography>

              <Stack direction="row" spacing={0.5} sx={{ mb: 1 }}>
                {[
                  ['24h', '24 horas'],
                  ['week', 'Semanal'],
                  ['month', 'Mensual'],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    size="small"
                    variant={range === value ? 'contained' : 'outlined'}
                    onClick={() => setRange(value)}
                    sx={{
                      minWidth: 0,
                      px: 0.75,
                      fontSize: 9.5,
                      textTransform: 'none',
                      fontWeight: 800,
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </Stack>

              <Box sx={{ bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: 1.5, p: 0.5, height: 185 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ top: 10, right: 8, bottom: 2, left: -22 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="t"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={(value) => formatAxisTime(value, range)}
                      tick={{ fontSize: 9 }}
                      minTickGap={18}
                    />
                    <YAxis
                      dataKey="nivel"
                      tick={{ fontSize: 9 }}
                      width={42}
                      tickFormatter={(value) => Number(value).toFixed(1)}
                    />
                    <ChartTooltip content={<HistoryTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="nivel"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={<StatusDot />}
                      activeDot={{ r: 4 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>

              <Stack direction="row" spacing={0.7} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.7 }}>
                {Object.entries(STATUS_COLORS).map(([label, color]) => (
                  <Chip
                    key={label}
                    size="small"
                    label={label}
                    sx={{
                      height: 20,
                      fontSize: 9,
                      fontWeight: 800,
                      bgcolor: '#fff',
                      border: '1px solid #e2e8f0',
                      '&::before': {
                        content: '""',
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        bgcolor: color,
                        ml: 0.8,
                      },
                    }}
                  />
                ))}
              </Stack>

              <Box sx={{ mt: 1.2, fontSize: 10.5, color: '#64748b', lineHeight: 1.45 }}>
                Estado actual:{' '}
                <span style={{ fontWeight: 900, color: STATUS_COLORS[currentStatus] || '#64748b' }}>
                  {currentStatus || 'SIN DATOS'}
                </span>
                <br />
                Hora lectura: {metricSource?.fecha_hora || metricSource?.timestamp || 'Sin datos'}
              </Box>

              {history.length <= 1 ? (
                <Typography sx={{ mt: 1, fontSize: 9.5, color: '#64748b' }}>
                  El historial se irá completando con las lecturas reales recibidas por la aplicación.
                </Typography>
              ) : null}
            </>
          ) : (
            <Typography sx={{ mt: 1.5, fontSize: 11, color: '#64748b' }}>
              El nombre de este elemento puede editarse aquí. El historial de nivel se muestra únicamente para tanques.
            </Typography>
          )}
        </Box>
      </Box>
    </Drawer>
  );
}
