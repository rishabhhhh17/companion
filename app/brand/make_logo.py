# The Squibby mark (27 Oct 2026, the founder: "a circle with 7 rays and the gradient like this", a sunset orb lit from
# below). Writes logo.svg (the mark alone, see through) and app-icon.svg (the macOS app icon). Run: python3 make_logo.py
# The PNG sizes and icon.icns are made from app-icon.svg by render.html (see README.md here).
import math

def ray_path(r_in, length, w_in, w_out):
    # One ray pointing up from the centre: wide and round where it leaves the sun, narrow and round at its tip.
    y0, y1 = -r_in, -(r_in + length)
    return (f"M {-w_in/2:.1f} {y0:.1f} L {-w_out/2:.1f} {y1:.1f} "
            f"A {w_out/2:.1f} {w_out/2:.1f} 0 0 1 {w_out/2:.1f} {y1:.1f} "
            f"L {w_in/2:.1f} {y0:.1f} A {w_in/2:.1f} {w_in/2:.1f} 0 0 1 {-w_in/2:.1f} {y0:.1f} Z")

def rays(cx, cy, r_in, length, w_in, w_out, n=7):
    d = ray_path(r_in, length, w_in, w_out)
    return "\n  ".join(f'<path d="{d}" fill="url(#ray)" transform="translate({cx} {cy}) rotate({i * 360 / n:.3f})"/>' for i in range(n))

DEFS = """<defs>
  <radialGradient id="sun" cx="50%" cy="78%" r="85%" fx="50%" fy="88%">
    <stop offset="0" stop-color="#FFF3B0"/><stop offset=".28" stop-color="#F8D45A"/><stop offset=".58" stop-color="#F08A2C"/>
    <stop offset=".82" stop-color="#E0461A"/><stop offset="1" stop-color="#B8200E"/>
  </radialGradient>
  <linearGradient id="ray" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="#F6B044"/><stop offset=".5" stop-color="#EA5E1E"/><stop offset="1" stop-color="#C02410"/>
  </linearGradient>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#5A1A1E"/><stop offset=".45" stop-color="#2E1426"/><stop offset="1" stop-color="#1B1229"/>
  </linearGradient>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#FF7A30" stop-opacity=".9"/><stop offset=".45" stop-color="#E0461A" stop-opacity=".45"/>
    <stop offset="1" stop-color="#B8200E" stop-opacity="0"/>
  </radialGradient>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
</defs>"""

mark = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
{DEFS}
<circle cx="512" cy="512" r="250" fill="url(#glow)" filter="url(#soft)"/>
  {rays(512, 512, 286, 176, 84, 34)}
<circle cx="512" cy="512" r="212" fill="url(#sun)"/>
</svg>
"""

# macOS app icon grid: an 824 point rounded square centred in 1024, corner radius about 186.
icon = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
{DEFS}
<clipPath id="sq"><rect x="100" y="100" width="824" height="824" rx="186"/></clipPath>
<g clip-path="url(#sq)">
  <rect x="100" y="100" width="824" height="824" fill="url(#bg)"/>
  <circle cx="512" cy="520" r="360" fill="url(#glow)" filter="url(#soft)"/>
  {rays(512, 520, 206, 120, 58, 24)}
  <circle cx="512" cy="520" r="150" fill="url(#sun)"/>
</g>
</svg>
"""

open("logo.svg", "w").write(mark)
open("app-icon.svg", "w").write(icon)
