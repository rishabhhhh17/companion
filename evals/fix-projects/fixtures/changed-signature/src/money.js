// formatPrice takes one object now, so the currency can never be left out by mistake.
function formatPrice({ amount, currency }) {
  if (typeof amount !== 'number') throw new TypeError('formatPrice needs an amount, for example formatPrice({ amount: 12, currency: "USD" })');
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

module.exports = { formatPrice };
