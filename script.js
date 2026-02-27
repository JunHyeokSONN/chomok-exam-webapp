const els = {
  modeSelect: document.getElementById('modeSelect'),
  difficultySelect: document.getElementById('difficultySelect'),
  viewMode: document.getElementById('viewMode'),
  maxCount: document.getElementById('maxCount'),
  timeLimitMin: document.getElementById('timeLimitMin'),
  autoNext: document.getElementById('autoNext'),
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
let currentIndex = 0;
let timerHandle = null;
let remainingSec = 0;
let inTest = false;

let answerMeta = new Map(); // qKey => userAnswer (raw)
let gradedMeta = new Map(); // qKey => {isCorrect, picked, byAuto}
let wrongIds = new Set(); // qKey set

function qKeyFor(idx, q) {
  return (q && q.id) ? q.id : `q_${idx}`;
}

function setStatus(text) {
  els.status.textContent = text;
}

function toCanonicalAnswer(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/,/g, '')
    .replace(/\((.*?)\)/g, '$1')
    .replace(/\s*[*/]\s*/g, '/')
    .replace(/kgf\/cm2|kgfcm2/g, 'kgfcm2');
}

function normalizeShort(raw) {
  return toCanonicalAnswer(raw)
    .replace(/[^\p{L}\p{N}./%+\-_=]/gu, '');
}

function loadIdCheckedQuestions(rawQuestions) {
  const seen = new Set();
  const fixed = [];
  let dupCount = 0;

  rawQuestions.forEach((item, idx) => {
    const q = { ...item };
    let id = String(q.id || '').trim();
    if (!id) id = `AUTO_${idx + 1}`;
    if (seen.has(id)) {
      dupCount += 1;
      let c = 2;
      while (seen.has(`${id}_${c}`)) c += 1;
      id = `${id}_${c}`;
    }
    seen.add(id);
    q.id = id;
    fixed.push(q);
  });

  if (dupCount > 0) {
    els && console.log(`중복 ID 자동 보정: ${dupCount}개`);
  }
  return fixed;
}

async function loadDefault() {
  const res = await fetch('data.json');
  const data = await res.json();
  allQuestions = loadIdCheckedQuestions(data.questions || []);
  els.jsonInput.value = JSON.stringify(allQuestions, null, 2);
  applyFiltersAndRender();
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function filterQuestions() {
  const diff = els.difficultySelect.value;
  const maxCount = parseInt(els.maxCount.value, 10);
  let filtered = diff === 'all' ? [...allQuestions] : allQuestions.filter((q) => q.difficulty === diff);
  if (Number.isInteger(maxCount) && maxCount > 0) {
    filtered = filtered.slice(0, maxCount);
  }
  return filtered;
}

function startTimer(minutes) {
  if (timerHandle) clearInterval(timerHandle);
  remainingSec = Math.max(1, parseInt(minutes, 10) || 20) * 60;
  els.timerPanel.hidden = false;
  renderTimer();

  timerHandle = setInterval(() => {
    remainingSec -= 1;
    if (remainingSec <= 0) {
      computeFinalResult({ auto: true });
      return;
    }
    renderTimer();
  }, 1000);
}

function stopTimer() {
  if (!timerHandle) return;
  clearInterval(timerHandle);
  timerHandle = null;
  els.timerPanel.hidden = true;
}

function renderTimer() {
  const mm = String(Math.floor(remainingSec / 60)).padStart(2, '0');
  const ss = String(remainingSec % 60).padStart(2, '0');
  els.timerText.textContent = `${mm}:${ss}`;
}

function markStatus() {
  const total = sessionQuestions.length;
  const answered = [...Array(total)].reduce((acc, _, idx) => {
    const key = qKeyFor(idx, sessionQuestions[idx]);
    return acc + (normalizeShort(answerMeta.get(key) || '') ? 1 : 0);
  }, 0);

  if (els.viewMode.value === 'single') {
    setStatus(`문항 ${Math.min(currentIndex + 1, total)} / ${total} (답안완료 ${answered}개)`);
  } else {
    setStatus(`문항 ${total} / ${total} (답안완료 ${answered}개)`);
  }
}

function evaluateSessionScore() {
  let wrong = 0;
  const wrongByDiff = { easy: 0, normal: 0, hard: 0 };

  sessionQuestions.forEach((q, idx) => {
    const key = qKeyFor(idx, q);
    const user = normalizeShort(answerMeta.get(key) || '');
    const correct = normalizeShort(q.answer || '');
    const isCorrect = user && user === correct;

    if (!isCorrect) {
      wrong += 1;
      wrongIds.add(key);
      const d = q.difficulty || 'normal';
      if (wrongByDiff[d] !== undefined) wrongByDiff[d] += 1;
    } else {
      wrongIds.delete(key);
    }
  });

  const right = sessionQuestions.length - wrong;
  return { total: sessionQuestions.length, wrong, right, wrongByDiff };
}

function updateStats() {
  const { right, total, wrong, wrongByDiff } = evaluateSessionScore();
  const percent = total ? Math.round((right / total) * 100) : 0;
  els.scoreText.textContent = `현재 정답(미응답 감점): ${right} / ${total} (${percent}%), 오답 ${wrong}개`;
  els.statsByDiff.innerHTML = `
    <ul>
      <li>하난도 오답: ${wrongByDiff.easy}</li>
      <li>중난도 오답: ${wrongByDiff.normal}</li>
      <li>상난도 오답: ${wrongByDiff.hard}</li>
    </ul>
  `;
  els.resultBox.hidden = false;
}

function buildQuestionCard(q, index, total) {
  const card = document.createElement('section');
  card.className = 'card';
  const key = qKeyFor(index, q);
  card.dataset.qid = key;

  const isShort = q.type === 'short';
  const qText = document.createElement('p');
  qText.textContent = q.question || '문항이 없습니다.';

  const h3 = document.createElement('h3');
  h3.textContent = `문항 ${index + 1} / ${total} - ${q.id || 'NoID'} (${q.difficulty || '-'})`;

  const optionsWrap = document.createElement('div');
  optionsWrap.className = 'options';

  if (isShort) {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '정답 입력';
    input.value = answerMeta.get(key) || '';
    input.addEventListener('input', () => {
      answerMeta.set(key, input.value);
      persistProgress();
      markStatus();
      updateStats();
    });
    optionsWrap.appendChild(input);
  } else {
    const options = Array.isArray(q.options) ? q.options : [];
    options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option';
      btn.textContent = opt;
      if (normalizeShort(answerMeta.get(key) || '') === normalizeShort(opt)) {
        btn.classList.add('selected');
      }

      btn.addEventListener('click', () => {
        optionsWrap.querySelectorAll('.option').forEach((x) => x.classList.remove('selected'));
        btn.classList.add('selected');
        answerMeta.set(key, opt);
        persistProgress();
        markStatus();
        updateStats();
      });

      optionsWrap.appendChild(btn);
    });
  }

  const actions = document.createElement('div');
  actions.className = 'actions';

  const btnCheck = document.createElement('button');
  btnCheck.textContent = '채점';
  btnCheck.addEventListener('click', () => gradeOne(index, key, q, card, optionsWrap, true));

  const btnReveal = document.createElement('button');
  btnReveal.textContent = '정답 보기';
  btnReveal.addEventListener('click', () => gradeOne(index, key, q, card, optionsWrap, false));

  const btnClear = document.createElement('button');
  btnClear.textContent = '문항초기화';
  btnClear.addEventListener('click', () => {
    answerMeta.delete(key);
    gradedMeta.delete(key);
    wrongIds.delete(key);
    persistProgress();
    renderSession();
    updateStats();
    markStatus();
  });

  actions.append(btnCheck, btnReveal, btnClear);

  card.append(h3, qText, optionsWrap, actions);
  return card;
}

function applyGradeVisual(q, index, key, card, optionsWrap, isCorrect) {
  const isShort = q.type === 'short';
  const picked = answerMeta.get(key) || '';

  const footer = document.createElement('p');
  const stateClass = isCorrect ? 'okText' : 'badText';
  footer.innerHTML = `<span class="${stateClass}"><strong>${isCorrect ? '정답' : '오답'}</strong></span> : ${q.explanation || '해설 없음'} (정답: ${q.answer})`;

  if (!card.querySelector('.okText, .badText')) card.appendChild(footer);

  if (!isShort) {
    const options = [...optionsWrap.querySelectorAll('.option')];
    options.forEach((x) => {
      if (normalizeShort(x.textContent) === normalizeShort(q.answer || '')) x.classList.add('correct');
      if (normalizeShort(x.textContent) === normalizeShort(picked) && !isCorrect) x.classList.add('wrong');
    });
  } else {
    const p = document.createElement('p');
    p.textContent = `정답: ${q.answer}`;
    if (!isShort && !card.querySelector('p:nth-of-type(4)')) card.appendChild(p);
  }

  optionsWrap.querySelectorAll('.option, input').forEach((el) => (el.disabled = true));
}

function gradeOne(index, key, q, card, optionsWrap, shouldCheck) {
  const isShort = q.type === 'short';
  const pickedRaw = normalizeShort(answerMeta.get(key) || '');
  const correct = normalizeShort(q.answer || '');
  if (!pickedRaw && shouldCheck) {
    alert('답안을 선택/입력해 주세요.');
    return;
  }

  let isCorrect = false;
  if (shouldCheck) {
    isCorrect = pickedRaw === correct;
    wrongIds.delete(key);
    if (!isCorrect) wrongIds.add(key);
    gradedMeta.set(key, { picked: pickedRaw, isCorrect, byAuto: false });
  } else {
    wrongIds.add(key);
    isCorrect = false;
    gradedMeta.set(key, { picked: pickedRaw, isCorrect: false, byAuto: false });
  }

  applyGradeVisual(q, index, key, card, optionsWrap, isCorrect);
  persistProgress();
  updateStats();
  markStatus();

  if (els.viewMode.value === 'single' && inTest && els.autoNext.checked && index < sessionQuestions.length - 1) {
    setTimeout(() => goNext(), 250);
  }
}

function renderSingle() {
  if (!sessionQuestions.length) {
    els.quizArea.innerHTML = '<div class="card">문제가 없습니다.</div>';
    els.singleNav.hidden = true;
    setStatus('문항 0 / 0');
    return;
  }

  const q = sessionQuestions[currentIndex];
  const key = qKeyFor(currentIndex, q);
  els.quizArea.innerHTML = '';
  els.quizArea.appendChild(buildQuestionCard(q, currentIndex, sessionQuestions.length));
  els.singlePos.textContent = `${currentIndex + 1} / ${sessionQuestions.length}`;
  els.singleNav.hidden = false;

  // 이미 채점됐던 상태 복원
  const state = gradedMeta.get(key);
  if (state) {
    const card = els.quizArea.querySelector('.card');
    const optionsWrap = card.querySelector('.options');
    if (state.isCorrect) {
      applyGradeVisual(q, currentIndex, key, card, optionsWrap, true);
    }
  }

  markStatus();
}

function renderAll() {
  els.quizArea.innerHTML = '';
  sessionQuestions.forEach((q, idx) => {
    const card = buildQuestionCard(q, idx, sessionQuestions.length);
    const key = qKeyFor(idx, q);
    const state = gradedMeta.get(key);
    const optionsWrap = card.querySelector('.options');
    if (state) {
      applyGradeVisual(q, idx, key, card, optionsWrap, state.isCorrect);
    }
    els.quizArea.appendChild(card);
  });
  els.singleNav.hidden = true;
  markStatus();
}

function renderSession() {
  if (els.viewMode.value === 'single') {
    renderSingle();
  } else {
    renderAll();
  }
}

function applyFiltersAndRender() {
  sessionQuestions = filterQuestions();
  if (els.modeSelect.value === 'test') {
    sessionQuestions = shuffleArray(sessionQuestions);
  }

  answerMeta = new Map();
  gradedMeta = new Map();
  wrongIds = new Set();
  currentIndex = 0;
  inTest = false;
  stopTimer();
  renderSession();
  updateStats();
  els.resultBox.hidden = false;
  els.wrongMarkdown.hidden = true;
}

function goNext() {
  if (!sessionQuestions.length) return;
  currentIndex = Math.min(sessionQuestions.length - 1, currentIndex + 1);
  renderSingle();
}

function goPrev() {
  if (!sessionQuestions.length) return;
  currentIndex = Math.max(0, currentIndex - 1);
  renderSingle();
}

function persistProgress() {
  const state = {
    savedAt: new Date().toISOString(),
    questions: sessionQuestions,
    answers: Array.from(answerMeta.entries()),
    graded: Array.from(gradedMeta.entries())
  };
  localStorage.setItem('chomok_progress', JSON.stringify(state));
}

function restoreProgress() {
  try {
    const raw = localStorage.getItem('chomok_progress');
    if (!raw) return;
    const state = JSON.parse(raw);
    if (!state?.answers || !Array.isArray(state.answers)) return;
    answerMeta = new Map(state.answers);
  } catch {}
}

function loadJsonText(rawText) {
  const parsed = JSON.parse(rawText);
  const items = Array.isArray(parsed) ? parsed : parsed.questions;
  if (!Array.isArray(items)) throw new Error('JSON 형식 오류');
  allQuestions = loadIdCheckedQuestions(items);
  els.jsonInput.value = JSON.stringify(allQuestions, null, 2);
  localStorage.setItem('chomok_questions_backup', JSON.stringify(allQuestions));
  applyFiltersAndRender();
}

function computeFinalResult({ auto = false } = {}) {
  stopTimer();
  const { right, total } = evaluateSessionScore();
  const percent = total ? Math.round((right / total) * 100) : 0;
  if (auto) alert('시간 종료! 자동 채점합니다.');
  els.scoreText.textContent = `최종 점수: ${right} / ${total} (${percent}%)`;
  updateStats();
  els.resultBox.hidden = false;
}

els.btnShuffle.addEventListener('click', () => {
  sessionQuestions = shuffleArray(sessionQuestions);
  currentIndex = 0;
  renderSession();
});
els.btnReset.addEventListener('click', () => applyFiltersAndRender());
els.btnStartTest.addEventListener('click', () => {
  if (!sessionQuestions.length) return;
  applyFiltersAndRender();
  inTest = true;
  startTimer(parseInt(els.timeLimitMin.value || '20', 10));
});
els.btnFinishTest.addEventListener('click', () => computeFinalResult());
els.modeSelect.addEventListener('change', applyFiltersAndRender);
els.difficultySelect.addEventListener('change', applyFiltersAndRender);
els.viewMode.addEventListener('change', renderSession);
els.btnPrev.addEventListener('click', goPrev);
els.btnNext.addEventListener('click', goNext);

els.btnRetryWrong.addEventListener('click', () => {
  if (!wrongIds.size) {
    alert('오답 문제가 없습니다.');
    return;
  }

  const wrong = sessionQuestions.filter((q, idx) => wrongIds.has(qKeyFor(idx, q)));
  sessionQuestions = wrong;
  currentIndex = 0;
  inTest = false;
  renderSession();
  updateStats();
});

els.btnCopyMarkdown.addEventListener('click', async () => {
  const wrongList = [...wrongIds]
    .map((key) => {
      const idx = parseInt(String(key).replace(/^q_/, ''), 10);
      const q = Number.isInteger(idx) ? sessionQuestions[idx] : allQuestions.find((x) => x.id === key);
      if (!q) return null;
      return `- ${q.id}: ${q.question}\n  - 정답: ${q.answer}`;
    })
    .filter(Boolean)
    .join('\n\n');

  const text = wrongList || '오답 없음';
  els.wrongMarkdown.hidden = false;
  els.wrongMarkdown.textContent = text;
  try {
    await navigator.clipboard.writeText(text);
    alert('오답 내역을 복사했습니다.');
  } catch {
    alert('클립보드 복사 실패: 화면에서 복사하세요.');
  }
});

els.btnLoadJson.addEventListener('click', () => {
  try {
    loadJsonText(els.jsonInput.value);
    alert('문제 목록이 갱신되었습니다.');
  } catch {
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

window.addEventListener('DOMContentLoaded', async () => {
  restoreProgress();

  const backup = localStorage.getItem('chomok_questions_backup');
  if (backup) {
    try {
      const parsed = JSON.parse(backup);
      if (Array.isArray(parsed)) {
        allQuestions = loadIdCheckedQuestions(parsed);
      } else if (Array.isArray(parsed?.questions)) {
        allQuestions = loadIdCheckedQuestions(parsed.questions);
      }
    } catch {}
  }

  if (!allQuestions.length) {
    await loadDefault();
  } else {
    els.jsonInput.value = JSON.stringify(allQuestions, null, 2);
    applyFiltersAndRender();
  }
  updateStats();
  markStatus();
});
