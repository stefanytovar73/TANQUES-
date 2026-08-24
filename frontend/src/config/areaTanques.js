const normalize = (nombre = '') =>
  nombre
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/*
  OBSOLETO: área de tanques mantenida en frontend.
  Usar `area_m2` desde backend/config/tanques.php.
*/

export function getAreaForName(/* nombre */) {
  console.warn('areaTanques (frontend) obsoleto; usar backend config');
  return null;
}

export default { getAreaForName };
