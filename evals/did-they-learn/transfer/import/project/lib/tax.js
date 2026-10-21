// Sales tax: what a price in cents comes to once the tax is added. 8 percent, rounded to the nearest cent.
const TAX_PERCENT = 8;

function addTax(cents) {
  return Math.round(cents * (100 + TAX_PERCENT) / 100);
}

module.exports = { addTax, TAX_PERCENT };
