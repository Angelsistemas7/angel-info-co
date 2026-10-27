// Colombia con las cifras del Ministerio de Defensa, sin red (27-oct-2026):
// - terrorismo, delitos sexuales y violencia intrafamiliar leen los conjuntos del Ministerio;
// - los desgloses que solo publica la Policía siguen saliendo de ella, con su tramo;
// - hurto y lesiones 2003–2009 se completan solo en los años que la Policía no trae, y frenan si en 2010
//   no coinciden.
// Uso: node data/test_co_fuentes_mindefensa.js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SRC, ANTES_2010, COMPLEMENTO_ANTES_2010, sumarPorClave, verificarSolape, completarAntesDe } = require('./fetch_raw');

// Cifra oficial del Ministerio (fecha ISO, desde 2003).
for (const [cat, id] of [['terrorismo', 'yi5j-5fe9'], ['sexuales', 'bz43-8ahq'], ['violencia_intrafamiliar', 'gepp-dxcs']]) {
  assert.equal(SRC[cat].id, id, `${cat} usa el conjunto del Ministerio`);
  assert.equal(SRC[cat].dateType, 'iso', `${cat}: el Ministerio publica fecha ISO`);
}
// Desgloses que solo trae la Policía: siguen en sus reportes DIJIN.
assert.equal(SRC.sexuales_policia.id, 'fpe5-yrmw');
assert.equal(SRC.vif_policia.id, 'vuyt-mqpw');
const fetchSrc = fs.readFileSync(path.join(__dirname, 'fetch_raw.js'), 'utf8');
assert.match(fetchSrc, /addTask\('sexuales_genero', \(\) => breakdown\(SRC\.sexuales, 'sexo'/, 'el sexo en DS sale del Ministerio (suma el total)');
for (const t of ['sexuales_delito', 'sexuales_grupo_etario']) assert.match(fetchSrc, new RegExp(`addTask\\('${t}', \\(\\) => breakdown\\(SRC\\.sexuales_policia`));
for (const t of ['vif_genero', 'vif_grupo_etario']) assert.match(fetchSrc, new RegExp(`addTask\\('${t}', \\(\\) => breakdown\\(SRC\\.vif_policia`));
// La app rotula esos desgloses con el tramo de la Policía (si el archivo existe: en angel-info-co no).
const appPath = path.join(__dirname, '..', 'js', 'app.js');
if (fs.existsSync(appPath)) {
  const app = fs.readFileSync(appPath, 'utf8');
  assert.match(app, /DATA\.analiticaCortes \|\| \{\}\)\[key\]/, 'la Analítica lee analiticaCortes');
  assert.match(app, /\$\{escapeHtml\(corte\)\}/, 'el tramo se escapa');
}

// Vehículos en un conjunto; abigeato, entidades financieras y piratería en tres (= d4fr-sbn2 de la Policía).
assert.deepEqual(ANTES_2010.hurto, ['csb4-y6v2']);
assert.deepEqual(ANTES_2010.hurto_extra, ['p88b-5ac7', 'i7h7-wmjc', 'sutf-7dyz']);
// Lesiones personales del Ministerio: ya sin las de tránsito, igual que el filtro de la Policía.
assert.deepEqual(ANTES_2010.lesiones, ['jr6v-i33g']);
assert.match(SRC.lesiones.extraWhere, /not like '%ACCIDENTE DE TRANSITO%'/);
// Los tres niveles de las tres series que empiezan en 2010, y ninguna otra.
assert.deepEqual(Object.keys(COMPLEMENTO_ANTES_2010).sort(), [
  'hist_depto_hurto', 'hist_depto_hurto_extra', 'hist_depto_lesiones',
  'hist_municipio_hurto_extra', 'hist_municipio_hurto_vehiculos', 'hist_municipio_lesiones',
  'hist_nacional_hurto', 'hist_nacional_hurto_extra', 'hist_nacional_lesiones',
]);
for (const [tarea, [fuente, campos]] of Object.entries(COMPLEMENTO_ANTES_2010)) {
  assert.ok(ANTES_2010[fuente], `${tarea}: fuente ${fuente} con conjuntos del Ministerio`);
  const nivel = tarea.split('_')[1];
  assert.deepEqual(campos, { nacional: [], depto: ['departamento'], municipio: ['municipio', 'departamento'] }[nivel], `${tarea}: campos de su nivel`);
}

// Nacional: la Policía empieza en 2010; el Ministerio trae 2008–2010 repartido en dos conjuntos.
const policia = [{ anio: '2010', total: '1858' }, { anio: '2011', total: '1884' }];
const ministerio = [
  { anio: '2008', total: '1953' }, { anio: '2008', total: '769' },
  { anio: '2009', total: '1811' }, { anio: '2009', total: '655' },
  { anio: '2010', total: '1442' }, { anio: '2010', total: '416' },
];
verificarSolape(policia, ministerio); // 1.858 = 1.442 + 416
const nacional = completarAntesDe(policia, ministerio, []);
assert.deepEqual(nacional, [
  { anio: '2010', total: '1858' }, { anio: '2011', total: '1884' },
  { anio: '2008', total: '2722' }, { anio: '2009', total: '2466' },
], '2008 y 2009 se suman por año; 2010 no se duplica');

// Un año que la Policía ya trae no se toca, aunque sea anterior a 2010.
const conPrevio = completarAntesDe([{ anio: '2009', total: '5' }, ...policia], ministerio, []);
assert.equal(conPrevio.filter(r => r.anio === '2009').length, 1);
assert.equal(conPrevio.find(r => r.anio === '2009').total, '5');

// Municipal: la clave incluye municipio y departamento.
const muni = completarAntesDe([], [
  { municipio: 'MEDELLIN', departamento: 'ANTIOQUIA', anio: '2005', total: '3' },
  { municipio: 'MEDELLIN', departamento: 'ANTIOQUIA', anio: '2005', total: '4' },
  { municipio: 'BELLO', departamento: 'ANTIOQUIA', anio: '2005', total: '1' },
], ['municipio', 'departamento']);
assert.deepEqual(muni, [
  { municipio: 'MEDELLIN', departamento: 'ANTIOQUIA', anio: '2005', total: '7' },
  { municipio: 'BELLO', departamento: 'ANTIOQUIA', anio: '2005', total: '1' },
]);
assert.deepEqual(sumarPorClave([{ departamento: 'META', anio: 2004, total: '2' }], ['departamento']),
  [{ departamento: 'META', anio: '2004', total: '2' }]);

// Si en 2010 dejan de coincidir (> 1 %) o falta el año de solape, no se mezcla nada.
assert.throws(() => verificarSolape(policia, [{ anio: '2010', total: '1700' }]), /ya no coinciden/);
assert.throws(() => verificarSolape(policia, [{ anio: '2010', total: '1700' }], 2010, 'lesiones'), /^Error: lesiones antes de 2010/);
assert.throws(() => verificarSolape(policia, [{ anio: '2009', total: '1858' }]), /ya no coinciden/);
verificarSolape(policia, [{ anio: '2010', total: '1859' }]); // ±1 se admite

console.log('test_co_fuentes_mindefensa: OK');
