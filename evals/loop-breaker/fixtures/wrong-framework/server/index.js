const http = require('http');
const { handle } = require('./app');

http.createServer((req, res) => {
  const r = handle(req.method, req.url);
  res.writeHead(r.status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(r.body));
}).listen(3001, () => console.log('API on http://localhost:3001'));
