#!/usr/bin/env python3
"""移动端布局断言：用可测量的数字代替"看着还行"。"""
import asyncio, sys
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
PDF = '/workspace/test/sample.pdf'
fails, oks = [], []

def ck(name, cond, detail=''):
    (oks if cond else fails).append(f'{name} {detail}')

M = """() => {
  const de = document.documentElement;
  const bb = document.getElementById('bottombar');
  const grid = document.getElementById('pageList');
  const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
  const bbBtns = [...document.querySelectorAll('.bb-btn')].map(b => Math.round(b.getBoundingClientRect().height));
  const vis = b => b.offsetParent !== null && b.getBoundingClientRect().height > 0;
  const normBtns = [...document.querySelectorAll('.btn')].filter(vis).map(b => Math.round(b.getBoundingClientRect().height));
  const tabBtns = [...document.querySelectorAll('.tab')].filter(vis).map(b => Math.round(b.getBoundingClientRect().height));
  const chipBtns = [...document.querySelectorAll('.chip')].filter(vis).map(b => Math.round(b.getBoundingClientRect().height));
  const bbH = bb ? Math.round(bb.getBoundingClientRect().height) : 0;
  const toast = document.getElementById('toast');
  return {
    scrollW: de.scrollWidth, clientW: de.clientWidth,
    bbH, cols, bbBtns,
    minBtn: normBtns.length ? Math.min(...normBtns) : 0,
    chipMin: chipBtns.length ? Math.min(...chipBtns) : 0,
    tabMin: tabBtns.length ? Math.min(...tabBtns) : 0,
    bodyPad: parseFloat(getComputedStyle(document.body).paddingBottom),
    headerH: Math.round(document.querySelector('header').getBoundingClientRect().height),
    hasBB: document.body.classList.contains('has-bb'),
    toastBottom: parseFloat(getComputedStyle(toast).bottom),
    bg: getComputedStyle(document.body).backgroundColor,
    colsVar: getComputedStyle(de).getPropertyValue('--bb-h').trim(),
  };
}"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844},
                                  device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(BASE, wait_until='networkidle')
        await page.wait_for_timeout(400)

        m = await page.evaluate(M)
        ck('无横向溢出(首页)', m['scrollW'] <= m['clientW'], f"scrollW={m['scrollW']} clientW={m['clientW']}")
        ck('顶栏不过高', m['headerH'] <= 110, f"headerH={m['headerH']}")
        ck('普通按钮≥44px', m['minBtn'] >= 44, f"minBtn={m['minBtn']}")
        ck('分段控件≥34px', m['tabMin'] >= 34, f"tabMin={m['tabMin']}")

        await page.set_input_files('#fileInput', PDF)
        await page.wait_for_selector('#pageList .card canvas', timeout=20000)
        await page.wait_for_timeout(1200)

        m = await page.evaluate(M)
        ck('缩略图3列', m['cols'] == 3, f"cols={m['cols']}")
        ck('芯片≥34px', m['chipMin'] >= 34, f"chipMin={m['chipMin']}")
        ck('无横向溢出(列表)', m['scrollW'] <= m['clientW'], f"scrollW={m['scrollW']}")
        ck('底栏打开后可见', m['bbH'] > 0, f"bbH={m['bbH']}")
        ck('未选中时留白够', m['bodyPad'] >= m['bbH'], f"pad={m['bodyPad']} bbH={m['bbH']}")

        cards = page.locator('#pageList .card')
        for i in range(3):
            await cards.nth(i).click()
        await page.wait_for_timeout(400)

        m = await page.evaluate(M)
        ck('选中后 has-bb', m['hasBB'] is True)
        ck('底栏高度合理(90-160)', 90 <= m['bbH'] <= 160, f"bbH={m['bbH']}")
        ck('底栏按钮≥50px', len(m['bbBtns']) == 2 and min(m['bbBtns']) >= 50, f"btns={m['bbBtns']}")
        ck('body留白≥底栏', m['bodyPad'] >= m['bbH'], f"pad={m['bodyPad']} bbH={m['bbH']}")
        ck('--bb-h已写入', m['colsVar'].endswith('px') and float(m['colsVar'][:-2]) > 0, f"var={m['colsVar']}")
        ck('toast避开底栏', m['toastBottom'] >= m['bbH'], f"toast={m['toastBottom']} bbH={m['bbH']}")
        ck('无横向溢出(选中)', m['scrollW'] <= m['clientW'], f"scrollW={m['scrollW']}")

        light_bg = m['bg']
        await page.emulate_media(color_scheme='dark')
        await page.wait_for_timeout(500)
        m = await page.evaluate(M)
        ck('深色模式生效', m['bg'] != light_bg, f"{light_bg} -> {m['bg']}")

        await page.set_viewport_size({'width': 844, 'height': 390})
        await page.wait_for_timeout(600)
        m = await page.evaluate(M)
        ck('横屏无溢出', m['scrollW'] <= m['clientW'], f"scrollW={m['scrollW']} clientW={m['clientW']}")
        ck('横屏底栏合理', 60 <= m['bbH'] <= 120, f"bbH={m['bbH']}")

        await page.set_viewport_size({'width': 320, 'height': 640})
        await page.wait_for_timeout(500)
        m = await page.evaluate(M)
        ck('320窄屏无溢出', m['scrollW'] <= m['clientW'], f"scrollW={m['scrollW']} clientW={m['clientW']}")

        ck('无JS错误', len(errs) == 0, str(errs[:2]))
        await b.close()

asyncio.run(main())
print(f'\n通过 {len(oks)} 项 / 失败 {len(fails)} 项\n')
for x in oks: print('  PASS', x)
for x in fails: print('  FAIL', x)
sys.exit(1 if fails else 0)
