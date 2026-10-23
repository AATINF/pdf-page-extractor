#!/usr/bin/env python3
"""渲染 6 个图标方案对比图，供挑选。"""
import asyncio, pathlib
from playwright.async_api import async_playwright

OUT = pathlib.Path('/workspace/pdf-page-extractor/screenshots/icon-proposals.png')

DEFS = '''<defs>
<linearGradient id="g1" x1="0" y1="0" x2="0.6" y2="1">
  <stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#1d4ed8"/>
</linearGradient></defs>'''

ICONS = {
 'A · 叠页抽取': '''
   <rect x="176" y="118" width="196" height="268" rx="20" fill="#fff" opacity=".28" transform="rotate(-9 274 252)"/>
   <rect x="168" y="128" width="196" height="268" rx="20" fill="#fff" opacity=".52" transform="rotate(-4 266 262)"/>
   <rect x="160" y="138" width="196" height="268" rx="20" fill="#fff"/>
   <g stroke="#2563eb" stroke-width="16" stroke-linecap="round">
     <path d="M198 200h120"/><path d="M198 244h120"/><path d="M198 288h78"/>
   </g>''',

 'B · 抽出箭头': '''
   <path d="M152 122h146l62 62v222a18 18 0 0 1-18 18H152a18 18 0 0 1-18-18V140a18 18 0 0 1 18-18z"
         fill="none" stroke="#fff" stroke-width="26" stroke-linejoin="round"/>
   <path d="M298 122v62h62" fill="none" stroke="#fff" stroke-width="26" stroke-linejoin="round"/>
   <path d="M236 312l84-84M320 228v58M320 228h-58" fill="none" stroke="#fff"
         stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>''',

 'C · 拆分': '''
   <rect x="126" y="116" width="112" height="280" rx="18" fill="#fff"/>
   <rect x="274" y="116" width="112" height="280" rx="18" fill="#fff" opacity=".48"/>
   <path d="M256 90v332" stroke="#fff" stroke-width="12" stroke-dasharray="28 22"
         stroke-linecap="round" opacity=".9"/>''',

 'D · 选页网格': '''
   <g fill="#fff">
     <rect x="140" y="140" width="104" height="132" rx="16"/>
     <rect x="268" y="140" width="104" height="132" rx="16" opacity=".4"/>
     <rect x="140" y="292" width="104" height="132" rx="16" opacity=".4"/>
     <rect x="268" y="292" width="104" height="132" rx="16" opacity=".4"/>
   </g>
   <path d="M170 206l20 20 34-40" fill="none" stroke="#2563eb" stroke-width="18"
         stroke-linecap="round" stroke-linejoin="round"/>''',

 'E · P 字标': '''
   <text x="256" y="352" font-family="Helvetica, Arial, sans-serif" font-size="300"
         font-weight="900" fill="#fff" text-anchor="middle" letter-spacing="-8">P</text>
   <rect x="330" y="300" width="46" height="46" rx="10" fill="#fff" opacity=".55"/>''',

 'F · 合并加号': '''
   <rect x="112" y="152" width="152" height="222" rx="18" fill="#fff" opacity=".5"/>
   <rect x="196" y="128" width="152" height="222" rx="18" fill="#fff"/>
   <circle cx="368" cy="348" r="66" fill="#fff"/>
   <path d="M368 316v64M336 348h64" stroke="#2563eb" stroke-width="16" stroke-linecap="round"/>''',
}

def block(name, body):
    return f'''
    <div class="cell">
      <div class="big" style="background:url(#g1)"><svg viewBox="0 0 512 512">{DEFS}<rect width="512" height="512" fill="url(#g1)"/>{body}</svg></div>
      <div class="row">
        <div class="small"><svg viewBox="0 0 512 512"><rect width="512" height="512" fill="url(#g1)"/>{body}</svg></div>
        <div class="meta"><b>{name}</b><span>56px 桌面尺寸</span></div>
      </div>
    </div>'''

HTML = f'''<!doctype html><html><head><meta charset="utf-8"><style>
*{{box-sizing:border-box}}
body{{margin:0;background:#f5f6f8;font-family:-apple-system,"PingFang SC","Noto Sans CJK SC",sans-serif;padding:28px}}
h2{{font-size:19px;margin:0 0 4px;color:#111827}}
p.sub{{margin:0 0 22px;font-size:13px;color:#6b7280}}
.grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:26px}}
.cell{{background:#fff;border-radius:18px;padding:18px;box-shadow:0 1px 3px rgba(16,24,40,.07)}}
.big{{width:100%;aspect-ratio:1;border-radius:56px;overflow:hidden}}
.big svg,.small svg{{display:block;width:100%;height:100%}}
.row{{display:flex;align-items:center;gap:12px;margin-top:14px}}
.small{{width:56px;height:56px;border-radius:14px;overflow:hidden;flex:0 0 auto}}
.meta{{display:flex;flex-direction:column;gap:2px}}
.meta b{{font-size:14px;color:#111827}}
.meta span{{font-size:11px;color:#9ca3af}}
</style></head><body>
<h2>图标方案 · 6 选 1</h2>
<p class="sub">大图 256px，小图 56px（桌面实际显示尺寸）。蓝底渐变统一，先比图形。</p>
<div class="grid">
{''.join(block(k, v) for k, v in ICONS.items())}
</div></body></html>'''

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
        page = await b.new_page(viewport={'width': 1120, 'height': 900}, device_scale_factor=2)
        await page.set_content(HTML)
        await page.wait_for_timeout(600)
        await page.screenshot(path=str(OUT), full_page=True)
        await b.close()
    print('已生成', OUT)

asyncio.run(main())
