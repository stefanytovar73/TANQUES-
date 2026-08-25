import React from 'react';

export default function TankNode({ data, selected }) {
  const cx = 60;
  const bW = 80;
  const bH = 90;
  const bx = cx - bW / 2;
  const by = 36;

  const porcentaje = data?.porcentaje ?? null;
  const fillRatio = porcentaje != null ? Math.min(Math.max(porcentaje / 100, 0), 1) : null;

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
        {data.valor_m != null ? `${Number(data.valor_m).toFixed(2)} m` : 'N/D'}
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
        >
          {`${Math.round(porcentaje)}%`}
        </text>
      ) : (
        <text
          x={cx} y={by + bH / 2 + 4}
          fontSize={15} fontWeight={800}
          textAnchor="middle" dominantBaseline="middle"
          fill="#1d4ed8"
        >
          N/D
        </text>
      )}

      {/* el nombre lo renderiza DistrictFlow — NO duplicar aquí */}
    </g>
  );
}
