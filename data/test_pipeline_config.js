const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const configPath = path.join(__dirname, 'pipeline_config.js');

function readConfig(env = {}) {
  const script = `process.stdout.write(JSON.stringify(require(${JSON.stringify(configPath)})))`;
  const result = spawnSync(process.execPath, ['-e', script], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || 'falló pipeline_config');
  return JSON.parse(result.stdout);
}

const forced = readConfig({ CRIMENAI_CURRENT_YEAR: '2026' });
assert.strictEqual(forced.CURRENT_YEAR, 2026);
assert.deepStrictEqual(forced.CURRENT_YEARS, ['2026']);

const invalid = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(configPath)})`], {
  env: { ...process.env, CRIMENAI_CURRENT_YEAR: '1900' },
  encoding: 'utf8',
});
assert.notStrictEqual(invalid.status, 0);
assert.match(invalid.stderr, /fuera de rango/);

console.log('OK pipeline config tests');
