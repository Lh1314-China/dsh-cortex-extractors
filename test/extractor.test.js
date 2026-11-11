import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { runExtractor } from '../lib/extractor.js';

const fakeEngine = fileURLToPath(new URL('./fake-engine.mjs', import.meta.url));
const command = process.execPath;

test('runs an explicitly configured OCR command and returns text', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cortex-extractors-'));
  const file = path.join(dir, 'frame.png');
  writeFileSync(file, 'fake image');
  try {
    const result = await runExtractor({ uri: pathToFileURL(file).href, mode: 'ocr', language: 'chi_sim' }, {
      ocrCommand: command,
      ocrArgs: [fakeEngine, '{file}', '--lang', '{language}'],
      maxChars: 100,
    });
    assert.equal(result.mode, 'ocr');
    assert.equal(result.text, `FAKE ${file}|--lang|chi_sim`);
    assert.equal(result.truncated, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fails closed when command OCR is selected but not configured', async () => {
  await assert.rejects(
    () => runExtractor({ uri: 'file:///C:/x.png', mode: 'ocr' }, { ocrProvider: 'command' }),
    /not configured/,
  );
});

test('whisper provider fails closed without a model', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cortex-whisper-'));
  const file = path.join(dir, 'voice.wav');
  writeFileSync(file, 'fake audio');
  try {
    await assert.rejects(
      () => runExtractor({ uri: pathToFileURL(file).href, mode: 'asr' }, { asrProvider: 'whisper-cpp' }),
      /whisperModel/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects non-file inputs', async () => {
  await assert.rejects(
    () => runExtractor({ uri: 'https://example.test/x.png', mode: 'ocr' }, { ocrCommand: command }),
    /only file/,
  );
});
