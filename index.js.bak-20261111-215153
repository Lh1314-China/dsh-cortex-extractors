import { runExtractor } from './lib/extractor.js';

export const name = 'cortex-extractors';
export const inject = ['tools'];

let Schema = null;
try {
  const mod = await import('@deepseek-ai/schemastery');
  Schema = mod.default ?? mod;
} catch {
  Schema = null;
}

export const Config = Schema ? Schema.object({
  ocrProvider: Schema.string().default('windows-ocr').description('OCR 来源：windows-ocr（默认）、tesseract 或 command'),
  ocrLanguage: Schema.string().default('zh-Hans').description('Windows OCR 语言标签'),
  ocrPreprocess: Schema.boolean().default(true).description('Windows OCR 前先高分辨率上采样（失败回退原图）'),
  tesseractPath: Schema.string().default('').description('Tesseract 可执行文件；留空自动找常见安装路径'),
  tesseractLanguage: Schema.string().default('chi_sim+eng').description('Tesseract 语言，例如 chi_sim+eng'),
  tessdataPath: Schema.string().default('').description('用户 tessdata 目录；留空自动找 LOCALAPPDATA/cortex-extractors/tessdata'),
  asrProvider: Schema.string().default('command').description('ASR 来源：command 或 whisper-cpp'),
  whisperPath: Schema.string().default('').description('whisper.cpp CLI 路径；留空自动找 LOCALAPPDATA/cortex-extractors／PATH'),
  whisperModel: Schema.string().default('').description('whisper.cpp 模型路径（必须手动放置）'),
  whisperLanguage: Schema.string().default('zh').description('whisper 语言，例如 zh'),
  whisperPrompt: Schema.string().default('').description('whisper 初始提示词；可放人名/专有词'),
  asrReplacements: Schema.array(Schema.string()).default([]).description('ASR 后处理术语表，格式：错词=正确词'),
  tmpDir: Schema.string().default('').description('whisper 输出临时目录；留空用工作区 .cortex-extractors-tmp'),
  ocrCommand: Schema.string().default('').description('OCR 可执行文件；留空表示使用 ocrProvider'),
  ocrArgs: Schema.array(Schema.string()).default([]).description('OCR 参数模板，支持 {file} 与 {language}'),
  asrCommand: Schema.string().default('').description('转写可执行文件；留空表示不启用转写'),
  asrArgs: Schema.array(Schema.string()).default([]).description('转写参数模板，支持 {file} 与 {language}'),
  timeoutMs: Schema.natural().default(120000).description('单次提取超时毫秒'),
  maxChars: Schema.natural().default(20000).description('返回文本上限'),
}) : null;

const TEXT_OUTPUT = Object.freeze({
  schema: {
    type: 'object',
    additionalProperties: true,
    properties: {
      text: { type: 'string' },
      mode: { type: 'string' },
      uri: { type: 'string' },
      bytes: { type: 'number' },
      truncated: { type: 'boolean' },
      targetTraceId: { type: 'string' },
      extractedTraceId: { type: 'string' },
    },
    required: ['text'],
  },
  render: (_args, value) => [{ type: 'text', text: value?.text ?? '' }],
});

export function apply(ctx, config = {}) {
  return ctx.effect(() => {
    const disposers = [];
    if (typeof ctx.provide === 'function') {
      const disposeService = ctx.provide('cortexExtractor', {
        extract: (args) => runExtractor(args, config),
        config: () => ({ ocrProvider: config.ocrProvider ?? 'windows-ocr', asrProvider: config.asrProvider ?? 'command' }),
      });
      if (typeof disposeService === 'function') disposers.push(disposeService);
    }
    const disposeTool = ctx.tools.register({
    name: 'cortex_extract_text',
    description: 'Extract text from a local file:// input with an explicitly configured OCR/ASR command. Optionally ingest the text as a derived memory when traceId is provided. Never downloads a model.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        uri: { type: 'string', description: 'Local file:// URI' },
        mode: { type: 'string', enum: ['ocr', 'asr'], description: 'OCR for images, ASR for audio' },
        language: { type: 'string', description: 'Optional language hint passed as {language}' },
        traceId: { type: 'string', description: 'Optional target cortex trace; when set, the extracted text is stored as a derived memory' },
      },
      required: ['uri', 'mode'],
    },
    output: TEXT_OUTPUT,
    async execute(args) {
      const extracted = await runExtractor(args, config);
      const traceId = String(args?.traceId ?? '').trim();
      if (!traceId) return extracted;
      const cortex = ctx.get?.('cortex');
      if (!cortex || typeof cortex.ingestExtractedText !== 'function') {
        throw new Error('cortex service is unavailable; run without traceId or enable dsh-cortex');
      }
      const ingested = cortex.ingestExtractedText({
        targetTraceId: traceId,
        text: extracted.text,
        uri: args.uri,
        mode: args.mode,
        engine: config?.ocrProvider || config?.asrProvider || 'command',
      });
      return { ...extracted, targetTraceId: ingested.targetTraceId, extractedTraceId: ingested.extractedTraceId };
    },
  });
    if (typeof disposeTool === 'function') disposers.push(disposeTool);
    return () => { for (const dispose of disposers.reverse()) { try { dispose?.(); } catch { /* quiet */ } } };
  }, 'cortex-extractors');
}
