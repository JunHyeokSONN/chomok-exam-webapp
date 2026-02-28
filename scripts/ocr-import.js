#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log(`
Usage:
  node scripts/ocr-import.js <imagePath> [--out <jsonPath>] [--id <문항ID>] [--category <카테고리>] [--difficulty <난이도>]

Options:
  --out          출력 JSON 파일 (기본: images/ocr-outputs/<basename>.json)
  --id           문제 ID (기본: IMG_접두어+번호)
  --category     default: 토목기사
  --difficulty   easy|normal|hard (default: normal)

Example:
  npm run ocr -- images/raw/14.jpg --id T014 --category 토목기사 --difficulty hard
`);
  process.exit(1);
}

const opts = {
  category: '토목기사',
  difficulty: 'normal'
};

let imagePath = null;
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a.startsWith('--')) {
    const key = a.replace(/^--/, '');
    if (['out', 'id', 'category', 'difficulty'].includes(key)) {
      if (i + 1 >= args.length) throw new Error(`옵션 ${a} 값이 없습니다.`);
      opts[key] = args[i + 1];
      i += 1;
    }
  } else if (!imagePath) {
    imagePath = a;
  }
}

if (!imagePath) throw new Error('이미지 경로가 필요합니다.');
if (!fs.existsSync(imagePath)) throw new Error(`이미지 파일이 없습니다: ${imagePath}`);

function nowId() {
  const base = path.basename(imagePath).replace(/[^a-zA-Z0-9_-]+/g, '_');
  return `IMG_${base.replace(/\.[^.]+$/, '')}`.slice(0, 24);
}

function ensureImagesFolder() {
  const out = path.join(process.cwd(), 'images');
  if (!fs.existsSync(out)) fs.mkdirSync(out, { recursive: true });
  return out;
}

function maybeCopyImage() {
  const abs = path.resolve(process.cwd(), imagePath);
  const imagesDir = ensureImagesFolder();
  const target = path.join(imagesDir, path.basename(imagePath));
  if (abs !== path.resolve(target)) {
    if (!fs.existsSync(target)) {
      fs.copyFileSync(abs, target);
    }
  }
  return `images/${path.basename(target)}`;
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

  const optionRegex = /^(?:[1-4]\)|[1-4]\.|[가-하]\)|[\(]?[가-하][\)]|[①②③④])\s*/;
  const ansRegex = /^(?:정답|답|answer|ans)\s*[:：]?\s*(.*)$/i;
  const expRegex = /^(?:해설|풀이|explanation|해설및풀이)\s*[:：]?(.*)$/;

  let mode = 'question';
  let ansFound = false;
  text.forEach((line) => {
    const mExp = line.match(expRegex);
    const mAns = line.match(ansRegex);

    if (mExp) {
      mode = 'explanation';
      if (mExp[1]) explanationLines.push(mExp[1].trim());
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

    if (ansFound && !line) return;

    if (optionRegex.test(line)) {
      mode = 'options';
      options.push(line.replace(optionRegex, '').trim());
      return;
    }

    if (mode === 'options') {
      if (optionRegex.test(line)) {
        options.push(line.replace(optionRegex, '').trim());
      } else if (line.length > 0) {
        // 보기는 여러 줄로 인식된 경우 붙임
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

  if (!options.length) {
    if (questionLines.length > 1) {
      // 흔한 케이스: 보기와 본문이 한 덩어리로 들어온 경우 마지막 4줄을 보기로 추정
      const tail = questionLines.slice(-4);
      const maybeOptions = tail.filter((l) => optionRegex.test(l));
      if (maybeOptions.length >= 2) {
        options = maybeOptions.map((l) => l.replace(optionRegex, '').trim());
        questionLines = questionLines.slice(0, questionLines.length - maybeOptions.length);
      }
    }
  }

  return {
    question: questionLines.join('\n').trim(),
    options,
    answer,
    explanation: explanationLines.join('\n').trim()
  };
}

function runTesseract(imagePath) {
  try {
    const out = execSync(
      `tesseract ${JSON.stringify(imagePath)} stdout --dpi 300 --psm 6 -l kor+eng`,
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 }
    );
    return out.toString();
  } catch (e) {
    return null;
  }
}

function runTesseractJs(imagePath) {
  try {
    // 동적 로드 (의존성 미설치 시 실패)
    // eslint-disable-next-line global-require
    const { createWorker } = require('tesseract.js');
    const worker = createWorker();
    return (async () => {
      await worker.load();
      await worker.loadLanguage('kor+eng');
      await worker.initialize('kor+eng');
      const { data } = await worker.recognize(imagePath);
      await worker.terminate();
      return data?.text || '';
    })();
  } catch (e) {
    return null;
  }
}

function toQuestionObject() {
  const id = opts.id || nowId();
  const category = opts.category || '토목기사';
  const difficulty = opts.difficulty || 'normal';

  const media = maybeCopyImage();
  const candidates = [];
  const cli = runTesseract(imagePath);
  if (cli) {
    candidates.push({ engine: 'tesseract-cli', text: cli });
  }

  return Promise.resolve(1).then(async () => {
    if (!candidates.length) {
      const jsPromise = runTesseractJs(imagePath);
      if (jsPromise) {
        const jsText = await jsPromise;
        if (jsText) candidates.push({ engine: 'tesseract.js', text: jsText });
      }
    }

    if (!candidates.length) {
      const stub = {
        id,
        category,
        question: 'OCR 엔진 미설치. 이 문제 본문을 직접 입력해주세요.',
        media,
        type: 'multiple',
        options: ['선지1', '선지2', '선지3', '선지4'],
        answer: '',
        explanation: '해설을 입력해주세요.',
        difficulty
      };
      return stub;
    }

    const best = candidates[0];
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
        raw: best.text
      }
    };
  });
}

(async () => {
  const outPath = path.resolve(opts.out || path.join(process.cwd(), 'templates', 'ocr-extract.json'));
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const q = await toQuestionObject();
  fs.writeFileSync(outPath, JSON.stringify({ questions: [q] }, null, 2), 'utf8');
  console.log(`OK: ${outPath}`);
  console.log(`- id: ${q.id}`);
  console.log(`- media: ${q.media}`);
  console.log(`- type: ${q.type}`);
  console.log(`- category: ${q.category}`);
  console.log(`- difficulty: ${q.difficulty}`);
  if (q._ocrMeta?.engine) {
    console.log(`- ocr engine: ${q._ocrMeta.engine}`);
  }
  if (!q.answer && !q._ocrMeta) {
    console.log('주의: 정답이 추출되지 않았습니다. 수동 보정이 필요합니다.');
  }
})();
