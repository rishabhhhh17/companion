const test = require('node:test');
const assert = require('node:assert');
const { renderProfile } = require('../pages/profile');

test('the profile page shows the name and the bio', () => {
  const html = renderProfile({ name: 'Sam Rivera', bio: 'Makes pots on Sundays.', photo: '/sam.jpg' });
  assert.match(html, /Sam Rivera/);
  assert.match(html, /Makes pots on Sundays/);
});
