const fs = require('fs');
const path = require('path');
const { CURRENT_YEAR } = require('./pipeline_config');

const input = process.argv[2] || path.join(__dirname, 'colombia_crimen.json');
const data = JSON.parse(fs.readFileSync(input, 'utf8'));
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

check(Array.isArray(data.departamentos) && data.departamentos.length === 33,
  `se esperaban 33 departamentos; llegaron ${data.departamentos && data.departamentos.length}`);
check(String(data.meta && data.meta.periodoActual).includes(String(CURRENT_YEAR)),
  `periodoActual no identifica ${CURRENT_YEAR}: ${data.meta && data.meta.periodoActual}`);

const municipalities = Object.values(data.municipiosDetalle || {}).flat();
const municipalityCodes = municipalities.map(row => row.divipola).filter(Boolean);
check(municipalities.length === 1123, `se esperaban 1.123 municipios DANE; llegaron ${municipalities.length}`);
check(new Set(municipalityCodes).size === 1123, `DIVIPOLA únicos=${new Set(municipalityCodes).size}`);
check(municipalities.every(row => row.estadoDatos && row.estadoCobertura),
  'hay municipios sin estadoDatos/estadoCobertura');

for (const category of data.categorias || []) {
  const departmentTotal = data.departamentos.reduce((sum, department) => sum + (Number(department[category]) || 0), 0);
  check(departmentTotal === data.totales[category],
    `${category}: departamentos=${departmentTotal}, total=${data.totales[category]}`);

  const currentHistory = (data.historicoNacional[category] || [])
    .find(row => String(row.anio) === String(CURRENT_YEAR));
  check(currentHistory, `${category}: falta histórico nacional ${CURRENT_YEAR}`);
  if (currentHistory) {
    check(Number(currentHistory.total) === Number(data.totales[category]),
      `${category}: actual=${data.totales[category]}, histórico ${CURRENT_YEAR}=${currentHistory.total}`);
  }
}

// Conciliación municipio <-> departamento por categoría municipal: la suma municipal no puede superar el
// total departamental salvo el relleno forense de Medicina Legal (homicidios en la Amazonía).
for (const category of Object.keys(data.historicoMunicipal || {})) {
  for (const department of data.departamentos) {
    const munis = (data.municipiosDetalle || {})[department.key] || [];
    const siedco = munis.filter(m => !m.fuenteHomicidios).reduce((sum, m) => sum + (Number(m[category]) || 0), 0);
    check(siedco <= (Number(department[category]) || 0),
      `${category} ${department.key}: municipios=${siedco} > departamento=${department[category]}`);
  }
}

const coreTotal = (data.categorias || []).reduce((sum, category) => sum + (Number(data.totales[category]) || 0), 0);
check(coreTotal === data.totales.total, `total=${data.totales.total}, suma categorías=${coreTotal}`);

for (const [category, rowsByMunicipality] of Object.entries(data.historicoMunicipal || {})) {
  check(Object.keys(rowsByMunicipality).length > 0, `${category}: histórico municipal vacío`);
}

// Fuerza pública y drogas (overlaysFuerzaPublica): conciliación municipal/departamental/nacional.
// - Suma municipal (año vigente) <= total departamental, por departamento y métrica.
// - Histórico nacional (cada año) = suma de departamentos ese año (tolerancia float: kg con decimales).
// - Cada métrica trae metadatos completos (fuente, datasetId, unidad, nota).
// Los overlays nunca entran en `totales` ni en `categorias` (no suman al Índice).
check(data.overlaysFuerzaPublica && typeof data.overlaysFuerzaPublica === 'object',
  'falta overlaysFuerzaPublica (familia Fuerza pública y drogas)');
const FP_EPS_REL = 1e-6;
function fpCerca(a, b) {
  return Math.abs(a - b) <= FP_EPS_REL * Math.max(1, Math.abs(a), Math.abs(b));
}
const FP_METRICAS_ESPERADAS = ['cocaina_kg', 'marihuana_kg', 'base_coca_kg', 'laboratorios',
  'erradicacion_ha', 'fp_asesinados', 'fp_heridos', 'sometidos', 'desmovilizados',
  'desvinculados', 'armas_incautadas', 'cultivos_coca_ha'];
FP_METRICAS_ESPERADAS.forEach(m => {
  const b = (data.overlaysFuerzaPublica || {})[m];
  check(b && typeof b === 'object', `overlaysFuerzaPublica.${m}: falta el bloque`);
  if (!b) return;
  check(typeof b.unidad === 'string' && b.unidad.length > 0, `overlaysFuerzaPublica.${m}: falta unidad explícita`);
  check(typeof b.fuente === 'string' && b.fuente.length > 0, `overlaysFuerzaPublica.${m}: falta fuente`);
  check(typeof b.datasetId === 'string' && b.datasetId.length > 0, `overlaysFuerzaPublica.${m}: falta datasetId`);
  check(typeof b.nota === 'string' && b.nota.length > 0, `overlaysFuerzaPublica.${m}: falta nota`);
  check(!b.unidad || ['kg', 'ha', 'und', 'personas'].includes(b.unidad),
    `overlaysFuerzaPublica.${m}: unidad inesperada ${b.unidad}`);
  const dep = b.actualPorDepartamento || {};
  Object.entries(b.actualPorMunicipio || {}).forEach(([dk, munis]) => {
    const suma = munis.reduce((s, x) => s + (Number(x.total) || 0), 0);
    const techo = Number(dep[dk]) || 0;
    check(suma <= techo + FP_EPS_REL * Math.max(1, Math.abs(techo)),
      `${m} ${dk}: municipios=${suma} > departamento=${dep[dk]}`);
    munis.forEach(x => {
      check(x.municipio, `${m} ${dk}: fila municipal sin nombre`);
    });
  });
  const histDep = b.historicoDepartamental || {};
  (b.historicoNacional || []).forEach(({ anio, total }) => {
    const suma = Object.values(histDep).reduce((st, porAnio) => st + (Number(porAnio[anio]) || 0), 0);
    if (suma !== 0 || Number(total) !== 0) {
      // En las series de personas MinDefensa hay registros aislados sin departamento (desvinculados:
      // 1 persona en 2009 y en 2018): cuentan en el nacional pero no en ningún depto. Se tolera que el
      // nacional supere a la suma por <=0,5 % (mín. 1); nunca que la suma supere al nacional.
      const nac = Number(total);
      const sinDepto = nac - suma;
      check(fpCerca(suma, nac) || (sinDepto > 0 && sinDepto <= Math.max(1, 0.005 * nac)),
        `${m} ${anio}: nacional=${total}, suma deptos=${suma}`);
    }
  });
});
check(!(data.totales && FP_METRICAS_ESPERADAS.some(m => data.totales[m] !== undefined)),
  'un overlay de fuerza pública suma al total nacional (debe ser overlay, no categoría)');
if (failures.length) {
  console.error('VALIDACIÓN FALLIDA:');
  failures.forEach(message => console.error(' - ' + message));
  process.exit(1);
}

console.log(`VALIDACIÓN OK: ${data.departamentos.length} departamentos, ${CURRENT_YEAR}, total ${data.totales.total}.`);
