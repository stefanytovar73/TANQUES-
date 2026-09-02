/*
  OBSOLETO: este módulo contenía lógica de cálculo duplicada.
  Todas las métricas derivadas deben calcularse en el backend (Laravel).
  Mantengo firmas exportadas mínimas que devuelven valores neutros
  o el nombre tal cual para evitar romper importaciones en el frontend.
*/

export function normalizeAlturaValue(value) {
  console.warn('tanqueMetrics: función obsoleta; usar valores del backend');
  return null;
}

export function obtenerNombreMostrar(nombre) {
  return nombre || '';
}

export function obtenerAlturaTotal() {
  console.warn('tanqueMetrics: obtenerAlturaTotal es obsoleto; usar altura_maxima desde backend');
  return null;
}

export function obtenerNivelMaximo() {
  console.warn('tanqueMetrics: obtenerNivelMaximo es obsoleto');
  return null;
}

export function obtenerAlturaMaxima() {
  console.warn('tanqueMetrics: obtenerAlturaMaxima es obsoleto; usar altura_maxima desde backend');
  return null;
}

export function obtenerCapacidadTanque() {
  console.warn('tanqueMetrics: obtenerCapacidadTanque es obsoleto; usar capacidad_maxima_m3 desde backend');
  return null;
}

export function calcularArea() { return null; }
export function obtenerAlturaRebose() { return null; }
export function obtenerAlarmas() { return { alarmaLlenado: null, alarmaVacio: null }; }
export function obtenerEstadoColor() { return { estado: null, color: null }; }
export function calculateTankMetrics() { return { area: null, volumenActual: null, porcentaje: null, estado: null, colorEstado: null, capacidadMaxima: null, alturaTotal: null }; }
export const TankCalculator = { calculateTankMetrics };
export function calcularAreaTanque() { return null; }
export function obtenerAreaTanque() { return null; }
export function obtenerDatosTanqueCombinados() { return null; }
export function calcularVolumenActual() { return null; }
export function calcularCapacidadActual() { return null; }
export function calcularRebose() { return null; }
export function calcularCapacidadMaxima() { return null; }
export function calcularPorcentajeLlenado() { return null; }
export function calcularReboseDisponible() { return null; }
export function calcularAlturaRestante() { return null; }
export function obtenerPorcentajeTanque() { return null; }

// Central percentage calculator used across the frontend.
// Returns a raw percentage (0..100). When a valid denominator is unavailable,
// we prefer a concrete 0% instead of null to keep the client data consistent.
export function calcPorcentaje(valor_m, altura_rebose) {
  if (valor_m === null || valor_m === undefined || valor_m === "") return null;
  if (!Number.isFinite(Number(valor_m))) return null;

  // If altura_rebose is missing or invalid, do not infer 0% — return null so UI shows "Sin datos".
  if (altura_rebose === null || altura_rebose === undefined || altura_rebose === "") return null;
  if (!Number.isFinite(Number(altura_rebose))) return null;
  if (Number(altura_rebose) <= 0) return null;

  return (Number(valor_m) / Number(altura_rebose)) * 100;
}

// Convenience: returns the displayed (rounded) percentage or null
export function obtenerPorcentajeMostrado(valor_m, altura_rebose) {
  const raw = calcPorcentaje(valor_m, altura_rebose);
  return raw == null ? null : Math.round(raw);
}

// Central function requested by spec: calculate percentage from valor_m and altura_rebose_calibrada.
// If the denominator is unavailable, emit 0 instead of null so the UI remains consistent.
export function calculateDisplayPorcentaje(valor_m, altura_rebose_calibrada) {
  if (valor_m === null || valor_m === undefined || valor_m === "") return null;
  if (!Number.isFinite(Number(valor_m))) return null;

  // Do not return 0 when denominator is missing or invalid — return null so callers display 'Sin datos'.
  if (altura_rebose_calibrada === null || altura_rebose_calibrada === undefined || altura_rebose_calibrada === "") return null;
  if (!Number.isFinite(Number(altura_rebose_calibrada))) return null;

  const denom = Number(altura_rebose_calibrada);
  if (denom <= 0) return null;
  const raw = (Number(valor_m) / denom) * 100;
  const clamped = Math.max(0, Math.min(100, raw));
  return clamped;
}

// Alias con la firma solicitada: calculatePorcentaje(valor_m, altura_rebose_calibrada)
export function calculatePorcentaje(valor_m, altura_rebose_calibrada) {
  return calculateDisplayPorcentaje(valor_m, altura_rebose_calibrada);
}
export default {
  obtenerNombreMostrar,
};
