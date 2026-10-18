const test = require('node:test');
const assert = require('node:assert');
const { saveOrder, listOrders, clearOrders } = require('../src/store');

test('a saved order shows up in the list', async () => {
  clearOrders();
  await saveOrder({ id: 1, item: 'Blue mug' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(listOrders().length, 1);
});
