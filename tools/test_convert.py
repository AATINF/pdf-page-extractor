#!/usr/bin/env python3
"""转换 / 压缩功能 e2e 测试：真实触发下载并校验产物。"""
import asyncio, os, sys
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
PDF = '/workspace/test/sample.pdf'
OUT = '/tmp/cvout'
errs, results = [], []

def fmt(n):
    return f'{n/1024/1024:.2f}MB' if n > 1024*1024 else f'{n/1024:.0f}KB'

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

        # ---------- 转换：PDF → 图片 ----------
        await page.click('#tabConvert')
        await page.wait_for_timeout(400)
        ck('转换面板可见', await page.locator('#panelConvert').is_visible())

        await page.set_input_files('#cvPdfInput', PDF)
        await page.wait_for_timeout(1500)
        ck('PDF 已读入', await page.locator('#cvPdfInfo').is_visible())
        meta = await page.text_content('#cvPdfMeta')
        ck('页数与体积已显示', '6 页' in (meta or ''), meta)

        async with page.expect_download(timeout=60000) as dl:
            await page.click('text=导出图片')
        d = await dl.value
        path = os.path.join(OUT, d.suggested_filename)
        await d.save_as(path)
        size = os.path.getsize(path)
        ck('导出图片 ZIP', d.suggested_filename.endswith('.zip') and size > 10000,
           f'{d.suggested_filename} {size} bytes')

        # ---------- 转换：图片 → PDF ----------
        await page.click('#convModeSeg >> text=图片 → PDF')
        await page.wait_for_timeout(300)
        # 造两张测试图
        for i in range(2):
            await page.set_input_files('#cvImgInput', f'/tmp/test_img_{i}.png')
            await page.wait_for_timeout(600)
        n = await page.locator('#cvImgList .img-item').count()
        ck('图片已加入列表', n == 2, f'count={n}')
        ck('生成按钮已启用', not await page.locator('#cvMakeBtn').is_disabled())

        async with page.expect_download(timeout=60000) as dl2:
            await page.click('#cvMakeBtn')
        d2 = await dl2.value
        path2 = os.path.join(OUT, d2.suggested_filename)
        await d2.save_as(path2)
        ck('生成 PDF', d2.suggested_filename.endswith('.pdf') and os.path.getsize(path2) > 5000,
           f'{d2.suggested_filename} {os.path.getsize(path2)} bytes')

        # ---------- 压缩：PDF 图片化 ----------
        await page.click('#tabCompress')
        await page.wait_for_timeout(400)
        ck('压缩面板可见', await page.locator('#panelCompress').is_visible())

        BIG = '/workspace/test/big.pdf'   # 25 页 / 3.2MB，用于真正验证压缩
        await page.set_input_files('#cmpPdfInput', BIG)
        await page.wait_for_timeout(2500)
        ck('压缩 PDF 已读入', await page.locator('#cmpPdfInfo').is_visible())

        big_size = os.path.getsize(BIG)
        async with page.expect_download(timeout=180000) as dl3:
            await page.click('text=开始压缩')
        d3 = await dl3.value
        path3 = os.path.join(OUT, d3.suggested_filename)
        await d3.save_as(path3)
        ck('PDF 图片化压缩变小', os.path.getsize(path3) < big_size,
           f'{fmt(big_size)} -> {fmt(os.path.getsize(path3))} ({d3.suggested_filename})')

        # 压缩后会自动弹出效果对比，先关掉再继续
        await page.wait_for_timeout(2500)
        if await page.locator('#compareDialog').is_visible():
            ck('压缩后弹出对比', True)
            await page.click('#compareDialog .btn.primary')
            await page.wait_for_timeout(400)

        # ---------- 压缩：目标大小 ----------
        await page.fill('#cmpTarget', '300')
        async with page.expect_download(timeout=180000) as dl4:
            await page.click('text=开始压缩')
        d4 = await dl4.value
        path4 = os.path.join(OUT, 'target_' + d4.suggested_filename)
        await d4.save_as(path4)
        t4 = os.path.getsize(path4)
        ck('目标大小 300KB 内达成', t4 <= 300 * 1024,
           f'实际 {fmt(t4)}（目标 300KB）')

        await page.wait_for_timeout(2500)
        if await page.locator('#compareDialog').is_visible():
            await page.click('#compareDialog .btn.primary')
            await page.wait_for_timeout(300)

        # ---------- 压缩：图片 ----------
        await page.click('#cmpModeSeg >> text=图片压缩')
        await page.wait_for_timeout(300)
        await page.set_input_files('#cmpImgInput', '/tmp/test_img_0.png')
        await page.wait_for_timeout(600)
        ck('压缩图片已加入', await page.locator('#cmpImgList .img-item').count() == 1)

        async with page.expect_download(timeout=60000) as dl5:
            await page.click('text=压缩并导出')
        d5 = await dl5.value
        path5 = os.path.join(OUT, d5.suggested_filename)
        await d5.save_as(path5)
        ck('图片压缩输出', os.path.getsize(path5) > 1000,
           f'{d5.suggested_filename} {os.path.getsize(path5)} bytes')

        ck('无 JS 错误', len(errs) == 0, str(errs[:2]))
        await b.close()

asyncio.run(main())
ok = sum(1 for _, c, _ in results if c)
print(f'\n通过 {ok} / {len(results)}\n')
for name, c, detail in results:
    print(('  PASS ' if c else '  FAIL ') + name + ('  ' + detail if detail else ''))
sys.exit(0 if ok == len(results) else 1)
