#!/usr/bin/env python3
"""截转换 / 压缩四个面板的图。"""
import asyncio
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
OUT = '/workspace/pdf-page-extractor/screenshots'
errs = []

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844},
                                  device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)))
        page.on('console', lambda m: errs.append('CONSOLE: ' + m.text) if m.type == 'error' else None)
        await page.goto(BASE, wait_until='networkidle')

        # 转换 · PDF → 图片
        await page.click('#tabConvert')
        await page.wait_for_timeout(400)
        await page.screenshot(path=f'{OUT}/13-convert-to-image.png')

        # 转换 · 图片 → PDF（带两张图）
        await page.click('#convModeSeg >> text=图片 → PDF')
        await page.wait_for_timeout(300)
        for i in range(2):
            await page.set_input_files('#cvImgInput', f'/tmp/test_img_{i}.png')
            await page.wait_for_timeout(700)
        await page.screenshot(path=f'{OUT}/14-convert-to-pdf.png')

        # 压缩 · PDF
        await page.click('#tabCompress')
        await page.wait_for_timeout(400)
        await page.set_input_files('#cmpPdfInput', '/workspace/test/sample.pdf')
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f'{OUT}/15-compress-pdf.png')

        # 压缩 · 图片
        await page.click('#cmpModeSeg >> text=图片压缩')
        await page.wait_for_timeout(300)
        await page.set_input_files('#cmpImgInput', '/tmp/test_img_0.png')
        await page.wait_for_timeout(700)
        await page.screenshot(path=f'{OUT}/16-compress-image.png')

        await b.close()

asyncio.run(main())
print('ERRORS:', len(errs), errs[:3])
