const test = require('node:test');
const assert = require('node:assert');
const { formatPrice } = require('../src/money');

test('formatPrice shows dollars', () => {
  assert.strictEqual(formatPrice({ amount: 3, currency: 'USD' }), '$3.00');
});

test('formatPrice shows euros', () => {
  assert.strictEqual(formatPrice({ amount: 3, currency: 'EUR' }), '€3.00');
});
