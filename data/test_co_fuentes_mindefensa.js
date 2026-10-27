// Colombia con las cifras del Ministerio de Defensa, sin red (27-oct-2026):
// - terrorismo, delitos sexuales, violencia intrafamiliar, lesiones y hurto leen los conjuntos del Ministerio;
// - los desgloses que solo publica la Policía siguen saliendo de ella, con su tramo;
// - hurto entero (vehículos y «otros» incluidos) lee los conjuntos del Ministerio, sumando los de «otros».
// Uso: node data/test_co_fuentes_mindefensa.js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SRC, sumarFilas, deVarios } = require('./fetch_raw');

// Cifra oficial del Ministerio (fecha ISO, desde 2003).
for (const [cat, id] of [['terrorismo', 'yi5j-5fe9'], ['sexuales', 'bz43-8ahq'], ['violencia_intrafamiliar', 'gepp-dxcs'], ['lesiones', 'jr6v-i33g']]) {
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

// Hurto de vehículos en un conjunto; abigeato, entidades financieras y piratería en tres (= d4fr-sbn2
// de la Policía). Sin empalme: todo el hurto sale del Ministerio, desde 2003 y con su corte.
assert.equal(SRC.hurto.id, 'csb4-y6v2');
assert.equal(SRC.hurto.dateType, 'iso');
assert.deepEqual(SRC.hurto_extra.ids, ['p88b-5ac7', 'i7h7-wmjc', 'sutf-7dyz']);
assert.equal(SRC.hurto_extra.id, undefined, 'otros hurtos no tiene un único conjunto');
assert.equal(SRC.hurto_extra.dateType, 'iso');
for (const cat of ['hurto_personas', 'hurto_residencias', 'hurto_comercio']) assert.equal(SRC[cat].dateType, 'iso', `${cat} del Ministerio`);
assert.doesNotMatch(JSON.stringify(SRC), /9vha-vh9n|d4fr-sbn2/, 'ya no se lee hurto de la Policía');
assert.doesNotMatch(fetchSrc, /ANTES_2010|completarAntesDe/, 'ni se empalma 2003–2009');
// Lesiones del Ministerio ya viene sin las de tránsito (las publica aparte): sin filtro.
assert.equal(SRC.lesiones.extraWhere, undefined);
// Toda tarea que lea una fuente de varios conjuntos pasa por consultar/consultarTodas (soql(src.id)
// con `ids` pediría «undefined.json» y fallaría).
for (const m of fetchSrc.matchAll(/(?:soql|soqlAll)\(SRC\.(\w+)\.id/g)) assert.ok(!SRC[m[1]].ids, `${m[1]} se consulta con su único id`);

// Series aparte del Ministerio (overlay, no suman al total): mismo esquema, trata solo arts. 188 A y B.
for (const [cat, id] of [['trata_personas', '95c7-mm6s'], ['delitos_ambientales', '9zck-qfvc'], ['invasion_tierras', 'kvjj-d2ay'], ['voladura_oleoductos', 'ec2r-4byk'], ['voladura_puentes_vias', 'm98b-cdys']]) {
  assert.equal(SRC[cat].id, id, `${cat} usa el conjunto del Ministerio`);
  assert.equal(SRC[cat].dateType, 'iso');
}
assert.match(SRC.trata_personas.extraWhere, /^\(.*188 A.*188 B.*\)$/, 'trata: 188 A y B entre paréntesis (se une al filtro de año)');
assert.doesNotMatch(SRC.trata_personas.extraWhere, /MIGRANTES/);

// Filas de varios conjuntos: se suman las que comparten todas las columnas salvo el total.
assert.deepEqual(sumarFilas([
  { departamento: 'META', anio: '2005', total: '2' }, { departamento: 'META', anio: '2005', total: '3' },
  { departamento: 'META', anio: '2006', total: '1' }, { anio: '2005', departamento: 'META', total: '4' },
]), [{ departamento: 'META', anio: '2005', total: '9' }, { departamento: 'META', anio: '2006', total: '1' }]);
assert.deepEqual(sumarFilas([
  { municipio: 'MEDELLIN', departamento: 'ANTIOQUIA', anio: '2005', total: '3' },
  { municipio: 'BELLO', departamento: 'ANTIOQUIA', anio: '2005', total: '1' },
  { municipio: 'MEDELLIN', departamento: 'ANTIOQUIA', anio: '2005', total: '4' },
]), [
  { municipio: 'MEDELLIN', departamento: 'ANTIOQUIA', anio: '2005', total: '7' },
  { municipio: 'BELLO', departamento: 'ANTIOQUIA', anio: '2005', total: '1' },
], 'la clave municipal incluye municipio y departamento');

// deVarios: un id va directo; varios se piden con los mismos parámetros y se suman (2010: 1.373 + 69 + 416).
(async () => {
  const pedidos = [];
  const pedir = async (id, params) => { pedidos.push([id, params.$group]); return { 'p88b-5ac7': [{ anio: '2010', total: '1373' }], 'i7h7-wmjc': [{ anio: '2010', total: '69' }], 'sutf-7dyz': [{ anio: '2010', total: '416' }], 'csb4-y6v2': [{ anio: '2010', total: '21456' }] }[id]; };
  assert.deepEqual(await deVarios(SRC.hurto_extra, { $group: 'anio' }, pedir), [{ anio: '2010', total: '1858' }]);
  assert.deepEqual(await deVarios(SRC.hurto, { $group: 'anio' }, pedir), [{ anio: '2010', total: '21456' }]);
  assert.deepEqual(pedidos, [['p88b-5ac7', 'anio'], ['i7h7-wmjc', 'anio'], ['sutf-7dyz', 'anio'], ['csb4-y6v2', 'anio']]);
  console.log('test_co_fuentes_mindefensa: OK');
})().catch(e => { console.error(e); process.exit(1); });
