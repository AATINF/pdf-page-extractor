#!/usr/bin/env bash
# 📦 一键发布脚本（PDF 页面提取器）
# 用法: ./publish.sh vX.Y.Z [更新说明]
# 作用: 版本四同步(title/header标签/sw缓存/README) + 版本文件备份 + JS语法检查 + commit+push
set -e; cd "$(dirname "$0")"
NEW="${1:?用法: ./publish.sh vX.Y.Z [更新说明]}"; DESC="${2:-版本升级}"
NEWV="${NEW#v}"
[[ "$NEWV" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "❌ 版本格式错，应为 vX.Y.Z"; exit 1; }
python3 - "$NEWV" "$DESC" <<'PYEOF'
import re, sys, datetime
V, D, T = sys.argv[1], sys.argv[2], datetime.date.today().isoformat(); VER='v'+V
def bump(path, pattern, repl):
    s=open(path,encoding='utf-8').read(); s2=re.sub(pattern,repl,s)
    assert s2!=s, f"❌ 未匹配: {path}"; open(path,'w',encoding='utf-8').write(s2); print("✓",path)
# ① title 版本
bump('index.html', r'(<title>[^<]* )v[0-9]+\.[0-9]+\.[0-9]+', r'\g<1>'+VER)
# ② header 版本标签（id="verTag"）
bump('index.html', r'(id="verTag">)v[0-9]+\.[0-9]+\.[0-9]+', r'\g<1>'+VER)
# ③ sw.js 缓存名（关键！漏改则手机端看不到新版）
bump('sw.js', r'([\w-]+-)v[0-9]+\.[0-9]+\.[0-9]+', r'\g<1>'+VER)
# ④ README 版本记录追加
s=open('README.md',encoding='utf-8').read()
if VER not in s:
    s=s.replace('|---|---|---|\n','|---|---|---|\n'+f'| {VER} | {T} | {D}（publish.sh） |\n',1)
    open('README.md','w',encoding='utf-8').write(s); print("✓ README.md")
PYEOF
cp index.html "v${NEWV}-PDF页面提取器.html"          # 版本历史备份（可在线访问）
node --check app.js && node --check sw.js            # JS 语法检查
git add -A && git commit -m "v$NEWV $DESC" && git push
echo "✅ v$NEWV 已推送至 GitHub（约 1 分钟生效）"
