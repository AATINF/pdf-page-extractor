#!/usr/bin/env python3
"""解析 APK 的 v2 签名块，提取签名证书，确认用的是我们的 keystore。"""
import struct, subprocess, sys

APK = sys.argv[1] if len(sys.argv) > 1 else '/tmp/app.apk'
data = open(APK, 'rb').read()

def u32(b, o): return struct.unpack('<I', b[o:o + 4])[0]
def u64(b, o): return struct.unpack('<Q', b[o:o + 8])[0]

eocd = data.rfind(b'PK\x05\x06')
if eocd < 0:
    sys.exit('不是有效 APK')
cd_off = u32(data, eocd + 16)
magic = b'APK Sig Block 42'
if data[cd_off - 16:cd_off] != magic:
    sys.exit('没有 v2+ 签名块')

size2 = u64(data, cd_off - 24)
start = cd_off - 8 - size2
pos = start + 8
found = []
while pos < cd_off - 24:
    plen = u64(data, pos)
    pid = u32(data, pos + 8)
    val = data[pos + 12:pos + 8 + plen]
    if pid in (0x7109871a, 0xf05368c0):   # v2 / v3
        found.append(hex(pid))
        off = 0
        u32(val, off); off += 4          # signers 序列总长
        slen = u32(val, off); off += 4   # 第一个 signer 长度
        signer = val[off:off + slen]
        s = 0
        sdlen = u32(signer, s); s += 4
        sd = signer[s:s + sdlen]
        d = 0
        dlen = u32(sd, d); d += 4 + dlen          # 跳过 digests
        clen = u32(sd, d); d += 4
        certs = sd[d:d + clen]
        c = 0
        certlen = u32(certs, c); c += 4
        der = certs[c:c + certlen]
        path = f'/tmp/cert_{pid:x}.der'
        open(path, 'wb').write(der)
        print(f'签名块 {hex(pid)}：证书 {certlen} 字节 -> {path}')
    pos += 8 + plen

print('签名块类型:', ', '.join(found) or '无')

for p in __import__('glob').glob('/tmp/cert_*.der'):
    out = subprocess.run(['openssl', 'x509', '-inform', 'DER', '-in', p,
                          '-noout', '-subject', '-fingerprint', '-sha256',
                          '-dates'], capture_output=True, text=True)
    print(out.stdout.strip())
