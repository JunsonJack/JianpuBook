# -*- coding: utf-8 -*-
"""生成 W0 实测用的合成简谱图片（干净/噪点/倾斜/发黄/模糊/低清/重复对）。
内容是模拟的简谱谱面：数字音符 + 八度点 + 减时线 + 小节线 + 歌词行。"""
import os
import random

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "images")
os.makedirs(OUT, exist_ok=True)

W, H = 1500, 2100
FONT_DIGIT = "C:/Windows/Fonts/arialbd.ttf"
FONT_LYRIC = "C:/Windows/Fonts/simsun.ttc"

# (digit, octave -2..2, dur 4/8/16) —— dur 4=四分, 8=八分(一条减时线), 16=十六分(两条)
def gen_score(seed: int, measures=24):
    rng = random.Random(seed)
    notes = []
    digits = [1, 2, 3, 4, 5, 6, 7, 0]
    for _ in range(measures):  # 每小节 4 拍(简化)
        for _ in range(4):
            d = rng.choice(digits)
            octv = rng.choice([-1, 0, 0, 0, 1])
            dur = rng.choice([4, 4, 8, 16])
            notes.append((d, octv, dur))
    lyrics = [chr(0x4E00 + rng.randrange(0x1000)) for _ in notes]
    return notes, lyrics

def draw_score(notes, lyrics, bg=(255, 255, 255), ink=(0, 0, 0), seed=0):
    img = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(img)
    f_digit = ImageFont.truetype(FONT_DIGIT, 64)
    f_small = ImageFont.truetype(FONT_DIGIT, 30)
    f_lyric = ImageFont.truetype(FONT_LYRIC, 40)
    f_head = ImageFont.truetype(FONT_LYRIC, 36)

    d.text((90, 80), "1=C  4/4  ♩=120", font=f_head, fill=ink)
    d.text((90, 150), "歌曲标题示例", font=f_head, fill=ink)

    x = 90
    y_digit = 420
    # 谱行：每个音符一个 cell，宽 78
    cell = 78
    bar_every = 4
    for i, ((digit, octv, dur), char) in enumerate(zip(notes, lyrics)):
        cx = x + cell // 2
        # 八度点（上）
        for k in range(max(0, octv)):
            yy = y_digit - 16 - k * 16
            d.ellipse([cx - 5, yy - 5, cx + 5, yy + 5], fill=ink)
        # 数字
        s = str(digit)
        tw = d.textlength(s, font=f_digit)
        d.text((cx - tw / 2, y_digit), s, font=f_digit, fill=ink)
        bb = y_digit + 64 + 12
        # 减时线
        if dur == 8:
            d.line([cx - 26, bb, cx + 26, bb], fill=ink, width=3)
        elif dur == 16:
            d.line([cx - 26, bb, cx + 26, bb], fill=ink, width=3)
            d.line([cx - 26, bb + 10, cx + 26, bb + 10], fill=ink, width=3)
        # 八度点（下）
        for k in range(max(0, -octv)):
            yy = bb + 22 + k * 16
            d.ellipse([cx - 5, yy - 5, cx + 5, yy + 5], fill=ink)
        # 歌词
        lw = d.textlength(char, font=f_lyric)
        d.text((cx - lw / 2, bb + 56), char, font=f_lyric, fill=ink)
        # 小节线
        if (i + 1) % bar_every == 0 and (i + 1) < len(notes):
            bx = x + cell
            d.line([bx, y_digit - 24, bx, y_digit + 64 + 20], fill=ink, width=3)
        x += cell
        if x + cell > W - 90:  # 换行
            x = 90
            y_digit += 260
    return img

def add_noise(img, sigma=25, sp=0.02):
    a = np.asarray(img).astype(np.float32)
    rng = np.random.default_rng(7)
    a += rng.normal(0, sigma, a.shape[:2])[..., None]
    m = rng.random(a.shape[:2])
    a[m < sp / 2] = 0
    a[m > 1 - sp / 2] = 255
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def rotate(img, deg):
    a = np.asarray(img)
    M = cv2.getRotationMatrix2D((a.shape[1] / 2, a.shape[0] / 2), deg, 1.0)
    r = cv2.warpAffine(a, M, (a.shape[1], a.shape[0]), flags=cv2.INTER_CUBIC,
                       borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255))
    return Image.fromarray(r)

def save(img, name):
    p = os.path.join(OUT, name)
    img.save(p)
    print(name, img.size)

notes_a, lyrics_a = gen_score(42)
notes_b, lyrics_b = gen_score(99)  # 另一首歌（pHash 对照）
notes_c, _ = gen_score(42)         # 与 A 几乎相同，改一个音
notes_c[3] = (7, 1, 8) if notes_c[3][0] != 7 else (3, -1, 16)

clean = draw_score(notes_a, lyrics_a)
save(clean, "clean.png")
save(add_noise(clean), "noisy.png")
save(rotate(clean, 3.5), "rotated_pos.png")
save(rotate(clean, -2.2), "rotated_neg.png")
save(draw_score(notes_a, lyrics_a, bg=(246, 238, 205), ink=(74, 52, 32)), "yellowed.png")
# 带渐变暗角的发黄老谱：Otsu 全局阈值会失效，真正测 Sauvola 的价值
_a = np.asarray(draw_score(notes_a, lyrics_a, bg=(246, 238, 205), ink=(74, 52, 32))).astype(np.float32)
_yy, _xx = np.mgrid[0:H, 0:W]
_vig = 1.0 - 0.45 * np.clip(((_xx - W / 2) / (W / 2)) ** 2 + ((_yy - H / 2) / (H / 2)) ** 2, 0, 1)
save(Image.fromarray(np.clip(_a * _vig[..., None], 0, 255).astype(np.uint8)), "yellowed_vignette.png")
save(Image.fromarray(cv2.GaussianBlur(np.asarray(clean), (0, 0), 2.5)), "blur.png")
save(clean.resize((int(W * 0.4), int(H * 0.4)), Image.LANCZOS), "small.png")
save(draw_score(notes_b, lyrics_b), "song2.png")
save(draw_score(notes_c, lyrics_a), "near_dup.png")
# 跨分辨率 + JPEG 压缩的重复对
dup_b = clean.resize((int(W * 0.7), int(H * 0.7)), Image.LANCZOS)
dup_b.save(os.path.join(OUT, "dup_b.jpg"), quality=85)
print("dup_b.jpg", dup_b.size)
print("done")
