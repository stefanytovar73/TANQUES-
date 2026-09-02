import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateDisplayPorcentaje, mergeApiTanquesWithCatalog } from '../src/config/tankCatalog.js';

test('calcula el porcentaje con valor_m y altura_rebose del mismo payload actual', () => {
  const tank = {
    valor_m: 1.83,
    altura_rebose: 6.6551724138,
    porcentaje: 50,
  };

  const pct = calculateDisplayPorcentaje(tank);
  assert.ok(Math.abs(pct - 27.5000000000) < 0.0001, `Esperado 27.5, recibido ${pct}`);
});

test('nunca sobrescribe valor_m ni altura_rebose con el catálogo local', () => {
  const catalog = [{
    id: 'tanque la 29',
    aliases: ['tanque la 29', 'la 29'],
    display_name: 'Tanque La 29',
    altura_rebose: 3.01,
  }];

  const apiTanques = [{
    id: 'tanque-la-29',
    display_name: 'Tanque La 29',
    valor_m: 1.83,
    altura_rebose: 6.6551724138,
    porcentaje: 50,
  }];

  const merged = mergeApiTanquesWithCatalog(apiTanques, catalog)[0];
  assert.equal(merged.valor_m, 1.83);
  assert.equal(merged.altura_rebose, 6.6551724138);
  assert.ok(Math.abs(merged.porcentaje - 27.5) < 0.0001, `Esperado 27.5, recibido ${merged.porcentaje}`);
});
