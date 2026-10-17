// The routes the server answers. Each one gives back a status and a body.
const fs = require('fs');
const path = require('path');

const routes = {
  'GET /api/health': () => ({ status: 200, body: { ok: true } }),
};

function handle(method, url) {
  const route = routes[`${method} ${url}`];
  return route ? route() : { status: 404, body: { error: `No route for ${method} ${url}` } };
}

module.exports = { handle };
