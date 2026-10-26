#!/usr/bin/env python3
"""输出正确性测试：验证生成的文件页数、尺寸、可打开性是否与预期一致。"""
import asyncio, os, sys, zipfile
import fitz
from PIL import Image
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
CASES = '/tmp/pdfcases'
PDF = '/workspace/test/sample.pdf'
OUT = '/tmp/outcheck'
errs, results = [], []

def ck(name, cond, detail=''):
    results.append((name, bool(cond), detail))

def pages_of(path):
    d = fitz.open(path)
    n = d.page_count
    d.close()
    return n

async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844},
                                  device_scale_factor=2, is_mobile=True, has_touch=True,
                                  accept_downloads=True)
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)))
        await page.goto(BASE, wait_until='networkidle')

        # ---------- 1. 提取：页数是否等于选中数 ----------
        await page.set_input_files('#fileInput', '/tmp/pdfcases/multipage.pdf')
        await page.wait_for_selector('#pageList .card canvas', timeout=20000)
        await page.wait_for_timeout(1500)
        for i in [0, 2, 4]:                       # 选第 1/3/5 页
            await page.locator('#pageList .card').nth(i).click()
        await page.wait_for_timeout(400)
        async with page.expect_download(timeout=60000) as dl:
            await page.click('#extractBtn')
        d = await dl.value
        f = os.path.join(OUT, 'extract.pdf')
        await d.save_as(f)
        n = pages_of(f)
        ck('提取 3 页 → 输出 3 页', n == 3, f'实际 {n} 页')
        # 检查内容确实是第 1/3/5 页
        doc = fitz.open(f)
        texts = [doc[i].get_text().strip() for i in range(n)]
        doc.close()
        ok = all(f'Page {k}' in texts[i] for i, k in enumerate([1, 3, 5]))
        ck('提取的页面内容正确', ok, str(texts))

        # ---------- 2. 拆分：ZIP 内文件数 = 页数 ----------
        async with page.expect_download(timeout=120000) as dl:
            await page.click('#splitBtn')
        d = await dl.value
        f = os.path.join(OUT, 'split.zip')
        await d.save_as(f)
        with zipfile.ZipFile(f) as z:
            names = [x for x in z.namelist() if x.endswith('.pdf')]
        ck('拆分 3 页 → ZIP 内 3 个 PDF', len(names) == 3, f'实际 {len(names)} 个')
        # 每个都应该是 1 页
        allone = True
        with zipfile.ZipFile(f) as z:
            for nm in names:
                data = z.read(nm)
                t = fitz.open(stream=data, filetype='pdf')
                if t.page_count != 1: allone = False
                t.close()
        ck('拆分的每个文件都是 1 页', allone)

        # ---------- 3. 合并：页数 = 各文件之和 ----------
        await page.click('#tabMerge')
        await page.wait_for_timeout(400)
        await page.set_input_files('#mergeInput', ['/tmp/pdfcases/multipage.pdf', PDF])
        await page.wait_for_timeout(2500)
        async with page.expect_download(timeout=120000) as dl:
            await page.click('#mergeGo')
        d = await dl.value
        f = os.path.join(OUT, 'merge.pdf')
        await d.save_as(f)
        n = pages_of(f)
        ck('合并 10+6 页 → 16 页', n == 16, f'实际 {n} 页')

        # ---------- 4. 转图片：数量与尺寸 ----------
        await page.click('#tabConvert')
        await page.wait_for_timeout(400)
        await page.set_input_files('#cvPdfInput', '/tmp/pdfcases/multipage.pdf')
        await page.wait_for_timeout(2500)
        await page.click('.seg[data-name="dpi"] >> text=2x')
        await page.wait_for_timeout(200)
        async with page.expect_download(timeout=180000) as dl:
            await page.click('text=导出图片')
        d = await dl.value
        f = os.path.join(OUT, 'images.zip')
        await d.save_as(f)
        with zipfile.ZipFile(f) as z:
            imgs = [x for x in z.namelist() if x.lower().endswith(('.jpg', '.png'))]
            ck('10 页 → 10 张图片', len(imgs) == 10, f'实际 {len(imgs)}')
            first = sorted(imgs)[0]
            with z.open(first) as src:
                im = Image.open(src)
                # A4 = 595pt，2x = 144dpi → 1190px
                ck('2x 导出宽度 ≈ 1190px', abs(im.width - 1190) <= 6, f'{im.width}px')

        # ---------- 5. 压缩：可打开、页数不变 ----------
        await page.click('#tabCompress')
        await page.wait_for_timeout(300)
        await page.set_input_files('#cmpPdfInput', '/tmp/pdfcases/multipage.pdf')
        await page.wait_for_timeout(2500)
        await page.click('.seg[data-name="cmpmode"] >> text=高质量')
        await page.wait_for_timeout(300)
        async with page.expect_download(timeout=180000) as dl:
            await page.click('text=开始压缩')
        d = await dl.value
        f = os.path.join(OUT, 'compress.pdf')
        await d.save_as(f)
        try:
            n = pages_of(f)
            ck('压缩后仍可打开', True, f'{n} 页')
            ck('压缩后页数不变', n == 10, f'实际 {n}')
        except Exception as e:
            ck('压缩后仍可打开', False, str(e)[:60])
        await page.wait_for_timeout(2500)
        if await page.locator('#compareDialog').is_visible():
            await page.click('#compareDialog .btn.primary')
            await page.wait_for_timeout(300)

        # ---------- 6. 旋转：导出后页面尺寸应交换 ----------
        await page.click('#tabSingle')
        await page.wait_for_timeout(400)
        await page.set_input_files('#fileInput', '/tmp/pdfcases/landscape.pdf')
        await page.wait_for_selector('#pageList .card canvas', timeout=20000)
        await page.wait_for_timeout(1200)
        await page.locator('#pageList .card').first.click()
        await page.wait_for_timeout(300)
        await page.click('#rotateBtn')          # 转 90°
        await page.wait_for_timeout(1500)
        async with page.expect_download(timeout=60000) as dl:
            await page.click('#extractBtn')
        d = await dl.value
        f = os.path.join(OUT, 'rotated.pdf')
        await d.save_as(f)
        doc = fitz.open(f)
        r = doc[0].rect
        doc.close()
        # 原页面 842x595（横向），旋转后应变竖 595x842
        ck('旋转 90° 后页面尺寸交换', r.width < r.height, f'{r.width:.0f}x{r.height:.0f}')

        # ---------- 7. 倒序：第一页应是原最后一页 ----------
        await page.click('#tabSingle')
        await page.wait_for_timeout(400)
        await page.set_input_files('#fileInput', '/tmp/pdfcases/multipage.pdf')
        await page.wait_for_selector('#pageList .card canvas', timeout=20000)
        await page.wait_for_timeout(1500)
        for i in range(3):
            await page.locator('#pageList .card').nth(i).click()
        await page.wait_for_timeout(300)
        await page.click('#reverseSwitch')
        await page.wait_for_timeout(400)
        async with page.expect_download(timeout=60000) as dl:
            await page.click('#extractBtn')
        d = await dl.value
        f = os.path.join(OUT, 'reverse.pdf')
        await d.save_as(f)
        doc = fitz.open(f)
        first = doc[0].get_text().strip()
        doc.close()
        ck('倒序导出：第一页是原第 3 页', 'Page 3' in first, first[:40])

        ck('无 JS 错误', len(errs) == 0, str(errs[:2]))
        await b.close()

asyncio.run(main())
ok = sum(1 for _, c, _ in results if c)
print(f'\n通过 {ok} / {len(results)}\n')
for name, c, detail in results:
    print(('  PASS ' if c else '  FAIL ') + name + ('  ' + detail if detail else ''))
sys.exit(0 if ok == len(results) else 1)
