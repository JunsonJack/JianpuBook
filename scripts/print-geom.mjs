/**
 * 打印几何探针：Chrome headless → PDF → 量页尺寸。
 * 用法: node scripts/print-geom.mjs
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze } from "../packages/jianpu-engine/dist/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "packages", "jianpu-engine", "__preview");
mkdirSync(outDir, { recursive: true });

const song = `T: 几何测试
K: 1=C
M: 4/4

1 1 5 5 | 6 6 5 - | 4 4 3 3 | 2 2 1 - ||
词: 一 闪 一 闪 亮 晶 晶 ~ 满 天 都 是 小 星 星 ~
`;

const r = analyze(song);
const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 16mm; }
  html, body { margin:0; font-family: sans-serif; }
  .sheet { width: 178mm; } /* 210-32 */
  .mark { height: 10mm; border-bottom: 0.3pt solid #000; font-size: 8pt; }
  svg { width: 100%; height: auto; }
</style>
</head>
<body>
<div class="sheet">
  <div class="mark">top-16mm</div>
  ${r.svg}
  <div class="mark">bottom</div>
</div>
</body>
</html>`;

const htmlPath = join(outDir, "print-geom.html");
const pdfPath = join(outDir, "print-geom.pdf");
writeFileSync(htmlPath, html);

const chrome =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
if (!existsSync(chrome)) {
  console.error("Chrome not found");
  process.exit(1);
}

if (existsSync(pdfPath)) unlinkSync(pdfPath);
execFileSync(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-pdf-header-footer",
    `--print-to-pdf=${pdfPath}`,
    `file:///${htmlPath.replace(/\\/g, "/")}`,
  ],
  { stdio: "inherit" },
);

console.log("pdf:", pdfPath);
// 用 Python pypdf 量页尺寸（若可用）
try {
  execFileSync(
    process.env.MIMO_PYTHON || "python",
    [
      "-c",
      `from pypdf import PdfReader
r=PdfReader(r"${pdfPath.replace(/\\/g, "\\\\")}")
box=r.pages[0].mediabox
w=float(box.width); h=float(box.height)
print(f"page_pt={w:.2f}x{h:.2f}")
print(f"page_mm={w*25.4/72:.2f}x{h*25.4/72:.2f}")
`,
    ],
    { stdio: "inherit" },
  );
} catch (e) {
  console.warn("pypdf measure skipped:", e.message);
}
