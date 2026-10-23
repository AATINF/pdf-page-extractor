#!/usr/bin/env python3
"""手机视口截图：验证移动端适配层是否生效。"""
import asyncio, os, sys
from playwright.async_api import async_playwright

ROOT = '/workspace/pdf-page-extractor'
OUT = os.path.join(ROOT, 'screenshots')
BASE = 'http://127.0.0.1:8765/index.html'
PDF = '/workspace/test/sample.pdf'
errors = []

async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
        ctx = await b.new_context(
            viewport={'width': 390, 'height': 844},
            device_scale_factor=2, is_mobile=True, has_touch=True, locale='zh-CN')
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errors.append('PAGEERROR: ' + str(e)))
        page.on('console', lambda m: errors.append('CONSOLE-ERR: ' + m.text) if m.type == 'error' else None)

        await page.goto(BASE, wait_until='networkidle')
        await page.wait_for_timeout(600)
        await page.screenshot(path=f'{OUT}/01-home.png')

        await page.set_input_files('#fileInput', PDF)
        await page.wait_for_selector('#pageList .card canvas', timeout=20000)
        await page.wait_for_timeout(1800)
        await page.screenshot(path=f'{OUT}/02-pages.png')

        cards = page.locator('#pageList .card')
        n = await cards.count()
        for i in range(min(3, n)):
            await cards.nth(i).click()
        await page.wait_for_timeout(500)
        await page.screenshot(path=f'{OUT}/03-selected.png')

        await page.click('#tabMerge')
        await page.wait_for_timeout(400)
        await page.screenshot(path=f'{OUT}/04-merge.png')

        await page.click('#tabSingle')
        await page.wait_for_timeout(400)
        eye = page.locator('#pageList .card .eye').first
        if await eye.count():
            await eye.click()
            await page.wait_for_timeout(1400)
            await page.screenshot(path=f'{OUT}/05-preview.png')
            await page.locator('#previewModal .mbtn').first.click()
            await page.wait_for_timeout(400)

        await page.emulate_media(color_scheme='dark')
        await page.wait_for_timeout(700)
        await page.screenshot(path=f'{OUT}/06-dark.png')

        await page.set_viewport_size({'width': 844, 'height': 390})
        await page.wait_for_timeout(800)
        await page.screenshot(path=f'{OUT}/07-landscape.png')

        await b.close()

asyncio.run(main())
print('卡片数检查完成')
print('ERRORS:', len(errors))
for e in errors[:12]:
    print(' ', e)
sys.exit(1 if errors else 0)
