const test = require('node:test');
const assert = require('node:assert');
const { handle } = require('../server/routes');
const { loadOrders, loadProducts } = require('../src/api');

// The page talks to the server through this, so the test needs no network.
const fetchJson = async (method, path) => handle(method, path);

test('the orders page gets your orders', async () => {
  const orders = await loadOrders(fetchJson);
  assert.strictEqual(orders.length, 2);
});

test('the products list loads', async () => {
  const products = await loadProducts(fetchJson);
  assert.strictEqual(products.length, 2);
});
