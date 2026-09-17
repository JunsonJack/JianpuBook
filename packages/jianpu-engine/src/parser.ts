import { tokenizeLine } from './tokenizer.js';
import type { ParsedSong, SongHeaders, Token } from './types.js';

const HEADER_RE = /^([TKMQS]):\s*(.*)$/;
const LYRIC_PREFIX = '词';

/**
 * 解析完整 JianpuText 文本。
 * - `T:` / `K:` / `M:` / `Q:` / `S:` 为头部
 * - `词:` 行为歌词
 * - 其余非空行为音乐行
 */
export function parseSong(text: string): ParsedSong {
  const headers: SongHeaders = {};
  const music: Token[][] = [];
  const lyrics: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const hm = HEADER_RE.exec(line);
    if (hm) {
      const key = hm[1] as keyof SongHeaders;
      headers[key] = hm[2]!.trim();
      continue;
    }
    if (line.startsWith(LYRIC_PREFIX) && line.includes(':')) {
      lyrics.push(line.split(':', 2)[1]!.trim());
      continue;
    }
    music.push(tokenizeLine(line));
  }

  return { headers, music, lyrics };
}
