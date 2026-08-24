import React from 'react';

export default function DistrictNode({ x, y, data, selected, onClick }) {
  const r = 34;
  return (
    <g transform={`translate(${x - r}, ${y - r / 2})`} onClick={onClick} style={{ cursor: 'pointer' }}>
      <rect rx={6} ry={6} width={68} height={34} fill="#fff" stroke="#6b7280" strokeWidth={1} />
      <text x={8} y={21} fontFamily="Roboto, Arial" fontSize={12} fill="#6b7280" fontWeight={700}>{data.label}</text>
    </g>
  );
}
