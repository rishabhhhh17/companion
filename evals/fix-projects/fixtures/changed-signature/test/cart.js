const test = require('node:test');
const assert = require('node:assert');
const { cartSummary } = require('../src/cart');

test('the cart shows how many items and the total', () => {
  assert.strictEqual(cartSummary([{ price: 12.5, qty: 2 }, { price: 5, qty: 1 }]), '3 items, $30.00');
});
