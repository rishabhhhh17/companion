const test = require('node:test');
const assert = require('node:assert');
const { handle } = require('../server/app');
const { loadProducts } = require('../src/products');

// The page talks to the server through this, so the test needs no network.
const fetchJson = async (method, url) => handle(method, url);

test('the shop shows the three plants', async () => {
  const products = await loadProducts(fetchJson);
  assert.strictEqual(products.length, 3);
});
