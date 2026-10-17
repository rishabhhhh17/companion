// What the order tracker page asks the server for.
const API_BASE = '/api/v1';

async function loadOrders(fetchJson) {
  const res = await fetchJson('GET', `${API_BASE}/orders`);
  if (res.status !== 200) throw new Error(`Could not load your orders: the server said ${res.status} for ${API_BASE}/orders`);
  return res.body;
}

async function loadProducts(fetchJson) {
  const res = await fetchJson('GET', '/api/products');
  if (res.status !== 200) throw new Error(`Could not load the products: the server said ${res.status}`);
  return res.body;
}

module.exports = { loadOrders, loadProducts };
