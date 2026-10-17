const test = require('node:test');
const assert = require('node:assert');
const { cartTotal } = require('../src/cart');

test('the total counts every mug and takes off the discount', () => {
  assert.strictEqual(cartTotal([{ price: 10, qty: 2 }, { price: 5, qty: 1 }], 10), 22.5);
});
