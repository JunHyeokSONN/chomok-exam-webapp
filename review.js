const els = {
  queueFile: document.getElementById('queueFile'),
  dataFile: document.getElementById('dataFile'),
  queueFetch: document.getElementById('queueFetch'),
  btnLoadFetch: document.getElementById('btnLoadFetch'),
  statusFilter: document.getElementById('statusFilter'),
  btnApproveAll: document.getElementById('btnApproveAll'),
  btnRejectAll: document.getElementById('btnRejectAll'),
  btnExportQueue: document.getElementById('btnExportQueue'),
  btnExportData: document.getElementById('btnExportData'),
  btnPrevItem: document.getElementById('btnPrevItem'),
  btnNextItem: document.getElementById('btnNextItem'),
  summary: document.getElementById('summary'),
  reviewList: document.getElementById('reviewList'),
  modal: document.getElementById('imgModal'),
  modalImg: document.getElementById('modalImg'),
  modalClose: document.getElementById('modalClose')
};

let queue = null;
let baseData = null;
let activeQueueIdx = -1;

function normalizeQueue(json) {
  const payload = json || {};
  const items = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.questions)
      ? payload.questions.map((question, index) => ({
          queueId: `AUTO_${String(index + 1).padStart(3, '0')}`,
          sourceId: question.id || `AUTO_${String(index + 1).padStart(3, '0')}`,
          status: 'pending',
          question
        }))
      : [];

  return {
    batchId: payload.batchId || `BATCH_${new Date().toISOString().replace(/[T:.]/g, '-').slice(0, 19)}`,
    generatedAt: payload.generatedAt || new Date().toISOString(),
    total: typeof payload.total === 'number' ? payload.total : items.length,
    items
  };
}

function normText(v) {
  return String(v || '').trim();
}

function toOptionText(raw) {
  if (Array.isArray(raw)) return raw.join('\n');
  return normText(raw);
}

function parseOptionLines(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [''];
  return String(raw)
    .split('\n')
    .map((s) => normText(s))
    .filter((s) => s.length > 0);
}

function getQuestionId(q, index) {
  const id = normText(q.id || `Q_${index + 1}`);
  return id || `Q_${index + 1}`;
}

function setActiveByVisibleIndex(idx) {
  if (!queue) return;
  const arr = getVisibleQueueItems();
  if (arr.length === 0) {
    activeQueueIdx = -1;
    return;
  }
  const safe = Math.max(0, Math.min(idx, arr.length - 1));
  activeQueueIdx = arr[safe].index;
  renderQueue();
  const target = document.querySelector(`.reviewCard[data-idx="${activeQueueIdx}"]`);
  target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function getVisibleQueueItems() {
  if (!queue) return [];
  const mode = els.statusFilter.value || 'all';
  return queue.items
    .map((item, idx) => ({ item, index: idx, ...item }))
    .filter(({ status }) => mode === 'all' || (status || 'pending') === mode);
}

function getImageSrc(media) {
  if (!media) return '';
  if (typeof media === 'string') return media;
  if (typeof media === 'object' && media.src) return media.src;
  return '';
}

function renderSummary() {
  if (!queue) {
    els.summary.textContent = '배치 정보가 없습니다.';
    return;
  }

  const statuses = queue.items.reduce(
    (acc, item) => {
      const s = item.status || 'pending';
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    },
    { pending: 0, approved: 0, rejected: 0 }
  );

  els.summary.innerHTML = `
    <strong>배치:</strong> ${normText(queue.batchId)} |
    <strong>생성시각:</strong> ${normText(queue.generatedAt)} |
    <strong>전체:</strong> ${queue.items.length} 건 |
    승인 ${statuses.approved || 0} / 대기 ${statuses.pending || 0} / 반려 ${statuses.rejected || 0}
  `;
}

function applyCardToQueue(queueIdx, refs) {
  const item = queue.items[queueIdx];
  if (!item) return;

  const {
    statusSel,
    idInput,
    typeSel,
    catInput,
    diffSel,
    questionInput,
    optsInput,
    answerInput,
    expInput,
    statusText,
    state
  } = refs;

  item.status = statusSel.value;
  const q = item.question || (item.question = {});
  q.id = normText(idInput.value) || getQuestionId(q, queueIdx);
  q.type = typeSel.value;
  q.category = normText(catInput.value) || '토목기사';
  q.difficulty = diffSel.value || 'normal';
  q.question = questionInput.value || '';
  q.options = parseOptionLines(optsInput.value);
  q.answer = normText(answerInput.value);
  q.explanation = normText(expInput.value) || '해설을 확인해 주세요.';
  item.question = q;

  statusText.textContent = item.status === 'approved' ? '승인' : item.status === 'rejected' ? '반려' : '대기';
  state.dataset.status = item.status;

  renderSummary();
}

function createReviewCard(item, queueIdx, isActive, visibleIndex) {
  const status = item.status || 'pending';
  const q = item.question || {};

  const card = document.createElement('section');
  card.className = 'reviewCard';
  card.dataset.idx = queueIdx;
  card.dataset.visible = visibleIndex;
  card.dataset.active = String(isActive);

  const header = document.createElement('div');
  header.className = 'reviewHeader';

  const left = document.createElement('div');
  left.innerHTML = `<strong>Queue:</strong> ${normText(item.queueId)} / <strong>sourceId:</strong> ${normText(item.sourceId)} / <strong>원본:</strong> ${normText(item.sourcePath || q._sourceId)}`;

  const statusText = document.createElement('span');
  statusText.className = 'reviewStatus';
  statusText.dataset.status = status;
  statusText.textContent = status === 'approved' ? '승인' : status === 'rejected' ? '반려' : '대기';

  header.append(left, statusText);

  const media = document.createElement('figure');
  media.className = 'miniFigure';

  const mediaSrc = getImageSrc(q.media);
  if (mediaSrc) {
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = mediaSrc;
    img.alt = normText(q.id || item.sourceId || `문제 ${queueIdx + 1} 이미지`);
    img.addEventListener('click', () => openModal(mediaSrc));
    media.appendChild(img);
    card.appendChild(media);
  }

  const field = document.createElement('div');
  field.className = 'fieldGrid';

  const mk = (label, el) => {
    const wrap = document.createElement('label');
    wrap.textContent = label;
    wrap.appendChild(el);
    return wrap;
  };

  const statusSel = document.createElement('select');
  [['pending', '대기'], ['approved', '승인'], ['rejected', '반려']].forEach(([v, t]) => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = t;
    if ((item.status || 'pending') === v) o.selected = true;
    statusSel.appendChild(o);
  });

  const idInput = document.createElement('input');
  idInput.value = normText(q.id || getQuestionId(q, queueIdx));

  const typeSel = document.createElement('select');
  ['multiple', 'short', 'truefalse'].forEach((t) => {
    const o = document.createElement('option');
    o.value = t;
    o.textContent = t;
    if ((q.type || 'multiple') === t) o.selected = true;
    typeSel.appendChild(o);
  });

  const catInput = document.createElement('input');
  catInput.value = normText(q.category || '토목기사');

  const diffSel = document.createElement('select');
  ['easy', 'normal', 'hard'].forEach((d) => {
    const o = document.createElement('option');
    o.value = d;
    o.textContent = d;
    if ((q.difficulty || 'normal') === d) o.selected = true;
    diffSel.appendChild(o);
  });

  const questionInput = document.createElement('textarea');
  questionInput.rows = 3;
  questionInput.value = normText(q.question);

  const optsInput = document.createElement('textarea');
  optsInput.rows = 4;
  optsInput.value = toOptionText(Array.isArray(q.options) ? q.options : []);

  const answerInput = document.createElement('input');
  answerInput.value = normText(q.answer);

  const expInput = document.createElement('textarea');
  expInput.rows = 3;
  expInput.value = normText(q.explanation || '해설을 확인해 주세요.');

  const meta = item.ocr || item._ocrMeta || {};
  const metaBox = document.createElement('details');
  const metaSummary = document.createElement('summary');
  metaSummary.textContent = 'OCR 메타/원문 보기';
  const metaPre = document.createElement('pre');
  metaPre.textContent = JSON.stringify(
    {
      engine: meta.engine || '-',
      profile: meta.profile || '-',
      psm: meta.psm || '-',
      transform: meta.transform || '-',
      score: meta.score || '-',
      source: item.sourceId || '-',
      raw: meta.raw || q._ocrRaw || '-'
    },
    null,
    2
  );
  metaBox.append(metaSummary, metaPre);

  const saveBtn = document.createElement('button');
  saveBtn.textContent = '현재 항목 적용';
  saveBtn.type = 'button';

  const refs = { statusSel, statusText, idInput, typeSel, catInput, diffSel, questionInput, optsInput, answerInput, expInput, state: statusText };
  saveBtn.addEventListener('click', () => {
    applyCardToQueue(queueIdx, refs);
  });

  card.addEventListener('click', () => {
    activeQueueIdx = queueIdx;
    renderQueue();
  });

  field.append(
    mk('상태', statusSel),
    mk('문항 ID', idInput),
    mk('문항 유형', typeSel),
    mk('출제분류', catInput),
    mk('난이도', diffSel),
    mk('문항 텍스트', questionInput),
    mk('보기 입력 (한 줄=1개)', optsInput),
    mk('정답', answerInput),
    mk('해설', expInput),
    saveBtn,
    metaBox
  );

  card.append(header, field);
  return card;
}

function renderQueue() {
  if (!queue) return;
  els.reviewList.innerHTML = '';

  const visible = getVisibleQueueItems();

  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'reviewCard';
    empty.textContent = '표시할 항목이 없습니다.';
    els.reviewList.appendChild(empty);
    renderSummary();
    return;
  }

  if (activeQueueIdx < 0 || !queue.items[activeQueueIdx]) {
    activeQueueIdx = visible[0].index;
  }

  visible.forEach(({ item, index }, visibleIndex) => {
    const isActive = index === activeQueueIdx;
    const card = createReviewCard(item, index, isActive, visibleIndex);
    els.reviewList.appendChild(card);
  });

  renderSummary();
}

function buildExportQueue() {
  if (!queue) throw new Error('큐가 없습니다.');
  return {
    batchId: queue.batchId,
    generatedAt: queue.generatedAt,
    total: queue.items.length,
    items: queue.items
  };
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ensureQuestionHasId(q, idx) {
  if (String(q.id || '').trim()) return;
  q.id = `R${String(idx + 1).padStart(3, '0')}`;
}

function mergeApprovedData(data, queueItems) {
  const merged = Array.isArray(data?.questions) ? [...data.questions] : Array.isArray(data) ? [...data] : [];
  const used = new Set(merged.map((q) => String(q.id || '')));

  let idx = 0;
  queueItems.forEach((item) => {
    if ((item.status || 'pending') !== 'approved') return;
    const q = { ...(item.question || {}) };
    if (!q.id) q.id = `R${String(++idx).padStart(3, '0')}`;
    if (used.has(q.id)) {
      let n = 2;
      const base = q.id;
      while (used.has(`${base}_${n}`)) n += 1;
      q.id = `${base}_${n}`;
    }
    ensureQuestionHasId(q, merged.length + idx);
    used.add(q.id);

    if (!q.category) q.category = '토목기사';
    if (!q.difficulty) q.difficulty = 'normal';
    if (!q.type) q.type = 'multiple';
    if (!Array.isArray(q.options)) q.options = ['1', '2', '3', '4'];

    merged.push(q);
  });

  return { questions: merged };
}

function openModal(src) {
  if (!src) return;
  els.modalImg.src = src;
  els.modal.classList.add('open');
  els.modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  els.modal.classList.remove('open');
  els.modal.setAttribute('aria-hidden', 'true');
  els.modalImg.removeAttribute('src');
}

function saveActiveAndMaybeMove(step) {
  if (activeQueueIdx < 0 || !queue) return;
  const item = queue.items[activeQueueIdx];
  if (!item) return;

  const card = document.querySelector(`.reviewCard[data-idx="${activeQueueIdx}"]`);
  if (!card) return;

  const all = card.querySelectorAll('select, input, textarea, button');
  const controls = Array.from(all);
  const refs = {
    statusSel: controls.find((c) => c.tagName === 'SELECT' && c.previousSibling?.textContent === '상태') || card.querySelector('select'),
    statusText: card.querySelector('.reviewStatus'),
    idInput: Array.from(card.querySelectorAll('input')).find((el) => el.previousSibling?.textContent === '문항 ID') || card.querySelector('input'),
    typeSel: card.querySelectorAll('select')[1] || card.querySelector('select'),
    catInput: Array.from(card.querySelectorAll('input'))[1],
    diffSel: card.querySelectorAll('select')[2],
    questionInput: card.querySelector('textarea'),
    optsInput: card.querySelectorAll('textarea')[1],
    answerInput: Array.from(card.querySelectorAll('input')).find((el) => el !== card.querySelector('input') && !Number.isNaN(Number(el.value))) || card.querySelectorAll('input')[1],
    expInput: card.querySelectorAll('textarea')[2]
  };
  applyCardToQueue(activeQueueIdx, {
    statusSel: item.status ? refs.statusSel : (card.querySelectorAll('select')[0] || card.querySelector('select')),
    statusText: refs.statusText,
    idInput: refs.idInput,
    typeSel: refs.typeSel,
    catInput: refs.catInput,
    diffSel: refs.diffSel,
    questionInput: refs.questionInput,
    optsInput: refs.optsInput,
    answerInput: refs.answerInput,
    expInput: refs.expInput
  });

  const visible = getVisibleQueueItems();
  const activePosition = visible.findIndex((v) => v.index === activeQueueIdx);
  if (activePosition === -1) return;
  let nextPos = activePosition + step;
  if (nextPos < 0) nextPos = 0;
  if (nextPos > visible.length - 1) nextPos = visible.length - 1;
  activeQueueIdx = visible[nextPos].index;
  renderQueue();
}

function setStatusForActive(nextStatus) {
  if (!queue || activeQueueIdx < 0) return;
  const item = queue.items[activeQueueIdx];
  if (!item) return;
  item.status = nextStatus;

  const card = document.querySelector(`.reviewCard[data-idx="${activeQueueIdx}"]`);
  if (card) {
    const statusSel = card.querySelector('select');
    const statusText = card.querySelector('.reviewStatus');
    if (statusSel) statusSel.value = nextStatus;
    if (statusText) {
      statusText.dataset.status = nextStatus;
      statusText.textContent = nextStatus === 'approved' ? '승인' : nextStatus === 'rejected' ? '반려' : '대기';
    }
  }
  renderSummary();
}

function bindKeyboardShortcuts(e) {
  if (!queue || queue.items.length === 0) return;

  const tag = e.target?.tagName?.toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag)) return;

  if (e.key === ']' || e.key === 'ArrowRight') {
    e.preventDefault();
    saveActiveAndMaybeMove(1);
    return;
  }
  if (e.key === '[' || e.key === 'ArrowLeft') {
    e.preventDefault();
    saveActiveAndMaybeMove(-1);
    return;
  }

  if (e.key === '1') {
    e.preventDefault();
    setStatusForActive('approved');
    return;
  }

  if (e.key === '0') {
    e.preventDefault();
    setStatusForActive('rejected');
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    const card = document.querySelector(`.reviewCard[data-idx="${activeQueueIdx}"]`);
    const save = card?.querySelector('button');
    save?.click();
    return;
  }

  if (e.key.toLowerCase() === 'n') {
    e.preventDefault();
    const card = document.querySelector(`.reviewCard[data-idx="${activeQueueIdx}"]`);
    const save = card?.querySelector('button');
    save?.click();
    saveActiveAndMaybeMove(1);
  }
}

async function readJsonFromFile(file) {
  const text = await file.text();
  return JSON.parse(text);
}

async function loadQueueFromPath(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`큐 로드 실패: ${path}`);
  const data = await res.json();
  queue = normalizeQueue(data);
  queue.items = queue.items.map((item) => ({ status: 'pending', ...item }));
  activeQueueIdx = -1;
  renderSummary();
  renderQueue();
}

function bindEvents() {
  els.queueFile.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await readJsonFromFile(file);
      queue = normalizeQueue(data);
      queue.items = queue.items.map((item) => ({ status: 'pending', ...item }));
      activeQueueIdx = -1;
      renderSummary();
      renderQueue();
      els.queueFile.value = '';
    } catch {
      alert('큐 파일 형식이 잘못되었습니다.');
    }
  });

  els.dataFile.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      baseData = await readJsonFromFile(file);
      alert('data.json 로드 완료');
      els.dataFile.value = '';
    } catch {
      alert('data.json 형식이 잘못되었습니다.');
    }
  });

  els.btnLoadFetch.addEventListener('click', async () => {
    const target = els.queueFetch.value;
    try {
      await loadQueueFromPath(target);
    } catch (err) {
      alert(String(err.message || err));
    }
  });

  els.statusFilter.addEventListener('change', () => {
    activeQueueIdx = -1;
    renderQueue();
  });

  els.btnApproveAll.addEventListener('click', () => {
    if (!queue?.items?.length) return;
    queue.items.forEach((item) => {
      if (!item.status || item.status === 'pending') item.status = 'approved';
    });
    renderQueue();
  });

  els.btnRejectAll.addEventListener('click', () => {
    if (!queue?.items?.length) return;
    queue.items.forEach((item) => {
      if (!item.status || item.status === 'pending') item.status = 'rejected';
    });
    renderQueue();
  });

  els.btnExportQueue.addEventListener('click', () => {
    if (!queue) return alert('큐가 없습니다.');
    const payload = buildExportQueue();
    downloadJson(`review-export-${Date.now()}.json`, payload);
  });

  els.btnExportData.addEventListener('click', async () => {
    if (!queue) return alert('큐가 없습니다.');

    if (!baseData) {
      try {
        const res = await fetch('data.json');
        baseData = await res.json();
      } catch {
        baseData = { questions: [] };
      }
    }

    const approved = queue.items.filter((item) => (item.status || 'pending') === 'approved');
    if (!approved.length && !confirm('승인 건이 없습니다. 계속 진행할까요?')) return;

    const merged = mergeApprovedData(baseData, queue.items);
    downloadJson(`data-merged-${Date.now()}.json`, merged);
    alert(`병합 파일 생성 완료: 승인 ${approved.length}건, 총 ${merged.questions.length}문항`);
  });

  els.btnPrevItem.addEventListener('click', () => saveActiveAndMaybeMove(-1));
  els.btnNextItem.addEventListener('click', () => saveActiveAndMaybeMove(1));

  els.modalClose.addEventListener('click', closeModal);
  els.modal.addEventListener('click', (e) => {
    if (e.target === els.modal) closeModal();
  });

  window.addEventListener('keydown', bindKeyboardShortcuts);
}

(async () => {
  bindEvents();
  try {
    await loadQueueFromPath('templates/review-queue.json');
  } catch {
    renderSummary();
  }
})();
