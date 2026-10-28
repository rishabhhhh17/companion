# The Squibby mark

A smiling sun in motion: a round sun with a smile cut through it, and seven identical bean shaped rays curving the same way, like a pinwheel caught mid spin. The founder's pick on 27 Oct 2026, after several rounds (a sunset seven ray sun first, then this). Black and white is the mark; electric lime (#C6F432, a yellow green, never mint or teal) is the one colour Squibby owns, used for the app icon, the site and the "fixed and proven" moment. Not orange (Claude's colour), not purple or blue (every AI product), not mint (ChatGPT). Names are placeholders; the mark does not depend on the word.

- `make_logo.py` writes everything from one geometry: `logo.svg` (black), `logo-white.svg` (white), `app-icon.svg` (matte black rounded square, the mark in lime with a faint lime glow), and `../public/brand/sun-dark.svg` and `sun-light.svg` (the menu bar sun the island draws: white on a dark menu bar, black on a light one). Change the numbers at the top of the script, never the SVGs by hand. Every ray is one path rotated 360/7 degrees; the smile is a mask cut through the sun, a touch thicker than the source image so it survives 16 points.
- `render.html` with `save.py` draws `app-icon.svg` and `logo.svg` at every size, see through: run `python3 save.py` here, open `http://127.0.0.1:5303/render.html` in a browser, and the PNGs land in `out/`.
- From `out/`, `app/src-tauri/icons/` is filled: the `.iconset` sizes through `iconutil -c icns`, the PNGs Tauri lists, and `icon.ico` (Pillow).
- `png/` keeps the mark at 1024 and 256 for posts and docs.
