import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLayout, orderBlocks, parseTesseractTsv } from '../lib/layout.js';

test('Tesseract TSV becomes line blocks with stable coordinates', () => {
  const tsv = [
    'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
    '5\t1\t1\t1\t1\t1\t20\t10\t40\t20\t96.0\tHello',
    '5\t1\t1\t1\t1\t2\t65\t10\t35\t20\t95.0\tworld',
    '5\t1\t1\t1\t2\t1\t20\t40\t60\t20\t94.0\tnext',
  ].join('\n');
  const blocks = parseTesseractTsv(tsv);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].text, 'Hello world');
  assert.equal(blocks[0].x, 20);
  assert.equal(blocks[0].width, 80);
});

test('same Tesseract line is split by word coordinates before ordering', () => {
  const tsv = [
    'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
    '5\t1\t1\t1\t1\t1\t20\t10\t100\t20\t96\tLEFT',
    '5\t1\t1\t1\t1\t2\t150\t10\t80\t20\t96\tONE',
    '5\t1\t1\t1\t1\t3\t520\t10\t100\t20\t96\tRIGHT',
    '5\t1\t1\t1\t1\t4\t650\t10\t80\t20\t96\tONE',
    '5\t1\t1\t1\t2\t1\t20\t60\t100\t20\t96\tLEFT',
    '5\t1\t1\t1\t2\t2\t150\t60\t80\t20\t96\tTWO',
    '5\t1\t1\t1\t2\t3\t520\t60\t100\t20\t96\tRIGHT',
    '5\t1\t1\t1\t2\t4\t650\t60\t80\t20\t96\tTWO',
    '5\t1\t1\t1\t3\t1\t20\t400\t600\t20\t96\tFOOTER',
  ].join('\n');
  const text = orderBlocks(parseTesseractTsv(tsv, { splitColumns: true }), 'two-column');
  assert.deepEqual(text.split('\n'), ['LEFT ONE', 'LEFT TWO', 'RIGHT ONE', 'RIGHT TWO', 'FOOTER']);
});

test('two-column ordering puts the left column before the right', () => {
  const text = orderBlocks([
    { text: 'R1', x: 520, y: 20, width: 180, height: 20 },
    { text: 'L1', x: 30, y: 20, width: 180, height: 20 },
    { text: 'R2', x: 520, y: 60, width: 180, height: 20 },
    { text: 'L2', x: 30, y: 60, width: 180, height: 20 },
  ], 'two-column');
  assert.deepEqual(text.split('\n'), ['L1', 'L2', 'R1', 'R2']);
});

test('auto detects a separated two-column page and single preserves y/x order', () => {
  const blocks = [
    { text: 'left top', x: 20, y: 10, width: 200, height: 20 },
    { text: 'right top', x: 500, y: 12, width: 200, height: 20 },
    { text: 'left bottom', x: 20, y: 50, width: 200, height: 20 },
    { text: 'right bottom', x: 500, y: 52, width: 200, height: 20 },
  ];
  assert.equal(orderBlocks(blocks, 'auto').split('\n')[0], 'left top');
  assert.equal(orderBlocks(blocks, 'single').split('\n')[0], 'left top');
});

test('layout names fail closed', () => {
  assert.equal(normalizeLayout('two-column'), 'two-column');
  assert.throws(() => normalizeLayout('columns'), /layout must be/);
});
