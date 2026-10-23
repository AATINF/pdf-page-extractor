#!/usr/bin/env python3
"""单独截一张"保存结果面板"的图。"""
import asyncio
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
OUT = '/workspace/pdf-page-extractor/screenshots/08-save-sheet.png'
OUT_D = '/workspace/pdf-page-extractor/screenshots/09-save-sheet-dark.png'
errs = []

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844},
                                  device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(BASE, wait_until='networkidle')
        await page.set_input_files('#fileInput', '/workspace/test/sample.pdf')
        await page.wait_for_selector('#pageList .card canvas', timeout=20000)
        await page.wait_for_timeout(1200)
        await page.evaluate("showSaveSheet('sample_第1-3页.pdf', 'Download/sample_第1-3页.pdf')")
        await page.wait_for_timeout(500)
        await page.screenshot(path=OUT)

        await page.emulate_media(color_scheme='dark')
        await page.wait_for_timeout(500)
        await page.screenshot(path=OUT_D)
        await b.close()

asyncio.run(main())
print('ERRORS:', len(errs), errs[:3])
