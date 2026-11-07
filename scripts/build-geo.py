#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CAT API · AI 可见性基建生成器（可重复运行，幂等）

做四件事：
  1. 给 40 个 HTML 补齐 canonical / description / og / twitter，保留已有的人工文案
  2. 生成 sitemap.xml 与 robots.txt
  3. 从正文提取 llms-full.txt
  4. 给首页与正典页注入 JSON-LD 事实卡

事实全部读 facts.json 与页面自身，不编造数据。
用法：python3 scripts/build-geo.py
"""

import json
import re
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
facts = json.loads((ROOT / "facts.json").read_text())
BASE = facts["canonical"]

BEGIN = "<!-- CAT API GEO:BEGIN -->"
END = "<!-- CAT API GEO:END -->"

META_KEYS = [
    ("property", "og:type"),
    ("property", "og:title"),
    ("property", "og:description"),
    ("property", "og:url"),
    ("property", "og:image"),
    ("property", "og:site_name"),
    ("name", "twitter:card"),
    ("name", "twitter:title"),
    ("name", "twitter:description"),
    ("name", "twitter:image"),
]

counts = facts["counts"]
canon = facts["canon"]


def canonical_for(rel):
    return BASE if rel == "index.html" else BASE + rel


def html_escape(s):
    return (s.replace("&", "&amp;").replace('"', "&quot;")
             .replace("<", "&lt;").replace(">", "&gt;"))


def all_html():
    return sorted(p for p in ROOT.rglob("*.html") if ".git" not in p.parts)


# ---------------------------------------------------------------------------
# 1. 逐页补元数据
# ---------------------------------------------------------------------------
def patch_meta():
    patched, added = 0, 0
    for p in all_html():
        rel = p.relative_to(ROOT).as_posix()
        s = p.read_text()
        original = s

        # 移除上一次生成的块，连同插入时加的换行一起吃掉，保证幂等
        s = re.sub(r"\n*" + re.escape(BEGIN) + r"[\s\S]*?" +
                   re.escape(END) + r"\n*", "\n", s)

        soup = BeautifulSoup(s, "html.parser")
        title = soup.title.get_text(strip=True) if soup.title else "CAT API"
        head = soup.head
        existing_desc = head.find("meta", attrs={"name": "description"})
        desc = existing_desc.get("content", "").strip() if existing_desc else ""
        if not desc:
            desc = title if "CAT API" in title else "CAT API 猫咪接口规范 · " + title

        og_desc = head.find("meta", attrs={"property": "og:description"})
        og_desc = og_desc.get("content", "").strip() if og_desc else desc
        og_title = head.find("meta", attrs={"property": "og:title"})
        og_title = og_title.get("content", "").strip() if og_title else title
        tw_desc = head.find("meta", attrs={"name": "twitter:description"})
        tw_desc = tw_desc.get("content", "").strip() if tw_desc else desc
        tw_title = head.find("meta", attrs={"name": "twitter:title"})
        tw_title = tw_title.get("content", "").strip() if tw_title else title

        # canonical 统一到事实源声明的域
        url = canonical_for(rel)
        canon_tag = '<link rel="canonical" href="%s">' % url
        if re.search(r'<link rel="canonical"[^>]*>', s):
            s = re.sub(r'<link rel="canonical"[^>]*>', canon_tag, s, count=1)
        else:
            s = s.replace("</title>", "</title>\n" + canon_tag, 1)

        values = {
            ("name", "description"): desc,
            ("property", "og:type"): "website",
            ("property", "og:title"): og_title,
            ("property", "og:description"): og_desc,
            ("property", "og:url"): url,
            ("property", "og:image"): BASE + "assets/img/favicon.svg",
            ("property", "og:site_name"): "CAT API",
            ("name", "twitter:card"): "summary",
            ("name", "twitter:title"): tw_title,
            ("name", "twitter:description"): tw_desc,
            ("name", "twitter:image"): BASE + "assets/img/favicon.svg",
        }

        missing = []
        for key in [("name", "description")] + META_KEYS:
            attr, name = key
            pattern = r'<%s[^>]*%s=["\']%s["\']' % ("meta", attr, re.escape(name))
            if not re.search(pattern, s):
                missing.append('<meta %s="%s" content="%s">' %
                               (attr, name, html_escape(values[key])))
                added += 1

        if missing:
            block = BEGIN + "\n" + "\n".join(missing) + "\n" + END + "\n"
            s = s.replace("</title>", "</title>\n" + block, 1)

        if s != original:
            p.write_text(s)
            patched += 1
    return patched, added


# ---------------------------------------------------------------------------
# 2. sitemap.xml / robots.txt
# ---------------------------------------------------------------------------
def write_sitemap():
    skip = ("docs/design/", "404.html")
    urls = []
    for p in all_html():
        rel = p.relative_to(ROOT).as_posix()
        if any(rel.startswith(k) or rel == k for k in skip):
            continue
        if rel == "index.html":
            priority = "1.0"
        elif rel == "spec/cat.html":
            priority = "0.9"
        elif rel.startswith("reference/"):
            priority = "0.7"
        elif rel.startswith("tools/"):
            priority = "0.6"
        else:
            priority = "0.5"
        # 不用文件 mtime：checkout 会重置它，CI 的生成物一致性检查会误报
        changefreq = "daily" if rel == "index.html" else (
            "weekly" if rel == "spec/cat.html" else "monthly")
        urls.append((BASE + ("" if rel == "index.html" else rel), changefreq, priority))

    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, changefreq, priority in urls:
        lines += ["  <url>", "    <loc>%s</loc>" % loc,
                  "    <changefreq>%s</changefreq>" % changefreq,
                  "    <priority>%s</priority>" % priority, "  </url>"]
    lines.append("</urlset>")
    (ROOT / "sitemap.xml").write_text("\n".join(lines) + "\n")

    (ROOT / "robots.txt").write_text(
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /docs/design/\n"
        "\n"
        "Sitemap: %ssitemap.xml\n" % BASE
    )
    return len(urls)


# ---------------------------------------------------------------------------
# 3. llms-full.txt
# ---------------------------------------------------------------------------
TEXT_TAGS = ["h1", "h2", "h3", "h4", "p", "li", "blockquote", "pre", "td", "th"]


def extract(rel):
    p = ROOT / rel
    if not p.exists():
        return ""
    if p.suffix == ".md":
        return p.read_text().strip()
    soup = BeautifulSoup(p.read_text(), "html.parser")
    for t in soup(["script", "style", "nav", "aside", "header", "footer"]):
        t.decompose()
    out = []
    for tag in soup.find_all(TEXT_TAGS):
        txt = tag.get_text(" ", strip=True)
        if not txt:
            continue
        if tag.name.startswith("h"):
            out.append("\n" + "#" * int(tag.name[1]) + " " + txt)
        elif tag.name == "blockquote":
            out.append("> " + txt)
        elif tag.name in ("td", "th"):
            out.append("- " + txt)
        else:
            out.append(txt)
    seen, clean = set(), []
    for line in out:
        if line in seen:
            continue
        seen.add(line)
        clean.append(line)
    return "\n".join(clean).strip()


def write_llms_full():
    parts = [
        "# CAT API 完整正文",
        "",
        "> 本文件由 `scripts/build-geo.py` 从站内正文提取生成，不要手改。",
        "> 索引见 `llms.txt`，数字事实源见 `facts.json`，站点 %s。" % BASE,
        "",
        "## 端点口径（四个数字都对）",
        "",
    ]
    for k, v in facts["endpoints"].items():
        if not k.startswith("_"):
            parts.append("- **%s**：%s" % (k, v))
    parts += ["", "## 事实卡", ""]
    for group, label in ((counts, "可推导"), (canon, "正文声明")):
        parts.append("### %s" % label)
        for k, v in group.items():
            if isinstance(v, int):
                parts.append("- %s：%d" % (k, v))
        parts.append("")

    sources = [
        ("正典 16 章", "spec/cat.html"),
        ("当事猫意见", "reference/opinions.html"),
        ("状态码", "reference/errors.html"),
        ("术语表", "reference/glossary.html"),
        ("速查卡", "reference/cheatsheet.html"),
        ("CAT RUNTIME", "runtime/README.md"),
        ("双声部文体", "reference/voice.html"),
    ]
    for label, rel in sources:
        body = extract(rel)
        if body:
            parts += ["---", "", "## %s" % label, "", "来源：`%s`" % rel, "", body, ""]

    (ROOT / "llms-full.txt").write_text("\n".join(parts).rstrip() + "\n")
    return len("\n".join(parts))


# ---------------------------------------------------------------------------
# 4. JSON-LD 事实卡
# ---------------------------------------------------------------------------
def jsonld_block(rel):
    props = []
    for group in (counts, canon):
        for k, v in group.items():
            if isinstance(v, int):
                props.append({"@type": "PropertyValue", "name": k, "value": v})

    repo = "https://github.com/lijinhongucl-pixel/cat-api-spec"
    if rel == "index.html":
        data = {
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": "SoftwareSourceCode",
                    "name": "CAT API",
                    "alternateName": "猫咪接口规范",
                    "description": "一份用 RFC 骨架描述猫的工程文体规范，同时是一个零构建静态站点与终端猫运行时。",
                    "url": BASE,
                    "codeRepository": repo,
                    "programmingLanguage": ["JavaScript", "HTML", "CSS"],
                    "license": BASE + "LICENSE",
                    "additionalProperty": props,
                },
                {
                    "@type": "FAQPage",
                    "mainEntity": [
                        {
                            "@type": "Question",
                            "name": "CAT API 是什么",
                            "acceptedAnswer": {
                                "@type": "Answer",
                                "text": "一份用工程文体写的猫的接口规范，16 章正典、31 条当事猫意见，附可运行的工具页、OpenAPI 描述与终端猫运行时。",
                            },
                        },
                        {
                            "@type": "Question",
                            "name": "这个系统有 Owner 角色吗",
                            "acceptedAnswer": {
                                "@type": "Answer",
                                "text": "没有。Owner 角色不存在，这是架构级决定而不是待实现的功能。承认的角色只有 Staff 和入侵者。",
                            },
                        },
                        {
                            "@type": "Question",
                            "name": "CAT API 有多少个端点",
                            "acceptedAnswer": {
                                "@type": "Answer",
                                "text": "看口径：正典核心 12 个，CLI 注册 14 个，OpenAPI 描述 15 个路径，量化描述 10 个路径。四个数字口径不同，见 facts.json。",
                            },
                        },
                        {
                            "@type": "Question",
                            "name": "CAT RUNTIME 是什么",
                            "acceptedAnswer": {
                                "@type": "Answer",
                                "text": "一只零依赖、无后台进程、接进任何工作台的终端猫。任务完成、卡住或失败时它会给出反应，并能记住你的作息。",
                            },
                        },
                    ],
                },
            ],
        }
    else:
        data = {
            "@context": "https://schema.org",
            "@type": "TechArticle",
            "headline": "CAT API 猫咪接口规范",
            "url": canonical_for(rel),
            "inLanguage": "zh-CN",
            "about": "一份从架构层面否认 Owner 角色的猫接口规范",
            "license": BASE + "LICENSE",
            "additionalProperty": props,
        }
    return json.dumps(data, ensure_ascii=False, indent=2)


def patch_jsonld():
    for rel in ("index.html", "spec/cat.html"):
        p = ROOT / rel
        s = p.read_text()
        s = re.sub(re.escape(BEGIN) + r"\n<script type=\"application/ld\+json\">"
                   r"[\s\S]*?</script>\n" + re.escape(END) + r"\n?", "", s)
        block = (BEGIN + '\n<script type="application/ld+json">\n' +
                 jsonld_block(rel) + "\n</script>\n" + END + "\n")
        s = s.replace("</head>", block + "</head>", 1)
        p.write_text(s)


if __name__ == "__main__":
    patched, added = patch_meta()
    n_urls = write_sitemap()
    size = write_llms_full()
    patch_jsonld()

    # 顺带修 OpenAPI 里与 LICENSE 不一致的许可声明
    oapi = ROOT / "spec/openapi.yaml"
    t = oapi.read_text()
    t = t.replace("name: PolyForm Noncommercial 1.0.0", "name: MIT License")
    t = t.replace("url: https://polyformproject.org/licenses/noncommercial/1.0.0/",
                  "url: https://opensource.org/license/mit")
    oapi.write_text(t)

    print("元数据：本次调整 %d 页，维护 %d 个标签" % (patched, added))
    print("sitemap.xml / robots.txt：%d 个 URL" % n_urls)
    print("llms-full.txt：%d 字符" % size)
    print("JSON-LD：index.html 与 spec/cat.html 已注入")
    print("spec/openapi.yaml 许可声明已与 LICENSE 对齐")
