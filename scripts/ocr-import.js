#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, execFileSync } = require('child_process');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log(`
Usage:
  node scripts/ocr-import.js <imagePath> [--out <jsonPath>] [--id <문항ID>] [--category <카테고리>] [--difficulty <난이도>] [--psm <숫자,콤마분리>] [--scale <배율>]

Options:
  --out          출력 JSON 파일 (기본: templates/ocr-extract.json)
  --id           문제 ID
  --category     기본값: 토목기사
  --difficulty   easy|normal|hard (기본: normal)
  --psm          tesseract psm 목록 (예: 6,11,12)
  --scale        1~6 사이 정수, 해상도 강화 배율

Example:
  npm run ocr -- images/raw/14.jpg --id T014 --category 토목기사 --difficulty hard --psm 6,11
`);
  process.exit(1);
}

const opts = {
  category: '토목기사',
  difficulty: 'normal',
  psm: '6,11,12,3',
  scale: 2
};

let imagePath = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) {
    const key = a.replace(/^--/, '');
    if (['out', 'id', 'category', 'difficulty', 'psm', 'scale'].includes(key)) {
      if (i + 1 >= args.length) {
        throw new Error(`옵션 ${a} 값이 없습니다.`);
      }
      opts[key] = args[i + 1];
      i += 1;
    }
    continue;
  }
  if (!imagePath) imagePath = a;
}

if (!imagePath) throw new Error('이미지 경로가 필요합니다.');
if (!fs.existsSync(imagePath)) throw new Error(`이미지 파일이 없습니다: ${imagePath}`);

if (Number.parseInt(opts.scale, 10)) {
  const s = Number.parseInt(opts.scale, 10);
  if (s >= 1 && s <= 6) opts.scale = s; else opts.scale = 2;
}

function nowId() {
  const base = path.basename(imagePath).replace(/[^a-zA-Z0-9_-]+/g, '_');
  return `IMG_${base.replace(/\.[^.]+$/, '').slice(0, 18)}`;
}

function ensureFolder(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function maybeCopyImage() {
  const imagesDir = ensureFolder(path.join(process.cwd(), 'images'));
  const fileName = path.basename(imagePath);
  const target = path.join(imagesDir, fileName);
  if (!fs.existsSync(target)) fs.copyFileSync(imagePath, target);
  return `images/${fileName}`;
}

function hasCmd(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function tesseractAvailable() {
  return hasCmd('tesseract');
}

function run(cmd, cwd) {
  try {
    const out = execSync(cmd, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000,
      maxBuffer: 20 * 1024 * 1024
    });
    return { ok: true, out: out.toString() };
  } catch (e) {
    return {
      ok: false,
      out: (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '')
    };
  }
}

function tempPath(ext) {
  return path.join(
    os.tmpdir ? os.tmpdir() : '/tmp',
    `chomok-ocr-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`
  );
}

function buildPreprocessJobs(src) {
  const jobs = [];
  const workDir = ensureFolder(path.join(process.cwd(), '.ocr-temp'));
  const abs = path.resolve(src);
  jobs.push({ tag: 'orig', path: abs, transforms: ['원본'] });

  const scales = Array.from(new Set([1, opts.scale]));
  for (const s of scales) {
    const out = path.join(workDir, `${path.parse(abs).name}_s${s}_gray.png`);
    const cmd = `convert ${JSON.stringify(abs)} -colorspace Gray -resize ${s * 100}% -normalize ${JSON.stringify(out)}`;
    const resized = run(cmd).ok;
    if (resized) jobs.push({ tag: `gray_${s}x`, path: out, transforms: ['gray', `resize_${s}x`] });
  }

  for (const s of scales) {
    const out = path.join(workDir, `${path.parse(abs).name}_s${s}_thres.png`);
    const cmd = `convert ${JSON.stringify(abs)} -colorspace Gray -resize ${s * 100}% -normalize -contrast-stretch 0x20% -brightness-contrast 5x10 -threshold 70% ${JSON.stringify(out)}`;
    const ok = run(cmd).ok;
    if (ok) jobs.push({ tag: `thr_${s}x`, path: out, transforms: ['contrast', 'threshold', `resize_${s}x`] });
  }

  for (const s of scales) {
    const out = path.join(workDir, `${path.parse(abs).name}_s${s}_deskew.png`);
    const cmd = `convert ${JSON.stringify(abs)} -colorspace Gray -resize ${s * 100}% -deskew 40% ${JSON.stringify(out)}`;
    const ok = run(cmd).ok;
    if (ok) jobs.push({ tag: `deskew_${s}x`, path: out, transforms: ['deskew', `resize_${s}x`] });
  }

  return jobs.filter((j, idx, arr) => arr.findIndex(x => x.path === j.path) === idx);
}

function runTesseractOnImage(imgPath, psmList) {
  if (!tesseractAvailable()) return [];
  const results = [];
  for (const psm of psmList) {
    const cmd = `tesseract ${JSON.stringify(imgPath)} stdout --dpi 400 --oem 3 --psm ${psm} -l kor+eng`;
    const res = run(cmd);
    if (!res.ok) continue;
    if (!res.out.trim()) continue;
    results.push({
      image: path.basename(imgPath),
      psm,
      text: res.out.toString().trim(),
      engine: 'tesseract-cli',
      score: scoreText(res.out.toString())
    });
  }
  return results;
}

function scoreText(text) {
  const t = String(text || '');
  const len = t.length;
  const kor = (t.match(/[가-힣]/g) || []).length;
  const num = (t.match(/[0-9]/g) || []).length;
  const alpha = (t.match(/[A-Za-z]/g) || []).length;
  return len + kor * 1.8 + num * 0.3 + alpha * 0.2;
}

function pickBest(results) {
  if (!results.length) return null;
  results.sort((a, b) => b.score - a.score);
  return results[0];
}

function parseOcrText(raw) {
  const text = raw
    .replace(/\r/g, '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  let questionLines = [];
  let options = [];
  let answer = '';
  let explanationLines = [];

  const optionRegex = /^\(?[1-4가-하]|[①②③④]\)?[.\)]?\s*/;
  const answerLine = /^(?:정답|답|answer|ans)\s*[:：]?\s*(.*)$/i;
  const explanationLine = /^(?:해설|풀이|explanation|해설및풀이)\s*[:：]?(.*)$/;

  let mode = 'question';
  let ansFound = false;

  text.forEach((line) => {
    const mExp = line.match(explanationLine);
    const mAns = line.match(answerLine);

    if (mExp) {
      mode = 'explanation';
      if (mExp[1].trim()) explanationLines.push(mExp[1].trim());
      return;
    }
    if (mAns) {
      ansFound = true;
      answer = mAns[1].trim().replace(/[\]\[]/g, '').trim();
      mode = 'post-answer';
      return;
    }

    if (mode === 'explanation') {
      explanationLines.push(line);
      return;
    }

    if (optionRegex.test(line)) {
      mode = 'options';
      options.push(line.replace(optionRegex, '').trim());
      return;
    }

    if (mode === 'options') {
      if (optionRegex.test(line)) {
        options.push(line.replace(optionRegex, '').trim());
      } else if (line.length > 0) {
        if (options.length) options[options.length - 1] = `${options[options.length - 1]} ${line}`;
        else questionLines.push(line);
      }
      return;
    }

    if (mode === 'post-answer') {
      explanationLines.push(line);
      return;
    }

    questionLines.push(line);
  });

  if (!options.length && questionLines.length >= 6) {
    const tail = questionLines.slice(-6);
    const picked = tail.filter((l) => optionRegex.test(l));
    if (picked.length >= 2) {
      options = picked.map((l) => l.replace(optionRegex, '').trim());
      questionLines = questionLines.slice(0, questionLines.length - picked.length);
    }
  }

  const questionText = questionLines.join('\n').trim();
  const explanationText = explanationLines.join('\n').trim();

  return {
    question: questionText || '',
    options,
    answer: answer || '',
    explanation: explanationText || ''
  };
}

function toQuestionObject() {
  const id = opts.id || nowId();
  const category = opts.category || '토목기사';
  const difficulty = opts.difficulty || 'normal';

  const psmList = String(opts.psm).split(',').map((s) => Number.parseInt(s, 10)).filter((n) => !Number.isNaN(n));

  const media = maybeCopyImage();
  const jobs = buildPreprocessJobs(imagePath);
  const allResults = [];

  for (const job of jobs) {
    const candidates = runTesseractOnImage(job.path, psmList);
    for (const c of candidates) {
      allResults.push({
        ...c,
        transforms: job.transforms.join('/'),
        candidateType: job.tag
      });
    }
  }

  const best = pickBest(allResults);
  if (!best) {
    return {
      id,
      category,
      question: 'OCR 엔진 미설치. 이 문제 본문을 직접 입력해주세요.',
      media,
      type: 'multiple',
      options: ['선지1', '선지2', '선지3', '선지4'],
      answer: '',
      explanation: '해설을 직접 입력해주세요.',
      difficulty
    };
  }

  const parsed = parseOcrText(best.text);

  // 후보 중 정답 보정: 보기중 하나와 유사하면 정답 텍스트 그대로 사용
  return {
    id,
    category,
    question: parsed.question || `OCR 실패: ${id} 문제 본문 추출 실패`,
    media,
    type: parsed.options.length > 0 ? 'multiple' : 'short',
    options: parsed.options.length ? parsed.options : ['1', '2', '3', '4'],
    answer: parsed.answer || '',
    explanation: parsed.explanation || '해설을 확인해 주세요.',
    difficulty,
    _ocrMeta: {
      source: path.basename(imagePath),
      engine: best.engine,
      psm: best.psm,
      transform: best.transforms,
      candidate: best.candidateType,
      raw: best.text,
      score: best.score
    }
  };
}

(async () => {
  const outPath = path.resolve(opts.out || path.join(process.cwd(), 'templates', 'ocr-extract.json'));
  ensureFolder(path.dirname(outPath));

  const question = toQuestionObject();
  fs.writeFileSync(outPath, JSON.stringify({ questions: [question] }, null, 2), 'utf8');
  console.log(`OK: ${outPath}`);
  console.log(`- id: ${question.id}`);
  console.log(`- media: ${question.media}`);
  console.log(`- type: ${question.type}`);
  console.log(`- category: ${question.category}`);
  console.log(`- difficulty: ${question.difficulty}`);
  if (question._ocrMeta) {
    console.log(`- ocr engine: ${question._ocrMeta.engine}`);
    console.log(`- psm: ${question._ocrMeta.psm}`);
    console.log(`- transform: ${question._ocrMeta.transform}`);
    console.log(`- score: ${question._ocrMeta.score}`);
  }
  if (!question.answer && !question._ocrMeta.explanation) {
    console.log('주의: 정답이 추출되지 않았습니다. 수동 보정이 필요합니다.');
  }
})();
