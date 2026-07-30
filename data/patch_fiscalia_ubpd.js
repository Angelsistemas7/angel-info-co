// Parche incremental: añade denunciasFiscalia (SPOA) y desaparecidosUBPD a colombia_crimen.json
// sin re-ejecutar todo merge.js (los JSON crudos de las 10 categorías principales ya no existen en disco,
// ver nota en la cabecera de merge.js). Este script SÍ tiene sus propios JSON crudos recién descargados
// (depto_spoa_procesos.json, hist_nacional_spoa_procesos.json, etc.) y los fusiona sobre el
// colombia_crimen.json ya existente, preservando todo lo demás intacto.
const fs = require('fs');
const path = __dirname;

function load(name) { return JSON.parse(fs.readFileSync(path + '/' + name, 'utf8')); }
function tryLoad(name) { try { return load(name); } catch (e) { console.error('missing', name); return []; } }

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

const output = load('colombia_crimen.json');

// Construye byKey -> nombre para mostrar, a partir de los departamentos ya presentes en el JSON fusionado.
const byKey = {};
output.departamentos.forEach(d => { byKey[d.key] = d.nombre; });

function porDeptoDesdeConteo(file) {
  const byDepto = {};
  tryLoad(file + '.json').forEach(r => {
    const key = normalizeDeptoName(r.departamento);
    if (!byKey[key]) return; // descarta "Sin Información", "Desaparecidos en el extranjero", etc.
    byDepto[key] = (byDepto[key] || 0) + (parseFloat(r.total) || 0);
  });
  return Object.keys(byDepto)
    .map(key => ({ departamento: byKey[key], total: byDepto[key] }))
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

const desaparecidosUBPD = {
  fuenteReal: 'Instituto Nacional de Medicina Legal y Ciencias Forenses (SIRDEC) — no fue posible obtener el dataset descargable de la UBPD, que solo expone un visor interactivo',
  porAnio: tryLoad('hist_nacional_desaparecidos.json').map(r => ({ anio: String(r.anio), total: parseFloat(r.total) || 0 })),
  porDepartamento: porDeptoDesdeConteo('depto_desaparecidos'),
  porSexo: tryLoad('desaparecidos_sexo.json').map(r => ({ sexo: r.sexo, total: parseFloat(r.total) || 0 })),
  totalRegistroActual: 129895,
  cifraOficialUBPD: { total: 136010, fecha: '2026-07-08', fuente: 'UBPD, boletín de actualización del universo de personas dadas por desaparecidas en razón del conflicto armado' },
};

output.denunciasFiscalia = denunciasFiscalia;
output.desaparecidosUBPD = desaparecidosUBPD;
output.meta.fuente = 'Policía Nacional de Colombia (SIEDCO) vía datos.gov.co + Fiscalía General de la Nación (SPOA) para delitos informáticos, procesos y víctimas + Instituto Nacional de Medicina Legal y Ciencias Forenses (SIRDEC) para personas desaparecidas';
output.meta.generado = new Date().toISOString();

fs.writeFileSync(path + '/colombia_crimen.json', JSON.stringify(output));

// -------- Publica el resultado final en dist/ para que el workflow lo copie al repo privado --------
// Este repo (scraper) no tiene el dashboard al lado, así que en vez de escribir directo en
// js/data.js e index.html (como hacía la versión original de este script cuando todo vivía
// en un solo repo), deja el resultado en dist/ y el workflow se encarga de copiarlo al
// checkout del repo privado y de actualizar su cache-busting.
const distDir = path + '/../dist';
fs.mkdirSync(distDir + '/js', { recursive: true });
fs.mkdirSync(distDir + '/data', { recursive: true });
fs.writeFileSync(distDir + '/js/data.js', 'const CRIMEN_DATA = ' + JSON.stringify(output) + ';\n');
fs.writeFileSync(distDir + '/data/colombia_crimen.json', JSON.stringify(output));

const sumProcesos = denunciasFiscalia.procesos.porDepartamento.reduce((s, r) => s + r.total, 0);
const sumVictimas = denunciasFiscalia.victimas.porDepartamento.reduce((s, r) => s + r.total, 0);
const sumDesap = desaparecidosUBPD.porDepartamento.reduce((s, r) => s + r.total, 0);
console.log('OK. Procesos SPOA (suma depto):', sumProcesos, '| Víctimas SPOA (suma depto):', sumVictimas, '| Desaparecidos Medicina Legal (suma depto):', sumDesap);
console.log('OK. js/data.js regenerado (' + JSON.stringify(output).length + ' bytes).');
