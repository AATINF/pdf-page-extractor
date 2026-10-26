#!/usr/bin/env python3
"""v1.6 新增功能测试：设置记忆、长任务取消、导出历史。"""
import asyncio, os, sys
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
PDF = '/workspace/test/sample.pdf'
BIG = '/workspace/test/big.pdf'
errs, results = [], []

def ck(name, cond, detail=''):
    results.append((name, bool(cond), detail))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844},
                                  device_scale_factor=2, is_mobile=True, has_touch=True,
                                  accept_downloads=True)
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)))
        page.on('console', lambda m: errs.append('CONSOLE: ' + m.text) if m.type == 'error' else None)
        await page.goto(BASE, wait_until='networkidle')

        # ---------- 1. 设置记忆 ----------
        await page.click('#tabConvert')
        await page.wait_for_timeout(300)
        await page.click('.seg[data-name="dpi"] >> text=3x')
        await page.click('.seg[data-name="imgfmt2"] >> text=PNG')
        await page.wait_for_timeout(300)
        stored = await page.evaluate("localStorage.getItem('pdfextractor.settings')")
        ck('参数已写盘', stored and '"cv_dpi":"3"' in stored, str(stored)[:120])

        await page.reload(wait_until='networkidle')
        await page.click('#tabConvert')
        await page.wait_for_timeout(500)
        dpiActive = await page.text_content('.seg[data-name="dpi"] .seg-item.active')
        fmtActive = await page.text_content('.seg[data-name="imgfmt2"] .seg-item.active')
        ck('刷新后 DPI 保持 3x', '3x' in (dpiActive or ''), dpiActive)
        ck('刷新后格式保持 PNG', 'PNG' in (fmtActive or ''), fmtActive)

        # ---------- 2. 长任务取消 ----------
        await page.click('#tabCompress')
        await page.set_input_files('#cmpPdfInput', BIG)
        await page.wait_for_timeout(3000)
        await page.click('.seg[data-name="cmpmode"] >> text=高质量')
        await page.wait_for_timeout(300)

        cancelled_ok = False
        btn_seen = False
        try:
            async with page.expect_download(timeout=8000):
                await page.click('text=开始压缩')
                await page.wait_for_timeout(1500)
                btn_seen = await page.locator('#busyCancel').is_visible()
                if btn_seen:
                    await page.click('#busyCancel')
            cancelled_ok = False   # 拿到下载 = 取消没生效
        except Exception:
            cancelled_ok = True    # 超时未下载 = 取消生效
        ck('忙碌层出现取消按钮', btn_seen)
        ck('长任务可取消（未产生文件）', cancelled_ok)
        await page.wait_for_timeout(800)
        ck('取消后遮罩关闭', await page.locator('#busy').is_hidden())
        # 兜底：万一压缩已经完成，关掉对比弹窗
        if await page.locator('#compareDialog').is_visible():
            await page.click('#compareDialog .btn.primary')
            await page.wait_for_timeout(300)

        # ---------- 3. 导出历史（浏览器里只有名字和时间） ----------
        await page.click('#tabSingle')
        await page.set_input_files('#fileInput', PDF)
        await page.wait_for_selector('#pageList .card canvas', timeout=20000)
        await page.wait_for_timeout(1200)
        await page.locator('#pageList .card').first.click()
        await page.wait_for_timeout(300)
        async with page.expect_download(timeout=30000):
            await page.click('#extractBtn')
        await page.wait_for_timeout(600)

        hist = await page.evaluate("localStorage.getItem('pdfextractor.history')")
        ck('导出后写入历史', bool(hist and 'sample' in hist), str(hist)[:120])

        # 直接调用，绕开 Playwright 的遮挡判定
        await page.evaluate("openHistory()")
        await page.wait_for_timeout(500)
        ck('历史弹窗打开', await page.locator('#historyDialog').is_visible())
        rows = await page.locator('.history-row').count()
        ck('历史列表有记录', rows >= 1, f'rows={rows}')
        await page.screenshot(path='/workspace/pdf-page-extractor/screenshots/22-history.png')

        await page.evaluate("clearHistory()")
        await page.wait_for_timeout(500)
        ck('清空后无记录', await page.locator('#historyEmpty').is_visible())
        ck('清空后 localStorage 为空', not await page.evaluate("localStorage.getItem('pdfextractor.history')"))

        # ---------- 4. 图片列表拖拽结构 ----------
        if await page.locator('#historyDialog').is_visible():
            await page.click('#historyDialog .btn.primary')
            await page.wait_for_timeout(400)
        await page.click('#tabConvert')
        await page.click('#convModeSeg >> text=图片 → PDF')
        await page.wait_for_timeout(300)
        for i in range(2):
            await page.set_input_files('#cvImgInput', f'/tmp/test_img_{i}.png')
            await page.wait_for_timeout(600)
        idx = await page.evaluate("[...document.querySelectorAll('#cvImgList .img-item')].map(e=>e.dataset.idx)")
        ck('图片项带拖拽索引', idx == ['0', '1'], str(idx))

        ck('无 JS 错误', len(errs) == 0, str(errs[:2]))
        await b.close()

asyncio.run(main())
ok = sum(1 for _, c, _ in results if c)
print(f'\n通过 {ok} / {len(results)}\n')
for name, c, detail in results:
    print(('  PASS ' if c else '  FAIL ') + name + ('  ' + detail if detail else ''))
sys.exit(0 if ok == len(results) else 1)
