// Shows the gallery when the button is pressed. (This used to be called show(), which is what the old error was about.)
function showGallery() {
  document.getElementById('gallery').hidden = false;
}

if (typeof module !== 'undefined') module.exports = { showGallery };
