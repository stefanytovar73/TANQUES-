import React from 'react';

function arrowPath(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const midX = x1 + dx * 0.5;
  const midY = y1 + dy * 0.5;
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

export default function Connection({ from, to, label, highlighted, dimmed }) {
  const stroke = highlighted ? '#f59e0b' : '#9ca3af';
  const opacity = dimmed ? 0.12 : 1;
  const strokeWidth = highlighted ? 3 : 1.8;
  const dash = dimmed ? '4 4' : '0';
  return (
    <g style={{ opacity }}>
      <path d={arrowPath(from.x, from.y, to.x, to.y)} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} markerEnd="url(#arrow)" />
      {label ? (
        <text x={(from.x + to.x) / 2 + 6} y={(from.y + to.y) / 2 - 6} fontSize={11} fill="#374151">{label}</text>
      ) : null}
    </g>
  );
}
