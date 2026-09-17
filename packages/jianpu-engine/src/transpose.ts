/**
 * 移调（简谱核心优势）：
 * 数字是音级，**一键移调 = 换调号，数字不动**。
 * 例：1=C 的整曲移到 1=bB，`1 1 5 5` 仍是 `1 1 5 5`，只改 `K:`。
 *
 * 另提供「绝对音高保持」API：音级+变音 → 半音 → 新调音级，变音号重算。
 * 用于把外部音高对齐到新调，或校验移调前后实际音高。
 */

/** 大调音级相对主音的半音：1 2 3 4 5 6 7 → 0 2 4 5 7 9 11 */
const DEGREE_SEMITONES = [0, 0, 2, 4, 5, 7, 9, 11] as const;

const FLAT_KEYS = ['C', 'bD', 'D', 'bE', 'E', 'F', 'bG', 'G', 'bA', 'A', 'bB', 'B'] as const;
const SHARP_KEYS = ['C', '#C', 'D', '#D', 'E', 'F', '#F', 'G', '#G', 'A', '#A', 'B'] as const;

/** 调号 `1=C` / `1=bB` / `1=#F` → 主音相对 C 的半音 */
export function keyToSemitones(key: string): number | null {
  const m = /^1\s*=\s*([#b]?)([A-Ga-g])$/.exec(key.trim());
  if (!m) return null;
  const baseMap: Record<string, number> = {
    C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
  };
  const letter = m[2]!.toUpperCase();
  const base = baseMap[letter];
  if (base === undefined) return null;
  const acc = m[1] === '#' ? 1 : m[1] === 'b' ? -1 : 0;
  return (((base + acc) % 12) + 12) % 12;
}

/** 把半音写回调号；默认偏好降号（简谱更常见） */
export function semitonesToKey(semitones: number, prefer: 'flat' | 'sharp' = 'flat'): string {
  const s = (((semitones % 12) + 12) % 12);
  const names = prefer === 'flat' ? FLAT_KEYS : SHARP_KEYS;
  return `1=${names[s]}`;
}

/** 从 fromKey 移 semitones 半音，得到新调号 */
export function transposeKey(fromKey: string, semitones: number, prefer: 'flat' | 'sharp' = 'flat'): string | null {
  const from = keyToSemitones(fromKey);
  if (from === null) return null;
  return semitonesToKey(from + semitones, prefer);
}

/** 两调之间的半音差（0–11）；null 表示调号无法解析 */
export function transposeDelta(fromKey: string, toKey: string): number | null {
  const from = keyToSemitones(fromKey);
  const to = keyToSemitones(toKey);
  if (from === null || to === null) return null;
  return ((to - from) % 12 + 12) % 12;
}

/**
 * 简谱主路径：音级移调。
 * 数字与变化音记号全部保留，只改调号——这就是「数字照旧」。
 */
export interface DegreeTransposeResult {
  fromKey: string;
  toKey: string;
  /** 始终为 null——音级移调不改数字 */
  digit: number;
  acc: number | null;
}

export function transposeDegreeNote(
  digit: number,
  acc: number | null,
  _fromKey: string,
  _toKey: string,
): DegreeTransposeResult | null {
  if (digit < 0 || digit > 7) return null;
  return { digit, acc, fromKey: _fromKey, toKey: _toKey };
}

export interface AbsoluteNote {
  digit: number;
  acc: 1 | -1 | 0 | null;
  digitChanged: boolean;
}

function noteAbsoluteSemitones(digit: number, acc: number | null, fromKey: string): number | null {
  if (digit < 1 || digit > 7) return null;
  const tonic = keyToSemitones(fromKey);
  if (tonic === null) return null;
  return (((tonic + DEGREE_SEMITONES[digit]! + (acc ?? 0)) % 12) + 12) % 12;
}

/**
 * 绝对音高保持的移调：音级+变音 → 半音 → 新调音级。
 * 仅用于需要固定实际音高的场景；日常成册移调请用调号 + 数字不变。
 */
export function transposeNoteAbsolute(
  digit: number,
  acc: number | null,
  fromKey: string,
  toKey: string,
): AbsoluteNote | null {
  if (digit < 1 || digit > 7) return null;
  const abs = noteAbsoluteSemitones(digit, acc, fromKey);
  const toTonic = keyToSemitones(toKey);
  if (abs === null || toTonic === null) return null;

  const rel = ((abs - toTonic) % 12 + 12) % 12;
  // 先找自然音级（调内音），再考虑升/降——否则 5 半音会先撞上 #3 而不是 4
  for (let d = 1; d <= 7; d += 1) {
    if (((rel - DEGREE_SEMITONES[d]!) % 12 + 12) % 12 === 0) {
      return { digit: d, acc: null, digitChanged: d !== digit };
    }
  }
  for (let d = 1; d <= 7; d += 1) {
    const delta = ((rel - DEGREE_SEMITONES[d]!) % 12 + 12) % 12;
    if (delta === 1) return { digit: d, acc: 1, digitChanged: d !== digit };
    if (delta === 11) return { digit: d, acc: -1, digitChanged: d !== digit };
  }
  return null;
}

/** @deprecated 使用 transposeNoteAbsolute */
export const transposeNote = transposeNoteAbsolute;
