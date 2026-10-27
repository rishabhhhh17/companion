# The Squibby mark (27 Oct 2026, the founder's pick after several rounds): a smiling sun in motion. A round sun with a
# smile cut through it, and seven identical bean shaped rays curving the same way, like a pinwheel caught mid spin.
# Traced in code from the founder's chosen image so every ray is exactly the same shape rotated 360/7 degrees, the gaps
# are even, and the smile is a touch thicker than the image so it survives 16 points in the menu bar.
#
# Writes, all from one geometry:
#   logo.svg            the mark, black, see through (documents, print)
#   logo-white.svg      the mark, white, see through (dark grounds, the notch)
#   app-icon.svg        the macOS app icon: matte black rounded square, the mark in electric lime, a faint lime glow
#   ../public/brand/sun-dark.svg, sun-light.svg   the menu bar sun the island draws (white on a dark menu bar, black on a light one)
# Run: python3 make_logo.py. The PNG sizes and icon.icns come from app-icon.svg through render.html (README.md here).
import math

# ---- the geometry, in units of the sun's radius R ----
R = 100.0
RAY_START = (1.42, -34.0)   # (distance from the centre in R, angle in degrees from straight up) where a ray begins
RAY_END = (2.02, 8.0)      # where it ends: further out and turned clockwise, so the ray curves like a pinwheel blade
RAY_BOW = 0.20              # how much the centre line bows outward between the two (in R)
W_IN, W_OUT = 0.40, 0.64    # the ray's width at its inner end and at its fat outer end (in R): a bean
SMILE = dict(half=0.46, y=0.16, sag=0.26, w_mid=0.24, w_end=0.15)   # the cut smile: half width, height, curve, thickness
LIME = "#C6F432"
SAMPLES = 48

def polar(r, deg):
    a = math.radians(deg - 90.0)
    return (r * math.cos(a), r * math.sin(a))

def bezier(p0, c, p1, t):
    u = 1 - t
    return (u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1])

def tangent(p0, c, p1, t):
    dx = 2 * (1 - t) * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0])
    dy = 2 * (1 - t) * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1])
    n = math.hypot(dx, dy) or 1.0
    return (dx / n, dy / n)

def stroke_outline(p0, c, p1, w0, w1, wmid=None):
    """A filled outline around a quadratic curve whose width runs from w0 to w1 (or w0, wmid, w0), with round ends."""
    left, right = [], []
    for i in range(SAMPLES + 1):
        t = i / SAMPLES
        if wmid is None:
            w = w0 + (w1 - w0) * (t * t * (3 - 2 * t))
        else:
            w = wmid + (w0 - wmid) * (1 - 4 * t * (1 - t))   # thickest in the middle, w0 at both ends
        (x, y), (tx, ty) = bezier(p0, c, p1, t), tangent(p0, c, p1, t)
        nx, ny = -ty, tx
        left.append((x + nx * w / 2, y + ny * w / 2))
        right.append((x - nx * w / 2, y - ny * w / 2))
    def cap(center, direction, w):
        # a half circle closing one end of the stroke, from the left side round to the right side
        cx, cy = center
        base = math.atan2(direction[1], direction[0])
        return [(cx + math.cos(base + math.pi / 2 - (k / 16) * math.pi) * w / 2, cy + math.sin(base + math.pi / 2 - (k / 16) * math.pi) * w / 2) for k in range(1, 16)]
    end_dir, start_dir = tangent(p0, c, p1, 1.0), tangent(p0, c, p1, 0.0)
    w_end = w1 if wmid is None else w0
    pts = left + cap(bezier(p0, c, p1, 1.0), end_dir, w_end) + right[::-1] + cap(bezier(p0, c, p1, 0.0), (-start_dir[0], -start_dir[1]), w0)
    return "M " + " L ".join(f"{x:.2f} {y:.2f}" for x, y in pts) + " Z"

def ray_path():
    p0 = polar(RAY_START[0] * R, RAY_START[1])
    p1 = polar(RAY_END[0] * R, RAY_END[1])
    mid_r = (RAY_START[0] + RAY_END[0]) / 2 + RAY_BOW
    c = polar(mid_r * R, (RAY_START[1] + RAY_END[1]) / 2 - 6.0)
    return stroke_outline(p0, c, p1, W_IN * R, W_OUT * R)

def smile_path():
    s = SMILE
    p0, p1 = (-s["half"] * R, s["y"] * R), (s["half"] * R, s["y"] * R)
    c = (0.0, (s["y"] + 2 * s["sag"]) * R)
    return stroke_outline(p0, c, p1, s["w_end"] * R, s["w_end"] * R, wmid=s["w_mid"] * R)

def mark(fill, uid):
    ray = ray_path()
    rays = "\n  ".join(f'<path d="{ray}" fill="{fill}" transform="rotate({i * 360 / 7:.4f})"/>' for i in range(7))
    # the sun with the smile cut through it (a mask, so the ground shows through the smile)
    return f'''<mask id="cut{uid}" maskUnits="userSpaceOnUse" x="-512" y="-512" width="1024" height="1024">
    <rect x="-512" y="-512" width="1024" height="1024" fill="#fff"/><path d="{smile_path()}" fill="#000"/></mask>
  {rays}
  <circle r="{R:.1f}" fill="{fill}" mask="url(#cut{uid})"/>'''

def svg(body, view=(-300, -300, 600, 600), size=600):
    x, y, w, h = view
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}" width="{size}" height="{size}">\n{body}\n</svg>\n'

# The mark alone: the rays reach about 2.5 R from the centre, so a 600 unit box holds it with a little room.
open("logo.svg", "w").write(svg(mark("#000", "k"), (-280, -280, 560, 560)))
open("logo-white.svg", "w").write(svg(mark("#fff", "w"), (-280, -280, 560, 560)))
# The menu bar sun: the same mark, cropped tight to its own extent so it fills its 16 point box.
tight = (-270, -270, 540, 540)
open("../public/brand/sun-dark.svg", "w").write(svg(mark("#fff", "d"), tight, 64))
open("../public/brand/sun-light.svg", "w").write(svg(mark("#000", "l"), tight, 64))

# The app icon: macOS grid (an 824 rounded square in 1024, corner about 186), matte black with a faint sheen, the mark
# in electric lime with a soft lime glow behind it on the black.
icon = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<defs>
  <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1C1D1F"/><stop offset="1" stop-color="#050505"/></linearGradient>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="{LIME}" stop-opacity=".32"/><stop offset=".6" stop-color="{LIME}" stop-opacity=".08"/><stop offset="1" stop-color="{LIME}" stop-opacity="0"/></radialGradient>
  <clipPath id="sq"><rect x="100" y="100" width="824" height="824" rx="186"/></clipPath>
</defs>
<g clip-path="url(#sq)">
  <rect x="100" y="100" width="824" height="824" fill="url(#ground)"/>
  <rect x="100" y="100" width="824" height="2" fill="#fff" opacity=".10"/>
  <circle cx="512" cy="512" r="330" fill="url(#glow)"/>
  <g transform="translate(512 512) scale(1.28)">
  {mark(LIME, "i")}
  </g>
</g>
</svg>
'''
open("app-icon.svg", "w").write(icon)
