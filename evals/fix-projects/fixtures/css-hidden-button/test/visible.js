// Works out whether an element of index.html is shown, from its classes and the plain one class rules in styles.css (the
// last rule that sets display wins, as in the browser for rules of the same weight).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function element(id) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const tag = new RegExp(`<([a-z]+)[^>]*\\bid="${id}"[^>]*>`, 'i').exec(html);
  if (!tag) throw new Error(`There is no element with id ${id} in index.html`);
  const cls = /\bclass="([^"]*)"/.exec(tag[0]);
  return { tag: tag[1], classes: cls ? cls[1].split(/\s+/).filter(Boolean) : [] };
}

function shown(id) {
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const { classes } = element(id);
  let display = 'inline-block', from = 'the browser';
  for (const rule of css.matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) {
    const d = /display\s*:\s*([\w-]+)/.exec(rule[2]);
    if (d && classes.includes(rule[1])) { display = d[1]; from = `.${rule[1]}`; }
  }
  return { visible: display !== 'none', display, from };
}

module.exports = { shown };
