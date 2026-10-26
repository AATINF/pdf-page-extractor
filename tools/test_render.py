#!/usr/bin/env python3
"""
渲染完整性检测。

对每个测试 PDF：用 MuPDF 渲染第 1 页作为参照，再用 App 的「PDF → 图片」导出，
对比两者的"墨量"（非白像素占比）。App 明显少于参照，说明有内容没画出来。
"""
import asyncio, os, sys
import fitz
from PIL import Image
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
CASES = '/tmp/pdfcases'
OUT = '/tmp/rendercheck'
results, errs = [], []

def ck(name, cond, detail=''):
    results.append((name, bool(cond), detail))

def ink_ratio(path):
    """非白像素占比，用来衡量"画了多少东西"。"""
    im = Image.open(path).convert('L')
    hist = im.histogram()
    total = sum(hist)
    return sum(hist[:240]) / total if total else 0.0

def ref_render(pdf, dpi=144):
    """用 MuPDF 渲染第 1 页作为参照。"""
    d = fitz.open(pdf)
    pix = d[0].get_pixmap(dpi=dpi)
    p = os.path.join(OUT, os.path.basename(pdf) + '_ref.png')
    pix.save(p)
    d.close()
    return p

async def main():
    os.makedirs(OUT, exist_ok=True)
    files = sorted(f for f in os.listdir(CASES) if f.endswith('.pdf') and f != 'encrypted.pdf')

    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844},
                                  device_scale_factor=2, is_mobile=True, has_touch=True,
                                  accept_downloads=True)
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)))
        await page.goto(BASE, wait_until='networkidle')
        await page.click('#tabConvert')
        await page.wait_for_timeout(400)
        # 固定 2x（144 DPI）与参照一致
        await page.click('.seg[data-name="dpi"] >> text=2x')
        await page.wait_for_timeout(200)

        for f in files:
            path = os.path.join(CASES, f)
            ref = ref_render(path)
            r_ref = ink_ratio(ref)

            await page.set_input_files('#cvPdfInput', path)
            await page.wait_for_timeout(2500)

            try:
                async with page.expect_download(timeout=60000) as dl:
                    await page.click('text=导出图片')
                d = await dl.value
                got = os.path.join(OUT, f + '_app' + os.path.splitext(d.suggested_filename)[1])
                await d.save_as(got)
                # 多页导出的是 ZIP，解出第一张来比对
                if got.endswith('.zip'):
                    import zipfile
                    with zipfile.ZipFile(got) as z:
                        first = sorted(n for n in z.namelist() if n.lower().endswith(('.jpg', '.png')))[0]
                        with z.open(first) as src, open(got + '_first.jpg', 'wb') as dst:
                            dst.write(src.read())
                    got = got + '_first.jpg'
            except Exception as e:
                ck(f'{f} 导出成功', False, str(e)[:80])
                continue

            r_app = ink_ratio(got)

            # 只有真正全白的页面才跳过；墨量低但仍大于 0 的必须比对
            if r_ref < 0.0002:
                ck(f'{f} 导出成功（空白页）', os.path.getsize(got) > 500, f'ref={r_ref:.5f}')
                continue

            ratio = r_app / r_ref
            ck(f'{f} 墨量不低于参照 70%', ratio >= 0.70,
               f'参照 {r_ref:.3f} / 实际 {r_app:.3f} = {ratio:.0%}')

        await b.close()

    ck('无 JS 错误', len(errs) == 0, str(errs[:2]))

asyncio.run(main())
ok = sum(1 for _, c, _ in results if c)
print(f'\n通过 {ok} / {len(results)}\n')
for name, c, detail in results:
    print(('  PASS ' if c else '  FAIL ') + name + ('  ' + detail if detail else ''))
sys.exit(0 if ok == len(results) else 1)
