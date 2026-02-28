#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage:
  node scripts/ocr-import.js <imagePath> [--out <jsonPath>] [--id <문항ID>] [--category <카테고리>] [--difficulty <난이도>] [--psm <숫자,콤마분리>] [--scale <배율>] [--profile <fast|precision|custom>]

Options:
  --out          출력 JSON 파일 (기본: templates/ocr-extract.json)
  --id           문제 ID
  --category     기본값: 토목기사
  --difficulty   easy|normal|hard (기본: normal)
  --psm          tesseract psm 목록 (예: 6,11,12)
  --scale        1~6 사이 정수, 해상도 강화 배율
  --profile      fast|precision|custom (기본: precision)

Example:
  npm run ocr -- images/raw/14.jpg --id T014 --category 토목기사 --difficulty hard --profile precision
`);
  process.exit(args.length === 0 ? 1 : 0);
}

const PROFILE = {
  fast: {
    psm: '6,11',
    scale: 2,
    variants: ['orig', 'gray', 'deskew'],
    dpi: 300
  },
  precision: {
    psm: '11,12,6,3',
    scale: 4,
    variants: ['orig', 'gray', 'thres', 'deskew', 'sharpen'],
    dpi: 500
  }
};

const opts = {
  category: '토목기사',
  difficulty: 'normal',
  psm: '11,12,6,3',
  scale: 4,
  profile: 'precision'
};

let imageArg = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) {
    const key = a.replace(/^--/, '');
    if (['out', 'id', 'category', 'difficulty', 'psm', 'scale', 'profile'].includes(key)) {
      if (i + 1 >= args.length) {
        abort(`옵션 ${a} 값이 없습니다.`);
      }
      opts[key] = args[i + 1];
      i += 1;
    }
    continue;
  }
  if (!imageArg) imageArg = a;
}

const imagePath = resolveImagePath(imageArg);

function abort(message) {
  console.log(`Error: ${message}`);
  process.exit(1);
}

normalizeOptions();

function resolveImagePath(raw) {
  if (!raw) {
    abort('이미지 경로가 필요합니다.');
  }

  const candidates = new Set();

  // 일부 로그에서 별표 마스킹/패턴이 섞인 입력이 들어오는 경우도 대응
  const normalizedRaw = String(raw).trim().replace(/\*{2,}/g, '*');

  const cwd = process.cwd();
  const home = process.env.HOME || '';

  // 1) 그대로 입력값 자체
  candidates.add(normalizedRaw);

  // 2) 경로 보정
  candidates.add(path.normalize(normalizedRaw));
  candidates.add(path.resolve(cwd, normalizedRaw));
  candidates.add(path.join(home, '.openclaw', normalizedRaw));
  candidates.add(path.join(home, '.openclaw', 'media', normalizedRaw));
  candidates.add(path.join(home, '.openclaw', 'media', 'inbound', normalizedRaw));

  // 3) 절대 경로가 아니고 파일명만 들어온 경우: 자주 쓰는 위치로 보정
  const fileName = path.basename(normalizedRaw);
  candidates.add(path.join(cwd, 'media', fileName));
  candidates.add(path.join(home, '.openclaw', 'media', 'inbound', fileName));
  candidates.add(path.join(cwd, '..', 'media', 'inbound', fileName));

  // 4) wildcard 처리(
  //   예: ".../media/inbound/abc*.png"
  if (/[\*\?\[]/.test(normalizedRaw)) {
    const m = normalizedRaw.split('/').slice(0, -1);
    const pattern = normalizedRaw.includes('/') ? normalizedRaw.split('/').at(-1) : normalizedRaw;
    const dir = m.length ? path.resolve(m.join('/')) : cwd;
    if (fs.existsSync(dir)) {
      const list = fs.readdirSync(dir);
      const regex = globToRegExp(pattern);
      const found = list.filter((f) => regex.test(f));
      for (const f of found) candidates.add(path.join(dir, f));
    }
  }

  for (const c of candidates) {
    const p = String(c);
    if (!p) continue;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      return path.resolve(p);
    }
  }

  // 마지막 대체: 후보 폴더에서 파일명 유사도 기반 1차 추천
  const fallbackDirs = [
    path.join(home, '.openclaw', 'media', 'inbound'),
    path.join(home, '.openclaw', 'media'),
    path.join(cwd, 'media'),
    path.join(cwd, '..', 'media', 'inbound')
  ];
  const similar = [];
  for (const d of fallbackDirs) {
    if (fs.existsSync(d) && fs.statSync(d).isDirectory()) {
      const list = fs.readdirSync(d).filter((f) => /\.(png|jpg|jpeg|bmp|webp|heic|gif)$/i.test(f));
      for (const f of list) {
        if (f.includes(fileName) || fileName.includes(path.parse(f).name)) {
          similar.push(path.join(d, f));
          if (similar.length >= 5) break;
        }
      }
    }
    if (similar.length) break;
  }

  const tips = similar.length
    ? `\n  후보 경로: ${similar.slice(0, 5).join('\n            ')}`
    : '';

  abort(`이미지 파일을 찾을 수 없습니다: ${normalizedRaw}${tips}`);
}

function globToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

function normalizeOptions() {
  const profile = PROFILE[opts.profile] || PROFILE.precision;
  if (opts.profile !== 'custom') {
    if (profile.psm) opts.psm = profile.psm;
    if (profile.scale) opts.scale = profile.scale;
  }
  const s = Number.parseInt(opts.scale, 10);
  if (!Number.isInteger(s) || s < 1 || s > 6) opts.scale = profile.scale;
}

const runtime = {
  profile: opts.profile,
  variants: (PROFILE[opts.profile]?.variants || PROFILE.precision.variants),
  dpi: PROFILE[opts.profile]?.dpi || 400
};

function nowId() {
  const base = path.basename(imagePath).replace(/[^a-zA-Z0-9_-]+/g, '_');
  return `IMG_${base.replace(/\.[^.]+$/, '').slice(0, 18)}`;
}

function ensureFolder(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch (e) {
    if (String(e.message || '').includes('/tmp')) {
      const fallback = path.join(process.cwd(), 'templates');
      if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
      return fallback;
    }
    throw e;
  }
}

function maybeCopyImage() {
  const imagesDir = ensureFolder(path.join(process.cwd(), 'images'));
  const fileName = path.basename(imagePath);
  const target = path.join(imagesDir, fileName);
  if (!fs.existsSync(target)) {
    try {
      fs.copyFileSync(imagePath, target);
    } catch (e) {
      // fallback: write in current directory if images directory 권한 문제가 나도 스킵
      console.log(`⚠️ 이미지 복사 실패(${e.message}); 원본 경로를 그대로 사용합니다.`);
      return path.relative(process.cwd(), imagePath);
    }
  }
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
      maxBuffer: 25 * 1024 * 1024
    });
    return { ok: true, out: out.toString() };
  } catch (e) {
    return {
      ok: false,
      out: (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '')
    };
  }
}

function buildPreprocessJobs(src) {
  const jobs = [];
  const workDir = ensureFolder(path.join(process.cwd(), '.ocr-temp'));
  const abs = path.resolve(src);
  const scales = Array.from(new Set([1, opts.scale]));
  const base = path.parse(abs).name;

  jobs.push({ tag: 'orig', path: abs, transforms: ['원본'] });

  for (const s of scales) {
    if (runtime.variants.includes('gray') || runtime.variants.includes('thres') || runtime.variants.includes('deskew') || runtime.variants.includes('sharpen')) {
      const out = path.join(workDir, `${base}_s${s}_gray.png`);
      const cmd = `convert ${JSON.stringify(abs)} -colorspace Gray -resize ${s * 100}% -normalize ${JSON.stringify(out)}`;
      if (run(cmd).ok) jobs.push({ tag: `gray_${s}x`, path: out, transforms: ['gray', `resize_${s}x`] });
    }
  }

  for (const s of scales) {
    if (!runtime.variants.includes('thres')) continue;
    const out = path.join(workDir, `${base}_s${s}_thres.png`);
    const cmd = `convert ${JSON.stringify(abs)} -colorspace Gray -resize ${s * 100}% -normalize -contrast-stretch 0x20% -brightness-contrast 5x10 -threshold 70% ${JSON.stringify(out)}`;
    if (run(cmd).ok) jobs.push({ tag: `thres_${s}x`, path: out, transforms: ['thres', `resize_${s}x`] });
  }

  for (const s of scales) {
    if (!runtime.variants.includes('deskew')) continue;
    const out = path.join(workDir, `${base}_s${s}_deskew.png`);
    const cmd = `convert ${JSON.stringify(abs)} -colorspace Gray -resize ${s * 100}% -deskew 40% ${JSON.stringify(out)}`;
    if (run(cmd).ok) jobs.push({ tag: `deskew_${s}x`, path: out, transforms: ['deskew', `resize_${s}x`] });
  }

  for (const s of scales) {
    if (!runtime.variants.includes('sharpen')) continue;
    const out = path.join(workDir, `${base}_s${s}_sharpen.png`);
    const cmd = `convert ${JSON.stringify(abs)} -colorspace Gray -resize ${s * 100}% -sharpen 0x1 -contrast-stretch 0x15% ${JSON.stringify(out)}`;
    if (run(cmd).ok) jobs.push({ tag: `sharpen_${s}x`, path: out, transforms: ['sharpen', `resize_${s}x`] });
  }

  for (const s of scales) {
    if (!runtime.variants.includes('adaptive')) continue;
    const out = path.join(workDir, `${base}_s${s}_adaptive.png`);
    const cmd = `convert ${JSON.stringify(abs)} -colorspace Gray -resize ${s * 100}% -normalize -sigmoidal-contrast 6x50% -adaptive-sharpen 1x1 ${JSON.stringify(out)}`;
    if (run(cmd).ok) jobs.push({ tag: `adaptive_${s}x`, path: out, transforms: ['adaptive', `resize_${s}x`] });
  }

  // dedup
  const uniq = [];
  for (const j of jobs) {
    if (!uniq.find((x) => x.path === j.path)) uniq.push(j);
  }
  return uniq;
}

function runTesseractOnImage(imgPath, psmList) {
  if (!tesseractAvailable()) return [];
  const results = [];
  for (const psm of psmList) {
    const cmd = `tesseract ${JSON.stringify(imgPath)} stdout --dpi ${runtime.dpi} --oem 3 --psm ${psm} -l kor+eng`;
    const res = run(cmd);
    if (!res.ok) continue;
    const text = res.out.toString().trim();
    if (!text) continue;
    results.push({
      image: path.basename(imgPath),
      psm,
      text,
      engine: 'tesseract-cli',
      score: scoreText(text)
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
  const punct = (t.match(/[?.!()]/g) || []).length;
  return len + kor * 1.8 + num * 0.3 + alpha * 0.2 + punct * 0.1;
}

function pickBest(results) {
  if (!results.length) return null;
  return [...results].sort((a, b) => b.score - a.score)[0];
}

function parseOcrText(raw) {
  const text = raw.replace(/\r/g, '').split('\n').map((s) => s.trim()).filter(Boolean);
  let questionLines = [];
  let options = [];
  let answer = '';
  let explanationLines = [];

  const optionRegex = /^\(?[1-4가-하]|[①②③④]\)?[\.]?\s*/;
  const answerLine = /^(?:정답|답|answer|ans)\s*[:：]?\s*(.*)$/i;
  const explanationLine = /^(?:해설|풀이|explanation|해설및풀이)\s*[:：]?(.*)$/;

  let mode = 'question';
  text.forEach((line) => {
    const mExp = line.match(explanationLine);
    const mAns = line.match(answerLine);
    if (mExp) {
      mode = 'explanation';
      if (mExp[1].trim()) explanationLines.push(mExp[1].trim());
      return;
    }
    if (mAns) {
      mode = 'post-answer';
      answer = mAns[1].trim().replace(/[\[\]]/g, '').trim();
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
      if (optionRegex.test(line)) options.push(line.replace(optionRegex, '').trim());
      else if (line) options[options.length - 1] = `${options[options.length - 1]} ${line}`;
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

  return {
    question: questionLines.join('\n').trim(),
    options,
    answer,
    explanation: explanationLines.join('\n').trim()
  };
}

function toQuestionObject() {
  const id = opts.id || nowId();
  const category = opts.category || '토목기사';
  const difficulty = opts.difficulty || 'normal';

  const media = maybeCopyImage();
  const psmList = String(opts.psm).split(',').map((s) => Number.parseInt(s, 10)).filter((n) => !Number.isNaN(n));

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

  const topCandidates = [...allResults].sort((a, b) => b.score - a.score).slice(0, 8).map(({ image, psm, score, candidateType, transforms }) => ({
    image,
    psm,
    candidateType,
    transforms,
    score
  }));

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
      score: best.score,
      profile: opts.profile,
      tried: topCandidates,
      allCount: allResults.length
    }
  };
}

(async () => {
  const outPath = path.resolve(opts.out || path.join(process.cwd(), 'templates', 'ocr-extract.json'));
  const safeOutDir = ensureFolder(path.dirname(outPath));

  const question = toQuestionObject();
  const finalOut = path.isAbsolute(outPath) ? path.join(safeOutDir, path.basename(outPath)) : outPath;
  fs.writeFileSync(finalOut, JSON.stringify({ questions: [question] }, null, 2), 'utf8');
  console.log(`OK: ${finalOut}`);
  console.log(`- id: ${question.id}`);
  console.log(`- media: ${question.media}`);
  console.log(`- type: ${question.type}`);
  console.log(`- category: ${question.category}`);
  console.log(`- difficulty: ${question.difficulty}`);
  if (question._ocrMeta) {
    console.log(`- ocr engine: ${question._ocrMeta.engine}`);
    console.log(`- profile: ${question._ocrMeta.profile}`);
    console.log(`- psm: ${question._ocrMeta.psm}`);
    console.log(`- transform: ${question._ocrMeta.transform}`);
    console.log(`- score: ${question._ocrMeta.score}`);
    if (question._ocrMeta.tried?.length) {
      console.log('- best candidates:');
      for (const c of question._ocrMeta.tried) {
        console.log(`  - psm ${c.psm}, ${c.candidateType}, score=${c.score}`);
      }
    }
  }
  if (!question.answer) {
    console.log('주의: 정답이 추출되지 않았습니다. 수동 보정이 필요합니다.');
  }
})();
