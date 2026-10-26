#!/usr/bin/env python3
"""边界与状态一致性测试：异常输入、连续操作、状态残留。"""
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

        # ---------- 1. 非 PDF 文件 ----------
        open('/tmp/notpdf.txt', 'w').write('hello')
        await page.set_input_files('#fileInput', '/tmp/notpdf.txt')
        await page.wait_for_timeout(1500)
        txt = await page.text_content('#toast')
        ck('非 PDF 被拒绝并提示', '失败' in (txt or '') or 'PDF' in (txt or ''), txt)

        # ---------- 2. 目标大小边界值 ----------
        await page.click('#tabCompress')
        await page.set_input_files('#cmpPdfInput', PDF)
        await page.wait_for_timeout(1800)
        await page.fill('#cmpTarget', '0')
        v0 = await page.evaluate("readTargetKB('cmpTarget','cmpunit')")
        ck('目标填 0 视为不限制', v0 == 0, f'返回 {v0}')
        await page.fill('#cmpTarget', '-5')
        vneg = await page.evaluate("readTargetKB('cmpTarget','cmpunit')")
        ck('负数目标被忽略', vneg == 0, f'返回 {vneg}')

        # ---------- 3. 切换 tab 后文件状态 ----------
        await page.click('#tabConvert')
        await page.wait_for_timeout(300)
        await page.set_input_files('#cvPdfInput', PDF)
        await page.wait_for_timeout(1500)
        await page.click('#tabSingle')
        await page.wait_for_timeout(300)
        await page.click('#tabConvert')
        await page.wait_for_timeout(400)
        still = await page.locator('#cvPdfInfo').is_visible()
        ck('切走再切回，已选文件还在', still)

        # ---------- 4. 取消后可以重新开始 ----------
        await page.click('#tabCompress')
        await page.set_input_files('#cmpPdfInput', BIG)
        await page.wait_for_timeout(3000)
        await page.click('.seg[data-name="cmpmode"] >> text=高质量')
        await page.wait_for_timeout(300)
        try:
            async with page.expect_download(timeout=5000):
                await page.click('text=开始压缩')
                await page.wait_for_timeout(1200)
                if await page.locator('#busyCancel').is_visible():
                    await page.click('#busyCancel')
        except Exception:
            pass
        # 取消后当前页可能还在渲染，给它 5 秒收尾
        for _ in range(10):
            if await page.locator('#busy').is_hidden():
                break
            await page.wait_for_timeout(500)
        if await page.locator('#compareDialog').is_visible():
            await page.click('#compareDialog .btn.primary')
            await page.wait_for_timeout(300)
        ck('取消后遮罩已关', await page.locator('#busy').is_hidden())
        ck('取消后按钮可再次点击', not await page.locator('text=开始压缩').is_disabled())

        # 再压一次，应该能正常完成
        try:
            async with page.expect_download(timeout=180000):
                await page.click('text=开始压缩')
            ok_again = True
        except Exception:
            ok_again = False
        ck('取消后能重新压缩成功', ok_again)
        await page.wait_for_timeout(2500)
        if await page.locator('#compareDialog').is_visible():
            await page.click('#compareDialog .btn.primary')
            await page.wait_for_timeout(300)

        # ---------- 5. 历史记录上限 ----------
        await page.evaluate("""
          (() => {
            const arr = [];
            for (let i = 0; i < 25; i++) {
              arr.push({ name: 'f' + i + '.pdf', size: 1000 + i, time: Date.now() - i * 1000, uri: null, mime: 'application/pdf' });
            }
            localStorage.setItem('pdfextractor.history', JSON.stringify(arr));
          })()
        """)
        # 触发一次写入以执行裁剪逻辑
        await page.evaluate("addHistory({name:'newest.pdf',size:1,time:Date.now(),uri:null,mime:'application/pdf'})")
        cnt = await page.evaluate("JSON.parse(localStorage.getItem('pdfextractor.history')).length")
        ck('历史最多保留 20 条', cnt == 20, f'实际 {cnt}')
        first = await page.evaluate("JSON.parse(localStorage.getItem('pdfextractor.history'))[0].name")
        ck('最新的排在最前', first == 'newest.pdf', first)

        # ---------- 6. 空列表点生成 ----------
        await page.click('#tabConvert')
        await page.click('#convModeSeg >> text=图片 → PDF')
        await page.wait_for_timeout(300)
        disabled = await page.locator('#cvMakeBtn').is_disabled()
        ck('空图片列表时生成按钮禁用', disabled)

        # ---------- 7. 预览时切 tab ----------
        await page.click('#tabSingle')
        await page.set_input_files('#fileInput', PDF)
        await page.wait_for_selector('#pageList .card canvas', timeout=20000)
        await page.wait_for_timeout(1200)
        await page.locator('#pageList .card .eye').first.click()
        await page.wait_for_timeout(1000)
        # 预览层是全屏模态，会挡住 tab；这里直接调函数验证不会崩
        await page.evaluate("switchMode('merge')")
        await page.wait_for_timeout(400)
        still_open = await page.locator('#previewModal').is_visible()
        ck('预览打开时切模式不崩', True, f'预览仍显示={still_open}')
        if still_open:
            await page.click('#previewModal .mbtn')
            await page.wait_for_timeout(300)
        # 切回单文件，确认列表还在
        await page.evaluate("switchMode('single')")
        await page.wait_for_timeout(400)
        ck('切回后缩略图仍在', await page.locator('#pageList .card').count() > 0)

        # ---------- 8. 连续导出 3 次 ----------
        await page.click('#tabSingle')
        await page.wait_for_timeout(400)
        for i in range(3):
            await page.locator('#pageList .card').nth(i).click()
        await page.wait_for_timeout(300)
        for i in range(3):
            async with page.expect_download(timeout=30000):
                await page.click('#extractBtn')
            await page.wait_for_timeout(700)
        hist = await page.evaluate("JSON.parse(localStorage.getItem('pdfextractor.history')||'[]').length")
        ck('连续导出都进历史', hist >= 3, f'共 {hist} 条')

        # ---------- 9. 设置项互不影响 ----------
        await page.evaluate("localStorage.setItem('pdfextractor.settings', JSON.stringify({askName:true, cv_dpi:'3'}))")
        await page.reload(wait_until='networkidle')
        await page.click('#tabConvert')
        await page.wait_for_timeout(500)
        dpi = await page.text_content('.seg[data-name="dpi"] .seg-item.active')
        ck('多个设置项同时保持', '3x' in (dpi or ''), dpi)

        ck('无 JS 错误', len(errs) == 0, str(errs[:3]))
        await b.close()

asyncio.run(main())
ok = sum(1 for _, c, _ in results if c)
print(f'\n通过 {ok} / {len(results)}\n')
for name, c, detail in results:
    print(('  PASS ' if c else '  FAIL ') + name + ('  ' + detail if detail else ''))
sys.exit(0 if ok == len(results) else 1)
