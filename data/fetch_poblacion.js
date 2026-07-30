// Descarga la población oficial de Colombia por municipio (y departamento, por agregación) desde el
// DANE, para poder calcular tasas de criminalidad por 100.000 habitantes en merge.js.
//
// FUENTE: DANE — "Proyecciones y Retroproyecciones de Población municipal por área 2018-2042"
// (PPED, base Censo Nacional de Población y Vivienda — CNPV 2018), archivo Excel público:
//   https://www.dane.gov.co/files/censo2018/proyecciones-de-poblacion/Municipal/PPED-AreaMun-2018-2042_VP.xlsx
// (ver también https://www.dane.gov.co/index.php/estadisticas-por-tema/demografia-y-poblacion/proyecciones-de-poblacion)
// No existe en Socrata/datos.gov.co un dataset nacional equivalente con las ~1.122 filas municipales
// (solo hay datasets sueltos por alcaldía individual) -- por eso se usa el archivo oficial del DANE.
//
// El archivo es un .xlsx (zip + XML). Para no añadir dependencias npm al proyecto (ver nota en
// fetch_raw.js: "Sin dependencias npm"), este script incluye su propio lector mínimo de ZIP (usa
// solo node:zlib, que es built-in) y un parser mínimo de SpreadsheetML (fila/celda + sharedStrings),
// en vez de instalar una librería tipo `xlsx`.
//
// Uso:  node data/fetch_poblacion.js
// Salida: data/poblacion_municipios.json  ->  [{ municipio, departamento, divipola, anio, poblacion }, ...]
// (un registro por municipio, año más reciente disponible tomado como año "actual": AÑO=2025,
// ÁREA GEOGRÁFICA="Total", ver constante ANIO_POBLACION más abajo).

const fs = require('fs');
const zlib = require('zlib');
const path = __dirname;

const XLSX_URL = 'https://www.dane.gov.co/files/censo2018/proyecciones-de-poblacion/Municipal/PPED-AreaMun-2018-2042_VP.xlsx';
const ANIO_POBLACION = '2025'; // coincide con el inicio del "periodo actual" (enero 2025 - mayo 2026) del resto del pipeline
const SHEET_NAME = 'PobMunicipalxÁrea'; // hoja municipal por año y área geográfica dentro del libro PPED

// -------- Lector mínimo de ZIP (sin dependencias), suficiente para .xlsx sin cifrar --------
function readZipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('No se encontró el registro EOCD del zip (¿archivo corrupto o no es un .xlsx válido?)');
  const entryCount = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const entries = {};
  let p = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    const sig = buf.readUInt32LE(p);
    if (sig !== 0x02014b50) throw new Error('Entrada de directorio central inválida en offset ' + p);
    const compMethod = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries[name] = { compMethod, compSize, localOffset };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
function extractEntry(buf, entry) {
  const lp = entry.localOffset;
  const nameLen = buf.readUInt16LE(lp + 26);
  const extraLen = buf.readUInt16LE(lp + 28);
  const dataStart = lp + 30 + nameLen + extraLen;
  const compData = buf.subarray(dataStart, dataStart + entry.compSize);
  if (entry.compMethod === 0) return compData;
  if (entry.compMethod === 8) return zlib.inflateRawSync(compData);
  throw new Error('Método de compresión ZIP no soportado: ' + entry.compMethod);
}

// -------- Parser mínimo de SpreadsheetML --------
function parseSharedStrings(xml) {
  const items = [];
  const siRe = /<si>(.*?)<\/si>/gs;
  let m;
  while ((m = siRe.exec(xml))) {
    const texts = [...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map(x => decodeXmlEntities(x[1]));
    items.push(texts.join(''));
  }
  return items;
}
function decodeXmlEntities(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
function colLetter(cellRef) { return cellRef.match(/^[A-Z]+/)[0]; }

// Devuelve un iterador de filas; cada fila es un objeto { A: valor, B: valor, ... } ya resuelto
// (shared strings -> texto, numérico -> Number). Celdas vacías se omiten.
function* iterRows(sheetXml, sharedStrings) {
  const rowRe = /<row[^>]*>(.*?)<\/row>/gs;
  const cellRe = /<c r="([A-Z]+\d+)"([^>]*)(?:\/>|>(.*?)<\/c>)/gs;
  let rm;
  while ((rm = rowRe.exec(sheetXml))) {
    const rowContent = rm[1];
    const row = {};
    let cm;
    cellRe.lastIndex = 0;
    while ((cm = cellRe.exec(rowContent))) {
      const [, ref, attrs, inner] = cm;
      if (!inner) continue; // celda vacía
      const isString = /t="s"/.test(attrs);
      const isInlineStr = /t="inlineStr"/.test(attrs);
      const vMatch = inner.match(/<v>(.*?)<\/v>/s);
      let val;
      if (isInlineStr) {
        const tMatch = inner.match(/<t[^>]*>(.*?)<\/t>/s);
        val = tMatch ? decodeXmlEntities(tMatch[1]) : '';
      } else if (vMatch) {
        val = isString ? sharedStrings[parseInt(vMatch[1], 10)] : Number(vMatch[1]);
      } else {
        continue;
      }
      row[colLetter(ref)] = val;
    }
    yield row;
  }
}

async function downloadXlsx() {
  const res = await fetch(XLSX_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CrimenAI-fetch-poblacion/1.0)' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' descargando ' + XLSX_URL);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log('Descargado ' + XLSX_URL + ' (' + buf.length + ' bytes)');
  return buf;
}

function findSheetFile(buf, entries) {
  const workbookXml = extractEntry(buf, entries['xl/workbook.xml']).toString('utf8');
  const relsXml = extractEntry(buf, entries['xl/_rels/workbook.xml.rels']).toString('utf8');
  const sheetMatch = [...workbookXml.matchAll(/<sheet name="([^"]+)"[^>]*r:id="(rId\d+)"/g)]
    .find(m => m[1] === SHEET_NAME);
  if (!sheetMatch) throw new Error('No se encontró la hoja "' + SHEET_NAME + '" en el libro DANE (¿cambió el nombre de hoja?)');
  const rId = sheetMatch[2];
  const relMatch = [...relsXml.matchAll(/<Relationship Id="(rId\d+)"[^>]*Target="([^"]+)"/g)]
    .find(m => m[1] === rId);
  if (!relMatch) throw new Error('No se encontró la relación ' + rId + ' en workbook.xml.rels');
  return 'xl/' + relMatch[2];
}

async function main() {
  const buf = await downloadXlsx();
  const entries = readZipEntries(buf);
  const sharedStrings = parseSharedStrings(extractEntry(buf, entries['xl/sharedStrings.xml']).toString('utf8'));
  const sheetFile = findSheetFile(buf, entries);
  console.log('Hoja "' + SHEET_NAME + '" -> ' + sheetFile);
  const sheetXml = extractEntry(buf, entries[sheetFile]).toString('utf8');

  // Localiza la fila de encabezados (primera fila con celdas de texto DP/DPNOM/MPIO/... vía shared strings)
  // y a partir de sus valores identifica dinámicamente las columnas, por si DANE reordena el layout.
  let headerRow = null;
  const rows = [];
  for (const row of iterRows(sheetXml, sharedStrings)) {
    if (!headerRow && Object.values(row).includes('DP') && Object.values(row).includes('TOTAL')) {
      headerRow = row;
      continue;
    }
    if (headerRow) rows.push(row);
  }
  if (!headerRow) throw new Error('No se encontró la fila de encabezados (DP/DPNOM/MPIO/DPMP/AÑO/ÁREA GEOGRÁFICA/TOTAL) en la hoja del DANE.');
  const colOf = (label) => Object.keys(headerRow).find(k => headerRow[k] === label);
  const COL = {
    dp: colOf('DP'),
    dpnom: colOf('DPNOM'),
    mpio: colOf('MPIO'),
    dpmp: colOf('DPMP'),
    anio: colOf('AÑO'),
    area: colOf('ÁREA GEOGRÁFICA'),
    total: colOf('TOTAL'),
  };
  Object.entries(COL).forEach(([k, v]) => { if (!v) throw new Error('No se pudo ubicar la columna "' + k + '" en el encabezado del DANE.'); });

  const out = [];
  let areaTotalCount = 0;
  rows.forEach(r => {
    const area = r[COL.area];
    if (area !== 'Total') return; // nos interesa el total (Cabecera + Centros Poblados y Rural Disperso), no el desglose
    areaTotalCount++;
    if (String(r[COL.anio]) !== ANIO_POBLACION) return;
    out.push({
      municipio: r[COL.dpmp],       // nombre del municipio (p.ej. "Medellín")
      departamento: r[COL.dpnom],   // nombre del departamento (p.ej. "Antioquia")
      divipola: r[COL.mpio],        // código DIVIPOLA municipal (p.ej. "05001")
      poblacion: r[COL.total],
    });
  });

  if (!out.length) {
    throw new Error('ABORTADO: 0 filas de población para el año ' + ANIO_POBLACION + ' (¿cambió el rango de años del archivo DANE? filas con área=Total encontradas: ' + areaTotalCount + ')');
  }
  if (out.length < 1000) {
    console.error('ADVERTENCIA: solo ' + out.length + ' municipios con población para ' + ANIO_POBLACION + ' (se esperaban ~1.122). Revisar el archivo fuente.');
  }

  fs.writeFileSync(path + '/poblacion_municipios.json', JSON.stringify(out));
  console.log('OK. ' + out.length + ' municipios con población DANE ' + ANIO_POBLACION + ' guardados en data/poblacion_municipios.json.');
}

main().catch(e => {
  console.error('FALLÓ fetch_poblacion.js:', e.message);
  // No abortamos con exit(1): si falla la descarga/parseo del DANE, merge.js simplemente no encontrará
  // data/poblacion_municipios.json (tryLoad devuelve []) y dejará poblacion/tasaPor100k en null,
  // sin tumbar el resto del pipeline de criminalidad.
});
