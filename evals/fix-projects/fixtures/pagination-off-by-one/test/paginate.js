const test = require('node:test');
const assert = require('node:assert');
const { pageOf, pageCount } = require('../src/paginate');

const orders = Array.from({ length: 12 }, (_, i) => `Order ${i + 1}`);

test('page 1 starts with the first order', () => {
  assert.deepStrictEqual(pageOf(orders, 1), ['Order 1', 'Order 2', 'Order 3', 'Order 4', 'Order 5']);
});

test('twelve orders make three pages', () => {
  assert.strictEqual(pageCount(orders), 3);
});
