require('./env').load();

function need(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Add it to your .env file.`);
  return value;
}

function siteTitle() {
  return `${need('SITE_NAME')} | Shop`;
}

function priceLabel(amount) {
  return `${amount.toFixed(2)} ${need('PUBLIC_CURRENCY')}`;
}

module.exports = { siteTitle, priceLabel };
