const PRESETS = {
  quick: {
    label: '빠른 체크 (20분/15문/중)',
    mode: 'test',
    examCategory: 'all',
    difficulty: 'normal',
    viewMode: 'single',
    maxCount: 15,
    timeLimitMin: 20,
    autoNext: true
  },
  exam: {
    label: '본시험 모의 (40분/40문/전체)',
    mode: 'test',
    examCategory: 'all',
    difficulty: 'all',
    viewMode: 'single',
    maxCount: 40,
    timeLimitMin: 40,
    autoNext: true
  },
  study: {
    label: '학습 루틴 (전체/무제한/학습)',
    mode: 'learn',
    examCategory: 'all',
    difficulty: 'all',
    viewMode: 'all',
    maxCount: '',
    timeLimitMin: 20,
    autoNext: false
  }
};

const els = {
  presetSelect: document.getElementById('presetSelect'),
  btnApplyPreset: document.getElementById('btnApplyPreset'),
  modeSelect: document.getElementById('modeSelect'),
  examCategory: document.getElementById('examCategory'),
  difficultySelect: document.getElementById('difficultySelect'),
  viewMode: document.getElementById('viewMode'),
  maxCount: document.getElementById('maxCount'),
  timeLimitMin: document.getElementById('timeLimitMin'),
  autoNext: document.getElementById('autoNext'),
  showAnswerToggle: document.getElementById('showAnswerToggle'),
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
  singlePos: document.getElementById('singlePos'),
  omrPanel: document.getElementById('omrPanel'),
  omrGrid: document.getElementById('omrGrid'),
  scoreHistoryWrap: document.getElementById('scoreHistoryWrap'),
  btnClearScore: document.getElementById('btnClearScore')
};

let allQuestions = [];
let sessionQuestions = [];
let currentIndex = 0;
let timerHandle = null;
let remainingSec = 0;
let inTest = false;

let answerMeta = new Map();
let gradedMeta = new Map();
let wrongIds = new Set();
let sessionStartAt = null;
let scoreHistory = [];

const STORAGE = {
  progress: 'chomok_progress',
  backup: 'chomok_questions_backup',
  preset: 'chomok_preset',
  scoreHistory: 'chomok_score_history'
};

function qKeyFor(idx, q) {
  return q && q.id ? q.id : `q_${idx}`;
}

function setStatus(text) {
  els.status.textContent = text;
}

function toHalfWidth(raw) {
  return String(raw).replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) => {
    const n = ch.charCodeAt(0);
    if (n >= 0xff10 && n <= 0xff19) return String.fromCharCode(n - 0xfee0);
    if (n >= 0xff21 && n <= 0xff3a) return String.fromCharCode(n - 0xfee0);
    if (n >= 0xff41 && n <= 0xff5a) return String.fromCharCode(n - 0xfee0);
    return ch;
  });
}

function canonicalize(raw) {
  const rawText = String(raw || '').normalize('NFKC').toLowerCase();

  return toHalfWidth(rawText)
    .replace(/[−–—]/g, '-')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\s+/g, '')
    .replace(/,/g, '')
    .replace(/\(.*?\)/g, '$1')
    .replace(/\s*[*/]\s*/g, '/')
    .replace(/kgf\/?cm2|kgfcm2/g, 'kgfcm2')
    .replace(/kpa\/?m2|kpa\/m2|kpacm2/g, 'kpa/m2')
    .replace(/㎠/g, 'cm2');
}

function normalize(raw) {
  return canonicalize(raw)
    .replace(/[^\p{L}\p{N}./%+\-_=]/gu, '');
}

function sanitizeQuestions(items) {
  const seen = new Set();
  const fixed = [];
  let duplicated = 0;
  items.forEach((raw, idx) => {
    const q = { ...raw };
    let id = String(q.id || '').trim();
    if (!id) id = `AUTO_${idx + 1}`;
    if (seen.has(id)) {
      duplicated += 1;
      let c = 2;
      while (seen.has(`${id}_${c}`)) c += 1;
      id = `${id}_${c}`;
    }
    seen.add(id);
    q.id = id;
    if (!q.category) q.category = '토목기사';
    fixed.push(q);
  });

  if (duplicated > 0) {
    console.info(`문항 ID 중복 보정: ${duplicated}개`);
  }
  return fixed;
}

function toInt(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function isSingleMode() {
  const m = els.viewMode.value;
  return m === 'single' || m === 'single-large' || m === 'omr' || m === 'qa';
}

function isQaMode() {
  return els.viewMode.value === 'qa';
}

function isOmrMode() {
  return els.viewMode.value === 'omr';
}

function answerVisibleByDefault() {
  if (!els.showAnswerToggle) return false;
  return isQaMode() || !!els.showAnswerToggle.checked;
}

function toCardClass() {
  const m = els.viewMode.value;
  return m === 'single-large' || m === 'omr' || m === 'qa' ? 'singleLargeCard' : '';
}

function getCurrentModeLabel() {
  const selected = els.viewMode.options[els.viewMode.selectedIndex];
  return selected ? selected.text : (els.viewMode.value || 'single');
}

function fillPresetOptions() {
  for (const [key, v] of Object.entries(PRESETS)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = v.label;
    els.presetSelect.appendChild(opt);
  }
}

function getPresetFromUI() {
  return {
    mode: els.modeSelect.value,
    examCategory: els.examCategory.value,
    difficulty: els.difficultySelect.value,
    viewMode: els.viewMode.value,
    maxCount: els.maxCount.value,
    timeLimitMin: els.timeLimitMin.value,
    autoNext: els.autoNext.checked
  };
}

function applyPreset(key) {
  const p = PRESETS[key];
  if (!p) return;
  els.modeSelect.value = p.mode;
  els.examCategory.value = p.examCategory;
  els.difficultySelect.value = p.difficulty;
  els.viewMode.value = p.viewMode;
  els.maxCount.value = p.maxCount || '';
  els.timeLimitMin.value = String(p.timeLimitMin || 20);
  els.autoNext.checked = !!p.autoNext;
  localStorage.setItem(STORAGE.preset, key);
}

function markPresetCustom() {
  if (els.presetSelect.value !== 'custom') {
    els.presetSelect.value = 'custom';
    localStorage.setItem(STORAGE.preset, 'custom');
  }
}

function loadPreset() {
  const saved = localStorage.getItem(STORAGE.preset) || 'custom';
  const has = Object.keys(PRESETS).includes(saved);
  if (!has) {
    els.presetSelect.value = 'custom';
    return;
  }
  els.presetSelect.value = saved;
  applyPreset(saved);
}

function syncPresetStateForCurrent() {
  const cur = getPresetFromUI();
  const hit = Object.entries(PRESETS).find(([, p]) => {
    return (
      p.mode === cur.mode &&
      p.examCategory === cur.examCategory &&
      p.difficulty === cur.difficulty &&
      p.viewMode === cur.viewMode &&
      String(p.maxCount || '') === String(cur.maxCount || '') &&
      String(p.timeLimitMin) === String(cur.timeLimitMin) &&
      !!p.autoNext === cur.autoNext
    );
  });
  els.presetSelect.value = hit ? hit[0] : 'custom';
}

async function loadDefault() {
  const res = await fetch('data.json');
  const data = await res.json();
  allQuestions = sanitizeQuestions(data.questions || []);
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
  const category = els.examCategory.value;
  const diff = els.difficultySelect.value;
  const maxCount = toInt(els.maxCount.value, 0);

  let filtered = [...allQuestions];
  if (category !== 'all') {
    filtered = filtered.filter((q) => (q.category || '토목기사') === category);
  }
  if (diff !== 'all') {
    filtered = filtered.filter((q) => q.difficulty === diff);
  }

  if (maxCount > 0) filtered = filtered.slice(0, maxCount);
  return filtered;
}

function startTimer(minutes) {
  if (timerHandle) clearInterval(timerHandle);
  sessionStartAt = Date.now();
  remainingSec = Math.max(1, toInt(minutes, 20)) * 60;
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

function countAnswered() {
  let answered = 0;
  sessionQuestions.forEach((q, idx) => {
    const key = qKeyFor(idx, q);
    if (normalize(answerMeta.get(key) || '')) answered += 1;
  });
  return answered;
}

function evaluateSessionScore() {
  let wrong = 0;
  const wrongByDiff = { easy: 0, normal: 0, hard: 0 };

  sessionQuestions.forEach((q, idx) => {
    const key = qKeyFor(idx, q);
    const user = normalize(answerMeta.get(key) || '');
    const correct = normalize(q.answer || '');
    const isCorrect = !!user && user === correct;

    if (!isCorrect) {
      wrong += 1;
      wrongIds.add(key);
      const d = q.difficulty || 'normal';
      if (wrongByDiff[d] !== undefined) wrongByDiff[d] += 1;
    } else {
      wrongIds.delete(key);
    }
  });

  return {
    total: sessionQuestions.length,
    wrong,
    right: sessionQuestions.length - wrong,
    wrongByDiff
  };
}

function updateStatusAndStats() {
  const answered = countAnswered();
  const total = sessionQuestions.length;
  const { right, wrong } = evaluateSessionScore();
  const percent = total ? Math.round((right / total) * 100) : 0;

  if (isSingleMode()) {
    setStatus(`문항 ${Math.min(currentIndex + 1, total)} / ${total} (답안완료 ${answered}개)`);
  } else {
    setStatus(`문항 ${total} / ${total} (답안완료 ${answered}개)`);
  }

  els.scoreText.textContent = `현재 정답(미응답 감점): ${right} / ${total} (${percent}%), 오답 ${wrong}개`;
}

function renderStats() {
  const { wrongByDiff } = evaluateSessionScore();
  els.statsByDiff.innerHTML = `
    <ul>
      <li>하난도 오답: ${wrongByDiff.easy}</li>
      <li>중난도 오답: ${wrongByDiff.normal}</li>
      <li>상난도 오답: ${wrongByDiff.hard}</li>
    </ul>
  `;
}

function buildWrongMarkdownText() {
  const items = sessionQuestions
    .map((q, idx) => {
      const key = qKeyFor(idx, q);
      if (!wrongIds.has(key)) return null;
      const user = answerMeta.get(key) || '-';
      return `- ${q.id}: ${q.question || '문항 없음'}\n  - 분류: ${q.category || '토목기사'}\n  - 난이도: ${q.difficulty || '-'}\n  - 내 답안: ${user}\n  - 정답: ${q.answer || '-'}\n  - 해설: ${q.explanation || '해설 없음'}`;
    })
    .filter(Boolean);

  return items.join('\n\n') || '오답 없음';
}

function revealWrongPanel() {
  const text = buildWrongMarkdownText();
  els.wrongMarkdown.hidden = false;
  els.wrongMarkdown.textContent = text;
  els.wrongMarkdown.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  return text;
}


function applyGradeVisual(q, key, card, optionsWrap, isCorrect) {
  const picked = answerMeta.get(key) || '';
  if (!isCorrect) card.classList.add('graded-wrong');

  const footer = document.createElement('p');
  const stateClass = isCorrect ? 'okText' : 'badText';
  footer.innerHTML = `<span class="${stateClass}"><strong>${isCorrect ? '정답' : '오답'}</strong></span> : ${q.explanation || '해설 없음'} (정답: ${q.answer})`;
  if (!card.querySelector('.okText, .badText')) card.appendChild(footer);

  if (q.type === 'short') {
    if (!card.querySelector('.short-answer')) {
      const p = document.createElement('p');
      p.className = 'short-answer';
      p.textContent = `정답: ${q.answer}`;
      card.appendChild(p);
    }
  } else {
    [...optionsWrap.querySelectorAll('.option')].forEach((x) => {
      if (normalize(x.textContent) === normalize(q.answer || '')) x.classList.add('correct');
      if (normalize(x.textContent) === normalize(picked) && !isCorrect) x.classList.add('wrong');
    });
  }

  optionsWrap.querySelectorAll('.option, input').forEach((el) => (el.disabled = true));
}

function gradeOne(index, key, q, card, optionsWrap, shouldCheck) {
  const pickedRaw = normalize(answerMeta.get(key) || '');
  const correct = normalize(q.answer || '');
  if (!pickedRaw && shouldCheck) {
    alert('답안을 선택/입력해 주세요.');
    return;
  }

  let isCorrect = false;
  if (shouldCheck) {
    isCorrect = pickedRaw === correct;
    wrongIds.delete(key);
    if (!isCorrect) wrongIds.add(key);
    gradedMeta.set(key, { picked: pickedRaw, isCorrect, byManual: true });
  } else {
    wrongIds.add(key);
    gradedMeta.set(key, { picked: pickedRaw, isCorrect: false, byManual: false });
  }

  applyGradeVisual(q, key, card, optionsWrap, isCorrect);
  persistProgress();
  updateStatusAndStats();
  renderStats();
  syncPresetState();

  if (isSingleMode() && inTest && els.autoNext.checked && index < sessionQuestions.length - 1) {
    setTimeout(() => goNext(), 250);
  }
}

function makeCard(q, index, total) {
  const card = document.createElement('section');
  card.className = 'card';
  const mode = els.viewMode.value;
  const key = qKeyFor(index, q);
  card.dataset.qid = key;

  const h3 = document.createElement('h3');
  h3.textContent = `문항 ${index + 1} / ${total} - ${q.id || 'NoID'} (${q.category || '토목기사'} / ${q.difficulty || '-'})`;

  const qText = document.createElement('p');
  qText.className = 'questionText';
  qText.textContent = q.question || '문항이 없습니다.';

  const mediaWrap = document.createElement('figure');
  mediaWrap.className = 'question-media';

  const qImage = typeof q.image === 'string' ? q.image : (q.media && typeof q.media === 'string' ? q.media : q.image?.src || q.media?.src);
  const qImageAlt = q.image?.alt || q.media?.alt || `${q.id || '문항'} 이미지`;
  const qImageCaption = q.image?.caption || q.media?.caption;

  if (qImage) {
    const img = document.createElement('img');
    img.src = qImage;
    img.alt = qImageAlt;
    img.loading = 'lazy';
    img.decoding = 'async';
    mediaWrap.appendChild(img);
  }

  if (qImageCaption) {
    const figcap = document.createElement('figcaption');
    figcap.textContent = qImageCaption;
    mediaWrap.appendChild(figcap);
  }

  const optionsWrap = document.createElement('div');
  optionsWrap.className = 'options';

  if (q.type === 'short') {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '정답 입력';
    input.value = answerMeta.get(key) || '';
    input.addEventListener('input', () => {
      answerMeta.set(key, input.value);
      persistProgress();
      updateStatusAndStats();
      renderStats();
      syncPresetState();
      renderOmrSheet();
    });
    optionsWrap.appendChild(input);
  } else {
    const opts = Array.isArray(q.options) ? q.options : [];
    opts.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option';
      btn.textContent = opt;
      if (normalize(answerMeta.get(key) || '') === normalize(opt)) btn.classList.add('selected');

      btn.addEventListener('click', () => {
        optionsWrap.querySelectorAll('.option').forEach((x) => x.classList.remove('selected'));
        btn.classList.add('selected');
        answerMeta.set(key, opt);
        persistProgress();
        updateStatusAndStats();
        renderStats();
        syncPresetState();
        renderOmrSheet();
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

  const state = gradedMeta.get(key);
  let answerVisible = isQaMode() || answerVisibleByDefault() || !!state;
  const btnToggle = document.createElement('button');
  btnToggle.type = 'button';
  btnToggle.textContent = answerVisible ? '정답/해설 숨기기' : '정답/해설 보기';

  const answerBlock = document.createElement('div');
  answerBlock.className = 'answerBlock';
  answerBlock.hidden = !answerVisible;
  const ansText = document.createElement('p');
  ansText.className = 'short-answer';
  ansText.textContent = `정답: ${q.answer || '-'}`;
  const expText = document.createElement('p');
  expText.textContent = `해설: ${q.explanation || '해설 없음'}`;
  if (isQaMode() && q.type === 'multiple') {
    answerBlock.append(ansText, expText);
  } else if (isQaMode() || answerVisibleByDefault()) {
    answerBlock.append(ansText, expText);
  } else {
    answerBlock.append(expText);
  }

  btnToggle.addEventListener('click', () => {
    answerVisible = !answerVisible;
    answerBlock.hidden = !answerVisible;
    btnToggle.textContent = answerVisible ? '정답/해설 숨기기' : '정답/해설 보기';
  });

  const btnClear = document.createElement('button');
  btnClear.textContent = '문항초기화';
  btnClear.addEventListener('click', () => {
    answerMeta.delete(key);
    gradedMeta.delete(key);
    wrongIds.delete(key);
    persistProgress();
    renderSession();
    updateStatusAndStats();
    renderStats();
    syncPresetState();
  });

  actions.append(btnCheck, btnReveal, btnToggle, btnClear);

  if (mediaWrap.children.length) {
    card.append(h3, qText, mediaWrap, optionsWrap, actions, answerBlock);
  } else {
    card.append(h3, qText, optionsWrap, actions, answerBlock);
  }

  const cardModeClass = toCardClass();
  if (cardModeClass) card.classList.add(cardModeClass);

  const existing = gradedMeta.get(key);
  if (existing) applyGradeVisual(q, key, card, optionsWrap, existing.isCorrect);

  return card;
}

function renderSingle() {
  if (!sessionQuestions.length) {
    els.quizArea.innerHTML = '<div class="card">문제가 없습니다.</div>';
    els.singleNav.hidden = true;
    if (els.omrPanel) els.omrPanel.hidden = true;
    setStatus('문항 0 / 0');
    return;
  }

  const q = sessionQuestions[currentIndex];
  els.quizArea.innerHTML = '';
  const card = makeCard(q, currentIndex, sessionQuestions.length);
  els.quizArea.appendChild(card);

  if (isOmrMode()) {
    els.singlePos.textContent = `${currentIndex + 1} / ${sessionQuestions.length} (OMR)`;
    els.singleNav.hidden = false;
    if (els.omrPanel) els.omrPanel.hidden = false;
    renderOmrSheet();
  } else {
    els.singlePos.textContent = `${currentIndex + 1} / ${sessionQuestions.length}`;
    if (els.omrPanel) els.omrPanel.hidden = true;
    els.singleNav.hidden = false;
  }

  updateStatusAndStats();
  renderStats();
}

function renderAll() {
  els.quizArea.innerHTML = '';
  sessionQuestions.forEach((q, idx) => {
    const card = makeCard(q, idx, sessionQuestions.length);
    card.classList.add('singleLargeCard');
    if (!answerVisibleByDefault() && !isQaMode()) {
      const block = card.querySelector('.answerBlock');
      if (block) block.hidden = true;
    }
    els.quizArea.appendChild(card);
  });
  if (els.omrPanel) els.omrPanel.hidden = true;
  els.singleNav.hidden = true;
  updateStatusAndStats();
  renderStats();
}

function renderSession() {
  if (isSingleMode()) renderSingle();
  else renderAll();
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
  updateStatusAndStats();
  renderStats();
  els.resultBox.hidden = false;
  els.wrongMarkdown.hidden = true;
  syncPresetState();
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
    answers: Array.from(answerMeta.entries()),
    graded: Array.from(gradedMeta.entries())
  };
  localStorage.setItem(STORAGE.progress, JSON.stringify(state));
}

function restoreProgress() {
  try {
    const raw = localStorage.getItem(STORAGE.progress);
    if (!raw) return;
    const state = JSON.parse(raw);
    if (Array.isArray(state?.answers)) {
      answerMeta = new Map(state.answers);
    }
    if (Array.isArray(state?.graded)) {
      gradedMeta = new Map(state.graded);
    }
  } catch {}
}

function loadJson(rawText) {
  const parsed = JSON.parse(rawText);
  const items = Array.isArray(parsed) ? parsed : parsed.questions;
  if (!Array.isArray(items)) throw new Error('json 형식 오류');

  allQuestions = sanitizeQuestions(items);
  els.jsonInput.value = JSON.stringify(allQuestions, null, 2);
  localStorage.setItem(STORAGE.backup, JSON.stringify(allQuestions));
  applyFiltersAndRender();
}

function computeFinalResult({ auto = false } = {}) {
  stopTimer();
  const { right, total, wrong } = evaluateSessionScore();
  const percent = total ? Math.round((right / total) * 100) : 0;
  const elapsed = sessionStartAt ? Math.max(0, Math.floor((Date.now() - sessionStartAt) / 1000)) : 0;
  const record = {
    at: new Date().toISOString(),
    total,
    right,
    wrong,
    percent,
    elapsedSec: elapsed,
    category: els.examCategory.value,
    difficulty: els.difficultySelect.value,
    mode: els.modeSelect.value,
    viewMode: els.viewMode.value,
    title: getCurrentModeLabel(),
    maxCount: toInt(els.maxCount.value, 0),
    timeLimitMin: toInt(els.timeLimitMin.value, 20)
  };
  if (auto) alert('시간 종료! 자동 채점합니다.');
  saveScoreRecord(record);
  els.scoreText.textContent = `최종 점수: ${right} / ${total} (${percent}%), 오답 ${wrong}개`;
  renderStats();
  revealWrongPanel();
  els.resultBox.hidden = false;
}

function syncPresetState() {
  syncPresetStateForCurrent();
}

function getCurrentCardContext() {
  if (!els.quizArea.children.length) return null;
  return els.quizArea.querySelector('.card');
}

function renderOmrSheet() {
  if (!els.omrGrid) return;
  if (els.viewMode.value !== 'omr') {
    els.omrGrid.innerHTML = '';
    return;
  }

  els.omrGrid.innerHTML = '';
  sessionQuestions.forEach((q, idx) => {
    const key = qKeyFor(idx, q);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'omrCell';
    btn.textContent = `${idx + 1}`;

    const isActive = idx === currentIndex;
    const hasAnswer = answerMeta.has(key);
    const isWrong = wrongIds.has(key);

    if (isActive) btn.classList.add('current');
    if (isWrong) btn.classList.add('wrong');
    else if (hasAnswer) btn.classList.add('answered');

    btn.addEventListener('click', () => {
      currentIndex = idx;
      renderSingle();
    });

    els.omrGrid.appendChild(btn);
  });
}

function saveScoreRecord(row) {
  const list = loadScoreHistory();
  list.unshift(row);
  scoreHistory = list.slice(0, 30);
  localStorage.setItem(STORAGE.scoreHistory, JSON.stringify(scoreHistory));
  renderScoreHistory();
}

function loadScoreHistory() {
  try {
    const raw = localStorage.getItem(STORAGE.scoreHistory);
    scoreHistory = Array.isArray(JSON.parse(raw || '[]')) ? JSON.parse(raw) : [];
  } catch {
    scoreHistory = [];
  }
  return scoreHistory;
}

function renderScoreHistory() {
  if (!els.scoreHistoryWrap) return;
  if (!scoreHistory.length) {
    els.scoreHistoryWrap.innerHTML = '<p class="muted">성적 기록이 없습니다.</p>';
    return;
  }

  const rows = scoreHistory.slice(0, 12).map((r) => {
    const elapsed = r.elapsedSec || 0;
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    const d = r.at ? new Date(r.at).toLocaleString('ko-KR') : '-';
    return `<div class="scoreItem">
      <div><strong>${d}</strong> · ${r.title}</div>
      <div>정답 ${r.right}/${r.total} (${r.percent}%) / 오답 ${r.wrong} / 시간 ${mm}:${ss}</div>
    </div>`;
  }).join('');

  els.scoreHistoryWrap.innerHTML = `<div class="scoreList">${rows}</div>`;
}

function bindKeyboardShortcuts(e) {
  const activeTag = document.activeElement?.tagName?.toLowerCase();
  if (['input', 'textarea', 'select', 'button'].includes(activeTag)) {
    return;
  }

  if (!isSingleMode()) return;
  const card = getCurrentCardContext();
  if (!card) return;

  const key = e.key;
  const options = Array.from(card.querySelectorAll('.option'));

  // 숫자키로 보기 선택(1~9)
  if (/^\d$/.test(key)) {
    const idx = Number(key) - 1;
    if (idx >= 0 && idx < options.length) {
      e.preventDefault();
      options[idx].click();
    }
    return;
  }

  if (key === 'ArrowLeft') {
    e.preventDefault();
    goPrev();
    return;
  }

  if (key === 'ArrowRight') {
    e.preventDefault();
    goNext();
    return;
  }

  if (key === 'Enter') {
    const btnCheck = card.querySelector('button');
    if (!btnCheck) return;
    e.preventDefault();
    btnCheck.click();
  }
}

els.btnApplyPreset.addEventListener('click', () => {
  const key = els.presetSelect.value;
  if (key === 'custom') return;
  applyPreset(key);
  applyFiltersAndRender();
});

els.presetSelect.addEventListener('change', () => {
  const key = els.presetSelect.value;
  if (key === 'custom') return;
  applyPreset(key);
  applyFiltersAndRender();
});

els.btnShuffle.addEventListener('click', () => {
  sessionQuestions = shuffleArray(sessionQuestions);
  currentIndex = 0;
  renderSession();
});

els.btnReset.addEventListener('click', () => {
  applyFiltersAndRender();
});

els.btnStartTest.addEventListener('click', () => {
  if (!sessionQuestions.length) return;
  inTest = true;
  if (els.modeSelect.value !== 'test') {
    const msg = '시험 모드는 시험 모드가 선택되어 있어야 합니다. 모드를 시험 모드로 변경할게요.';
    alert(msg);
    els.modeSelect.value = 'test';
  }
  applyFiltersAndRender();
  inTest = true;
  startTimer(els.timeLimitMin.value || 20);
});

els.btnFinishTest.addEventListener('click', () => computeFinalResult());
els.btnPrev.addEventListener('click', goPrev);
els.btnNext.addEventListener('click', goNext);
els.modeSelect.addEventListener('change', () => {
  if (els.modeSelect.value === 'test') syncPresetState();
  applyFiltersAndRender();
});
els.examCategory.addEventListener('change', () => {
  markPresetCustom();
  applyFiltersAndRender();
});
els.difficultySelect.addEventListener('change', () => {
  markPresetCustom();
  applyFiltersAndRender();
});
els.viewMode.addEventListener('change', () => {
  markPresetCustom();
  renderSession();
});
els.maxCount.addEventListener('change', markPresetCustom);
els.timeLimitMin.addEventListener('change', markPresetCustom);
els.autoNext.addEventListener('change', markPresetCustom);
els.showAnswerToggle.addEventListener('change', () => {
  renderSession();
  renderOmrSheet();
});
els.btnRetryWrong.addEventListener('click', () => {
  if (!wrongIds.size) {
    alert('오답 문제가 없습니다.');
    return;
  }

  const wrong = sessionQuestions.filter((q, idx) => wrongIds.has(qKeyFor(idx, q)));
  if (!wrong.length) {
    alert('오답 문제를 찾지 못했습니다.');
    return;
  }
  sessionQuestions = wrong;
  currentIndex = 0;
  inTest = false;
  renderSession();
  updateStatusAndStats();
  renderStats();
});

els.btnCopyMarkdown.addEventListener('click', async () => {
  const text = revealWrongPanel();
  try {
    await navigator.clipboard.writeText(text);
    alert('오답 내역 복사 완료');
  } catch {
    alert('클립보드 복사 실패. 화면에서 수동 복사해 주세요.');
  }
});

els.btnLoadJson.addEventListener('click', () => {
  try {
    loadJson(els.jsonInput.value);
    alert('문제가 갱신되었습니다.');
  } catch {
    alert('JSON 형식이 잘못되었습니다.');
  }
});

els.fileJson.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  try {
    loadJson(text);
    alert('파일에서 문제를 불러왔습니다.');
  } catch {
    alert('JSON 형식이 잘못되었습니다.');
  }
});

els.btnClearScore.addEventListener('click', () => {
  if (!confirm('성적 기록을 초기화할까요?')) return;
  scoreHistory = [];
  localStorage.removeItem(STORAGE.scoreHistory);
  renderScoreHistory();
});

els.btnSaveToLocal.addEventListener('click', () => {
  localStorage.setItem(STORAGE.backup, JSON.stringify(allQuestions));
  alert('현재 문제를 로컬에 저장했습니다.');
});
els.btnClearLocal.addEventListener('click', () => {
  localStorage.removeItem(STORAGE.backup);
  alert('로컬 백업 삭제');
});

window.addEventListener('DOMContentLoaded', async () => {
  fillPresetOptions();
  const optionCustom = document.createElement('option');
  optionCustom.value = 'custom';
  optionCustom.textContent = '직접설정';
  els.presetSelect.appendChild(optionCustom);

  restoreProgress();
  const backup = localStorage.getItem(STORAGE.backup);
  if (backup) {
    try {
      const parsed = JSON.parse(backup);
      if (Array.isArray(parsed)) allQuestions = sanitizeQuestions(parsed);
      else if (Array.isArray(parsed?.questions)) allQuestions = sanitizeQuestions(parsed.questions);
    } catch {}
  }

  loadPreset();
  loadScoreHistory();
  renderScoreHistory();

  if (!allQuestions.length) await loadDefault();
  else {
    els.jsonInput.value = JSON.stringify(allQuestions, null, 2);
    applyFiltersAndRender();
  }

  updateStatusAndStats();
  renderStats();
  syncPresetState();

  window.addEventListener('keydown', bindKeyboardShortcuts);
});
