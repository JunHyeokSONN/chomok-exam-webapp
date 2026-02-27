#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const srcPath = process.argv[2] || path.join(__dirname, '..', 'data.json');
const outDir = path.join(__dirname, '..', 'templates');

const ALIASES = {
  '토목기사': '토목기사',
  '공기업': '공기업',
  '공무원': '공무원'
};

function safeReadJSON(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function sanitizeCategory(cat) {
  return ALIASES[cat] || '토목기사';
}

function makeTemplate(category) {
  return {
    category,
    questions: [
      {
        id: `${category[0]}000`,
        category,
        question: '문항을 여기에 입력하세요',
        type: 'multiple',
        options: ['1', '2', '3', '4'],
        answer: '1',
        explanation: '해설을 여기에 입력하세요',
        difficulty: 'normal'
      }
    ]
  };
}

function writeJSON(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

function escapeCsv(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function main() {
  const data = safeReadJSON(srcPath);
  const questions = Array.isArray(data.questions) ? data.questions : [];

  const categorized = { total: [] };
  Object.keys(ALIASES).forEach((k) => {
    categorized[k] = [];
  });

  questions.forEach((q, idx) => {
    const category = sanitizeCategory(q.category);
    if (!categorized[category]) categorized[category] = [];
    categorized[category].push(q);
    categorized.total.push(q);
  });

  fs.mkdirSync(outDir, { recursive: true });

  const summary = ['# 출제분류 샘플 파일 요약', `- 생성 시각: ${new Date().toISOString()}`, ''];

  for (const category of Object.keys(ALIASES)) {
    const grouped = categorized[category] || [];
    const outPath = path.join(outDir, `${category}.json`);
    writeJSON(outPath, { category, questions: grouped });

    const csvPath = path.join(outDir, `${category}.csv`);
    const rows = [['id', 'category', 'question', 'type', 'option1', 'option2', 'option3', 'option4', 'answer', 'explanation', 'difficulty']];
    for (const q of grouped) {
      rows.push([
        q.id || `AUTO_${category}_${rows.length}`,
        q.category || category,
        q.question || '',
        q.type || 'multiple',
        ...(Array.isArray(q.options) ? q.options : ['','','','']).slice(0, 4),
        q.answer || '',
        q.explanation || '',
        q.difficulty || 'normal'
      ]);
    }
    const csv = rows.map((r) => r.map(escapeCsv).join(',')).join('\n');
    fs.writeFileSync(csvPath, csv, 'utf8');

    const templatePath = path.join(outDir, `${category}.template.json`);
    writeJSON(templatePath, makeTemplate(category));

    summary.push(`- ${category}: ${grouped.length}문항`);
    summary.push(`  - JSON: ${path.basename(outPath)}`);
    summary.push(`  - CSV: ${path.basename(csvPath)}`);
    summary.push(`  - 템플릿: ${path.basename(templatePath)}`);
  }

  writeJSON(path.join(outDir, '_all.json'), { category: '전체', questions: categorized.total });
  fs.writeFileSync(path.join(outDir, 'README.md'), summary.join('\n') + '\n', 'utf8');

  console.log('DONE');
  console.log(`output: ${outDir}`);
}

main();
