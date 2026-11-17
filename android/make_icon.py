"""Generates the launcher icons (res/drawable-*/ic_launcher.png)."""
import os, sys
from PIL import Image, ImageDraw, ImageFont
root = os.path.dirname(os.path.abspath(__file__))
sizes = {"mdpi":48, "hdpi":72, "xhdpi":96, "xxhdpi":144, "xxxhdpi":192}
font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
for d, n in sizes.items():
    S = n * 4
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    g = ImageDraw.Draw(im)
    g.rounded_rectangle([S*0.04, S*0.04, S*0.96, S*0.96], radius=S*0.22, fill=(47, 93, 85))
    # simple truss motif
    w = S*0.035; y0, y1 = S*0.70, S*0.80; xs = [S*0.18, S*0.34, S*0.5, S*0.66, S*0.82]
    g.line([(xs[0], y1), (xs[-1], y1)], fill=(219, 231, 227), width=int(w))
    g.line([(xs[1], y0), (xs[3], y0)], fill=(219, 231, 227), width=int(w))
    for a, b in [(0,1),(1,2),(2,3),(3,4)]:
        top = (xs[b], y0) if a % 2 == 0 else (xs[a], y0)
        bot = (xs[a], y1) if a % 2 == 0 else (xs[b], y1)
        g.line([bot, top], fill=(219, 231, 227), width=int(w))
    g.line([(xs[0], y1), (xs[1], y0)], fill=(219, 231, 227), width=int(w))
    g.line([(xs[3], y0), (xs[4], y1)], fill=(219, 231, 227), width=int(w))
    f1 = ImageFont.truetype(font_path, int(S*0.30)); f2 = ImageFont.truetype(font_path, int(S*0.17))
    g.text((S/2, S*0.33), "GATE", font=f1, fill="white", anchor="mm")
    g.text((S/2, S*0.55), "CE", font=f2, fill=(219, 231, 227), anchor="mm")
    out = os.path.join(root, "res", "drawable-" + d)
    os.makedirs(out, exist_ok=True)
    im.resize((n, n), Image.LANCZOS).save(os.path.join(out, "ic_launcher.png"))
print("icons written")
