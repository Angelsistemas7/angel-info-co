// Descarga/regenera TODOS los JSON crudos que data/merge.js y data/patch_fiscalia_ubpd.js esperan,
// usando consultas SoQL agregadas (SELECT ... GROUP BY) directamente contra la API de Socrata
// (datos.gov.co), sin descargar nunca registros crudos completos (algunos datasets superan
// los 20 millones de filas). Requiere Node 18+ (usa fetch nativo). Sin dependencias npm.
//
// Uso:  node data/fetch_raw.js
// Salida: escribe ~50 archivos *.json en data/ (mismo formato/nombre que espera merge.js).
// Si una fuente falla (red, dataset caído, cambio de esquema), se loguea un warning y se sigue
// con las demás — nunca se aborta el proceso completo por una sola fuente.

const fs = require('fs');
const path = __dirname;

const BASE = 'https://www.datos.gov.co/resource/';
const CURRENT_YEARS = ['2025', '2026']; // periodo "actual" del dashboard (ver README/merge.js)

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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Cada fuente SIEDCO (Policía Nacional) tiene un formato de fecha distinto en `fecha_hecho`:
// "iso"  -> timestamp real (2026-05-25T00:00:00.000), se puede usar date_extract_y().
// "text" -> texto libre "DD/MM/AAAA", hay que extraer el año con substring(campo,7,4).
function yearExpr(src) {
  return src.dateType === 'iso' ? `date_extract_y(${src.dateField})` : `substring(${src.dateField},7,4)`;
}
function yearEquals(src, year) {
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
  hurto_extra: { id: 'd4fr-sbn2', dateType: 'text', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad' }, // abigeato+financiero+pirateria
  sexuales: { id: 'fpe5-yrmw', dateType: 'text', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad', delito: 'delito', genero: 'genero', grupo_etario: 'grupo_etario' },
  violencia_intrafamiliar: { id: 'vuyt-mqpw', dateType: 'text', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad', genero: 'genero', grupo_etario: 'grupo_etario' },
  amenazas: { id: 'meew-mguv', dateType: 'text', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad' },
  lesiones: { id: '72sg-cybi', dateType: 'text', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad' },
  terrorismo: { id: '37p5-impc', dateType: 'text', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad' },
  estupefacientes: { id: 'kk69-w2jj', dateType: 'text', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad', clase_bien: 'clase_bien', aggType: 'count' },
  feminicidio: { id: 'm8fd-ahd9', dateType: 'iso', dateField: 'fecha_hecho', depto: 'departamento', muni: 'municipio', cant: 'cantidad', extraWhere: "spoa_caracterizacion='FEMINICIDIO'" },
};

// -------- Tareas: cada una produce un archivo data/<nombre>.json --------
const tasks = [];

function addTask(name, fn) { tasks.push({ name, fn }); }

// 1) Periodo actual (2025-2026) por departamento -- 11 archivos usados por applyCurrentPeriod()
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
  feminicidio_actual: SRC.feminicidio,
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
  hurto_residencias: SRC.hurto_residencias, hurto: SRC.hurto, hurto_extra: SRC.hurto_extra,
  violencia_intrafamiliar: SRC.violencia_intrafamiliar, terrorismo: SRC.terrorismo,
  estupefacientes: SRC.estupefacientes, feminicidio: SRC.feminicidio,
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

// 5) Top municipios (periodo actual 2025-2026), top 15
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

// 6) Desgloses demográficos / por modalidad (periodo actual 2025-2026)
addTask('homicidio_arma', () => breakdown(SRC.homicidio, 'arma_medio', 'label'));
addTask('homicidio_sexo', () => breakdown(SRC.homicidio, 'sexo', 'label'));
addTask('homicidio_modalidad', () => breakdown(SRC.homicidio, '_modalidad_presunta', 'label'));
addTask('sexuales_delito', () => breakdown(SRC.sexuales, 'delito', 'label'));
addTask('sexuales_genero', () => breakdown(SRC.sexuales, 'genero', 'label'));
addTask('sexuales_grupo_etario', () => breakdown(SRC.sexuales, 'grupo_etario', 'label'));
addTask('vif_genero', () => breakdown(SRC.violencia_intrafamiliar, 'genero', 'label'));
addTask('vif_grupo_etario', () => breakdown(SRC.violencia_intrafamiliar, 'grupo_etario', 'label'));
addTask('secuestro_tipo', () => breakdown(SRC.secuestro, 'tipo_delito', 'label'));
addTask('estupefacientes_tipo', () => breakdown(SRC.estupefacientes, 'clase_bien', 'label'));

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

// 7) Municipios completos, TODOS los 33 departamentos (homicidio, extorsion, hurto=4 subfuentes),
// periodo actual 2025-2026. Alimenta municipiosDetalle en merge.js (~1.122 municipios).
// hurto se compone de las mismas 4 subfuentes que HURTO_SUBFUENTES en merge.js (personas,
// residencias, vehículos, abigeato+financiero+pirateria) para ser consistente con el total
// nacional de "hurto" del resto del dashboard.
const MUNI_NACIONAL_FILES = {
  municipios_homicidio: SRC.homicidio,
  municipios_extorsion: SRC.extorsion,
  municipios_hurto_personas: SRC.hurto_personas,
  municipios_hurto_residencias: SRC.hurto_residencias,
  municipios_hurto_vehiculos: SRC.hurto,
  municipios_hurto_extra: SRC.hurto_extra,
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
// municipio. $limit alto porque son hasta ~1.122 municipios x ~24 años.
Object.entries(MUNI_NACIONAL_FILES).forEach(([file, src]) => {
  addTask('hist_municipio_' + file.replace(/^municipios_/, ''), async () => {
    const rows = await soql(src.id, {
      $select: `${src.muni} as municipio, ${src.depto} as departamento, ${yearExpr(src)} as anio, ${aggExpr(src)} as total`,
      $where: src.extraWhere || undefined,
      $group: `${src.muni}, ${src.depto}, anio`,
      $limit: 20000,
    });
    return rows;
  });
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

// -------- Ejecución (secuencial, con pequeño delay para no saturar la API pública) --------
async function main() {
  console.log(`Descargando ${tasks.length} fuentes crudas desde datos.gov.co (Socrata)...`);
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
    console.log('Fuentes fallidas (se usarán datos vacíos/parciales para esos archivos en merge.js):');
    failures.forEach(f => console.log('  - ' + f));
  }
  // No exit(1) aquí: un fallo parcial no debe tumbar el workflow; merge.js decide si el total
  // agregado final es razonable y aborta él mismo si no lo es.
}

main();
