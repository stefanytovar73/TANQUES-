import React, { useState, useRef, useEffect } from 'react';
import { calculateDisplayPorcentaje } from '../../config/tankCatalog';

export default function TankNode({ data, selected }) {
  const cx = 60;
  const bW = 80;
  const bH = 90;
  const bx = cx - bW / 2;
  const by = 36;

  const metricSource = data?.nodeData || data || {};

  const readNumber = (...values) => {
    for (const value of values) {
      if (value === null || value === undefined || value === '') continue;
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric;
    }
    return null;
  };

  const normalizeTankText = (value) => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const shouldIgnoreZeroPercent = () => {
    const candidateText = [
      metricSource.id,
      metricSource.tag,
      metricSource.apiTag,
      metricSource.apiName,
      metricSource.originalName,
      metricSource.display_name,
      metricSource.nombre,
      metricSource.label,
      metricSource.name,
    ]
      .map(normalizeTankText)
      .filter(Boolean)
      .join(' ');

    const matchesTarget = /(calucaima|miramar|zona industrial)/.test(candidateText);
    if (!matchesTarget) return false;

    const nivelReal = readNumber(metricSource.valor_m, metricSource.nivel);
    const reboseAltura = readNumber(metricSource.altura_rebose_calibrada, metricSource.altura_rebose_m, metricSource.altura_rebose);
    return nivelReal != null && nivelReal > 0 && reboseAltura != null && reboseAltura > 0;
  };

  const nivelReal = readNumber(metricSource.valor_m, metricSource.nivel);
  const reboseAltura = readNumber(metricSource.altura_rebose_calibrada, metricSource.altura_rebose_m, metricSource.altura_rebose);
  const rawManualPct = readNumber(metricSource.manual_porcentaje);
  const manualPct = rawManualPct === 0 && shouldIgnoreZeroPercent() ? null : rawManualPct;
  const rawPorcentajeApi = readNumber(
    metricSource.porcentaje_capacidad,
    metricSource.porcentaje_capacidad_api,
    metricSource.porcentaje_api,
    metricSource.porcentaje,
    metricSource.pct,
  );
  const porcentajeApi = rawPorcentajeApi === 0 && shouldIgnoreZeroPercent() ? null : rawPorcentajeApi;
  const porcentaje =
    manualPct != null
      ? manualPct
      : (porcentajeApi != null
        ? porcentajeApi
        : (nivelReal != null && reboseAltura != null
          ? calculateDisplayPorcentaje({ valor_m: nivelReal, nivel: nivelReal, altura_rebose_calibrada: reboseAltura, altura_rebose: reboseAltura, porcentaje_capacidad: null })
          : null));
  const valorM = nivelReal;
  const fillRatio = porcentaje != null ? Math.min(Math.max(porcentaje / 100, 0), 1) : null;

  const [editingPct, setEditingPct] = useState(false);
  const [draftPct, setDraftPct] = useState(porcentaje != null ? String(Math.round(porcentaje)) : '');
  const inputRef = useRef(null);

  // mark TankNode update for profiling (useEffect to run after paint)
  useEffect(() => {
    try { if (typeof window !== 'undefined') { window.__TIMINGS = window.__TIMINGS || {}; window.__TIMINGS.tankNodes = window.__TIMINGS.tankNodes || {}; const nodeId = (data && data.nodeData && data.nodeData.id) || data && data.id || null; if (nodeId) window.__TIMINGS.tankNodes[nodeId] = Date.now(); } } catch (e) {}
  }, [porcentaje]);

  const stroke    = selected ? '#3b82f6' : '#93c5fd';
  const fillLight = '#eff6ff';
  const fillWater = '#93c5fd';

  const waterH = fillRatio != null ? (bH - 8) * fillRatio : 0;
  const waterY = by + bH - 4 - waterH;

  return (
    <g>
      {/* ── badge nivel ENCIMA ── */}
      <rect
        x={cx - 46} y={-2} width={92} height={30}
        rx={6}
        fill="#ffffff"
        stroke="#94a3b8"
        strokeWidth={1.2}
        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.18))' }}
      />
      <text
        x={cx} y={14}
        fontFamily="Roboto, Arial, sans-serif"
        fontSize={16} fontWeight={900}
        fill="#0b2447"
        textAnchor="middle" dominantBaseline="middle"
      >
        {valorM != null ? `${Number(valorM).toFixed(2)} m` : 'Sin datos'}
      </text>

      {/* ── cuerpo del tanque ── */}

      {/* tapa superior */}
      <ellipse cx={cx} cy={by} rx={bW / 2} ry={9} fill={fillLight} stroke={stroke} strokeWidth={1.2} />

      {/* fondo claro */}
      <rect x={bx} y={by} width={bW} height={bH} fill={fillLight} stroke="none" />

      {/* agua desde abajo */}
      {waterH > 0 && (
        <>
          <rect x={bx + 1} y={waterY} width={bW - 2} height={waterH} fill={fillWater} />
          <ellipse cx={cx} cy={waterY} rx={(bW - 2) / 2} ry={6} fill={fillWater} />
        </>
      )}

      {/* contorno encima */}
      <rect x={bx} y={by} width={bW} height={bH} fill="none" stroke={stroke} strokeWidth={selected ? 2.5 : 1.2} />

      {/* tapa inferior */}
      <ellipse cx={cx} cy={by + bH} rx={bW / 2} ry={9} fill={fillWater} stroke={stroke} strokeWidth={1.2} />

      {/* porcentaje en NEGRO */}
      {porcentaje != null ? (
        <text
          x={cx} y={by + bH / 2 + 4}
          fontSize={20} fontWeight={900}
          textAnchor="middle" dominantBaseline="middle"
          fill="#111827"
          style={{ cursor: 'pointer', pointerEvents: 'auto' }}
          onClick={(e) => { e.stopPropagation(); setDraftPct(porcentaje != null ? String(Math.round(porcentaje)) : ''); setEditingPct(true); }}
        >
          {`${Math.round(porcentaje)}%`}
        </text>
      ) : (
        <text
          x={cx} y={by + bH / 2 + 4}
          fontSize={15} fontWeight={800}
          textAnchor="middle" dominantBaseline="middle"
          fill="#1d4ed8"
          style={{ cursor: 'pointer', pointerEvents: 'auto' }}
          onClick={(e) => { e.stopPropagation(); setEditingPct(true); }}
        >
          Sin datos
        </text>
      )}

      {/* small edit pencil placed inside the tank (top-right), more visible but compact */}
      <g transform={`translate(${bx + bW - 6}, ${by + 6})`} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setDraftPct(porcentaje != null ? String(Math.round(porcentaje)) : ''); setEditingPct(true); }}>
        <filter id="drop" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.12" />
        </filter>
        <circle cx={0} cy={0} r={6} fill="#1e40af" stroke="#ffffff" strokeWidth={1.2} style={{ filter: 'url(#drop)' }} />
        <text x={0} y={4} fontSize={9} fontWeight={800} textAnchor="middle" fill="#ffffff">✎</text>
      </g>

      {/* manual badge removed: edit applies to the central percentage only */}

      {editingPct && (
        <foreignObject x={cx - 36} y={by + bH / 2 - 18} width={72} height={36} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.95)', borderRadius: 6, padding: 4, border: '1px solid #cbd5e1' }}>
            <input
              ref={inputRef}
              value={draftPct}
              onChange={(e) => setDraftPct(e.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter') {
                  ev.preventDefault(); ev.stopPropagation();
                  const v = parseFloat(String(draftPct).replace(',', '.'));
                  const parsed = Number.isFinite(Number(v)) ? Number(v) : null;
                  try { if (typeof data.onManualPctChange === 'function') data.onManualPctChange(parsed); } catch (e) {}
                  setEditingPct(false);
                }
                if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); setEditingPct(false); }
              }}
              style={{ width: 40, border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 4px', textAlign: 'center' }}
            />
            <button type="button" onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); const v = parseFloat(String(draftPct).replace(',', '.')); const parsed = Number.isFinite(Number(v)) ? Number(v) : null; try { if (typeof data.onManualPctChange === 'function') data.onManualPctChange(parsed); } catch (e) {} setEditingPct(false); }} style={{ border: 'none', background: '#10b981', color: '#fff', borderRadius: 4, padding: '4px 6px' }}>OK</button>
            <button type="button" onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setDraftPct(porcentaje != null ? String(Math.round(porcentaje)) : ''); setEditingPct(false); }} style={{ border: 'none', background: '#ef4444', color: '#fff', borderRadius: 4, padding: '4px 6px' }}>✕</button>
          </div>
        </foreignObject>
      )}

      {/* el nombre lo renderiza DistrictFlow — NO duplicar aquí */}
    </g>
  );
}
