#!/usr/bin/env python3
"""生成一批覆盖真实场景的测试 PDF，用于渲染完整性检测。"""
import fitz, os, pathlib

OUT = pathlib.Path('/tmp/pdfcases')
OUT.mkdir(exist_ok=True)

def save(doc, name):
    p = OUT / name
    doc.save(str(p))
    doc.close()
    print(f'  {name}  {p.stat().st_size/1024:.1f} KB')

# 1. 表单域（证书/合同场景）
d = fitz.open()
pg = d.new_page(width=595, height=842)
pg.insert_text((72, 100), 'HONOR CERTIFICATE', fontsize=22)
for i, label in enumerate(['Name:', 'School:', 'Date:']):
    pg.insert_text((72, 160 + i * 70), label, fontsize=14)
    w = fitz.Widget()
    w.field_name = f'f{i}'
    w.field_type = fitz.PDF_WIDGET_TYPE_TEXT
    w.rect = fitz.Rect(150, 146 + i * 70, 460, 172 + i * 70)
    w.field_value = ['Zhang Xiaochuan', 'Changsha University', '2024-06'][i]
    w.text_fontsize = 14
    pg.add_widget(w)
save(d, 'form.pdf')

# 2. 注释（高亮 / 便签）
d = fitz.open()
pg = d.new_page()
pg.insert_text((72, 100), 'Document with annotations', fontsize=18)
pg.insert_text((72, 140), 'This paragraph is highlighted.', fontsize=13)
pg.add_highlight_annot(fitz.Rect(70, 128, 340, 145))
pg.add_text_annot(fitz.Point(400, 200), 'A sticky note')
save(d, 'annot.pdf')

# 3. 内嵌图片（扫描件场景）
d = fitz.open()
pg = d.new_page()
pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 400, 300))
pix.set_rect(pix.irect, (200, 90, 60))
pg.insert_image(fitz.Rect(60, 80, 460, 380), pixmap=pix)
pg.insert_text((72, 450), 'Scanned page simulation', fontsize=15)
save(d, 'image.pdf')

# 4. 页面旋转 90 度
d = fitz.open()
pg = d.new_page(width=595, height=842)
pg.insert_text((72, 100), 'Rotated page', fontsize=20)
pg.set_rotation(90)
save(d, 'rotated.pdf')

# 5. 中文多字体
d = fitz.open()
pg = d.new_page()
pg.insert_text((72, 100), '中文测试：荣誉证书', fontsize=20, fontname='china-s')
pg.insert_text((72, 150), '团队成员工学兼优德才兼备', fontsize=15, fontname='china-s')
pg.insert_text((72, 200), 'Mixed 中英文 ABC 123', fontsize=15)
save(d, 'cjk.pdf')

# 6. 空白页
d = fitz.open()
d.new_page()
save(d, 'empty.pdf')

# 7. A0 超大页面
d = fitz.open()
pg = d.new_page(width=2384, height=3370)
pg.insert_text((200, 300), 'A0 poster page', fontsize=80)
save(d, 'bigpage.pdf')

# 8. 横向页面
d = fitz.open()
pg = d.new_page(width=842, height=595)
pg.insert_text((72, 100), 'Landscape page', fontsize=20)
save(d, 'landscape.pdf')

# 9. 多页混合
d = fitz.open()
for i in range(10):
    pg = d.new_page()
    pg.insert_text((72, 100), f'Page {i+1} content', fontsize=18)
    pg.insert_text((72, 140), 'Some body text for rendering check', fontsize=12)
save(d, 'multipage.pdf')

# 10. 加密
d = fitz.open()
pg = d.new_page()
pg.insert_text((72, 100), 'Encrypted document', fontsize=18)
d.save(str(OUT / 'encrypted.pdf'), encryption=fitz.PDF_ENCRYPT_AES_256,
       user_pw='1234', owner_pw='1234')
d.close()
print(f'  encrypted.pdf  {(OUT/"encrypted.pdf").stat().st_size/1024:.1f} KB')

print('\n全部生成于', OUT)
