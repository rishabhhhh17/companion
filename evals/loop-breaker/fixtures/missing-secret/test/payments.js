const test = require('node:test');
const assert = require('node:assert');
const { checkoutRequest } = require('../src/payments');

test('checkout asks Stripe for the right amount', () => {
  const r = checkoutRequest({ total: 12.5 });
  assert.strictEqual(r.amount, 1250);
  assert.ok(r.key.startsWith('sk_'), 'the Stripe secret key must be set');
});
