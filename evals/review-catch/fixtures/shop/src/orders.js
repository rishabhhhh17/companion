const { requireUser, canEditOrder } = require('./auth');

function updateOrder(req, order, changes) {
  const user = requireUser(req);
  if (!canEditOrder(user, order)) {
    const e = new Error('You cannot change this order.');
    e.status = 403;
    throw e;
  }
  return { ...order, ...changes };
}

module.exports = { updateOrder };
