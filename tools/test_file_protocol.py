#!/usr/bin/env python3
"""验证单文件版在 file:// 协议下能否正常工作（对应"零网络权限"方案）。"""
import asyncio, pathlib, sys
from playwright.async_api import async_playwright

HTML = pathlib.Path('/workspace/pdf-page-extractor/PDF页面提取器-单文件版.html')
URI = HTML.as_uri()
PDF = '/workspace/test/sample.pdf'
errs = []

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844},
                                  is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)))
        page.on('console', lambda m: errs.append('CONSOLE: ' + m.text) if m.type == 'error' else None)

        await page.goto(URI, wait_until='load')
        await page.wait_for_timeout(800)
        print('协议:', await page.evaluate('location.protocol'))
        print('PDF.js 就绪:', await page.evaluate('typeof pdfjsLib !== "undefined"'))
        print('pdf-lib 就绪:', await page.evaluate('typeof PDFLib !== "undefined"'))

        await page.set_input_files('#fileInput', PDF)
        try:
            await page.wait_for_selector('#pageList .card canvas', timeout=25000)
            ok = True
        except Exception as e:
            ok = False
            print('缩略图渲染失败:', e)

        if ok:
            await page.wait_for_timeout(1500)
            n = await page.locator('#pageList .card').count()
            print('卡片数:', n)
            await page.locator('#pageList .card').first.click()
            await page.wait_for_timeout(300)
            print('选中数:', await page.locator('#selCount').text_content())
            # 尝试提取，看 download 是否触发
            try:
                async with page.expect_download(timeout=15000) as dl:
                    await page.click('#extractBtn')
                d = await dl.value
                print('下载触发成功:', d.suggested_filename)
            except Exception as e:
                print('下载未触发(预期:file:// 下可能受限):', type(e).__name__)
        await b.close()

asyncio.run(main())
print('ERRORS:', len(errs))
for e in errs[:8]:
    print(' ', e)
