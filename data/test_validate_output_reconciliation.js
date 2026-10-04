const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const localSnapshot = path.join(__dirname, 'colombia_crimen.json');
const publishedSnapshot = path.join(__dirname, '..', 'dist', 'data', 'colombia_crimen.json');
const source = JSON.parse(fs.readFileSync(fs.existsSync(localSnapshot) ? localSnapshot : publishedSnapshot, 'utf8'));
const broken = structuredClone(source);
const department = broken.departamentos.find(row => row.key === 'ANTIOQUIA');
const municipality = broken.municipiosDetalle.ANTIOQUIA.find(row => !row.fuenteHomicidios && Number(row.hurto) > 0);
assert(department && municipality, 'faltan datos para probar la conciliación');
municipality.hurto -= 1;

const file = path.join(os.tmpdir(), `crimenai-reconcile-${process.pid}.json`);
try {
  fs.writeFileSync(file, JSON.stringify(broken));
  const result = spawnSync(process.execPath, [path.join(__dirname, 'validate_output.js'), file], {
    encoding: 'utf8',
  });
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /hurto ANTIOQUIA: municipios=.*residuo máximo=0/);
  console.log('OK reconciliation rejects missing municipal case');
} finally {
  fs.rmSync(file, { force: true });
}
