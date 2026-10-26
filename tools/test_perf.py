#!/usr/bin/env python3
"""性能测试：100 页文档的打开、首屏缩略图、转图片耗时。"""
import asyncio, os, sys, time
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
BIG = '/tmp/pdfcases/hundred.pdf'
OUT = '/tmp/perfcheck'
results = []

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
        await page.goto(BASE, wait_until='networkidle')

        # 打开 100 页文档
        t0 = time.time()
        await page.set_input_files('#fileInput', BIG)
        await page.wait_for_selector('#pageList .card', timeout=60000)
        t_open = time.time() - t0
        ck('100 页文档打开 < 8s', t_open < 8, f'{t_open:.1f}s')

        # 卡片数量
        n = await page.locator('#pageList .card').count()
        ck('渲染出 100 张卡片', n == 100, f'{n} 张')

        # 首屏缩略图（前 9 张）
        t0 = time.time()
        await page.wait_for_function(
            "() => document.querySelectorAll('#pageList .card canvas').length >= 9 && "
            "[...document.querySelectorAll('#pageList .card canvas')].slice(0,9).every(c => c.width > 10)",
            timeout=30000)
        t_thumb = time.time() - t0
        ck('首屏 9 张缩略图 < 6s', t_thumb < 6, f'{t_thumb:.1f}s')

        # 滚到底部再回顶（考察并发队列）
        t0 = time.time()
        for _ in range(8):
            await page.mouse.wheel(0, 3000)
            await page.wait_for_timeout(150)
        await page.wait_for_timeout(3000)
        t_scroll = time.time() - t0
        drawn = await page.evaluate(
            "[...document.querySelectorAll('#pageList .card canvas')].filter(c=>c.width>10).length")
        ck('滚动到底后大部分已渲染', drawn >= 40, f'{drawn}/100 张，{t_scroll:.1f}s')

        # 转图片（全部 100 页，1x 快一些）
        await page.click('#tabConvert')
        await page.wait_for_timeout(400)
        await page.set_input_files('#cvPdfInput', BIG)
        await page.wait_for_timeout(4000)
        await page.click('.seg[data-name="dpi"] >> text=1x')
        await page.wait_for_timeout(200)
        t0 = time.time()
        async with page.expect_download(timeout=300000) as dl:
            await page.click('text=导出图片')
        d = await dl.value
        f = os.path.join(OUT, 'hundred.zip')
        await d.save_as(f)
        t_export = time.time() - t0
        size = os.path.getsize(f)
        ck('100 页转图片 < 120s', t_export < 120, f'{t_export:.1f}s')
        ck('ZIP 体积合理', size > 500000, f'{size/1024/1024:.1f} MB')

        # 内存（粗略）
        mem = await page.evaluate("performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : -1")
        ck('JS 堆内存 < 500MB', mem < 500 or mem < 0, f'{mem} MB')

        await b.close()

asyncio.run(main())
ok = sum(1 for _, c, _ in results if c)
print(f'\n通过 {ok} / {len(results)}\n')
for name, c, detail in results:
    print(('  PASS ' if c else '  FAIL ') + name + ('  ' + detail if detail else ''))
sys.exit(0 if ok == len(results) else 1)
