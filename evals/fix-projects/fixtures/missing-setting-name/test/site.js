const test = require('node:test');
const assert = require('node:assert');
const { siteTitle, priceLabel } = require('../lib/site');

test('the page title uses the shop name', () => {
  assert.strictEqual(siteTitle(), 'Fern and Moss | Shop');
});

test('prices show the currency', () => {
  assert.strictEqual(priceLabel(12), '12.00 USD');
});
