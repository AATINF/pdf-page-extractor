#!/usr/bin/env python3
"""UI 视觉测试：多视口溢出、触控尺寸、弹窗位置、深色模式、长文件名。"""
import asyncio, sys
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
PDF = '/workspace/test/sample.pdf'
errs, results = [], []

def ck(name, cond, detail=''):
    results.append((name, bool(cond), detail))

VIEWPORTS = [('320', 320, 640), ('390', 390, 844), ('430', 430, 932), ('横屏', 844, 390)]

METRICS = """() => {
  const de = document.documentElement;
  const vis = el => el.offsetParent !== null && el.getBoundingClientRect().height > 0;
  const btns = [...document.querySelectorAll('button')].filter(vis)
    .map(b => Math.round(b.getBoundingClientRect().height));
  return {
    scrollW: de.scrollWidth, clientW: de.clientWidth,
    minBtn: btns.length ? Math.min(...btns) : 0,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    tabs: document.querySelectorAll('.tab').length,
  };
}"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-dev-shm-usage'])

        # ---------- 1. 多视口溢出与触控 ----------
        for label, w, h in VIEWPORTS:
            ctx = await b.new_context(viewport={'width': w, 'height': h},
                                      device_scale_factor=2, is_mobile=True, has_touch=True)
            page = await ctx.new_page()
            page.on('pageerror', lambda e: errs.append(f'{label}: {e}'))
            await page.goto(BASE, wait_until='networkidle')
            await page.wait_for_timeout(400)

            m = await page.evaluate(METRICS)
            ck(f'[{label}] 首页无横向溢出', m['scrollW'] <= m['clientW'],
               f"{m['scrollW']}/{m['clientW']}")
            ck(f'[{label}] 4 个 tab 都在', m['tabs'] == 4, f"tabs={m['tabs']}")

            # 切到压缩页，检查三档按钮是否挤爆
            await page.evaluate("switchMode('compress')")
            await page.wait_for_timeout(400)
            m2 = await page.evaluate(METRICS)
            ck(f'[{label}] 压缩页无横向溢出', m2['scrollW'] <= m2['clientW'],
               f"{m2['scrollW']}/{m2['clientW']}")
            ck(f'[{label}] 按钮触控高度 ≥34px', m2['minBtn'] >= 34, f"min={m2['minBtn']}")

            tri = await page.evaluate("""() => {
              const items = [...document.querySelectorAll('.seg-tri .seg-item')];
              if (!items.length) return null;
              const r = items[0].getBoundingClientRect();
              return { w: Math.round(r.width), overflow: items.some(el => el.scrollWidth > el.clientWidth + 1) };
            }""")
            if tri:
                ck(f'[{label}] 三档按钮文字未溢出', not tri['overflow'], str(tri))
                ck(f'[{label}] 三档按钮宽度合理', tri['w'] >= 70, f"w={tri['w']}")
            await ctx.close()

        # ---------- 2. 弹窗位置（390 竖屏） ----------
        ctx = await b.new_context(viewport={'width': 390, 'height': 844},
                                  device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errs.append('dialog: ' + str(e)))
        await page.goto(BASE, wait_until='networkidle')

        await page.evaluate("openSettings()")
        await page.wait_for_timeout(400)
        pos = await page.evaluate("""() => {
          const box = document.querySelector('#settingsDialog .dialog-box').getBoundingClientRect();
          return { top: Math.round(box.top), bottom: Math.round(window.innerHeight - box.bottom),
                   w: Math.round(box.width), vh: window.innerHeight };
        }""")
        ck('设置弹窗大致居中', abs(pos['top'] - pos['bottom']) < pos['vh'] * 0.15,
           f"上{pos['top']} 下{pos['bottom']}")
        ck('设置弹窗宽度不撑满', pos['w'] < 390 * 0.95, f"w={pos['w']}")
        await page.evaluate("closeSettings()")
        await page.wait_for_timeout(300)

        # ---------- 3. 深色模式 ----------
        await page.emulate_media(color_scheme='dark')
        await page.wait_for_timeout(500)
        dk = await page.evaluate(METRICS)
        ck('深色模式生效', dk['bodyBg'] != 'rgb(245, 246, 248)', dk['bodyBg'])

        await page.evaluate("openSettings()")
        await page.wait_for_timeout(400)
        sw = await page.evaluate("""() => {
          const box = document.querySelector('#settingsDialog .dialog-box');
          return getComputedStyle(box).backgroundColor;
        }""")
        ck('深色下弹窗不是纯白', sw not in ('rgb(255, 255, 255)',), sw)
        await page.evaluate("closeSettings()")

        # ---------- 4. 长文件名不撑破 ----------
        await page.click('#tabConvert')
        await page.set_input_files('#cvPdfInput', PDF)
        await page.wait_for_timeout(1500)
        await page.evaluate("document.getElementById('cvPdfName').textContent = '这是一个非常非常非常长的文件名'.repeat(4) + '.pdf'")
        await page.wait_for_timeout(300)
        over = await page.evaluate("""() => {
          const de = document.documentElement;
          const el = document.getElementById('cvPdfName');
          return { pageOver: de.scrollWidth > de.clientWidth,
                   selfOver: el.scrollWidth > el.clientWidth + 2 };
        }""")
        ck('超长文件名不撑破页面', not over['pageOver'], str(over))
        ck('超长文件名被省略', over['selfOver'], '已截断')

        # ---------- 5. 深色下新组件颜色 ----------
        await page.evaluate("switchMode('compress')")
        await page.wait_for_timeout(300)
        tipBg = await page.evaluate("""() => {
          const t = document.getElementById('cmpKindTip');
          return t ? getComputedStyle(t).backgroundColor : null;
        }""")
        ck('类型提示有独立底色', tipBg and tipBg != 'rgba(0, 0, 0, 0)', str(tipBg))

        await ctx.close()
        await b.close()

asyncio.run(main())
ok = sum(1 for _, c, _ in results if c)
print(f'\n通过 {ok} / {len(results)}\n')
for name, c, detail in results:
    print(('  PASS ' if c else '  FAIL ') + name + ('  ' + detail if detail else ''))
sys.exit(0 if ok == len(results) else 1)
