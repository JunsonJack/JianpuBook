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
export { parseSong } from './parser.js';
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
} from './transpose.js';
export type { AbsoluteNote, DegreeTransposeResult } from './transpose.js';

import { parseSong } from './parser.js';
import { validateMeasures } from './validate.js';
import { beamGroups } from './beam.js';
import { collectErrors } from './tokenizer.js';
import type { ParsedSong, ValidationResult, BeamGroup } from './types.js';

export interface AnalyzeResult {
  song: ParsedSong;
  validation: ValidationResult;
  beams: BeamGroup[];
  parseErrors: string[];
}

/** 一站式：解析 + 校验 + 连音分组 */
export function analyze(text: string, meterOverride?: string): AnalyzeResult {
  const song = parseSong(text);
  const meter = meterOverride ?? song.headers.M ?? '4/4';
  const validation = validateMeasures(song.music, meter);
  const beams = beamGroups(validation.measures, meter);
  const parseErrors = collectErrors(song.music);
  return { song, validation, beams, parseErrors };
}
