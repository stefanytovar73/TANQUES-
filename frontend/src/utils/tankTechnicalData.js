/*
  OBSOLETO: las tablas de datos técnicos se trasladaron al backend.
  Mantengo la función para compatibilidad, pero devuelve null.
*/

export function getDatosTecnicosTanque(/* nombre */) {
  console.warn('tankTechnicalData: módulo obsoleto; usar config/tanques.php en backend');
  return null;
}

export default getDatosTecnicosTanque;
