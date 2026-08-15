#!/usr/bin/env python3
"""通用 HTTP 工具：GET/POST/PUT/DELETE，支持 JSON / 二进制，--gh/--netlify 自动读凭据。
用法: req.py METHOD URL [--gh|--netlify] [--json '{}'] [--data-binary @file] [--ctype T]
凭据: ~/.git-credentials（https://<用户名>:<token>@github.com）、~/.netlify-token（仅token）"""
import sys, json, ssl, urllib.request, urllib.error, os
def main():
    args = sys.argv[1:]; method, url = args[0].upper(), args[1]
    token = None
    if '--gh' in args:
        token = open(os.path.expanduser('~/.git-credentials')).read().strip().split('@')[0].split(':')[-1]
    if '--netlify' in args:
        token = open(os.path.expanduser('~/.netlify-token')).read().strip()
    body = None; hdr = {}
    if '--json' in args:
        body = json.dumps(json.loads(args[args.index('--json')+1])).encode(); hdr['Content-Type']='application/json'
    elif '--data-binary' in args:
        body = open(args[args.index('--data-binary')+1][1:],'rb').read()
        hdr['Content-Type'] = args[args.index('--ctype')+1] if '--ctype' in args else 'application/octet-stream'
    if token: hdr['Authorization'] = 'Bearer '+token
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, data=body, headers=hdr, method=method)
    try:
        resp = urllib.request.urlopen(req, context=ctx, timeout=90)
        print('STATUS', resp.status, file=sys.stderr); sys.stdout.buffer.write(resp.read())
    except urllib.error.HTTPError as e:
        print('STATUS', e.code, file=sys.stderr); sys.stdout.buffer.write(e.read())
if __name__ == '__main__': main()
