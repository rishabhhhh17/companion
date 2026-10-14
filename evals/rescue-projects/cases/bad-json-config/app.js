const fs = require('fs');
const raw = fs.readFileSync(__dirname + '/config.json', 'utf8');
const config = JSON.parse(raw);
console.log(config);
