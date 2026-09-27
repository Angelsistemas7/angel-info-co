const configuredYear = Number.parseInt(process.env.CRIMENAI_CURRENT_YEAR || '', 10);
const CURRENT_YEAR = Number.isInteger(configuredYear) ? configuredYear : new Date().getUTCFullYear();

if (CURRENT_YEAR < 2003 || CURRENT_YEAR > 2100) {
  throw new Error('CRIMENAI_CURRENT_YEAR fuera de rango: ' + CURRENT_YEAR);
}

module.exports = {
  CURRENT_YEAR,
  CURRENT_YEARS: [String(CURRENT_YEAR)],
};
