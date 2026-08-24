/*
  OBSOLETO: la altura de rebose debe venir del backend (config/tanques.php).
  Este módulo se mantiene como stub para compatibilidad de imports.
*/

export function getAlturaRebosePorNombre(/* nombre */) {
  console.warn('tankReboseConfig: módulo obsoleto; usar altura_rebose expuesta por backend');
  return null;
}

export default getAlturaRebosePorNombre;
