function Avatar(user) {
  return `<img class="avatar" src="${user.photo}" alt="${user.name}">`;
}

module.exports = { Avatar };
