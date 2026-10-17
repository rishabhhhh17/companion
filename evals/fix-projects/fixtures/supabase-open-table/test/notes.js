const test = require('node:test');
const assert = require('node:assert');
const { preview } = require('../src/notes');

test('a note preview is its first line', () => {
  assert.strictEqual(preview({ body: 'Buy clay\nand glaze' }), 'Buy clay');
});
