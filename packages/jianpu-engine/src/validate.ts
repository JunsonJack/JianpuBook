import type { MeasureInfo, Meter, Token, ValidationError, ValidationResult } from './types.js';

/** 解析拍号 `4/4` → Meter；失败返回 null */
export function parseMeter(meter: string): Meter | null {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(meter.trim());
  if (!m) return null;
  const numerator = Number(m[1]);
  const denominator = Number(m[2]);
  if (numerator <= 0 || denominator <= 0) return null;
  // 统一以八分音符为计数单位（W0 bug#4）：2/4→4, 4/4→2, 6/8→3, 16/x→1
  const eighthsPerBeat = { 2: 4, 4: 2, 8: 3, 16: 1 }[denominator as 2 | 4 | 8 | 16];
  if (eighthsPerBeat === undefined) return null;
  return {
    numerator,
    denominator,
    beatsPerMeasure: numerator * (4 / denominator),
    eighthsPerBeat,
  };
}

/** token 时值（拍，四分音符=1） */
export function beatsOf(token: Token): number {
  switch (token.kind) {
    case 'note':
    case 'rest':
      return token.payload.dur;
    case 'extend':
      return token.payload;
    case 'chord':
      return Math.max(...token.payload.map(beatsOf));
    case 'triplet':
      // 三连音：3 个八分三连音 = 1 拍 → inner × 2
      return Math.max(...token.payload.map(beatsOf)) * 2;
    default:
      return 0;
  }
}

/**
 * 按小节切分并校验时值。
 * - 空小节（终止线后 / 反复记号开头）不编号、不校验（W0 bug#3）
 * - 首小节不足拍：报「弱起」提示，需显式标记后豁免
 * - 其余小节时值必须等于拍号
 */
export function validateMeasures(music: Token[][], meter: string): ValidationResult {
  const parsed = parseMeter(meter);
  if (!parsed) {
    return {
      measures: [],
      errors: [{ measure: null, message: `无法解析拍号: ${meter}` }],
    };
  }
  const target = parsed.beatsPerMeasure;
  const raw: Token[][] = [];
  let cur: Token[] = [];
  for (const line of music) {
    for (const t of line) {
      if (t.kind === 'bar') {
        raw.push(cur);
        cur = [];
      } else {
        cur.push(t);
      }
    }
  }
  raw.push(cur);

  const measures: MeasureInfo[] = [];
  const errors: ValidationError[] = [];
  let number = 0;
  for (const tokens of raw) {
    if (tokens.length === 0) continue;
    number += 1;
    const beats = tokens.reduce((s, t) => s + beatsOf(t), 0);
    measures.push({ number, tokens, beats });
    if (number === 1 && beats < target - 1e-6) {
      errors.push({
        measure: number,
        message: `第 ${number} 小节: 仅 ${beats.toFixed(2)} 拍（弱起，需显式标记后豁免）`,
      });
    } else if ((number > 1 || beats > target) && Math.abs(beats - target) > 1e-6) {
      errors.push({
        measure: number,
        message: `第 ${number} 小节: 时值 ${beats.toFixed(2)} 拍 ≠ 拍号要求 ${target.toFixed(2)} 拍`,
      });
    }
  }
  return { measures, errors };
}
