# -*- coding: utf-8 -*-
"""W0 实测：图片增强各步的效果与耗时。
真值 = clean.png 的精确二值图（纯黑白合成图，二值化即真值）。
质量指标：墨点 precision/recall/F1 + 全像素 agreement；耗时：per-step 中位数。"""
import os
import time

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(ROOT, "images")
OUT = os.path.join(ROOT, "out")
os.makedirs(OUT, exist_ok=True)

try:
    from skimage.metrics import structural_similarity as _ssim
    HAVE_SSIM = True
except Exception:
    HAVE_SSIM = False


def load_gray(name):
    p = os.path.join(IMG, name)
    g = cv2.imread(p, cv2.IMREAD_GRAYSCALE)
    if g is None:
        raise FileNotFoundError(p)
    return g


def truth_binary():
    return (load_gray("clean.png") < 128).astype(np.uint8)


def prf(pred_bin, gt_bin):
    """pred/gt: bool 墨点图（True=墨）。返回 P/R/F1 + agreement%。"""
    p, g = pred_bin.astype(bool), gt_bin.astype(bool)
    tp = np.logical_and(p, g).sum()
    fp = np.logical_and(p, ~g).sum()
    fn = np.logical_and(~p, g).sum()
    prec = tp / (tp + fp) if tp + fp else 1.0
    rec = tp / (tp + fn) if tp + fn else 1.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    agree = (p == g).mean() * 100
    return prec * 100, rec * 100, f1 * 100, agree


def timing(fn, repeat=3):
    ts = []
    for _ in range(repeat):
        t = time.perf_counter()
        fn()
        ts.append((time.perf_counter() - t) * 1000)
    return float(np.median(ts))


def otsu(g):
    _, b = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return b


def sauvola(g, win=51, k=0.2, R=128.0):
    g = g.astype(np.float32)
    mean = cv2.blur(g, (win, win))
    sq = cv2.blur(g * g, (win, win))
    std = np.sqrt(np.maximum(sq - mean * mean, 0))
    t = mean * (1.0 + k * (std / R - 1.0))
    return (g < t).astype(np.uint8) * 255


def deskew_minarea(g):
    b = otsu(g)
    ys, xs = np.nonzero(b < 128)
    pts = np.stack([xs, ys], axis=1).astype(np.float32)
    rect = cv2.minAreaRect(pts)
    angle = rect[2]
    (w, h) = rect[1]
    if w < h:
        angle = angle - 90.0
    return -angle


def deskew_profile(g, lo=-6.0, hi=6.0, step=0.5):
    b = (otsu(g) < 128).astype(np.uint8)
    h, w = b.shape
    best, best_ang = -1.0, 0.0
    for a in np.arange(lo, hi + 1e-9, step):
        M = cv2.getRotationMatrix2D((w / 2, h / 2), a, 1.0)
        r = cv2.warpAffine(b, M, (w, h), flags=cv2.INTER_NEAREST,
                           borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        v = r.sum(axis=1).astype(np.float64)
        score = v.var()
        if score > best:
            best, best_ang = score, a
    # 精细化
    for a in np.arange(best_ang - step, best_ang + step + 1e-9, step / 5):
        M = cv2.getRotationMatrix2D((w / 2, h / 2), a, 1.0)
        r = cv2.warpAffine(b, M, (w, h), flags=cv2.INTER_NEAREST,
                           borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        v = r.sum(axis=1).astype(np.float64)
        if v.var() > best:
            best, best_ang = v.var(), a
    return best_ang


def denoise_cc(b_bin, min_area):
    n, lab, stats, _ = cv2.connectedComponentsWithStats((b_bin > 0).astype(np.uint8), 8)
    keep = np.zeros(n, bool)
    keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= min_area
    return keep[lab].astype(np.uint8)


def report(title, lines):
    print(f"\n===== {title} =====")
    for ln in lines:
        print(ln)


gt = truth_binary()

# ---------- 1. 二值化：Otsu vs Sauvola（发黄老谱是关键场景）----------
rows = []
for name, tag in [("clean.png", "干净"), ("yellowed.png", "发黄"), ("yellowed_vignette.png", "发黄+暗角"), ("noisy.png", "噪点")]:
    g = load_gray(name)
    o = otsu(g) < 128
    p, r, f, a = prf(o, gt)
    rows.append(f"{tag:6s} Otsu          P={p:5.1f} R={r:5.1f} F1={f:5.1f} agree={a:6.2f}%")
    for win in (51, 81):
        for k in (0.2, 0.5):
            s = sauvola(g, win, k) > 0
            p, r, f, a = prf(s, gt)
            rows.append(f"{tag:6s} Sauvola w={win} k={k} P={p:5.1f} R={r:5.1f} F1={f:5.1f} agree={a:6.2f}%")
report("1. 二值化对比（真值=clean 精确二值）", rows)

# ---------- 2. 去噪：哪种组合既去噪又不吃音符 ----------
rows = []
g_noisy = load_gray("noisy.png")
base = otsu(g_noisy) < 128
p, r, f, a = prf(base, gt)
rows.append(f"无去噪           P={p:5.1f} R={r:5.1f} F1={f:5.1f} agree={a:6.2f}%  (ink={base.sum()})")
med = cv2.medianBlur(g_noisy, 3)
o = otsu(med) < 128
p, r, f, a = prf(o, gt)
rows.append(f"median3          P={p:5.1f} R={r:5.1f} F1={f:5.1f} agree={a:6.2f}%  (ink={o.sum()})")
b255 = (otsu(med) < 128).astype(np.uint8) * 255
k = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
op = cv2.morphologyEx(b255, cv2.MORPH_OPEN, k) > 0
p, r, f, a = prf(op, gt)
rows.append(f"median3+开运算   P={p:5.1f} R={r:5.1f} F1={f:5.1f} agree={a:6.2f}%  (ink={op.sum()})")
for ma in (20, 50, 100, 200):
    cc = denoise_cc(med < 128, ma)
    p, r, f, a = prf(cc, gt)
    rows.append(f"median3+连通域≥{ma:<4d} P={p:5.1f} R={r:5.1f} F1={f:5.1f} agree={a:6.2f}%  (ink={cc.sum()})")
report("2. 去噪组合（在 noisy.png 上，真值墨量=%d）" % gt.sum(), rows)

# ---------- 3. 去偏：两种方法 vs 真值角度 ----------
rows = []
for name, truth_ang in [("rotated_pos.png", 3.5), ("rotated_neg.png", -2.2), ("clean.png", 0.0)]:
    g = load_gray(name)
    t_min = timing(lambda: deskew_minarea(g))
    a_min = deskew_minarea(g)
    t_pro = timing(lambda: deskew_profile(g))
    a_pro = deskew_profile(g)
    rows.append(f"{name:16s} 真值={truth_ang:+.1f}°  minArea={a_min:+.2f}°({t_min:.0f}ms)  "
                f"投影方差={a_pro:+.2f}°({t_pro:.0f}ms)")
report("3. 去偏角度检测（minAreaRect vs 投影方差法）", rows)

# ---------- 4. 裁白边 + 锐化（unsharp）在模糊图上的恢复 ----------
rows = []
g_blur = load_gray("blur.png")
g_clean = load_gray("clean.png")
psnr0 = cv2.PSNR(g_blur, g_clean)
for amount in (0.5, 1.0, 1.5, 2.0):
    blur = cv2.GaussianBlur(g_blur, (0, 0), 2.0)
    sh = np.clip(g_blur.astype(np.float32) + amount * (g_blur.astype(np.float32) - blur), 0, 255).astype(np.uint8)
    psnr1 = cv2.PSNR(sh, g_clean)
    rows.append(f"unsharp amount={amount}: PSNR {psnr0:.2f} -> {psnr1:.2f} dB")
    cv2.imwrite(os.path.join(OUT, f"sharpen_{amount}.png"), sh)
# 裁白边
b = otsu(g_blur) < 128
ys, xs = np.nonzero(b)
rows.append(f"裁白边: ink bbox = x[{xs.min()},{xs.max()}] y[{ys.min()},{ys.max()}] "
            f"(原图 {g_blur.shape[1]}x{g_blur.shape[0]})")
if HAVE_SSIM:
    for amount in (1.0, 1.5):
        blur = cv2.GaussianBlur(g_blur, (0, 0), 2.0)
        sh = np.clip(g_blur.astype(np.float32) + amount * (g_blur.astype(np.float32) - blur), 0, 255).astype(np.uint8)
        rows.append(f"SSIM amount={amount}: {_ssim(g_blur, g_clean, data_range=255):.3f} -> {_ssim(sh, g_clean, data_range=255):.3f}")
else:
    rows.append("(skimage 不可用，仅报 PSNR)")
report("4. 锐化恢复（blur.png -> clean.png）与裁白边", rows)

# ---------- 5. 各步耗时（1500x2100 与投影到 4K）----------
rows = []
g = load_gray("clean.png")
big = cv2.resize(g, (3000, 4200), interpolation=cv2.INTER_CUBIC)
cv2.imwrite(os.path.join(OUT, "big_4k.png"), big)
for label, im in [("1500x2100 (3.15MP)", g), ("3000x4200 (12.6MP)", big)]:
    t_otsu = timing(lambda: otsu(im))
    b = otsu(im)
    t_med = timing(lambda: cv2.medianBlur(im, 3))
    k3 = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
    t_open = timing(lambda: cv2.morphologyEx(b, cv2.MORPH_OPEN, k3))
    t_sau = timing(lambda: sauvola(im))
    t_resize = timing(lambda: cv2.resize(im, (32, 32), interpolation=cv2.INTER_AREA))
    rows.append(f"{label}: Otsu={t_otsu:6.1f}ms median3={t_med:6.1f}ms 开运算={t_open:6.1f}ms "
                f"Sauvola51={t_sau:6.1f}ms resize32={t_resize:5.2f}ms")
report("5. 各步耗时（3 次中位数）", rows)
print(f"\n(clean.png 解码耗时 = {timing(lambda: cv2.imread(os.path.join(IMG, 'clean.png'), cv2.IMREAD_GRAYSCALE)):.1f} ms)")

# ---------- 6. pHash / dHash 去重 ----------
def phash(g):
    s = cv2.resize(g, (32, 32), interpolation=cv2.INTER_AREA).astype(np.float32)
    d = cv2.dct(s)[:8, :8].flatten()
    d = d[1:]  # 去 DC
    return (d > np.median(d))


def dhash(g):
    s = cv2.resize(g, (9, 8), interpolation=cv2.INTER_AREA)
    return (s[:, 1:] > s[:, :-1]).flatten()


names = ["clean.png", "dup_b.jpg", "near_dup.png", "song2.png", "noisy.png",
         "yellowed.png", "rotated_pos.png", "blur.png", "small.png"]
gs = {n: load_gray(n) for n in names}
hp = {n: phash(v) for n, v in gs.items()}
hd = {n: dhash(v) for n, v in gs.items()}
rows = []
pairs = []
for i, a in enumerate(names):
    for b in names[i + 1:]:
        ph = int(np.logical_xor(hp[a], hp[b]).sum())
        dh = int(np.logical_xor(hd[a], hd[b]).sum())
        pairs.append((ph, dh, a, b))
pairs.sort()
for ph, dh, a, b in pairs:
    tag = ""
    if {a, b} == {"clean.png", "dup_b.jpg"}:
        tag = " <-- 真重复(缩放+JPEG)"
    elif {a, b} == {"clean.png", "near_dup.png"}:
        tag = " <-- 近重复(改一个音)"
    elif {a, b} == {"clean.png", "song2.png"}:
        tag = " <-- 不同歌"
    rows.append(f"pHash={ph:3d} dHash={dh:3d}  {a:16s} <-> {b:16s}{tag}")
report("6. 哈希去重（pHash 63-bit / dHash 64-bit，全部 9 图两两）", rows)
print("\n关注对：")
for label, a, b in [("真重复", "clean.png", "dup_b.jpg"), ("近重复", "clean.png", "near_dup.png"),
                    ("不同歌", "clean.png", "song2.png"), ("同歌退化-噪点", "clean.png", "noisy.png"),
                    ("同歌退化-发黄", "clean.png", "yellowed.png"), ("同歌退化-旋转", "clean.png", "rotated_pos.png")]:
    print(f"  {label:12s}: pHash={int(np.logical_xor(hp[a], hp[b]).sum()):3d}  dHash={int(np.logical_xor(hd[a], hd[b]).sum()):3d}")
print("\ndone")
