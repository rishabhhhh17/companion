const { Avatar } = require('../components/Avatar');
const { UserCard } = require('../components/UserCard');

function renderProfile(user) {
  return `<main>${Avatar(user)}${UserCard(user)}</main>`;
}

module.exports = { renderProfile };
