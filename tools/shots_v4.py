#!/usr/bin/env python3
"""截 v4 的三张关键图：工具条、旋转后、加密 PDF 的导出设置。"""
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
        await page.set_input_files('#fileInput', '/workspace/test/sample.pdf')
        await page.wait_for_selector('#pageList .card canvas', timeout=20000)
        await page.wait_for_timeout(1500)

        cards = page.locator('#pageList .card')
        for i in range(3):
            await cards.nth(i).click()
        await page.wait_for_timeout(400)
        await page.screenshot(path=f'{OUT}/10-toolbar.png')

        # 记录旋转前的缩略图尺寸，旋转后应发生变化
        before = await page.evaluate(
            "(() => { const c = document.querySelector('.card[data-page=\"1\"] canvas');"
            " return [c.width, c.height]; })()")
        await page.click('#rotateBtn')
        await page.wait_for_timeout(1200)
        after = await page.evaluate(
            "(() => { const c = document.querySelector('.card[data-page=\"1\"] canvas');"
            " return [c.width, c.height]; })()")
        label = await page.text_content('#rotateLabel')
        print('旋转前 canvas:', before, '旋转后:', after, '按钮文案:', label)
        print('宽高互换:', before[0] == after[1] and before[1] == after[0])
        await page.screenshot(path=f'{OUT}/11-rotated.png')

        # 加密 PDF
        await page.set_input_files('#fileInput', '/tmp/enc_test.pdf')
        await page.wait_for_timeout(900)
        if await page.locator('#dialog').is_visible():
            await page.fill('#dlgInput', '1234')
            await page.click('#dlgOk')
        await page.wait_for_timeout(1800)
        vis = await page.locator('#exportSettings').is_visible()
        print('导出设置可见（加密 PDF）:', vis)
        await page.screenshot(path=f'{OUT}/12-encrypted-settings.png')

        await b.close()

asyncio.run(main())
print('ERRORS:', len(errs), errs[:3])
