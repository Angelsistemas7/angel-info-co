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

if (failures.length) {
  console.error('VALIDACIÓN FALLIDA:');
  failures.forEach(message => console.error(' - ' + message));
  process.exit(1);
}

console.log(`VALIDACIÓN OK: ${data.departamentos.length} departamentos, ${CURRENT_YEAR}, total ${data.totales.total}.`);
