#!/usr/bin/env python3
"""生成 Android 各密度图标：与 v3 线性图标风格一致（文档 + 加号）。"""
import asyncio, pathlib
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw

ROOT = pathlib.Path('/workspace/pdf-page-extractor')
RES = ROOT / 'android/app/src/main/res'
TMP = pathlib.Path('/tmp/icons')
TMP.mkdir(exist_ok=True)

DEFS = ('<defs><linearGradient id="g" x1="0" y1="0" x2="0.55" y2="1">'
        '<stop offset="0" stop-color="#3b82f6"/>'
        '<stop offset="1" stop-color="#1d4ed8"/></linearGradient></defs>')

# 方案 C：两张页面 + 中间虚线，表达"拆分"
GLYPH = ('<rect x="100" y="157" width="140" height="198" rx="20" fill="#ffffff"/>'
         '<rect x="272" y="157" width="140" height="198" rx="20" fill="#ffffff" opacity=".5"/>'
         '<path d="M256 116v280" stroke="#ffffff" stroke-width="15" stroke-dasharray="30 22" '
         'stroke-linecap="round" opacity=".95"/>')

def svg(body, size=512, bg=None):
    back = f'<rect width="{size}" height="{size}" fill="url(#g)"/>' if bg else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
            f'viewBox="0 0 512 512">{DEFS}{back}{body}</svg>')

def round_mask(size):
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    return mask

async def render():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
        page = await b.new_page(viewport={'width': 512, 'height': 512})

        async def shot(s, name, transparent=False):
            await page.set_content(f'<html><body style="margin:0;background:transparent">{s}</body></html>')
            await page.screenshot(path=str(TMP / name), omit_background=transparent)

        await shot(svg(GLYPH, bg=True), 'square.png')
        await shot(svg(GLYPH, bg=True), 'round_src.png')
        await shot(svg(GLYPH, bg=False), 'fg.png', transparent=True)
        await b.close()

DENS = [('mdpi', 48, 108), ('hdpi', 72, 162), ('xhdpi', 96, 216),
        ('xxhdpi', 144, 324), ('xxxhdpi', 192, 432)]

def main():
    asyncio.run(render())

    square = Image.open(TMP / 'square.png').convert('RGB')
    fg = Image.open(TMP / 'fg.png').convert('RGBA')

    # 圆形版
    rnd = square.convert('RGBA')
    rnd.putalpha(round_mask(512))

    for dens, px, fgpx in DENS:
        d = RES / f'mipmap-{dens}'
        d.mkdir(parents=True, exist_ok=True)
        square.resize((px, px), Image.LANCZOS).save(d / 'ic_launcher.png')
        rnd.resize((px, px), Image.LANCZOS).save(d / 'ic_launcher_round.png')
        fg.resize((fgpx, fgpx), Image.LANCZOS).save(d / 'ic_launcher_foreground.png')
        print(f'  {dens}: {px}px / fg {fgpx}px')

    # 自适应图标背景色
    p = RES / 'values/ic_launcher_background.xml'
    p.write_text('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
                 '    <color name="ic_launcher_background">#2563EB</color>\n</resources>\n',
                 encoding='utf-8')
    print('  背景色 -> #2563EB')

if __name__ == '__main__':
    main()
