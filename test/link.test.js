import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { apply } from '../index.js';

const fakeEngine = fileURLToPath(new URL('./fake-engine.mjs', import.meta.url));

test('extractor can ingest text into an explicit cortex trace', async () => {
  let definition = null;
  let ingested = null;
  const ctx = {
    tools: { register: (tool) => { definition = tool; return () => {}; } },
    effect: (fn) => fn(),
    get: (name) => name === 'cortex'
      ? { ingestExtractedText: (input) => { ingested = input; return { targetTraceId: input.targetTraceId, extractedTraceId: 'trc_derived' }; } }
      : null,
  };
  apply(ctx, { ocrProvider: 'command', ocrCommand: process.execPath, ocrArgs: [fakeEngine, '{file}'] });
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cortex-extractor-link-'));
  const file = path.join(dir, 'frame.png');
  writeFileSync(file, 'fake image');
  try {
    const result = await definition.execute({ uri: pathToFileURL(file).href, mode: 'ocr', traceId: 'trc_target' });
    assert.equal(result.text, `FAKE ${file}`);
    assert.equal(result.targetTraceId, 'trc_target');
    assert.equal(ingested.targetTraceId, 'trc_target');
    assert.equal(ingested.mode, 'ocr');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
