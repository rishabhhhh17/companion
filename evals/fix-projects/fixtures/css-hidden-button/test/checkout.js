const test = require('node:test');
const assert = require('node:assert');
const { shown } = require('./visible');

test('the Checkout button can be seen', () => {
  const s = shown('checkout');
  assert.ok(s.visible, `The Checkout button is hidden (display: ${s.display}, from ${s.from})`);
});

test('the Empty the cart button can be seen', () => {
  assert.ok(shown('empty-cart').visible);
});
