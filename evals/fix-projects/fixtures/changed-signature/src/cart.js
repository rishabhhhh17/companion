const { formatPrice } = require('./money');

function cartSummary(items, currency = 'USD') {
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const count = items.reduce((n, item) => n + item.qty, 0);
  return `${count} items, ${formatPrice(total, currency)}`;
}

module.exports = { cartSummary };
