/**
 * 册子组装：把图片谱 / 文本谱拼成可打印 HTML。
 * 两遍渲染：第一遍估页码生成目录，第二遍写入真实页码。
 */

import { analyze, type RenderTheme } from "@jianpubook/jianpu-engine";

export type BookTheme = "classic" | "warm" | "minimal";

export interface PageSetup {
  paper: "A4" | "Letter" | "B5";
  /** 版心左右边距 mm */
  marginMm: number;
  /** 双面镜像内外边距 */
  duplexMirror: boolean;
  showCover: boolean;
  showToc: boolean;
  startPageNumber: number;
  /** 打印校准系数，抵消 Chromium ≈0.9844 收缩 */
  printScale: number;
}

export const defaultPageSetup: PageSetup = {
  paper: "A4",
  marginMm: 16,
  duplexMirror: true,
  showCover: true,
  showToc: true,
  startPageNumber: 1,
  printScale: 1.016,
};

export interface BookSongItem {
  songId: number;
  ord: number;
  type: "image" | "text";
  title: string;
  key?: string | null;
  meter?: string | null;
  originalPath?: string | null;
  jianpuText?: string | null;
  /** convertFileSrc 后的展示 URL */
  displayUrl?: string | null;
}

export interface AssembledBook {
  html: string;
  pageCount: number;
  toc: { title: string; page: number; songId: number }[];
}

const THEME_CSS: Record<BookTheme, string> = {
  classic: `
    :root { --ink:#1c1b19; --muted:#6b6560; --line:#ddd6c8; --paper:#fff; --bg:#f7f4ee; }
  `,
  warm: `
    :root { --ink:#2a241c; --muted:#7a6e5f; --line:#e0d4bc; --paper:#fbf6ea; --bg:#efe6d4; }
  `,
  minimal: `
    :root { --ink:#111; --muted:#666; --line:#e5e5e5; --paper:#fff; --bg:#f5f5f5; }
  `,
};

function paperSize(paper: PageSetup["paper"]): { w: string; h: string } {
  switch (paper) {
    case "Letter":
      return { w: "215.9mm", h: "279.4mm" };
    case "B5":
      return { w: "176mm", h: "250mm" };
    default:
      return { w: "210mm", h: "297mm" };
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 粗估文本谱占几页：按 layout 行数与版心高度 */
function estimateTextPages(item: BookSongItem): number {
  if (!item.jianpuText) return 1;
  try {
    const r = analyze(item.jianpuText);
    // 约 10 行一页（含标题）
    const lines = r.layout.lines.length;
    return Math.max(1, Math.ceil((lines + 2) / 8));
  } catch {
    return 1;
  }
}

function renderTextSongSvg(item: BookSongItem, theme?: RenderTheme): string {
  if (!item.jianpuText) return `<p class="empty">（无文本谱）</p>`;
  try {
    const r = analyze(item.jianpuText, undefined, theme);
    return `<div class="score-svg">${r.svg}</div>`;
  } catch (e) {
    return `<p class="empty">解析失败：${esc(String(e))}</p>`;
  }
}

/**
 * 组装完整册子 HTML（含 @page）。
 * 先用占位页码跑一遍数页，再写真实目录页码。
 */
export function assembleBookHtml(
  title: string,
  items: BookSongItem[],
  pageSetup: PageSetup = defaultPageSetup,
  theme: BookTheme = "classic",
): AssembledBook {
  const { w, h } = paperSize(pageSetup.paper);
  const m = pageSetup.marginMm;

  // Pass 1: compute pages
  let page = pageSetup.startPageNumber;
  const toc: AssembledBook["toc"] = [];
  const bodyParts: string[] = [];

  if (pageSetup.showCover) {
    bodyParts.push(`
<section class="page cover">
  <div class="cover-inner">
    <h1>${esc(title)}</h1>
    <p class="sub">${items.length} 首 · JianpuBook</p>
    <p class="date">${new Date().toLocaleDateString("zh-CN")}</p>
  </div>
</section>`);
    page += 1;
  }

  if (pageSetup.showToc) {
    // 占位，pass2 填页码
    bodyParts.push(`
<section class="page toc" id="toc-page">
  <h2>目录</h2>
  <ul class="toc-list"><!--TOC--></ul>
</section>`);
    page += 1;
  }

  for (const item of items) {
    const startPage = page;
    toc.push({ title: item.title, page: startPage, songId: item.songId });

    if (item.type === "image") {
      const src = item.displayUrl || item.originalPath || "";
      bodyParts.push(`
<section class="page song image-song" data-song="${item.songId}">
  <header class="song-head">
    <span class="ord">${toc.length}.</span>
    <span class="title">${esc(item.title)}</span>
    <span class="meta">${esc(item.key ?? "")} ${esc(item.meter ?? "")}</span>
  </header>
  <div class="image-wrap">
    <img src="${esc(src)}" alt="${esc(item.title)}" />
  </div>
  <footer class="page-num">${startPage}</footer>
</section>`);
      page += 1;
    } else {
      const est = estimateTextPages(item);
      const svg = renderTextSongSvg(item);
      bodyParts.push(`
<section class="page song text-song" data-song="${item.songId}">
  <header class="song-head">
    <span class="ord">${toc.length}.</span>
    <span class="title">${esc(item.title)}</span>
    <span class="meta">${esc(item.key ?? "")} ${esc(item.meter ?? "")}</span>
  </header>
  ${svg}
  <footer class="page-num">${startPage}</footer>
</section>`);
      // P0：文本谱默认占 est 页，预览先显示首页；打印时靠 CSS 分页
      page += est;
    }
  }

  const pageCount = page - pageSetup.startPageNumber;

  const tocHtml = toc
    .map(
      (t) =>
        `<li><span class="t">${esc(t.title)}</span><span class="dots"></span><span class="p">${t.page}</span></li>`,
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
${THEME_CSS[theme]}
@page {
  size: ${w} ${h};
  margin: ${m}mm;
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}
.page {
  width: ${w};
  min-height: ${h};
  margin: 12px auto;
  padding: ${m}mm;
  background: var(--paper);
  box-shadow: 0 1px 4px rgba(0,0,0,.08);
  position: relative;
  page-break-after: always;
  break-after: page;
}
.page:last-child { page-break-after: auto; break-after: auto; }
.cover { display: flex; align-items: center; justify-content: center; text-align: center; }
.cover-inner h1 { font-size: 28px; margin: 0 0 12px; font-weight: 700; }
.cover-inner .sub { color: var(--muted); margin: 0 0 8px; }
.cover-inner .date { color: var(--muted); font-size: 12px; }
.toc h2 { margin: 0 0 16px; font-size: 18px; }
.toc-list { list-style: none; padding: 0; margin: 0; }
.toc-list li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}
.toc-list .dots { flex: 1; border-bottom: 1px dotted var(--line); }
.song-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}
.song-head .title { font-weight: 600; font-size: 15px; }
.song-head .meta { margin-left: auto; color: var(--muted); }
.image-wrap { display: flex; justify-content: center; }
.image-wrap img {
  max-width: 100%;
  max-height: calc(${h} - ${m * 2}mm - 40px);
  object-fit: contain;
}
.score-svg svg { width: 100%; height: auto; }
.page-num {
  position: absolute;
  bottom: 8mm;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 11px;
  color: var(--muted);
}
.empty { color: var(--muted); font-size: 13px; }
@media print {
  body { background: #fff; }
  .page {
    margin: 0;
    box-shadow: none;
    width: auto;
    min-height: auto;
    padding: 0;
    transform: scale(${pageSetup.printScale});
    transform-origin: top left;
  }
  .page-num { display: none; }
}
</style>
</head>
<body>
${bodyParts.join("\n").replace("<!--TOC-->", tocHtml)}
</body>
</html>`;

  return { html, pageCount, toc };
}
