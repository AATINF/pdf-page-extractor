#!/usr/bin/env python3
"""第二批图标方案：围绕"提取页面"这个动作。"""
import asyncio, pathlib
from playwright.async_api import async_playwright

OUT = pathlib.Path('/workspace/pdf-page-extractor/screenshots/icon-proposals2.png')

DEFS = ('<defs><linearGradient id="g1" x1="0" y1="0" x2="0.6" y2="1">'
        '<stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#1d4ed8"/>'
        '</linearGradient></defs>')

ICONS = {
 'B · 抽出箭头（旧）': '''
   <path d="M152 122h146l62 62v222a18 18 0 0 1-18 18H152a18 18 0 0 1-18-18V140a18 18 0 0 1 18-18z"
         fill="none" stroke="#fff" stroke-width="26" stroke-linejoin="round"/>
   <path d="M298 122v62h62" fill="none" stroke="#fff" stroke-width="26" stroke-linejoin="round"/>
   <path d="M236 312l84-84M320 228v58M320 228h-58" fill="none" stroke="#fff"
         stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>''',

 'G · 抽出一页': '''
   <rect x="138" y="164" width="176" height="226" rx="18" fill="#fff" opacity=".26"
         transform="rotate(-11 226 277)"/>
   <rect x="152" y="150" width="176" height="226" rx="18" fill="#fff" opacity=".5"
         transform="rotate(-5 240 263)"/>
   <g transform="rotate(9 286 236)">
     <rect x="198" y="122" width="176" height="226" rx="18" fill="#fff"/>
     <g stroke="#2563eb" stroke-width="15" stroke-linecap="round">
       <path d="M228 178h116"/><path d="M228 220h116"/><path d="M228 262h74"/>
     </g>
   </g>''',

 'H · 框选对勾': '''
   <rect x="138" y="106" width="236" height="300" rx="24" fill="none"
         stroke="#fff" stroke-width="22"/>
   <rect x="172" y="156" width="168" height="100" rx="12" fill="#fff" opacity=".22"
         stroke="#fff" stroke-width="10" stroke-dasharray="20 14"/>
   <circle cx="356" cy="356" r="56" fill="#fff"/>
   <path d="M330 356l19 19 33-40" fill="none" stroke="#2563eb" stroke-width="17"
         stroke-linecap="round" stroke-linejoin="round"/>''',

 'I · 页堆飞出': '''
   <rect x="118" y="152" width="158" height="208" rx="16" fill="#fff" opacity=".3"/>
   <rect x="138" y="136" width="158" height="208" rx="16" fill="#fff" opacity=".55"/>
   <rect x="158" y="120" width="158" height="208" rx="16" fill="#fff"/>
   <g stroke="#2563eb" stroke-width="14" stroke-linecap="round">
     <path d="M188 172h98"/><path d="M188 210h98"/><path d="M188 248h62"/>
   </g>
   <path d="M330 306l72-72" stroke="#fff" stroke-width="20" stroke-linecap="round"/>
   <path d="M348 234h54v54" fill="none" stroke="#fff" stroke-width="20"
         stroke-linecap="round" stroke-linejoin="round"/>''',

 'J · 分页拆分': '''
   <rect x="134" y="98" width="244" height="316" rx="22" fill="#fff"/>
   <g stroke="#2563eb" stroke-width="14" stroke-linecap="round" opacity=".55">
     <path d="M176 158h160"/><path d="M176 202h120"/>
   </g>
   <path d="M134 256h244" stroke="#2563eb" stroke-width="12"
         stroke-dasharray="26 20" stroke-linecap="round"/>
   <g stroke="#2563eb" stroke-width="14" stroke-linecap="round" opacity=".55">
     <path d="M176 312h160"/><path d="M176 356h100"/>
   </g>''',

 'K · 多页选中': '''
   <g fill="#fff">
     <rect x="122" y="114" width="146" height="146" rx="16"/>
     <rect x="266" y="114" width="146" height="146" rx="16" opacity=".38"/>
     <rect x="122" y="282" width="146" height="146" rx="16" opacity=".38"/>
     <rect x="266" y="282" width="146" height="146" rx="16" opacity=".38"/>
   </g>
   <path d="M158 187l24 24 40-46" fill="none" stroke="#2563eb" stroke-width="20"
         stroke-linecap="round" stroke-linejoin="round"/>''',
}

def block(name, body):
    return f'''
    <div class="cell">
      <div class="big"><svg viewBox="0 0 512 512">{DEFS}<rect width="512" height="512" fill="url(#g1)"/>{body}</svg></div>
      <div class="row">
        <div class="small"><svg viewBox="0 0 512 512">{DEFS}<rect width="512" height="512" fill="url(#g1)"/>{body}</svg></div>
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
<h2>图标方案 · 第二批</h2>
<p class="sub">全部围绕"从多页中提取"这个动作。大图 256px，小图 56px（桌面实际尺寸）。</p>
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
