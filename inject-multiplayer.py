#!/usr/bin/env python3
"""
批量给站点所有 HTML 页面注入多人联机模块资源。
逻辑：
  - 跳过已注入的页面
  - 根据文件路径深度决定 ../ 前缀
  - CSS 注入到 <head> 里（在 livecat.css 之后，或 spec.css 之后）
  - JS 注入到 </body> 之前（在 livecat.js 之后，或单独注入）
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))

# 找所有 html 文件
html_files = []
for dirpath, dirs, files in os.walk(ROOT):
    # 跳过 .git / node_modules 等
    dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules', '__pycache__')]
    for f in files:
        if f.endswith('.html'):
            html_files.append(os.path.join(dirpath, f))

print(f"扫描到 {len(html_files)} 个 HTML 文件")

injected = 0
skipped = 0
for path in html_files:
    rel = os.path.relpath(path, ROOT)
    with open(path, 'r', encoding='utf-8') as f:
        html = f.read()

    if 'multiplayer.js' in html or 'multiplayer.css' in html:
        print(f"  SKIP (已注入): {rel}")
        skipped += 1
        continue

    # 计算路径深度前缀
    depth = rel.count(os.sep)
    prefix = '../' * depth

    css_tag = f'<link rel="stylesheet" href="{prefix}assets/css/multiplayer.css">'
    js_tag = f'<script src="{prefix}assets/js/multiplayer.js"></script>'

    new_html = html

    # 注入 CSS：优先放在 livecat.css 之后，否则放在最后一个 </head> 之前
    if 'assets/css/livecat.css' in html:
        new_html = new_html.replace(
            'assets/css/livecat.css">',
            f'assets/css/livecat.css">\n{css_tag}',
            1
        )
    elif 'assets/css/spec.css' in html:
        new_html = new_html.replace(
            'assets/css/spec.css">',
            f'assets/css/spec.css">\n{css_tag}',
            1
        )
    elif '</head>' in new_html:
        new_html = new_html.replace('</head>', f'  {css_tag}\n</head>', 1)
    else:
        print(f"  SKIP (无 head): {rel}")
        skipped += 1
        continue

    # 注入 JS：优先放在 livecat.js 之后，否则放在 </body> 之前
    if 'assets/js/livecat.js' in html:
        new_html = new_html.replace(
            'assets/js/livecat.js"></script>',
            f'assets/js/livecat.js"></script>\n{js_tag}',
            1
        )
    elif '</body>' in new_html:
        new_html = new_html.replace('</body>', f'  {js_tag}\n</body>', 1)
    else:
        # 退而求其次：放在 </html> 之前
        if '</html>' in new_html:
            new_html = new_html.replace('</html>', f'{js_tag}\n</html>', 1)
        else:
            new_html += js_tag

    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_html)

    print(f"  INJECT: {rel}  (prefix='{prefix}')")
    injected += 1

print(f"\n完成：注入 {injected} 个，跳过 {skipped} 个")
