const test = require('node:test');
const assert = require('node:assert');
const { chargeFor } = require('../src/payments');

test('two mugs cost $48', () => {
  assert.strictEqual(chargeFor({ items: [{ sku: 'mug', qty: 2 }] }), 4800);
});
