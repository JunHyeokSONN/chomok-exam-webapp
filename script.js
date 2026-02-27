const modeSelect = document.getElementById('modeSelect');
const difficultySelect = document.getElementById('difficultySelect');
const btnShuffle = document.getElementById('btnShuffle');
const btnReset = document.getElementById('btnReset');
const statusEl = document.getElementById('status');
const quizArea = document.getElementById('quizArea');
const resultBox = document.getElementById('resultBox');
const scoreText = document.getElementById('scoreText');
const wrongMarkdown = document.getElementById('wrongMarkdown');
const btnRetryWrong = document.getElementById('btnRetryWrong');
const btnCopyMarkdown = document.getElementById('btnCopyMarkdown');
const btnLoadJson = document.getElementById('btnLoadJson');
const btnSaveToLocal = document.getElementById('btnSaveToLocal');
const jsonInput = document.getElementById('jsonInput');

let allQuestions = [];
let sessionQuestions = [];
let wrongIds = new Set();

async function loadDefault() {
  const res = await fetch('data.json');
  const data = await res.json();
  allQuestions = data.questions || [];
  jsonInput.value = JSON.stringify(allQuestions, null, 2);
  applyFiltersAndRender();
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function filterQuestions(base) {
  const diff = difficultySelect.value;
  if (diff === 'all') return [...base];
  return base.filter(q => q.difficulty === diff);
}

function renderQuestion(q, idx, total) {
  const card = document.createElement('section');
  card.className = 'card';

  const qType = q.type || 'multiple';
  const opts = q.options || [];
  const isShort = qType === 'short';

  card.innerHTML = `
    <div class="meta">문항 ${idx + 1} / ${total} · 난이도: ${q.difficulty || '-'} · ID: ${q.id || '-'}</div>
    <h3>${q.question}</h3>
    <div class="options" id="opts-${q.id}"></div>
    <div class="actions"></div>
  `;

  const optionsWrap = card.querySelector('.options');
  const actionWrap = card.querySelector('.actions');

  if (isShort) {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '정답 입력';
    input.style.width = '100%';
    input.style.padding = '10px';
    input.style.borderRadius = '8px';
    input.style.background = '#1f2430';
    input.style.color = '#fff';
    input.style.border = '1px solid #2d3440';
    optionsWrap.appendChild(input);
  } else {
    opts.forEach((op, i) => {
      const btn = document.createElement('button');
      btn.className = 'option';
      btn.textContent = op;
      btn.dataset.value = op;
      btn.type = 'button';
      btn.onclick = () => {
        optionsWrap.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
        btn.classList.add('selected');
      };
      optionsWrap.appendChild(btn);
    });
  }

  const testMode = modeSelect.value === 'test';
  const btnGroup = document.createElement('div');
  btnGroup.className = 'actions';

  const btnCheck = document.createElement('button');
  btnCheck.textContent = testMode ? '채점' : '정답 보기';
  btnCheck.onclick = () => checkOne(q, card, optionsWrap);
  btnGroup.appendChild(btnCheck);

  const btnSkip = document.createElement('button');
  btnSkip.textContent = '건너뛰기';
  btnSkip.onclick = () => revealAnswer(q, card, optionsWrap);
  btnGroup.appendChild(btnSkip);

  card.appendChild(btnGroup);
  return card;
}

function normalizeShort(v = '') {
  return String(v).replace(/\s+/g, ' ').trim().toLowerCase();
}

function checkOne(q, card, optionsWrap) {
  const isShort = q.type === 'short';
  let selected = '';
  let selectedEls = [];

  if (isShort) {
    selected = normalizeShort(optionsWrap.querySelector('input')?.value || '');
  } else {
    selectedEls = [...optionsWrap.querySelectorAll('.option.selected')];
    selected = selectedEls[0]?.dataset.value || '';
  }

  const correct = normalizeShort(q.answer || '');
  const picked = normalizeShort(selected);
  const ok = picked && picked === correct;

  if (ok) {
    score += 1;
    if (!isShort) selectedEls.forEach(el => el.classList.add('correct'));
  } else {
    wrongIds.add(q.id || Math.random().toString());
    if (!isShort) {
      const all = [...optionsWrap.querySelectorAll('.option')];
      all.forEach(el => {
        if (normalizeShort(el.dataset.value) === correct) el.classList.add('correct');
        if (el.classList.contains('selected')) el.classList.add('wrong');
      });
    }
  }

  const exp = document.createElement('p');
  exp.innerHTML = `<span class="${ok ? 'okText' : 'badText'}"><strong>${ok ? '정답' : '오답'}</strong></span> : ${q.explanation || '해설 미등록'} (정답: ${q.answer})`;
  card.appendChild(exp);

  const buttons = card.querySelectorAll('.actions button');
  buttons.forEach(b => (b.disabled = true));
  completed += 1;
  renderProgress();
  renderResultIfDone();
}

function revealAnswer(q, card, optionsWrap) {
  if (q.type === 'short') {
    const exp = document.createElement('p');
    exp.textContent = `정답: ${q.answer}`;
    card.appendChild(exp);
  } else {
    const all = [...optionsWrap.querySelectorAll('.option')];
    all.forEach(el => {
      if (normalizeShort(el.dataset.value) === normalizeShort(q.answer)) {
        el.classList.add('correct');
      }
    });
  }
  wrongIds.add(q.id || Math.random().toString());
  const buttons = card.querySelectorAll('.actions button');
  buttons.forEach(b => (b.disabled = true));
  completed += 1;
  renderProgress();
  renderResultIfDone();
}

let completed = 0;
let score = 0;

function renderResultIfDone() {
  if (completed < sessionQuestions.length) return;
  resultBox.hidden = false;
  scoreText.textContent = `총점: ${score} / ${sessionQuestions.length}`;
  const wrongList = [...wrongIds]
    .map(id => allQuestions.find(q => q.id === id))
    .filter(Boolean)
    .map(q => `- ${q.id}: ${q.question}\n  - 정답: ${q.answer}`)
    .join('\n\n');
  wrongMarkdown.textContent = wrongList || '오답 없음 🎉';
}

function renderQuiz() {
  quizArea.innerHTML = '';
  completed = 0;
  score = 0;
  wrongIds = new Set();
  resultBox.hidden = true;

  if (!sessionQuestions.length) {
    quizArea.innerHTML = '<div class="card">문제가 없습니다.</div>';
    renderProgress();
    return;
  }

  sessionQuestions.forEach((q, i) => quizArea.appendChild(renderQuestion(q, i, sessionQuestions.length)));
  renderProgress();
}

function renderProgress() {
  statusEl.textContent = `문항 ${completed} / ${sessionQuestions.length}`;
}

function applyFiltersAndRender() {
  sessionQuestions = filterQuestions(allQuestions);
  if (document.getElementById('modeSelect').value === 'test') {
    sessionQuestions = shuffleArray([...sessionQuestions]);
  }
  renderQuiz();
}

btnShuffle.addEventListener('click', () => {
  sessionQuestions = shuffleArray([...sessionQuestions]);
  renderQuiz();
});

btnReset.addEventListener('click', () => {
  applyFiltersAndRender();
});

btnRetryWrong.addEventListener('click', () => {
  const wrong = allQuestions.filter(q => wrongIds.has(q.id));
  sessionQuestions = wrong.length ? wrong : [];
  renderQuiz();
});

btnCopyMarkdown.addEventListener('click', async () => {
  wrongMarkdown.hidden = false;
  const text = wrongMarkdown.textContent;
  try {
    await navigator.clipboard.writeText(text);
    alert('오답 내역이 클립보드에 복사됐습니다.');
  } catch {
    alert('복사 실패. 마크다운 블록을 길게 눌러 복사해 주세요.');
  }
});

btnLoadJson.addEventListener('click', () => {
  try {
    const parsed = JSON.parse(jsonInput.value);
    const arr = Array.isArray(parsed) ? parsed : parsed.questions;
    if (!Array.isArray(arr)) throw new Error('배열이 아님');
    allQuestions = arr;
    applyFiltersAndRender();
    alert('문제가 갱신되었습니다.');
  } catch (e) {
    alert('JSON 형식이 올바르지 않습니다.');
  }
});

btnSaveToLocal.addEventListener('click', () => {
  localStorage.setItem('chomok_exam_backup', JSON.stringify(allQuestions));
  alert('현재 문제를 브라우저 저장소에 임시 저장했습니다.');
});

modeSelect.addEventListener('change', applyFiltersAndRender);
difficultySelect.addEventListener('change', applyFiltersAndRender);

window.addEventListener('DOMContentLoaded', async () => {
  const saved = localStorage.getItem('chomok_exam_backup');
  if (saved) {
    try { allQuestions = JSON.parse(saved); } catch (_) {}
  }
  if (!allQuestions.length) await loadDefault();
  else {
    jsonInput.value = JSON.stringify(allQuestions, null, 2);
    applyFiltersAndRender();
  }
});
