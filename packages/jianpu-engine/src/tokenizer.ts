import type { Accidental, NotePayload, Token } from './types.js';

/**
 * 后缀顺序（W0 定稿）：变化音 → 数字 → 八度(`'` `,`) → 减时线(`_`) → 附点(`.`)
 * 例：`#1'_.` = 升、高八度、附点八分
 */
const NOTE_RE = /^([#b=]?)(\d)([',]*)(_*)(\.?)$/;

const ACCIDENTAL: Record<string, Accidental> = { '#': 1, b: -1, '=': 0 };
const DUR_UNDER: Record<string, number> = { '': 1, _: 0.5, __: 0.25, ___: 0.125 };

/** 括号连写友好：`(1 2 3)` / `[1 5]` / `{5}1` 都切成独立 token */
const TOKEN_SPLIT_RE = /[()[\]{}]|[^()[\]{}\s]+/g;

const BARS = new Set(['|', '||', '|]', '|:', ':|']);

export function parseToken(tok: string): Token {
  if (BARS.has(tok)) {
    return { kind: 'bar', payload: tok };
  }
  if (tok === '-') {
    return { kind: 'extend', payload: 1 };
  }
  const m = NOTE_RE.exec(tok);
  if (m) {
    const [, acc, digit, oct, under, dot] = m;
    const underCount = under.length;
    if (underCount > 3) {
      return { kind: 'error', payload: tok };
    }
    const base = DUR_UNDER[under];
    const dur = base * (dot ? 1.5 : 1);
    const octv = (oct.match(/'/g)?.length ?? 0) - (oct.match(/,/g)?.length ?? 0);
    const payload: NotePayload = {
      digit: Number(digit),
      oct: octv,
      dur,
      dot: Boolean(dot),
      acc: acc ? (ACCIDENTAL[acc] as Accidental) : null,
      under: underCount,
    };
    return { kind: digit === '0' ? 'rest' : 'note', payload };
  }
  return { kind: 'error', payload: tok };
}

function tokenizeGroup(parts: string[], start: number, close: string): { tokens: Token[]; next: number } {
  const tokens: Token[] = [];
  let i = start;
  while (i < parts.length && parts[i] !== close) {
    tokens.push(parseToken(parts[i]!));
    i += 1;
  }
  return { tokens, next: i };
}

/** 音乐行 → token 列表（保留 triplet / chord / grace 结构） */
export function tokenizeLine(line: string): Token[] {
  const parts = line.match(TOKEN_SPLIT_RE) ?? [];
  const toks: Token[] = [];
  let i = 0;
  while (i < parts.length) {
    const p = parts[i]!;
    if (p === '(') {
      const { tokens, next } = tokenizeGroup(parts, i + 1, ')');
      toks.push({ kind: 'triplet', payload: tokens });
      i = next;
    } else if (p === '[') {
      const { tokens, next } = tokenizeGroup(parts, i + 1, ']');
      toks.push({ kind: 'chord', payload: tokens });
      i = next;
    } else if (p === '{') {
      const { tokens, next } = tokenizeGroup(parts, i + 1, '}');
      toks.push({ kind: 'grace', payload: tokens });
      i = next;
    } else {
      toks.push(parseToken(p));
    }
    i += 1;
  }
  return toks;
}

/** 递归收集所有 error token（含括号组内部）——W0 bug#5 */
export function collectErrors(music: Token[][]): string[] {
  const out: string[] = [];
  const walk = (t: Token) => {
    if (t.kind === 'error') out.push(t.payload);
    else if (t.kind === 'triplet' || t.kind === 'chord' || t.kind === 'grace') {
      for (const x of t.payload) walk(x);
    }
  };
  for (const line of music) for (const t of line) walk(t);
  return out;
}
