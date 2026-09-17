# -*- coding: utf-8 -*-
"""W0 实测(2)：归一化后再算哈希 —— 解决"旋转版比另一首歌更不像自己"的问题。
归一化：灰度 -> 投影方差去偏 -> 依墨量裁白边 -> 规范尺寸 -> Otsu 二值。
然后比较 pHash/dHash 的分离度。"""
import os

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(ROOT, "images")


def load_gray(name):
    return cv2.imread(os.path.join(IMG, name), cv2.IMREAD_GRAYSCALE)


def otsu(g):
    _, b = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return b


def detect_skew(b_ink, lo=-6.0, hi=6.0, step=0.5):
    """b_ink: bool 墨点图。返回使行投影方差最大的旋转角(cv2 约定)。"""
    h, w = b_ink.shape
    b = b_ink.astype(np.uint8)
    best, best_ang = -1.0, 0.0
    for a in np.arange(lo, hi + 1e-9, step):
        M = cv2.getRotationMatrix2D((w / 2, h / 2), a, 1.0)
        r = cv2.warpAffine(b, M, (w, h), flags=cv2.INTER_NEAREST,
                           borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        v = r.sum(axis=1).astype(np.float64)
        if v.var() > best:
            best, best_ang = v.var(), a
    for a in np.arange(best_ang - step, best_ang + step + 1e-9, step / 5):
        M = cv2.getRotationMatrix2D((w / 2, h / 2), a, 1.0)
        r = cv2.warpAffine(b, M, (w, h), flags=cv2.INTER_NEAREST,
                           borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        v = r.sum(axis=1).astype(np.float64)
        if v.var() > best:
            best, best_ang = v.var(), a
    return best_ang


def sauvola(g, win=51, k=0.5, R=128.0):
    gf = g.astype(np.float32)
    mean = cv2.blur(gf, (win, win))
    sq = cv2.blur(gf * gf, (win, win))
    std = np.sqrt(np.maximum(sq - mean * mean, 0))
    t = mean * (1.0 + k * (std / R - 1.0))
    # 约定统一：墨点 = 0，背景 = 255（与 Otsu 输出一致）
    return ((gf >= t) * 255).astype(np.uint8)


def binarize_auto(g, max_ink_frac=0.15):
    """默认 Otsu；墨量占比超阈值(简谱页真值约 2-6%)说明全页失真，回退 Sauvola。"""
    o = otsu(g)
    frac = float((o < 128).mean())
    if frac > max_ink_frac:
        b = sauvola(g)
        frac2 = float((b < 128).mean())
        return b, frac, frac2
    return o, frac, frac


def normalize(name, canon=(256, 360), verify_deskew=False, mode="page"):
    """mode='page': 整页归一化（页面即矩形画布，最稳定）
       mode='crop': 依墨量包围盒裁白边后归一化（对页边距差异敏感）"""
    g = load_gray(name)
    g = cv2.medianBlur(g, 3)  # 产品顺序：去噪先于二值化/去偏/哈希
    ink = otsu(g) < 128
    ang = detect_skew(ink)
    # 矫正：cv2 正角=逆时针；detect 返回值 = -(真实逆时针角)，故同向施加 +ang
    h, w = g.shape
    M = cv2.getRotationMatrix2D((w / 2, h / 2), ang, 1.0)
    g2 = cv2.warpAffine(g, M, (w, h), flags=cv2.INTER_CUBIC,
                        borderMode=cv2.BORDER_CONSTANT, borderValue=(255,))
    if mode == "page_flat":
        # 照明归一化：除以大核模糊估计的背景，压平暗角/渐变
        bg = cv2.GaussianBlur(g2, (0, 0), 60).astype(np.float32)
        bg[bg < 1.0] = 1.0
        flat = np.clip(g2.astype(np.float32) / bg * 255.0, 0, 255).astype(np.uint8)
        canon_img = cv2.resize(flat, canon, interpolation=cv2.INTER_AREA)
        _, f_otsu, f_used = binarize_auto(g2)
    elif mode == "crop":
        bin2, f_otsu, f_used = binarize_auto(g2)
        ink2 = bin2 < 128
        ys, xs = np.nonzero(ink2)
        if len(ys) < 10:
            return None, ang, 0.0, f_otsu, f_used
        m = 15
        y0, y1 = max(ys.min() - m, 0), min(ys.max() + m, h - 1)
        x0, x1 = max(xs.min() - m, 0), min(xs.max() + m, w - 1)
        content = g2[y0:y1 + 1, x0:x1 + 1]
        canon_img = cv2.resize(content, canon, interpolation=cv2.INTER_AREA)
        f_otsu = f_used = -1.0
    elif mode == "page_bin":
        # 哈希算在二值化后的规范图上：彻底消掉照明/底色差异
        canon_img = cv2.resize(g2, canon, interpolation=cv2.INTER_AREA)
        canon_img, _, _ = binarize_auto(canon_img)
        _, f_otsu, f_used = binarize_auto(g2)
    else:
        canon_img = cv2.resize(g2, canon, interpolation=cv2.INTER_AREA)
        _, f_otsu, f_used = binarize_auto(g2)
    resid = 0.0
    if verify_deskew:
        resid = detect_skew((binarize_auto(canon_img)[0] < 128), lo=-3, hi=3, step=0.25)
    return canon_img, ang, resid, f_otsu, f_used


def phash(g, size=32, take=8):
    s = cv2.resize(g, (size, size), interpolation=cv2.INTER_AREA).astype(np.float32)
    d = cv2.dct(s)[:take, :take].flatten()
    d = d[1:]
    return d > np.median(d)


def dhash(g, w=9, h=8):
    s = cv2.resize(g, (w, h), interpolation=cv2.INTER_AREA)
    return (s[:, 1:] > s[:, :-1]).flatten()


names = ["clean.png", "dup_b.jpg", "near_dup.png", "song2.png", "noisy.png",
         "yellowed.png", "yellowed_vignette.png", "rotated_pos.png", "rotated_neg.png",
         "blur.png", "small.png"]

# clean 的各种同歌退化版本（near_dup 改了一个音，单列一类）
SAME = {"clean.png", "dup_b.jpg", "noisy.png", "yellowed.png", "yellowed_vignette.png",
        "rotated_pos.png", "rotated_neg.png", "blur.png", "small.png"}

print("== 归一化过程：检测角 / 矫正后残差 / 二值化墨量占比 ==")
norm = {}
for n in names:
    img, ang, resid, f1_, f2_ = normalize(n, verify_deskew=(n in ("rotated_pos.png", "rotated_neg.png", "clean.png")))
    if img is None:
        print(f"  {n}: 墨量不足，跳过")
        continue
    norm[n] = img
    fb = f"{f1_:.3f}" + (f" ->回退Sauvola {f2_:.3f}" if f2_ != f1_ else "")
    print(f"  {n:22s} 检测={ang:+.2f}°  矫正残差={resid:+.2f}°  墨量={fb}")

focus = [("真重复(缩放+JPEG)", "clean.png", "dup_b.jpg"),
         ("真重复(低清缩放)", "clean.png", "small.png"),
         ("近重复(改一个音)", "clean.png", "near_dup.png"),
         ("不同歌", "clean.png", "song2.png"),
         ("同歌-噪点", "clean.png", "noisy.png"),
         ("同歌-发黄", "clean.png", "yellowed.png"),
         ("同歌-发黄+暗角", "clean.png", "yellowed_vignette.png"),
         ("同歌-旋转+3.5", "clean.png", "rotated_pos.png"),
         ("同歌-旋转-2.2", "clean.png", "rotated_neg.png"),
         ("同歌-模糊", "clean.png", "blur.png")]

for mode in ("page_flat", "page_bin", "page", "crop"):
    print(f"\n########## 归一化模式：{mode} ##########")
    norm = {}
    for n in names:
        img, ang, resid, _, _ = normalize(n, verify_deskew=False, mode=mode)
        if img is not None:
            norm[n] = img

    print("\n== 哈希距离（关键对） ==")
    print(f"{'关系':18s} {'pHash32':>8s} {'pHash64':>8s} {'dHash':>6s}")
    for label, a, b in focus:
        if a not in norm or b not in norm:
            continue
        p32 = int(np.logical_xor(phash(norm[a], 32, 8), phash(norm[b], 32, 8)).sum())
        p64 = int(np.logical_xor(phash(norm[a], 64, 8), phash(norm[b], 64, 8)).sum())
        dh = int(np.logical_xor(dhash(norm[a]), dhash(norm[b])).sum())
        print(f"{label:18s} {p32:8d} {p64:8d} {dh:6d}")

    ks = [n for n in names if n in norm]
    allp = []
    for i, a in enumerate(ks):
        for b in ks[i + 1:]:
            p32 = int(np.logical_xor(phash(norm[a], 32, 8), phash(norm[b], 32, 8)).sum())
            if a in SAME and b in SAME:
                same = "同歌"
            elif "near_dup.png" in (a, b) and (a in SAME or b in SAME):
                same = "近重复"
            else:
                same = "不同歌"
            allp.append((p32, same, a, b))
    allp.sort()
    same_d = [d for d, s, _, _ in allp if s == "同歌"]
    diff_d = [d for d, s, _, _ in allp if s == "不同歌"]
    near_d = [d for d, s, _, _ in allp if s == "近重复"]
    print(f"\n== 全局分布 ==")
    print(f"  同歌 {min(same_d)}..{max(same_d)} (n={len(same_d)}) | 近重复 {min(near_d)}..{max(near_d)} (n={len(near_d)}) | 不同歌 {min(diff_d)}..{max(diff_d)} (n={len(diff_d)})")
    print(f"  分离度: 不同歌最小 {min(diff_d)} vs 同歌最大 {max(same_d)} → "
          + ("可分" if min(diff_d) > max(same_d) else f"重叠 {max(same_d) - min(diff_d) + 1} bit"))
    print("  同歌侧离群对:")
    for d, s, a, b in allp:
        if s == "同歌" and d >= min(diff_d) - 4:
            print(f"    {d:3d}  {a} <-> {b}")
