const test = require('node:test');
const assert = require('node:assert');
const { withTax } = require('../price');

test('adds 20 percent tax', () => {
  assert.strictEqual(withTax(100), 120);
});
