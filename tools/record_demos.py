#!/usr/bin/env python3
"""录制三个操作演示（webm），随后由 record_demos.sh 转成 GIF。"""
import asyncio, os, shutil
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
PDF = '/workspace/test/sample.pdf'
BIG = '/workspace/test/big.pdf'
OUT = '/tmp/demos'
errs = []

async def new_ctx(browser, tag):
    d = os.path.join(OUT, tag)
    os.makedirs(d, exist_ok=True)
    ctx = await browser.new_context(
        viewport={'width': 390, 'height': 844},
        device_scale_factor=2,
        record_video_dir=d,
        record_video_size={'width': 780, 'height': 1688},
        is_mobile=True, has_touch=True, accept_downloads=True)
    page = await ctx.new_page()
    page.on('pageerror', lambda e: errs.append(f'{tag}: {e}'))
    return ctx, page

async def demo_extract(browser):
    ctx, page = await new_ctx(browser, 'extract')
    await page.goto(BASE, wait_until='networkidle')
    await page.wait_for_timeout(900)
    await page.set_input_files('#fileInput', PDF)
    await page.wait_for_selector('#pageList .card canvas', timeout=20000)
    await page.wait_for_timeout(1600)
    cards = page.locator('#pageList .card')
    await cards.nth(1).click(); await page.wait_for_timeout(450)
    await cards.nth(3).click(); await page.wait_for_timeout(700)
    async with page.expect_download(timeout=30000):
        await page.click('#extractBtn')
    await page.wait_for_timeout(1800)   # 等 toast 出现再收尾
    await ctx.close()

async def demo_convert(browser):
    ctx, page = await new_ctx(browser, 'convert')
    await page.goto(BASE, wait_until='networkidle')
    await page.wait_for_timeout(700)
    await page.click('#tabConvert')
    await page.wait_for_timeout(600)
    await page.set_input_files('#cvPdfInput', PDF)
    await page.wait_for_timeout(1400)
    await page.click('text=3x')
    await page.wait_for_timeout(600)
    async with page.expect_download(timeout=60000):
        await page.click('text=导出图片')
    await page.wait_for_timeout(1800)
    await ctx.close()

async def demo_compress(browser):
    ctx, page = await new_ctx(browser, 'compress')
    await page.goto(BASE, wait_until='networkidle')
    await page.wait_for_timeout(700)
    await page.click('#tabCompress')
    await page.wait_for_timeout(600)
    await page.set_input_files('#cmpPdfInput', BIG)
    await page.wait_for_timeout(2200)
    await page.click('.preset[data-kb="500"]')
    await page.wait_for_timeout(700)
    async with page.expect_download(timeout=180000):
        await page.click('text=开始压缩')
    await page.wait_for_timeout(2200)
    await ctx.close()

async def main():
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
        await demo_extract(b)
        await demo_convert(b)
        await demo_compress(b)
        await b.close()
    for d in sorted(os.listdir(OUT)):
        for f in os.listdir(os.path.join(OUT, d)):
            if f.endswith('.webm'):
                print(os.path.join(OUT, d, f))
    print('ERRORS:', len(errs), errs[:3])

asyncio.run(main())
