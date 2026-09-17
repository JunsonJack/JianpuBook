# -*- coding: utf-8 -*-
"""W0 实测：Chromium 打印几何。
1) geometry.html -> PDF，量取标记的 PDF 坐标(pt) -> mm，与 CSS 声明值比对
2) break-inside:avoid 是否真的不切断 240mm 高的块
3) toc.html -> PDF，验证 target-counter 输出的目录页码是否与实际页码一致
全部在本机 Chrome headless 完成。"""
import os
import re
import subprocess
import sys

from pypdf import PdfReader

ROOT = os.path.dirname(os.path.abspath(__file__))
PRINT = os.path.join(ROOT, "print")
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PT_PER_MM = 72.0 / 25.4


def html_to_pdf(html, pdf):
    out = os.path.join(PRINT, pdf)
    cmd = [CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
           f"--print-to-pdf={out}", "--virtual-time-budget=8000",
           "file:///" + os.path.join(PRINT, html).replace("\\", "/")]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if not os.path.exists(out):
        print("Chrome 失败:", r.stderr[-500:])
        sys.exit(1)
    return out


def _apply(cm, tx, ty):
    """把文本空间坐标经 CTM 变换到用户空间"""
    return (cm[0] * tx + cm[2] * ty + cm[4], cm[1] * tx + cm[3] * ty + cm[5])


def extract_positions(pdf_path):
    """返回 [{page, text, x, y}]（PDF 用户空间 pt，原点左下）"""
    reader = PdfReader(pdf_path)
    items = []
    for pno, page in enumerate(reader.pages):
        mb = page.mediabox
        w, h = float(mb.width), float(mb.height)

        def visitor(text, cm, tm, fontdict, fontsize):
            t = text.strip()
            if t:
                # 用户空间原点 = CTM 作用于文本矩阵原点
                x, y = _apply(cm, tm[4], tm[5])
                items.append({"page": pno + 1, "text": t, "x": x, "y": y,
                              "pagew": w, "pageh": h})
        try:
            page.extract_text(visitor_text=visitor)
        except Exception as e:
            print("extract 警告:", e)
    return items


# ---------- 1+2. geometry ----------
pdf = html_to_pdf("geometry.html", "geometry.pdf")
items = extract_positions(pdf)
reader = PdfReader(pdf)
print(f"== geometry.pdf: {len(reader.pages)} 页，页尺寸 "
      f"{float(reader.pages[0].mediabox.width):.2f} x {float(reader.pages[0].mediabox.height):.2f} pt "
      f"({float(reader.pages[0].mediabox.width) * 25.4 / 72:.1f} x {float(reader.pages[0].mediabox.height) * 25.4 / 72:.1f} mm)")
expect_a4 = (595.276, 841.890)
got = (float(reader.pages[0].mediabox.width), float(reader.pages[0].mediabox.height))
print(f"  A4 期望 {expect_a4} pt，实测 {got}，误差 "
      f"{abs(got[0]-expect_a4[0]):.2f} / {abs(got[1]-expect_a4[1]):.2f} pt "
      f"({abs(got[0]-expect_a4[0])/PT_PER_MM:.2f} / {abs(got[1]-expect_a4[1])/PT_PER_MM:.2f} mm)")

print("\n== 标记几何（CSS 声明 vs PDF 实测） ==")
errs = []
for it in items:
    m = re.match(r"^M(\d+)x(\d+)$", it["text"])
    if not m:
        continue
    ex, ey = int(m.group(1)), int(m.group(2))
    # PDF y 是自页底向上；CSS top 是自页顶向下
    css_x_pt, css_y_top_pt = ex * PT_PER_MM, ey * PT_PER_MM
    meas_x_mm = it["x"] / PT_PER_MM
    meas_y_top_mm = (it["pageh"] - it["y"]) / PT_PER_MM
    dx, dy = meas_x_mm - ex, meas_y_top_mm - ey
    errs.append((abs(dx) + abs(dy), it["text"], ex, ey, meas_x_mm, meas_y_top_mm, dx, dy))
for _, tag, ex, ey, mx, my, dx, dy in sorted(errs):
    print(f"  {tag:9s} 声明=({ex:3d},{ey:3d})mm  实测=({mx:6.2f},{my:6.2f})mm  "
          f"Δ=({dx:+.2f},{dy:+.2f})mm")
mxerr = max(e[0] for e in errs)
print(f"  最大综合偏差 = {mxerr:.2f} mm")

print("\n== break-inside:avoid（240mm 高块，可用版心 277mm，每页最多容 1 个） ==")
for it in items:
    if it["text"].startswith("BLOCK"):
        print(f"  {it['text'][:8]} 出现在第 {it['page']} 页")
blocks = sorted({it["text"][:8] for it in items if it["text"].startswith("BLOCK")})
pages = {it["text"][:8]: it["page"] for it in items if it["text"].startswith("BLOCK")}
ok_nosplit = len(blocks) == 3 and len(set(pages.values())) == 3
print(f"  3 个块分别在 {sorted(pages.values())} 页 → {'✓ 未被切断' if ok_nosplit else '✗ 有块被切断或同页'}")

# ---------- 3. toc ----------
pdf2 = html_to_pdf("toc.html", "toc.pdf")
items2 = extract_positions(pdf2)
reader2 = PdfReader(pdf2)
print(f"\n== toc.pdf: {len(reader2.pages)} 页 ==")
# 实际曲目所在页
actual = {}
for it in items2:
    m = re.match(r"^SEC(\d+)$", it["text"])
    if m:
        actual[int(m.group(1))] = it["page"]
# 目录里打印出来的页码（形如 "歌曲 01 3"）
toc_printed = {}
for it in items2:
    m = re.match(r"^歌曲 (\d+) (\d+)$", it["text"])
    if m:
        toc_printed[int(m.group(1))] = int(m.group(2))
print(f"  曲目数: 目录项={len(toc_printed)}，实际曲目页={len(actual)}")
bad = []
for k in sorted(actual):
    p = toc_printed.get(k)
    status = "✓" if p == actual[k] else "✗"
    if p != actual[k]:
        bad.append(k)
    print(f"    歌曲{k:02d}: target-counter 打印={p}  实际页={actual[k]}  {status}")
print(f"  结论: target-counter {'全部正确，可依赖' if not bad else f'错误 {len(bad)} 项：{bad}'}")
print("\ndone")
