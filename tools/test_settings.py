#!/usr/bin/env python3
"""设置 + 重命名导出 的 e2e 测试。"""
import asyncio, os, sys
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
PDF = '/workspace/test/sample.pdf'
OUT = '/tmp/setout'
errs, results = [], []

def ck(name, cond, detail=''):
    results.append((name, bool(cond), detail))

async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844},
                                  device_scale_factor=2, is_mobile=True, has_touch=True,
                                  accept_downloads=True)
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)))
        page.on('console', lambda m: errs.append('CONSOLE: ' + m.text) if m.type == 'error' else None)
        await page.goto(BASE, wait_until='networkidle')

        # ---------- 设置入口 ----------
        await page.click('.h-btn')
        await page.wait_for_timeout(300)
        ck('设置弹窗打开', await page.locator('#settingsDialog').is_visible())

        sw_before = await page.evaluate("document.getElementById('setAskName').classList.contains('on')")
        ck('默认关闭', sw_before is False)

        await page.click('#setAskName')
        await page.wait_for_timeout(200)
        sw_after = await page.evaluate("document.getElementById('setAskName').classList.contains('on')")
        ck('点击后开启', sw_after is True)

        stored = await page.evaluate("localStorage.getItem('pdfextractor.settings')")
        ck('已写入 localStorage', stored and 'askName' in stored, str(stored))

        await page.click('#settingsDialog .btn.primary')
        await page.wait_for_timeout(300)
        ck('设置弹窗关闭', await page.locator('#settingsDialog').is_hidden())

        # ---------- 开启后导出会询问 ----------
        await page.set_input_files('#fileInput', PDF)
        await page.wait_for_selector('#pageList .card canvas', timeout=20000)
        await page.wait_for_timeout(1200)
        cards = page.locator('#pageList .card')
        for i in range(2):
            await cards.nth(i).click()
        await page.wait_for_timeout(300)

        await page.click('#extractBtn')
        await page.wait_for_timeout(600)
        ck('导出时弹出改名框', await page.locator('#nameDialog').is_visible())

        prefilled = await page.input_value('#nameInput')
        ext = await page.text_content('#nameExt')
        ck('预填默认主名', prefilled.startswith('sample_') and '第' in prefilled, prefilled)
        ck('扩展名固定显示', ext.strip() == '.pdf', ext)

        # 改成自定义名字
        await page.fill('#nameInput', '我的合同_精选')
        async with page.expect_download(timeout=30000) as dl:
            await page.click('#nameOk')
        d = await dl.value
        ck('使用自定义文件名', d.suggested_filename == '我的合同_精选.pdf', d.suggested_filename)
        await d.save_as(os.path.join(OUT, d.suggested_filename))

        # ---------- 取消不导出 ----------
        await page.click('#extractBtn')
        await page.wait_for_timeout(500)
        cancelled = True
        try:
            async with page.expect_download(timeout=2500) as _:
                await page.click('#nameCancel')
            cancelled = False
        except Exception:
            pass
        ck('点取消不产生文件', cancelled)

        # ---------- 关闭开关后直接导出 ----------
        await page.click('.h-btn')
        await page.wait_for_timeout(300)
        await page.click('#setAskName')
        await page.wait_for_timeout(200)
        await page.click('#settingsDialog .btn.primary')
        await page.wait_for_timeout(300)

        async with page.expect_download(timeout=30000) as dl2:
            await page.click('#extractBtn')
        d2 = await dl2.value
        ck('关闭后不再询问', await page.locator('#nameDialog').is_hidden())
        ck('使用默认文件名', d2.suggested_filename.startswith('sample_') and d2.suggested_filename.endswith('.pdf'),
           d2.suggested_filename)

        # ---------- 刷新后设置仍在 ----------
        await page.evaluate("localStorage.setItem('pdfextractor.settings', JSON.stringify({askName:true}))")
        await page.reload(wait_until='networkidle')
        await page.click('.h-btn')
        await page.wait_for_timeout(300)
        sw_reload = await page.evaluate("document.getElementById('setAskName').classList.contains('on')")
        ck('刷新后设置保持', sw_reload is True)

        ck('无 JS 错误', len(errs) == 0, str(errs[:2]))
        await b.close()

asyncio.run(main())
ok = sum(1 for _, c, _ in results if c)
print(f'\n通过 {ok} / {len(results)}\n')
for name, c, detail in results:
    print(('  PASS ' if c else '  FAIL ') + name + ('  ' + detail if detail else ''))
sys.exit(0 if ok == len(results) else 1)
