// Descarga/regenera TODOS los JSON crudos que data/merge.js y data/patch_fiscalia_ubpd.js esperan,
// usando consultas SoQL agregadas (SELECT ... GROUP BY) directamente contra la API de Socrata
// (datos.gov.co), sin descargar nunca registros crudos completos (algunos datasets superan
// los 20 millones de filas). Requiere Node 18+ (usa fetch nativo). Sin dependencias npm.
//
// Uso:  node data/fetch_raw.js
// Salida: escribe ~50 archivos *.json en data/ (mismo formato/nombre que espera merge.js).
// Si una fuente falla (red, dataset caído, cambio de esquema), se registran los errores,
// se completan las demás descargas y la corrida termina con error para no publicar datos parciales.

const fs = require('fs');
const path = __dirname;
const { CURRENT_YEAR, CURRENT_YEARS } = require('./pipeline_config');

const BASE = 'https://www.datos.gov.co/resource/';

let okCount = 0;
let failCount = 0;
const failures = [];

function save(name, data) {
  fs.writeFileSync(path + '/' + name + '.json', JSON.stringify(data));
  okCount++;
  console.log('  OK ' + name + '.json (' + data.length + ' filas)');
}

async function soql(datasetId, params, attempt = 1) {
  const cleanParams = {};
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) cleanParams[k] = v; });
  const qs = new URLSearchParams(cleanParams).toString();
  const url = BASE + datasetId + '.json?' + qs;
  let res;
  try {
    res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  } catch (e) {
    if (attempt < 3) { await sleep(1500 * attempt); return soql(datasetId, params, attempt + 1); }
    throw new Error('network error tras ' + attempt + ' intentos: ' + e.message);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(2000 * attempt);
      return soql(datasetId, params, attempt + 1);
    }
    throw new Error('HTTP ' + res.status + ' ' + datasetId + ': ' + body.slice(0, 300));
  }
  const json = await res.json();
  if (json && json.error) throw new Error('Socrata error ' + datasetId + ': ' + JSON.stringify(json).slice(0, 300));
  return json;
}

// Socrata recorta silenciosamente las respuestas al valor de $limit. Para consultas agrupadas
// grandes (especialmente municipio x año), una única petición no permite distinguir "resultado
// completo" de "primeras N filas". Esta variante pagina con un orden estable y falla de forma
// explícita si alcanza el tope de seguridad, en vez de publicar un histórico truncado.
async function soqlAll(datasetId, params, options = {}) {
  if (!params.$order) throw new Error('soqlAll requiere $order estable para paginar ' + datasetId);
  const pageSize = options.pageSize || 10000;
  const maxPages = options.maxPages || 100;
  const rows = [];

  for (let page = 0; page < maxPages; page++) {
    const chunk = await soql(datasetId, {
      ...params,
      $limit: pageSize,
      $offset: page * pageSize,
    });
    rows.push(...chunk);
    if (chunk.length < pageSize) return rows;
  }

  throw new Error(`paginación excedió ${maxPages} páginas de ${pageSize} filas para ${datasetId}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Cada fuente SIEDCO (Policía Nacional) tiene un formato de fecha distinto en `fecha_hecho`:
// "iso"  -> timestamp real (2026-05-25T00:00:00.000), se puede usar date_extract_y().
// "text" -> texto libre "DD/MM/AAAA", hay que extraer el año con substring(campo,7,4).
function yearExpr(src) {
  if (src.dateType === 'yearfield') return src.dateField; // el dataset ya trae el año en un campo texto propio (ej. SIEVCAC "a_o"), sin fecha completa que parsear
  return src.dateType === 'iso' ? `date_extract_y(${src.dateField})` : `substring(${src.dateField},7,4)`;
}
function yearEquals(src, year) {
  if (src.dateType === 'yearfield') return `${src.dateField}='${year}'`;
  return src.dateType === 'iso' ? `${yearExpr(src)}=${year}` : `${yearExpr(src)}='${year}'`;
}
function currentPeriodWhere(src, extra) {
  const clause = '(' + CURRENT_YEARS.map(y => yearEquals(src, y)).join(' OR ') + ')';
  return extra ? clause + ' AND ' + extra : clause;
}

// El campo `cantidad` en la mayoría de datasets SIEDCO es un conteo de hechos por fila (a veces >1,
// filas ya pre-agrupadas), así que se agrega con sum(cantidad::number). PERO en `estupefacientes`
// (kk69-w2jj) `cantidad` es en realidad el peso/volumen de la sustancia incautada (kg, litros, unidades
// mixtas), NO un conteo de operativos -- sumarlo da cifras astronómicas sin sentido. Para esa fuente
// se usa count(*) (número de operativos/registros), consistente con la nota "Estupefacientes = número
// de operativos de incautación registrados" en meta.nota de merge.js.
function aggExpr(src) {
  return src.aggType === 'count' ? 'count(*)' : `sum(${src.cant}::number)`;
}

// -------- Definición de las 10 fuentes SIEDCO (Policía Nacional) --------
const SRC = {
  homicidio: { id: 'm8fd-ahd9', dateType: 'iso', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad' },
  secuestro: { id: 'd7zw-hpf4', dateType: 'iso', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad', tipo: 'tipo_delito' },
  extorsion: { id: 'q2ib-t9am', dateType: 'iso', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad' },
  hurto_personas: { id: '4rxi-8m8d', dateType: 'iso', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad' },
  hurto_residencias: { id: '7mn7-vzqp', dateType: 'iso', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad' },
  hurto: { id: '9vha-vh9n', dateType: 'text', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad' }, // motos/autos
  // Hurto a comercio (MinDefensa, copia de SIEDCO con fecha ISO y código DANE): única modalidad de hurto
  // que no entraba en ninguna subfuente (26.331 hechos en 2025). Sin doble conteo con personas/residencias:
  // el dataset DIPON 6sqw-8cg5 las separa como tipo_de_hurto distintos (ver investigacion/co-fuentes-extra).
  hurto_comercio: { id: '7i2x-h5vp', dateType: 'iso', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad' },
  hurto_extra: { id: 'd4fr-sbn2', dateType: 'text', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad' }, // abigeato+financiero+pirateria
  // Delitos sexuales y violencia intrafamiliar: cifra del Ministerio de Defensa (bz43-8ahq, gepp-dxcs).
  // Son los mismos registros que los reportes DIJIN de la Policía (fpe5-yrmw, vuyt-mqpw): idénticos de
  // 2010 a 2025 salvo 1 caso en 2022 (DS) y 2 en 2025 (VIF), y el desglose por sexo de DS coincide
  // exacto; pero el Ministerio empieza en 2003 y actualiza cada mes (corte 30-sep-2026 frente a 31-jul
  // de la Policía: 25.084 frente a 18.970 DS en 2026). Cambio del 27-oct-2026.
  sexuales: { id: 'bz43-8ahq', dateType: 'iso', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad' },
  violencia_intrafamiliar: { id: 'gepp-dxcs', dateType: 'iso', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad' },
  // El tipo de delito sexual, el grupo etario y el sexo en VIF solo los publica la Policía: esos
  // desgloses siguen saliendo de sus reportes y llevan su propio corte (meses_* más abajo).
  sexuales_policia: { id: 'fpe5-yrmw', dateType: 'text', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad' },
  vif_policia: { id: 'vuyt-mqpw', dateType: 'text', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad' },
  amenazas: { id: 'meew-mguv', dateType: 'text', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad' },
  // Lesiones: el reporte DIPON mezcla las lesiones personales con las lesiones culposas en accidente
  // de tránsito (art. 120, ~48 mil al año). El Ministerio de Defensa publica estas aparte («Lesiones
  // accidentes de tránsito»); sin ellas la serie cuadra con su «Lesiones personales» año por año
  // (data/audit_co_mindefensa.js, 27-oct-2026). No son violencia: no entran en la categoría.
  lesiones: { id: '72sg-cybi', dateType: 'text', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad', extraWhere: "descripci_n_conducta not like '%ACCIDENTE DE TRANSITO%'" },
  // Terrorismo: cifra oficial del Ministerio de Defensa (yi5j-5fe9, «se mide en casos», art. 343, desde
  // 2003). El reporte DIJIN de la Policía (37p5-impc) solo trae las denuncias validadas con la Fiscalía
  // desde 2010 (234 en 2025 frente a 1.398 casos): coinciden de 2010 a 2015 y se separan desde 2016. La
  // prensa cita la del Ministerio (742 en 2022, 1.398 en 2025; NTN24). Cambio del 27-oct-2026.
  terrorismo: { id: 'yi5j-5fe9', dateType: 'iso', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad' },
  estupefacientes: { id: 'kk69-w2jj', dateType: 'text', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad', clase_bien: 'clase_bien', aggType: 'count' },
  feminicidio: { id: 'm8fd-ahd9', dateType: 'iso', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad', extraWhere: "spoa_caracterizacion='FEMINICIDIO'" },
  // Víctimas de minas antipersonal/MUSE/AEI -- Centro Nacional de Memoria Histórica (CNMH), Sistema
  // de Información de Eventos de Violencia del Conflicto Armado (SIEVCAC), dataset 52eu-ic7d. Cada
  // fila = 1 persona víctima (no un conteo de hechos), por eso aggType 'count' igual que
  // estupefacientes. Se probó primero el dataset "oficial" de Presidencia/AICMA (yhxn-eqqw) pero
  // dejó de actualizarse en 2024-01; SIEVCAC sí tiene corte reciente (31-03-2026, ver meta.nota).
  minas_antipersonal: { id: '52eu-ic7d', dateType: 'yearfield', dateField: 'a_o', depto: 'departamento', muni: 'municipio', aggType: 'count', condicion: 'calidad_de_la_v_ctima_o_la', situacion: 'situaci_n_actual_de_la_v' },
  // Capturas (personas detenidas en operativos, flagrancia u orden judicial) -- DIJIN/Policía
  // Nacional, dataset 3jdh-nmwu "Reporte Capturas Policía Nacional" (ver ESTADO_SESION.md,
  // "Ronda — Colombia: capturados/dados de baja..."). Serie viva 2010-01-01 a 2026-07-31
  // (corte 2026-08-31), ~3,75M de filas. fecha_hecho en texto "DD/MM/AAAA" (dateType 'text',
  // igual que hurto). `cantidad` = personas capturadas por fila (conteo, se suma). Desagrega por
  // departamento + municipio (+ codigo_dane) y trae conducta (artículo penal), genero y
  // grupo_etario. NO es un delito denunciado (naturaleza distinta, igual que aprehensiones de
  // Costa Rica): en merge.js va como categoría overlay, no suma al total nacional.
  capturas: { id: '3jdh-nmwu', dateType: 'text', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad' },
};

// -------- Tareas: cada una produce un archivo data/<nombre>.json --------
const tasks = [];

function addTask(name, fn) { tasks.push({ name, fn }); }

// 1) Año vigente por departamento -- archivos usados por applyCurrentPeriod(). Nunca se mezclan
// dos años en una misma cifra "actual"; el año puede fijarse para reproducción con
// CRIMENAI_CURRENT_YEAR=2026.
const CURRENT_FILES = {
  homicidio: SRC.homicidio,
  secuestro: SRC.secuestro,
  extorsion: SRC.extorsion,
  sexuales: SRC.sexuales,
  violencia_intrafamiliar: SRC.violencia_intrafamiliar,
  estupefacientes: SRC.estupefacientes,
  hurto_personas_actual: SRC.hurto_personas,
  hurto_residencias_actual: SRC.hurto_residencias,
  hurto: SRC.hurto,
  hurto_extra_actual: SRC.hurto_extra,
  hurto_comercio_actual: SRC.hurto_comercio,
  feminicidio_actual: SRC.feminicidio,
  capturas: SRC.capturas,
};
Object.entries(CURRENT_FILES).forEach(([file, src]) => {
  addTask(file, async () => {
    const where = currentPeriodWhere(src, src.extraWhere);
    const rows = await soql(src.id, {
      $select: `${src.depto} as departamento, ${aggExpr(src)} as total`,
      $where: where,
      $group: src.depto,
      $limit: 100,
    });
    return rows;
  });
});

// 2) Histórico anual por departamento (hist_depto_<file>.json) -- todas las ALL_CATS fuentes
const HIST_SOURCES = {
  homicidio: SRC.homicidio, secuestro: SRC.secuestro, extorsion: SRC.extorsion, amenazas: SRC.amenazas,
  sexuales: SRC.sexuales, lesiones: SRC.lesiones, hurto_personas: SRC.hurto_personas,
  hurto_residencias: SRC.hurto_residencias, hurto: SRC.hurto, hurto_extra: SRC.hurto_extra, hurto_comercio: SRC.hurto_comercio,
  violencia_intrafamiliar: SRC.violencia_intrafamiliar, terrorismo: SRC.terrorismo,
  estupefacientes: SRC.estupefacientes, feminicidio: SRC.feminicidio,
  minas_antipersonal: SRC.minas_antipersonal,
  capturas: SRC.capturas,
};
Object.entries(HIST_SOURCES).forEach(([file, src]) => {
  addTask('hist_depto_' + file, async () => {
    const rows = await soql(src.id, {
      $select: `${src.depto} as departamento, ${yearExpr(src)} as anio, ${aggExpr(src)} as total`,
      $where: src.extraWhere || undefined,
      $group: `${src.depto}, anio`,
      $limit: 5000,
    });
    return rows;
  });
  // 3) Histórico anual nacional (hist_nacional_<file>.json)
  addTask('hist_nacional_' + file, async () => {
    const rows = await soql(src.id, {
      $select: `${yearExpr(src)} as anio, ${aggExpr(src)} as total`,
      $where: src.extraWhere || undefined,
      $group: 'anio',
      $order: 'anio',
      $limit: 200,
    });
    return rows;
  });
});

// 4) Tendencia mensual (últimos ~3 años) para homicidio/extorsion/secuestro
['homicidio', 'extorsion', 'secuestro'].forEach(file => {
  addTask(file + '_mensual', async () => {
    const src = SRC[file];
    const rows = await soql(src.id, {
      $select: `date_trunc_ym(${src.dateField}) as mes, ${aggExpr(src)} as total`,
      $where: `${src.dateField} >= '2023-01-01T00:00:00'`,
      $group: 'mes',
      $order: 'mes',
      $limit: 200,
    });
    return rows;
  });
});

// 5) Top municipios (año vigente), top 15
const TOP_MUNI_FILES = {
  homicidio: SRC.homicidio, extorsion: SRC.extorsion, hurto_personas: SRC.hurto_personas,
  hurto_residencias: SRC.hurto_residencias, hurto: SRC.hurto, amenazas: SRC.amenazas, lesiones: SRC.lesiones,
};
Object.entries(TOP_MUNI_FILES).forEach(([file, src]) => {
  addTask('top_municipios_' + file, async () => {
    const rows = await soql(src.id, {
      $select: `${src.muni} as municipio, ${src.depto} as departamento, ${aggExpr(src)} as total`,
      $where: currentPeriodWhere(src, src.extraWhere),
      $group: `${src.muni}, ${src.depto}`,
      $order: 'total DESC',
      $limit: 15,
    });
    return rows;
  });
});

// 6) Desgloses demográficos / por modalidad (año vigente)
addTask('homicidio_arma', () => breakdown(SRC.homicidio, 'arma_medio', 'label'));
addTask('homicidio_sexo', () => breakdown(SRC.homicidio, 'sexo', 'label'));
addTask('homicidio_modalidad', () => breakdown(SRC.homicidio, '_modalidad_presunta', 'label'));
addTask('sexuales_delito', () => breakdown(SRC.sexuales_policia, 'delito', 'label'));
addTask('sexuales_genero', () => breakdown(SRC.sexuales, 'sexo', 'label'));
addTask('sexuales_grupo_etario', () => breakdown(SRC.sexuales_policia, 'grupo_etario', 'label'));
addTask('vif_genero', () => breakdown(SRC.vif_policia, 'genero', 'label'));
addTask('vif_grupo_etario', () => breakdown(SRC.vif_policia, 'grupo_etario', 'label'));
// Meses del año vigente que traen los reportes de la Policía usados solo para desgloses: la app
// rotula esos desgloses con su tramo («enero–julio») porque el total sale del Ministerio.
const mesesDelAnio = src => soql(src.id, {
  $select: 'substring(fecha_hecho,4,2) as mes, sum(cantidad::number) as total',
  $where: currentPeriodWhere(src), $group: 'mes', $order: 'mes', $limit: 20,
});
addTask('meses_sexuales_policia', () => mesesDelAnio(SRC.sexuales_policia));
addTask('meses_vif_policia', () => mesesDelAnio(SRC.vif_policia));
addTask('secuestro_tipo', () => breakdown(SRC.secuestro, 'tipo_delito', 'label'));
addTask('estupefacientes_tipo', () => breakdown(SRC.estupefacientes, 'clase_bien', 'label'));
addTask('minas_condicion', () => breakdown(SRC.minas_antipersonal, SRC.minas_antipersonal.condicion, 'label'));
addTask('minas_situacion', () => breakdown(SRC.minas_antipersonal, SRC.minas_antipersonal.situacion, 'label'));
addTask('capturas_conducta', () => breakdown(SRC.capturas, 'descripcion_conducta_captura', 'label'));
addTask('capturas_genero', () => breakdown(SRC.capturas, 'genero', 'label'));
addTask('capturas_grupo_etario', () => breakdown(SRC.capturas, 'grupo_etario', 'label'));

async function breakdown(src, field, outKey) {
  const rows = await soql(src.id, {
    $select: `${field} as ${outKey}, ${aggExpr(src)} as total`,
    $where: currentPeriodWhere(src, src.extraWhere),
    $group: field,
    $order: 'total DESC',
    $limit: 50,
  });
  return rows;
}

// 7) Municipios completos, TODOS los 33 departamentos (homicidio, extorsion, hurto=5 subfuentes),
// año vigente. Alimenta municipiosDetalle en merge.js (~1.122 municipios).
// hurto se compone de las mismas 5 subfuentes que HURTO_SUBFUENTES en merge.js (personas,
// residencias, vehículos, abigeato+financiero+piratería y comercio) para ser consistente con el total
// nacional de "hurto" del resto del dashboard.
const MUNI_NACIONAL_FILES = {
  municipios_homicidio: SRC.homicidio,
  municipios_extorsion: SRC.extorsion,
  municipios_hurto_personas: SRC.hurto_personas,
  municipios_hurto_residencias: SRC.hurto_residencias,
  municipios_hurto_vehiculos: SRC.hurto,
  municipios_hurto_extra: SRC.hurto_extra,
  municipios_hurto_comercio: SRC.hurto_comercio,
};
Object.entries(MUNI_NACIONAL_FILES).forEach(([file, src]) => {
  addTask(file, async () => {
    const rows = await soql(src.id, {
      $select: `${src.muni} as municipio, ${src.depto} as departamento, ${aggExpr(src)} as total`,
      $where: currentPeriodWhere(src, src.extraWhere),
      $group: `${src.muni}, ${src.depto}`,
      $limit: 5000,
    });
    return rows;
  });
});

// 7b) Histórico municipal anual (homicidio, extorsión, hurto=4 subfuentes), mismas fuentes que (7)
// pero agrupado también por año. Alimenta historicoMunicipal en merge.js, para poder comparar
// municipios en el tiempo (no solo el periodo actual) y calcular el Índice de Seguridad a nivel
// municipio. El resultado puede superar 20.000 grupos, por lo que DEBE paginarse; el límite fijo
// anterior truncaba silenciosamente algunas fuentes exactamente en 20.000 filas.
Object.entries(MUNI_NACIONAL_FILES).forEach(([file, src]) => {
  addTask('hist_municipio_' + file.replace(/^municipios_/, ''), async () => {
    const rows = await soqlAll(src.id, {
      $select: `${src.muni} as municipio, ${src.depto} as departamento, ${yearExpr(src)} as anio, ${aggExpr(src)} as total`,
      $where: src.extraWhere || undefined,
      $group: `${src.muni}, ${src.depto}, anio`,
      $order: 'departamento, municipio, anio',
    });
    return rows;
  });
});

// 7c) Las demás categorías a nivel municipal (año vigente + histórico anual paginado). Todas las
// fuentes SIEDCO/DIJIN traen columna de municipio; antes solo se descargaban homicidio, extorsión y
// hurto, por lo que el detalle municipal quedaba "parcial" en 7 de las 10 categorías del dashboard.
// Nombres de archivo: municipios_<cat>.json y hist_municipio_<cat>.json (misma forma que 7/7b).
const MUNI_EXTRA_FILES = {
  municipios_secuestro: SRC.secuestro,
  municipios_amenazas: SRC.amenazas,
  municipios_sexuales: SRC.sexuales,
  municipios_lesiones: SRC.lesiones,
  municipios_violencia_intrafamiliar: SRC.violencia_intrafamiliar,
  municipios_terrorismo: SRC.terrorismo,
  municipios_estupefacientes: SRC.estupefacientes,
  municipios_feminicidio: SRC.feminicidio,
  municipios_capturas: SRC.capturas,
};
Object.entries(MUNI_EXTRA_FILES).forEach(([file, src]) => {
  addTask(file, async () => soqlAll(src.id, {
    $select: `${src.muni} as municipio, ${src.depto} as departamento, ${aggExpr(src)} as total`,
    $where: currentPeriodWhere(src, src.extraWhere),
    $group: `${src.muni}, ${src.depto}`,
    $order: 'departamento, municipio',
  }));
  addTask('hist_municipio_' + file.replace(/^municipios_/, ''), async () => soqlAll(src.id, {
    $select: `${src.muni} as municipio, ${src.depto} as departamento, ${yearExpr(src)} as anio, ${aggExpr(src)} as total`,
    $where: src.extraWhere || undefined,
    $group: `${src.muni}, ${src.depto}, anio`,
    $order: 'departamento, municipio, anio',
  }));
});

// 8) Delitos informáticos (Fiscalía / SPOA) -- dataset wxd8-ucns, ya pre-agregado (campo total_procesos)
const INF_ID = 'wxd8-ucns';
const INF_WHERE = "grupo_delito='DELITOS INFORMATICOS'";
addTask('hist_nacional_informaticos', async () => soql(INF_ID, {
  $select: 'a_o_hechos as anio, sum(total_procesos) as total',
  $where: INF_WHERE, $group: 'anio', $order: 'anio', $limit: 200,
}));
addTask('depto_informaticos', async () => soql(INF_ID, {
  $select: 'departamento_hecho as departamento, sum(total_procesos) as total',
  $where: INF_WHERE, $group: 'departamento_hecho', $limit: 100,
}));
addTask('tipos_informaticos', async () => soql(INF_ID, {
  $select: 'delito, sum(total_procesos) as total',
  $where: INF_WHERE, $group: 'delito', $order: 'total DESC', $limit: 100,
}));

// 9) Denuncias Fiscalía (SPOA): Conteo de Procesos V3 (dbdv-iihs) y Conteo de Víctimas V3 (hr73-zqjf)
// Datasets multimillonarios -> SIEMPRE agregados en servidor. Departamento = lugar de los hechos.
const PROC_ID = 'dbdv-iihs';
const VICT_ID = 'hr73-zqjf';
addTask('depto_spoa_procesos', async () => soql(PROC_ID, {
  $select: 'departamento_hecho as departamento, count(*) as total',
  $group: 'departamento_hecho', $limit: 100,
}));
addTask('hist_nacional_spoa_procesos', async () => soql(PROC_ID, {
  $select: 'a_o_hecho as anio, count(*) as total',
  $group: 'anio', $order: 'anio', $limit: 200,
}));
addTask('tipos_spoa_procesos', async () => soql(PROC_ID, {
  $select: 'titulo_delito as delito, count(*) as total',
  $group: 'titulo_delito', $order: 'total DESC', $limit: 100,
}));
addTask('depto_spoa_victimas', async () => soql(VICT_ID, {
  $select: 'departamento_hecho_origen as departamento, count(*) as total',
  $group: 'departamento_hecho_origen', $limit: 100,
}));
addTask('hist_nacional_spoa_victimas', async () => soql(VICT_ID, {
  $select: 'a_o_hecho_origen as anio, count(*) as total',
  $group: 'anio', $order: 'anio', $limit: 200,
}));

// 10) Personas desaparecidas -- Instituto Nacional de Medicina Legal, registro SIRDEC (8hqm-7fdt)
const DESAP_ID = '8hqm-7fdt';
const DESAP_WHERE = "estado_de_la_desaparicion='Desaparecido'";
addTask('depto_desaparecidos', async () => soql(DESAP_ID, {
  $select: 'departamento_donde_ocurre_la_desaparicion_dane as departamento, count(*) as total',
  $where: DESAP_WHERE, $group: 'departamento_donde_ocurre_la_desaparicion_dane', $limit: 100,
}));
addTask('hist_nacional_desaparecidos', async () => soql(DESAP_ID, {
  $select: 'a_o_de_la_desaparicion as anio, count(*) as total',
  $where: DESAP_WHERE, $group: 'anio', $order: 'anio', $limit: 200,
}));
addTask('desaparecidos_sexo', async () => soql(DESAP_ID, {
  $select: 'sexo_del_desaparecido as sexo, count(*) as total',
  $where: DESAP_WHERE, $group: 'sexo_del_desaparecido', $order: 'total DESC', $limit: 20,
}));

// 11) Homicidios Medicina Legal (INMLCF) para el hueco real de SIEDCO en Amazonas/Guainía/Vaupés
// -- ver ESTADO_SESION.md ("Ronda — Amazonía colombiana...") para el detalle completo de por qué
// hace falta esta fuente aparte. SIEDCO (Policía Nacional) NUNCA ha registrado, en toda su serie
// histórica (2003-2026), ni un solo hecho de homicidio/extorsión/hurto en 17 de los 26 municipios/
// corregimientos departamentales de estos 3 departamentos -- no es un hueco del periodo actual, es
// una ausencia total y sistemática (confirmado consultando m8fd-ahd9 sin filtro de año). Medicina
// Legal SÍ los desagrega, porque registra cada muerte violenta que dictamina sin importar cuán
// pequeño sea el municipio. Se usan las 2 fuentes oficiales de Medicina Legal en datos.gov.co:
// - vtub-3de2 "Presuntos Homicidios. Colombia, 2015 a 2024. Cifras definitivas"
// - 2kpj-cktv "Lesiones fatales de causa externa - Información preliminar - enero 2025 a junio 2026"
//   (aquí se filtra manera_de_muerte='1 Presuntos Homicidios'; el dataset también trae suicidios/
//   accidentes/tránsito, que no son parte del alcance de este proyecto)
// Alcance ACOTADO a los 3 departamentos (no se usa esta fuente para el resto del país -- allí SIEDCO
// ya tiene cobertura real y usar Medicina Legal ahí generaría doble conteo con distinta metodología
// de conteo de víctimas/hechos). merge.js solo usa estas filas para los municipios que SIEDCO deja
// totalmente vacíos; nunca sobrescribe un municipio que ya tiene fila real de SIEDCO.
const MEDLEGAL_DEPTOS_WHERE = "departamento_del_hecho_dane in('Amazonas','Guainía','Vaupés')";
addTask('medlegal_homicidio_amazonia_historico', async () => {
  const rows = await soql('vtub-3de2', {
    $select: 'departamento_del_hecho_dane as departamento, municipio_del_hecho_dane as municipio, codigo_dane_municipio as codigo_dane, a_o_del_hecho as anio, count(*) as total',
    $where: MEDLEGAL_DEPTOS_WHERE,
    $group: 'departamento, municipio, codigo_dane, anio',
    $limit: 2000,
  });
  return rows;
});
addTask('medlegal_homicidio_amazonia_preliminar', async () => {
  const rows = await soql('2kpj-cktv', {
    $select: 'departamento_del_hecho_dane as departamento, municipio_del_hecho_dane as municipio, codigo_dane_municipio as codigo_dane, a_o_del_hecho as anio, count(*) as total',
    $where: MEDLEGAL_DEPTOS_WHERE + " AND manera_de_muerte='1 Presuntos Homicidios'",
    $group: 'departamento, municipio, codigo_dane, anio',
    $limit: 2000,
  });
  return rows;
});

// 12) Resultados operacionales de la Fuerza Pública -- Ministerio de Defensa (Observatorio de DDHH y
// Defensa Nacional, "Información estadística desagregada"), publicados en datos.gov.co con corte
// mensual (último corte visto: 31-08-2026, publicado 16-09-2026; re-verificado en vivo 2026-09-28).
// Fuente primaria: Comando General FF.MM. + Policía Nacional. Cubren Ejército + Armada + FAC +
// Policía (a diferencia de kk69-w2jj, que es SOLO Policía). El total nacional por año cuadra al
// 0,00% con el XLSX oficial "Indicadores de seguridad y resultados operacionales" (MinDefensa).
// Ver investigacion/co-fuerza-publica/INFORME.md (§5, agregado 2025 por departamento).
// OJO 1: cocaína/marihuana/base incluyen incautaciones EN EL EXTERIOR por cooperación internacional
//   (filas con departamento = ECUADOR, PANAMA, ESPAÑA, AGUAS INTERNACIONALES...; cod_depto de 3+
//   dígitos). En 2025 fueron el 67% de la cocaína (658,6 t de 984,5 t). Para el mapa/territorio se
//   filtra length(cod_depto)=2; el total "oficial" MinDefensa se guarda aparte (hist_nacional_*_total).
// OJO 2: `cantidad` es kg (drogas), ha (erradicación), unidades (laboratorios), personas (afectación).
//   Es una MAGNITUD, se suma (no es count de filas). En 26zg-9p9r la columna `unidad` está rota
//   (repite la cantidad); el kg viene de la descripción del dataset y del cuadre con el XLSX.
// OJO 3: en nxbk-nikm (base de coca) `cod_muni` trae el NOMBRE del departamento en el 100% de filas
//   (verificado en vivo 2026-09-28: cod_muni='ANTIOQUIA', municipio='ITAGUI') -> el municipio se
//   agrupa por nombre (municipio + departamento), no por código DANE; merge.js lo cruza a DIVIPOLA.
// NO usar k2wp-tdv7 (insumos líquidos): 2025 suma 22,87 M gal vs 2,25 M gal oficiales (+918%).
// NO usar n997-hhiv (insumos sólidos): trae unidad GALON y parece copia de líquidos.
const FP_COL = "length(cod_depto)=2"; // solo territorio colombiano
const FP = {
  cocaina_kg:       { id: '26zg-9p9r', muniKey: 'cod_muni', colombia: true },
  marihuana_kg:     { id: 'g228-vp9d', muniKey: 'cod_muni', colombia: true },
  base_coca_kg:     { id: 'nxbk-nikm', muniKey: 'municipio', colombia: true },
  laboratorios:     { id: 's29y-2xjd', muniKey: 'cod_muni', colombia: true },
  erradicacion_ha:  { id: 'p72f-qcvk', muniKey: 'cod_muni', colombia: true, extraWhere: "tipo_de_cultivo='COCA'" },
  fp_asesinados:    { id: '8rpn-wpty', muniKey: 'cod_muni', colombia: true, extraWhere: "accion='ASESINADO'" },
  fp_heridos:       { id: '8rpn-wpty', muniKey: 'cod_muni', colombia: true, extraWhere: "accion='HERIDO'" },
};
Object.values(FP).forEach(s => { s.dateType = 'iso'; s.dateField = 'fecha_hecho'; });
function fpWhere(src, extra) {
  return [src.colombia ? FP_COL : null, src.extraWhere || null, extra || null].filter(Boolean).join(' AND ') || undefined;
}
Object.entries(FP).forEach(([name, src]) => {
  const muniSel = src.muniKey === 'cod_muni' ? 'cod_muni as codigo_dane, municipio, departamento' : 'municipio, departamento';
  const muniGroup = src.muniKey === 'cod_muni' ? 'cod_muni, municipio, departamento' : 'municipio, departamento';
  // Año vigente por departamento
  addTask('fp_' + name, async () => soql(src.id, {
    $select: 'departamento, sum(cantidad) as total',
    $where: fpWhere(src, currentPeriodWhere(src)),
    $group: 'departamento', $order: 'departamento', $limit: 100,
  }));
  // Histórico anual por departamento (2010-hoy; erradicación desde 2007)
  addTask('hist_depto_fp_' + name, async () => soqlAll(src.id, {
    $select: `departamento, ${yearExpr(src)} as anio, sum(cantidad) as total`,
    $where: fpWhere(src),
    $group: 'departamento, anio', $order: 'departamento, anio',
  }));
  // Histórico anual nacional (solo territorio colombiano)
  addTask('hist_nacional_fp_' + name, async () => soql(src.id, {
    $select: `${yearExpr(src)} as anio, sum(cantidad) as total`,
    $where: fpWhere(src), $group: 'anio', $order: 'anio', $limit: 200,
  }));
  // Municipios, año vigente e histórico anual (paginado: municipio x año supera el $limit único)
  addTask('municipios_fp_' + name, async () => soqlAll(src.id, {
    $select: `${muniSel}, sum(cantidad) as total`,
    $where: fpWhere(src, currentPeriodWhere(src)),
    $group: muniGroup, $order: muniGroup,
  }));
  addTask('hist_municipio_fp_' + name, async () => soqlAll(src.id, {
    $select: `${muniSel}, ${yearExpr(src)} as anio, sum(cantidad) as total`,
    $where: fpWhere(src),
    $group: `${muniGroup}, anio`, $order: `${muniGroup}, anio`,
  }));
});
// Total "oficial" MinDefensa (incluye exterior/cooperación internacional), para la ficha nacional.
// Si el mapa (territorio) y la cifra oficial no se muestran juntos, parecen contradictorios.
['cocaina_kg', 'marihuana_kg', 'base_coca_kg'].forEach(name => {
  const src = FP[name];
  addTask('hist_nacional_fp_' + name + '_total', async () => soql(src.id, {
    $select: `${yearExpr(src)} as anio, sum(cantidad) as total, sum(case(length(cod_depto)=2, cantidad, true, 0)) as colombia`,
    $group: 'anio', $order: 'anio', $limit: 200,
  }));
});

// 13) Sometidos / desmovilizados ELN / desvinculados menores (MinDefensa, GAHD). Campo de fecha
// `fecha` (Calendar date -> dateType 'iso'). Sometidos (xg7g-dzk4) no trae `cantidad`
// (1 fila = 1 persona -> count(*)); desmovilizados y desvinculados traen cantidad=1 por fila.
// Los tres traen cod_muni DIVIPOLA de 5 dígitos + municipio + departamento + grupo
// (verificado en vivo 2026-09-28).
const FP_PERSONAS = {
  sometidos:      { id: 'xg7g-dzk4', agg: 'count(*)' },
  desmovilizados: { id: '3pur-d5ez', agg: 'sum(cantidad)' },
  desvinculados:  { id: 'ajsa-ebuq', agg: 'sum(cantidad)' },
};
Object.values(FP_PERSONAS).forEach(s => { s.dateType = 'iso'; s.dateField = 'fecha'; });
Object.entries(FP_PERSONAS).forEach(([name, s]) => {
  addTask('hist_depto_fp_' + name, async () => soql(s.id, {
    $select: `departamento, date_extract_y(fecha) as anio, grupo, ${s.agg} as total`,
    $group: 'departamento, anio, grupo', $order: 'departamento, anio, grupo', $limit: 20000,
  }));
});
// 13b) Las mismas 3 series a nivel municipal (año vigente + histórico anual paginado). Mismo
// universo que 13 (sin filtro territorial: estas series no traen filas del exterior), para que
// la validación "suma municipal <= departamental" compare cifras homogéneas.
Object.entries(FP_PERSONAS).forEach(([name, s]) => {
  addTask('municipios_fp_' + name, async () => soqlAll(s.id, {
    $select: `cod_muni as codigo_dane, municipio, departamento, grupo, ${s.agg} as total`,
    $where: currentPeriodWhere(s),
    $group: 'codigo_dane, municipio, departamento, grupo',
    $order: 'codigo_dane, municipio, departamento, grupo',
  }));
  addTask('hist_municipio_fp_' + name, async () => soqlAll(s.id, {
    $select: `cod_muni as codigo_dane, municipio, departamento, date_extract_y(fecha) as anio, grupo, ${s.agg} as total`,
    $group: 'codigo_dane, municipio, departamento, anio, grupo',
    $order: 'codigo_dane, municipio, departamento, anio, grupo',
  }));
});

// 14) Armas de fuego incautadas -- DIJIN/Policía Nacional, 2iz5-9bbz (SOLO Policía, no FF.MM.).
// fecha_hecho texto DD/MM/AAAA (dateType 'text'); codigo_dane de 8 dígitos (5 DIVIPOLA + '000',
// verificado en vivo 2026-09-28: '25754000' Soacha, '11001000' Bogotá) -> se recorta a 5 en
// la consulta. municipio_hecho puede traer sufijo ' (CT)'. cantidad es texto -> ::number.
// 2025: 21.827 armas vs 21.826 del Informe de Gestión 2025 de la Policía (+0,005%).
const ARMAS = { id: '2iz5-9bbz', dateType: 'text', dateField: 'fecha_hecho' };
addTask('armas_incautadas', async () => soql(ARMAS.id, {
  $select: 'departamento, sum(cantidad::number) as total',
  $where: currentPeriodWhere(ARMAS), $group: 'departamento', $limit: 100,
}));
addTask('hist_depto_armas_incautadas', async () => soql(ARMAS.id, {
  $select: `departamento, ${yearExpr(ARMAS)} as anio, sum(cantidad::number) as total`,
  $group: 'departamento, anio', $order: 'departamento, anio', $limit: 5000,
}));
addTask('hist_nacional_armas_incautadas', async () => soql(ARMAS.id, {
  $select: `${yearExpr(ARMAS)} as anio, sum(cantidad::number) as total`,
  $group: 'anio', $order: 'anio', $limit: 200,
}));
addTask('municipios_armas_incautadas', async () => soqlAll(ARMAS.id, {
  $select: 'substring(codigo_dane,1,5) as codigo_dane, municipio_hecho as municipio, departamento, sum(cantidad::number) as total',
  $where: currentPeriodWhere(ARMAS),
  $group: 'codigo_dane, municipio, departamento', $order: 'codigo_dane, municipio, departamento',
}));
addTask('hist_municipio_armas_incautadas', async () => soqlAll(ARMAS.id, {
  $select: `substring(codigo_dane,1,5) as codigo_dane, municipio_hecho as municipio, departamento, ${yearExpr(ARMAS)} as anio, sum(cantidad::number) as total`,
  $group: 'codigo_dane, municipio, departamento, anio', $order: 'codigo_dane, municipio, departamento, anio',
}));
addTask('armas_incautadas_clase', async () => soql(ARMAS.id, {
  $select: 'clase_bien as label, sum(cantidad::number) as total',
  $where: currentPeriodWhere(ARMAS), $group: 'clase_bien', $order: 'total DESC', $limit: 50,
}));

// 15) Cultivos de coca (ha) por municipio -- ODC/MinJusticia con datos SIMCI-UNODC, acs4-3wgp
// (verificado en vivo 2026-09-28: 2001-2024, formato ancho). Una fila por municipio (319) y una
// columna por año (_2001.._2024, texto salvo _2020 number). Censo anual al 31-dic; el año N se
// publica ~jun-jul del año N+1 (2024 publicado en 2025; dataset actualizado 2026-07-08 y aún sin
// 2025). merge.js lo pivota a filas largas (ancho -> largo).
// 2024: 261.386 ha (UNODC/SIMCI publicó "261.000 ha"); Tumaco 31.300,41 ha; Tibú 25.911,23 ha.
addTask('cultivos_coca_municipio', async () => soqlAll('acs4-3wgp', {
  $order: 'codmpio',
}, { pageSize: 1000 }));

// 16) Hurto de vehículos y «otros hurtos» antes de 2010 (Ministerio de Defensa). Los reportes de la
// Policía para motos/autos (9vha-vh9n) y abigeato+entidades financieras+piratería (d4fr-sbn2) empiezan
// en 2010; el Ministerio publica los mismos registros desde 2003 en csb4-y6v2 (vehículos), p88b-5ac7
// (abigeato), i7h7-wmjc (entidades financieras) y sutf-7dyz (piratería terrestre), con la misma
// convención de nombres que hurto a personas/residencias/comercio. Verificado el 27-oct-2026: en 2010
// coinciden exactamente, también por departamento (21.456 vehículos; 1.373 + 69 + 416 = 1.858). Sin
// esto el hurto nacional 2003–2009 quedaba ~22 mil/año por debajo de la cifra oficial y la tendencia
// daba un salto falso en 2010. Solo se completan los años anteriores a 2010 que la Policía no trae;
// si en 2010 las dos fuentes dejan de coincidir (±1 %), la tarea falla y se conserva la publicación.
// Lesiones personales (72sg-cybi, sin las de tránsito) también empieza en 2010; el Ministerio publica
// la misma serie desde 2003 en jr6v-i33g, que ya excluye las de tránsito. Verificado el 27-oct-2026:
// 2010, 2011 y 2012 coinciden exacto en el total (53.141, 62.186, 82.183) y en los 33 departamentos.
const ANTES_2010 = {
  hurto: ['csb4-y6v2'],
  hurto_extra: ['p88b-5ac7', 'i7h7-wmjc', 'sutf-7dyz'],
  lesiones: ['jr6v-i33g'],
};
const ANIO_SOLAPE = 2010;
const COMPLEMENTO_ANTES_2010 = {
  hist_nacional_hurto: ['hurto', []],
  hist_depto_hurto: ['hurto', ['departamento']],
  hist_municipio_hurto_vehiculos: ['hurto', ['municipio', 'departamento']],
  hist_nacional_hurto_extra: ['hurto_extra', []],
  hist_depto_hurto_extra: ['hurto_extra', ['departamento']],
  hist_municipio_hurto_extra: ['hurto_extra', ['municipio', 'departamento']],
  hist_nacional_lesiones: ['lesiones', []],
  hist_depto_lesiones: ['lesiones', ['departamento']],
  hist_municipio_lesiones: ['lesiones', ['municipio', 'departamento']],
};

// Puras (probadas sin red en test_co_fuentes_mindefensa.js).
function sumarPorClave(filas, campos) {
  const acc = new Map();
  for (const r of filas) {
    const k = [...campos.map(c => r[c]), String(r.anio)].join('\u0000');
    const prev = acc.get(k);
    if (prev) prev.total += Number(r.total) || 0;
    else acc.set(k, { ...Object.fromEntries(campos.map(c => [c, r[c]])), anio: String(r.anio), total: Number(r.total) || 0 });
  }
  return [...acc.values()].map(r => ({ ...r, total: String(r.total) }));
}
function totalDelAnio(filas, anio) {
  return filas.filter(r => Number(r.anio) === anio).reduce((s, r) => s + (Number(r.total) || 0), 0);
}
function verificarSolape(policia, ministerio, anio = ANIO_SOLAPE, fuente = 'serie') {
  const a = totalDelAnio(policia, anio), b = totalDelAnio(ministerio, anio);
  if (!a || !b || Math.abs(a - b) / Math.max(a, b) > 0.01) {
    throw new Error(`${fuente} antes de ${anio}: Policía (${a}) y Ministerio (${b}) ya no coinciden en ${anio}; revisar antes de completar`);
  }
}
function completarAntesDe(policia, ministerio, campos, anio = ANIO_SOLAPE) {
  const presentes = new Set(policia.map(r => String(r.anio)));
  const extra = sumarPorClave(ministerio.filter(r => Number(r.anio) < anio && !presentes.has(String(r.anio))), campos);
  return [...policia, ...extra];
}

async function filasMinDefensa(ids, campos, where) {
  const filas = [];
  for (const id of ids) {
    const grupo = [...campos, 'anio'].join(', ');
    filas.push(...await soqlAll(id, {
      $select: [...campos, 'date_extract_y(fecha_hecho) as anio', 'sum(cantidad::number) as total'].join(', '),
      $where: where,
      $group: grupo,
      $order: grupo,
    }));
  }
  return filas;
}

tasks.forEach(t => {
  const conf = COMPLEMENTO_ANTES_2010[t.name];
  if (!conf) return;
  const [fuente, campos] = conf;
  const original = t.fn;
  t.fn = async () => {
    const policia = await original();
    const ids = ANTES_2010[fuente];
    const solape = await filasMinDefensa(ids, [], `date_extract_y(fecha_hecho)=${ANIO_SOLAPE}`);
    verificarSolape(policia, solape, ANIO_SOLAPE, fuente);
    const previos = await filasMinDefensa(ids, campos, `fecha_hecho < '${ANIO_SOLAPE}-01-01T00:00:00'`);
    return completarAntesDe(policia, previos, campos);
  };
});

// -------- Ejecución (secuencial, con pequeño delay para no saturar la API pública) --------
async function main() {
  // CRIMENAI_ONLY=patron1,patron2 ejecuta solo las tareas cuyo nombre contiene alguno de los patrones
  // (útil para regenerar una fuente sin volver a descargar las ~100).
  const only = (process.env.CRIMENAI_ONLY || '').split(',').map(x => x.trim()).filter(Boolean);
  if (only.length) tasks.splice(0, tasks.length, ...tasks.filter(t => only.some(p => t.name.includes(p))));
  console.log(`Descargando ${tasks.length} fuentes crudas para ${CURRENT_YEAR} desde datos.gov.co (Socrata)...`);
  for (const t of tasks) {
    try {
      const rows = await t.fn();
      save(t.name, rows);
    } catch (e) {
      failCount++;
      failures.push(t.name + ': ' + e.message);
      console.error('  FALLÓ ' + t.name + ': ' + e.message);
    }
    await sleep(120); // cortesía con la API pública, evita 429
  }
  console.log('\nResumen: ' + okCount + ' OK, ' + failCount + ' fallidas de ' + tasks.length + ' fuentes.');
  if (failures.length) {
    console.log('Fuentes fallidas (se conserva la publicación anterior):');
    failures.forEach(f => console.log('  - ' + f));
  }
  // Una fuente ausente puede dejar totales plausibles pero incompletos. Conservamos la
  // publicación anterior hasta que todas las descargas terminen correctamente.
  if (failCount) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { soqlAll, main, SRC, ANTES_2010, COMPLEMENTO_ANTES_2010, sumarPorClave, verificarSolape, completarAntesDe };
