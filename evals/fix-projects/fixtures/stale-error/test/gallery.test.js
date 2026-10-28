const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

test('the gallery button calls a function that app.js defines', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const called = /onclick="(\w+)\(\)"/.exec(html)[1];
  const app = require('../app.js');
  assert.strictEqual(typeof app[called], 'function', `${called} is not defined in app.js`);
});

test('the page loads app.js', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /<script src="app\.js"><\/script>/);
});

test('showGallery shows the gallery', () => {
  const gallery = { hidden: true };
  global.document = { getElementById: () => gallery };
  require('../app.js').showGallery();
  assert.strictEqual(gallery.hidden, false);
});
