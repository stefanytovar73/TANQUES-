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

const HISTORY_KEY = 'district_tank_level_history_v1';

const PERIODS = [
  { key: '24h', label: '24 h', rangeMs: 24 * 60 * 60 * 1000 },
  { key: '7d', label: 'Semanal', rangeMs: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: 'Mensual', rangeMs: 30 * 24 * 60 * 60 * 1000 },
];

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const getTankName = (tank = {}) => (
  tank.customName
  || tank.display_name
  || tank.nombre
  || tank.label
  || tank.name
  || tank.tag
  || 'Tanque'
);

const getLevel = (tank = {}) => toNumber(
  tank.valor_m ?? tank.nivel ?? tank.valor ?? tank.level_m ?? tank.level
);

const getHeight = (tank = {}) => toNumber(
  tank.altura_rebose_calibrada
  ?? tank.altura_rebose_m
  ?? tank.altura_rebose
  ?? tank.nivel_maximo
);

const getPercentage = (tank = {}, height = null) => {
  const direct = toNumber(
    tank.manual_porcentaje
    ?? tank.porcentaje_capacidad
    ?? tank.porcentaje_capacidad_api
    ?? tank.porcentaje_api
    ?? tank.porcentaje
    ?? tank.pct
  );
  if (direct !== null) return direct;

  const level = getLevel(tank);
  if (level !== null && height !== null && height > 0) return (level / height) * 100;
  return null;
};

const getStatus = (percentage, quality = '') => {
  const rawQuality = String(quality || '').toUpperCase();
  if (percentage === null || percentage === undefined || !Number.isFinite(Number(percentage))) {
    return { label: 'Sin datos', color: '#cbd5e1', background: 'rgba(255,255,255,0.10)' };
  }
  if (Number(percentage) < 20) {
    return { label: 'Bajo', color: '#f87171', background: 'rgba(239,68,68,0.16)' };
  }
  if (Number(percentage) >= 95) {
    return { label: 'OK', color: '#4ade80', background: 'rgba(34,197,94,0.16)' };
  }
  if (rawQuality.includes('DUDOSA')) {
    return { label: 'Dudosa', color: '#93c5fd', background: 'rgba(59,130,246,0.16)' };
  }
  return { label: 'Normal', color: '#93c5fd', background: 'rgba(59,130,246,0.16)' };
};

const readHistoryStore = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const getCandidateKeys = (tank = {}) => [
  tank.tag,
  tank.apiTag,
  tank.originalName,
  tank.apiName,
  tank.id,
  tank.display_name,
  tank.nombre,
  tank.label,
  tank.name,
].filter((value) => value != null && String(value).trim()).map((value) => String(value).trim());

const readTankHistory = (tank, rangeMs) => {
  const store = readHistoryStore();
  const candidates = getCandidateKeys(tank);
  let rows = [];

  for (const candidate of candidates) {
    if (Array.isArray(store[candidate])) {
      rows = store[candidate];
      break;
    }
  }

  if (!rows.length) {
    const normalizedCandidates = candidates.map(normalize).filter(Boolean);
    const matchedKey = Object.keys(store).find((key) => {
      const nk = normalize(key);
      return normalizedCandidates.some((candidate) =>
        candidate === nk || candidate.includes(nk) || nk.includes(candidate)
      );
    });
    if (matchedKey && Array.isArray(store[matchedKey])) rows = store[matchedKey];
  }

  const cutoff = Date.now() - rangeMs;
  return rows
    .filter((row) => Number(row?.ts) >= cutoff)
    .map((row) => ({
      ...row,
      ts: Number(row.ts),
      level: toNumber(row.level),
      porcentaje: toNumber(row.porcentaje),
    }))
    .filter((row) => Number.isFinite(row.ts))
    .sort((a, b) => a.ts - b.ts);
};

const downsample = (rows, maxPoints) => {
  if (!Array.isArray(rows) || rows.length <= maxPoints) return rows || [];
  const step = (rows.length - 1) / Math.max(1, maxPoints - 1);
  const sampled = [];
  for (let index = 0; index < maxPoints; index += 1) {
    sampled.push(rows[Math.min(rows.length - 1, Math.round(index * step))]);
  }
  return sampled;
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
  const date = new Date(row.ts);
  const status = getStatus(row.porcentaje, row.status);

  return (
    <div style={{
      background: '#fff',
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
      <div>Nivel: <b>{row.level !== null ? `${row.level.toFixed(2)} m` : 'N/D'}</b></div>
      <div>Capacidad: <b>{row.porcentaje !== null ? `${Math.round(row.porcentaje)}%` : 'N/D'}</b></div>
      <div style={{ color: status.color, fontWeight: 800 }}>{status.label}</div>
    </div>
  );
}

function StatusDot({ cx, cy, payload }) {
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const status = getStatus(payload?.porcentaje, payload?.status);
  return <circle cx={cx} cy={cy} r={2.8} fill={status.color} stroke="#fff" strokeWidth={1} />;
}

export default function TankHistoryPanel({ tank = {}, onClose }) {
  const [periodKey, setPeriodKey] = useState('24h');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setRevision((value) => value + 1), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const period = PERIODS.find((item) => item.key === periodKey) || PERIODS[0];
  const history = useMemo(() => readTankHistory(tank, period.rangeMs), [tank, period.rangeMs, revision]);
  const chartData = useMemo(() => downsample(history, periodKey === '30d' ? 140 : 180), [history, periodKey]);

  const explicitHeight = getHeight(tank);
  const inferredHeight = useMemo(() => {
    if (explicitHeight !== null && explicitHeight > 0) return explicitHeight;

    const currentLevel = getLevel(tank);
    const currentPct = getPercentage(tank, null);
    if (currentLevel !== null && currentPct !== null && currentPct > 0) {
      const inferred = currentLevel / (currentPct / 100);
      if (Number.isFinite(inferred) && inferred > 0) return inferred;
    }

    for (let index = history.length - 1; index >= 0; index -= 1) {
      const row = history[index];
      if (row.level !== null && row.porcentaje !== null && row.porcentaje > 0) {
        const inferred = row.level / (row.porcentaje / 100);
        if (Number.isFinite(inferred) && inferred > 0) return inferred;
      }
    }
    return null;
  }, [explicitHeight, history, tank]);

  const currentLevel = getLevel(tank);
  const currentPercentage = getPercentage(tank, inferredHeight);
  const currentStatus = getStatus(currentPercentage, tank.calidad || tank.estado);
  const tankName = getTankName(tank);

  const maxObserved = chartData.reduce((max, row) => row.level !== null ? Math.max(max, row.level) : max, 0);
  const maxLevel = inferredHeight !== null && inferredHeight > 0
    ? Math.max(inferredHeight * 1.05, maxObserved * 1.08, 1)
    : Math.max(maxObserved * 1.15, currentLevel || 0, 1);
  const lowLimit = inferredHeight !== null && inferredHeight > 0 ? inferredHeight * 0.20 : null;
  const okLimit = inferredHeight !== null && inferredHeight > 0 ? inferredHeight * 0.95 : null;

  return (
    <aside
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      style={{
        position: 'fixed',
        inset: '0 0 0 auto',
        width: 'min(260px, 100vw)',
        height: '100dvh',
        zIndex: 2600,
        background: '#073B70',
        color: '#fff',
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
            color: '#fff',
            fontSize: 18,
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >×</button>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5, marginBottom: 10 }}>
        {PERIODS.map((item) => {
          const active = item.key === periodKey;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setPeriodKey(item.key)}
              style={{
                border: active ? '1px solid #fff' : '1px solid rgba(255,255,255,0.20)',
                background: active ? '#fff' : 'rgba(255,255,255,0.07)',
                color: active ? '#073B70' : '#fff',
                borderRadius: 8,
                padding: '6px 3px',
                fontSize: 10,
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >{item.label}</button>
          );
        })}
      </div>

      <div style={{ height: 216, borderRadius: 12, background: '#fff', padding: '9px 5px 5px 0', boxSizing: 'border-box', overflow: 'hidden' }}>
        {chartData.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 2 }}>
              <CartesianGrid stroke="#e6edf5" strokeDasharray="3 3" vertical={false} />
              {lowLimit !== null ? <ReferenceArea y1={0} y2={lowLimit} fill="#ef4444" fillOpacity={0.13} /> : null}
              {lowLimit !== null && okLimit !== null ? <ReferenceArea y1={lowLimit} y2={okLimit} fill="#3b82f6" fillOpacity={0.09} /> : null}
              {okLimit !== null ? <ReferenceArea y1={okLimit} y2={maxLevel} fill="#22c55e" fillOpacity={0.10} /> : null}
              <XAxis
                dataKey="ts"
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
                dataKey="level"
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
                dataKey="level"
                stroke="#1d4ed8"
                strokeWidth={2}
                fill="#93c5fd"
                fillOpacity={0.22}
                dot={<StatusDot />}
                activeDot={{ r: 4, strokeWidth: 1.5, stroke: '#fff' }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', textAlign: 'center', color: '#64748b', fontSize: 11, padding: 16 }}>
            Aún no hay lecturas reales guardadas para este periodo.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10, fontSize: 9, fontWeight: 800 }}>
        <span style={{ color: '#fca5a5' }}>● Bajo &lt; 20%</span>
        <span style={{ color: '#93c5fd' }}>● Normal / dudosa</span>
        <span style={{ color: '#86efac' }}>● OK ≥ 95%</span>
      </div>

      {history.length < 2 ? (
        <div style={{ marginTop: 12, fontSize: 9.5, lineHeight: 1.45, color: 'rgba(255,255,255,0.72)' }}>
          El historial se llena únicamente con lecturas reales recibidas desde IBAL; no se crean datos ficticios para completar días anteriores.
        </div>
      ) : null}
    </aside>
  );
}
