// Orders are saved to a slow disk in the real app; here saving waits a moment in the same way. Like a busy disk, it does
// not take the same time on every run: most runs are slow, and one run in four is quick. The runs are counted in
// node_modules/.cache, so a fresh copy of the project always starts with three slow runs.
const fs = require('fs');
const path = require('path');

const SLOW_MS = 50;
const QUICK_MS = 1;

function diskDelay() {
  if (process.env.STORE_DELAY_MS) return Number(process.env.STORE_DELAY_MS);
  const file = path.join(__dirname, '..', 'node_modules', '.cache', 'disk-runs');
  let runs = 0;
  try { runs = Number(fs.readFileSync(file, 'utf8')) || 0; } catch { /* the first run */ }
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, String(runs + 1)); } catch { /* read only: always slow */ }
  return runs % 4 === 3 ? QUICK_MS : SLOW_MS;
}

const DELAY_MS = diskDelay();
const orders = [];

function saveOrder(order) {
  new Promise((resolve) => setTimeout(resolve, DELAY_MS)).then(() => orders.push(order));
}

function listOrders() {
  return [...orders];
}

function clearOrders() {
  orders.length = 0;
}

module.exports = { saveOrder, listOrders, clearOrders };
