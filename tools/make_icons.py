"""Рисует иконку приложения (прицельная марка) во всех нужных размерах."""
from PIL import Image, ImageDraw
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = (23, 32, 27)        # лесной тёмный
FG = (255, 122, 46)      # сигнальный оранжевый
LIGHT = (236, 238, 232)

def draw_mark(size, scale=1.0, bg=True, rounded=True):
    S = size * 4  # суперсэмплинг для гладких краёв
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if bg:
        if rounded:
            d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BG)
        else:
            d.rectangle([0, 0, S, S], fill=BG)
    c = S / 2
    r = S * 0.30 * scale
    w = max(4, int(S * 0.055 * scale))
    d.ellipse([c - r, c - r, c + r, c + r], outline=FG, width=w)
    gap, ext = r * 0.42, r * 1.38
    lw = max(3, int(S * 0.045 * scale))
    for x0, y0, x1, y1 in [(c, c - ext, c, c - gap), (c, c + gap, c, c + ext),
                           (c - ext, c, c - gap, c), (c + gap, c, c + ext, c)]:
        d.line([x0, y0, x1, y1], fill=LIGHT, width=lw)
    dot = S * 0.045 * scale
    d.ellipse([c - dot, c - dot, c + dot, c + dot], fill=FG)
    return im.resize((size, size), Image.LANCZOS)

def save(im, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path)

icons = os.path.join(ROOT, "www", "icons")
save(draw_mark(192), f"{icons}/icon-192.png")
save(draw_mark(512), f"{icons}/icon-512.png")
save(draw_mark(512, scale=0.78, rounded=False), f"{icons}/maskable-512.png")
save(draw_mark(180, rounded=False).convert("RGB"), f"{icons}/apple-touch-icon.png")
save(draw_mark(32), f"{icons}/favicon-32.png")

# Android: обычные и адаптивные иконки
res = os.path.join(ROOT, "android", "app", "src", "main", "res")
if os.path.isdir(res):
    for dens, legacy, fg in [("mdpi", 48, 108), ("hdpi", 72, 162), ("xhdpi", 96, 216),
                             ("xxhdpi", 144, 324), ("xxxhdpi", 192, 432)]:
        save(draw_mark(legacy), f"{res}/mipmap-{dens}/ic_launcher.png")
        round_im = draw_mark(legacy, rounded=False)
        mask = Image.new("L", round_im.size, 0)
        ImageDraw.Draw(mask).ellipse([0, 0, legacy - 1, legacy - 1], fill=255)
        r = Image.new("RGBA", round_im.size, (0, 0, 0, 0)); r.paste(round_im, mask=mask)
        save(r, f"{res}/mipmap-{dens}/ic_launcher_round.png")
        # передний план адаптивной иконки: знак в безопасной зоне (66%)
        save(draw_mark(fg, scale=0.62, bg=False), f"{res}/mipmap-{dens}/ic_launcher_foreground.png")
    print("android icons ok")
print("pwa icons ok")
