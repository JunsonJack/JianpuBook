import type { LayoutCell, ScoreLayout } from './layout.js';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderCell(cell: LayoutCell, originY: number, theme: ScoreLayout['theme']): string {
  const parts: string[] = [];
  const cx = cell.x + cell.width / 2;
  // 音符基线：数字中心约在 originY + 18
  const ny = originY + 18;

  if (cell.kind === 'bar') {
    const isFinal = cell.text === '||' || cell.text === '|]';
    const isRepeat = cell.text === '|:' || cell.text === ':|';
    const barH = 22;
    const y1 = ny - 14;
    const y2 = y1 + barH;
    const x = cell.x + cell.width - 6;
    parts.push(
      `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#1c1b19" stroke-width="1"/>`,
    );
    if (isFinal || isRepeat) {
      parts.push(
        `<line x1="${x + 3}" y1="${y1}" x2="${x + 3}" y2="${y2}" stroke="#1c1b19" stroke-width="2.5"/>`,
      );
    }
    if (cell.text === '|:') {
      parts.push(`<circle cx="${x + 8}" cy="${y1 + 7}" r="1.6" fill="#1c1b19"/>`);
      parts.push(`<circle cx="${x + 8}" cy="${y1 + 15}" r="1.6" fill="#1c1b19"/>`);
    }
    if (cell.text === ':|') {
      parts.push(`<circle cx="${x - 4}" cy="${y1 + 7}" r="1.6" fill="#1c1b19"/>`);
      parts.push(`<circle cx="${x - 4}" cy="${y1 + 15}" r="1.6" fill="#1c1b19"/>`);
    }
    return parts.join('');
  }

  if (cell.kind === 'grace') {
    parts.push(
      `<text x="${cx}" y="${ny - 6}" text-anchor="middle" font-size="${theme.noteSize * 0.65}" font-family="serif" fill="#1c1b19">${esc(cell.text)}</text>`,
    );
    // 装饰斜线
    parts.push(
      `<line x1="${cx - 8}" y1="${ny + 2}" x2="${cx - 2}" y2="${ny - 10}" stroke="#1c1b19" stroke-width="1"/>`,
    );
    return parts.join('');
  }

  // 变化音
  if (cell.accidental) {
    parts.push(
      `<text x="${cx - cell.width / 2 + 3}" y="${ny}" text-anchor="start" font-size="${theme.noteSize * 0.7}" font-family="serif" fill="#1c1b19">${esc(cell.accidental)}</text>`,
    );
  }

  // 主数字
  const digitX = cx + (cell.accidental ? 2 : 0);
  parts.push(
    `<text x="${digitX}" y="${ny}" text-anchor="middle" dominant-baseline="middle" font-size="${theme.noteSize}" font-family="serif" fill="#1c1b19">${esc(cell.text)}</text>`,
  );

  // 和声音（纵向叠）
  cell.chordDigits.forEach((d, i) => {
    parts.push(
      `<text x="${digitX}" y="${ny - (i + 1) * (theme.noteSize - 2)}" text-anchor="middle" dominant-baseline="middle" font-size="${theme.noteSize * 0.9}" font-family="serif" fill="#1c1b19">${esc(d)}</text>`,
    );
  });

  // 八度点
  const r = theme.octaveR;
  if (cell.octave > 0) {
    const top = ny - theme.noteSize / 2 - 4 - (cell.chordDigits.length * (theme.noteSize - 2));
    for (let i = 0; i < cell.octave; i += 1) {
      parts.push(`<circle cx="${digitX}" cy="${top - i * 5}" r="${r}" fill="#1c1b19"/>`);
    }
  } else if (cell.octave < 0) {
    const bot = ny + theme.noteSize / 2 + 4;
    for (let i = 0; i < -cell.octave; i += 1) {
      parts.push(`<circle cx="${digitX}" cy="${bot + i * 5}" r="${r}" fill="#1c1b19"/>`);
    }
  }

  // 附点
  if (cell.dotted) {
    parts.push(
      `<circle cx="${digitX + theme.noteSize * 0.55}" cy="${ny - 2}" r="1.8" fill="#1c1b19"/>`,
    );
  }

  // 减时线（非 beam 时逐音符画；beam 时由连音线覆盖）
  if (cell.underlines > 0 && cell.beamId === null) {
    const half = theme.noteSize * 0.42;
    for (let i = 0; i < cell.underlines; i += 1) {
      const uy = ny + theme.noteSize / 2 + 3 + i * theme.underGap;
      parts.push(
        `<line x1="${digitX - half}" y1="${uy}" x2="${digitX + half}" y2="${uy}" stroke="#1c1b19" stroke-width="1.4"/>`,
      );
    }
  }

  // 增时线（延长）
  if (cell.kind === 'extend') {
    parts.push(
      `<line x1="${cx - 6}" y1="${ny}" x2="${cx + 6}" y2="${ny}" stroke="#1c1b19" stroke-width="1.4"/>`,
    );
  }

  return parts.join('');
}

function renderLyrics(cell: LayoutCell, originY: number, theme: ScoreLayout['theme']): string {
  const parts: string[] = [];
  const cx = cell.x + cell.width / 2;
  const baseY = originY + theme.lineHeight - 8;
  cell.lyrics.forEach((slot, i) => {
    const y = baseY + i * theme.lyricLineHeight;
    if (slot.hold) {
      parts.push(
        `<line x1="${cx - 6}" y1="${y - 3}" x2="${cx + 6}" y2="${y - 3}" stroke="#1c1b19" stroke-width="1"/>`,
      );
      return;
    }
    if (!slot.text) return;
    parts.push(
      `<text x="${cx}" y="${y}" text-anchor="middle" font-size="${theme.lyricSize}" font-family="serif, 'Songti SC', 'SimSun', sans-serif" fill="#1c1b19">${esc(slot.text)}</text>`,
    );
  });
  return parts.join('');
}

/**
 * 将排版结果渲染为完整 SVG 字符串（自包含，无外部资源）。
 */
export function renderSvg(layout: ScoreLayout): string {
  const { theme } = layout;
  const body: string[] = [];

  body.push(
    `<rect width="${layout.width}" height="${layout.height}" fill="#ffffff"/>`,
  );

  let cursorY = 0;
  if (layout.title) {
    cursorY += theme.titleSize;
    body.push(
      `<text x="${layout.width / 2}" y="${cursorY}" text-anchor="middle" font-size="${theme.titleSize}" font-family="serif, 'Songti SC', 'SimSun', sans-serif" font-weight="600" fill="#1c1b19">${esc(layout.title)}</text>`,
    );
    cursorY += 16;
  }
  if (layout.keyLabel || layout.meterLabel) {
    cursorY += 14;
    const label = [layout.keyLabel, layout.meterLabel].filter(Boolean).join('  ');
    body.push(
      `<text x="${layout.width - 8}" y="${cursorY}" text-anchor="end" font-size="12" font-family="sans-serif" fill="#6b6560">${esc(label)}</text>`,
    );
  }

  for (const line of layout.lines) {
    const oy = line.y;
    if (line.measureNumber !== null) {
      body.push(
        `<text x="8" y="${oy + 14}" font-size="11" font-family="sans-serif" fill="#6b6560">${line.measureNumber}</text>`,
      );
    }
    // 谱行底线参考（极淡）
    body.push(
      `<line x1="28" y1="${oy + 18}" x2="${layout.width - 8}" y2="${oy + 18}" stroke="#f0ebe3" stroke-width="1"/>`,
    );

    for (const cell of line.cells) {
      body.push(renderCell(cell, oy, theme));
      body.push(renderLyrics(cell, oy, theme));
    }

    // 连音线（beam）：与减时线对齐；十六分画两层
    for (const b of line.beams) {
      const w = b.level === 1 ? 1.6 : 1.2;
      body.push(
        `<line x1="${b.startX}" y1="${oy + b.y}" x2="${b.endX}" y2="${oy + b.y}" stroke="#1c1b19" stroke-width="${w}"/>`,
      );
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">`,
    ...body,
    `</svg>`,
  ].join('');
}
