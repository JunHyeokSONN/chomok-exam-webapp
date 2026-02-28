#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage:
  node scripts/prepare-review.js [--in <ocrJson>] [--out <reviewJson>] [--batch-id <idPrefix>] [--status draft]

Options:
  --in      입력 OCR JSON (기본: templates/ocr-extract.json)
  --out     출력 리뷰 큐 JSON (기본: templates/review-queue.json)
  --batch-id 검수 배치 ID 접두사 (기본: REVIEW)
  --status  기본 상태 (기본: pending)
`);
  process.exit(args.length === 0 ? 1 : 0);
}

const opts = {
  in: path.join(process.cwd(), 'templates', 'ocr-extract.json'),
  out: path.join(process.cwd(), 'templates', 'review-queue.json'),
  batchPrefix: 'REVIEW',
  status: 'pending'
};

for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a.startsWith('--')) {
    const key = a.replace(/^--/, '');
    if (['in', 'out', 'batch-id', 'status'].includes(key)) {
      if (i + 1 >= args.length) {
        throw new Error(`옵션 ${a} 값이 없습니다.`);
      }
      const v = args[i + 1];
      if (key === 'batch-id') opts.batchPrefix = v;
      else opts[key] = v;
      i += 1;
    }
  }
}

function loadJSON(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

const batchId = `${opts.batchPrefix}-${new Date().toISOString().replace(/[T:.]/g, '-').slice(0, 19)}`;

const sourcePath = path.resolve(opts.in);
if (!fs.existsSync(sourcePath)) throw new Error(`입력 파일이 없습니다: ${sourcePath}`);
const source = loadJSON(sourcePath);
const questions = Array.isArray(source.questions) ? source.questions : [];

const queueItems = questions.map((q, idx) => ({
  queueId: `${batchId}-${String(idx + 1).padStart(3, '0')}`,
  sourceId: q.id || `ocr_${idx + 1}`,
  status: opts.status,
  reviewedBy: null,
  reviewedAt: null,
  sourcePath: path.resolve(opts.in),
  createdAt: new Date().toISOString(),
  question: {
    id: q.id,
    category: q.category || '토목기사',
    question: q.question || '',
    media: q.media || null,
    type: q.type || 'multiple',
    options: Array.isArray(q.options) ? q.options : ['1', '2', '3', '4'],
    answer: q.answer || '',
    explanation: q.explanation || '해설을 확인해 주세요.',
    difficulty: q.difficulty || 'normal'
  },
  ocr: {
    engine: q._ocrMeta?.engine || null,
    profile: q._ocrMeta?.profile || null,
    psm: q._ocrMeta?.psm || null,
    transform: q._ocrMeta?.transform || null,
    score: q._ocrMeta?.score ?? null,
    raw: q._ocrMeta?.raw || q._ocrMeta?.rawText || ''
  },
  reviewComment: ''
}));

const payload = {
  batchId,
  generatedAt: new Date().toISOString(),
  total: queueItems.length,
  items: queueItems
};

function ensureFolder(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {
      if (String(e.message || '').includes('/tmp')) {
        const fallback = path.join(process.cwd(), 'templates');
        if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
        return path.join(fallback, path.basename(filePath));
      }
      throw e;
    }
  }
  return filePath;
}

const outPath = path.resolve(opts.out);
const safeOut = ensureFolder(outPath);
fs.writeFileSync(safeOut, JSON.stringify(payload, null, 2), 'utf8');
console.log(`OK: ${safeOut}`);
console.log(`- batch: ${batchId}`);
console.log(`- total: ${payload.total}`);
console.log(`- status: ${opts.status}`);
