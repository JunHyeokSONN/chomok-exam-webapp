const els = {
  modeSelect: document.getElementById('modeSelect'),
  difficultySelect: document.getElementById('difficultySelect'),
  viewMode: document.getElementById('viewMode'),
  maxCount: document.getElementById('maxCount'),
  timeLimitMin: document.getElementById('timeLimitMin'),
  btnStartTest: document.getElementById('btnStartTest'),
  btnShuffle: document.getElementById('btnShuffle'),
  btnReset: document.getElementById('btnReset'),
  status: document.getElementById('status'),
  timerPanel: document.getElementById('timerPanel'),
  timerText: document.getElementById('timerText'),
  btnFinishTest: document.getElementById('btnFinishTest'),
  quizArea: document.getElementById('quizArea'),
  resultBox: document.getElementById('resultBox'),
  scoreText: document.getElementById('scoreText'),
  statsByDiff: document.getElementById('statsByDiff'),
  wrongMarkdown: document.getElementById('wrongMarkdown'),
  btnRetryWrong: document.getElementById('btnRetryWrong'),
  btnCopyMarkdown: document.getElementById('btnCopyMarkdown'),
  jsonInput: document.getElementById('jsonInput'),
  btnLoadJson: document.getElementById('btnLoadJson'),
  fileJson: document.getElementById('fileJson'),
  btnSaveToLocal: document.getElementById('btnSaveToLocal'),
  btnClearLocal: document.getElementById('btnClearLocal'),
  singleNav: document.getElementById('singleNav'),
  btnPrev: document.getElementById('btnPrev'),
  btnNext: document.getElementById('btnNext'),
  singlePos: document.getElementById('singlePos')
};

let allQuestions = [];
let sessionQuestions = [];
let wrongIds = new Set();
let currentIndex = 0;
let inTest = false;
let timerHandle = null;
let remainingSec = 0;
let totalWrongCount = 0;
let answerMeta = new Map();

function setStatus(text) {
  els.status.textContent = text;
}

function normalizeShort(v = '') {
  return String(v).replace(/\s+/g, ' ').trim().toLowerCase();
}

async function loadDefault() {
  const res = await fetch('data.json');
  const data = await res.json();
  allQuestions = data.questions || [];
  els.jsonInput.value = JSON.stringify(allQuestions, null, 2);
  applyFiltersAndRender();
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function filterQuestions() {
  const diff = els.difficultySelect.value;
  const maxCount = parseInt(els.maxCount.value, 10);
  let filtered = diff === 'all' ? [...allQuestions] : allQuestions.filter(q => q.difficulty === diff);

  if (Number.isInteger(maxCount) && maxCount > 0) {
    filtered = filtered.slice(0, maxCount);
  }

  return filtered;
}

function startTimer(minutes) {
  remainingSec = Math.max(1, parseInt(minutes, 10) || 20) * 60;
  els.timerPanel.hidden = false;
  renderTimer();
  timerHandle = setInterval(() => {
    remainingSec -= 1;
    if (remainingSec <= 0) {
      stopTimer(true);
      return;
    }
    renderTimer();
  }, 1000);
}

function stopTimer(auto = false) {
  if (!timerHandle) return;
  clearInterval(timerHandle);
  timerHandle = null;
  if (auto) {
    alert('시간 종료! 자동으로 채점합니다.');
  }
  els.timerPanel.hidden = true;
}

function renderTimer() {
  const mm = Math.floor(remainingSec / 60).toString().padStart(2, '0');
  const ss = (remainingSec % 60).toString().padStart(2, '0');
  els.timerText.textContent = `${mm}:${ss}`;
}

function buildQuestionCard(q, index, total, context = {}) {
  const card = document.createElement('section');
  card.className = 'card';
  card.dataset.qid = q.id || `q_${index}`;

  const isShort = q.type === 'short';
  const options = q.options || [];

  const h3 = document.createElement('h3');
  h3.innerHTML = `문항 ${index + 1} / ${total} - ${q.id || 'NoID'} (${q.difficulty || '-'})`;
  const qText = document.createElement('p');
  qText.textContent = q.question || '문항이 없습니다.';

  const optionsWrap = document.createElement('div');
  optionsWrap.className = 'options';

  if (isShort) {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '정답 입력';
    input.style.width = '100%';
    input.value = answerMeta.get(q.id || qText.textContent) || '';
    input.style.padding = '10px';
    input.style.borderRadius = '8px';
    input.style.background = '#1f2430';
    input.style.color = '#fff';
    input.style.border = '1px solid #2d3440';
    input.addEventListener('input', () => {
      answerMeta.set(q.id || qText.textContent, input.value);
      persistProgress();
    });
    optionsWrap.appendChild(input);
  } else {
    options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option';
      btn.textContent = opt;
      const saved = answerMeta.get(q.id || qText.textContent);
      if (saved && saved === opt) btn.classList.add('selected');
      btn.addEventListener('click', () => {
        optionsWrap.querySelectorAll('.option').forEach((x) => x.classList.remove('selected'));
        btn.classList.add('selected');
        answerMeta.set(q.id || qText.textContent, opt);
        persistProgress();
      });
      optionsWrap.appendChild(btn);
    });
  }

  const actions = document.createElement('div');
  actions.className = 'actions';
  const btnCheck = document.createElement('button');
  btnCheck.textContent = '채점';
  btnCheck.addEventListener('click', () => gradeOne(q, card, optionsWrap, index, true));
  const btnSkip = document.createElement('button');
  btnSkip.textContent = '정답 보기';
  btnSkip.addEventListener('click', () => gradeOne(q, card, optionsWrap, index, false));
  actions.appendChild(btnCheck);
  actions.appendChild(btnSkip);

  card.appendChild(h3);
  card.appendChild(qText);
  card.appendChild(optionsWrap);
  card.appendChild(actions);

  if (context.explanationOnly) {
    const p = document.createElement('p');
    p.textContent = q.explanation || '해설 없음';
    p.style.marginTop = '10px';
    card.appendChild(p);
  }

  return card;
}

function gradeOne(q, card, optionsWrap, index, isCheckMode = true) {
  const key = q.id || `${index}`;
  const isShort = q.type === 'short';
  const picked = isShort ? normalizeShort(answerMeta.get(key) || '') : normalizeShort((optionsWrap.querySelector('.option.selected') || {}).dataset?.value || optionsWrap.querySelector('.option.selected')?.textContent || '');
  const correct = normalizeShort(q.answer || '');
  const options = [...optionsWrap.querySelectorAll('.option')];

  if (!picked && isCheckMode) {
    alert('답안을 선택/입력해 주세요.');
    return;
  }

  const isCorrect = picked === correct;
  if (isCorrect) {
    options.forEach((x) => {
      if (normalizeShort(x.textContent) === correct) x.classList.add('correct');
      if (x.classList.contains('selected')) x.classList.add('selected');
    });
  } else {
    wrongIds.add(key);
    options.forEach((x) => {
      if (normalizeShort(x.textContent) === correct) x.classList.add('correct');
      if (x.classList.contains('selected')) x.classList.add('wrong');
    });
  }

  const footer = document.createElement('p');
  footer.innerHTML = `<span class="${isCorrect ? 'okText' : 'badText'}"><strong>${isCorrect ? '정답' : '오답'}</strong></span> : ${q.explanation || '해설 없음'} (정답: ${q.answer})`;
  if (!card.querySelector('.okText, .badText')) card.appendChild(footer);

  optionsWrap.querySelectorAll('button.option, input').forEach((el) => el.disabled = true);
  if (!isCheckMode) wrongIds.add(key);
  persistProgress();
  renderResultPreview();
}

function renderSingle() {
  if (!sessionQuestions.length) {
    els.quizArea.innerHTML = '<div class="card">문제가 없습니다.</div>';
    els.singleNav.hidden = true;
    setStatus('문항 0 / 0');
    return;
  }
  const q = sessionQuestions[currentIndex];
  els.quizArea.innerHTML = '';
  els.quizArea.appendChild(buildQuestionCard(q, currentIndex, sessionQuestions.length));
  els.singleNav.hidden = false;
  els.singlePos.textContent = `${currentIndex + 1} / ${sessionQuestions.length}`;
  setStatus(`문항 ${currentIndex + 1} / ${sessionQuestions.length}`);
}

function renderAll() {
  els.quizArea.innerHTML = '';
  sessionQuestions.forEach((q, i) => {
    els.quizArea.appendChild(buildQuestionCard(q, i, sessionQuestions.length));
  });
  els.singleNav.hidden = true;
  setStatus(`문항 ${sessionQuestions.length} / ${sessionQuestions.length}`);
}

function applyFiltersAndRender() {
  sessionQuestions = filterQuestions();
  if (els.modeSelect.value === 'test') {
    sessionQuestions = shuffleArray([...sessionQuestions]);
  }
  answerMeta = new Map();
  wrongIds = new Set();
  currentIndex = 0;
  inTest = false;
  stopTimer();
  renderSession();
  renderResultPreview();
}

function renderSession() {
  if (els.viewMode.value === 'single') renderSingle();
  else renderAll();
}

function renderResultPreview() {
  if (wrongIds.size === 0) {
    els.scoreText.textContent = '';
    els.statsByDiff.innerHTML = '';
    return;
  }
  const total = sessionQuestions.length;
  const wrongByDiff = { easy: 0, normal: 0, hard: 0 };
  let wrong = 0;
  sessionQuestions.forEach((q) => {
    if (wrongIds.has(q.id || '')) {
      wrong += 1;
      if (wrongByDiff[q.difficulty || 'normal'] != null) wrongByDiff[q.difficulty || 'normal'] += 1;
    }
  });
  totalWrongCount = wrong;
  const right = total - wrong;
  els.scoreText.textContent = `현재 정답(추정): ${right} / ${total} (${total > 0 ? Math.round((right / total) * 100) : 0}%)`;
  els.statsByDiff.innerHTML = `
    <ul>
      <li>하난도 오답: ${wrongByDiff.easy}</li>
      <li>중난도 오답: ${wrongByDiff.normal}</li>
      <li>상난도 오답: ${wrongByDiff.hard}</li>
    </ul>
  `;
}

function goNext() {
  if (sessionQuestions.length === 0) return;
  currentIndex = Math.min(sessionQuestions.length - 1, currentIndex + 1);
  renderSingle();
}

function goPrev() {
  if (sessionQuestions.length === 0) return;
  currentIndex = Math.max(0, currentIndex - 1);
  renderSingle();
}

function persistProgress() {
  const state = {
    savedAt: new Date().toISOString(),
    questions: sessionQuestions,
    answers: Array.from(answerMeta.entries())
  };
  localStorage.setItem('chomok_progress', JSON.stringify(state));
}

function restoreProgress() {
  try {
    const saved = localStorage.getItem('chomok_progress');
    if (!saved) return;
    const parsed = JSON.parse(saved);
    if (!parsed?.answers) return;
    answerMeta = new Map(parsed.answers);
  } catch {}
}

function loadJsonText(text) {
  const parsed = JSON.parse(text);
  const arr = Array.isArray(parsed) ? parsed : parsed.questions;
  if (!Array.isArray(arr)) throw new Error('형식이 배열이 아닙니다.');
  allQuestions = arr;
  els.jsonInput.value = JSON.stringify(arr, null, 2);
  localStorage.setItem('chomok_questions_backup', JSON.stringify(arr));
  applyFiltersAndRender();
}

els.btnShuffle.addEventListener('click', () => {
  sessionQuestions = shuffleArray([...sessionQuestions]);
  currentIndex = 0;
  renderSession();
});

els.btnReset.addEventListener('click', () => {
  applyFiltersAndRender();
});

els.btnStartTest.addEventListener('click', () => {
  if (!sessionQuestions.length) return;
  applyFiltersAndRender();
  inTest = true;
  startTimer(parseInt(els.timeLimitMin.value || '20', 10));
});

els.btnFinishTest.addEventListener('click', () => {
  stopTimer();
  computeFinalResult();
});

els.btnPrev.addEventListener('click', goPrev);
els.btnNext.addEventListener('click', goNext);

els.modeSelect.addEventListener('change', applyFiltersAndRender);
els.difficultySelect.addEventListener('change', applyFiltersAndRender);
els.viewMode.addEventListener('change', renderSession);
els.btnRetryWrong.addEventListener('click', () => {
  const wrong = sessionQuestions.filter((q) => wrongIds.has(q.id));
  sessionQuestions = wrong.length ? wrong : [];
  currentIndex = 0;
  renderSession();
  renderResultPreview();
});

els.btnCopyMarkdown.addEventListener('click', async () => {
  const wrongList = [...wrongIds].map((id) => {
    const q = allQuestions.find((x) => x.id === id);
    if (!q) return null;
    return `- ${q.id}: ${q.question}\n  - 정답: ${q.answer}`;
  }).filter(Boolean).join('\n\n');
  const text = wrongList || '오답 없음';
  els.wrongMarkdown.hidden = false;
  els.wrongMarkdown.textContent = text;
  try {
    await navigator.clipboard.writeText(text);
    alert('오답 내역 복사 완료');
  } catch {
    alert('클립보드 복사 실패. 화면에 보이는 마크다운을 수동 복사해 주세요.');
  }
});

els.btnLoadJson.addEventListener('click', () => {
  try {
    loadJsonText(els.jsonInput.value);
    alert('문제가 갱신되었습니다.');
  } catch (e) {
    alert('JSON 형식이 잘못되었습니다.');
  }
});

els.fileJson.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  try {
    loadJsonText(text);
    alert('파일에서 문제를 불러왔습니다.');
  } catch {
    alert('JSON 파일 형식이 잘못되었습니다.');
  }
});

els.btnSaveToLocal.addEventListener('click', () => {
  localStorage.setItem('chomok_questions_backup', JSON.stringify(allQuestions));
  alert('현재 문제를 로컬에 저장했습니다.');
});

els.btnClearLocal.addEventListener('click', () => {
  localStorage.removeItem('chomok_questions_backup');
  alert('로컬 백업 삭제');
});

function computeFinalResult() {
  const score = sessionQuestions.length - totalWrongCount;
  const percent = sessionQuestions.length ? Math.round((score / sessionQuestions.length) * 100) : 0;
  renderResultPreview();
  els.scoreText.textContent = `최종 점수: ${score} / ${sessionQuestions.length} (${percent}%)`;
  els.resultBox.hidden = false;
  if (!inTest) els.resultBox.hidden = true;
}

window.addEventListener('DOMContentLoaded', async () => {
  restoreProgress();
  const backup = localStorage.getItem('chomok_questions_backup');
  if (backup) {
    try {
      const parsed = JSON.parse(backup);
      if (Array.isArray(parsed)) allQuestions = parsed;
      else if (Array.isArray(parsed?.questions)) allQuestions = parsed.questions;
    } catch {}
  }

  if (!allQuestions.length) {
    await loadDefault();
  } else {
    els.jsonInput.value = JSON.stringify(allQuestions, null, 2);
    applyFiltersAndRender();
  }
});
