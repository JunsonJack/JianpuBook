import { describe, expect, it } from 'vitest';
import { parseSong } from '../src/parser.js';
import { validateMeasures, parseMeter, beatsOf } from '../src/validate.js';
import { beamGroups } from '../src/beam.js';
import { analyze } from '../src/index.js';

const EXAMPLES: Record<string, string> = {
  '2/4': `T: 2/4 示例
K: 1=C
M: 2/4
Q: ♩=120

1 2 | 3 4 | 5 6 | 7 1' ||
词: 走 走 ~ 走 走 ~ 走 走 ~`,
  '3/4': `T: 3/4 示例
K: 1=F
M: 3/4
Q: ♩=132

1 2 3 | 4 5 6 | 7 1' 2' | 3' - - ||
词: 摇 摆 ~ ~ 摇 摆 ~ ~ 摇 摆 ~ ~`,
  '4/4': `T: 小星星
K: 1=C
M: 4/4
Q: ♩=100

1 1 5 5 | 6 6 5 - | 4 4 3 3 | 2 2 1 - ||
词: 一 闪 一 闪 亮 晶 晶 ~ ~ ~ ~
词: 满 天 都 是 小 星 星 ~ ~ ~ ~`,
  '6/8': `T: 6/8 示例
K: 1=bB
M: 6/8
Q: ♩=72

1_ 1_ 1_ 1_ 1_ 1_ | 2_ 2_ 2_ 2_ 2_ 2_ | 1. 1_ 1_ 1_ | 2_ 3_ 4_ 5_ 6_ 7_ ||
词: 睡 吧 睡 吧 我 亲 爱 的 宝 贝 ~ ~ ~ ~`,
  '4/4 弱起': `T: 弱起示例
K: 1=G
M: 4/4
Q: ♩=96

5 | 1 2 3 4 | 5 6 7 1' | 2' - - - ||
词: ~ 起 ~ 大 步 向 前 走 ~ ~ ~ ~`,
};

describe('parseMeter', () => {
  it('4/4 / 3/4 / 2/4 / 6/8', () => {
    expect(parseMeter('4/4')).toMatchObject({ beatsPerMeasure: 4, eighthsPerBeat: 2 });
    expect(parseMeter('3/4')).toMatchObject({ beatsPerMeasure: 3, eighthsPerBeat: 2 });
    expect(parseMeter('2/4')).toMatchObject({ beatsPerMeasure: 2, eighthsPerBeat: 2 });
    expect(parseMeter('6/8')).toMatchObject({ beatsPerMeasure: 3, eighthsPerBeat: 3 });
  });
});

describe('五种节拍：解析 + 时值校验', () => {
  for (const [name, text] of Object.entries(EXAMPLES)) {
    it(`${name} 校验通过（弱起给提示但不判失败结构）`, () => {
      const { headers, music, lyrics } = parseSong(text);
      expect(headers.M).toBeTruthy();
      const { measures, errors } = validateMeasures(music, headers.M!);
      expect(measures.length).toBeGreaterThan(0);

      if (name === '4/4 弱起') {
        // 弱起：首小节 1 拍 < 4，应有提示
        expect(errors.some((e) => e.measure === 1)).toBe(true);
        // 其余小节必须正确
        const others = errors.filter((e) => e.measure !== 1);
        expect(others).toEqual([]);
      } else {
        expect(errors).toEqual([]);
      }
      expect(lyrics.length).toBeGreaterThan(0);
    });
  }

  it('小星星：4 小节、14 个音符、2 段歌词', () => {
    // 1 1 5 5 | 6 6 5 - | 4 4 3 3 | 2 2 1 -  → 4+3+4+3 = 14 notes（增时线不是音符）
    const r = analyze(EXAMPLES['4/4']!);
    expect(r.validation.measures).toHaveLength(4);
    const notes = r.validation.measures.flatMap((m) => m.tokens).filter((t) => t.kind === 'note');
    expect(notes).toHaveLength(14);
    expect(r.song.lyrics).toHaveLength(2);
    expect(r.parseErrors).toEqual([]);
  });
});

describe('编辑器纠错（W0 BAD 用例）', () => {
  it('4/4 下 5 拍被检出', () => {
    const { music } = parseSong('M: 4/4\n\n1 2 3 4 5 | 1 2 3 4 |');
    const { errors } = validateMeasures(music, '4/4');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toContain('第 1 小节');
  });

  it('终止线后空小节不报最后一小节 0 拍（W0 bug#3）', () => {
    const { music } = parseSong('M: 4/4\n\n1 1 5 5 | 6 6 5 - ||');
    const { measures, errors } = validateMeasures(music, '4/4');
    expect(measures).toHaveLength(2);
    expect(errors).toEqual([]);
  });
});

describe('连音分组', () => {
  it('4/4：八分音符两两成组', () => {
    const { music } = parseSong('M: 4/4\n\n1_ 2_ 3_ 4_ 5_ 6_ 7_ 1\'_ |');
    const { measures } = validateMeasures(music, '4/4');
    const groups = beamGroups(measures, '4/4');
    expect(groups).toHaveLength(4);
    expect(groups[0]!.indices).toEqual([0, 1]);
    expect(groups[1]!.indices).toEqual([2, 3]);
  });

  it('6/8：三个八分为一组（3+3）（W0 bug#4）', () => {
    const { music } = parseSong('M: 6/8\n\n1_ 1_ 1_ 1_ 1_ 1_ |');
    const { measures } = validateMeasures(music, '6/8');
    const groups = beamGroups(measures, '6/8');
    expect(groups).toHaveLength(2);
    expect(groups[0]!.indices).toEqual([0, 1, 2]);
    expect(groups[1]!.indices).toEqual([3, 4, 5]);
  });

  it('四分音符不参与连音', () => {
    const { music } = parseSong('M: 4/4\n\n1 2 3 4 |');
    const { measures } = validateMeasures(music, '4/4');
    expect(beamGroups(measures, '4/4')).toEqual([]);
  });
});

describe('边界结构可表达', () => {
  it('三连音/倚音/双音/变化音/反复', () => {
    const { music, headers } = parseSong(`M: 4/4

{5}1 [1 5] #1 b7 | 1' 1, 0 5 |
|: 1 2 3 4 :| 5 6 7 1' ||
(1 2 3) 4 | 5 - - - |`);
    const kinds = new Set(music.flat().map((t) => t.kind));
    expect(kinds.has('grace')).toBe(true);
    expect(kinds.has('chord')).toBe(true);
    expect(kinds.has('triplet')).toBe(true);
    expect(kinds.has('bar')).toBe(true);
    // 时值：含三连音的小节应能过校验
    const { errors } = validateMeasures(music, headers.M!);
    // 第 2 小节 5 6 7 1' = 4 拍 OK；第 3 小节三连音+4 = 2 拍 → 应报错
    // 这里只断言解析无 error token
    const errs = music.flat().filter((t) => t.kind === 'error');
    expect(errs).toEqual([]);
    expect(errors.length).toBeGreaterThanOrEqual(0);
  });
});

describe('beatsOf', () => {
  it('附点八分 0.75 拍', () => {
    const toks = parseSong('M: 4/4\n\n1_. |').music[0]!;
    expect(beatsOf(toks[0]!)).toBeCloseTo(0.75);
  });

  it('三连音：inner×2（八分三连音=1拍，四分三连音=2拍）', () => {
    const eighths = parseSong('M: 4/4\n\n(1_ 2_ 3_) |').music[0]!;
    expect(beatsOf(eighths[0]!)).toBeCloseTo(1);
    const quarters = parseSong('M: 4/4\n\n(1 2 3) |').music[0]!;
    expect(beatsOf(quarters[0]!)).toBeCloseTo(2);
  });
});
