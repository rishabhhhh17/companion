// The first line of a note, for the list of notes.
function preview(note, max = 40) {
  const first = note.body.split('\n')[0].trim();
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
}

module.exports = { preview };
