#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage:
  node scripts/apply-review.js --in <reviewQueue> [--data <dataJson>] [--out <dataJson>] [--ids <id1,id2,...>] [--include-pending]

Options:
  --in            리뷰 큐 JSON (기본: templates/review-queue.json)
  --data          대상 data.json (기본: data.json)
  --out           저장 경로 (기본: data.json)
  --ids           반영할 queueId 또는 sourceId(콤마분리)
  --include-pending 승인 전 상태도 포함
`);
  process.exit(args.length === 0 ? 1 : 0);
}

const opts = {
  in: path.join(process.cwd(), 'templates', 'review-queue.json'),
  data: path.join(process.cwd(), 'data.json'),
  out: path.join(process.cwd(), 'data.json')
};

for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a.startsWith('--')) {
    const key = a.replace(/^--/, '');
    if (['in', 'data', 'out', 'ids', 'include-pending'].includes(key)) {
      if (key === 'include-pending') {
        opts.includePending = true;
        continue;
      }
      if (i + 1 >= args.length) throw new Error(`옵션 ${a} 값이 없습니다.`);
      opts[key] = args[i + 1];
      i += 1;
    }
  }
}

const includedIds = new Set(
  typeof opts.ids === 'string'
    ? opts.ids.split(',').map((s) => s.trim()).filter(Boolean)
    : []
);

function loadJSON(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

const review = loadJSON(path.resolve(opts.in));
const reviewItems = Array.isArray(review.items) ? review.items : [];
const current = loadJSON(path.resolve(opts.data));
const currentQuestions = Array.isArray(current.questions) ? current.questions : [];

const approved = reviewItems.filter((item) => {
  if (includedIds.size > 0) {
    return includedIds.has(item.queueId) || includedIds.has(item.sourceId);
  }
  if (opts.includePending) return true;
  return item.status === 'approved';
});

if (!approved.length) {
  console.log('No items to apply.');
  process.exit(0);
}

const existingIds = new Set(currentQuestions.map((q) => q.id));

function nextId(base) {
  let n = 1;
  let candidate;
  do {
    candidate = `${base}_${n}`;
    n += 1;
  } while (existingIds.has(candidate));
  return candidate;
}

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

const merged = [...currentQuestions];
for (const item of approved) {
  let q = item.question || {};
  let id = q.id && String(q.id).trim();
  if (!id || existingIds.has(id)) {
    id = nextId(id || 'AUTO');
  }
  existingIds.add(id);

  merged.push({
    id,
    category: q.category || '토목기사',
    question: q.question || '',
    media: q.media || '',
    type: q.type || 'multiple',
    options: Array.isArray(q.options) ? q.options : ['1', '2', '3', '4'],
    answer: q.answer || '',
    explanation: q.explanation || '해설을 확인해 주세요.',
    difficulty: q.difficulty || 'normal'
  });
}

const outPath = path.resolve(opts.out);
const safeOut = ensureFolder(outPath);
fs.writeFileSync(safeOut, JSON.stringify({ questions: merged }, null, 2), 'utf8');
console.log(`OK: ${safeOut}`);
console.log(`- applied: ${approved.length}`);
console.log(`- total: ${merged.length}`);
