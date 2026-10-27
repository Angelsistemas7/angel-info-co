'use strict';

const assert = require('node:assert/strict');
const { reconcileAnmHistorical } = require('./reconcile_co_historical');

const normalize = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
const municipalities = {
  AMAZONAS: [{ municipio: 'La Victoria (ANM)' }],
  VAUPES: [{ municipio: 'Yavaraté (ANM)' }],
  GUAINIA: [{ municipio: 'Cacahual (ANM)' }],
  CHOCO: [{ municipio: 'Ejemplo (ANM)' }, { municipio: 'EJEMPLO (ANM)' }],
};
const history = {
  homicidios: {
    'LA VICTORIA|AMAZONAS': { 2007: 1 },
    'LA VICTORIA (ANM)|AMAZONAS': { 2008: 2 },
  },
  hurto: {
    'YAVARATE|VAUPES': { 2007: 1 },
    'CACAHUAL|GUAINIA': { 2009: 1, 2022: 1 },
    'EJEMPLO|CHOCO': { 2010: 9 },
    'SIN ESTABLECER|GUAINIA': { 2020: 5 },
  },
};

assert.equal(reconcileAnmHistorical(municipalities, history, normalize), 3);
assert.deepEqual(history.homicidios['LA VICTORIA (ANM)|AMAZONAS'], { 2007: 1, 2008: 2 });
assert.deepEqual(history.hurto['YAVARATE (ANM)|VAUPES'], { 2007: 1 });
assert.deepEqual(history.hurto['CACAHUAL (ANM)|GUAINIA'], { 2009: 1, 2022: 1 });
assert.equal(history.homicidios['LA VICTORIA|AMAZONAS'], undefined);
assert.equal(history.hurto['EJEMPLO|CHOCO'][2010], 9); // nombre ambiguo
assert.equal(history.hurto['SIN ESTABLECER|GUAINIA'][2020], 5); // sin geografía fiable
console.log('OK historical ANM aliases reconcile without allocating unknown municipalities');
