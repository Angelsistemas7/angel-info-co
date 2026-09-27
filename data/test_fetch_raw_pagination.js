const assert = require('assert');
const { soqlAll } = require('./fetch_raw');

async function testPaginatesUntilShortPage() {
  const originalFetch = global.fetch;
  const urls = [];
  const pages = [
    [{ key: 'a' }, { key: 'b' }],
    [{ key: 'c' }, { key: 'd' }],
    [{ key: 'e' }],
  ];
  global.fetch = async url => {
    urls.push(new URL(url));
    return { ok: true, json: async () => pages.shift() };
  };

  try {
    const rows = await soqlAll('test-id', { $select: 'key', $order: 'key' }, { pageSize: 2 });
    assert.deepStrictEqual(rows.map(row => row.key), ['a', 'b', 'c', 'd', 'e']);
    assert.deepStrictEqual(urls.map(url => url.searchParams.get('$offset')), ['0', '2', '4']);
    assert(urls.every(url => url.searchParams.get('$limit') === '2'));
    assert(urls.every(url => url.searchParams.get('$order') === 'key'));
  } finally {
    global.fetch = originalFetch;
  }
}

async function testRejectsUnstablePagination() {
  await assert.rejects(() => soqlAll('test-id', { $select: 'key' }), /requiere \$order estable/);
}

async function testRejectsSafetyLimit() {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => [{ key: 'a' }, { key: 'b' }] });
  try {
    await assert.rejects(
      () => soqlAll('test-id', { $select: 'key', $order: 'key' }, { pageSize: 2, maxPages: 2 }),
      /paginación excedió 2 páginas/
    );
  } finally {
    global.fetch = originalFetch;
  }
}

Promise.resolve()
  .then(testPaginatesUntilShortPage)
  .then(testRejectsUnstablePagination)
  .then(testRejectsSafetyLimit)
  .then(() => console.log('OK pagination tests'))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
