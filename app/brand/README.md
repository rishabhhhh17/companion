# The Squibby mark

A sun of seven rays, an orb lit from below in a sunset gradient (the founder's brief and reference, 27 Oct 2026). Names are placeholders; the mark is not tied to the name.

- `make_logo.py` writes `logo.svg` (the mark, see through) and `app-icon.svg` (the macOS app icon: deep plum to dark, a warm glow, the mark). Change the numbers there, never the SVGs by hand.
- `render.html` with `save.py` draws them at every size, see through: run `python3 save.py` here, open `http://127.0.0.1:5303/render.html` in a browser, and the PNGs land in `out/`.
- From `out/`, `app/src-tauri/icons/` is filled: the `.iconset` sizes through `iconutil -c icns`, the PNGs Tauri lists, and `icon.ico` (Pillow).
- `png/` keeps the mark at 1024 and 256 for posts and docs.
