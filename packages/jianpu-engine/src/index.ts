export type {
  Accidental,
  NotePayload,
  Token,
  SongHeaders,
  ParsedSong,
  ValidationError,
  MeasureInfo,
  ValidationResult,
  BeamGroup,
  Meter,
} from './types.js';

export { parseToken, tokenizeLine, collectErrors } from './tokenizer.js';
export { parseSong, parseSongOrdered } from './parser.js';
export type { SourceLine, OrderedSong } from './parser.js';
export { parseMeter, beatsOf, validateMeasures } from './validate.js';
export { beamGroups } from './beam.js';
export {
  keyToSemitones,
  semitonesToKey,
  transposeDelta,
  transposeKey,
  transposeDegreeNote,
  transposeNoteAbsolute,
  transposeNote,
  transposeJianpuText,
} from './transpose.js';
export type { AbsoluteNote, DegreeTransposeResult } from './transpose.js';
export { layoutScore, layoutScoreFromOrdered, defaultTheme } from './layout.js';
export type {
  RenderTheme,
  LayoutCell,
  LayoutLine,
  ScoreLayout,
  BeamSpan,
  LyricSlot,
} from './layout.js';
export { renderSvg } from './svg.js';

import { parseSongOrdered } from './parser.js';
import { validateMeasures } from './validate.js';
import { beamGroups } from './beam.js';
import { collectErrors } from './tokenizer.js';
import { layoutScoreFromOrdered, defaultTheme } from './layout.js';
import { renderSvg } from './svg.js';
import type { ParsedSong, ValidationResult, BeamGroup } from './types.js';
import type { RenderTheme, ScoreLayout } from './layout.js';

export interface AnalyzeResult {
  song: ParsedSong;
  validation: ValidationResult;
  beams: BeamGroup[];
  parseErrors: string[];
  layout: ScoreLayout;
  svg: string;
}

/** 一站式：解析 + 校验 + 连音 + 排版 + SVG（保留音乐/歌词交错顺序） */
export function analyze(
  text: string,
  meterOverride?: string,
  theme: RenderTheme = defaultTheme,
): AnalyzeResult {
  const ordered = parseSongOrdered(text);
  const music = ordered.lines
    .filter((l) => l.type === 'music')
    .map((l) => (l.type === 'music' ? l.tokens : []));
  const lyrics = ordered.lines
    .filter((l) => l.type === 'lyric')
    .map((l) => (l.type === 'lyric' ? l.text : ''));
  const song: ParsedSong = { headers: ordered.headers, music, lyrics };

  const meter = meterOverride ?? ordered.headers.M ?? '4/4';
  const validation = validateMeasures(song.music, meter);
  const beams = beamGroups(validation.measures, meter);
  const parseErrors = collectErrors(song.music);
  const layout = layoutScoreFromOrdered(ordered.lines, beams, theme);
  const svg = renderSvg(layout);
  return { song, validation, beams, parseErrors, layout, svg };
}
