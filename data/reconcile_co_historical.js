'use strict';

// El catálogo DANE nombra algunos corregimientos como "(ANM)", mientras SIEDCO
// publica el mismo nombre sin sufijo. Conservamos los hechos históricos en el
// municipio DANE correspondiente, solo cuando el nombre es único en su depto.
function reconcileAnmHistorical(municipiosDetalle, seriesByCategory, normalizeMuniKey) {
  const destinations = new Map();
  for (const [depto, municipalities] of Object.entries(municipiosDetalle)) {
    for (const municipality of municipalities) {
      if (!/\s*\(ANM\)\s*$/i.test(municipality.municipio)) continue;
      const bare = normalizeMuniKey(municipality.municipio.replace(/\s*\(ANM\)\s*$/i, ''));
      const alias = `${bare}|${depto}`;
      const canonical = `${normalizeMuniKey(municipality.municipio)}|${depto}`;
      if (!destinations.has(alias)) destinations.set(alias, canonical);
      else destinations.set(alias, null); // no adjudicar un nombre ambiguo
    }
  }

  let merged = 0;
  for (const category of Object.values(seriesByCategory)) {
    for (const [alias, canonical] of destinations) {
      if (!canonical || !Object.hasOwn(category, alias)) continue;
      const target = category[canonical] = category[canonical] || {};
      for (const [year, count] of Object.entries(category[alias])) {
        target[year] = (target[year] || 0) + count;
      }
      delete category[alias];
      merged++;
    }
  }
  return merged;
}

module.exports = { reconcileAnmHistorical };
