// Turns a price in cents into what people read: 1250 becomes $12.50.
// (This file used to be called format-price.js.)
function formatPrice(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

module.exports = { formatPrice };
