const test = require('node:test');
const assert = require('node:assert');
const { shippingFor } = require('../src/shipping');

// Written by Sam, from the old website: "Free shipping on orders of $50 or more".
test('orders of $50 or more ship free', () => {
  assert.strictEqual(shippingFor(50), 0);
});

// Written by Ana, from the new price list: "Free shipping on orders over $50".
test('free shipping starts above $50, so an order of exactly $50 pays $5', () => {
  assert.strictEqual(shippingFor(50), 5);
});

test('small orders pay $5', () => {
  assert.strictEqual(shippingFor(20), 5);
});
