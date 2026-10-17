require('./env').load();

function stripeKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set. Add your Stripe secret key to the .env file (never to the code).');
  return key;
}

// What is sent to Stripe to start a checkout. Amounts are in cents.
function checkoutRequest(cart) {
  return { key: stripeKey(), amount: Math.round(cart.total * 100), currency: 'usd' };
}

module.exports = { checkoutRequest };
