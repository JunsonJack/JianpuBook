# -*- coding: utf-8 -*-
"""W0 实测：JianpuText v0.1 语法的表达力 + tokenizer 原型。
- 解析 5 种节拍示例 + 边界情形（三连音/倚音/附点/双音/反复/变化音/多段歌词）
- 小节时值校验：每小节时值之和必须等于拍号（弱起首小节豁免）—— 编辑器的输入纠错能力
- 自动连音分组：按拍结构在拍内连音，且连音组不得跨越小节线"""
import re

# ---------- tokenizer ----------
ACCIDENTAL = {"#": 1, "b": -1, "=": 0}
DUR_UNDER = {"": 1.0, "_": 0.5, "__": 0.25, "___": 0.125}  # 减时线

NOTE_RE = re.compile(r"^(?P<acc>[#b=]?)(?P<digit>\d)(?P<oct>[',]*)(?P<under>_*)(?P<dot>\.?)$")
# 后缀顺序：变化音 -> 数字 -> 八度( ',) -> 减时线(_) -> 附点(.)  与规划文档一致（1_. = 附点八分）


def parse_token(tok):
    """返回 (kind, payload)。kind: note/rest/bar/extend/triplet/chord/grace/error"""
    if tok in ("|", "||", "|]", "|:", ":|"):
        return ("bar", tok)
    if tok == "-":
        return ("extend", 1.0)
    m = NOTE_RE.match(tok)
    if m:
        digit = int(m.group("digit"))
        dot = 0.5 if m.group("dot") else 0.0
        dur = DUR_UNDER[m.group("under")] * (1 + dot)
        octv = m.group("oct").count("'") - m.group("oct").count(",")
        acc = ACCIDENTAL.get(m.group("acc"))
        kind = "rest" if digit == 0 else "note"
        return (kind, {"digit": digit, "oct": octv, "dur": dur,
                       "dot": bool(m.group("dot")), "acc": acc})
    return ("error", tok)


def tokenize_line(line):
    """音乐行 -> token 列表（保留 triplet/chord/grace 结构）。
    括号无论是分写 ( 1 2 3 ) 还是连写 (1 2 3) 都切成独立 token。"""
    toks = []
    parts = re.findall(r"[()\[\]{}]|[^()\[\]{}\s]+", line)
    i = 0
    while i < len(parts):
        p = parts[i]
        if p == "(":
            grp = []
            i += 1
            while i < len(parts) and parts[i] != ")":
                grp.append(parse_token(parts[i]))
                i += 1
            toks.append(("triplet", grp))
        elif p == "[":
            grp = []
            i += 1
            while i < len(parts) and parts[i] != "]":
                grp.append(parse_token(parts[i]))
                i += 1
            toks.append(("chord", grp))
        elif p == "{":
            grp = []
            i += 1
            while i < len(parts) and parts[i] != "}":
                grp.append(parse_token(parts[i]))
                i += 1
            toks.append(("grace", grp))
        else:
            toks.append(parse_token(p))
        i += 1
    return toks


def triplet_total(t):
    """三连音总时值：3 个八分三连音 = 1 拍 → inner(0.5) × 2"""
    inner = max(beats_of(x) for x in t[1])
    return inner * 2.0


def parse_song(text):
    headers, music, lyrics = {}, [], []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if re.match(r"^[TKMQS]:", line):
            k = line[0]
            headers[k] = line[2:].strip()
        elif line.startswith("词"):
            lyrics.append(line.split(":", 1)[1].strip())
        else:
            music.append(tokenize_line(line))
    return headers, music, lyrics


# ---------- 时值校验 + 连音 ----------
def meter_beats(meter):
    n, d = map(int, meter.split("/"))
    return n * (4.0 / d)  # 4/4->4, 3/4->3, 2/4->2, 6/8->3(6×1/2 拍单位=3 拍)


def beats_of(t):
    kind, payload = t
    if kind in ("note", "rest"):
        return payload["dur"]
    if kind == "extend":
        return payload
    if kind == "chord":
        return max(beats_of(x) for x in payload)
    if kind == "triplet":
        return max(beats_of(x) for x in payload) * 2.0
    return 0.0


def validate(music, meter):
    """按小节切分并校验时值。返回 (measures, errors)"""
    target = meter_beats(meter)
    meas, cur, errs = [], [], []
    for line in music:
        for t in line:
            if t[0] == "bar":
                meas.append(cur)
                cur = []
            else:
                cur.append(t)
    meas.append(cur)
    # 空小节（终止小节线后 / 反复记号开头）不编号、不校验
    numbered = [(idx, m) for idx, m in enumerate(meas) if m]
    for n, (idx, m) in enumerate(numbered, start=1):
        total = sum(beats_of(t) for t in m)
        if n == 1 and total < target - 1e-6:
            errs.append(f"第 {n} 小节: 仅 {total:.2f} 拍（弱起，需显式标记后豁免）")
        elif (n > 1 or total > target) and abs(total - target) > 1e-6:
            errs.append(f"第 {n} 小节: 时值 {total:.2f} 拍 ≠ 拍号要求 {target:.2f} 拍")
    return meas, errs


def beam_groups(meas, meter):
    """拍内连音：把 dur<=0.5 的相邻音符按拍结构分组；返回 (小节序号, 组内索引列表)。
    计数单位统一为八分音符（quarter=2 单位），每拍上限 = beat_eighths[分母]：4/4→2，6/8→3。"""
    n, d = map(int, meter.split("/"))
    beat_eighths = {2: 4, 4: 2, 8: 3, 16: 1}[d]
    groups = []
    nonempty = [m for m in meas if m]
    for mi, m in enumerate(nonempty):
        i = 0
        while i < len(m):
            if m[i][0] in ("note", "rest") and m[i][1]["dur"] <= 0.5:
                j = i
                grp = [i]
                count = beats_of(m[i]) * 2  # 八分单位
                while j + 1 < len(m) and beats_of(m[j + 1]) <= 0.5 and count < beat_eighths:
                    j += 1
                    grp.append(j)
                    count += beats_of(m[j]) * 2
                groups.append((mi + 1, grp))
                i = j + 1
            else:
                i += 1
    return groups


# ---------- 5 种节拍示例 ----------
EXAMPLES = {
    "2/4 进行曲": """T: 2/4 示例
K: 1=C
M: 2/4
Q: ♩=120

1 2 | 3 4 | 5 6 | 7 1' ||
词: 走 走 ~ 走 走 ~ 走 走 ~""",
    "3/4 圆舞曲": """T: 3/4 示例
K: 1=F
M: 3/4
Q: ♩=132

1 2 3 | 4 5 6 | 7 1' 2' | 3' - - ||
词: 摇 摆 ~ ~ 摇 摆 ~ ~ 摇 摆 ~ ~""",
    "4/4 小星星": """T: 小星星
K: 1=C
M: 4/4
Q: ♩=100

1 1 5 5 | 6 6 5 - | 4 4 3 3 | 2 2 1 - ||
词: 一 闪 一 闪 亮 晶 晶 ~ ~ ~ ~
词: 满 天 都 是 小 星 星 ~ ~ ~ ~""",
    "6/8 摇篮曲": """T: 6/8 示例
K: 1=bB
M: 6/8
Q: ♩=72

1_ 1_ 1_ 1_ 1_ 1_ | 2_ 2_ 2_ 2_ 2_ 2_ | 1. 1_ 1_ 1_ | 2_ 3_ 4_ 5_ 6_ 7_ ||
词: 睡 吧 睡 吧 我 亲 爱 的 宝 贝 ~ ~ ~ ~""",
    "4/4 弱起": """T: 弱起示例
K: 1=G
M: 4/4
Q: ♩=96

5 | 1 2 3 4 | 5 6 7 1' | 2' - - - ||
词: ~ 起 ~ 大 步 向 前 走 ~ ~ ~ ~""",
}

EDGE = {
    "三连音": "M: 4/4\n\n(1 2 3) 4 | 5 - - - |",
    "倚音+双音+变化音": "M: 4/4\n\n{5}1 [1 5] #1 b7 | 1' 1, 0 5 |",
    "附点与减时线组合": "M: 4/4\n\n1. 1_ 1_ 1_ 1_ 1_ | 1__ 2__ 3__ 4__ 5__ 6__ 7__ 1'__ 1__ 2__ 3__ 4__ 5__ 6__ 7__ 0__ |",
    "反复记号": "M: 4/4\n\n|: 1 2 3 4 :| 5 6 7 1' ||",
}

BAD = {
    "小节超拍(应报错)": ("M: 4/4\n\n1 2 3 4 5 | 1 2 3 4 |", "4/4"),
}

print("=" * 70)
print("一、5 种节拍示例：解析 + 时值校验 + 连音分组")
print("=" * 70)
for name, text in EXAMPLES.items():
    h, music, lyrics = parse_song(text)
    meas, errs = validate(music, h["M"])
    notes = sum(1 for m in meas for t in m if t[0] == "note")
    print(f"\n### {name}  ({h['M']}, 1={h.get('K','?')})")
    print(f"  解析: 音乐行 {len(music)}，小节 {len(meas)}，音符 {notes}，歌词段 {len(lyrics)}")
    sums = [f"{sum(beats_of(t) for t in m):.1f}" for m in meas]
    print(f"  各小节时值(拍): {' '.join(sums)}")
    bg = beam_groups(meas, h["M"])
    beam_txt = ", ".join(f"m{mi}:[{','.join(str(x) for x in g)}]" for mi, g in bg[:6])
    print(f"  连音组(前6): {beam_txt or '无'}")
    print(f"  校验: {'✓ 通过' if not errs else '✗ ' + '; '.join(errs)}")

print()
print("=" * 70)
print("二、边界情形：能否无损表达")
print("=" * 70)
def flat_errors(music):
    """收集所有 token 错误（含括号组内部）"""
    out = []
    for line in music:
        for t in line:
            if t[0] == "error":
                out.append(t[1])
            elif t[0] in ("triplet", "chord", "grace"):
                out += [x[1] for x in t[1] if x[0] == "error"]
    return out


for name, text in EDGE.items():
    h, music, _ = parse_song(text)
    errs = flat_errors(music)
    meas, verrs = validate(music, h["M"])
    kinds = {t[0] for line in music for t in line}
    print(f"\n### {name}")
    print(f"  出现的结构: {sorted(kinds)}")
    print(f"  无法解析的 token: {[t[1] for t in errs] or '无'}")
    print(f"  时值校验: {'✓' if not verrs else '✗ ' + '; '.join(verrs)}")

print()
print("=" * 70)
print("三、错误输入：编辑器纠错能力")
print("=" * 70)
for name, (text, meter) in BAD.items():
    h, music, _ = parse_song(text)
    meas, errs = validate(music, meter)
    print(f"\n### {name}")
    print(f"  检出问题: {errs if errs else '未检出（失败！）'}")

print()
print("=" * 70)
print("四、语法歧义检查（固定后缀顺序：变化音 数字 八度 附点 减时线）")
print("=" * 70)
for tok in ["1", "1_", "1__", "1.", "1_.", "1'_.", "#1'_.", "1,'.", "b7__.", "0", "0_", "[1 5]",
            "{5}1", "(1 2 3)", "|", "||", "|:", ":|", "|]", "-", "1...'"]:
    kind, payload = parse_token(tok) if tok[0] not in "[({" else ("struct", tok)
    if tok[0] in "[({":
        print(f"  {tok:12s} -> 结构（在 tokenize_line 中处理）")
    else:
        extra = ""
        if kind in ("note", "rest"):
            extra = f" dur={payload['dur']}拍 oct={payload['oct']} acc={payload['acc']}"
        print(f"  {tok:12s} -> {kind}{extra}")
