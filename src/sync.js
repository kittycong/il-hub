/* ================= 자동 연동 (Supabase) =================
   아이디+비밀번호로 로그인한 모든 기기에서 허브 자료와 단계 사진을 자동으로 맞춤.
   - 계정·자료 표는 직접 접근 불가, 서버 함수(hub_*)만 통해 읽고 씀 (로그인 토큰 확인)
   - 비밀번호는 서버에 bcrypt 해시로만 저장, 5번 틀리면 15분 잠김
   - 아래 키는 공개용(publishable) 키 */
const SB = {url: 'https://ucvdzharyqohmnskrjzg.supabase.co', key: 'sb_publishable_GbB9vX51cUGISeIes5ai1w__fXrFbgV'};
const SY = {sess: null, meta: {rev: 0, at: '', dirty: false}, busy: false, t: 0, pt: 0, err: '', state: 'off', photoBusy: false};
const SY_K = {sess: 'il-hub-login', meta: 'il-hub-sync'};
const syGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const sySet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const syDevice = () => { let d = syGet('il-hub-device'); if (!d) { d = (/Mobi|Android|iPhone/.test(navigator.userAgent) ? '휴대폰' : 'PC') + '-' + Math.random().toString(36).slice(2, 6); sySet('il-hub-device', d); } return d; };
SY.sess = syGet(SY_K.sess); SY.meta = Object.assign(SY.meta, syGet(SY_K.meta) || {});
const syOn = () => !!(SY.sess && SY.sess.token);
function syMetaSave() { sySet(SY_K.meta, SY.meta); }

/* ---------- 서버 함수 호출 ---------- */
async function syRpc(fn, args) {
  const r = await fetch(SB.url + '/rest/v1/rpc/' + fn, {method: 'POST', headers: {apikey: SB.key, 'Content-Type': 'application/json'}, body: JSON.stringify(args || {})});
  const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
  if (!r.ok) { const m = (j && (j.message || j.hint)) || ('HTTP ' + r.status); if (/no_session/.test(m)) { syLogout(true); throw new Error('로그인이 풀렸어요. 다시 로그인해 주세요'); } throw new Error('연동 서버 오류: ' + String(m).slice(0, 80)); }
  return j;
}
const syT = () => (SY.sess || {}).token;
function syErrText(j) {
  const e = (j || {}).error;
  if (e === 'bad_login') return '아이디 또는 비밀번호가 맞지 않아요' + (j.left != null ? ` (${j.left}번 더 틀리면 15분 잠김)` : '');
  if (e === 'locked') return '비밀번호를 여러 번 틀려서 잠시 잠겼어요. ' + new Date(j.until).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}) + ' 이후 다시 해 주세요';
  if (e === 'login_taken') return '이미 있는 아이디예요. 로그인해 주세요';
  if (e === 'bad_pw_length') return '비밀번호는 4자 이상이어야 해요';
  if (e === 'bad_login_format') return '아이디는 영문 소문자·숫자·.-_ 로 3~30자';
  if (e === 'signup_closed') return '계정을 더 만들 수 없어요 (최대 5개)';
  return '실패했어요';
}
async function syAuthCall(fn, login, pw) {
  const j = await syRpc(fn, {p_login: login, p_pw: pw, p_device: syDevice()});
  if (!j || !j.token) throw new Error(syErrText(j));
  SY.sess = {token: j.token, login: j.login}; sySet(SY_K.sess, SY.sess); sySet('il-hub-last-login', j.login);
}
async function syLogin(login, pw) { await syAuthCall('hub_login', login, pw); SY.meta = {rev: 0, at: '', dirty: SY.meta.dirty}; syMetaSave(); await syFirstPull(); }
async function sySignup(login, pw) { await syAuthCall('hub_signup', login, pw); SY.meta = {rev: 0, at: '', dirty: true}; syMetaSave(); await syFirstPull(); return 'in'; }
async function syChangePw(oldPw, newPw) { const j = await syRpc('hub_change_pw', {p_token: syT(), p_old: oldPw, p_new: newPw}); if (!j || !j.ok) throw new Error(syErrText(j)); }
function syLogout(silent) {
  if (SY.sess && !silent) syRpc('hub_logout', {p_token: syT()}).catch(() => {});
  SY.sess = null; sySet(SY_K.sess, null); SY.state = 'off'; SY.meta.rev = 0; syMetaSave(); if (typeof render === 'function') render();
}
const syRemoteMeta = async () => (await syRpc('hub_state_meta', {p_token: syT()})) || null;
const syRemoteFull = async () => (await syRpc('hub_state_get', {p_token: syT()})) || null;
async function syPushNow(force) {
  if (!syOn() || SY.busy) return; SY.busy = true; SY.state = 'saving'; syPaint();
  try {
    if (!force) { const m = await syRemoteMeta(); if (m && m.rev > SY.meta.rev) { SY.busy = false; return syConflict(); } }
    const r0 = (await syRpc('hub_state_put', {p_token: syT(), p_data: S, p_device: syDevice()})) || {}; SY.meta = {rev: r0.rev || SY.meta.rev + 1, at: r0.updated_at || new Date().toISOString(), dirty: false}; syMetaSave(); SY.state = 'ok'; SY.err = '';
  } catch (e) { SY.state = 'err'; SY.err = e.message; }
  SY.busy = false; syPaint();
}
function syApply(row) {
  const keepLocal = {nasRoot: (S.settings || {}).nasRoot};
  S = row.data; const def = defaults(); for (const k of Object.keys(def)) if (S[k] === undefined) S[k] = def[k];
  if (!S.settings.nasRoot && keepLocal.nasRoot) S.settings.nasRoot = keepLocal.nasRoot;
  save(true); SY.meta = {rev: row.rev, at: row.updated_at, dirty: false}; syMetaSave(); SY.state = 'ok';
  if (!$('#layer').innerHTML) render(); else renderNav();
}
async function syPull(quietIfSame = true) {
  if (!syOn() || SY.busy || document.querySelector('#sy-conf')) return;
  if (!SY.meta.rev) { if (!SY.firstAsked) { SY.firstAsked = true; try { await syFirstPull(); } catch (e) { SY.state = 'err'; SY.err = e.message; syPaint(); } } return; }
  try {
    const m = await syRemoteMeta();
    if (!m) { if (SY.meta.rev === 0) await syPushNow(true); return; }
    if (m.rev <= SY.meta.rev) { if (SY.meta.dirty) syDirty(); else SY.state = 'ok'; if (!quietIfSame) toast('이미 최신이에요'); syPaint(); }
    else if (SY.meta.dirty) { syConflict(); return; }
    else { const row = await syRemoteFull(); syApply(row); toast(`다른 기기(${row.device || '?'})에서 바뀐 내용을 가져왔어요`); }
  } catch (e) { SY.state = 'err'; SY.err = e.message; syPaint(); }
  syPhotos();
}
/* 이 기기에서 처음 로그인: 클라우드에 자료가 있으면 어느 쪽을 쓸지 고르기 */
async function syFirstPull() {
  const m = await syRemoteMeta();
  if (!m) { await syPushNow(true); toast('이 기기 자료를 클라우드에 올렸어요. 다른 기기에서 같은 이메일로 로그인하면 연동돼요'); render(); syPhotos(); return; }
  sheet({title: '클라우드에 저장된 자료가 있어요', body: `
    <div class="note">마지막 저장: <b>${esc(new Date(m.updated_at).toLocaleString('ko-KR'))}</b> · ${esc(m.device || '')}</div>
    <div class="small">어느 쪽 자료를 쓸까요? 고르지 않은 쪽 자료는 이 기기의 백업(설정 → 백업)으로 남겨 둬요.</div>`,
    foot: `<button class="btn" id="fp-local">이 기기 자료로 클라우드 덮기</button><button class="btn primary" id="fp-cloud">클라우드 자료 쓰기 (권장)</button>`,
    onMount: el => {
      sySet('il-hub-before-sync', S);
      $('#fp-cloud', el).onclick = async () => { closeSheet(); syApply(await syRemoteFull()); toast('클라우드 자료로 맞췄어요'); syPhotos(); };
      $('#fp-local', el).onclick = async () => { closeSheet(); SY.meta.rev = m.rev; await syPushNow(true); toast('이 기기 자료를 클라우드에 올렸어요'); render(); syPhotos(); };
    }});
}
function syConflict() {
  if (document.querySelector('#sy-conf')) return;
  SY.state = 'conflict'; syPaint();
  sheet({title: '다른 기기에서도 바뀌었어요', body: `<div id="sy-conf" class="note warn">이 기기에서 저장하지 않은 변경이 있는데, 그사이 다른 기기에서도 저장했어요. 어느 쪽을 쓸까요?</div>
    <div class="small">고르지 않은 쪽은 이 기기에 "충돌 백업"으로 남겨 둬요 (설정 → 자동 연동에서 되돌리기 가능).</div>`,
    foot: `<button class="btn" id="cf-local">이 기기 것으로 덮기</button><button class="btn primary" id="cf-cloud">다른 기기 것 가져오기</button>`,
    onMount: el => {
      $('#cf-cloud', el).onclick = async () => { sySet('il-hub-conflict', {at: new Date().toISOString(), data: S}); closeSheet(); syApply(await syRemoteFull()); toast('다른 기기 자료를 가져왔어요 (이 기기 것은 충돌 백업에 보관)'); };
      $('#cf-local', el).onclick = async () => { const r = await syRemoteFull(); sySet('il-hub-conflict', {at: r.updated_at, data: r.data}); closeSheet(); await syPushNow(true); toast('이 기기 자료로 덮었어요 (다른 기기 것은 충돌 백업에 보관)'); };
    }});
}
function syDirty() { SY.meta.dirty = true; syMetaSave(); if (!syOn()) return; SY.state = 'wait'; clearTimeout(SY.t); SY.t = setTimeout(() => syPushNow(false), 2500); syPaint(); }
const syncDirty = () => syDirty();

/* ---------- 사진 ---------- */
function syncPhotosSoon() { if (!syOn()) return; clearTimeout(SY.pt); SY.pt = setTimeout(syPhotos, 2000); }
async function syPhotos() {
  if (!syOn() || SY.photoBusy || !PH.db) return; SY.photoBusy = true;
  try {
    const tomb = syGet('il-hub-ph-del') || [];
    if (tomb.length) { await syRpc('hub_photo_del', {p_token: syT(), p_ids: tomb}); sySet('il-hub-ph-del', []); }
    const remote = (await syRpc('hub_photo_list', {p_token: syT()})) || [];
    const rmap = new Map(remote.map(r => [r.id, r])), local = Object.values(PH.map).flat(), lmap = new Map(local.map(p => [p.id, p]));
    const up = local.filter(p => !rmap.has(p.id) || !p.synced);
    for (const p of up) {
      await syRpc('hub_photo_put', {p_token: syT(), p_row: {id: p.id, key: p.key, sop: p.sop, k: p.k, cap: p.cap || '', src: p.src || '', ord: p.ord || 0, data: p.data}});
      p.synced = true; await phTx('readwrite', st => st.put(p));
    }
    const del = remote.filter(r => r.deleted && lmap.has(r.id));
    if (del.length) await phTx('readwrite', st => del.forEach(r => st.delete(r.id)));
    const need = remote.filter(r => !r.deleted && !lmap.has(r.id));
    const capFix = remote.filter(r => !r.deleted && lmap.has(r.id) && lmap.get(r.id).synced && (lmap.get(r.id).cap || '') !== (r.cap || ''));
    if (capFix.length) await phTx('readwrite', st => capFix.forEach(r => { const p = lmap.get(r.id); p.cap = r.cap; st.put(p); }));
    for (let i = 0; i < need.length; i += 5) {
      const rows = (await syRpc('hub_photo_get', {p_token: syT(), p_ids: need.slice(i, i + 5).map(r => r.id)})) || [];
      await phTx('readwrite', st => rows.forEach(d => { const r = rmap.get(d.id); st.put({id: r.id, key: r.key, sop: r.sop, k: r.k, cap: r.cap, src: r.src, ord: r.ord, data: d.data, synced: true}); }));
    }
    if (up.length || del.length || need.length || capFix.length) { await loadPhotos(); if (!$('#layer').innerHTML && ['handover', 'settings'].includes(current())) render(); }
    SY.photoInfo = {n: remote.filter(r => !r.deleted).length + up.filter(p => !rmap.has(p.id)).length, at: new Date().toISOString()};
  } catch (e) { SY.err = '사진: ' + e.message; }
  SY.photoBusy = false; syPaint();
}

/* ---------- 표시 ---------- */
function syAgo(iso) { if (!iso) return ''; const s = Math.round((Date.now() - new Date(iso)) / 1000); return s < 60 ? '방금' : s < 3600 ? `${Math.round(s / 60)}분 전` : s < 86400 ? `${Math.round(s / 3600)}시간 전` : new Date(iso).toLocaleDateString('ko-KR'); }
function syncBadge() {
  if (!syOn()) return `${ENV === 'artifact' ? 'Claude 아티팩트판' : '웹 배포판'} · 이 기기에만 저장<br><a href="#settings">자동 연동 켜기</a> · <a href="#settings">백업</a>`;
  const st = {ok: `연동됨 · ${syAgo(SY.meta.at)}`, saving: '클라우드에 저장 중…', wait: '저장 대기…', err: '연동 오류 · 설정에서 확인', conflict: '충돌 · 선택 필요', off: '연동 준비 중'}[SY.state] || '연동됨';
  return `<span class="sy-dot ${SY.state}"></span>${esc(st)}<br><span class="faint">${esc(SY.sess.login || '')}</span>`;
}
function syPaint() { const f = $('#side-foot'); if (f) f.innerHTML = syncBadge(); const p = $('#sy-panel'); if (p && !p.contains(document.activeElement)) p.outerHTML = syncPanel(); bindSyncPanel(); }
function syncPanel() {
  if (ENV === 'artifact') return `<section class="panel" id="sy-panel"><div class="panel-h"><h2>자동 연동 (클라우드)</h2></div><div class="panel-b"><div class="note small">Claude 아티팩트 안에서는 외부 서버 연결이 막혀 있어요. GitHub 배포본(kittycong.github.io/il-hub)에서 로그인해 주세요.</div></div></section>`;
  if (!syOn()) return `<section class="panel" id="sy-panel"><div class="panel-h"><h2>자동 연동 (클라우드)</h2><span class="chip">꺼짐</span></div><div class="panel-b" style="display:flex;flex-direction:column;gap:10px">
    <div class="note small">회사 PC·집 PC·휴대폰에서 <b>같은 아이디로 로그인</b>하면 업무 체크·메모·절차·예산·예수금·사진이 자동으로 맞춰져요. 이메일은 필요 없어요.</div>
    <div class="form-grid"><label class="f">아이디<input class="inp" id="sy-id" autocomplete="username" autocapitalize="off" spellcheck="false" value="${esc(syGet('il-hub-last-login') || '')}" placeholder="예: hwiwon"></label>
    <label class="f">비밀번호 (4자 이상)<input class="inp" id="sy-pw" type="password" autocomplete="current-password"></label></div>
    <div class="row" style="gap:6px"><button class="btn primary" id="sy-in">로그인</button><button class="btn" id="sy-up">처음이면 계정 만들기</button></div>
    <div class="faint small">비밀번호는 서버에 암호화(해시)해서만 저장돼 저도 볼 수 없어요. 잊어버리면 되찾을 수 없으니 기억해 두세요. 5번 틀리면 15분 잠겨요.</div>
    <div class="small" id="sy-msg"></div></div></section>`;
  const conf = syGet('il-hub-conflict'), before = syGet('il-hub-before-sync');
  return `<section class="panel" id="sy-panel"><div class="panel-h"><h2>자동 연동 (클라우드)</h2><span class="chip ${SY.state === 'err' || SY.state === 'conflict' ? 'crit' : 'ok'}">${SY.state === 'err' ? '오류' : SY.state === 'conflict' ? '충돌' : '켜짐'}</span></div><div class="panel-b" style="display:flex;flex-direction:column;gap:10px">
    <div class="row small" style="gap:10px"><span>아이디 <b>${esc(SY.sess.login || '')}</b></span><span class="faint">이 기기: ${esc(syDevice())}</span></div>
    <div class="row small" style="gap:10px"><span><span class="sy-dot ${SY.state}"></span>자료 ${SY.state === 'ok' ? '최신' : esc(SY.state)} · 마지막 동기화 ${esc(syAgo(SY.meta.at) || '-')} · 버전 ${SY.meta.rev}</span>${SY.photoInfo ? `<span>사진 ${SY.photoInfo.n}장 연동</span>` : ''}</div>
    ${SY.err ? `<div class="note warn small">${esc(SY.err)}</div>` : ''}
    <div class="row" style="gap:6px"><button class="btn" id="sy-now">지금 동기화</button><button class="btn ghost" id="sy-out">로그아웃</button><button class="btn ghost sm" id="sy-pwc">비밀번호 바꾸기</button>
      ${conf ? '<button class="btn ghost sm" id="sy-conf-restore">충돌 백업으로 되돌리기</button>' : ''}${before ? '<button class="btn ghost sm" id="sy-before">연동 전 자료로 되돌리기</button>' : ''}</div>
    <div class="faint small">입력하면 2~3초 뒤 자동 저장되고, 다른 기기는 화면을 다시 볼 때(탭 전환·1분마다) 가져와요. 로그아웃해도 이 기기 자료는 남아요.</div></div></section>`;
}
function bindSyncPanel() {
  const p = $('#sy-panel'); if (!p || p.dataset.bound) return; p.dataset.bound = 1;
  const msg = t => { const m = $('#sy-msg'); if (m) m.textContent = t; };
  const cred = () => { const e = ($('#sy-id') || {}).value.trim().toLowerCase(), pw = $('#sy-pw').value; if (!e || !pw) { msg('아이디와 비밀번호를 넣어 주세요'); return null; } return [e, pw]; };
  const run = async (btn, fn) => { const b = $(btn); if (!b) return; b.onclick = async () => { b.disabled = true; try { await fn(); } catch (e) { msg(e.message || String(e)); toast(e.message || '실패'); } b.disabled = false; }; };
  run('#sy-in', async () => { const c = cred(); if (!c) return; msg('로그인 중…'); await syLogin(...c); render(); });
  run('#sy-up', async () => { const c = cred(); if (!c) return; msg('계정 만드는 중…'); await sySignup(...c); toast('계정을 만들었어요. 다른 기기에서는 같은 아이디로 로그인하세요'); render(); });
  const pw = $('#sy-pw'); if (pw) pw.onkeydown = e => { if (e.key === 'Enter') $('#sy-in').click(); };
  run('#sy-pwc', async () => sheet({title: '비밀번호 바꾸기', body: `<label class="f">지금 비밀번호<input class="inp" type="password" id="pc-old" autocomplete="current-password"></label><label class="f">새 비밀번호 (4자 이상)<input class="inp" type="password" id="pc-new" autocomplete="new-password"></label><div class="small" id="pc-msg"></div>`,
    foot: `<button class="btn" data-close>취소</button><button class="btn primary" id="pc-ok">바꾸기</button>`,
    onMount: el => { $('#pc-ok', el).onclick = async () => { try { await syChangePw($('#pc-old', el).value, $('#pc-new', el).value); closeSheet(); toast('비밀번호를 바꿨어요 (다른 기기는 다시 로그인 필요)'); } catch (e) { $('#pc-msg', el).textContent = e.message; } }; }}));
  run('#sy-now', async () => { await syPull(false); if (SY.meta.dirty) await syPushNow(false); await syPhotos(); });
  run('#sy-out', async () => { syLogout(); toast('로그아웃했어요 (이 기기 자료는 그대로)'); });
  run('#sy-conf-restore', async () => { const c = syGet('il-hub-conflict'); if (!c) return; S = c.data; save(); sySet('il-hub-conflict', null); render(); toast('충돌 백업으로 되돌렸어요'); });
  run('#sy-before', async () => { const c = syGet('il-hub-before-sync'); if (!c) return; if (!confirmOnce('#sy-before')) return; S = c; save(); sySet('il-hub-before-sync', null); render(); toast('연동 전 자료로 되돌렸어요'); });
}
function confirmOnce(sel) { const b = $(sel); if (b.dataset.armed) return true; b.dataset.armed = 1; b.textContent = '한 번 더 누르면 되돌림'; return false; }

/* ---------- 자동 확인 ---------- */
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syPull(); });
window.addEventListener('focus', () => syPull());
setInterval(() => { if (document.visibilityState === 'visible') syPull(); }, 60000);
