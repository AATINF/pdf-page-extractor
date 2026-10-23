#!/usr/bin/env python3
"""把签名用的 keystore 与密码写入 GitHub Actions Secrets（值不落盘、不回显）。"""
import base64, json, pathlib, sys, urllib.request
from nacl import encoding, public

ROOT = pathlib.Path('/workspace/pdf-page-extractor')
REPO = 'AATINF/pdf-page-extractor'

cred = pathlib.Path.home() / '.git-credentials'
token = None
for line in cred.read_text().splitlines():
    if 'x-access-token:' in line:
        token = line.split('x-access-token:')[1].split('@')[0]
if not token:
    sys.exit('找不到 token')

def api(method, path, data=None):
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}{path}',
        data=json.dumps(data).encode() if data is not None else None,
        method=method,
        headers={
            'Authorization': f'token {token}',
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'User-Agent': 'pdf-extractor-ci',
        })
    with urllib.request.urlopen(req) as r:
        body = r.read()
        return json.loads(body) if body else {}

info = api('GET', '/actions/secrets/public-key')
key_id = info['key_id']
pub = public.PublicKey(info['key'].encode(), encoding.Base64Encoder())

def enc(v: str) -> str:
    return base64.b64encode(public.SealedBox(pub).encrypt(v.encode())).decode()

pw = (ROOT / 'keystore/password.txt').read_text().strip()
ks = base64.b64encode((ROOT / 'keystore/release.p12').read_bytes()).decode()

values = {
    'KEYSTORE_B64': ks,
    'KEYSTORE_PASSWORD': pw,
    'KEY_ALIAS': 'pdf-extractor',
    'KEY_PASSWORD': pw,
}

for name, val in values.items():
    api('PUT', f'/actions/secrets/{name}', {'encrypted_value': enc(val), 'key_id': key_id})
    print(f'  set {name}  ({len(val)} chars)')

print('\n已写入 4 个 Secret')
