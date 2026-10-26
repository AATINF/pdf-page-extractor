#!/usr/bin/env python3
"""各模式预览功能的 e2e 测试。"""
import asyncio, sys
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
PDF = '/workspace/test/sample.pdf'
errs, results = [], []

def ck(name, cond, detail=''):
    results.append((name, bool(cond), detail))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844},
                                  device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)))
        page.on('console', lambda m: errs.append('CONSOLE: ' + m.text) if m.type == 'error' else None)
        await page.goto(BASE, wait_until='networkidle')

        # ---------- 合并模式预览 ----------
        await page.click('#tabMerge')
        await page.set_input_files('#mergeInput', PDF)
        await page.wait_for_timeout(1600)
        ck('合并列表有预览按钮', await page.locator('.merge-row button[data-a="view"]').count() > 0)
        await page.click('.merge-row button[data-a="view"]')
        await page.wait_for_timeout(1800)
        ck('合并预览打开', await page.locator('#previewModal').is_visible())
        t = await page.text_content('#pvTitle')
        ck('合并预览标题含页数', '第 1 / 6 页' in (t or ''), t)
        ck('PDF 模式显示缩放按钮', await page.locator('.pv-pdf-only').first.is_visible())
        await page.click('#previewModal .mbtn')
        await page.wait_for_timeout(400)
        ck('关闭后弹层消失', await page.locator('#previewModal').is_hidden())

        # ---------- 转换模式预览 ----------
        await page.click('#tabConvert')
        await page.set_input_files('#cvPdfInput', PDF)
        await page.wait_for_timeout(1600)
        ck('转换文件卡有预览按钮', await page.locator('#cvPdfInfo .cv-view').is_visible())
        await page.click('#cvPdfInfo .cv-view')
        await page.wait_for_timeout(1500)
        ck('转换预览打开', await page.locator('#previewModal').is_visible())
        await page.click('#previewModal .mbtn')
        await page.wait_for_timeout(400)

        # ---------- 图片预览 + 切换 ----------
        await page.click('#convModeSeg >> text=图片 → PDF')
        await page.wait_for_timeout(300)
        for i in range(2):
            await page.set_input_files('#cvImgInput', f'/tmp/test_img_{i}.png')
            await page.wait_for_timeout(700)
        await page.click('#cvImgList .img-item img')
        await page.wait_for_timeout(900)
        ck('图片预览打开', await page.locator('#previewModal').is_visible())
        ck('图片模式显示计数器', await page.locator('#pvCounter').is_visible())
        c1 = await page.text_content('#pvCounter')
        ck('计数器初始为 1/2', c1.strip() == '1 / 2', c1)
        ck('图片模式隐藏缩放按钮', await page.locator('.pv-pdf-only').first.is_hidden())

        await page.locator('.pv-img-only').nth(1).click()
        await page.wait_for_timeout(600)
        c2 = await page.text_content('#pvCounter')
        ck('切换到 2/2', c2.strip() == '2 / 2', c2)
        t2 = await page.text_content('#pvTitle')
        ck('标题跟随切换', 'test_img_1' in (t2 or ''), t2)

        await page.locator('.pv-img-only').nth(0).click()
        await page.wait_for_timeout(500)
        c3 = await page.text_content('#pvCounter')
        ck('切回 1/2', c3.strip() == '1 / 2', c3)

        await page.click('#previewModal .mbtn')
        await page.wait_for_timeout(400)

        # ---------- 压缩模式预览 ----------
        await page.click('#tabCompress')
        await page.set_input_files('#cmpPdfInput', PDF)
        await page.wait_for_timeout(1600)
        ck('压缩文件卡有预览按钮', await page.locator('#cmpPdfInfo .cv-view').is_visible())
        await page.click('#cmpPdfInfo .cv-view')
        await page.wait_for_timeout(1500)
        ck('压缩预览打开', await page.locator('#previewModal').is_visible())
        await page.click('#previewModal .mbtn')
        await page.wait_for_timeout(300)

        # ---------- 提取模式预览仍然正常 ----------
        await page.click('#tabSingle')
        await page.set_input_files('#fileInput', PDF)
        await page.wait_for_selector('#pageList .card canvas', timeout=20000)
        await page.wait_for_timeout(1200)
        await page.locator('#pageList .card .eye').first.click()
        await page.wait_for_timeout(1200)
        ck('提取模式预览未受影响', await page.locator('#previewModal').is_visible())
        await page.click('#previewModal .mbtn')

        ck('无 JS 错误', len(errs) == 0, str(errs[:2]))
        await b.close()

asyncio.run(main())
ok = sum(1 for _, c, _ in results if c)
print(f'\n通过 {ok} / {len(results)}\n')
for name, c, detail in results:
    print(('  PASS ' if c else '  FAIL ') + name + ('  ' + detail if detail else ''))
sys.exit(0 if ok == len(results) else 1)
