import { beatsOf } from './validate.js';
import type { BeamGroup, MeasureInfo, Meter } from './types.js';
import { parseMeter } from './validate.js';

/**
 * 拍内自动连音（beaming）：
 * 把 dur≤0.5 的相邻 note/rest 按拍结构分组；连音组不跨小节线。
 * 4/4 → 每拍 2 个八分；6/8 → 3+3。
 */
export function beamGroups(measures: MeasureInfo[], meter: string): BeamGroup[] {
  const parsed: Meter | null = parseMeter(meter);
  if (!parsed) return [];
  const { eighthsPerBeat } = parsed;
  const groups: BeamGroup[] = [];

  for (const measure of measures) {
    const m = measure.tokens;
    let i = 0;
    while (i < m.length) {
      const t = m[i]!;
      if ((t.kind === 'note' || t.kind === 'rest') && t.payload.dur <= 0.5) {
        const indices = [i];
        let count = beatsOf(t) * 2; // 八分单位
        let j = i;
        while (j + 1 < m.length) {
          const next = m[j + 1]!;
          if (beatsOf(next) > 0.5) break;
          if (count >= eighthsPerBeat) break;
          j += 1;
          indices.push(j);
          count += beatsOf(next) * 2;
        }
        groups.push({ measure: measure.number, indices });
        i = j + 1;
      } else {
        i += 1;
      }
    }
  }
  return groups;
}
