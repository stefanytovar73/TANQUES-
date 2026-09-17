import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { downsampleTankHistory, getTankHistory } from '../../utils/tankHistoryStore';

const PERIODS = [
  { key: '24h', label: '24 h', rangeMs: 24 * 60 * 60 * 1000 },
  { key: '7d', label: '7 días', rangeMs: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: '30 días', rangeMs: 30 * 24 * 60 * 60 * 1000 },
];

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveLevel = (tank = {}) => toFiniteNumber(
  tank.valor_m ?? tank.nivel ?? tank.valor ?? tank.level_m ?? tank.level
);

const resolveHeight = (tank = {}) => toFiniteNumber(
  tank.altura_rebose
  ?? tank.altura_rebose_m
  ?? tank.altura_rebose_calibrada
  ?? tank.nivel_maximo
);

const resolvePercentage = (tank = {}) => {
  const direct = toFiniteNumber(
    tank.porcentaje_capacidad
    ?? tank.porcentaje_api
    ?? tank.porcentaje
  );
  if (direct !== null) return direct;

  const level = resolveLevel(tank);
  const height = resolveHeight(tank);
  if (level !== null && height !== null && height > 0) return (level / height) * 100;
  return null;
};

const getTankName = (tank = {}) => (
  tank.customName
  || tank.display_name
  || tank.nombre
  || tank.name
  || tank.label
  || tank.tag
  || 'Tanque'
);

const getStatus = (percentage) => {
  if (percentage === null || percentage === undefined || Number.isNaN(Number(percentage))) {
    return { label: 'Sin datos', color: '#cbd5e1', background: 'rgba(255,255,255,0.12)' };
  }
  if (Number(percentage) < 20) {
    return { label: 'Bajo', color: '#ef4444', background: 'rgba(239,68,68,0.16)' };
  }
  if (Number(percentage) >= 95) {
    return { label: 'OK', color: '#22c55e', background: 'rgba(34,197,94,0.16)' };
  }
  return { label: 'Normal', color: '#60a5fa', background: 'rgba(96,165,250,0.16)' };
};

const formatTick = (timestamp, periodKey) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  if (periodKey === '24h') {
    return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' });
};

function HistoryTooltip({ active, payload }) {
  if (!active || !Array.isArray(payload) || !payload.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const status = getStatus(row.porcentaje);
  const date = new Date(row.timestamp);

  return (
    <div style={{
      background: '#ffffff',
      color: '#0f172a',
      border: '1px solid #dbe5f2',
      borderRadius: 8,
      padding: '7px 9px',
      boxShadow: '0 8px 24px rgba(15,23,42,0.16)',
      fontSize: 10,
      lineHeight: 1.45,
    }}>
      <div style={{ fontWeight: 800, marginBottom: 2 }}>
        {Number.isNaN(date.getTime()) ? '' : date.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}
      </div>
      <div>Nivel: <b>{row.nivel != null ? `${Number(row.nivel).toFixed(2)} m` : 'N/D'}</b></div>
      <div>Capacidad: <b>{row.porcentaje != null ? `${Number(row.porcentaje).toFixed(0)}%` : 'N/D'}</b></div>
      <div style={{ color: status.color, fontWeight: 800 }}>{status.label}</div>
    </div>
  );
}

function StatusDot({ cx, cy, payload }) {
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const status = getStatus(payload?.porcentaje);
  return <circle cx={cx} cy={cy} r={2.8} fill={status.color} stroke="#ffffff" strokeWidth={1} />;
}

export default function TankHistoryPanel({ tank, onClose }) {
  const [periodKey, setPeriodKey] = useState('24h');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => setRevision((value) => value + 1), 30000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const period = PERIODS.find((item) => item.key === periodKey) || PERIODS[0];
  const currentLevel = resolveLevel(tank);
  const currentPercentage = resolvePercentage(tank);
  const currentStatus = getStatus(currentPercentage);
  const tankName = getTankName(tank);

  const rawHistory = useMemo(
    () => getTankHistory(tank, period.rangeMs),
    [tank, period.rangeMs, revision]
  );

  const chartData = useMemo(() => {
    const sampled = downsampleTankHistory(rawHistory, periodKey === '30d' ? 130 : 170);
    return sampled.map((row) => ({ ...row, chartValue: row.nivel }));
  }, [rawHistory, periodKey]);

  const height = useMemo(() => {
    const fromTank = resolveHeight(tank);
    if (fromTank !== null && fromTank > 0) return fromTank;
    const values = rawHistory.map((row) => toFiniteNumber(row.altura)).filter((value) => value !== null && value > 0);
    return values.length ? values[values.length - 1] : null;
  }, [tank, rawHistory]);

  const maxLevel = useMemo(() => {
    const values = chartData.map((row) => toFiniteNumber(row.nivel)).filter((value) => value !== null);
    const maxObserved = values.length ? Math.max(...values) : 1;
    if (height !== null && height > 0) return Math.max(height * 1.06, maxObserved * 1.08, 1);
    return Math.max(maxObserved * 1.15, 1);
  }, [chartData, height]);

  const lowLimit = height !== null && height > 0 ? height * 0.20 : null;
  const okLimit = height !== null && height > 0 ? height * 0.95 : null;

  return (
    <aside
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 'min(260px, 100vw)',
        height: '100dvh',
        zIndex: 2500,
        background: '#073B70',
        color: '#ffffff',
        boxShadow: '-10px 0 30px rgba(15,23,42,0.24)',
        padding: '16px 14px',
        boxSizing: 'border-box',
        overflowY: 'auto',
        fontFamily: 'Roboto, Arial, sans-serif',
      }}
      aria-label={`Historial de nivel de ${tankName}`}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 14 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.1, opacity: 0.78, textTransform: 'uppercase' }}>
            Historial de nivel
          </div>
          <div style={{ fontSize: 17, fontWeight: 900, marginTop: 3, lineHeight: 1.15, wordBreak: 'break-word' }}>
            {tankName}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar historial"
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.24)',
            background: 'rgba(255,255,255,0.08)',
            color: '#ffffff',
            fontSize: 18,
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 8,
        alignItems: 'center',
        padding: '10px 11px',
        borderRadius: 11,
        background: 'rgba(255,255,255,0.10)',
        border: '1px solid rgba(255,255,255,0.12)',
        marginBottom: 12,
      }}>
        <div>
          <div style={{ fontSize: 10, opacity: 0.74, fontWeight: 700 }}>Nivel actual</div>
          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>
            {currentLevel !== null ? `${currentLevel.toFixed(2)} m` : 'Sin datos'}
          </div>
        </div>
        <div style={{
          borderRadius: 999,
          padding: '5px 8px',
          fontSize: 10,
          fontWeight: 900,
          color: currentStatus.color,
          background: currentStatus.background,
          border: `1px solid ${currentStatus.color}55`,
          whiteSpace: 'nowrap',
        }}>
          {currentStatus.label}{currentPercentage !== null ? ` · ${Math.round(currentPercentage)}%` : ''}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginBottom: 10 }}>
        {PERIODS.map((item) => {
          const active = item.key === periodKey;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setPeriodKey(item.key)}
              style={{
                border: active ? '1px solid #ffffff' : '1px solid rgba(255,255,255,0.20)',
                background: active ? '#ffffff' : 'rgba(255,255,255,0.07)',
                color: active ? '#073B70' : '#ffffff',
                borderRadius: 8,
                padding: '6px 3px',
                fontSize: 10,
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div style={{
        height: 216,
        borderRadius: 12,
        background: '#ffffff',
        padding: '9px 5px 5px 0',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}>
        {chartData.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 2 }}>
              <CartesianGrid stroke="#e6edf5" strokeDasharray="3 3" vertical={false} />
              {lowLimit !== null ? <ReferenceArea y1={0} y2={lowLimit} fill="#ef4444" fillOpacity={0.13} /> : null}
              {lowLimit !== null && okLimit !== null ? <ReferenceArea y1={lowLimit} y2={okLimit} fill="#3b82f6" fillOpacity={0.09} /> : null}
              {okLimit !== null ? <ReferenceArea y1={okLimit} y2={maxLevel} fill="#22c55e" fillOpacity={0.10} /> : null}
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(value) => formatTick(value, periodKey)}
                tick={{ fontSize: 8, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                minTickGap={18}
              />
              <YAxis
                dataKey="chartValue"
                domain={[0, maxLevel]}
                width={35}
                tick={{ fontSize: 8, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => Number(value).toFixed(1)}
              />
              <Tooltip content={<HistoryTooltip />} />
              <Area
                type="monotone"
                dataKey="chartValue"
                stroke="#1d4ed8"
                strokeWidth={2}
                fill="#93c5fd"
                fillOpacity={0.22}
                dot={<StatusDot />}
                activeDot={{ r: 4, strokeWidth: 1.5, stroke: '#ffffff' }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', textAlign: 'center', color: '#64748b', fontSize: 11, padding: 16 }}>
            Todavía no hay lecturas reales guardadas para este período.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10, fontSize: 9, fontWeight: 800 }}>
        <span style={{ color: '#fca5a5' }}>● Bajo &lt; 20%</span>
        <span style={{ color: '#93c5fd' }}>● Normal 20–94%</span>
        <span style={{ color: '#86efac' }}>● OK ≥ 95%</span>
      </div>

      {rawHistory.length < 2 ? (
        <div style={{ marginTop: 12, fontSize: 9.5, lineHeight: 1.45, color: 'rgba(255,255,255,0.72)' }}>
          El historial se llena con lecturas reales recibidas por la API; no se generan puntos ficticios para completar fechas anteriores.
        </div>
      ) : null}
    </aside>
  );
}
