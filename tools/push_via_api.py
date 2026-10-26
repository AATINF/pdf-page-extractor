#!/usr/bin/env python3
"""当 github.com:443 不通时，用 GitHub API 直接提交改动。

用法：python3 tools/push_via_api.py <base_tag> <new_tag> "<commit message>"
"""
import base64, json, subprocess, sys, urllib.request, urllib.error

REPO = 'AATINF/pdf-page-extractor'
TOKEN = None
for line in (open('/root/.git-credentials').read().splitlines()):
    if 'x-access-token:' in line:
        TOKEN = line.split('x-access-token:')[1].split('@')[0]
if not TOKEN:
    sys.exit('找不到 token')


def api(method, path, data=None):
    url = f'https://api.github.com/repos/{REPO}{path}'
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method, headers={
        'Authorization': f'token {TOKEN}',
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'pdf-extractor-push',
    })
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        sys.exit(f'{method} {path} -> {e.code}: {e.read()[:300]}')


def main():
    if len(sys.argv) < 4:
        sys.exit('参数: base_tag new_tag "commit message"')
    base_tag, new_tag, message = sys.argv[1], sys.argv[2], sys.argv[3]

    # core.quotepath=false 避免中文文件名被转义成 \351 形式
    files = subprocess.run(['git', '-c', 'core.quotepath=false', 'diff', '--name-only', base_tag, 'HEAD'],
                           capture_output=True, text=True).stdout.split('\n')
    files = [f for f in files if f.strip()]
    print(f'改动文件 {len(files)} 个：')
    for f in files:
        print('  ', f)

    ref = api('GET', '/git/ref/heads/main')
    base_sha = ref['object']['sha']
    base_commit = api('GET', f'/git/commits/{base_sha}')
    print('基线 commit:', base_sha[:8])

    items = []
    for f in files:
        with open(f, 'rb') as fh:
            content = fh.read()
        blob = api('POST', '/git/blobs', {
            'content': base64.b64encode(content).decode(),
            'encoding': 'base64',
        })
        items.append({'path': f, 'mode': '100644', 'type': 'blob', 'sha': blob['sha']})
        print(f'  blob {f} -> {blob["sha"][:8]}')

    tree = api('POST', '/git/trees', {'base_tree': base_commit['tree']['sha'], 'tree': items})
    commit = api('POST', '/git/commits', {
        'message': message,
        'tree': tree['sha'],
        'parents': [base_sha],
    })
    print('新 commit:', commit['sha'][:8])

    api('PATCH', '/git/refs/heads/main', {'sha': commit['sha'], 'force': False})
    print('main 已更新')

    try:
        api('POST', '/git/refs', {'ref': f'refs/tags/{new_tag}', 'sha': commit['sha']})
        print(f'tag {new_tag} 已创建')
    except SystemExit as e:
        print('tag 创建失败（可能已存在）:', e)

    print('完成')


main()
