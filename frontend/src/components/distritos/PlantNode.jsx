import React from 'react';

export default function PlantNode({ x, y, data, selected, onClick }) {
  const w = 140;
  const h = 36;
  return (
    <g transform={`translate(${x - w / 2}, ${y - h / 2})`} onClick={onClick} style={{ cursor: 'pointer' }}>
      <rect rx="6" ry="6" width={w} height={h} fill="#e8f1fb" stroke="#073B70" strokeWidth={2} />
      <text x={10} y={22} fontFamily="Roboto, Arial" fontSize={12} fontWeight={700} fill="#073B70">{data.label}</text>
    </g>
  );
}
