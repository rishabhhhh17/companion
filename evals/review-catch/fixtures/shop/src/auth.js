// Who may do what. Every order change goes through here.
function requireUser(req) {
  if (!req.user) {
    const e = new Error('Please sign in first.');
    e.status = 401;
    throw e;
  }
  return req.user;
}

function canEditOrder(user, order) {
  return user.id === order.userId || user.role === 'admin';
}

module.exports = { requireUser, canEditOrder };
