// Takes payments for the shop's checkout. The payments key is a setting, read from .env.local, never written in the code.
const key = process.env.PAYMENTS_SECRET_KEY || "";

function canTakePayments() {
  return key.length > 0;
}

module.exports = { canTakePayments };
