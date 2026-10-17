// The cart total: every line's price times how many, then the discount (a percent, like 10 for 10 percent off).
function lineTotal(item) {
  return item.price;
}

function cartTotal(items, discountPercent = 0) {
  const sum = items.reduce((total, item) => total + lineTotal(item), 0);
  return Math.round(sum * (1 - discountPercent) * 100) / 100;
}

module.exports = { cartTotal, lineTotal };
