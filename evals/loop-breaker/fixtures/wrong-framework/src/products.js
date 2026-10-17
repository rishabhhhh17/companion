// The shop page loads its products from the server.
async function loadProducts(fetchJson) {
  const res = await fetchJson('GET', '/api/products');
  if (res.status !== 200) throw new Error(`The products could not load: the server answered ${res.status} for /api/products`);
  return res.body;
}

module.exports = { loadProducts };
