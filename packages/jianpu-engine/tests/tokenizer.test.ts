import { describe, expect, it } from 'vitest';
import { parseToken, tokenizeLine, collectErrors } from '../src/tokenizer.js';

describe('parseToken 后缀顺序（W0 定稿）', () => {
  it('四分音符', () => {
    const t = parseToken('1');
    expect(t.kind).toBe('note');
    if (t.kind !== 'note') return;
    expect(t.payload.digit).toBe(1);
    expect(t.payload.dur).toBe(1);
    expect(t.payload.oct).toBe(0);
    expect(t.payload.acc).toBeNull();
  });

  it('减时线：八分/十六分/三十二分', () => {
    expect(parseToken('1_')).toMatchObject({ kind: 'note', payload: { dur: 0.5 } });
    expect(parseToken('1__')).toMatchObject({ kind: 'note', payload: { dur: 0.25 } });
    expect(parseToken('1___')).toMatchObject({ kind: 'note', payload: { dur: 0.125 } });
  });

  it('附点八分 1_. = 0.75 拍', () => {
    expect(parseToken('1_')).toMatchObject({ payload: { dur: 0.5, dot: false } });
    const t = parseToken('1_.');
    expect(t).toMatchObject({ kind: 'note', payload: { dur: 0.75, dot: true, under: 1 } });
  });

  it('八度必须在减时线/附点之前', () => {
    const ok = parseToken("#1'_.");
    expect(ok.kind).toBe('note');
    if (ok.kind !== 'note') return;
    expect(ok.payload).toMatchObject({ digit: 1, oct: 1, dur: 0.75, acc: 1, under: 1 });

    // 1...' 拒绝（八度引号在附点之后）
    expect(parseToken("1...'").kind).toBe('error');
  });

  it('低八度与净八度', () => {
    const t = parseToken('1,.');
    expect(t.kind).toBe('note');
    if (t.kind !== 'note') return;
    expect(t.payload.oct).toBe(-1);
    expect(t.payload.dot).toBe(true);
  });

  it('变化音', () => {
    expect(parseToken('#1')).toMatchObject({ payload: { acc: 1 } });
    expect(parseToken('b7')).toMatchObject({ payload: { acc: -1 } });
    expect(parseToken('=4')).toMatchObject({ payload: { acc: 0 } });
  });

  it('休止符与增时线', () => {
    expect(parseToken('0').kind).toBe('rest');
    expect(parseToken('0_')).toMatchObject({ kind: 'rest', payload: { dur: 0.5 } });
    expect(parseToken('-')).toEqual({ kind: 'extend', payload: 1 });
  });

  it('小节线', () => {
    for (const bar of ['|', '||', '|]', '|:', ':|']) {
      expect(parseToken(bar)).toEqual({ kind: 'bar', payload: bar });
    }
  });
});

describe('tokenizeLine 括号连写（W0 bug#1）', () => {
  it('(1 2 3) 三连音连写', () => {
    const toks = tokenizeLine('(1 2 3) 4');
    expect(toks[0]!.kind).toBe('triplet');
    if (toks[0]!.kind !== 'triplet') return;
    expect(toks[0]!.payload).toHaveLength(3);
    expect(toks[1]).toMatchObject({ kind: 'note', payload: { digit: 4 } });
  });

  it('[1 5] 双音连写', () => {
    const toks = tokenizeLine('[1 5]');
    expect(toks[0]!.kind).toBe('chord');
  });

  it('{5}1 倚音连写', () => {
    const toks = tokenizeLine('{5}1');
    expect(toks[0]!.kind).toBe('grace');
    expect(toks[1]).toMatchObject({ kind: 'note', payload: { digit: 1 } });
  });

  it('分写与连写等价', () => {
    const a = tokenizeLine('( 1 2 3 )');
    const b = tokenizeLine('(1 2 3)');
    expect(a).toEqual(b);
  });
});

describe('collectErrors 递归（W0 bug#5）', () => {
  it('能收集括号组内部的 error', () => {
    const music = [tokenizeLine('(1 2 XX) 4 |')];
    expect(collectErrors(music)).toContain('XX');
  });
});
