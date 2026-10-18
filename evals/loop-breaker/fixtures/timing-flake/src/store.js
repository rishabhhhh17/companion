// Orders are saved to a slow disk in the real app; here saving waits for the disk in the same way, for a number of turns
// of the event loop. Like a busy disk, it does not take the same time on every run: most runs are slow, and one run in
// four is quick. The runs are counted in node_modules/.cache, so a fresh copy of the project always starts with three
// slow runs.
const fs = require('fs');
const path = require('path');

const SLOW_TURNS = 50;
const QUICK_TURNS = 1;

function diskDelay() {
  if (process.env.STORE_DELAY_TURNS) return Number(process.env.STORE_DELAY_TURNS);
  const file = path.join(__dirname, '..', 'node_modules', '.cache', 'disk-runs');
  let runs = 0;
  try { runs = Number(fs.readFileSync(file, 'utf8')) || 0; } catch { /* the first run */ }
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, String(runs + 1)); } catch { /* read only: always slow */ }
  return runs % 4 === 3 ? QUICK_TURNS : SLOW_TURNS;
}

const DELAY_TURNS = diskDelay();
const orders = [];

// The disk answers after this many turns of the event loop.
function disk(turns) {
  return new Promise((resolve) => {
    const turn = (left) => (left > 0 ? setImmediate(turn, left - 1) : resolve());
    turn(turns);
  });
}

function saveOrder(order) {
  disk(DELAY_TURNS).then(() => orders.push(order));
}

function listOrders() {
  return [...orders];
}

function clearOrders() {
  orders.length = 0;
}

module.exports = { saveOrder, listOrders, clearOrders };
