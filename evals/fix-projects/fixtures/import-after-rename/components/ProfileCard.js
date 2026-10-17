// Was components/UserCard.js (renamed when the page became "Profile").
function ProfileCard(user) {
  return `<div class="card"><h2>${user.name}</h2><p>${user.bio}</p></div>`;
}

module.exports = { ProfileCard };
