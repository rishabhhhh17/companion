const test = require('node:test');
const assert = require('node:assert');
const { updateOrder } = require('../src/orders');

const order = { id: 'o1', userId: 'u1', status: 'unpaid' };

test('the customer can change their own order', () => {
  assert.strictEqual(updateOrder({ user: { id: 'u1' } }, order, { status: 'paid' }).status, 'paid');
});

test('an admin can change any order', () => {
  assert.strictEqual(updateOrder({ user: { id: 'a1', role: 'admin' } }, order, { status: 'shipped' }).status, 'shipped');
});

test('nobody signed out can change an order', () => {
  assert.throws(() => updateOrder({}, order, { status: 'paid' }), /sign in/);
});
