import type { MeasureInfo, Token } from './types.js';
import type { SourceLine } from './parser.js';
import { parseMeter } from './validate.js';

/** 渲染主题 / 几何参数（单位：px，SVG 用户坐标） */
export interface RenderTheme {
  noteSize: number;
  lyricSize: number;
  titleSize: number;
  cellWidth: number;
  lineHeight: number;
  lyricLineHeight: number;
  systemGap: number;
  contentWidth: number;
  underGap: number;
  octaveR: number;
}

export const defaultTheme: RenderTheme = {
  noteSize: 18,
  lyricSize: 12,
  titleSize: 22,
  cellWidth: 24,
  lineHeight: 44,
  lyricLineHeight: 16,
  systemGap: 18,
  contentWidth: 480,
  underGap: 3,
  octaveR: 1.6,
};

export type CellKind =
  | 'note'
  | 'rest'
  | 'extend'
  | 'bar'
  | 'grace'
  | 'chord'
  | 'triplet';

export interface LyricSlot {
  text: string;
  hold: boolean;
}

export interface LayoutCell {
  kind: CellKind;
  x: number;
  width: number;
  text: string;
  accidental: string;
  octave: number;
  underlines: number;
  dotted: boolean;
  grace: string | null;
  chordDigits: string[];
  lyrics: LyricSlot[];
  beamId: number | null;
  beamEnd: boolean;
  /** 该 cell 对应的全局音符序号（用于歌词配对） */
  noteIndex: number;
}

export interface BeamSpan {
  id: number;
  startX: number;
  endX: number;
  y: number;
  level: number;
}

export interface LayoutLine {
  y: number;
  cells: LayoutCell[];
  beams: BeamSpan[];
  measureNumber: number | null;
  height: number;
}

export interface ScoreLayout {
  width: number;
  height: number;
  title: string;
  keyLabel: string;
  meterLabel: string;
  lines: LayoutLine[];
  theme: RenderTheme;
}

const ACC_MAP: Record<number, string> = { 1: '♯', [-1]: '♭', 0: '♮' };

function accSymbol(acc: number | null): string {
  if (acc === null || acc === undefined) return '';
  return ACC_MAP[acc] ?? '';
}

function cellWidthFor(
  theme: RenderTheme,
  underlines: number,
  hasGrace: boolean,
  dotted: boolean,
  chordN: number,
): number {
  let w = theme.cellWidth;
  if (underlines > 0) w += 4;
  if (hasGrace) w += 10;
  if (dotted) w += 4;
  if (chordN > 1) w += 6;
  return w;
}

interface EmitCtx {
  theme: RenderTheme;
  noteIndex: number;
}

function pushNoteCell(
  out: LayoutCell[],
  ctx: EmitCtx,
  fields: {
    kind: CellKind;
    text: string;
    accidental: string;
    octave: number;
    underlines: number;
    dotted: boolean;
    grace: string | null;
    chordDigits: string[];
    width: number;
    /** 是否占用一个歌词位 */
    takesLyric: boolean;
    beamId: number | null;
    beamEnd?: boolean;
  },
): void {
  out.push({
    kind: fields.kind,
    x: 0,
    width: fields.width,
    text: fields.text,
    accidental: fields.accidental,
    octave: fields.octave,
    underlines: fields.underlines,
    dotted: fields.dotted,
    grace: fields.grace,
    chordDigits: fields.chordDigits,
    lyrics: [],
    beamId: fields.beamId,
    beamEnd: fields.beamEnd ?? false,
    noteIndex: fields.takesLyric ? ctx.noteIndex : -1,
  });
  if (fields.takesLyric) ctx.noteIndex += 1;
}

function emitToken(
  token: Token,
  ctx: EmitCtx,
  beamId: number | null,
  out: LayoutCell[],
): void {
  const theme = ctx.theme;
  switch (token.kind) {
    case 'note':
    case 'rest': {
      const p = token.payload;
      pushNoteCell(out, ctx, {
        kind: token.kind === 'rest' ? 'rest' : 'note',
        text: String(p.digit),
        accidental: accSymbol(p.acc),
        octave: p.oct,
        underlines: p.under,
        dotted: p.dot,
        grace: null,
        chordDigits: [],
        width: cellWidthFor(theme, p.under, false, p.dot, 1),
        takesLyric: token.kind === 'note',
        beamId,
      });
      return;
    }
    case 'extend': {
      pushNoteCell(out, ctx, {
        kind: 'extend',
        text: '-',
        accidental: '',
        octave: 0,
        underlines: 0,
        dotted: false,
        grace: null,
        chordDigits: [],
        width: theme.cellWidth,
        takesLyric: true,
        beamId: null,
      });
      return;
    }
    case 'bar': {
      const isThick = token.payload === '||' || token.payload === '|]';
      out.push({
        kind: 'bar',
        x: 0,
        width: isThick || token.payload === '|:' || token.payload === ':|' ? 14 : 10,
        text: token.payload,
        accidental: '',
        octave: 0,
        underlines: 0,
        dotted: false,
        grace: null,
        chordDigits: [],
        lyrics: [],
        beamId: null,
        beamEnd: false,
        noteIndex: -1,
      });
      return;
    }
    case 'grace': {
      const digits = token.payload
        .filter((x): x is Extract<Token, { kind: 'note' }> => x.kind === 'note')
        .map((x) => accSymbol(x.payload.acc) + String(x.payload.digit))
        .join('');
      out.push({
        kind: 'grace',
        x: 0,
        width: 14 + digits.length * 4,
        text: digits || '0',
        accidental: '',
        octave: 0,
        underlines: 0,
        dotted: false,
        grace: digits || '0',
        chordDigits: [],
        lyrics: [],
        beamId: null,
        beamEnd: false,
        noteIndex: -1,
      });
      return;
    }
    case 'chord': {
      const notes = token.payload.filter(
        (x): x is Extract<Token, { kind: 'note' }> => x.kind === 'note',
      );
      const first = notes[0];
      const under = first?.payload.under ?? 0;
      const dotted = first?.payload.dot ?? false;
      const digits = notes.map((n) => accSymbol(n.payload.acc) + String(n.payload.digit));
      pushNoteCell(out, ctx, {
        kind: 'chord',
        text: digits[0] ?? '0',
        accidental: '',
        octave: first?.payload.oct ?? 0,
        underlines: under,
        dotted,
        grace: null,
        chordDigits: digits.slice(1),
        width: cellWidthFor(theme, under, false, dotted, Math.max(1, digits.length)),
        takesLyric: true,
        beamId,
      });
      return;
    }
    case 'triplet': {
      const notes = token.payload.filter(
        (x): x is Extract<Token, { kind: 'note' | 'rest' }> =>
          x.kind === 'note' || x.kind === 'rest',
      );
      notes.forEach((n, i) => {
        const p = n.payload;
        pushNoteCell(out, ctx, {
          kind: n.kind === 'rest' ? 'rest' : 'note',
          text: String(p.digit),
          accidental: accSymbol(p.acc),
          octave: p.oct,
          underlines: p.under,
          dotted: p.dot,
          grace: null,
          chordDigits: [],
          width: cellWidthFor(theme, p.under, false, p.dot, 1),
          takesLyric: n.kind === 'note',
          beamId,
          beamEnd: i === notes.length - 1,
        });
      });
      return;
    }
    default:
      pushNoteCell(out, ctx, {
        kind: 'rest',
        text: '?',
        accidental: '',
        octave: 0,
        underlines: 0,
        dotted: false,
        grace: null,
        chordDigits: [],
        width: theme.cellWidth,
        takesLyric: false,
        beamId: null,
      });
  }
}

/** 从有序源行构建 measures（与 validate 的切分一致，但保留行结构） */
function measuresFromOrdered(lines: SourceLine[]): MeasureInfo[] {
  const musicLines = lines.filter(
    (l): l is Extract<SourceLine, { type: 'music' }> => l.type === 'music',
  );
  // 复用 validate 的切分逻辑：拼接 tokens 再按 bar 切
  const all: Token[] = [];
  for (const l of musicLines) all.push(...l.tokens);
  const raw: Token[][] = [];
  let cur: Token[] = [];
  for (const t of all) {
    if (t.kind === 'bar') {
      raw.push(cur);
      cur = [];
    } else {
      cur.push(t);
    }
  }
  raw.push(cur);
  const measures: MeasureInfo[] = [];
  let n = 0;
  for (const tokens of raw) {
    if (tokens.length === 0) continue;
    n += 1;
    measures.push({ number: n, tokens, beats: 0 });
  }
  return measures;
}

/**
 * 歌词配对：
 * - 同一音乐段落后连续多条 `词:` → 多段歌词（verse 0,1,...）对同一串音符
 * - 音乐 → 词 → 音乐 → 词：后一条词从「当前已消费音符数」继续（分节谱）
 */
function assignLyrics(
  lines: SourceLine[],
  cells: LayoutCell[],
  verseCountOut: { v: number },
): void {
  const lyricSlotsByNote = new Map<number, LyricSlot[]>();
  const noteCells = cells.filter((c) => c.noteIndex >= 0);
  const totalNotes = noteCells.length;

  let noteCursor = 0;
  let verse = 0;
  let prevType: SourceLine['type'] | null = null;
  let segmentBase = 0;
  let maxVerse = 0;

  for (const line of lines) {
    if (line.type === 'music') {
      if (prevType === 'lyric') {
        // 新音乐段：后续歌词从当前 cursor 起，verse 重置
        segmentBase = noteCursor;
        verse = 0;
      }
      // music 本身不移动 cursor——cursor 只在吃词时前进
      // 但需要知道本段有多少音符：在遇到 lyric 时按段落消费
      prevType = 'music';
      continue;
    }
    if (line.type === 'lyric') {
      if (prevType === 'music' || prevType === 'header' || prevType === null) {
        // 第一条词（或音乐后的第一条）：从 segmentBase 开始，本段 verse=0
        noteCursor = segmentBase;
        verse = 0;
      } else if (prevType === 'lyric') {
        verse += 1;
        noteCursor = segmentBase;
      }
      const parts = line.text.split(/\s+/).filter(Boolean);
      let local = 0;
      for (const part of parts) {
        const idx = segmentBase + local;
        if (idx >= totalNotes) break;
        const slot: LyricSlot =
          part === '~' ? { text: '', hold: true } : { text: part, hold: false };
        const list = lyricSlotsByNote.get(idx) ?? [];
        while (list.length < verse) list.push({ text: '', hold: false });
        list[verse] = slot;
        lyricSlotsByNote.set(idx, list);
        local += 1;
        noteCursor = idx + 1;
      }
      // 段内音符消费完后，segment 推进到 noteCursor 以便下一段音乐接上
      // 若本段还有音符未吃词，下一段音乐的词仍从 segmentBase 错——P0：吃完当前段
      // 简化：segmentBase 在 music 边界用「上一段实际吃到的 noteCursor」
      maxVerse = Math.max(maxVerse, verse);
      prevType = 'lyric';
      // 记录：若接下来是 music，segmentBase 已在上面 music 分支用 noteCursor
      continue;
    }
    prevType = line.type;
  }

  // 修正：音乐行之间的 segmentBase 应在遇到 music 时用 noteCursor（已消费）
  // 上面逻辑在 prevType==='lyric' 时设置 segmentBase=noteCursor，正确。

  const verseCount = Math.max(1, maxVerse + 1);
  verseCountOut.v = verseCount;
  for (const cell of cells) {
    if (cell.noteIndex < 0) {
      cell.lyrics = Array.from({ length: verseCount }, () => ({ text: '', hold: false }));
      continue;
    }
    const slots = lyricSlotsByNote.get(cell.noteIndex) ?? [];
    cell.lyrics = Array.from({ length: verseCount }, (_, i) => slots[i] ?? { text: '', hold: false });
  }
}

/**
 * 排版：以小节为单位贪心换行；歌词按源文件顺序配对。
 */
export function layoutScoreFromOrdered(
  lines: SourceLine[],
  beams: { measure: number; indices: number[] }[],
  theme: RenderTheme = defaultTheme,
): ScoreLayout {
  const headers: { T?: string; K?: string; M?: string } = {};
  for (const l of lines) {
    if (l.type === 'header') {
      if (l.key === 'T') headers.T = l.value;
      if (l.key === 'K') headers.K = l.value;
      if (l.key === 'M') headers.M = l.value;
    }
  }

  const measures = measuresFromOrdered(lines);
  const beamMap = new Map<string, number>();
  beams.forEach((b, i) => {
    b.indices.forEach((idx) => beamMap.set(`${b.measure}:${idx}`, i));
  });

  const ctx: EmitCtx = { theme, noteIndex: 0 };
  const measureCellLists: LayoutCell[][] = [];

  measures.forEach((m) => {
    const cells: LayoutCell[] = [];
    m.tokens.forEach((t, ti) => {
      const bid = beamMap.get(`${m.number}:${ti}`) ?? null;
      const group = bid !== null ? beams[bid] : null;
      const isEnd = group ? group.indices[group.indices.length - 1] === ti : false;
      const before = cells.length;
      emitToken(t, ctx, bid, cells);
      if (bid !== null && cells.length > before) {
        cells[cells.length - 1]!.beamEnd = isEnd;
      }
    });
    emitToken({ kind: 'bar', payload: '|' }, ctx, null, cells);
    measureCellLists.push(cells);
  });

  const allCells = measureCellLists.flat();
  const verseInfo = { v: 1 };
  assignLyrics(lines, allCells, verseInfo);
  const verseCount = verseInfo.v;

  // 贪心分行
  const maxW = theme.contentWidth;
  const layoutLines: LayoutLine[] = [];
  let current: LayoutCell[] = [];
  let x = 0;
  let lineMeasureNumber: number | null = null;

  const flush = () => {
    if (current.length === 0) return;
    let cx = 28;
    for (const c of current) {
      c.x = cx;
      cx += c.width;
    }
    const byId = new Map<number, LayoutCell[]>();
    for (const c of current) {
      if (c.beamId === null) continue;
      const arr = byId.get(c.beamId) ?? [];
      arr.push(c);
      byId.set(c.beamId, arr);
    }
    const beamSpans: BeamSpan[] = [];
    for (const [id, group] of byId) {
      if (group.length < 2) continue;
      const startX = group[0]!.x + 6;
      const endX =
        group[group.length - 1]!.x + group[group.length - 1]!.width - 6;
      const maxUnder = Math.max(...group.map((c) => c.underlines), 1);
      // 与 svg 减时线 y 对齐：ny=18, uy=ny+noteSize/2+3+i*underGap
      // noteSize 默认 18 → uy = 18+9+3+i*gap = 30+i*gap
      const noteSize = theme.noteSize;
      for (let lv = 1; lv <= maxUnder; lv += 1) {
        const y = noteSize + noteSize / 2 + 3 + (lv - 1) * theme.underGap;
        beamSpans.push({
          id: id * 10 + lv,
          startX,
          endX,
          y,
          level: lv,
        });
      }
    }
    const height = theme.lineHeight + verseCount * theme.lyricLineHeight;
    layoutLines.push({
      y: 0,
      cells: current,
      beams: beamSpans,
      measureNumber: lineMeasureNumber,
      height,
    });
    current = [];
    x = 0;
    lineMeasureNumber = null;
  };

  measureCellLists.forEach((cells, mi) => {
    const w = cells.reduce((s, c) => s + c.width, 0);
    if (current.length > 0 && x + w > maxW) flush();
    if (current.length === 0) lineMeasureNumber = measures[mi]?.number ?? null;
    current.push(...cells);
    x += w;
  });
  flush();

  let y = 0;
  if (headers.T) y += theme.titleSize + 16;
  if (headers.K || headers.M) y += 18;
  y += 12;
  for (const line of layoutLines) {
    line.y = y;
    y += line.height + theme.systemGap;
  }

  return {
    width: theme.contentWidth,
    height: y + 24,
    title: headers.T ?? '',
    keyLabel: headers.K ?? '',
    meterLabel: headers.M ?? '',
    lines: layoutLines,
    theme,
  };
}

/** 兼容旧接口：由 measures + 全局 lyrics 排版（全部视为多段歌词） */
export function layoutScore(
  measures: MeasureInfo[],
  beams: { measure: number; indices: number[] }[],
  lyrics: string[],
  headers: { T?: string; K?: string; M?: string },
  theme: RenderTheme = defaultTheme,
): ScoreLayout {
  const synthetic: SourceLine[] = [];
  if (headers.T) synthetic.push({ type: 'header', key: 'T', value: headers.T });
  if (headers.K) synthetic.push({ type: 'header', key: 'K', value: headers.K });
  if (headers.M) synthetic.push({ type: 'header', key: 'M', value: headers.M });
  for (const m of measures) {
    const tokens = [...m.tokens, { kind: 'bar', payload: '|' } as Token];
    synthetic.push({ type: 'music', tokens, raw: '' });
  }
  for (const l of lyrics) synthetic.push({ type: 'lyric', text: l });
  return layoutScoreFromOrdered(synthetic, beams, theme);
}

/** 供 analyze 使用：拍号仅作元数据 */
export function meterLabelOf(meter: string | undefined): string {
  if (!meter) return '';
  return parseMeter(meter) ? meter : '';
}
