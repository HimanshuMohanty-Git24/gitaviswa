from pathlib import Path
import base64
import html
import re
import zipfile

import markdown


ROOT = Path(__file__).resolve().parent
STYLE = """
:root { color-scheme: light; --ink:#25231e; --muted:#68645b; --accent:#865414; --line:#ded9ce; --paper:#fcfbf7; }
* { box-sizing:border-box; }
html { scroll-behavior:smooth; scroll-padding-top:32px; }
body { margin:0; background:var(--paper); color:var(--ink); font:16px/1.75 'Segoe UI',Arial,sans-serif; }
.top { border-bottom:1px solid var(--line); padding:22px 5vw; display:flex; justify-content:space-between; flex-wrap:wrap; gap:16px; font-size:14px; }
.top strong { letter-spacing:.03em; }
.top a { margin-left:20px; }
.layout { display:grid; grid-template-columns:255px minmax(0,960px); gap:56px; max-width:1375px; margin:auto; padding:52px 32px 100px; }
aside { font-size:13px; position:sticky; top:25px; height:calc(100vh - 55px); overflow:auto; padding-right:14px; }
aside .toc ul { list-style:none; padding-left:12px; line-height:1.5; }
aside .toc>ul { padding-left:0; }
aside .toc li { margin:9px 0; }
aside .toc>ul>li>ul>li>ul { display:none; }
aside a { color:var(--muted); text-decoration:none; }
aside a:hover { color:var(--accent); text-decoration:underline; }
main { min-width:0; }
h1,h2,h3 { line-height:1.25; letter-spacing:-.025em; }
h1 { font-size:clamp(31px,4vw,48px); margin:0 0 30px; max-width:23ch; }
h2 { font-size:28px; margin:64px 0 22px; border-top:1px solid var(--line); padding-top:25px; }
h3 { font-size:21px; margin:40px 0 16px; }
p { margin:16px 0; }
a { color:var(--accent); text-underline-offset:3px; }
strong { font-weight:650; }
blockquote { margin:28px 0; padding:15px 24px; border-left:3px solid #b78139; background:#f1ede3; font:23px/1.55 Georgia,serif; }
blockquote p { margin:0; }
ul,ol { padding-left:25px; }
li { margin:9px 0; }
table { border-collapse:collapse; width:100%; font-size:14px; line-height:1.6; margin:25px 0; }
th { background:#eee9df; font-weight:650; text-align:left; }
th,td { border-bottom:1px solid var(--line); padding:13px 14px; vertical-align:top; }
tr:nth-child(even) td { background:#f7f4ec; }
.table-wrap { overflow-x:auto; }
code { background:#eeeae1; padding:2px 5px; border-radius:3px; font: .88em/1.6 Consolas,monospace; overflow-wrap:anywhere; }
pre { background:#eeeae1; padding:20px; overflow:auto; border:1px solid var(--line); }
pre code { background:none; padding:0; overflow-wrap:normal; }
.stamp { margin:0 0 30px; color:var(--muted); font-size:13px; text-transform:uppercase; letter-spacing:.1em; }
.gallery { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:28px; }
.gallery figure { margin:0; border:1px solid var(--line); padding:12px; background:white; }
.gallery img { width:100%; max-height:620px; object-fit:contain; background:#111; display:block; }
figcaption { font-size:13px; line-height:1.5; margin-top:12px; overflow-wrap:anywhere; color:var(--muted); }
footer { color:var(--muted); border-top:1px solid var(--line); padding-top:25px; margin-top:55px; font-size:13px; }
:focus-visible { outline:3px solid #9a641e; outline-offset:4px; }
@media(max-width:1000px) { .layout { grid-template-columns:1fr; padding:30px 24px 70px; } aside { position:static; height:auto; max-height:240px; border-bottom:1px solid var(--line); } aside .toc>ul>li>ul { display:none; } }
@media(max-width:600px) { body{font-size:16px;} .layout { padding:28px 18px 60px; } .gallery { grid-template-columns:1fr; } h2{font-size:25px;} th,td {padding:10px;} .top a {margin-left:0;margin-right:15px;} }
@media print { .top,aside {display:none;} .layout{display:block;padding:0;} body{background:white;font-size:11pt;} h1{font-size:28pt;} h2{break-after:avoid;} h3{break-after:avoid;} a{color:inherit;} .gallery{display:block;} figure{break-inside:avoid;margin-bottom:25px!important;} .gallery img{max-height:550px;} }
"""


def build(name: str, title: str, add_gallery: bool) -> None:
    converter = markdown.Markdown(extensions=["tables", "fenced_code", "toc", "sane_lists"], extension_configs={"toc": {"toc_depth": "1-3"}})
    content = converter.convert((ROOT / f"{name}.md").read_text(encoding="utf-8"))
    content = re.sub(r"<table>(.*?)</table>", r'<div class="table-wrap"><table>\1</table></div>', content, flags=re.S)
    content = content.replace('href="IMPLEMENTATION-HANDOFF.md"', 'href="IMPLEMENTATION-HANDOFF.html"')
    content = content.replace('href="PRODUCT-AUDIT.md"', 'href="PRODUCT-AUDIT.html"')
    if add_gallery:
        figures = []
        for path in sorted((ROOT / "evidence").glob("*.png")):
            anchor = "evidence-" + path.stem
            content = content.replace(f'href="evidence/{path.name}"', f'href="#{anchor}"')
            data = base64.b64encode(path.read_bytes()).decode("ascii")
            figures.append(f'<figure id="{anchor}"><img loading="lazy" src="data:image/png;base64,{data}" alt="Existing application audit evidence: {html.escape(path.stem.replace("-", " "))}"><figcaption>{html.escape(path.name)}</figcaption></figure>')
        content += '<h2 id="visual-evidence">Visual evidence</h2><p>Existing live application screenshots. These are evidence of the audited build, not proposed designs. Detailed descriptions are in the evidence index.</p><div class="gallery">' + "".join(figures) + "</div>"
    page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)}</title><style>{STYLE}</style></head>
<body><header class="top"><strong>GITA VISHWAS · PRODUCT REVIEW</strong><nav aria-label="Report files"><a href="PRODUCT-AUDIT.html">Full audit</a><a href="IMPLEMENTATION-HANDOFF.html">Agent handoff</a><a href="{name}.md">Markdown source</a></nav></header>
<div class="layout"><aside aria-label="Contents"><strong>CONTENTS</strong>{converter.toc}</aside><main><div class="stamp">3 November 2026 · Localhost product inspection</div>{content}<footer>Prepared from live UI inspection and source review. Findings distinguish observed behavior, code-confirmed risks, and proposed product changes. No application source was changed.</footer></main></div></body></html>'''
    (ROOT / f"{name}.html").write_text(page, encoding="utf-8")


build("PRODUCT-AUDIT", "Gita Vishwas — complete product audit", True)
build("IMPLEMENTATION-HANDOFF", "Gita Vishwas — implementation handoff", False)
with zipfile.ZipFile(ROOT / "Gita-Vishwas-Audit-2026-11-03.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(ROOT.rglob("*")):
        if path.is_file() and path.suffix in {".md", ".html", ".png"}:
            archive.write(path, path.relative_to(ROOT))
print("Built HTML reports and portable audit bundle.")
