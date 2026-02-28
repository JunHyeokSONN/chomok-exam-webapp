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
  summary: document.getElementById('summary'),
  reviewList: document.getElementById('reviewList')
};

let queue = null;
let baseData = null;

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
    batchId: payload.batchId || 'UNKNOWN',
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

function createReviewCard(item, idx) {
  const status = item.status || 'pending';
  const q = item.question || {};

  const card = document.createElement('section');
  card.className = 'reviewCard';
  card.dataset.idx = idx;

  const header = document.createElement('div');
  header.className = 'reviewHeader';

  const left = document.createElement('div');
  left.innerHTML = `<strong>Queue:</strong> ${normText(item.queueId)} / <strong>sourceId:</strong> ${normText(item.sourceId)} / <strong>원본:</strong> ${normText(item.sourceId)}`;

  const state = document.createElement('span');
  state.className = 'reviewStatus';
  state.dataset.status = status;
  state.textContent = status === 'approved' ? '승인' : status === 'rejected' ? '반려' : '대기';

  header.append(left, state);

  const media = document.createElement('figure');
  media.className = 'miniFigure';

  const mediaSrc = q.media || item.question?.media || '';
  const hasMedia = Boolean(mediaSrc);
  if (hasMedia) {
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = typeof mediaSrc === 'string' ? mediaSrc : mediaSrc.src;
    img.alt = normText(typeof mediaSrc === 'string' ? `${q.id || idx + 1} 이미지` : mediaSrc.alt);
    media.appendChild(img);
    card.appendChild(media);
  }

  const field = document.createElement('div');
  field.className = 'fieldGrid';

  const makeLabelInput = (label, element) => {
    const wrap = document.createElement('label');
    wrap.textContent = label;
    wrap.appendChild(element);
    return wrap;
  };

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

  const statusSel = document.createElement('select');
  ['pending', 'approved', 'rejected'].forEach((s) => {
    const o = document.createElement('option');
    o.value = s;
    o.textContent = s === 'approved' ? '승인' : s === 'rejected' ? '반려' : '대기';
    if (status === s) o.selected = true;
    statusSel.appendChild(o);
  });

  const meta = item.ocr || {};
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

  saveBtn.addEventListener('click', () => {
    item.status = statusSel.value;
    q.type = typeSel.value;
    q.category = catInput.value || '토목기사';
    q.difficulty = diffSel.value || 'normal';
    q.question = questionInput.value || ''; 
    q.options = parseOptionLines(optsInput.value);
    q.answer = answerInput.value || '';
    q.explanation = expInput.value || '해설을 확인해 주세요.';

    item.question = q;
    state.dataset.status = item.status;
    state.textContent = item.status === 'approved' ? '승인' : item.status === 'rejected' ? '반려' : '대기';
    if (!item.reviewComment) item.reviewComment = '';

    renderSummary();
    renderQueue(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const applyDefault = () => {
    q.id = q.id || getQuestionId(q, idx);
    if (q.id && !q.id.includes('AUTO')) {
      return;
    }
    if (!q.id) {
      q.id = getQuestionId(q, idx);
    }
  };

  applyDefault();

  const idInput = document.createElement('input');
  idInput.value = q.id || '';
  idInput.addEventListener('input', () => {
    q.id = idInput.value;
  });

  field.append(
    makeLabelInput('상태', statusSel),
    makeLabelInput('문항 ID', idInput),
    makeLabelInput('문항 유형', typeSel),
    makeLabelInput('출제분류', catInput),
    makeLabelInput('난이도', diffSel),
    makeLabelInput('문항 텍스트', questionInput),
    makeLabelInput('보기 입력 (한 줄=1개)', optsInput),
    makeLabelInput('정답', answerInput),
    makeLabelInput('해설', expInput),
    saveBtn,
    metaBox
  );

  card.append(header, field);
  return card;
}

function renderQueue(doFilter = true) {
  if (!queue) return;
  els.reviewList.innerHTML = '';

  const filter = doFilter ? (els.statusFilter.value || 'all') : 'all';

  const filtered = queue.items.filter((item) => filter === 'all' || (item.status || 'pending') === filter);
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'reviewCard';
    empty.textContent = '표시할 항목이 없습니다.';
    els.reviewList.appendChild(empty);
    return;
  }

  filtered.forEach((item, idx) => {
    const card = createReviewCard(item, idx);
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

    if (!q.id) {
      q.id = `R${String(++idx).padStart(3, '0')}`;
    }
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
    if (!Array.isArray(q.options)) q.options = Array.isArray(q.options) ? q.options : ['1', '2', '3', '4'];

    merged.push(q);
  });

  return { questions: merged };
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
  renderSummary();
  renderQueue(false);
}

function bindEvents() {
  els.queueFile.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await readJsonFromFile(file);
      queue = normalizeQueue(data);
      queue.items = queue.items.map((item) => ({ status: 'pending', ...item }));
      renderSummary();
      renderQueue(false);
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

  els.statusFilter.addEventListener('change', () => renderQueue(false));

  els.btnApproveAll.addEventListener('click', () => {
    if (!queue?.items?.length) return;
    queue.items.forEach((item) => {
      if (!item.status || item.status === 'pending') item.status = 'approved';
    });
    renderQueue(false);
  });

  els.btnRejectAll.addEventListener('click', () => {
    if (!queue?.items?.length) return;
    queue.items.forEach((item) => {
      if (!item.status || item.status === 'pending') item.status = 'rejected';
    });
    renderQueue(false);
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
    if (!approved.length) {
      if (!confirm('승인 건이 없습니다. 계속 진행할까요?')) return;
    }

    const merged = mergeApprovedData(baseData, queue.items);
    downloadJson(`data-merged-${Date.now()}.json`, merged);
    alert(`병합 파일 생성 완료: 승인 ${approved.length}건, 총 ${merged.questions.length}문항`);
  });
}

(async () => {
  bindEvents();
  try {
    await loadQueueFromPath('templates/review-queue.json');
  } catch {
    renderSummary();
  }
})();
