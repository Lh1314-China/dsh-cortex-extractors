const VALID_LAYOUTS = new Set(['auto', 'single', 'two-column', 'handwriting']);

export function normalizeLayout(value) {
  const layout = String(value ?? 'auto').trim().toLowerCase();
  if (!VALID_LAYOUTS.has(layout)) throw new Error('layout must be auto, single, two-column or handwriting');
  return layout;
}

function rowLines(text) {
  return String(text ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
}

/**
 * Convert Tesseract TSV output into line blocks with page coordinates.
 * Tesseract writes one word per row; adjacent words are grouped by the
 * (block, paragraph, line) tuple. Empty/conf-less rows are ignored.
 */
export function parseTesseractTsv(tsv, options = {}) {
  const lines = rowLines(tsv);
  const words = [];
  for (const line of lines.slice(1)) {
    const cols = line.split('\t');
    if (cols.length < 12) continue;
    const [, , blockNum, parNum, lineNum, wordNum, left, top, width, height, conf, text] = cols;
    const word = String(text ?? '').trim();
    if (!word) continue;
    const confidence = Number(conf);
    if (Number.isFinite(confidence) && confidence < 0) continue;
    const key = `${blockNum}:${parNum}:${lineNum}`;
    const x = Number(left);
    const y = Number(top);
    const w = Number(width);
    const h = Number(height);
    if (![x, y, w, h].every(Number.isFinite)) continue;
    words.push({
      text: word,
      key,
      wordNum: Number(wordNum) || 0,
      x,
      y,
      width: w,
      height: h,
    });
  }
  if (!words.length) return [];

  // A Tesseract line can span both columns. When requested, assign each
  // word to a column before grouping so left/right don't fuse into one line.
  let split = 0;
  if (options.splitColumns) {
    const minX = Math.min(...words.map((word) => word.x));
    const maxRight = Math.max(...words.map((word) => word.x + word.width));
    split = minX + (maxRight - minX) / 2;
  }
  const blocks = new Map();
  for (const word of words) {
    const column = split ? (word.x + word.width / 2 <= split ? 'L' : 'R') : 'A';
    const key = `${column}:${word.key}`;
    const current = blocks.get(key) ?? { words: [], x: word.x, y: word.y, right: word.x + word.width, bottom: word.y + word.height };
    current.words.push(word);
    current.x = Math.min(current.x, word.x);
    current.y = Math.min(current.y, word.y);
    current.right = Math.max(current.right, word.x + word.width);
    current.bottom = Math.max(current.bottom, word.y + word.height);
    blocks.set(key, current);
  }
  return [...blocks.entries()].map(([key, value]) => {
    const items = value.words.sort((a, b) => a.wordNum - b.wordNum || a.x - b.x);
    return {
      key,
      text: items.map((word) => word.text).join(' '),
      x: value.x,
      y: value.y,
      width: value.right - value.x,
      height: value.bottom - value.y,
    };
  }).filter((block) => block.text.trim());
}

function sortReadingOrder(a, b) {
  return a.y - b.y || a.x - b.x;
}

function hasTwoColumns(blocks) {
  const positioned = blocks.filter((block) => block.width > 0 && block.height > 0);
  if (positioned.length < 4) return false;
  const left = positioned.filter((block) => block.x + block.width / 2 <= (Math.min(...positioned.map((b) => b.x)) + Math.max(...positioned.map((b) => b.x + b.width))) / 2);
  const right = positioned.length - left.length;
  if (left.length < 2 || right < 2) return false;
  const leftRight = Math.max(...left.map((block) => block.x + block.width));
  const rightLeft = Math.min(...positioned.filter((block) => !left.includes(block)).map((block) => block.x));
  return rightLeft - leftRight > Math.max(20, (Math.max(...positioned.map((b) => b.x + b.width)) - Math.min(...positioned.map((b) => b.x))) * 0.04);
}

/**
 * Arrange OCR blocks into a stable reading order. `auto` only chooses
 * two-column when both columns are populated and separated by a gutter.
 */
/**
 * Group Windows OCR words into line blocks, optionally splitting a line at the
 * page midpoint so a line that spans both columns does not fuse them.
 */
export function orderWordBlocks(words, layout = 'auto') {
  const selected = normalizeLayout(layout);
  const list = (Array.isArray(words) ? words : [])
    .filter((word) => word && String(word.text ?? '').trim())
    .map((word) => ({
      text: String(word.text).replace(/\s+/g, ' ').trim(),
      x: Number(word.x) || 0,
      y: Number(word.y) || 0,
      width: Number(word.width) || 0,
      height: Number(word.height) || 0,
      line: Number(word.line) || 0,
      index: Number(word.index) || 0,
    }));
  if (!list.length) return '';
  const minX = Math.min(...list.map((word) => word.x));
  const maxRight = Math.max(...list.map((word) => word.x + word.width));
  const pageWidth = maxRight - minX;
  const split = minX + pageWidth / 2;
  const byLine = new Map();
  for (const word of list) {
    const key = word.line;
    const lines = byLine.get(key) ?? [];
    lines.push(word);
    byLine.set(key, lines);
  }
  const blocks = [];
  for (const [line, items] of byLine) {
    const sorted = items.sort((a, b) => a.index - b.index || a.x - b.x);
    const x = Math.min(...sorted.map((word) => word.x));
    const y = Math.min(...sorted.map((word) => word.y));
    const right = Math.max(...sorted.map((word) => word.x + word.width));
    const bottom = Math.max(...sorted.map((word) => word.y + word.height));
    // A single word straddling the midpoint marks a full-width footer/header.
    // A line with words on both sides but no straddling word is two columns.
    const fullWidth = sorted.some((word) => word.x < split && word.x + word.width > split);
    if (selected === 'single' || selected === 'handwriting' || fullWidth) {
      blocks.push({ text: sorted.map((word) => word.text).join(' '), x, y, width: right - x, height: bottom - y });
      continue;
    }
    for (const [column, wordsInColumn] of [
      ['L', sorted.filter((word) => word.x + word.width / 2 <= split)],
      ['R', sorted.filter((word) => word.x + word.width / 2 > split)],
    ]) {
      if (!wordsInColumn.length) continue;
      const cx = Math.min(...wordsInColumn.map((word) => word.x));
      const cy = Math.min(...wordsInColumn.map((word) => word.y));
      const cr = Math.max(...wordsInColumn.map((word) => word.x + word.width));
      const cb = Math.max(...wordsInColumn.map((word) => word.y + word.height));
      blocks.push({ text: wordsInColumn.map((word) => word.text).join(' '), x: cx, y: cy, width: cr - cx, height: cb - cy, key: `${column}:${line}` });
    }
  }
  return orderBlocks(blocks, selected);
}

export function orderBlocks(blocks, layout = 'auto') {
  const selected = normalizeLayout(layout);
  const list = (Array.isArray(blocks) ? blocks : [])
    .filter((block) => block && String(block.text ?? '').trim())
    .map((block) => ({
      text: String(block.text).replace(/\s+/g, ' ').trim(),
      x: Number(block.x) || 0,
      y: Number(block.y) || 0,
      width: Number(block.width) || 0,
      height: Number(block.height) || 0,
    }));
  if (!list.length) return '';
  if (selected === 'single' || selected === 'handwriting') {
    return list.sort(sortReadingOrder).map((block) => block.text).join('\n');
  }
  const twoColumns = selected === 'two-column' || (selected === 'auto' && hasTwoColumns(list));
  if (!twoColumns) return list.sort(sortReadingOrder).map((block) => block.text).join('\n');

  const minX = Math.min(...list.map((block) => block.x));
  const maxRight = Math.max(...list.map((block) => block.x + block.width));
  const midpoint = minX + (maxRight - minX) / 2;
  const full = [];
  let left = [];
  let right = [];
  for (const block of list) {
    const center = block.x + block.width / 2;
    const crossesCenter = block.x < midpoint && block.x + block.width > midpoint;
    if (block.width > (maxRight - minX) * 0.72 || crossesCenter) full.push(block);
    else if (center <= midpoint) left.push(block);
    else right.push(block);
  }
  // If only one column has content, there is nothing to interleave. Return
  // plain reading order rather than classifying the same full blocks twice.
  if (!left.length || !right.length) {
    return list.sort(sortReadingOrder).map((block) => block.text).join('\n');
  }
  // A footer/header can be narrower than the page but still span the gutter.
  // Move those blocks out of a column so they don't sit between L and R.
  if (left.length && right.length) {
    const leftEdge = Math.max(...left.map((block) => block.x + block.width));
    const rightEdge = Math.min(...right.map((block) => block.x));
    if (rightEdge > leftEdge) {
      for (const block of [...left, ...right]) {
        if (block.x < rightEdge && block.x + block.width > leftEdge) {
          full.push(block);
          left = left.filter((item) => item !== block);
          right = right.filter((item) => item !== block);
        }
      }
    }
  }
  const columnBlocks = [...left, ...right].sort(sortReadingOrder);
  const columnTop = columnBlocks.length ? Math.min(...columnBlocks.map((block) => block.y)) : Infinity;
  const columnBottom = columnBlocks.length ? Math.max(...columnBlocks.map((block) => block.y + block.height)) : -Infinity;
  const fullTop = full.filter((block) => block.y < columnTop).sort(sortReadingOrder);
  const fullBottom = full.filter((block) => block.y > columnBottom).sort(sortReadingOrder);
  const fullMiddle = full.filter((block) => block.y >= columnTop && block.y <= columnBottom).sort(sortReadingOrder);
  const ordered = [
    ...fullTop,
    ...left.sort(sortReadingOrder),
    ...right.sort(sortReadingOrder),
    ...fullMiddle,
    ...fullBottom,
  ];
  return ordered.map((block) => block.text).join('\n');
}
