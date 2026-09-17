import { describe, expect, it } from 'vitest';
import { analyze } from '../src/index.js';
import { layoutScore, defaultTheme } from '../src/layout.js';
import { renderSvg } from '../src/svg.js';
import { parseSong } from '../src/parser.js';
import { validateMeasures } from '../src/validate.js';
import { beamGroups } from '../src/beam.js';

const TWINKLE = `T: 小星星
K: 1=C
M: 4/4

1 1 5 5 | 6 6 5 - |
词: 一 闪 一 闪 亮 晶 晶 ~

4 4 3 3 | 2 2 1 - ||
词: 满 天 都 是 小 星 星 ~
`;

const EIGHTHS = `T: 八分连音
K: 1=C
M: 4/4

1_ 2_ 3_ 4_ 5_ 6_ 7_ 1'_ |
`;

describe('layoutScore', () => {
  it('生成谱行与单元格', () => {
    const r = analyze(TWINKLE);
    expect(r.layout.lines.length).toBeGreaterThan(0);
    const cells = r.layout.lines.flatMap((l) => l.cells);
    expect(cells.some((c) => c.kind === 'note')).toBe(true);
    expect(cells.some((c) => c.kind === 'bar')).toBe(true);
  });

  it('歌词对齐到音符，~ 变 hold；分节词接到后半段', () => {
    const r = analyze(TWINKLE);
    const noteCells = r.layout.lines
      .flatMap((l) => l.cells)
      .filter((c) => c.noteIndex >= 0);
    expect(noteCells[0]!.lyrics[0]!.text).toBe('一');
    expect(noteCells[1]!.lyrics[0]!.text).toBe('闪');
    // 第一节最后一个 extend 应为 hold
    const firstExtend = noteCells.find((c) => c.kind === 'extend');
    expect(firstExtend?.lyrics[0]?.hold).toBe(true);
    // 第二节「满」应落在后半段音符上，而不是叠在第一节
    const secondSection = noteCells.filter((c) => c.kind === 'note').slice(7);
    expect(secondSection[0]?.lyrics[0]?.text).toBe('满');
    // 第一节的音符不应出现「满」
    const firstNotes = noteCells.filter((c) => c.kind === 'note').slice(0, 7);
    expect(firstNotes.every((c) => c.lyrics[0]?.text !== '满')).toBe(true);
  });

  it('行首显示小节号', () => {
    const r = analyze(TWINKLE);
    expect(r.layout.lines[0]!.measureNumber).toBe(1);
  });

  it('八分音符生成 beam span', () => {
    const r = analyze(EIGHTHS);
    const beams = r.layout.lines.flatMap((l) => l.beams);
    expect(beams.length).toBeGreaterThanOrEqual(2);
    expect(beams[0]!.endX).toBeGreaterThan(beams[0]!.startX);
  });

  it('窄版心时会换行', () => {
    const song = parseSong(TWINKLE);
    const v = validateMeasures(song.music, '4/4');
    const b = beamGroups(v.measures, '4/4');
    const narrow = { ...defaultTheme, contentWidth: 200 };
    const layout = layoutScore(v.measures, b, song.lyrics, song.headers, narrow);
    expect(layout.lines.length).toBeGreaterThan(1);
  });
});

describe('renderSvg', () => {
  it('输出自包含 SVG', () => {
    const r = analyze(TWINKLE);
    expect(r.svg.startsWith('<svg')).toBe(true);
    expect(r.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(r.svg).toContain('小星星');
    expect(r.svg).toContain('</svg>');
    expect(r.svg).toMatch(/width="\d+"/);
  });

  it('包含音符数字与歌词汉字', () => {
    const r = analyze(TWINKLE);
    expect(r.svg).toContain('>1<');
    expect(r.svg).toContain('一');
  });

  it('高音数字带八度点 circle', () => {
    const r = analyze(`M: 4/4\n\n1' 1,, 5 | 5 5 5 5 |`);
    expect(r.svg).toContain('<circle');
  });

  it('变化音渲染', () => {
    const r = analyze(`M: 4/4\n\n#1 b7 =4 5 | 5 5 5 5 |`);
    expect(r.svg).toContain('♯');
    expect(r.svg).toContain('♭');
  });

  it('三连音画括号与 3', () => {
    const r = analyze(`M: 4/4\n\n(1_ 2_ 3_) 4 5 6 | 1 2 3 4 |`);
    expect(r.svg).toContain('>3<');
    expect(r.layout.lines[0]!.triplets.length).toBeGreaterThanOrEqual(1);
  });
});
