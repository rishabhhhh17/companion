// The small server behind the order tracker. Each route answers with a status and a body.
const orders = [
  { id: 1, item: 'Blue mug', status: 'shipped' },
  { id: 2, item: 'Green bowl', status: 'packing' },
];
const products = [{ id: 'mug', name: 'Blue mug' }, { id: 'bowl', name: 'Green bowl' }];

const routes = {
  'GET /api/health': () => ({ status: 200, body: { ok: true } }),
  'GET /api/orders': () => ({ status: 200, body: orders }),
  'GET /api/products': () => ({ status: 200, body: products }),
};

function handle(method, path) {
  const route = routes[`${method} ${path}`];
  return route ? route() : { status: 404, body: { error: `No route for ${method} ${path}` } };
}

module.exports = { handle };
