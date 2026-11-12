import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { normalizeLayout, orderBlocks, orderWordBlocks, parseTesseractTsv } from './layout.js';

const execFileAsync = promisify(execFile);
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const WINDOWS_OCR_SCRIPT = fileURLToPath(new URL('./windows-ocr.ps1', import.meta.url));
const PADDLE_BRIDGE = fileURLToPath(new URL('./paddleocr_bridge.py', import.meta.url));
const WINDOWS_POWERSHELL = process.env.SystemRoot
  ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
  : 'powershell.exe';

function findTesseract(config) {
  const explicit = String(config?.tesseractPath ?? '').trim();
  if (explicit) return explicit;
  const candidates = [
    'C:/Program Files/Tesseract-OCR/tesseract.exe',
    'C:/Program Files (x86)/Tesseract-OCR/tesseract.exe',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs/Tesseract-OCR/tesseract.exe') : null,
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? 'tesseract';
}

function normalizeMode(mode) {
  if (mode !== 'ocr' && mode !== 'asr') throw new Error('mode must be ocr or asr');
  return mode;
}

function pickCommand(mode, config) {
  return mode === 'ocr'
    ? { command: String(config?.ocrCommand ?? '').trim(), args: config?.ocrArgs ?? [] }
    : { command: String(config?.asrCommand ?? '').trim(), args: config?.asrArgs ?? [] };
}

async function runProcess(command, args, config, extra = {}) {
  const timeout = Math.max(1000, Math.min(900000, Number(config?.timeoutMs) || 120000));
  const maxBuffer = 8 * 1024 * 1024;
  try {
    const { stdout } = await execFileAsync(command, args, { timeout, maxBuffer, windowsHide: true, encoding: 'utf8', ...extra });
    return stdout;
  } catch (error) {
    const message = error?.killed ? `extractor timed out after ${timeout}ms` : String(error?.message ?? error);
    throw new Error(message);
  }
}

function resolveTessdata(config) {
  const explicit = String(config?.tessdataPath ?? '').trim();
  if (explicit) return explicit;
  const fallback = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'cortex-extractors', 'tessdata') : '';
  return fallback && fs.existsSync(fallback) ? fallback : '';
}

function findTsvConfig(command, config) {
  const candidates = [];
  const explicitData = String(config?.tessdataPath ?? '').trim();
  if (explicitData) candidates.push(path.join(explicitData, 'configs', 'tsv'));
  if (command && fs.existsSync(command)) candidates.push(path.join(path.dirname(command), 'tessdata', 'configs', 'tsv'));
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? 'tsv';
}

async function runTesseract(file, config, layout) {
  const command = findTesseract(config);
  const language = String(config?.tesseractLanguage || 'chi_sim+eng');
  const tessdata = resolveTessdata(config);
  const env = tessdata ? { ...process.env, TESSDATA_PREFIX: tessdata } : undefined;
  // TSV keeps coordinates so a two-column page can be ordered by column
  // instead of by raw y/x. Plain text is enough for single/handwriting.
  if (layout === 'two-column' || layout === 'auto') {
    const tsv = await runProcess(
      command,
      [file, 'stdout', '-l', language, '--psm', '3', findTsvConfig(command, config)],
      config,
      env ? { env } : {},
    );
    const ordered = orderBlocks(parseTesseractTsv(tsv, { splitColumns: true }), layout);
    if (ordered.trim()) return ordered;
  }
  return runProcess(
    command,
    [file, 'stdout', '-l', language, '--psm', layout === 'handwriting' ? '6' : '3'],
    config,
    env ? { env } : {},
  );
}

async function runPaddleOcr(file, language, layout, config) {
  const python = String(config?.paddleocrPython || 'python').trim();
  const modelDir = String(config?.paddleocrModelDir || '').trim();
  if (!modelDir) {
    throw new Error('PaddleOCR 需要本地模型目录（paddleocrModelDir）；不会自动下载模型。');
  }
  let stdout;
  try {
    stdout = await runProcess(python, [
      PADDLE_BRIDGE,
      '--file', file,
      '--language', String(language || config?.ocrLanguage || 'ch').replace(/^zh.*$/i, 'ch'),
      '--layout', layout,
      '--model-dir', modelDir,
    ], config);
  } catch (error) {
    const message = String(error?.message ?? error);
    if (/returned no text blocks/i.test(message)) {
      throw new Error('PaddleOCR 没有识别到文字：请换一张更清晰、对比度更高的图片，或改用 Windows OCR / Tesseract。');
    }
    if (/paddleocr is not installed/i.test(message)) {
      throw new Error('PaddleOCR 未安装：请先安装 paddleocr 和 paddlepaddle，或改用 Windows OCR / Tesseract。');
    }
    if (/model.*folders|model-dir/i.test(message)) {
      throw new Error('PaddleOCR 模型目录无效：请配置包含检测/识别模型文件夹的本地目录。');
    }
    throw new Error(`PaddleOCR 调用失败：${message.split('\n').slice(-2).join(' ')}`);
  }
  let payload;
  try {
    payload = JSON.parse(String(stdout ?? '').trim());
  } catch {
    throw new Error('paddleocr bridge returned invalid JSON');
  }
  const text = orderBlocks(payload.blocks, layout);
  if (!text.trim()) throw new Error('PaddleOCR 没有识别到文字：请换一张更清晰的图片。');
  return { text, engine: 'paddleocr-handwriting' };
}

function findWhisper(config) {
  const explicit = String(config?.whisperPath ?? '').trim();
  if (explicit) return explicit;
  const local = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'cortex-extractors') : '';
  const candidates = [
    local ? path.join(local, 'whisper', 'whisper-cli.exe') : null,
    local ? path.join(local, 'whisper', 'Release', 'whisper-cli.exe') : null,
    local ? path.join(local, 'bin', 'whisper-cli.exe') : null,
    path.join(process.cwd(), 'tools', 'whisper.cpp', 'Release', 'whisper-cli.exe'),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? 'whisper-cli';
}

function findWhisperModel(config) {
  const explicit = String(config?.whisperModel ?? '').trim();
  if (explicit) return fs.existsSync(explicit) ? explicit : '';
  const local = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'cortex-extractors') : '';
  const candidates = [
    local ? path.join(local, 'models', 'ggml-small.bin') : null,
    path.join(process.cwd(), 'tools', 'whisper.cpp', 'models', 'ggml-small.bin'),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? '';
}

async function runWhisper(file, config) {
  const command = findWhisper(config);
  const model = findWhisperModel(config);
  if (!model) throw new Error('whisperModel is required for the whisper-cpp ASR provider');
  const language = String(config?.whisperLanguage || 'zh');
  const tempDir = String(config?.tmpDir || path.join(process.cwd(), '.cortex-extractors-tmp'));
  fs.mkdirSync(tempDir, { recursive: true });
  const prefix = path.join(tempDir, `cortex-whisper-${randomUUID()}`);
  const output = `${prefix}.txt`;
  const prompt = String(config?.whisperPrompt ?? '').trim();
  const replacements = Array.isArray(config?.asrReplacements) ? config.asrReplacements : [];
  try {
    await runProcess(command, [
      '-m', model,
      '-f', file,
      '-l', language,
      ...(prompt ? ['--prompt', prompt] : []),
      '-otxt', '-of', prefix,
    ], config);
    let text = fs.readFileSync(output, 'utf8');
    for (const pair of replacements) {
      const [from, ...rest] = String(pair).split('=');
      const to = rest.join('=');
      if (from && to) text = text.split(from).join(to);
    }
    return text;
  } finally {
    try { fs.rmSync(output, { force: true }); } catch { /* best-effort cleanup */ }
  }
}

async function runWindowsOcr(file, language, layout, config) {
  if (process.platform !== 'win32') throw new Error('Windows OCR is only available on Windows');
  const lang = String(language || config?.ocrLanguage || 'zh-Hans');
  const stdout = await runProcess(WINDOWS_POWERSHELL, [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    WINDOWS_OCR_SCRIPT,
    '-Path',
    file,
    '-Language',
    lang,
    '-Layout',
    layout,
    '-AsJson',
    ...(config?.ocrPreprocess === false ? [] : ['-Preprocess']),
  ], config);
  try {
    const payload = JSON.parse(String(stdout ?? '').trim());
    const ordered = orderWordBlocks(payload.words, layout);
    if (ordered.trim()) return ordered;
  } catch {
    /* fall through to raw text for older/failed JSON output */
  }
  return String(stdout ?? '').trim();
}

export async function runExtractor({ uri, mode, language, layout }, config = {}) {
  const selectedMode = normalizeMode(mode);
  const selectedLayout = normalizeLayout(layout ?? config?.ocrLayout ?? 'auto');
  const { command, args } = pickCommand(selectedMode, config);
  const provider = String(config?.ocrProvider ?? 'windows-ocr');
  const useWindowsOcr = selectedMode === 'ocr' && !command && provider === 'windows-ocr';
  const useTesseract = selectedMode === 'ocr' && !command && provider === 'tesseract';
  const usePaddleOcr = selectedMode === 'ocr' && !command && provider === 'paddleocr';
  const useWhisper = selectedMode === 'asr' && !command && String(config?.asrProvider ?? 'command') === 'whisper-cpp';
  if (!command && !useWindowsOcr && !useTesseract && !usePaddleOcr && !useWhisper) {
    throw new Error(`${selectedMode} is not configured; set ${selectedMode}Command explicitly (no model is downloaded)`);
  }
  const text = String(uri ?? '').trim();
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error('uri must be a file:// URL');
  }
  if (url.protocol !== 'file:') throw new Error('only file:// inputs are supported');
  const file = fileURLToPath(url);
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error('input is not a regular file');
  if (stat.size > MAX_FILE_BYTES) throw new Error(`input is larger than ${MAX_FILE_BYTES} bytes`);

  const template = Array.isArray(args) ? args.map(String) : [];
  const rendered = template.map((item) => item
    .replaceAll('{file}', file)
    .replaceAll('{language}', language ? String(language) : ''));
  const paddle = usePaddleOcr ? await runPaddleOcr(file, language, selectedLayout, config) : null;
  const stdout = paddle
    ? paddle.text
    : useWindowsOcr
      ? await runWindowsOcr(file, language, selectedLayout, config)
      : useTesseract
        ? await runTesseract(file, config, selectedLayout)
        : useWhisper
          ? await runWhisper(file, config)
          : await runProcess(command, rendered, config);
  const limit = Math.max(1, Math.min(200000, Number(config?.maxChars) || 20000));
  const output = String(stdout ?? '').trim();
  if (!output) throw new Error('extractor returned no text');
  return {
    text: output.slice(0, limit),
    mode: selectedMode,
    layout: selectedLayout,
    uri: text,
    bytes: stat.size,
    truncated: output.length > limit,
    engine: paddle ? paddle.engine : useWindowsOcr ? 'windows-ocr' : useTesseract ? 'tesseract' : useWhisper ? 'whisper-cpp' : 'command',
  };
}
