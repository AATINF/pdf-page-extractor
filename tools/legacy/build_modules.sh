#!/bin/bash
# 一键重建模块：切分 -> 生成入口 -> 补依赖 -> 改命名空间引用 -> 语法检查
set -e
cd /workspace/pdf-page-extractor
rm -rf src && mkdir -p src/core src/features src/ui
/workspace/.venv/bin/python tools/split_modules.py >/dev/null
/workspace/.venv/bin/python tools/gen_main.py >/dev/null
/workspace/.venv/bin/python tools/to_namespace.py | tail -4
for f in src/core/*.js src/features/*.js src/ui/*.js src/main.js; do
  /workspace/.node22/bin/node --check "$f" || { echo "语法错误: $f"; exit 1; }
done
echo "✅ 模块构建完成（$(ls src/core/*.js src/features/*.js src/ui/*.js src/main.js | wc -l) 个文件）"
