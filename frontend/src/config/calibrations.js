// Calibraciones derivadas de la referencia visual del IBAL.
// Claves por display_name esperado (exact match) o alias común.
const ALTURAS_REBOSE_CALIBRADAS = {
  "Aurora": 4.413,
  "La Aurora": 4.413,
  "Ambala 1": 7.582,
  "Ambala 2": 7.693,
  "Alsacia": 2.500,
  // Referencia confirmada contra el dashboard oficial IBAL (16-09-2026):
  // Calucaima 4.02 m -> 67%, equivalente a una referencia de 6.00 m.
  "Calucaima": 6.0,
  // Ajuste provisional del 2026-08-20: se corrigió esta altura_rebose_calibrada por discrepancia con IBAL.
  // Se calculó con un solo punto de referencia (nivel_sensor + % IBAL en ese instante), no es medición física en campo.
  // Debe revisarse/reconfirmarse en unos días comparando de nuevo contra IBAL para verificar si el % se mantiene alineado o vuelve a desviarse.
  "Interlaken": 4.4796296296,
  // Ajuste provisional del 2026-08-20: se corrigió esta altura_rebose_calibrada por discrepancia con IBAL.
  // Se calculó con un solo punto de referencia (nivel_sensor + % IBAL en ese instante), no es medición física en campo.
  // Debe revisarse/reconfirmarse en unos días comparando de nuevo contra IBAL para verificar si el % se mantiene alineado o vuelve a desviarse.
  "La 15": 8.4403921569,
  "La Quince": 8.4403921569,
  "Tanque La 15": 8.4403921569,
  "La 29": 3.01,
  "Tanque 29": 3.01,
  "Tanque La 29": 3.01,
  // Ajuste provisional del 2026-08-20: se corrigió esta altura_rebose_calibrada por discrepancia con IBAL.
  // Se calculó con un solo punto de referencia (nivel_sensor + % IBAL en ese instante), no es medición física en campo.
  // Debe revisarse/reconfirmarse en unos días comparando de nuevo contra IBAL para verificar si el % se mantiene alineado o vuelve a desviarse.
  "La 30": 7.0185185185,
  "Tanque 30": 7.0185185185,
  "Tanque La 30": 7.0185185185,
  // Referencias confirmadas contra el dashboard oficial IBAL (16-09-2026):
  // Miramar 4.75 m -> 79% y Zona Industrial 2.72 m -> 45%, ambas sobre 6.00 m.
  "Miramar": 6.0,
  "Zona Industrial": 6.0,
  "Picaleña 1": 4.364,
  "Picaleña 2": 5.696,
};

export default ALTURAS_REBOSE_CALIBRADAS;
