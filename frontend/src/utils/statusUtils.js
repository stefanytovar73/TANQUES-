export function getStatusMeta(porcentaje) {
  if (porcentaje === null || porcentaje === undefined || Number.isNaN(porcentaje)) {
    return { label: 'Sin datos', color: '#94a3b8', background: '#f1f5f9', tone: 'neutral' };
  }

  if (porcentaje < 20) {
    return { label: 'CRÍTICO', color: '#b91c1c', background: '#fee2e2', tone: 'danger' };
  }

  if (porcentaje < 40) {
    return { label: 'ATENCIÓN', color: '#a16207', background: '#fef3c7', tone: 'warning' };
  }

  if (porcentaje < 95) {
    return { label: 'NORMAL', color: '#1d4ed8', background: '#dbeafe', tone: 'info' };
  }

  return { label: 'ALTO', color: '#166534', background: '#dcfce7', tone: 'success' };
}

export default getStatusMeta;
