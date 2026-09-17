import { tokenizeLine } from './tokenizer.js';
import type { ParsedSong, SongHeaders, Token } from './types.js';

const HEADER_RE = /^([TKMQS]):\s*(.*)$/;
const LYRIC_PREFIX = '词';

/** 源文件中的有序行（保留 音乐/歌词 交错顺序） */
export type SourceLine =
  | { type: 'header'; key: keyof SongHeaders; value: string }
  | { type: 'music'; tokens: Token[]; raw: string }
  | { type: 'lyric'; text: string };

/**
 * 解析完整 JianpuText 文本。
 * - `T:` / `K:` / `M:` / `Q:` / `S:` 为头部
 * - `词:` 行为歌词
 * - 其余非空行为音乐行
 */
export function parseSong(text: string): ParsedSong {
  const parsed = parseSongOrdered(text);
  return {
    headers: parsed.headers,
    music: parsed.lines.filter((l): l is Extract<SourceLine, { type: 'music' }> => l.type === 'music').map((l) => l.tokens),
    lyrics: parsed.lines.filter((l): l is Extract<SourceLine, { type: 'lyric' }> => l.type === 'lyric').map((l) => l.text),
  };
}

export interface OrderedSong {
  headers: SongHeaders;
  lines: SourceLine[];
}

/** 保留交错顺序的解析（歌词按段落配对谱行时必需） */
export function parseSongOrdered(text: string): OrderedSong {
  const headers: SongHeaders = {};
  const lines: SourceLine[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const hm = HEADER_RE.exec(line);
    if (hm) {
      const key = hm[1] as keyof SongHeaders;
      const value = hm[2]!.trim();
      headers[key] = value;
      lines.push({ type: 'header', key, value });
      continue;
    }
    if (line.startsWith(LYRIC_PREFIX) && line.includes(':')) {
      lines.push({ type: 'lyric', text: line.split(':', 2)[1]!.trim() });
      continue;
    }
    lines.push({ type: 'music', tokens: tokenizeLine(line), raw: line });
  }

  return { headers, lines };
}
