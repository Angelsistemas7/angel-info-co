const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const fetchRaw = path.join(__dirname, 'fetch_raw.js');
const script = `
  process.env.CRIMENAI_ONLY = 'homicidio_arma';
  global.fetch = async () => ({ ok: false, status: 400, text: async () => 'schema changed' });
  require(${JSON.stringify(fetchRaw)}).main();
`;
const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
assert.strictEqual(result.status, 1, result.stderr || result.stdout);
assert.match(result.stderr, /FALLÓ homicidio_arma/);
assert.match(result.stdout, /se conserva la publicación anterior/);
console.log('OK failed source blocks pipeline');
