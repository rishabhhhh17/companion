// Prices are kept in cents, as Stripe expects them.
const PRICES = { mug: 2400, bowl: 3200, plate: 1800 };

function chargeFor(cart) {
  return cart.items.reduce((sum, item) => sum + PRICES[item.sku] * item.qty, 0);
}

module.exports = { chargeFor, PRICES };
