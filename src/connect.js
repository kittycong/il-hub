/* ================= 앱 데이터 연동 (읽기 전용) =================
   같은 도메인(kittycong.github.io)에 올라간 앱끼리는 브라우저 저장소를 공유하므로,
   허브를 kittycong.github.io/il-hub/ 에 배포하면 아래 데이터를 자동으로 읽는다.
   토큰·비밀번호 키는 절대 읽지 않는다. 쓰기(수정)는 하지 않는다. */
const GH = {owner:'kittycong', raw:'https://raw.githubusercontent.com/kittycong'};
const CONN = {
  huga:{name:'휴가 대시보드', repo:'guro_huga', status:'idle', data:null, src:''},
  birth:{name:'생일 관리', repo:'birth_guro1', status:'idle', data:null, src:''},
};
function lsRead(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
async function getText(urls) {
  for (const u of urls) { try { const r = await fetch(u, {cache:'no-store'}); if (r.ok) return {text: await r.text(), url: u}; } catch (e) {} }
  return null;
}
async function loadConnectors() {
  const sameOrigin = location.hostname === `${GH.owner}.github.io`;
  // ---- 휴가 (guro_huga) ----
  const H = CONN.huga; H.status = 'loading';
  let hd = null;
  const draft = lsRead('guro_huga_local_draft');
  if (draft && Array.isArray(draft.records)) { hd = draft; H.src = '휴가 앱 (이 브라우저의 최신 작업본)'; }
  if (!hd && ENV !== 'artifact') {
    const t = await getText([...(sameOrigin ? ['/guro_huga/data/app-data.json'] : []), `${GH.raw}/guro_huga/main/data/app-data.json`]);
    if (t) { try { hd = JSON.parse(t.text); H.src = t.url.startsWith('/') ? '휴가 앱 공유 데이터' : 'GitHub 공유 데이터 (data/app-data.json)'; } catch (e) {} }
  }
  if (!hd && S.imports?.huga) { hd = S.imports.huga; H.src = '가져온 파일'; }
  H.data = hd; H.status = hd ? 'ok' : 'none';
  // ---- 생일 (birth_guro1) ----
  const Bd = CONN.birth; Bd.status = 'loading';
  let bd = lsRead('guro_birthdays'); if (Array.isArray(bd) && bd.length) Bd.src = '생일 앱 (이 브라우저)'; else bd = null;
  if (!bd && ENV !== 'artifact') {
    const t = await getText([...(sameOrigin ? ['/birth_guro1/index.html'] : []), `${GH.raw}/birth_guro1/main/index.html`]);
    const m = t && t.text.match(/INITIAL_DATA\s*=\s*(\[[\s\S]*?\]);/);
    if (m) { try { bd = JSON.parse(m[1]); Bd.src = '생일 앱 기본 명단'; } catch (e) {} }
  }
  if (!bd && S.imports?.birth) { bd = S.imports.birth; Bd.src = '가져온 파일'; }
  Bd.data = bd; Bd.status = bd ? 'ok' : 'none';
}

/* ---------- 휴가 계산 (guro_huga의 leaveDelta와 동일 규칙) ---------- */
function leaveDelta(type) { if (type === '반차') return 0.5; if (type === '반반차') return 0.25; if (['교육','출장','개인일정'].includes(type)) return 0; return 1; }
function hugaEmp(id) { return (CONN.huga.data?.employees || []).find(e => e.id === id); }
function leaveEvents(from, to) {
  const d = CONN.huga.data; if (!d) return [];
  const a = ymd(from), b = ymd(to);
  return (d.records || []).filter(r => r.date >= a && r.date <= b).map(r => ({kind:'leave', date: parseYmd(r.date), title: `${hugaEmp(r.empId)?.name || '직원'} ${r.type}`, rec: r}));
}
function leaveBalance() {
  const d = CONN.huga.data; if (!d) return [];
  const y = today().getFullYear();
  return (d.employees || []).filter(e => !e.resignationDate).map(e => {
    const used = (d.records || []).filter(r => r.empId === e.id && r.date.startsWith(String(y))).reduce((s, r) => s + leaveDelta(r.type), 0);
    const grant = (d.subLeaves || []).filter(s => s.empId === e.id && s.type === 'grant' && s.date.startsWith(String(y))).reduce((s, x) => s + Number(x.days || 0), 0);
    const total = d.totals?.[`${e.id}_${y}`];
    return {name: e.name, dept: e.dept, used: Math.round(used * 100) / 100, total: total == null || total === '' ? null : Number(total) + grant, left: total == null || total === '' ? null : Math.round((Number(total) + grant - used) * 100) / 100};
  });
}
/* ---------- 생일 ---------- */
function birthdayEvents(from, to) {
  const list = CONN.birth.data; if (!list) return [];
  const out = [];
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++)
    list.forEach(p => { const d = new Date(y, Number(p.m) - 1, Number(p.d)); if (d >= from && d <= to) out.push({kind:'bday', date:d, title:`${p.name} 생일`, p}); });
  return out.sort((a, b) => a.date - b.date);
}
function extraEvents(from, to) { return [...leaveEvents(from, to), ...birthdayEvents(from, to)]; }
const XCAT = {leave:{name:'휴가', color:'var(--cat-leave)'}, bday:{name:'생일', color:'var(--cat-bday)'}};

/* ---------- 연동 상태 패널 (앱 화면) ---------- */
function connPanel() {
  const row = (k, c, extra) => `<div class="row" style="padding:12px 16px;border-bottom:1px solid var(--line)">
    <div class="grow" style="min-width:200px"><b>${esc(c.name)}</b> <span class="faint small">github.com/${GH.owner}/${c.repo}</span><div class="small muted">${c.status==='ok'?`${esc(c.src)} · ${extra}`:ENV==='artifact'?'이 화면에서는 다른 앱 데이터에 접근할 수 없어요. GitHub 배포판에서 자동으로 이어지고, 여기서는 내보낸 JSON 파일을 가져올 수 있어요.':'데이터를 찾지 못했어요. 앱에서 JSON을 내보내 가져오세요.'}</div></div>
    <span class="chip ${c.status==='ok'?'ok':'warn'}">${c.status==='ok'?'연동됨':c.status==='loading'?'읽는 중':'연동 안 됨'}</span>
    <label class="btn sm">파일 가져오기<input type="file" accept=".json,application/json" data-imp="${k}" hidden></label></div>`;
  const hd = CONN.huga.data, bd = CONN.birth.data;
  return `<section class="panel" id="conn"><div class="panel-h"><h2>데이터 연동</h2><button class="btn ghost sm" id="conn-re">다시 읽기</button></div>
    ${row('huga', CONN.huga, hd ? `직원 ${(hd.employees||[]).length}명 · 휴가 기록 ${(hd.records||[]).length}건${hd.updatedAt?` · 기준 ${esc(hd.updatedAt)}`:''}` : '')}
    ${row('birth', CONN.birth, bd ? `${bd.length}명` : '')}
    ${hd && hugaStaleDays() > 30 ? `<div class="panel-b" style="padding-bottom:0"><div class="note warn small">휴가 데이터가 ${hugaStaleDays()}일 전(${esc(hd.updatedAt)}) 기준이에요. 휴가 앱에서 <b>공유 저장</b>을 누르면 최신으로 이어져요.</div></div>` : ''}
    <div class="panel-b faint small">읽기 전용이에요. 각 앱의 데이터를 바꾸지 않고, 토큰·비밀번호는 읽지 않습니다. 허브를 <b>kittycong.github.io/il-hub/</b>에 올려야 같은 브라우저의 앱 데이터가 자동으로 이어져요.</div></section>`;
}
function bindConn(v) {
  const re = $('#conn-re', v); if (re) re.onclick = async () => { await loadConnectors(); render(); toast('연동 데이터를 다시 읽었어요'); };
  $$('[data-imp]', v).forEach(inp => inp.onchange = () => {
    const f = inp.files[0]; if (!f) return; const r = new FileReader();
    r.onload = async () => {
      try {
        const d = JSON.parse(r.result), k = inp.dataset.imp;
        if (k === 'huga' && !Array.isArray(d.records)) throw 0;
        if (k === 'birth' && !Array.isArray(d)) throw 0;
        S.imports = S.imports || {}; S.imports[k] = d; save(); await loadConnectors(); render(); toast(`${CONN[k].name} 데이터를 가져왔어요`);
      } catch (e) { toast('형식이 맞지 않아요. 휴가 앱은 app-data.json, 생일 앱은 guro_birthdays.json을 넣어 주세요'); }
    };
    r.readAsText(f);
  });
}
