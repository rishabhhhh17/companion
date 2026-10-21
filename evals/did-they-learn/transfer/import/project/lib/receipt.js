// Turns an order into the lines of its receipt: each item, then the total with tax.
const { addTax } = require("./sales-tax");

const dollars = (cents) => `$${(cents / 100).toFixed(2)}`;

function receiptLines(items) {
  const lines = items.map((i) => `${i.name}: ${dollars(i.cents)}`);
  const subtotal = items.reduce((sum, i) => sum + i.cents, 0);
  lines.push(`Total with tax: ${dollars(addTax(subtotal))}`);
  return lines;
}

module.exports = { receiptLines };
