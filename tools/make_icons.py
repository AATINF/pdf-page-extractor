#!/usr/bin/env python3
"""生成 PWA 图标（纯 Python，无第三方依赖）"""
import struct, zlib, os

def png_chunk(typ, data):
    c = struct.pack('>I', len(data)) + typ + data
    c += struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff)
    return c

def in_rrect(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = max(x0 + r, min(x, x1 - r))
    cy = max(y0 + r, min(y, y1 - r))
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

def pixel(size, x, y):
    m = size / 512.0
    # 背景：蓝色渐变
    t = y / (size - 1)
    r = int(37 + (29 - 37) * t)
    g = int(99 + (78 - 99) * t)
    b = int(235 + (216 - 235) * t)
    # 白色文档圆角矩形
    dx0, dy0, dx1, dy1 = 132 * m, 116 * m, 380 * m, 396 * m
    dr = 30 * m
    if in_rrect(x, y, dx0, dy0, dx1, dy1, dr):
        # 顶部标题条（蓝色圆角矩形）
        hx0, hy0, hx1, hy1 = 158 * m, 148 * m, 354 * m, 200 * m
        if in_rrect(x, y, hx0, hy0, hx1, hy1, 14 * m):
            return (37, 99, 235, 255)
        # 三行文字
        for li, (ly0, ly1) in enumerate([(246, 274), (296, 324), (346, 374)]):
            lx0, lx1 = 158 * m, (158 + 160 - 46 * li) * m
            if in_rrect(x, y, lx0, ly0 * m, lx1, ly1 * m, 12 * m):
                return (37, 99, 235, 255)
        return (255, 255, 255, 255)
    # 背景加一点装饰圆点
    if (x - 96 * m) ** 2 + (y - 118 * m) ** 2 <= (22 * m) ** 2:
        return (251, 191, 36, 255)
    if (x - 416 * m) ** 2 + (y - 400 * m) ** 2 <= (16 * m) ** 2:
        return (255, 255, 255, 90)
    return (r, g, b, 255)

def make_icon(size, path):
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw.extend(pixel(size, x, y))
    idat = zlib.compress(bytes(raw), 9)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    png = b'\x89PNG\r\n\x1a\n'
    png += png_chunk(b'IHDR', ihdr)
    png += png_chunk(b'IDAT', idat)
    png += png_chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)
    print('OK', path, size, 'x', size)

if __name__ == '__main__':
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'icons')
    os.makedirs(out, exist_ok=True)
    make_icon(192, os.path.join(out, 'icon-192.png'))
    make_icon(512, os.path.join(out, 'icon-512.png'))
