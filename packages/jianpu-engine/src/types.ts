/** 变化音：升 / 降 / 还原 */
export type Accidental = 1 | -1 | 0;

export interface NotePayload {
  /** 简谱数字 0–7；0 = 休止符 */
  digit: number;
  /** 八度偏移：' 为 +1，, 为 -1，可叠加 */
  oct: number;
  /** 时值（以四分音符 = 1 拍） */
  dur: number;
  /** 是否附点 */
  dot: boolean;
  /** 变化音；null = 无 */
  acc: Accidental | null;
  /** 减时线条数 0–3 */
  under: number;
}

export type Token =
  | { kind: 'note'; payload: NotePayload }
  | { kind: 'rest'; payload: NotePayload }
  | { kind: 'bar'; payload: string }
  | { kind: 'extend'; payload: number }
  | { kind: 'triplet'; payload: Token[] }
  | { kind: 'chord'; payload: Token[] }
  | { kind: 'grace'; payload: Token[] }
  | { kind: 'error'; payload: string };

export interface SongHeaders {
  /** T: 曲名 */
  T?: string;
  /** K: 调号，如 1=C */
  K?: string;
  /** M: 拍号，如 4/4 */
  M?: string;
  /** Q: 速度，如 ♩=100 */
  Q?: string;
  /** S: 来源备注 */
  S?: string;
}

export interface ParsedSong {
  headers: SongHeaders;
  /** 每个元素是一行音乐的 token 序列 */
  music: Token[][];
  /** 歌词段；每段对应一条 `词:` 行 */
  lyrics: string[];
}

export interface ValidationError {
  /** 1-based 小节号；null 表示全局错误 */
  measure: number | null;
  message: string;
}

export interface MeasureInfo {
  /** 1-based 编号（空小节不编号） */
  number: number;
  tokens: Token[];
  /** 小节总时值（拍） */
  beats: number;
}

export interface ValidationResult {
  measures: MeasureInfo[];
  errors: ValidationError[];
}

export interface BeamGroup {
  /** 1-based 小节号 */
  measure: number;
  /** 小节内 token 下标列表 */
  indices: number[];
}

/** 拍号解析结果 */
export interface Meter {
  numerator: number;
  denominator: number;
  /** 每小节拍数（四分音符为 1 拍）：4/4→4, 6/8→3 */
  beatsPerMeasure: number;
  /** 一拍对应的八分音符数：4/4→2, 6/8→3 */
  eighthsPerBeat: number;
}
