// Orders are saved to a slow disk in the real app; here saving waits a moment in the same way.
const DELAY_MS = Number(process.env.STORE_DELAY_MS || 50);
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
