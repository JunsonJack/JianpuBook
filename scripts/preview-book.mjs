/**
 * 生成示例册子 HTML，便于本地打开目视检查排版。
 * 用法: node scripts/preview-book.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze } from "../packages/jianpu-engine/dist/index.js";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, "..", "packages", "jianpu-engine", "__preview");
mkdirSync(outDir, { recursive: true });

const songs = [
  {
    title: "小星星",
    key: "1=C",
    meter: "4/4",
    body: `T: 小星星
K: 1=C
M: 4/4

1 1 5 5 | 6 6 5 - |
词: 一 闪 一 闪 亮 晶 晶 ~

4 4 3 3 | 2 2 1 - ||
词: 满 天 都 是 小 星 星 ~
`,
  },
  {
    title: "连音练习",
    key: "1=G",
    meter: "6/8",
    body: `T: 连音练习
K: 1=G
M: 6/8

1_ 2_ 3_ 4_ 5_ 6_ | 7_ 1'_ 2'_ 3' - - ||
词: 啦 啦 啦 啦 啦 啦 啦 啦 啦 啦 ~ ~ ~
`,
  },
];

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

let page = 1;
const toc = [];
const sections = [];

for (const s of songs) {
  const r = analyze(s.body);
  toc.push({ title: s.title, page });
  sections.push(`
<section class="page">
  <header><strong>${toc.length}. ${esc(s.title)}</strong>
    <span class="meta">${esc(s.key)} ${esc(s.meter)}</span></header>
  ${r.svg}
  <footer>${page}</footer>
</section>`);
  page += 1;
}

const tocHtml = toc
  .map((t) => `<li>${esc(t.title)} <span class="d"></span> ${t.page}</li>`)
  .join("");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>示例册</title>
<style>
@page { size: A4; margin: 16mm; }
body { margin:0; background:#f4f1ea; font-family: system-ui, sans-serif; color:#1c1b19; }
.page { width:210mm; min-height:297mm; margin:12px auto; padding:16mm; background:#fff; position:relative; box-shadow:0 1px 4px rgba(0,0,0,.08); page-break-after: always; }
.page header { display:flex; justify-content:space-between; border-bottom:1px solid #ddd; padding-bottom:6px; margin-bottom:10px; font-size:13px; }
.meta { color:#666; }
.page svg { width:100%; height:auto; }
.page footer { position:absolute; bottom:10mm; left:0; right:0; text-align:center; font-size:11px; color:#888; }
.cover { display:flex; align-items:center; justify-content:center; text-align:center; }
h1 { font-size:28px; margin:0 0 8px; }
ul { padding-left:18px; }
li { padding:4px 0; border-bottom:1px dotted #ccc; font-size:13px; }
.d { display:inline-block; width:40%; border-bottom:1px dotted #ccc; }
</style>
</head>
<body>
<section class="page cover"><div><h1>示例简谱册</h1><p>JianpuBook preview</p></div></section>
<section class="page"><h2>目录</h2><ul>${tocHtml}</ul></section>
${sections.join("\n")}
</body>
</html>`;

const out = join(outDir, "book-preview.html");
writeFileSync(out, html);
console.log("wrote", out);
