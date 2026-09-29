/* ================= 자료함 (컴퓨터 폴더에 카테고리별로 정리) =================
   - 파일 본체는 사용자가 지정한 컴퓨터 폴더에만 저장돼요. 공개 사이트·클라우드로는 올라가지 않아요.
   - 클라우드에는 '목록(파일명·분류·메모)'만 동기화돼서 다른 PC에서도 목록은 보여요.
   - 폴더 구조: 지정폴더 / 카테고리 / 연도 / 날짜_파일명
   - Chrome·Edge(PC)에서 동작. 폴더 권한은 브라우저를 다시 열면 한 번 더 눌러 허용해야 해요.            */
const FL_CATS = ['회계·예산', '인사·급여', '공문·기안', '지도점검·외부평가', '후원·모금', '시설·차량·물품', '회의·행사', '기타'];
const FL = {handle: null, perm: false, q: '', cat: '', ready: false};
function fl() { S.files ||= {cats: [], items: []}; S.files.cats ||= []; S.files.items ||= []; return S.files; }
function flCats() { return [...FL_CATS, ...fl().cats.filter(c => !FL_CATS.includes(c))]; }
const flSafe = s => String(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim().slice(0, 120) || '파일';
function flSize(n) { n = Number(n) || 0; return n < 1024 ? n + 'B' : n < 1048576 ? (n / 1024).toFixed(0) + 'KB' : (n / 1048576).toFixed(1) + 'MB'; }
const flSupported = () => typeof window.showDirectoryPicker === 'function';

function flDb() {
  return new Promise(res => {
    try { const rq = indexedDB.open('il-hub-files', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('h'); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); }
    catch (e) { res(null); }
  });
}
async function flGet() { const db = await flDb(); if (!db) return null; return new Promise(res => { const r = db.transaction('h').objectStore('h').get('root'); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); }
async function flPut(h) { const db = await flDb(); if (!db) return; return new Promise(res => { const tx = db.transaction('h', 'readwrite'); h ? tx.objectStore('h').put(h, 'root') : tx.objectStore('h').delete('root'); tx.oncomplete = () => res(); tx.onerror = () => res(); }); }
async function flPerm(ask) {
  const h = FL.handle; if (!h) return false;
  try {
    let p = await h.queryPermission({mode: 'readwrite'});
    if (p !== 'granted' && ask) p = await h.requestPermission({mode: 'readwrite'});
    FL.perm = p === 'granted';
  } catch (e) { FL.perm = false; }
  return FL.perm;
}
async function flInit() { FL.handle = await flGet(); if (FL.handle) await flPerm(false); FL.ready = true; }
async function flPick() {
  if (!flSupported()) { toast('이 브라우저는 폴더 지정이 안 돼요. PC의 Chrome·Edge에서 열어 주세요'); return false; }
  try { const h = await window.showDirectoryPicker({mode: 'readwrite', id: 'il-hub-files'}); FL.handle = h; await flPut(h); FL.perm = true; toast('폴더를 지정했어요: ' + h.name); return true; }
  catch (e) { if (e && e.name !== 'AbortError') toast('폴더를 열 수 없어요 (' + (e.name || '오류') + '). 배포 사이트에서 다시 시도해 주세요'); return false; }
}
async function flEnsure() { if (!FL.handle) return (await flPick()); if (FL.perm) return true; return await flPerm(true); }
async function flDir(cat, year, create) {
  let d = await FL.handle.getDirectoryHandle(flSafe(cat), {create});
  if (year) d = await d.getDirectoryHandle(String(year), {create});
  return d;
}
async function flExists(dir, name) { try { await dir.getFileHandle(name); return true; } catch (e) { return false; } }
async function flSaveFile(file, cat, memo, link) {
  const dt = new Date(file.lastModified || Date.now()), now = ymd(today()), year = now.slice(0, 4);
  const dir = await flDir(cat, year, true);
  let base = flSafe(file.name), name = now + '_' + base, n = 1;
  while (await flExists(dir, name)) { n++; const dot = base.lastIndexOf('.'); name = now + '_' + (dot > 0 ? base.slice(0, dot) + '(' + n + ')' + base.slice(dot) : base + '(' + n + ')'); }
  const w = await (await dir.getFileHandle(name, {create: true})).createWritable();
  await w.write(file); await w.close();
  const it = {id: uid() + Date.now().toString(36), name, orig: file.name, cat, year, date: now, size: file.size, memo: memo || '', link: link || '', path: [flSafe(cat), year, name].join('/')};
  fl().items.push(it); return it;
}
async function flFile(it) {
  const parts = it.path.split('/'); let d = FL.handle;
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
  return {dir: d, fh: await d.getFileHandle(parts[parts.length - 1])};
}
async function flOpen(it, dl) {
  if (!(await flEnsure())) return;
  try {
    const {fh} = await flFile(it), f = await fh.getFile(), url = URL.createObjectURL(f);
    const viewable = /\.(pdf|png|jpe?g|gif|webp|txt)$/i.test(it.name);
    if (viewable && !dl) window.open(url, '_blank'); else { const a = document.createElement('a'); a.href = url; a.download = it.orig || it.name; document.body.appendChild(a); a.click(); a.remove(); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { toast('이 컴퓨터의 지정폴더에서 파일을 찾지 못했어요 (다른 PC이거나 옮겨졌을 수 있어요)'); }
}
async function flMove(it, cat) {
  if (!(await flEnsure())) return;
  try {
    const {dir, fh} = await flFile(it), f = await fh.getFile(), nd = await flDir(cat, it.year, true);
    let name = it.name, n = 1; while (await flExists(nd, name)) { n++; name = it.name.replace(/(\.[^.]*)?$/, '(' + n + ')$1'); }
    const w = await (await nd.getFileHandle(name, {create: true})).createWritable(); await w.write(f); await w.close();
    await dir.removeEntry(it.name);
    it.cat = cat; it.name = name; it.path = [flSafe(cat), it.year, name].join('/'); save(); toast('옮겼어요');
  } catch (e) { toast('옮기지 못했어요. 이 컴퓨터에 파일이 있는지 확인해 주세요'); }
}
async function flRemove(it, withFile) {
  if (withFile && (await flEnsure())) { try { const {dir} = await flFile(it); await dir.removeEntry(it.name); } catch (e) {} }
  fl().items = fl().items.filter(x => x.id !== it.id); save();
}
/* 폴더를 읽어 목록에 없는 파일을 추가하고, 없어진 파일은 표시 */
async function flScan() {
  if (!(await flEnsure())) return;
  let added = 0; const seen = new Set();
  try {
    for await (const [cn, ch] of FL.handle.entries()) {
      if (ch.kind !== 'directory' || cn.startsWith('.') || cn.startsWith('_')) continue;
      for await (const [yn, yh] of ch.entries()) {
        if (yh.kind !== 'directory') continue;
        for await (const [fn, fh] of yh.entries()) {
          if (fh.kind !== 'file') continue;
          const path = [cn, yn, fn].join('/'); seen.add(path);
          if (!fl().items.some(i => i.path === path)) {
            const f = await fh.getFile(); const m = fn.match(/^(\d{4}-\d{2}-\d{2})_/);
            fl().items.push({id: uid() + Date.now().toString(36), name: fn, orig: m ? fn.slice(11) : fn, cat: cn, year: yn, date: m ? m[1] : ymd(new Date(f.lastModified)), size: f.size, memo: '', link: '', path}); added++;
            if (!flCats().includes(cn)) fl().cats.push(cn);
          }
        }
      }
    }
  } catch (e) { toast('폴더를 읽는 중 오류가 났어요'); return; }
  fl().items.forEach(i => { i.missing = !seen.has(i.path); });
  save(); toast(added ? `목록에 ${added}개를 추가했어요` : '목록이 폴더와 같아요');
}

/* ---------- 화면 ---------- */
function flRow(i) {
  const k = i.link && sopById(i.link);
  return `<div class="fl-row" data-id="${i.id}">
    <div class="fl-main"><b class="fl-name">${esc(i.orig || i.name)}</b>
      <div class="small muted">${esc(i.date)} · ${esc(i.cat)} · ${flSize(i.size)}${k ? ' · ' + esc(k.title) : ''}${i.missing ? ' · <span class="chip warn" style="height:18px;padding:0 6px">이 PC에 없음</span>' : ''}</div>
      ${i.memo ? `<div class="small">${esc(i.memo)}</div>` : ''}</div>
    <div class="row fl-act"><button class="btn sm" data-a="open">열기</button><button class="btn sm ghost" data-a="dl">저장</button><button class="btn sm ghost" data-a="edit">정보</button></div></div>`;
}
VIEWS.files = v => {
  const items = fl().items, q = FL.q.trim().toLowerCase();
  const list = items.filter(i => (!FL.cat || i.cat === FL.cat) && (!q || (i.orig + ' ' + i.name + ' ' + i.memo + ' ' + i.cat).toLowerCase().includes(q))).sort((a, b) => (b.date + b.name).localeCompare(a.date + a.name));
  const cnt = c => items.filter(i => i.cat === c).length;
  v.innerHTML = `
  <div class="page-head"><div><h1>자료함</h1><p>업무 자료를 <b>내 컴퓨터의 지정폴더</b>에 카테고리·연도별로 자동 정리해요. 파일은 공개 사이트나 클라우드에 올라가지 않고, 목록만 기기 간에 동기화돼요.</p></div>
    <div class="row"><button class="btn" id="fl-scan">폴더 다시 읽기</button><button class="btn primary" id="fl-up">${icon('plus')}자료 올리기</button></div></div>
  <div class="panel"><div class="panel-b row" style="justify-content:space-between;flex-wrap:wrap;gap:8px" id="fl-stat"></div></div>
  <div class="row" style="flex-wrap:wrap;gap:6px;margin:12px 0">
    <button class="btn sm ${FL.cat ? 'ghost' : 'primary'}" data-c="">전체 ${items.length}</button>
    ${flCats().map(c => `<button class="btn sm ${FL.cat === c ? 'primary' : 'ghost'}" data-c="${esc(c)}">${esc(c)} ${cnt(c)}</button>`).join('')}
    <button class="btn sm ghost" id="fl-cat">+ 분류 추가</button></div>
  <input class="inp" id="fl-q" placeholder="파일명·메모 검색" value="${esc(FL.q)}" style="margin-bottom:10px">
  <div class="panel" id="fl-drop"><div class="panel-b" id="fl-list">${list.length ? list.map(flRow).join('') : `<div class="muted" style="padding:18px 6px;text-align:center">${items.length ? '조건에 맞는 자료가 없어요' : '아직 자료가 없어요. <b>자료 올리기</b>를 누르거나 이 영역에 파일을 끌어다 놓으세요'}</div>`}</div></div>`;
  const stat = () => {
    const el = $('#fl-stat', v); if (!el || !v.isConnected) return;
    if (!flSupported()) { el.innerHTML = `<span>이 브라우저는 폴더 지정이 안 돼요. <b>PC의 Chrome·Edge</b>에서 배포 사이트로 열어 주세요. (목록은 볼 수 있어요)</span>`; return; }
    el.innerHTML = FL.handle
      ? `<span>지정폴더: <b>${esc(FL.handle.name)}</b> ${FL.perm ? '<span class="chip ok">연결됨</span>' : '<span class="chip warn">권한 필요</span>'}</span><span class="row">${FL.perm ? '' : '<button class="btn sm primary" id="fl-perm">권한 허용</button>'}<button class="btn sm" id="fl-pick">폴더 바꾸기</button></span>`
      : `<span>지정된 폴더가 없어요. 이 PC의 자료 폴더를 정해 주세요.</span><button class="btn sm primary" id="fl-pick">폴더 지정</button>`;
    const p = $('#fl-pick', v); if (p) p.onclick = async () => { if (await flPick()) render(); };
    const pm = $('#fl-perm', v); if (pm) pm.onclick = async () => { await flPerm(true); stat(); };
  };
  (FL.ready ? Promise.resolve() : flInit()).then(stat);
  $('#fl-up', v).onclick = () => flUploadSheet([]);
  $('#fl-scan', v).onclick = async () => { await flScan(); render(); };
  $('#fl-q', v).oninput = e => { FL.q = e.target.value; const pos = e.target.selectionStart; render(); const q2 = $('#fl-q'); q2.focus(); q2.setSelectionRange(pos, pos); };
  $$('[data-c]', v).forEach(b => b.onclick = () => { FL.cat = b.dataset.c; render(); });
  $('#fl-cat', v).onclick = () => { const n = (prompt('추가할 분류 이름 (폴더 이름으로도 쓰여요)') || '').trim(); if (!n) return; if (flCats().includes(n)) { toast('이미 있는 분류예요'); return; } fl().cats.push(flSafe(n)); save(); render(); };
  const drop = $('#fl-drop', v);
  ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.style.outline = '2px dashed var(--accent)'; }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.style.outline = ''; }));
  drop.addEventListener('drop', e => { const fs = [...(e.dataTransfer.files || [])]; if (fs.length) flUploadSheet(fs); });
  $$('.fl-row', v).forEach(r => {
    const it = fl().items.find(x => x.id === r.dataset.id);
    $$('[data-a]', r).forEach(b => b.onclick = () => ({open: () => flOpen(it), dl: () => flOpen(it, true), edit: () => flEditSheet(it)})[b.dataset.a]());
  });
};
function flUploadSheet(files) {
  const opts = c => flCats().map(x => `<option ${x === c ? 'selected' : ''}>${esc(x)}</option>`).join('');
  sheet({title: '자료 올리기', body: `
    <label class="f">파일<input class="inp" type="file" id="fu-f" multiple></label>
    <div class="small muted" id="fu-n">${files.length ? files.length + '개 선택됨: ' + files.map(f => esc(f.name)).join(', ') : ''}</div>
    <label class="f">분류<select class="inp" id="fu-c">${opts(FL.cat || '')}</select></label>
    <label class="f">관련 업무 (선택)<select class="inp" id="fu-l"><option value="">없음</option>${sops().map(s => `<option value="${s.id}">${esc(s.title)}</option>`).join('')}</select></label>
    <label class="f">메모 (선택)<input class="inp" id="fu-m" placeholder="예: 9월 급여대장 결재본"></label>
    <div class="note small">${esc(FL.handle ? FL.handle.name : '지정폴더')} / 분류 / ${ymd(today()).slice(0, 4)} / 날짜_파일명 으로 저장돼요.</div>`,
    foot: '<button class="btn" data-close>취소</button><button class="btn primary" id="fu-go">저장</button>',
    onMount: sh => {
      let picked = files.slice();
      $('#fu-f', sh).onchange = e => { picked = [...e.target.files]; $('#fu-n', sh).textContent = picked.length + '개 선택됨'; };
      $('#fu-go', sh).onclick = async () => {
        if (!picked.length) { toast('파일을 선택해 주세요'); return; }
        if (!(await flEnsure())) return;
        const cat = $('#fu-c', sh).value, memo = $('#fu-m', sh).value.trim(), link = $('#fu-l', sh).value;
        try { for (const f of picked) await flSaveFile(f, cat, memo, link); save(); closeSheet(); toast(picked.length + '개를 저장했어요'); render(); }
        catch (e) { toast('저장 중 오류가 났어요. 폴더 권한을 확인해 주세요'); }
      };
    }});
}
function flEditSheet(it) {
  sheet({title: '자료 정보', body: `
    <div class="small muted">${esc(it.path)}</div>
    <label class="f">분류 (바꾸면 폴더도 옮겨져요)<select class="inp" id="fe-c">${flCats().map(x => `<option ${x === it.cat ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
    <label class="f">관련 업무<select class="inp" id="fe-l"><option value="">없음</option>${sops().map(s => `<option value="${s.id}" ${s.id === it.link ? 'selected' : ''}>${esc(s.title)}</option>`).join('')}</select></label>
    <label class="f">메모<input class="inp" id="fe-m" value="${esc(it.memo || '')}"></label>`,
    foot: '<button class="btn ghost" id="fe-del" style="margin-right:auto">삭제</button><button class="btn" data-close>취소</button><button class="btn primary" id="fe-ok">저장</button>',
    onMount: sh => {
      $('#fe-ok', sh).onclick = async () => {
        it.memo = $('#fe-m', sh).value.trim(); it.link = $('#fe-l', sh).value; const nc = $('#fe-c', sh).value;
        if (nc !== it.cat) await flMove(it, nc); save(); closeSheet(); render();
      };
      $('#fe-del', sh).onclick = async () => {
        if (!confirm('목록에서 삭제할까요?\n[확인] 목록만 삭제 / 폴더의 파일은 남아요')) return;
        const also = it.missing ? false : confirm('컴퓨터 폴더의 파일도 함께 지울까요?\n(휴지통으로 가지 않고 바로 삭제돼요)\n[취소] 파일은 남기기');
        await flRemove(it, also); closeSheet(); render();
      };
    }});
}
