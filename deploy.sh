#!/usr/bin/env bash
# 🚀 首次部署脚本（PDF 页面提取器）
# 前置：~/.git-credentials（GitHub token）、~/.netlify-token（Netlify token）已就绪
# 用法: ./deploy.sh [仓库名]   （默认 pdf-page-extractor）
set -e; cd "$(dirname "$0")"
REPO="${1:-pdf-page-extractor}"
CRED=$(cat ~/.git-credentials 2>/dev/null || true)
NT=$(cat ~/.netlify-token 2>/dev/null || true)
[ -n "$CRED" ] || { echo "❌ 缺少 ~/.git-credentials（格式 https://<用户名>:<token>@github.com）"; exit 1; }
[ -n "$NT" ]   || { echo "❌ 缺少 ~/.netlify-token（内容仅 token）"; exit 1; }
GH_USER=$(echo "$CRED" | sed -E 's#https://([^:]+):.*@github.com#\1#')
echo "==> GitHub 用户: $GH_USER  仓库: $REPO"

# 1) GitHub 私有仓库（已存在则跳过）
if python3 req.py GET "https://api.github.com/repos/$GH_USER/$REPO" --gh 2>/dev/null | grep -q '"full_name"'; then
  echo "==> 仓库已存在，跳过创建"
else
  echo "==> 创建私有仓库 $REPO"
  python3 req.py POST "https://api.github.com/user/repos" --gh --json "{\"name\":\"$REPO\",\"private\":true}"
fi

# 2) push
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$GH_USER/$REPO.git"
git push -u origin main
echo "==> 已推送 main"

# 3) Netlify 建站（名字冲突则自动加后缀）
NAME="$REPO"; SITE=""
for i in 1 2 3 4 5; do
  SITE=$(python3 req.py POST "https://api.netlify.com/api/v1/sites" --netlify --json "{\"name\":\"$NAME\"}" 2>/dev/null || true)
  echo "$SITE" | grep -q '"id"' && break
  NAME="$REPO-$RANDOM"; echo "==> 站点名被占用，尝试: $NAME"
done
echo "$SITE" | grep -q '"id"' || { echo "❌ Netlify 建站失败"; echo "$SITE"; exit 1; }
SITE_ID=$(echo "$SITE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
URL=$(echo "$SITE" | python3 -c "import sys,json; print(json.load(sys.stdin)['url'])")
echo "==> 站点已建: $URL"

# 4) zip 一次性部署（快速上线，之后由 Git 集成接管）
python3 - <<'EOF'
import zipfile, os
zf = zipfile.ZipFile('/tmp/deploy.zip','w', zipfile.ZIP_DEFLATED)
for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d != '.git']
    for f in files:
        if f.endswith('.py') or f.endswith('.sh'): continue   # 工具脚本不上线
        p = os.path.join(root, f)
        zf.write(p, os.path.relpath(p, '.'))
zf.close()
EOF
DEPLOY=$(python3 req.py POST "https://api.netlify.com/api/v1/sites/$SITE_ID/deploys" --netlify --data-binary @/tmp/deploy.zip --ctype application/zip)
DEPLOY_ID=$(echo "$DEPLOY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "==> 部署任务: $DEPLOY_ID"

# 5) 轮询部署状态
for i in $(seq 1 24); do
  ST=$(python3 req.py GET "https://api.netlify.com/api/v1/deploys/$DEPLOY_ID" --netlify 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('state',''))" 2>/dev/null || echo "")
  echo "    状态: ${ST:-?}"
  [ "$ST" = "ready" ] && break
  [ "$ST" = "error" ] && { echo "❌ 部署失败"; exit 1; }
  sleep 5
done

echo ""
echo "✅ 快速上线完成: $URL"
echo ""
echo "⚠️ 还剩 2 步必须你在浏览器操作（约 3-5 分钟）："
echo "  ① Git 集成: app.netlify.com → 站点 → Site configuration → Build & deploy"
echo "     → Continuous deployment → Connect to Git provider → GitHub → 选仓库 $REPO"
echo "     （Branch=main，Build command 留空，Publish directory 留空）"
echo "  ② Access control: Site configuration → Access control → Authentication 改为 Public"
echo "     （否则访问会 401 / Login Redirect）"
echo ""
echo "完成后 push 即自动部署，手机访问: $URL"
