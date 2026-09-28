// Pruebas de la familia "Fuerza pública y drogas" (tarea co-fuerza-publica-impl).
// Uso: node data/test_fuerza_publica.js   (las ejecuta el orquestador; solo módulos nativos).
// Cubre: constructores puros de merge.js con fixtures (pivot ancho->largo, agregados,
// DIVIPOLA, series por grupo), contrato estático de fetch_raw.js (tareas/IDs/paginación) y
// el validador de punta a punta (fixtures sintéticas buenas y corruptas).
const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = __dirname;
const { CURRENT_YEAR } = require('./pipeline_config');

// merge.js corre su fusión completa al requerirse (con crudos ausentes produce ceros y NO
// escribe nada gracias al guard require.main). Se silencia su consola para no ensuciar el TAP.
const origLog = console.log;
const origErr = console.error;
console.log = () => {};
console.error = () => {};
let merge;
try {
  merge = require('./merge.js');
} finally {
  console.log = origLog;
  console.error = origErr;
}

let passed = 0;
function t(name, fn) {
  try {
    fn();
    passed++;
    console.log('ok - ' + name);
  } catch (e) {
    console.error('FALLO - ' + name + ': ' + (e && e.message));
    process.exitCode = 1;
  }
}

// ---------- U: constructores puros ----------

t('U1 pivot ancho->largo de cultivos (texto y _2020 number)', () => {
  const rows = [{
    coddepto: '52', departamento: 'Nariño', codmpio: '52835', municipio: 'Tumaco',
    _2023: '30000.5', _2024: '31300.41', _2020: 25000, _2001: '',
  }];
  const long = merge.fpPivotCultivosCoca(rows);
  assert.strictEqual(long.length, 3);
  const y2024 = long.find(r => r.anio === '2024');
  assert.deepStrictEqual(y2024, { municipio: 'Tumaco', divipola: '52835', departamento: 'NARINO', anio: '2024', total: 31300.41 });
  const y2020 = long.find(r => r.anio === '2020');
  assert.strictEqual(y2020.total, 25000);
});

t('U2 pivot omite vacías/no-numéricas/depto desconocido', () => {
  const rows = [
    { departamento: 'Nariño', codmpio: '52835', municipio: 'Tumaco', _2024: 'abc', _2023: null },
    { departamento: 'ECUADOR', codmpio: '21801', municipio: 'QUITO', _2024: '10' },
    { departamento: 'Nariño', codmpio: '52835', municipio: '', _2024: '10' },
  ];
  assert.strictEqual(merge.fpPivotCultivosCoca(rows).length, 0);
});

t('U3 actual por departamento normaliza y descarta exterior', () => {
  const out = merge.fpActualPorDepto([
    { departamento: 'Bogotá D.C.', total: '10' },
    { departamento: 'BOGOTA', total: 5 },
    { departamento: 'ECUADOR', total: 999 },
    { departamento: 'VALLE DEL CAUCA', total: '7.5' },
  ]);
  assert.strictEqual(out.BOGOTA, 15);
  assert.strictEqual(out.VALLE, 7.5);
  assert.strictEqual(out.ECUADOR, undefined);
});

t('U4 histórico nacional ordena y suma duplicados', () => {
  const out = merge.fpHistoricoNacional([
    { anio: '2025', total: '100.5' }, { anio: 2024, total: 50 }, { anio: '2025', total: 1 },
  ]);
  assert.deepStrictEqual(out, [{ anio: '2024', total: 50 }, { anio: '2025', total: 101.5 }]);
});

t('U5 histórico departamental cubre las 33 llaves', () => {
  const out = merge.fpHistoricoDepartamental([{ departamento: 'Nariño', anio: '2025', total: '3' }]);
  assert.strictEqual(Object.keys(out).length, 33);
  assert.strictEqual(out.NARINO['2025'], 3);
  assert.deepStrictEqual(out.VALLE, {});
});

t('U6 municipal: DIVIPOLA 8->5, sufijo (CT), suma duplicados', () => {
  const out = merge.fpActualPorMunicipio([
    { codigo_dane: '25754000', municipio: 'Soacha', departamento: 'Cundinamarca', total: '2' },
    { codigo_dane: '25754', municipio: 'Soacha', departamento: 'CUNDINAMARCA', total: 3 },
    { codigo_dane: '11001000', municipio: 'Bogotá D.C. (CT)', departamento: 'Bogota', total: '1' },
    { codigo_dane: '99999', municipio: '', departamento: 'Cundinamarca', total: 9 },
  ]);
  assert.strictEqual(out.CUNDINAMARCA.length, 1);
  assert.deepStrictEqual(out.CUNDINAMARCA[0], { municipio: 'Soacha', divipola: '25754', total: 5 });
  assert.deepStrictEqual(out.BOGOTA[0], { municipio: 'Bogotá D.C.', divipola: '11001', total: 1 });
});

t('U7 histórico municipal usa llave MUNI|DEPTO', () => {
  const out = merge.fpHistoricoMunicipal([
    { municipio: 'Ocaña', departamento: 'Norte de Santander', anio: '2025', total: '2' },
    { municipio: 'OCAÑA', departamento: 'NORTE DE SANTANDER', anio: '2025', total: 1 },
  ]);
  assert.deepStrictEqual(out, { 'OCANA|NORTE DE SANTANDER': { '2025': 3 } });
});

t('U8 personas por grupo + actual del año vigente', () => {
  const rows = [
    { departamento: 'Antioquia', anio: String(CURRENT_YEAR), grupo: 'GAOR', total: 4 },
    { departamento: 'Antioquia', anio: String(CURRENT_YEAR), grupo: 'CLAN DEL GOLFO', total: 2 },
    { departamento: 'Antioquia', anio: '2020', grupo: 'GAOR', total: 1 },
  ];
  const porGrupo = merge.fpPersonasPorGrupo(rows);
  assert.strictEqual(porGrupo.ANTIOQUIA[String(CURRENT_YEAR)].GAOR, 4);
  assert.strictEqual(porGrupo.ANTIOQUIA[String(CURRENT_YEAR)]['CLAN DEL GOLFO'], 2);
  assert.strictEqual(merge.fpPersonasActualPorDepto(rows).ANTIOQUIA, 6);
  assert.strictEqual(merge.fpHistoricoNacional(rows).find(r => r.anio === String(CURRENT_YEAR)).total, 6);
});

t('U9 bordes de fpNum/fpDivipola/fpNombreMunicipio', () => {
  assert.strictEqual(merge.fpNum('0.0682'), 0.0682);
  assert.strictEqual(merge.fpNum('no-num'), 0);
  assert.strictEqual(merge.fpNum(null), 0);
  assert.strictEqual(merge.fpDivipola('18592'), '18592');
  assert.strictEqual(merge.fpDivipola('25754000'), '25754');
  assert.strictEqual(merge.fpDivipola(null), null);
  assert.strictEqual(merge.fpNombreMunicipio('Bogotá D.C. (CT)'), 'Bogotá D.C.');
  assert.strictEqual(merge.fpNombreMunicipio(null), '');
});

t('U10 FP_METRICAS: 12 métricas con metadatos e IDs esperados', () => {
  const ids = {
    cocaina_kg: '26zg-9p9r', marihuana_kg: 'g228-vp9d', base_coca_kg: 'nxbk-nikm',
    laboratorios: 's29y-2xjd', erradicacion_ha: 'p72f-qcvk', fp_asesinados: '8rpn-wpty',
    fp_heridos: '8rpn-wpty', sometidos: 'xg7g-dzk4', desmovilizados: '3pur-d5ez',
    desvinculados: 'ajsa-ebuq', armas_incautadas: '2iz5-9bbz', cultivos_coca_ha: 'acs4-3wgp',
  };
  assert.deepStrictEqual(Object.keys(merge.FP_METRICAS).sort(), Object.keys(ids).sort());
  Object.entries(ids).forEach(([k, id]) => {
    const m = merge.FP_METRICAS[k];
    assert.strictEqual(m.datasetId, id, k);
    assert.ok(['kg', 'ha', 'und', 'personas'].includes(m.unidad), k);
    assert.ok(m.fuente && m.nota, k);
  });
});

// ---------- S: contrato estático de fetch_raw.js ----------

t('S1 fetch_raw registra las 53 tareas FP con sus IDs y paginación', () => {
  const src = fs.readFileSync(path.join(DIR, 'fetch_raw.js'), 'utf8');
  const mags = ['cocaina_kg', 'marihuana_kg', 'base_coca_kg', 'laboratorios', 'erradicacion_ha', 'fp_asesinados', 'fp_heridos'];
  mags.forEach(n => {
    assert.ok(src.includes(`'fp_' + name`), n);
  });
  ['cocaina_kg', 'marihuana_kg', 'base_coca_kg'].forEach(n => {
    assert.ok(src.includes("'hist_nacional_fp_' + name + '_total'"), n);
  });
  ['sometidos', 'desmovilizados', 'desvinculados'].forEach(n => {
    assert.ok(src.includes("'hist_depto_fp_' + name"), n);
    assert.ok(src.includes("'municipios_fp_' + name"), n);
    assert.ok(src.includes("'hist_municipio_fp_' + name"), n);
  });
  ['armas_incautadas', 'hist_depto_armas_incautadas', 'hist_nacional_armas_incautadas',
   'municipios_armas_incautadas', 'hist_municipio_armas_incautadas', 'armas_incautadas_clase',
   'cultivos_coca_municipio'].forEach(n => {
    assert.ok(src.includes(`addTask('${n}'`), n);
  });
  ['26zg-9p9r', 'g228-vp9d', 'nxbk-nikm', 's29y-2xjd', 'p72f-qcvk', '8rpn-wpty',
   'xg7g-dzk4', '3pur-d5ez', 'ajsa-ebuq', '2iz5-9bbz', 'acs4-3wgp'].forEach(id => {
    assert.ok(src.includes(`'${id}'`), id);
  });
  assert.ok(src.includes('length(cod_depto)=2'), 'filtro territorio');
  assert.ok(src.includes("addTask('municipios_fp_' + name, async () => soqlAll(src.id"), 'paginación muni FP');
  assert.ok(src.includes("addTask('hist_municipio_fp_' + name, async () => soqlAll(src.id"), 'paginación hist muni FP');
  assert.ok(src.includes("addTask('municipios_fp_' + name, async () => soqlAll(s.id"), 'paginación muni personas');
  assert.ok(src.includes("addTask('hist_municipio_fp_' + name, async () => soqlAll(s.id"), 'paginación hist muni personas');
  assert.ok(src.includes("addTask('municipios_armas_incautadas', async () => soqlAll(ARMAS.id"), 'paginación muni armas');
  assert.ok(src.includes("addTask('hist_municipio_armas_incautadas', async () => soqlAll(ARMAS.id"), 'paginación hist muni armas');
  assert.ok(src.includes("addTask('cultivos_coca_municipio', async () => soqlAll('acs4-3wgp'"), 'cultivos');
});

t('S2 merge expone overlaysFuerzaPublica con las 12 métricas', () => {
  assert.ok(merge.overlaysFuerzaPublica, 'existe el bloque');
  assert.deepStrictEqual(Object.keys(merge.overlaysFuerzaPublica).sort(), Object.keys(merge.FP_METRICAS).sort());
  const src = fs.readFileSync(path.join(DIR, 'merge.js'), 'utf8');
  assert.ok(src.includes('overlaysFuerzaPublica,'), 'llave en output');
});

// ---------- V: validador de punta a punta ----------

function fixtureBase() {
  const deptos = ['NARINO', 'VALLE', 'ANTIOQUIA'].concat(
    Array.from({ length: 30 }, (_, i) => 'DEPTO' + String(i).padStart(2, '0')));
  const departamentos = deptos.map(key => ({ key, homicidios: 0, total: 0 }));
  const municipiosDetalle = {};
  let n = 0;
  deptos.forEach(key => { municipiosDetalle[key] = []; });
  for (let i = 0; i < 1123; i++) {
    const key = deptos[i % deptos.length];
    municipiosDetalle[key].push({
      municipio: 'M' + i, divipola: String(10000 + i), total: 0, homicidios: 0,
      estadoDatos: { homicidios: 'no_reportado' }, estadoCobertura: 'no_reportado',
    });
    n++;
  }
  assert.strictEqual(n, 1123);
  const fpVacio = (unidad, datasetId) => ({
    unidad, fuente: 'F', datasetId, nota: 'N',
    actualPorDepartamento: {}, historicoNacional: [], historicoDepartamental: {},
    actualPorMunicipio: {}, historicoMunicipal: {},
  });
  return {
    meta: { periodoActual: `Año ${CURRENT_YEAR} (YTD)` },
    categorias: ['homicidios'],
    totales: { homicidios: 0, total: 0 },
    departamentos,
    historicoNacional: { homicidios: [{ anio: String(CURRENT_YEAR), total: 0 }] },
    historicoMunicipal: { homicidios: { 'M0|NARINO': { [String(CURRENT_YEAR)]: 0 } } },
    municipiosDetalle,
    overlaysFuerzaPublica: {
      cocaina_kg: {
        unidad: 'kg', fuente: 'MinDefensa', datasetId: '26zg-9p9r', nota: 'N',
        actualPorDepartamento: { NARINO: 100.5 },
        historicoNacional: [{ anio: '2025', total: 200 }],
        historicoDepartamental: { NARINO: { '2025': 120 }, VALLE: { '2025': 80 } },
        historicoNacionalTotal: [{ anio: '2025', total: 300, colombia: 200 }],
        actualPorMunicipio: { NARINO: [{ municipio: 'Tumaco', divipola: '52835', total: 100.5 }] },
        historicoMunicipal: { 'TUMACO|NARINO': { '2025': 200 } },
      },
      marihuana_kg: fpVacio('kg', 'g228-vp9d'),
      base_coca_kg: fpVacio('kg', 'nxbk-nikm'),
      laboratorios: fpVacio('und', 's29y-2xjd'),
      erradicacion_ha: fpVacio('ha', 'p72f-qcvk'),
      fp_asesinados: fpVacio('personas', '8rpn-wpty'),
      fp_heridos: fpVacio('personas', '8rpn-wpty'),
      sometidos: fpVacio('personas', 'xg7g-dzk4'),
      desmovilizados: fpVacio('personas', '3pur-d5ez'),
      desvinculados: fpVacio('personas', 'ajsa-ebuq'),
      armas_incautadas: fpVacio('und', '2iz5-9bbz'),
      cultivos_coca_ha: fpVacio('ha', 'acs4-3wgp'),
    },
  };
}

function ejecutaValidador(data) {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fp-test-')), 'colombia_crimen.json');
  fs.writeFileSync(tmp, JSON.stringify(data));
  try {
    execFileSync(process.execPath, [path.join(DIR, 'validate_output.js'), tmp], { stdio: 'pipe' });
    return 0;
  } catch (e) {
    return e.status || 1;
  }
}

t('V1 validador acepta fixture FP consistente', () => {
  assert.strictEqual(ejecutaValidador(fixtureBase()), 0);
});

t('V2 validador rechaza suma municipal > departamental', () => {
  const d = fixtureBase();
  d.overlaysFuerzaPublica.cocaina_kg.actualPorMunicipio.NARINO[0].total = 150;
  assert.notStrictEqual(ejecutaValidador(d), 0);
});

t('V3 validador rechaza nacional != suma de deptos', () => {
  const d = fixtureBase();
  d.overlaysFuerzaPublica.cocaina_kg.historicoNacional[0].total = 150;
  assert.notStrictEqual(ejecutaValidador(d), 0);
});

t('V4 validador rechaza métrica sin unidad', () => {
  const d = fixtureBase();
  delete d.overlaysFuerzaPublica.armas_incautadas.unidad;
  assert.notStrictEqual(ejecutaValidador(d), 0);
});

t('V5 validador rechaza overlay sumado al total', () => {
  const d = fixtureBase();
  d.totales.cocaina_kg = 1;
  assert.notStrictEqual(ejecutaValidador(d), 0);
});

if (process.exitCode) console.error(`\nFALLARON pruebas (ver arriba).`);
else console.log(`\nTodas las pruebas pasaron (${passed}).`);
