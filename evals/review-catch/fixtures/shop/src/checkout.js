const { chargeFor } = require('./payments');

// What is sent to Stripe to start a payment. The secret key is read on the server from the environment, never written here.
function checkoutSession(cart, env = process.env) {
  if (!env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set.');
  return {
    key: env.STRIPE_SECRET_KEY,
    amount: chargeFor(cart),
    currency: 'usd',
    success_url: 'https://mugs.example/thanks',
  };
}

module.exports = { checkoutSession };
