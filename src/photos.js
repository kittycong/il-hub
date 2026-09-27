/* ================= 단계별 사진 (이 기기 IndexedDB에만 저장) ================= */
const PH = {db: null, map: {}, ready: false, count: 0};
const phKey = (sop, k) => sop + '|' + k;
function phOpen() {
  return new Promise(res => {
    try {
      const rq = indexedDB.open('il-hub-photos', 1);
      rq.onupgradeneeded = () => { const s = rq.result.createObjectStore('p', {keyPath: 'id'}); s.createIndex('key', 'key'); };
      rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null);
    } catch (e) { res(null); }
  });
}
function phTx(mode, fn) {
  return new Promise(res => {
    if (!PH.db) { res(null); return; }
    try { const tx = PH.db.transaction('p', mode), st = tx.objectStore('p'); const r = fn(st); tx.oncomplete = () => res(r && r.result !== undefined ? r.result : true); tx.onerror = () => res(null); }
    catch (e) { res(null); }
  });
}
async function loadPhotos() {
  PH.db = PH.db || await phOpen();
  const all = (await phTx('readonly', st => st.getAll())) || [];
  PH.map = {}; all.sort((a, b) => (a.ord || 0) - (b.ord || 0)).forEach(p => (PH.map[p.key] ||= []).push(p));
  PH.count = all.length; PH.ready = true;
}
function photosOf(sop, k) { return PH.map[phKey(sop, k)] || []; }
function photosOfSop(sop) { return Object.entries(PH.map).filter(([key]) => key.startsWith(sop + '|')).reduce((a, [, v]) => a + v.length, 0); }
async function photoAdd(sop, k, data, cap = '', src = '직접 추가') {
  const p = {id: uid() + Date.now().toString(36), key: phKey(sop, k), sop, k, data, cap, src, ord: Date.now()};
  if (!PH.db) { (PH.map[p.key] ||= []).push(p); PH.count++; toast('이 브라우저는 사진 저장이 막혀 있어요. 새로고침하면 사라져요'); return p; }
  await phTx('readwrite', st => st.put(p)); await loadPhotos(); return p;
}
async function photoUpdate(p) { await phTx('readwrite', st => st.put(p)); await loadPhotos(); }
async function photoDel(id) { await phTx('readwrite', st => st.delete(id)); await loadPhotos(); }
async function photoClear() { await phTx('readwrite', st => st.clear()); await loadPhotos(); }

/* 큰 사진은 줄여서 저장 (긴 변 1600px, JPEG) */
function shrinkImage(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => { const im = new Image(); im.onload = () => {
      const m = 1600, r = Math.min(1, m / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * r); c.height = Math.round(im.height * r);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', 0.84)); }; im.onerror = rej; im.src = fr.result; };
    fr.onerror = rej; fr.readAsDataURL(file);
  });
}

/* 사진 팩: {type:'il-hub-photos', items:[{sop,k,cap,src,data}]} */
async function importPack(txt) {
  let d; try { d = typeof txt === 'string' ? JSON.parse(txt) : txt; } catch (e) { toast('사진 팩 형식이 아니에요'); return 0; }
  if (!d || d.type !== 'il-hub-photos' || !Array.isArray(d.items)) { toast('사진 팩 형식이 아니에요'); return 0; }
  if (!PH.db) { toast('이 브라우저는 사진 저장이 막혀 있어요 (GitHub 배포본에서 해 주세요)'); return 0; }
  const have = new Set(Object.values(PH.map).flat().map(p => p.key + '#' + p.data.length + '#' + p.data.slice(-40)));
  let n = 0, ord = Date.now();
  await phTx('readwrite', st => { d.items.forEach(it => { if (!it.sop || it.k == null || !/^data:image\//.test(it.data || '')) return;
    const key = phKey(it.sop, it.k); if (have.has(key + '#' + it.data.length + '#' + it.data.slice(-40))) return;
    st.put({id: uid() + (ord++).toString(36), key, sop: it.sop, k: String(it.k), data: it.data, cap: it.cap || '', src: it.src || '사진 팩', ord}); n++; }); });
  await loadPhotos(); return n;
}
function exportPack() {
  const items = Object.values(PH.map).flat().map(({sop, k, cap, src, data}) => ({sop, k, cap, src, data}));
  return JSON.stringify({type: 'il-hub-photos', v: 1, made: ymd(today()), note: '업무 단계 사진. 공개 저장소에 올리지 마세요.', items});
}
function pickPackFile(after) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.hidden = true; document.body.appendChild(inp);
  inp.onchange = () => { const f = inp.files[0]; inp.remove(); if (!f) return; const r = new FileReader();
    r.onload = async () => { const n = await importPack(r.result); if (n || n === 0) { toast(n ? `사진 ${n}장을 넣었어요` : '새로 넣을 사진이 없어요 (이미 들어 있음)'); after && after(); } };
    r.readAsText(f); };
  inp.click();
}

/* 크게 보기 */
function lightbox(list, i = 0) {
  const L = document.createElement('div'); L.className = 'lb'; L.setAttribute('role', 'dialog'); L.setAttribute('aria-modal', 'true');
  const draw = () => { const p = list[i];
    L.innerHTML = `<div class="lb-bar"><span class="small">${list.length > 1 ? `${i + 1}/${list.length} · ` : ''}${esc(p.cap || '')}</span><span class="grow"></span><span class="faint small">누르면 확대</span><button class="btn sm" data-x>닫기</button></div>
      <div class="lb-body"><img src="${p.data}" alt="${esc(p.cap || '단계 사진')}"></div>
      ${list.length > 1 ? `<button class="lb-nav l" data-p aria-label="이전 사진">${icon('left')}</button><button class="lb-nav r" data-n aria-label="다음 사진">${icon('right')}</button>` : ''}`; };
  const close = () => { L.remove(); document.removeEventListener('keydown', key, true); };
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } else if (e.key === 'ArrowRight' && list.length > 1) { i = (i + 1) % list.length; draw(); } else if (e.key === 'ArrowLeft' && list.length > 1) { i = (i - 1 + list.length) % list.length; draw(); } };
  L.addEventListener('click', e => {
    if (e.target.closest('[data-x]') || e.target === L) return close();
    if (e.target.closest('[data-n]')) { i = (i + 1) % list.length; return draw(); }
    if (e.target.closest('[data-p]')) { i = (i - 1 + list.length) % list.length; return draw(); }
    if (e.target.tagName === 'IMG') L.classList.toggle('zoom');
  });
  document.addEventListener('keydown', key, true); draw(); document.body.appendChild(L);
}

/* 단계 사진 관리 시트 */
function stepPhotos(s, k, text, after) {
  const draw = el => {
    const list = photosOf(s.id, k);
    $('#sp-list', el).innerHTML = list.length ? list.map((p, i) => `<div class="sp-item"><img src="${p.data}" data-view="${i}" alt="">
      <input class="inp" data-cap="${p.id}" value="${esc(p.cap || '')}" placeholder="설명 (예: 빨간 네모 칸 수정)"><div class="row small" style="gap:6px"><span class="faint grow">${esc(p.src || '')}</span><button class="btn ghost sm" data-del="${p.id}">삭제</button></div></div>`).join('')
      : '<div class="empty">아직 사진이 없어요</div>';
  };
  sheet({title: '단계 사진', wide: true, body: `
    <div class="small"><b>${esc(s.title)}</b> · ${esc(text)}</div>
    <div id="sp-list" class="sp-grid"></div>
    <div class="drop" id="sp-drop" tabindex="0">${icon('plus')}<div><b>사진 추가</b> — 눌러서 고르기 (휴대폰은 카메라 가능)<br><span class="faint small">PC: 화면 캡처(Win+Shift+S) 후 여기를 누르고 Ctrl+V</span></div></div>
    <input type="file" id="sp-file" accept="image/*" multiple hidden>
    <div class="note small">사진은 <b>이 기기 브라우저에만</b> 저장되고 GitHub(공개 사이트)에는 올라가지 않아요. 계좌번호·주민번호가 보이는 화면은 가리고 찍어 주세요.</div>`,
    foot: `<button class="btn" data-close>닫기</button>`,
    onMount: el => {
      draw(el);
      const add = async files => { let n = 0; for (const f of files) { if (!/^image\//.test(f.type)) continue; try { await photoAdd(s.id, k, await shrinkImage(f)); n++; } catch (e) {} }
        if (n) { toast(`사진 ${n}장을 넣었어요`); draw(el); after && after(); } };
      $('#sp-drop', el).onclick = () => $('#sp-file', el).click();
      $('#sp-drop', el).onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#sp-file', el).click(); } };
      $('#sp-file', el).onchange = e => add([...e.target.files]);
      const dz = $('#sp-drop', el);
      dz.ondragover = e => { e.preventDefault(); dz.classList.add('on'); }; dz.ondragleave = () => dz.classList.remove('on');
      dz.ondrop = e => { e.preventDefault(); dz.classList.remove('on'); add([...e.dataTransfer.files]); };
      el.addEventListener('paste', e => { const fs = [...(e.clipboardData?.items || [])].filter(x => x.kind === 'file').map(x => x.getAsFile()).filter(Boolean); if (fs.length) { e.preventDefault(); add(fs); } });
      el.addEventListener('click', async e => {
        const v = e.target.closest('[data-view]'); if (v) return lightbox(photosOf(s.id, k), Number(v.dataset.view));
        const d = e.target.closest('[data-del]'); if (!d) return;
        if (!d.dataset.armed) { d.dataset.armed = 1; d.textContent = '한 번 더'; return; }
        await photoDel(d.dataset.del); draw(el); after && after(); toast('사진을 지웠어요');
      });
      el.addEventListener('change', async e => { const c = e.target.closest('[data-cap]'); if (!c) return; const p = photosOf(s.id, k).find(x => x.id === c.dataset.cap); if (p) { p.cap = c.value.trim(); await photoUpdate(p); toast('설명을 저장했어요'); } });
    }});
}

/* 단계 문장에 나오는 파일 위치 찾기 (경로 이름의 핵심 단어로) */
function stepPathHits(s, text) {
  const generic = ['엑셀', '파일', '폴더', '서식', '자료', '위치'];
  return (s.paths || []).filter(([l]) => { const w = l.replace(/\(.*?\)/g, '').split(/[\s·]+/).filter(x => x.length >= 2 && !generic.includes(x));
    if (!w.length) return false; const best = w.reduce((a, b) => b.length >= a.length ? b : a); return text.includes(best); });
}

/* 한 단계씩 실행 모드 */
function runMode(s, start = 0) {
  const st = hoState(), steps = s.sections.flatMap((sec, si) => sec.steps.map((t, i) => ({t, k: `${si}.${i}`, sec, si})));
  if (!steps.length) return;
  const r0 = hoRun(s); let i = start || Math.max(0, steps.findIndex(x => !r0.arr[x.k])); if (i < 0) i = 0;
  const L = document.createElement('div'); L.className = 'run'; L.setAttribute('role', 'dialog'); L.setAttribute('aria-modal', 'true'); L.setAttribute('aria-label', s.title + ' 실행');
  const done = () => hoRun(s).arr;
  const draw = () => {
    const x = steps[i], arr = done(), n = steps.filter(y => arr[y.k]).length, ph = photosOf(s.id, x.k), hits = stepPathHits(s, x.t), on = !!arr[x.k];
    L.innerHTML = `
      <div class="run-top"><div style="min-width:0"><div class="faint small">${esc(s.title)} · ${esc(hoPeriod(s))}</div><b>${esc(x.sec.h)}</b></div><span class="grow"></span><span class="num small">${n}/${steps.length}</span><button class="btn sm" data-x>닫기</button></div>
      <div class="prog" style="margin:0 16px"><i style="width:${n / steps.length * 100}%"></i></div>
      <div class="run-body">
        <div class="run-no">단계 ${i + 1} / ${steps.length}${on ? ' · <span class="chip ok">완료</span>' : ''}</div>
        <div class="run-tx">${esc(x.t)}</div>
        ${hits.length ? `<div class="row" style="gap:6px">${hits.map(([l, p]) => `<button class="chip acc" data-cp="${esc(fullPath(p))}" title="${esc(fullPath(p))}" style="cursor:pointer;border:0">${icon('copy')}${esc(l)} 경로 복사</button>`).join('')}</div>` : ''}
        ${ph.length ? `<div class="run-ph">${ph.map((p, j) => `<figure><img src="${p.data}" data-view="${j}" alt="${esc(p.cap || '')}">${p.cap ? `<figcaption class="small muted">${esc(p.cap)}</figcaption>` : ''}</figure>`).join('')}</div>` : `<button class="btn ghost sm" data-addph style="align-self:flex-start">${icon('plus')}이 단계 사진 추가</button>`}
        ${x.si !== (steps[i - 1] || {}).si || i === 0 ? (x.sec.warn || []).map(w => `<div class="note warn small">주의 · ${esc(w)}</div>`).join('') : (x.sec.warn || []).length ? `<div class="faint small">이 묶음 주의사항 ${x.sec.warn.length}개 (첫 단계에 표시)</div>` : ''}
      </div>
      <div class="run-foot"><button class="btn" data-prev ${i ? '' : 'disabled'}>${icon('left')}이전</button><span class="grow"></span>
        <button class="btn" data-skip>${i < steps.length - 1 ? '건너뛰기' : '끝'}</button>
        <button class="btn primary" data-ok>${on ? '완료 취소' : (i < steps.length - 1 ? '완료 → 다음' : '완료')}</button></div>`;
  };
  const close = () => { L.remove(); document.removeEventListener('keydown', key, true); render(); };
  const toggle = () => { const x = steps[i]; const arr = st.checks[r0.key] = Object.assign({}, st.checks[r0.key]); arr[x.k] = !arr[x.k];
    if (arr[x.k]) { st.log = st.log || {}; const d = ymd(today()); st.log[d] = [...new Set([...(st.log[d] || []), s.title])]; } save(); return arr[x.k]; };
  const next = () => { if (i < steps.length - 1) { i++; draw(); L.querySelector('.run-body').scrollTop = 0; } else { toast(`${s.title} ${Object.values(done()).filter(Boolean).length}/${steps.length} 단계`); close(); } };
  const key = e => { if (document.querySelector('.lb') || $('#layer').innerHTML) return; if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (e.key === 'ArrowRight') { i < steps.length - 1 && (i++, draw()); } else if (e.key === 'ArrowLeft') { i > 0 && (i--, draw()); }
    else if (e.key === 'Enter' && !e.target.closest('input,textarea,button')) { e.preventDefault(); toggle() ? next() : draw(); } };
  L.addEventListener('click', e => {
    if (e.target.closest('[data-x]')) return close();
    if (e.target.closest('[data-prev]')) { if (i) { i--; draw(); } return; }
    if (e.target.closest('[data-skip]')) return next();
    if (e.target.closest('[data-ok]')) { toggle() ? next() : draw(); return; }
    const v = e.target.closest('[data-view]'); if (v) return lightbox(photosOf(s.id, steps[i].k), Number(v.dataset.view));
    const cp = e.target.closest('[data-cp]'); if (cp) return copyText(cp.dataset.cp, '경로를 복사했어요');
    if (e.target.closest('[data-addph]')) stepPhotos(s, steps[i].k, steps[i].t, () => draw());
  });
  document.addEventListener('keydown', key, true); draw(); document.body.appendChild(L);
}
