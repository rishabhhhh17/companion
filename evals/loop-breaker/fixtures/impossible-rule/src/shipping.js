// What shipping costs for an order, in dollars.
function shippingFor(orderTotal) {
  return orderTotal >= 50 ? 0 : 5;
}

module.exports = { shippingFor };
