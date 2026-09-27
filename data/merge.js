// Fusión v2: 10 categorías de delito (Policía Nacional / SIEDCO) + Delitos Informáticos (Fiscalía/SPOA)
// histórico anual completo (2003/2010-2026) por departamento, para la barra histórica del dashboard.
//
// NOTA: los archivos JSON crudos que este script lee (hist_nacional_*.json, hist_depto_*.json,
// top_municipios_*.json, etc.) fueron eliminados tras generar colombia_crimen.json para no ocupar
// espacio en disco. Para volver a ejecutar este script hay que re-descargar esos archivos desde
// datos.gov.co (ver las consultas SoQL documentadas en la conversación de origen del proyecto).
// colombia_crimen.json (el resultado final ya fusionado) y js/data.js SÍ están completos y vigentes.
const fs = require('fs');
const path = __dirname;
const { CURRENT_YEAR } = require('./pipeline_config');

function load(name) {
  return JSON.parse(fs.readFileSync(path + '/' + name, 'utf8'));
}
function tryLoad(name) {
  try { return load(name); } catch (e) { console.error('missing', name); return []; }
}

const DEPARTAMENTOS = [
  { key: 'AMAZONAS', nombre: 'Amazonas', lat: -1.44, lon: -71.57, capital: 'Leticia' },
  { key: 'ANTIOQUIA', nombre: 'Antioquia', lat: 6.55, lon: -75.83, capital: 'Medellín' },
  { key: 'ARAUCA', nombre: 'Arauca', lat: 6.70, lon: -70.76, capital: 'Arauca' },
  { key: 'ATLANTICO', nombre: 'Atlántico', lat: 10.68, lon: -74.96, capital: 'Barranquilla' },
  { key: 'BOGOTA', nombre: 'Bogotá D.C.', lat: 4.65, lon: -74.10, capital: 'Bogotá' },
  { key: 'BOLIVAR', nombre: 'Bolívar', lat: 8.68, lon: -74.02, capital: 'Cartagena' },
  { key: 'BOYACA', nombre: 'Boyacá', lat: 5.45, lon: -73.36, capital: 'Tunja' },
  { key: 'CALDAS', nombre: 'Caldas', lat: 5.30, lon: -75.50, capital: 'Manizales' },
  { key: 'CAQUETA', nombre: 'Caquetá', lat: 0.87, lon: -73.85, capital: 'Florencia' },
  { key: 'CASANARE', nombre: 'Casanare', lat: 5.75, lon: -71.58, capital: 'Yopal' },
  { key: 'CAUCA', nombre: 'Cauca', lat: 2.45, lon: -76.61, capital: 'Popayán' },
  { key: 'CESAR', nombre: 'Cesar', lat: 9.34, lon: -73.65, capital: 'Valledupar' },
  { key: 'CHOCO', nombre: 'Chocó', lat: 5.70, lon: -76.66, capital: 'Quibdó' },
  { key: 'CORDOBA', nombre: 'Córdoba', lat: 8.30, lon: -75.65, capital: 'Montería' },
  { key: 'CUNDINAMARCA', nombre: 'Cundinamarca', lat: 5.03, lon: -74.03, capital: 'Bogotá' },
  { key: 'GUAINIA', nombre: 'Guainía', lat: 2.58, lon: -68.53, capital: 'Inírida' },
  { key: 'GUAVIARE', nombre: 'Guaviare', lat: 2.04, lon: -72.63, capital: 'San José del Guaviare' },
  { key: 'HUILA', nombre: 'Huila', lat: 2.54, lon: -75.53, capital: 'Neiva' },
  { key: 'GUAJIRA', nombre: 'La Guajira', lat: 11.54, lon: -72.91, capital: 'Riohacha' },
  { key: 'MAGDALENA', nombre: 'Magdalena', lat: 10.24, lon: -74.19, capital: 'Santa Marta' },
  { key: 'META', nombre: 'Meta', lat: 3.27, lon: -73.09, capital: 'Villavicencio' },
  { key: 'NARINO', nombre: 'Nariño', lat: 1.29, lon: -77.36, capital: 'Pasto' },
  { key: 'NORTE DE SANTANDER', nombre: 'Norte de Santander', lat: 7.94, lon: -72.89, capital: 'Cúcuta' },
  { key: 'PUTUMAYO', nombre: 'Putumayo', lat: 0.44, lon: -76.13, capital: 'Mocoa' },
  { key: 'QUINDIO', nombre: 'Quindío', lat: 4.46, lon: -75.67, capital: 'Armenia' },
  { key: 'RISARALDA', nombre: 'Risaralda', lat: 5.32, lon: -75.99, capital: 'Pereira' },
  { key: 'SAN ANDRES', nombre: 'San Andrés y Providencia', lat: 12.58, lon: -81.70, capital: 'San Andrés' },
  { key: 'SANTANDER', nombre: 'Santander', lat: 6.64, lon: -73.47, capital: 'Bucaramanga' },
  { key: 'SUCRE', nombre: 'Sucre', lat: 9.30, lon: -75.40, capital: 'Sincelejo' },
  { key: 'TOLIMA', nombre: 'Tolima', lat: 4.09, lon: -75.15, capital: 'Ibagué' },
  { key: 'VALLE', nombre: 'Valle del Cauca', lat: 3.80, lon: -76.64, capital: 'Cali' },
  { key: 'VAUPES', nombre: 'Vaupés', lat: 0.85, lon: -70.81, capital: 'Mitú' },
  { key: 'VICHADA', nombre: 'Vichada', lat: 4.42, lon: -69.29, capital: 'Puerto Carreño' },
];

function stripAccents(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }

function normalizeDeptoName(raw) {
  let s = stripAccents(String(raw).toUpperCase().trim());
  s = s.replace(/,?\s*D\.?\s*C\.?$/, '');
  if (s.startsWith('BOGOTA')) return 'BOGOTA';
  if (s.startsWith('LA GUAJIRA') || s === 'GUAJIRA') return 'GUAJIRA';
  if (s.startsWith('VALLE')) return 'VALLE';
  if (s.startsWith('NARI')) return 'NARINO';
  if (s.startsWith('SAN ANDRES') || s.startsWith('ARCHIPIELAGO')) return 'SAN ANDRES';
  if (s.startsWith('NORTE DE SANTANDER')) return 'NORTE DE SANTANDER';
  if (s === 'BOYACA' || s === 'BOYACA.') return 'BOYACA';
  return s;
}

const byKey = {};
DEPARTAMENTOS.forEach(d => { byKey[d.key] = { ...d }; });

const CATS = ['homicidios', 'secuestros', 'extorsion', 'amenazas', 'delitos_sexuales', 'lesiones', 'hurto', 'violencia_intrafamiliar', 'terrorismo', 'estupefacientes'];
// feminicidios es un subconjunto de homicidios (misma fuente, spoa_caracterizacion='FEMINICIDIO'):
// se muestra aparte para análisis pero NO se suma al total nacional para evitar doble conteo.
// minas_antipersonal (víctimas de MAP/MUSE/AEI, fuente CNMH/SIEVCAC) NO es subconjunto de ninguna
// otra categoría (no viene de SIEDCO/Policía Nacional, es un registro de victimización del
// conflicto armado, no una denuncia penal) pero tampoco se suma al total nacional a propósito:
// es una naturaleza de dato distinta a "delito" y sumarla distorsionaría el Índice de Seguridad
// (mismo criterio que dejar desaparecidosUBPD fuera de CATS). Se muestra igual en el mapa/leyenda/
// histórico vía el mecanismo genérico de categorías overlay.
const CATS_OVERLAY = ['feminicidios', 'minas_antipersonal', 'capturas'];
// 'capturas' (personas detenidas por la Policía Nacional, DIJIN 3jdh-nmwu) tampoco se suma al
// total nacional, por la misma razón que minas_antipersonal: no es un delito denunciado sino
// actividad operativa policial (mismo criterio que las aprehensiones de Costa Rica). Una captura
// no equivale a un delito nuevo (la persona puede quedar libre, o corresponder a un hecho ya
// contado en otra categoría), así que sumarla inflaría el total y rompería la comparabilidad
// de la serie SIEDCO. Se muestra igual en mapa/leyenda/histórico vía el overlay genérico.
const ALL_CATS = CATS.concat(CATS_OVERLAY);
ALL_CATS.forEach(c => { DEPARTAMENTOS.forEach(d => { byKey[d.key][c] = 0; }); });

// "hurto" es un compuesto de 4 fuentes reales de Policía Nacional (personas, residencias, vehículos, otros)
const HURTO_SUBFUENTES = {
  personas: 'hurto_personas',
  residencias: 'hurto_residencias',
  vehiculos: 'hurto',       // 9vha-vh9n: motocicletas + automotores
  otros: 'hurto_extra',     // d4fr-sbn2: abigeato + entidades financieras + piratería terrestre
  comercio: 'hurto_comercio', // 7i2x-h5vp: hurto a comercio (antes no entraba en ninguna subfuente)
};

const FILES = {
  homicidios: 'homicidio',
  secuestros: 'secuestro',
  extorsion: 'extorsion',
  amenazas: 'amenazas',
  delitos_sexuales: 'sexuales',
  lesiones: 'lesiones',
  hurto: Object.values(HURTO_SUBFUENTES),
  violencia_intrafamiliar: 'violencia_intrafamiliar',
  terrorismo: 'terrorismo',
  estupefacientes: 'estupefacientes',
  feminicidios: 'feminicidio',
  minas_antipersonal: 'minas_antipersonal',
  capturas: 'capturas',
};

// -------- Current period (año vigente) department totals --------
function applyCurrentPeriod(field, file) {
  const rows = tryLoad(file + '.json');
  rows.forEach(r => {
    const key = normalizeDeptoName(r.departamento);
    if (!byKey[key]) { console.error('Depto no reconocido (actual):', r.departamento, '->', key, file); return; }
    byKey[key][field] += parseFloat(r.total) || 0;
  });
}
applyCurrentPeriod('homicidios', 'homicidio');
applyCurrentPeriod('secuestros', 'secuestro');
applyCurrentPeriod('extorsion', 'extorsion');
applyCurrentPeriod('delitos_sexuales', 'sexuales');
applyCurrentPeriod('violencia_intrafamiliar', 'violencia_intrafamiliar');
applyCurrentPeriod('estupefacientes', 'estupefacientes');
applyCurrentPeriod('hurto', 'hurto_personas_actual');
applyCurrentPeriod('hurto', 'hurto_residencias_actual');
applyCurrentPeriod('hurto', 'hurto');
applyCurrentPeriod('hurto', 'hurto_extra_actual');
applyCurrentPeriod('hurto', 'hurto_comercio_actual');
applyCurrentPeriod('feminicidios', 'feminicidio_actual');
applyCurrentPeriod('capturas', 'capturas');

// amenazas, lesiones, terrorismo y minas: derivar solo el año vigente desde los históricos por
// departamento. Antes se sumaban 2025+2026 y se etiquetaban juntos como "actual".
function currentFromHistDepto(field, file) {
  const rows = tryLoad('hist_depto_' + file + '.json');
  rows.forEach(r => {
    if (String(r.anio) !== String(CURRENT_YEAR)) return;
    const key = normalizeDeptoName(r.departamento);
    if (!byKey[key]) { console.error('Depto no reconocido (hist->actual):', r.departamento, '->', key, file); return; }
    byKey[key][field] += parseFloat(r.total) || 0;
  });
}
currentFromHistDepto('amenazas', 'amenazas');
currentFromHistDepto('lesiones', 'lesiones');
currentFromHistDepto('terrorismo', 'terrorismo');
currentFromHistDepto('minas_antipersonal', 'minas_antipersonal');

const departamentos = Object.values(byKey).map(d => {
  const total = CATS.reduce((s, c) => s + d[c], 0);
  return { ...d, total };
}).sort((a, b) => b.total - a.total);

// -------- Historical national (yearly) --------
function loadHistNacional(fileKey) {
  return tryLoad('hist_nacional_' + fileKey + '.json').map(r => ({ anio: String(r.anio), total: parseFloat(r.total) || 0 }));
}
const historicoNacional = {};
ALL_CATS.forEach(c => {
  const files = Array.isArray(FILES[c]) ? FILES[c] : [FILES[c]];
  const byYear = {};
  files.forEach(f => {
    loadHistNacional(f).forEach(r => { byYear[r.anio] = (byYear[r.anio] || 0) + r.total; });
  });
  historicoNacional[c] = Object.keys(byYear).sort().map(anio => ({ anio, total: byYear[anio] }));
});

// -------- Historical by department (yearly) : { cat: { deptoKey: {anio: total} } } --------
function loadHistDepto(fileKey) { return tryLoad('hist_depto_' + fileKey + '.json'); }
const historicoDepartamental = {};
ALL_CATS.forEach(c => {
  const files = Array.isArray(FILES[c]) ? FILES[c] : [FILES[c]];
  const byDepto = {};
  DEPARTAMENTOS.forEach(d => { byDepto[d.key] = {}; });
  files.forEach(f => {
    loadHistDepto(f).forEach(r => {
      const key = normalizeDeptoName(r.departamento);
      if (!byDepto[key]) return;
      byDepto[key][String(r.anio)] = (byDepto[key][String(r.anio)] || 0) + (parseFloat(r.total) || 0);
    });
  });
  historicoDepartamental[c] = byDepto;
});

// Range of years actually available per category (una categoría sin serie — ej. crudos aún no
// descargados — queda en {min:null,max:null} y no afecta el rango global)
const rangoAnios = {};
ALL_CATS.forEach(c => {
  const years = historicoNacional[c].map(r => parseInt(r.anio, 10)).filter(y => y >= 2003 && y <= 2026);
  rangoAnios[c] = years.length ? { min: Math.min(...years), max: Math.max(...years) } : { min: null, max: null };
});
const _rangoVals = Object.values(rangoAnios).filter(r => r.min !== null);
const anioGlobalMin = Math.min(..._rangoVals.map(r => r.min));
const anioGlobalMax = Math.max(..._rangoVals.map(r => r.max));

// -------- Monthly trend (recent) --------
function monthly(file) {
  return tryLoad(file + '.json').map(r => ({ mes: r.mes.slice(0, 7), total: parseFloat(r.total) }));
}
const tendenciaMensual = {
  homicidios: monthly('homicidio_mensual'),
  extorsion: monthly('extorsion_mensual'),
  secuestros: monthly('secuestro_mensual'),
};

// -------- Top municipios --------
function topMunicipios(file) {
  return tryLoad(file + '.json').map(r => ({ municipio: r.municipio.replace(/\s*\(CT\)\s*$/, ''), departamento: r.departamento, total: parseFloat(r.total) }));
}
function combineTopMunicipios(files) {
  const byKeyM = {};
  files.forEach(f => topMunicipios(f).forEach(m => {
    const k = m.municipio.toUpperCase() + '|' + m.departamento.toUpperCase();
    if (!byKeyM[k]) byKeyM[k] = { municipio: m.municipio, departamento: m.departamento, total: 0 };
    byKeyM[k].total += m.total;
  }));
  return Object.values(byKeyM).sort((a, b) => b.total - a.total).slice(0, 15);
}
const topMunis = {
  homicidios: topMunicipios('top_municipios_homicidio'),
  extorsion: topMunicipios('top_municipios_extorsion'),
  hurto: combineTopMunicipios(['top_municipios_hurto_personas', 'top_municipios_hurto_residencias', 'top_municipios_hurto']),
  amenazas: topMunicipios('top_municipios_amenazas'),
  lesiones: topMunicipios('top_municipios_lesiones'),
};

// -------- Analítica adicional (desgloses demográficos y por modalidad) --------
// fetch_raw.js ya normaliza estos archivos a filas {label, total} (ver su propio helper
// `breakdown`), así que aquí solo hace falta parsear el total — antes se leía un campo
// por-archivo (arma_medio, sexo, modalidad, ...) que ya no existe en el JSON crudo, y por
// eso las 10 categorías (salvo hurto_composicion, que no usa esta función) quedaban vacías.
function breakdown(file) {
  return tryLoad(file + '.json')
    .map(r => ({ label: r.label, total: parseFloat(r.total) || 0 }))
    .filter(r => r.label);
}
const analitica = {
  homicidios_arma: breakdown('homicidio_arma'),
  homicidios_sexo: breakdown('homicidio_sexo'),
  homicidios_modalidad: breakdown('homicidio_modalidad'),
  sexuales_delito: breakdown('sexuales_delito'),
  sexuales_genero: breakdown('sexuales_genero'),
  sexuales_grupo_etario: breakdown('sexuales_grupo_etario'),
  vif_genero: breakdown('vif_genero'),
  vif_grupo_etario: breakdown('vif_grupo_etario'),
  secuestro_tipo: breakdown('secuestro_tipo').map(r => ({ ...r, label: r.label.replace(/^ARTICULO \d+\.\s*/i, '') })),
  estupefacientes_tipo: breakdown('estupefacientes_tipo'),
  minas_condicion: breakdown('minas_condicion'),
  minas_situacion: breakdown('minas_situacion'),
  capturas_conducta: breakdown('capturas_conducta'),
  capturas_genero: breakdown('capturas_genero'),
  capturas_grupo_etario: breakdown('capturas_grupo_etario'),
  hurto_composicion: [
    { label: 'Hurto a Personas', total: tryLoad('hurto_personas_actual.json').reduce((s, r) => s + (parseFloat(r.total) || 0), 0) },
    { label: 'Hurto a Residencias', total: tryLoad('hurto_residencias_actual.json').reduce((s, r) => s + (parseFloat(r.total) || 0), 0) },
    { label: 'Motocicletas y Automotores', total: tryLoad('hurto.json').reduce((s, r) => s + (parseFloat(r.total) || 0), 0) },
    { label: 'Abigeato, Entidades Financieras y Piratería Terrestre', total: tryLoad('hurto_extra_actual.json').reduce((s, r) => s + (parseFloat(r.total) || 0), 0) },
    { label: 'Hurto a Comercio', total: tryLoad('hurto_comercio_actual.json').reduce((s, r) => s + (parseFloat(r.total) || 0), 0) },
  ],
};

// -------- Municipios completos, los 33 departamentos (enriquecimiento) --------
// Fuentes nacionales agregadas por municipio (ver fetch_raw.js, sección 7): homicidio, extorsión y
// hurto (compuesto de sus 4 subfuentes de Policía Nacional, igual que HURTO_SUBFUENTES arriba),
// periodo actual 2025-2026. Antes esto solo se calculaba para Antioquia y Valle; ahora cubre las
// 33 llaves de DEPARTAMENTOS para que la Vista Táctica pueda colorear los ~1.122 municipios reales.
// Llave canónica de municipio: sin acentos y en mayúsculas, para que el mismo municipio cruce
// entre fuentes que no siempre acentúan igual (ej. "Medellín" en una fuente, "MEDELLIN" en otra) —
// sin esto, el mismo municipio podía duplicarse o no cruzar entre las 4 sub-fuentes de hurto, o
// entre el periodo actual y el histórico (ver historicoMunicipal más abajo).
function normalizeMuniKey(name) {
  return stripAccents(String(name)).toUpperCase().replace(/\s+/g, ' ').trim();
}
const filasSinMunicipio = [];
function municipiosNacional(field, files) {
  const byMuniKey = {}; // "MUNICIPIO_NORM|DEPTOKEY" -> { municipio, deptoKey, total }
  files.forEach(file => {
    tryLoad(file + '.json').forEach(r => {
      const deptoKey = normalizeDeptoName(r.departamento);
      if (!byKey[deptoKey]) return; // descarta deptos no reconocidos ("Sin Información", etc.)
      if (r.municipio === undefined || r.municipio === null || String(r.municipio).trim() === '') {
        filasSinMunicipio.push(field + ' ' + deptoKey + ' ' + r.total);
        return; // hechos sin municipio: siguen contando en el total departamental, no en el municipal
      }
      const name = String(r.municipio).replace(/\s*\(CT\)\s*$/, '').trim();
      const k = normalizeMuniKey(name) + '|' + deptoKey;
      if (!byMuniKey[k]) byMuniKey[k] = { municipio: name, deptoKey, total: 0 };
      byMuniKey[k].total += parseFloat(r.total) || 0;
    });
  });
  return byMuniKey;
}
// Categorías con detalle municipal (llave del dashboard -> sufijos de archivo municipios_<x> /
// hist_municipio_<x>). Todas vienen de SIEDCO/DIJIN con columna de municipio. Los overlays
// (feminicidios, capturas) se guardan por municipio pero NO suman al total municipal, igual que a
// nivel departamental.
const MUNI_CATS = {
  homicidios: ['homicidio'],
  secuestros: ['secuestro'],
  extorsion: ['extorsion'],
  amenazas: ['amenazas'],
  delitos_sexuales: ['sexuales'],
  lesiones: ['lesiones'],
  hurto: ['hurto_personas', 'hurto_residencias', 'hurto_vehiculos', 'hurto_extra', 'hurto_comercio'],
  violencia_intrafamiliar: ['violencia_intrafamiliar'],
  terrorismo: ['terrorismo'],
  estupefacientes: ['estupefacientes'],
};
const MUNI_OVERLAYS = { feminicidios: ['feminicidio'], capturas: ['capturas'] };
const MUNI_FIELDS = Object.keys(MUNI_CATS);
const MUNI_ALL_FIELDS = [...MUNI_FIELDS, ...Object.keys(MUNI_OVERLAYS)];
function muniVacio(municipio) {
  const m = { municipio, estadoDatos: {} };
  MUNI_ALL_FIELDS.forEach(k => { m[k] = 0; });
  MUNI_FIELDS.forEach(k => { m.estadoDatos[k] = 'no_reportado'; });
  return m;
}
function muniTotal(m) { return MUNI_FIELDS.reduce((sum, k) => sum + (m[k] || 0), 0); }

function buildMunicipiosDetalle() {
  const byDepto = {};
  DEPARTAMENTOS.forEach(d => { byDepto[d.key] = {}; });
  function merge(src, field) {
    Object.values(src).forEach(m => {
      const bucket = byDepto[m.deptoKey];
      if (!bucket) return;
      const muniKey = normalizeMuniKey(m.municipio);
      if (!bucket[muniKey]) bucket[muniKey] = muniVacio(m.municipio);
      bucket[muniKey][field] = m.total;
      if (MUNI_CATS[field]) bucket[muniKey].estadoDatos[field] = 'observado';
    });
  }
  Object.entries({ ...MUNI_CATS, ...MUNI_OVERLAYS }).forEach(([field, sufijos]) => {
    merge(municipiosNacional(field, sufijos.map(x => 'municipios_' + x)), field);
  });

  const result = {};
  DEPARTAMENTOS.forEach(d => {
    result[d.key] = Object.values(byDepto[d.key])
      .map(m => ({ ...m, total: muniTotal(m) }))
      .sort((a, b) => b.total - a.total);
  });
  return result;
}
const municipiosDetalle = buildMunicipiosDetalle();

// -------- Histórico municipal anual (homicidios, extorsión, hurto) --------
// Mismas fuentes que municipiosDetalle (ver fetch_raw.js sección 7b: hist_municipio_<file>.json),
// pero con serie por año en vez de solo el periodo actual. Permite comparar municipios en el tiempo
// (no solo departamentos) y calcular el Índice de Seguridad a nivel municipio. Misma llave
// "MUNICIPIO|DEPTOKEY" que municipiosDetalle para poder cruzarlos directo.
function municipioHistorico(files) {
  const byMuniKey = {}; // "MUNICIPIO|DEPTOKEY" -> { anio: total }
  files.forEach(file => {
    tryLoad('hist_municipio_' + file + '.json').forEach(r => {
      const deptoKey = normalizeDeptoName(r.departamento);
      if (!byKey[deptoKey]) return;
      const name = String(r.municipio).replace(/\s*\(CT\)\s*$/, '').trim();
      const k = normalizeMuniKey(name) + '|' + deptoKey;
      if (!byMuniKey[k]) byMuniKey[k] = {};
      const anio = String(r.anio);
      byMuniKey[k][anio] = (byMuniKey[k][anio] || 0) + (parseFloat(r.total) || 0);
    });
  });
  return byMuniKey;
}
const historicoMunicipal = Object.fromEntries(Object.entries(MUNI_CATS).map(([k, sufijos]) => [k, municipioHistorico(sufijos)]));
// Overlays aparte: la app deriva sus categorías municipales de las llaves de historicoMunicipal y
// las suma en el total, así que capturas/feminicidios no pueden vivir ahí.
const historicoMunicipalOverlay = Object.fromEntries(Object.entries(MUNI_OVERLAYS).map(([k, sufijos]) => [k, municipioHistorico(sufijos)]));

// -------- Gap-fill: Medicina Legal (INMLCF) para municipios que SIEDCO NUNCA reporta --------
// Ver detalle completo en fetch_raw.js (sección 11) y ESTADO_SESION.md ("Ronda — Amazonía
// colombiana: municipios en cero rellenados con Medicina Legal"). Confirmado consultando m8fd-ahd9
// SIN filtro de año: en Amazonas/Guainía/Vaupés, SIEDCO no tiene NI UNA fila histórica (2003-2026)
// para 17 de sus 26 municipios/corregimientos departamentales -- no es un hueco del periodo actual,
// es una ausencia sistemática y total. Se rellenan con el registro real de homicidios de Medicina
// Legal (INMLCF: "Presuntos Homicidios 2015-2024, cifras definitivas" + "Lesiones fatales de causa
// externa, información preliminar ene-2025 a jun-2026"), la fuente forense primaria de homicidios
// en Colombia. SOLO se usa para los municipios que SIEDCO deja COMPLETAMENTE vacíos (nunca
// sobrescribe uno que ya tenga fila real de SIEDCO, para no mezclar 2 metodologías de conteo -
// hecho policial vs. dictamen forense - en el mismo número). Extorsión/hurto quedan en 0 para estos
// municipios porque Medicina Legal no cubre esas categorías (no es que se hayan verificado en cero
// - queda documentado en notaFuente de cada municipio afectado).
const MEDLEGAL_DEPTOS = new Set(['AMAZONAS', 'GUAINIA', 'VAUPES']);
function medlegalRows(file) {
  return tryLoad(file + '.json')
    .map(r => ({
      deptoKey: normalizeDeptoName(r.departamento),
      municipio: String(r.municipio).trim(),
      anio: String(r.anio),
      total: parseFloat(r.total) || 0,
    }))
    .filter(r => MEDLEGAL_DEPTOS.has(r.deptoKey));
}
const medlegalHomicidios = [
  ...medlegalRows('medlegal_homicidio_amazonia_historico'),
  ...medlegalRows('medlegal_homicidio_amazonia_preliminar'),
];
// Agrupa por municipio: total del año vigente + serie completa por año (para
// historicoMunicipal). En esta fuente forense, ausencia de fila para un municipio cubierto en el
// año vigente se interpreta como cero verificado; extorsión/hurto siguen como no reportados.
const medlegalByMuni = {}; // "MUNIKEY|DEPTOKEY" -> { municipio, deptoKey, actual, byYear }
medlegalHomicidios.forEach(r => {
  const muniKey = normalizeMuniKey(r.municipio) + '|' + r.deptoKey;
  if (!medlegalByMuni[muniKey]) medlegalByMuni[muniKey] = { municipio: r.municipio, deptoKey: r.deptoKey, actual: 0, byYear: {} };
  const bucket = medlegalByMuni[muniKey];
  bucket.byYear[r.anio] = (bucket.byYear[r.anio] || 0) + r.total;
  if (r.anio === String(CURRENT_YEAR)) bucket.actual += r.total;
});

let municipiosRellenadosMedLegal = 0;
Object.values(medlegalByMuni).forEach(({ municipio, deptoKey, actual, byYear }) => {
  const muniKeyNorm = normalizeMuniKey(municipio);
  const compoundKey = muniKeyNorm + '|' + deptoKey;
  const lista = municipiosDetalle[deptoKey];
  if (!lista) return;
  const yaExiste = lista.some(m => normalizeMuniKey(m.municipio) === muniKeyNorm);
  if (yaExiste) return; // SIEDCO ya tiene fila real para este municipio, no se toca
  const fila = muniVacio(municipio);
  fila.homicidios = actual;
  fila.total = actual;
  fila.estadoDatos.homicidios = actual > 0 ? 'observado_fuente_alterna' : 'cero_verificado';
  fila.fuenteHomicidios = 'medicina_legal';
  fila.notaFuente = 'SIEDCO (Policía Nacional) no ha reportado nunca un hecho en este municipio (verificado en toda su serie histórica 2003-2026). Homicidios tomados del registro de Medicina Legal (INMLCF), la fuente forense primaria. Las demás categorías en 0 porque Medicina Legal no las cubre, no porque se hayan verificado en cero.';
  lista.push(fila);
  municipiosRellenadosMedLegal++;
  // Histórico municipal: solo agrega la serie si SIEDCO tampoco tiene histórico para esta llave.
  if (historicoMunicipal.homicidios[compoundKey] === undefined) {
    historicoMunicipal.homicidios[compoundKey] = { ...byYear };
  }
});
['AMAZONAS', 'GUAINIA', 'VAUPES'].forEach(k => {
  if (municipiosDetalle[k]) municipiosDetalle[k].sort((a, b) => b.total - a.total);
});
console.log(`Medicina Legal (gap-fill Amazonía): ${municipiosRellenadosMedLegal} municipios añadidos que SIEDCO nunca había reportado (Amazonas/Guainía/Vaupés).`);

// -------- Población DANE (para tasas de criminalidad por 100.000 habitantes) --------
// Fuente: data/poblacion_municipios.json, generado por data/fetch_poblacion.js a partir del archivo
// oficial DANE "Proyecciones y Retroproyecciones de Población municipal por área 2018-2042" (PPED,
// base CNPV 2018), año 2025, área geográfica "Total". Ver cabecera de fetch_poblacion.js para la URL
// exacta y el detalle del parseo (no existe un dataset Socrata nacional equivalente en datos.gov.co).
//
// El cruce es por NOMBRE normalizado (SIEDCO no publica código DIVIPOLA en sus datasets de municipio),
// así que no es perfecto: se reporta al final la cantidad de municipios que sí/no cruzaron.
function normalizeMuniName(raw) {
  let s = stripAccents(String(raw).toUpperCase().trim());
  s = s.replace(/\s*\(CT\)\s*$/, '');
  s = s.replace(/[.,'’`]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}
const poblacionMunicipios = tryLoad('poblacion_municipios.json'); // [{ municipio, departamento, divipola, poblacion }]

// Población departamental = suma de la población de todos sus municipios en el archivo DANE
// (independiente del cruce por municipio con municipiosDetalle, así que siempre está completa).
const poblacionPorDepto = {};
poblacionMunicipios.forEach(r => {
  const deptoKey = normalizeDeptoName(r.departamento);
  if (!byKey[deptoKey]) return;
  poblacionPorDepto[deptoKey] = (poblacionPorDepto[deptoKey] || 0) + (parseFloat(r.poblacion) || 0);
});

// Candidatos de municipio por departamento, para el cruce por nombre normalizado.
const poblacionCandidatosPorDepto = {};
poblacionMunicipios.forEach(r => {
  const deptoKey = normalizeDeptoName(r.departamento);
  if (!byKey[deptoKey]) return;
  const n = normalizeMuniName(r.municipio);
  (poblacionCandidatosPorDepto[deptoKey] = poblacionCandidatosPorDepto[deptoKey] || []).push({
    n,
    ns: n.replace(/ /g, ''),
    divipola: String(r.divipola),
    poblacion: parseFloat(r.poblacion) || 0,
  });
});

function tasaPor100k(total, poblacion) {
  if (!poblacion) return null;
  return Math.round((total / poblacion) * 100000 * 10) / 10;
}
// Alias puntuales para nombres SIEDCO que no comparten ninguna subcadena razonable con el nombre
// oficial DANE (cambios de grafía o nombre completo vs. abreviado). Clave = nombre SIEDCO normalizado.
const MUNI_NAME_ALIASES = {
  'SANTA CRUZ DE MOMPOX': 'MOMPOS',
  'SAN ANDRES DE SOTAVENTO': 'SAN ANDRES SOTAVENTO',
  'CHIVOLO': 'CHIBOLO',
  'CERRO SAN ANTONIO': 'CERRO DE SAN ANTONIO',
};
// Nombres SIEDCO ambiguos dentro de un departamento (la coincidencia parcial encontraría varios).
const MUNI_NAME_ALIASES_POR_DEPTO = {
  'ANTIOQUIA|SAN PEDRO': 'SAN PEDRO DE LOS MILAGROS',
};
function buscarRegistroPoblacion(deptoKey, municipioNombre) {
  const candidatos = poblacionCandidatosPorDepto[deptoKey] || [];
  let n = normalizeMuniName(municipioNombre);
  n = MUNI_NAME_ALIASES_POR_DEPTO[deptoKey + '|' + n] || MUNI_NAME_ALIASES[n] || n;
  const ns = n.replace(/ /g, '');
  let hit = candidatos.find(c => c.n === n) || candidatos.find(c => c.ns === ns);
  if (!hit) {
    const parciales = candidatos.filter(c => c.n.includes(n) || n.includes(c.n) || c.ns.includes(ns) || ns.includes(c.ns));
    if (parciales.length === 1) hit = parciales[0];
  }
  return hit || null;
}

// 1) Cruce difuso SIEDCO <-> DANE: asigna población y código DIVIPOLA a cada municipio con datos.
Object.entries(municipiosDetalle).forEach(([deptoKey, munis]) => {
  munis.forEach(m => {
    const registro = buscarRegistroPoblacion(deptoKey, m.municipio);
    m.poblacion = registro ? registro.poblacion : null;
    m.divipola = m.divipola || (registro && registro.divipola) || null;
    m.estadoDatos = m.estadoDatos || Object.fromEntries(MUNI_FIELDS.map(k => [k, m[k] > 0 ? 'observado' : 'no_reportado']));
  });
});

// 1b) Fusiona filas del mismo municipio que llegaron con nombres distintos según el dataset (ej. hurto
// de vehículos escribe "Cartagena (CT)" y los demás "CARTAGENA DE INDIAS"): sin esto el municipio
// aparecía partido en dos filas y la principal mostraba cifras incompletas.
let municipiosFusionados = 0;
Object.keys(municipiosDetalle).forEach(deptoKey => {
  const porCodigo = new Map();
  const resultado = [];
  municipiosDetalle[deptoKey].forEach(m => {
    const previo = m.divipola && porCodigo.get(m.divipola);
    if (!previo) { if (m.divipola) porCodigo.set(m.divipola, m); resultado.push(m); return; }
    const [principal, otro] = m.total > previo.total ? [m, previo] : [previo, m];
    MUNI_ALL_FIELDS.forEach(campo => {
      principal[campo] = (principal[campo] || 0) + (otro[campo] || 0);
      if (otro.estadoDatos && otro.estadoDatos[campo] && otro.estadoDatos[campo] !== 'no_reportado'
          && (!principal.estadoDatos[campo] || principal.estadoDatos[campo] === 'no_reportado')) {
        principal.estadoDatos[campo] = otro.estadoDatos[campo];
      }
    });
    principal.total = muniTotal(principal);
    principal.alias = [...new Set([...(principal.alias || []), otro.municipio, ...(otro.alias || [])])];
    if (principal !== previo) { resultado[resultado.indexOf(previo)] = principal; porCodigo.set(m.divipola, principal); }
    municipiosFusionados++;
  });
  municipiosDetalle[deptoKey] = resultado;
});
if (filasSinMunicipio.length) console.log('Filas SIEDCO sin municipio (solo cuentan en el total departamental): ' + filasSinMunicipio.join('; '));
console.log('Fusión por DIVIPOLA: ' + municipiosFusionados + ' filas duplicadas (mismo municipio, distinto nombre por dataset) unificadas.');
// Misma unificación en la serie histórica: la llave de un alias se suma a la del nombre principal.
let seriesHistoricasFusionadas = 0;
Object.entries(municipiosDetalle).forEach(([deptoKey, munis]) => {
  munis.filter(m => m.alias).forEach(m => {
    const principalKey = normalizeMuniKey(m.municipio) + '|' + deptoKey;
    m.alias.forEach(alias => {
      const aliasKey = normalizeMuniKey(String(alias).replace(/\s*\(CT\)\s*$/, '').trim()) + '|' + deptoKey;
      if (aliasKey === principalKey) return;
      [...Object.values(historicoMunicipal), ...Object.values(historicoMunicipalOverlay)].forEach(serie => {
        if (!serie[aliasKey]) return;
        const destino = serie[principalKey] = serie[principalKey] || {};
        Object.entries(serie[aliasKey]).forEach(([anio, total]) => { destino[anio] = (destino[anio] || 0) + total; });
        delete serie[aliasKey];
        seriesHistoricasFusionadas++;
      });
    });
  });
});
console.log('Histórico municipal: ' + seriesHistoricasFusionadas + ' series de alias sumadas a su municipio principal.');

// 2) Catálogo territorial completo, por código DIVIPOLA (no por nombre: SIEDCO escribe "CARTAGENA DE
// INDIAS" o "CUCUTA" donde DANE dice "Cartagena" o "San José de Cúcuta"). Un municipio DANE sin
// ninguna fila en las fuentes vigentes se materializa con estado "no_reportado": nunca desaparece ni se
// convierte silenciosamente en un cero observado. DANE 2025 tiene 1.123 municipios; el más reciente,
// Nuevo Belén de Bajirá (27493), todavía no está en la geometría HDX de 1.122 features.
const divipolasPresentes = new Set(Object.values(municipiosDetalle).flat().map(m => m.divipola).filter(Boolean));
let municipiosCatalogoAgregados = 0;
poblacionMunicipios.forEach(r => {
  const deptoKey = normalizeDeptoName(r.departamento);
  const divipola = String(r.divipola);
  if (divipolasPresentes.has(divipola)) return;
  const lista = municipiosDetalle[deptoKey] = municipiosDetalle[deptoKey] || [];
  lista.push({ ...muniVacio(r.municipio), divipola, total: 0, poblacion: parseFloat(r.poblacion) || null });
  divipolasPresentes.add(divipola);
  municipiosCatalogoAgregados++;
});

// 3) Tasas, estado de cobertura y orden.
let municipiosConPoblacion = 0;
let municipiosSinPoblacion = 0;
Object.values(municipiosDetalle).forEach(munis => {
  munis.forEach(m => {
    m.tasaPor100k = tasaPor100k(m.total, m.poblacion);
    // SIEDCO es un registro de hechos: si cubre el municipio (tiene filas en alguna categoría) y no
    // trae fila en otra, es "sin_registro" (la fuente no registró hechos), distinto de
    // "no_reportado" (la fuente no cubre el municipio). Los rellenos de Medicina Legal no cuentan
    // como cobertura SIEDCO: sus otras categorías siguen siendo no_reportado.
    const cubiertoPorSiedco = !m.fuenteHomicidios && MUNI_FIELDS.some(k => m.estadoDatos[k] === 'observado');
    if (cubiertoPorSiedco) {
      MUNI_FIELDS.forEach(k => { if (m.estadoDatos[k] === 'no_reportado') m.estadoDatos[k] = 'sin_registro'; });
    }
    const statuses = Object.values(m.estadoDatos || {});
    const cubiertas = statuses.filter(status => status !== 'no_reportado').length;
    m.estadoCobertura = cubiertas === 0 ? 'no_reportado' : (cubiertas === statuses.length ? 'completo' : 'parcial');
    if (m.poblacion) municipiosConPoblacion++; else municipiosSinPoblacion++;
  });
  munis.sort((a, b) => b.total - a.total || a.municipio.localeCompare(b.municipio, 'es'));
});
const totalMunicipiosDetalle = municipiosConPoblacion + municipiosSinPoblacion;
const pctCruzados = totalMunicipiosDetalle ? ((municipiosConPoblacion / totalMunicipiosDetalle) * 100).toFixed(1) : '0.0';
const coberturaMunicipal = Object.values(municipiosDetalle).flat().reduce((acc, municipio) => {
  acc[municipio.estadoCobertura] = (acc[municipio.estadoCobertura] || 0) + 1;
  return acc;
}, { catalogoDane: poblacionMunicipios.length, materializados: totalMunicipiosDetalle });
console.log(`Población DANE: ${poblacionMunicipios.length} municipios cargados desde poblacion_municipios.json.`);
console.log(`Cruce municipiosDetalle <-> población: ${municipiosConPoblacion}/${totalMunicipiosDetalle} municipios (${pctCruzados}%) SÍ cruzaron; ${municipiosSinPoblacion} NO cruzaron (poblacion:null, tasaPor100k:null).`);
console.log(`Catálogo completo: ${totalMunicipiosDetalle} municipios materializados; ${municipiosCatalogoAgregados} agregados explícitamente como no_reportado.`);
if (totalMunicipiosDetalle && municipiosSinPoblacion / totalMunicipiosDetalle > 0.15) {
  console.error('ADVERTENCIA: más del 15% de los municipios NO cruzaron con población DANE. Revisar normalizeMuniName / nombres SIEDCO vs DANE.');
}

departamentos.forEach(d => {
  const poblacion = poblacionPorDepto[d.key] || null;
  d.poblacion = poblacion;
  d.tasaPor100k = tasaPor100k(d.total, poblacion);
});

// -------- Delitos informáticos (Fiscalía / SPOA) --------
const delitosInformaticos = {
  porAnio: tryLoad('hist_nacional_informaticos.json').map(r => ({ anio: String(r.anio), total: parseFloat(r.total) || 0 })),
  porDepartamento: tryLoad('depto_informaticos.json').map(r => ({ departamento: r.departamento, total: parseFloat(r.total) || 0 })).filter(r => r.departamento !== 'SIN DATO'),
  porTipo: tryLoad('tipos_informaticos.json').map(r => ({ delito: r.delito, total: parseFloat(r.total) || 0 })),
};

// -------- Denuncias Fiscalía (SPOA): Conteo de Procesos V3 (dbdv-iihs) y Conteo de Víctimas V3 (hr73-zqjf) --------
// Agregados vía SoQL ($select + count(*) + $group) directamente sobre datos.gov.co, NO se descargaron los registros crudos
// (el dataset de procesos supera 23 millones de filas). Departamento = lugar de los hechos (departamento_hecho / departamento_hecho_origen).
function porDeptoDesdeConteo(file) {
  const byDepto = {};
  tryLoad(file + '.json').forEach(r => {
    const key = normalizeDeptoName(r.departamento);
    if (!byKey[key]) return; // descarta "Sin Información" y similares
    byDepto[key] = (byDepto[key] || 0) + (parseFloat(r.total) || 0);
  });
  return Object.keys(byDepto)
    .map(key => ({ departamento: byKey[key].nombre, total: byDepto[key] }))
    .sort((a, b) => b.total - a.total);
}
const denunciasFiscalia = {
  procesos: {
    porAnio: tryLoad('hist_nacional_spoa_procesos.json').map(r => ({ anio: String(r.anio), total: parseFloat(r.total) || 0 })),
    porDepartamento: porDeptoDesdeConteo('depto_spoa_procesos'),
    porTipo: tryLoad('tipos_spoa_procesos.json').map(r => ({ delito: r.delito, total: parseFloat(r.total) || 0 })),
  },
  victimas: {
    porAnio: tryLoad('hist_nacional_spoa_victimas.json').map(r => ({ anio: String(r.anio), total: parseFloat(r.total) || 0 })),
    porDepartamento: porDeptoDesdeConteo('depto_spoa_victimas'),
  },
};

// -------- Personas desaparecidas: Instituto Nacional de Medicina Legal y Ciencias Forenses, registro SIRDEC --------
// NOTA: la UBPD (Unidad de Búsqueda de Personas dadas por Desaparecidas) no publica su "Universo de personas dadas por
// desaparecidas" como dataset descargable ni API (solo un visor interactivo tipo Power BI en datos.unidadbusqueda.gov.co).
// Como sustituto verificable y con la misma orden de magnitud, se usa el registro nacional de desapariciones de Medicina
// Legal (SIRDEC, dataset "Desaparecidos en Colombia - Histórico", datos.gov.co id 8hqm-7fdt), filtrado a estado
// "Desaparecido" (personas aún no localizadas). Se cita además la cifra oficial UBPD (universo del conflicto armado) en el
// texto del panel a modo de referencia cruzada.
const desaparecidosUBPD = {
  fuenteReal: 'Instituto Nacional de Medicina Legal y Ciencias Forenses (SIRDEC) — no fue posible obtener el dataset descargable de la UBPD, que solo expone un visor interactivo',
  porAnio: tryLoad('hist_nacional_desaparecidos.json').map(r => ({ anio: String(r.anio), total: parseFloat(r.total) || 0 })),
  porDepartamento: porDeptoDesdeConteo('depto_desaparecidos'),
  porSexo: tryLoad('desaparecidos_sexo.json').map(r => ({ sexo: r.sexo, total: parseFloat(r.total) || 0 })),
  totalRegistroActual: 129895,
  cifraOficialUBPD: { total: 136010, fecha: '2026-07-08', fuente: 'UBPD, boletín de actualización del universo de personas dadas por desaparecidas en razón del conflicto armado' },
};

// -------- Totales nacionales (periodo actual) --------
const totales = ALL_CATS.reduce((acc, c) => { acc[c] = departamentos.reduce((s, d) => s + d[c], 0); return acc; }, {});
totales.total = departamentos.reduce((s, d) => s + d.total, 0);

// -------- Noticias (boletín curado, fuentes reales verificadas vía búsqueda web) --------
// depto/ciudad: usados para el filtro de ubicación del boletín (null = alcance nacional/sin ciudad clara en el titular).
const noticias = [
  { titulo: "Homicidio y extorsión disparados en 2026: cifras muestran la mayor subida en 10 años", fuente: "Yahoo Noticias", fecha: "2026-07", url: "https://es-us.noticias.yahoo.com/homicidio-extorsi%C3%B3n-disparados-2026-cifras-151915384.html", depto: null, ciudad: null },
  { titulo: "Así fue la sexta masacre en Colombia en 2026, ocurrida en Padilla, Cauca", fuente: "Semana", fecha: "2026-07", url: "https://www.semana.com/nacion/medellin/articulo/asi-fue-la-sexta-masacre-en-colombia-en-2026-ocurrida-esta-madrugada-en-padilla-cauca-delincuentes-asesinaron-a-cuatro-personas/202647/", depto: "Cauca", ciudad: null },
  { titulo: "Asesinan a comerciante víctima de extorsión en Soledad: van 600 crímenes en Atlántico", fuente: "Noticias RCN", fecha: "2026-07", url: "https://www.noticiasrcn.com/colombia/asesinan-a-comerciante-victima-de-extorsion-en-soledad-van-600-crimenes-en-atlantico-1036828", depto: "Atlántico", ciudad: "Soledad" },
  { titulo: "Violento asesinato contra hombre de 74 años en un billar de Barranquilla; investigan trasfondo extorsivo", fuente: "El Tiempo", fecha: "2026-07-15", url: "https://www.eltiempo.com/colombia/barranquilla/barranquilla-violento-asesinato-contra-hombre-de-74-anos-que-estaba-dentro-de-un-billar-en-la-luz-autoridades-indagan-posible-trasfondo-extorsivo-3569645", depto: "Atlántico", ciudad: "Barranquilla" },
  { titulo: "Sicario acabó con la vida del padre de alias '27', excabecilla de 'Los Costeños'", fuente: "El Universal", fecha: "2026-07-16", url: "https://www.eluniversal.com.co/sucesos/2026/07/16/sicario-acabo-con-la-vida-del-papa-de-alias-27-excabecilla-de-la-banda-los-costenos/", depto: null, ciudad: null },
  { titulo: "Homicidios y secuestro bajaron en Cundinamarca durante el primer semestre de 2026", fuente: "Cambio", fecha: "2026-07", url: "https://cambiocolombia.com/pais/articulo/2026/7/homicidios-bajaron-92-por-ciento-y-el-secuestro-cayo-70-por-ciento-en-cundinamarca-durante-el-primer-semestre-de-2026", depto: "Cundinamarca", ciudad: null },
  { titulo: "Policía alerta por aumento de homicidios en Bogotá derivados de riñas tras partidos del Mundial 2026", fuente: "Infobae", fecha: "2026-07-01", url: "https://www.infobae.com/colombia/2026/07/01/policia-alerta-por-el-aumento-de-homicidios-en-bogota-derivados-de-rinas-tras-los-partidos-de-colombia-en-mundial-2026/", depto: "Bogotá D.C.", ciudad: "Bogotá" },
  { titulo: "Policía Metropolitana reporta 34 capturas en Cali durante el primer fin de semana de julio", fuente: "El País (Cali)", fecha: "2026-07", url: "https://www.elpais.com.co/judicial/policia-metropolitana-reporta-34-personas-capturadas-en-cali-durante-el-primer-fin-de-semana-de-julio-balance-de-orden-publico-0626.html", depto: "Valle del Cauca", ciudad: "Cali" },
  { titulo: "Capturan a dos hombres por el homicidio de un ciudadano extranjero en Cundinamarca", fuente: "El Tiempo", fecha: "2026-07-07", url: "https://www.eltiempo.com/bogota/capturan-a-dos-hombres-por-el-homicidio-de-un-ciudadano-extranjero-en-cundinamarca-3571253", depto: "Cundinamarca", ciudad: null },
  { titulo: "Los homicidios se redujeron en un 14% en el Área Metropolitana del Valle de Aburrá para el cierre del primer semestre de 2026", fuente: "El Tiempo", fecha: "2026-07", url: "https://www.eltiempo.com/colombia/medellin/los-homicidios-se-redujeron-en-un-14-en-el-area-metropolitana-del-valle-de-aburra-para-el-cierre-del-primer-semestre-de-3568872", depto: "Antioquia", ciudad: "Medellín" },
  { titulo: "53 capturados, 10 homicidios y 15 armas de fuego incautadas: el balance de Cali durante el tercer fin de semana de julio", fuente: "El Tiempo", fecha: "2026-07", url: "https://www.eltiempo.com/colombia/cali/53-capturados-10-homicidios-y-15-armas-de-fuego-incautadas-el-balance-de-cali-durante-el-tercer-fin-de-semana-de-julio-3572630", depto: "Valle del Cauca", ciudad: "Cali" },
  { titulo: "Policía dio detalles sobre asesinato a puñaladas cerca de la estación Héroes, en Bogotá", fuente: "Semana", fecha: "2026-07-25", url: "https://www.semana.com/nacion/bogota/articulo/policia-dio-detalles-a-semana-sobre-asesinato-a-punaladas-cerca-de-la-estacion-heroes-en-bogota/202647/", depto: "Bogotá D.C.", ciudad: "Bogotá" },
  { titulo: "Microtráfico, venganzas e intolerancia: las causas detrás de los 15 homicidios del fin de semana de la Virgen de Chiquinquirá en Cali", fuente: "El Tiempo", fecha: "2026-07", url: "https://www.eltiempo.com/colombia/cali/microtrafico-venganzas-e-intolerancia-las-principales-causas-detras-de-los-15-homicidios-del-fin-de-semana-de-la-virgen-de-chiquinquira-en-cali-3571048", depto: "Valle del Cauca", ciudad: "Cali" },
  { titulo: "Máxima alerta: van 85 líderes sociales asesinados en Colombia en lo que va de 2026", fuente: "Semana", fecha: "2026-07", url: "https://www.semana.com/nacion/barranquilla/articulo/maxima-alerta-van-85-lideres-sociales-asesinados-en-colombia-en-lo-que-va-de-2026/202647/", depto: null, ciudad: null },
  { titulo: "Extorsión bajó un 20% en Bogotá durante 2026: reportan 190 casos menos y varias capturas", fuente: "Infobae", fecha: "2026-06-15", url: "https://www.infobae.com/colombia/2026/06/15/extorsion-bajo-un-20-en-bogota-durante-2026-reportan-190-casos-menos-y-capturas-entre-ellas-una-por-intimidar-a-una-webcamer/", depto: "Bogotá D.C.", ciudad: "Bogotá" },
  { titulo: "Extorsión en Bogotá: estas son las seis localidades que registraron más casos durante el primer semestre de 2026", fuente: "El Tiempo", fecha: "2026-07", url: "https://www.eltiempo.com/amp/bogota/extorsion-en-bogota-estas-son-las-seis-localidades-que-registraron-mas-casos-durante-el-primer-semestre-de-3573182", depto: "Bogotá D.C.", ciudad: "Bogotá" },
  { titulo: "Defensoría alerta por crisis de seguridad en Barranquilla tras 25 homicidios en el último fin de semana de junio", fuente: "El Heraldo", fecha: "2026-07-06", url: "https://www.elheraldo.co/judicial/2026/07/06/defensoria-alerta-por-crisis-de-seguridad-en-barranquilla-tras-25-homicidios-en-un-fin-de-semana/", depto: "Atlántico", ciudad: "Barranquilla" },
  { titulo: "Violento puente festivo en Barranquilla: 21 homicidios en tres días encienden las alarmas por la seguridad en el área metropolitana", fuente: "El Tiempo", fecha: "2026-07", url: "https://www.eltiempo.com/colombia/barranquilla/violento-puente-festivo-en-barranquilla-21-homicidios-en-tres-dias-encienden-las-alarmas-por-la-seguridad-en-el-area-metropolitana-3567909", depto: "Atlántico", ciudad: "Barranquilla" },
  { titulo: "Amenazas, negocios cerrados y más patrullajes: así transcurrió el atípico fin de semana que tuvo en jaque a Barranquilla", fuente: "El Tiempo", fecha: "2026-07", url: "https://www.eltiempo.com/colombia/barranquilla/amenazas-negocios-cerrados-y-mas-patrullajes-asi-transcurrio-el-atipico-fin-de-semana-que-tuvo-en-jaque-a-barranquilla-y-su-area-metropolitana-3569369", depto: "Atlántico", ciudad: "Barranquilla" },
  { titulo: "Alerta por ola de homicidios en Cali, Barranquilla y Medellín: guerras criminales y ajuste de cuentas marcan el inicio de 2026", fuente: "Infobae", fecha: "2026-02-01", url: "https://www.infobae.com/colombia/2026/02/01/alerta-por-ola-de-homicidios-en-cali-barranquilla-y-medellin-guerras-criminales-y-ajuste-de-cuentas-marcan-el-inicio-de-2026/", depto: null, ciudad: null },
  { titulo: "Capturaron a responsables de secuestrar a dos hombres en una vivienda del occidente de Medellín", fuente: "Blu Radio", fecha: "2026-07-09", url: "https://www.bluradio.com/regiones/antioquia/capturaron-a-responsables-de-secuestrar-dos-hombres-en-una-vivienda-del-occidente-de-medellin-rg10", depto: "Antioquia", ciudad: "Medellín" },
].sort((a, b) => b.fecha.localeCompare(a.fecha));

const output = {
  meta: {
    fuente: 'Policía Nacional de Colombia (SIEDCO) vía datos.gov.co + DIJIN/Policía Nacional (reporte de capturas 3jdh-nmwu) + Fiscalía General de la Nación (SPOA) para delitos informáticos, procesos y víctimas + Instituto Nacional de Medicina Legal y Ciencias Forenses (SIRDEC) para personas desaparecidas y para homicidios en municipios amazónicos que SIEDCO nunca reporta + Centro Nacional de Memoria Histórica (SIEVCAC) para víctimas de minas antipersonal',
    poblacionFuente: 'DANE 2025',
    periodoActual: `Año ${CURRENT_YEAR} (YTD; el corte exacto puede variar por fuente)`,
    rangoHistorico: { min: anioGlobalMin, max: anioGlobalMax },
    rangoAnios,
    coberturaMunicipal,
    generado: new Date().toISOString(),
    nota: 'Estupefacientes = número de operativos de incautación registrados (no víctimas). Hurto = suma de 4 reportes de Policía Nacional (personas, residencias, motos/autos, abigeato+entidades financieras+piratería terrestre). Feminicidios es un subconjunto de Homicidios (misma fuente SIEDCO) y NO se suma al total nacional para evitar doble conteo. Delitos Informáticos usa año de los hechos (Fiscalía/SPOA), no departamento geolocalizado por SIEDCO. Minas Antipersonal (MAP/MUSE/AEI) viene del Centro Nacional de Memoria Histórica (SIEVCAC, corte 31-03-2026), NO de la Policía Nacional/SIEDCO: son víctimas civiles y de la fuerza pública por artefactos explosivos en el marco del conflicto armado, un tipo de dato distinto a una denuncia penal — por eso tampoco se suma al total nacional (misma lógica que Personas Desaparecidas). En Amazonas/Guainía/Vaupés, ' + municipiosRellenadosMedLegal + ' municipios/corregimientos departamentales que SIEDCO nunca ha reportado (ni una fila en toda su serie histórica 2003-2026) muestran homicidios tomados de Medicina Legal (INMLCF) en su lugar -- extorsión/hurto quedan en 0 para esos municipios puntuales porque Medicina Legal no cubre esas categorías (ver notaFuente en cada municipio afectado, campo municipiosDetalle). Capturas = personas detenidas por la Policía Nacional (DIJIN, serie 2010-2026, desagregada por departamento/municipio/conducta/sexo/edad): es actividad operativa policial, NO un delito denunciado nuevo, por eso es categoría overlay y NO suma al total nacional (una captura no equivale a un hecho adicional; la persona puede quedar libre o corresponder a un delito ya contado en otra categoría).',
  },
  categorias: CATS,
  categoriasOverlay: CATS_OVERLAY,
  totales,
  departamentos,
  tendenciaMensual,
  historicoNacional,
  historicoDepartamental,
  topMunicipios: topMunis,
  delitosInformaticos,
  denunciasFiscalia,
  desaparecidosUBPD,
  municipiosDetalle,
  historicoMunicipal,
  historicoMunicipalOverlay,
  analitica,
  noticias,
};

if (!totales.total || totales.total < 100000) {
  console.error('ABORTADO: total sospechosamente bajo (' + totales.total + '). Probablemente faltan los JSON crudos de entrada (ver nota al inicio del archivo). No se sobrescribió colombia_crimen.json.');
  process.exit(1);
}
fs.writeFileSync(path + '/colombia_crimen.json', JSON.stringify(output));
console.log('OK. Departamentos:', departamentos.length, '| Total periodo actual:', totales.total, '| Rango histórico:', anioGlobalMin, '-', anioGlobalMax);
