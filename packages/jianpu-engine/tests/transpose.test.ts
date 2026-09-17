import { describe, expect, it } from 'vitest';
import {
  keyToSemitones,
  semitonesToKey,
  transposeDelta,
  transposeKey,
  transposeDegreeNote,
  transposeNoteAbsolute,
  transposeJianpuText,
} from '../src/transpose.js';

describe('调号解析', () => {
  it('1=C / 1=G / 1=bB / 1=#F', () => {
    expect(keyToSemitones('1=C')).toBe(0);
    expect(keyToSemitones('1=G')).toBe(7);
    expect(keyToSemitones('1=bB')).toBe(10);
    expect(keyToSemitones('1=#F')).toBe(6);
  });

  it('非法调号返回 null', () => {
    expect(keyToSemitones('C')).toBeNull();
    expect(keyToSemitones('1=H')).toBeNull();
  });
});

describe('音级移调（主路径：数字照旧）', () => {
  it('1=C → 1=bB：数字不变', () => {
    expect(transposeDegreeNote(4, null, '1=C', '1=bB')).toMatchObject({
      digit: 4,
      acc: null,
    });
    expect(transposeDegreeNote(1, null, '1=C', '1=G')).toMatchObject({
      digit: 1,
      acc: null,
    });
    expect(transposeDegreeNote(4, 1, '1=C', '1=bB')).toMatchObject({
      digit: 4,
      acc: 1,
    });
  });

  it('调号整体移调', () => {
    expect(transposeKey('1=C', 2)).toBe('1=D');
    expect(transposeKey('1=C', -2)).toBe('1=bB');
    expect(transposeKey('1=G', 5)).toBe('1=C');
    expect(transposeDelta('1=C', '1=bB')).toBe(10);
  });

  it('semitonesToKey 偏好降号', () => {
    expect(semitonesToKey(10)).toBe('1=bB');
    expect(semitonesToKey(1)).toBe('1=bD');
    expect(semitonesToKey(1, 'sharp')).toBe('1=#C');
  });
});

describe('JianpuText 音级移调（只改 K）', () => {
  it('替换已有 K 行，数字行不动', () => {
    const src = `T: 小星星\nK: 1=C\nM: 4/4\n\n1 1 5 5 | 6 6 5 - ||\n`;
    const out = transposeJianpuText(src, '1=bB');
    expect(out).toContain('K: 1=bB');
    expect(out).toContain('1 1 5 5 | 6 6 5 - ||');
    expect(out).not.toContain('K: 1=C');
  });

  it('无 K 时插入文件头', () => {
    const out = transposeJianpuText('1 2 3 4 |', '1=G');
    expect(out.startsWith('K: 1=G')).toBe(true);
    expect(out).toContain('1 2 3 4 |');
  });
});

describe('绝对音高保持移调', () => {
  it('1=C 的 1(C) 移到 1=G → 4（固定音高 C 是 G 调的 4 级）', () => {
    expect(transposeNoteAbsolute(1, null, '1=C', '1=G')).toEqual({
      digit: 4,
      acc: null,
      digitChanged: true,
    });
  });

  it('1=C 的 5(G) 移到 1=G → 1（G 到新主音）', () => {
    expect(transposeNoteAbsolute(5, null, '1=C', '1=G')).toEqual({
      digit: 1,
      acc: null,
      digitChanged: true,
    });
  });

  it('1=C 的 4(F) 移到 1=bB → 5（F 是 bB 调的 5 级）', () => {
    expect(transposeNoteAbsolute(4, null, '1=C', '1=bB')).toEqual({
      digit: 5,
      acc: null,
      digitChanged: true,
    });
  });

  it('1=C 的 #1(C#) 移到 1=bB → #2', () => {
    const r = transposeNoteAbsolute(1, 1, '1=C', '1=bB');
    expect(r).not.toBeNull();
    expect(r!.digit).toBe(2);
    expect(r!.acc).toBe(1);
  });
});
