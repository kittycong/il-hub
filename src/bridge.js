/* ================= 진우 ↔ 엑셀 bridge ================= */
const FIELD = {
  date:{label:'일자', re:/일자|날짜|거래일|전표일|결의일|date/i, req:true},
  amt:{label:'금액 (또는 차변)', re:/^금\s*액$|금액|차\s*변|지출액|지출|출금|수입액|세입액|입금/, req:true},
  amt2:{label:'대변 (있으면)', re:/대\s*변/},
  desc:{label:'적요·내용', re:/적\s*요|내\s*용|내역|비\s*고/},
  acct:{label:'계정·목', re:/계정|과목|세\s*목|^목$/},
  group:{label:'묶을 기준 (재원/계정)', re:/재원|자금|fund/i, req:true},
  kind:{label:'수입/지출 구분', re:/구\s*분|수입\s*지출|입출/},
  party:{label:'거래처', re:/거래처|지급처|상대|업체/},
  fund:{label:'재원', re:/재원|자금/},
};
const MODES = {
  recon:{title:'장부 대조', slots:[['jinwoo','진우 장부 (계정별원장·전표 엑셀)'],['manual','수기 엑셀 (지출·수입 관리대장)']], fields:['date','amt','amt2','desc','acct']},
  summary:{title:'재원×월 요약', slots:[['summary','요약할 엑셀 (수기 대장 또는 진우 장부)']], fields:['date','amt','amt2','group','kind']},
  entry:{title:'진우 입력 목록', slots:[['entry','입력할 거래가 담긴 엑셀']], fields:['date','acct','desc','party','fund','amt','amt2']},
};
const SKIP_RE = /월\s*계|누\s*계|합\s*계|소\s*계|전기\s*이월|차기\s*이월|이월\s*금?$/;
const B = { mode:'recon', files:{}, map:{}, period:'', resTab:'onlyB', onlyUnentered:false };

/* ---------- parsing ---------- */
function toYmd(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return ymd(new Date(v.getFullYear(), v.getMonth(), v.getDate(), 12));
  if (typeof v === 'number') {
    if (v > 19000000 && v < 21000000) { const s = String(v); return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`; }
    if (v > 20000 && v < 80000 && window.XLSX) { const p = XLSX.SSF.parse_date_code(v); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; }
    return null;
  }
  const s = String(v).trim();
  let m = s.match(/(\d{4})\s*[.\-\/년]\s*(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
function toNum(v) {
  if (typeof v === 'number') return v;
  if (v == null) return 0;
  let s = String(v).replace(/[,\s원₩]/g, '');
  if (!s || s === '-') return 0;
  let neg = /^\(.*\)$/.test(s) || /^△|^▲/.test(s); s = s.replace(/[()△▲]/g, '');
  const n = parseFloat(s); return isNaN(n) ? 0 : (neg ? -Math.abs(n) : n);
}
function detectHeader(rows) {
  const all = Object.values(FIELD).map(f => f.re);
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = rows[i].filter(c => typeof c === 'string' && c.trim());
    if (cells.length >= 3 && cells.some(c => all.some(re => re.test(c)))) return i;
  }
  return Math.max(0, rows.findIndex(r => r.some(c => c !== '')));
}
function autoMap(headers, fields) {
  const m = {}, used = new Set();
  for (const f of fields) {
    const re = FIELD[f].re;
    let idx = headers.findIndex((h, i) => !used.has(i) && re.test(String(h)));
    if (f === 'group' && idx < 0) idx = headers.findIndex((h, i) => !used.has(i) && FIELD.acct.re.test(String(h)));
    if (idx >= 0) { m[f] = idx; used.add(idx); }
  }
  // 차변이 금액으로 잡혔으면 대변을 amt2로
  return m;
}
function readWorkbook(file) {
  return new Promise((res, rej) => {
    if (!window.XLSX) return rej(new Error('엑셀 모듈을 불러오지 못했어요. 인터넷 연결을 확인해 주세요'));
    const fr = new FileReader();
    fr.onload = () => { try { res(XLSX.read(new Uint8Array(fr.result), {type:'array', cellDates:true})); } catch (e) { rej(e); } };
    fr.onerror = () => rej(fr.error); fr.readAsArrayBuffer(file);
  });
}
function setSheet(slot, wb, name) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], {header:1, raw:true, defval:''});
  const f = B.files[slot]; f.sheet = name; f.rows = rows; f.hdr = detectHeader(rows);
  B.map[slot] = autoMap(rows[f.hdr] || [], MODES[B.mode].fields);
  if (recallMap(slot)) toast('지난번에 지정한 열 설정을 불러왔어요');
}
function items(slot) {
  const f = B.files[slot], mp = B.map[slot] || {}; if (!f) return [];
  const out = [];
  f.rows.slice(f.hdr + 1).forEach((r, i) => {
    const get = k => mp[k] != null ? r[mp[k]] : '';
    const date = toYmd(get('date')); if (!date) return;
    const desc = String(get('desc') ?? '').trim();
    if (SKIP_RE.test(desc) || SKIP_RE.test(String(get('acct')))) return;
    const a1 = toNum(get('amt')), a2 = mp.amt2 != null ? toNum(get('amt2')) : 0;
    const amt = a1 || a2; if (!amt) return;
    out.push({i, date, amt, abs: Math.abs(amt), side: a1 ? 'a' : 'b', desc, acct: String(get('acct') ?? '').trim(), group: String(get('group') ?? '').trim() || '(미지정)',
      kind: String(get('kind') ?? '').trim(), party: String(get('party') ?? '').trim(), fund: String(get('fund') ?? '').trim()});
  });
  return out;
}

/* ---------- sample data (예시) ---------- */
function sampleBooks() {
  const j = [['[예시] 계정별원장 2026년 9월','','','','',''],['일자','계정과목','적요','차변','대변','잔액'],
    ['2026-09-01','','전월이월','','','12,450,000'],
    ['2026-09-02','사무용품비','A4용지·토너 구입','184,000','',''],['2026-09-05','공공요금','8월 전기요금','96,320','',''],
    ['2026-09-10','제세공과금','8월분 4대보험 기관부담','1,284,560','',''],['2026-09-12','여비','자립생활 교육 출장 교통비','42,800','',''],
    ['2026-09-15','회의비','운영위원회 다과','67,000','',''],['2026-09-19','차량비','센터 차량 주유','85,000','',''],
    ['2026-09-22','사업비','동료상담 프로그램 강사료','300,000','',''],['2026-09-25','인건비','9월 급여','18,640,000','',''],
    ['','','월계','20,699,680','','']];
  const m = [['날짜','재원','관','항','목','내용','거래처','지출액']];
  const add = (d, f, g, h, mk, c, p, a) => m.push([d, f, g, h, mk, c, p, a]);
  // 7~8월 (요약용)
  add('2026-07-03','보조금','사무비','운영비','사무용품비','복사용지','오피스디포',152000); add('2026-07-10','보조금','사무비','운영비','제세공과금','6월분 4대보험',' 국민건강보험공단',1262300);
  add('2026-07-25','보조금','사무비','인건비','급여','7월 급여','직원',18640000); add('2026-07-18','후원금','사업비','운영비','사업비','여름 나들이 차량 대여','OO관광',450000);
  add('2026-08-05','보조금','사무비','운영비','공공요금','7월 전기요금','한국전력',101200); add('2026-08-10','보조금','사무비','운영비','제세공과금','7월분 4대보험','국민건강보험공단',1270400);
  add('2026-08-25','보조금','사무비','인건비','급여','8월 급여','직원',18640000); add('2026-08-21','후원금','사업비','운영비','사업비','동료상담 교재 인쇄','OO인쇄',230000);
  add('2026-08-28','자부담','사무비','운영비','회의비','직원 워크숍 식비','OO식당',180000);
  // 9월 (대조용: 일부러 차이 만듦)
  add('2026-09-02','보조금','사무비','운영비','사무용품비','A4용지·토너','오피스디포',184000);
  add('2026-09-05','보조금','사무비','운영비','공공요금','8월 전기요금','한국전력',96320);
  add('2026-09-10','보조금','사무비','운영비','제세공과금','8월분 4대보험','국민건강보험공단',1284560);
  add('2026-09-11','보조금','사무비','운영비','여비','교육 출장 교통비','코레일',42800);   // 진우는 9/12 → 근접 일치
  add('2026-09-15','자부담','사무비','운영비','회의비','운영위원회 다과','OO제과',76000);  // 진우 67,000 → 금액 불일치
  add('2026-09-19','보조금','사무비','운영비','차량비','주유','OO주유소',85000);
  add('2026-09-22','후원금','사업비','운영비','사업비','동료상담 강사료','강사',300000);
  add('2026-09-23','후원금','사업비','운영비','사업비','추석 나눔 물품','OO마트',520000);   // 진우 미입력
  add('2026-09-25','보조금','사무비','인건비','급여','9월 급여','직원',18640000);
  return {j, m};
}
function loadSamples() {
  const {j, m} = sampleBooks();
  const mk = (name, rows) => ({name, sample:true, rows, hdr:detectHeader(rows), sheets:['Sheet1'], sheet:'Sheet1'});
  B.files.jinwoo = mk('예시_진우_계정별원장_2026-09.xlsx', j);
  B.files.manual = mk('예시_지출관리대장_2026.xlsx', m);
  B.files.summary = mk('예시_지출관리대장_2026.xlsx', m);
  B.files.entry = null;
  B.map.jinwoo = autoMap(j[B.files.jinwoo.hdr], MODES.recon.fields);
  B.map.manual = autoMap(m[B.files.manual.hdr], MODES.recon.fields);
  B.map.summary = autoMap(m[B.files.summary.hdr], MODES.summary.fields);
}

/* ---------- reconciliation ---------- */
function reconcile() {
  let A = items('jinwoo'), Bm = items('manual');
  const months = [...new Set([...A, ...Bm].map(x => x.date.slice(0, 7)))].sort();
  if (!B.period || !months.includes(B.period)) {
    const cnt = {}; A.forEach(x => cnt[x.date.slice(0,7)] = (cnt[x.date.slice(0,7)]||0) + 1);
    B.period = Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0] || months[months.length-1] || '';
  }
  if (B.period !== 'all') { A = A.filter(x => x.date.startsWith(B.period)); Bm = Bm.filter(x => x.date.startsWith(B.period)); }
  const usedB = new Set(), matched = [], near = [], diff = [];
  const idx = {}; Bm.forEach((b, i) => (idx[b.date + '|' + b.abs] ||= []).push(i));
  const restA = [];
  A.forEach(a => { const l = idx[a.date + '|' + a.abs]; const bi = l && l.find(i => !usedB.has(i)); if (bi != null) { usedB.add(bi); matched.push({a, b: Bm[bi]}); } else restA.push(a); });
  const restA2 = [];
  restA.forEach(a => {
    let best = -1, bd = 99;
    Bm.forEach((b, i) => { if (usedB.has(i) || b.abs !== a.abs) return; const dd = Math.abs((parseYmd(a.date) - parseYmd(b.date)) / 864e5); if (dd <= 3 && dd < bd) { bd = dd; best = i; } });
    if (best >= 0) { usedB.add(best); near.push({a, b: Bm[best], gap: bd}); } else restA2.push(a);
  });
  // 같은 날짜, 금액만 다른 건 (금액 불일치)
  const onlyA = [];
  restA2.forEach(a => {
    const bi = Bm.findIndex((b, i) => !usedB.has(i) && b.date === a.date);
    if (bi >= 0 && restA2.filter(x => x.date === a.date).length === 1 && Bm.filter((b, i) => !usedB.has(i) && b.date === a.date).length === 1) { usedB.add(bi); diff.push({a, b: Bm[bi], d: Bm[bi].abs - a.abs}); }
    else onlyA.push(a);
  });
  const onlyB = Bm.filter((_, i) => !usedB.has(i));
  const sum = l => l.reduce((s, x) => s + x.abs, 0);
  return {months, matched, near, diff, onlyA, onlyB, sumA: sum(A), sumB: sum(Bm), nA: A.length, nB: Bm.length};
}

/* ---------- views ---------- */
VIEWS.bridge = v => {
  if (!B.init) { loadSamples(); B.init = true; }
  const M = MODES[B.mode];
  v.innerHTML = `
  <div class="page-head"><div><h1>진우 ↔ 엑셀 연결</h1><p>진우정보시스템에서 내려받은 장부 엑셀과 수기로 관리하는 엑셀을 이어 붙입니다. 파일은 이 기기 안에서만 읽고, 어디로도 보내지 않아요.</p></div></div>
  <div class="seg" role="group" aria-label="작업 선택">${Object.entries(MODES).map(([k,o])=>`<button aria-pressed="${B.mode===k}" data-mode="${k}">${o.title}</button>`).join('')}</div>
  ${B.mode==='recon'?`<div class="note">진우 <b>회계 → 장부 → 계정별원장(또는 전표조회)</b>을 엑셀로 저장해 왼쪽에, 수기 지출·수입 대장을 오른쪽에 넣으세요. 날짜+금액으로 짝을 맞추고, 하루~사흘 어긋난 건과 금액이 다른 건을 따로 보여 줍니다. 월계·누계·이월 줄은 자동으로 뺍니다.</div>`:''}
  ${B.mode==='summary'?`<div class="note">재원(보조금·후원금·자부담 등)이나 계정별로 월 합계를 냅니다. 추경 검토나 월초 보고용 한 장 요약으로 쓰세요.</div>`:''}
  ${B.mode==='entry'?`<div class="note">진우에 쳐 넣어야 할 거래를 날짜순으로 정리합니다. 금액·적요를 누르면 복사되고, 입력을 마친 줄은 체크해 두면 이 기기에 기억돼요. <b>장부 대조</b>에서 "엑셀에만 있음" 건을 바로 보낼 수도 있어요.</div>`:''}
  <div class="grid-${M.slots.length===2?'2':'2'}" style="${M.slots.length===1?'grid-template-columns:1fr':''}">${M.slots.map(([k,t])=>slotHtml(k,t)).join('')}</div>
  <div id="bres"></div>`;
  $$('[data-mode]', v).forEach(b => b.onclick = () => { B.mode = b.dataset.mode; render(); });
  M.slots.forEach(([k]) => bindSlot(v, k));
  const out = $('#bres', v);
  if (B.mode === 'recon') renderRecon(out); else if (B.mode === 'summary') renderSummary(out); else renderEntry(out);
};
function slotHtml(k, title) {
  const f = B.files[k], M = MODES[B.mode];
  const hdr = f ? (f.rows[f.hdr] || []) : [];
  const opts = sel => `<option value="">— 없음 —</option>` + hdr.map((h, i) => `<option value="${i}" ${String(sel)===String(i)?'selected':''}>${esc(h || `(${XLSXcol(i)}열)`)}</option>`).join('');
  return `<section class="panel"><div class="panel-h"><h3>${esc(title)}</h3>${f&&f.sample?'<span class="chip warn">예시 데이터</span>':''}</div><div class="panel-b" style="display:flex;flex-direction:column;gap:12px">
    <label class="drop" data-drop="${k}">
      <span class="row"><span class="fn">${f?esc(f.name):'파일을 여기에 끌어 놓거나 눌러서 선택'}</span></span>
      <span class="faint small">.xlsx · .xls · .csv${f?` · 데이터 ${items(k).length}건 인식`:''}</span>
      <input type="file" id="file-${k}" accept=".xlsx,.xls,.csv,.xlsm" hidden>
    </label>
    ${f ? `<div class="row">${f.sheets.length>1?`<label class="f grow">시트<select class="inp" data-sheet="${k}">${f.sheets.map(s=>`<option ${s===f.sheet?'selected':''}>${esc(s)}</option>`).join('')}</select></label>`:''}
      <label class="f" style="width:130px">제목 줄<select class="inp" data-hdr="${k}">${f.rows.slice(0,20).map((r,i)=>`<option value="${i}" ${i===f.hdr?'selected':''}>${i+1}행</option>`).join('')}</select></label></div>
    <div class="map">${M.fields.map(fl=>`<label class="f">${FIELD[fl].label}${FIELD[fl].req&&!(fl==='group')?' *':''}<select class="inp" data-map="${k}:${fl}">${opts((B.map[k]||{})[fl])}</select></label>`).join('')}</div>` : ''}
  </div></section>`;
}
function XLSXcol(i) { let s = ''; i++; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }
function bindSlot(v, k) {
  const drop = $(`[data-drop="${k}"]`, v), inp = $(`#file-${k}`, v);
  const handle = async file => {
    if (!file) return;
    try {
      const wb = await readWorkbook(file);
      B.files[k] = {name:file.name, wb, sheets:wb.SheetNames, rows:[], hdr:0};
      setSheet(k, wb, wb.SheetNames[0]); B.period = '';
      toast(`${file.name} — ${items(k).length}건 읽었어요`); render();
    } catch (e) { toast('파일을 읽지 못했어요: ' + (e.message || e)); }
  };
  inp.onchange = () => handle(inp.files[0]);
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); handle(e.dataTransfer.files[0]); });
  const sh = $(`[data-sheet="${k}"]`, v); if (sh) sh.onchange = () => { setSheet(k, B.files[k].wb, sh.value); render(); };
  const hd = $(`[data-hdr="${k}"]`, v); if (hd) hd.onchange = () => { const f = B.files[k]; f.hdr = Number(hd.value); B.map[k] = autoMap(f.rows[f.hdr] || [], MODES[B.mode].fields); render(); };
  $$(`[data-map^="${k}:"]`, v).forEach(s => s.onchange = () => { const fl = s.dataset.map.split(':')[1]; (B.map[k] ||= {})[fl] = s.value === '' ? null : Number(s.value); rememberMap(k); render(); });
}
function missingReq(slot) {
  const mp = B.map[slot] || {}; return MODES[B.mode].fields.filter(f => FIELD[f].req && mp[f] == null).map(f => FIELD[f].label);
}
function tableHtml(cols, rows, foot) {
  return `<div class="tbl-wrap" style="max-height:460px;overflow:auto"><table class="tbl"><thead><tr>${cols.map(c=>`<th class="${c.r?'r':''}">${c.h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr ${r._attr||''}>${cols.map(c=>`<td class="${c.r?'r':''} ${c.cls||''}">${c.f(r)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${cols.length}" class="faint" style="text-align:center;padding:20px">해당 건이 없어요</td></tr>`}</tbody>${foot?`<tfoot><tr>${foot}</tr></tfoot>`:''}</table></div>`;
}
function renderRecon(out) {
  if (!B.files.jinwoo || !B.files.manual) { out.innerHTML = '<div class="empty panel">두 파일을 모두 넣으면 결과가 여기 나와요</div>'; return; }
  const miss = [...missingReq('jinwoo').map(x=>'진우: '+x), ...missingReq('manual').map(x=>'수기: '+x)];
  if (miss.length) { out.innerHTML = `<div class="note warn">열을 지정해 주세요 — ${esc(miss.join(', '))}</div>`; return; }
  const R = reconcile(), gap = R.sumB - R.sumA;
  const tabs = [['onlyB','엑셀에만 있음 (진우 입력 필요)',R.onlyB.length,'crit'],['onlyA','진우에만 있음',R.onlyA.length,'crit'],['diff','금액 불일치',R.diff.length,'warn'],['near','날짜 어긋남',R.near.length,'warn'],['matched','일치',R.matched.length,'ok']];
  if (!tabs.find(t => t[0] === B.resTab)) B.resTab = 'onlyB';
  const dt = x => `<span class="mono">${x.date.slice(5).replace('-','/')}</span>`;
  const money = x => `<span class="num">${won(x.abs)}</span>`;
  const C = {
    onlyB:[{h:'일자',f:r=>dt(r)},{h:'계정·목',f:r=>esc(r.acct)},{h:'적요',f:r=>esc(r.desc),cls:'wrap'},{h:'금액',r:1,f:money}],
    onlyA:[{h:'일자',f:r=>dt(r)},{h:'계정',f:r=>esc(r.acct)},{h:'적요',f:r=>esc(r.desc),cls:'wrap'},{h:'금액',r:1,f:money}],
    diff:[{h:'일자',f:r=>dt(r.a)},{h:'적요 (진우 / 엑셀)',f:r=>esc(r.a.desc)+'<br><span class="faint">'+esc(r.b.desc)+'</span>',cls:'wrap'},{h:'진우',r:1,f:r=>money(r.a)},{h:'엑셀',r:1,f:r=>money(r.b)},{h:'차이',r:1,f:r=>`<b class="num" style="color:var(--stamp)">${r.d>0?'+':''}${won(r.d)}</b>`}],
    near:[{h:'진우 일자',f:r=>dt(r.a)},{h:'엑셀 일자',f:r=>dt(r.b)},{h:'적요',f:r=>esc(r.a.desc||r.b.desc),cls:'wrap'},{h:'금액',r:1,f:r=>money(r.a)},{h:'',f:r=>`<span class="chip warn">${r.gap}일 차이</span>`}],
    matched:[{h:'일자',f:r=>dt(r.a)},{h:'진우 적요',f:r=>esc(r.a.desc),cls:'wrap'},{h:'엑셀 적요',f:r=>esc(r.b.desc),cls:'wrap'},{h:'금액',r:1,f:r=>money(r.a)}],
  };
  const list = R[B.resTab];
  out.innerHTML = `<section class="panel"><div class="panel-h"><h2>대조 결과</h2>
      <div class="row"><label class="f" style="flex-direction:row;align-items:center;gap:8px">기간<select class="inp" id="per" style="width:auto">${R.months.map(mm=>`<option value="${mm}" ${mm===B.period?'selected':''}>${mm.replace('-','년 ')}월</option>`).join('')}<option value="all" ${B.period==='all'?'selected':''}>전체</option></select></label>
      <button class="btn sm" id="r-copy">${icon('copy')}이 표 복사</button><button class="btn sm" id="r-xlsx" ${CAN_FILE?'':'title="GitHub 배포본에서 가능"'}>${icon('down')}결과 엑셀</button></div></div>
    <div class="panel-b" style="display:flex;flex-direction:column;gap:14px">
      <div class="stat-row">
        <div class="stat"><div class="v">${won(R.sumA)}</div><div class="l">진우 합계 · ${R.nA}건</div></div>
        <div class="stat"><div class="v">${won(R.sumB)}</div><div class="l">수기 엑셀 합계 · ${R.nB}건</div></div>
        <div class="stat ${gap?'crit':'ok'}"><div class="v">${gap>0?'+':''}${won(gap)}</div><div class="l">차액 (엑셀 − 진우)</div></div>
        <div class="stat ${R.onlyA.length+R.onlyB.length+R.diff.length?'warn':'ok'}"><div class="v">${R.onlyA.length+R.onlyB.length+R.diff.length+R.near.length}</div><div class="l">확인할 건</div></div>
      </div>
      <div class="seg" role="tablist">${tabs.map(([k,t,n,c])=>`<button role="tab" aria-pressed="${B.resTab===k}" data-rt="${k}">${t} <span class="chip ${n?c:''}" style="height:18px;margin-left:4px">${n}</span></button>`).join('')}</div>
      ${tableHtml(C[B.resTab], list)}
      ${B.resTab==='onlyB'&&R.onlyB.length?`<div class="row"><button class="btn primary" id="to-entry">${icon('right')}이 ${R.onlyB.length}건을 진우 입력 목록으로</button><span class="faint small">입력 목록에서 한 줄씩 복사·체크하며 진우에 넣으세요</span></div>`:''}
    </div></section>`;
  $('#per', out).onchange = e => { B.period = e.target.value; render(); };
  $$('[data-rt]', out).forEach(b => b.onclick = () => { B.resTab = b.dataset.rt; render(); });
  const toE = $('#to-entry', out);
  if (toE) toE.onclick = () => {
    const rows = [['일자','계정·목','적요','거래처','재원','금액'], ...R.onlyB.map(x => [x.date, x.acct, x.desc, '', '', x.abs])];
    // 원본 수기 행에서 거래처·재원 가져오기
    const src = B.files.manual, hdr = src.rows[src.hdr].map(String);
    const pi = hdr.findIndex(h => FIELD.party.re.test(h)), fi = hdr.findIndex(h => FIELD.fund.re.test(h));
    R.onlyB.forEach((x, n) => { const r = src.rows[src.hdr + 1 + x.i]; if (pi >= 0) rows[n+1][3] = r[pi]; if (fi >= 0) rows[n+1][4] = r[fi]; });
    B.files.entry = {name:`대조결과_엑셀에만있음_${B.period}.xlsx`, rows, hdr:0, sheets:['입력목록'], sheet:'입력목록', fromRecon:true};
    B.map.entry = autoMap(rows[0], MODES.entry.fields); B.mode = 'entry'; render(); toast(`${R.onlyB.length}건을 입력 목록으로 보냈어요`);
  };
  const flat = {
    onlyB: r => [r.date, r.acct, r.desc, r.abs], onlyA: r => [r.date, r.acct, r.desc, r.abs],
    diff: r => [r.a.date, r.a.desc, r.b.desc, r.a.abs, r.b.abs, r.d], near: r => [r.a.date, r.b.date, r.a.desc || r.b.desc, r.a.abs, r.gap],
    matched: r => [r.a.date, r.a.desc, r.b.desc, r.a.abs],
  };
  const heads = {onlyB:['일자','계정','적요','금액'], onlyA:['일자','계정','적요','금액'], diff:['일자','진우 적요','엑셀 적요','진우 금액','엑셀 금액','차이'], near:['진우 일자','엑셀 일자','적요','금액','일수 차이'], matched:['일자','진우 적요','엑셀 적요','금액']};
  $('#r-copy', out).onclick = () => copyText([heads[B.resTab], ...list.map(flat[B.resTab])].map(r => r.join('\t')).join('\n'), '표를 복사했어요. 엑셀에 붙여 넣으세요');
  $('#r-xlsx', out).onclick = () => {
    if (!CAN_FILE) { toast('엑셀 저장은 GitHub 배포본에서 돼요. 여기서는 "이 표 복사"를 써 주세요'); return; }
    const wb = XLSX.utils.book_new();
    tabs.forEach(([k, t]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([heads[k], ...R[k].map(flat[k])]), t.replace(/[()\/]/g,'').slice(0, 28)));
    const buf = XLSX.write(wb, {bookType:'xlsx', type:'array'}); download(`진우대조_${B.period}.xlsx`, new Blob([buf])); toast('결과 엑셀을 저장했어요');
  };
}
function renderSummary(out) {
  if (!B.files.summary) { out.innerHTML = '<div class="empty panel">파일을 넣으면 요약표가 여기 나와요</div>'; return; }
  const miss = missingReq('summary'); if (miss.length) { out.innerHTML = `<div class="note warn">열을 지정해 주세요 — ${esc(miss.join(', '))}</div>`; return; }
  const it = items('summary'); const months = [...new Set(it.map(x => x.date.slice(0, 7)))].sort();
  const hasKind = (B.map.summary || {}).kind != null;
  const groups = {}; it.forEach(x => { const g = (hasKind && x.kind ? x.kind + ' · ' : '') + x.group; (groups[g] ||= {}); groups[g][x.date.slice(0,7)] = (groups[g][x.date.slice(0,7)] || 0) + x.abs; });
  const gk = Object.keys(groups).sort();
  const colTot = months.map(mm => gk.reduce((s, g) => s + (groups[g][mm] || 0), 0)), grand = colTot.reduce((a, b) => a + b, 0);
  const maxV = Math.max(1, ...gk.map(g => months.reduce((s, mm) => s + (groups[g][mm]||0), 0)));
  out.innerHTML = `<section class="panel"><div class="panel-h"><h2>${hasKind?'구분·':''}${esc(String((B.files.summary.rows[B.files.summary.hdr]||[])[B.map.summary.group] || '재원'))} × 월 합계</h2>
    <div class="row"><button class="btn sm" id="s-copy">${icon('copy')}표 복사</button><button class="btn sm" id="s-xlsx">${icon('down')}엑셀</button></div></div>
    <div class="panel-b" style="display:flex;flex-direction:column;gap:14px">
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>구분</th>${months.map(mm=>`<th class="r">${Number(mm.slice(5))}월</th>`).join('')}<th class="r">합계</th><th>비중</th></tr></thead><tbody>
    ${gk.map(g => { const t = months.reduce((s, mm) => s + (groups[g][mm]||0), 0); return `<tr><td><b>${esc(g)}</b></td>${months.map(mm=>`<td class="r">${groups[g][mm]?won(groups[g][mm]):'<span class="faint">–</span>'}</td>`).join('')}<td class="r"><b>${won(t)}</b></td><td style="min-width:120px"><div class="prog"><i style="width:${Math.round(t/maxV*100)}%"></i></div><span class="faint small num">${grand?Math.round(t/grand*1000)/10:0}%</span></td></tr>`; }).join('')}
    </tbody><tfoot><tr><td>월 합계</td>${colTot.map(v=>`<td class="r">${won(v)}</td>`).join('')}<td class="r">${won(grand)}</td><td></td></tr></tfoot></table></div>
    <div class="faint small">${it.length}건 집계 · 월계·누계·이월 줄 제외 · 금액은 절댓값 기준</div></div></section>`;
  const aoa = [['구분', ...months.map(mm => mm), '합계'], ...gk.map(g => [g, ...months.map(mm => groups[g][mm] || 0), months.reduce((s, mm) => s + (groups[g][mm]||0), 0)]), ['월 합계', ...colTot, grand]];
  $('#s-copy', out).onclick = () => copyText(aoa.map(r => r.join('\t')).join('\n'), '요약표를 복사했어요. 엑셀에 붙여 넣으세요');
  $('#s-xlsx', out).onclick = () => { if (!CAN_FILE) { toast('엑셀 저장은 GitHub 배포본에서 돼요. "표 복사"를 써 주세요'); return; }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '재원별월합계'); download(`재원월요약_${ymd(today())}.xlsx`, new Blob([XLSX.write(wb, {bookType:'xlsx', type:'array'})])); };
}
function entryKey(x) { return [x.date, x.acct, x.desc, x.abs].join('|'); }
function renderEntry(out) {
  if (!B.files.entry) { out.innerHTML = `<div class="empty panel">파일을 넣거나, <a href="#bridge" id="go-recon">장부 대조</a>에서 "엑셀에만 있음" 건을 보내세요</div>`; const g = $('#go-recon', out); if (g) g.onclick = e => { e.preventDefault(); B.mode = 'recon'; render(); }; return; }
  const miss = missingReq('entry'); if (miss.length) { out.innerHTML = `<div class="note warn">열을 지정해 주세요 — ${esc(miss.join(', '))}</div>`; return; }
  const all = items('entry').sort((a, b) => a.date.localeCompare(b.date));
  const doneN = all.filter(x => S.entered[entryKey(x)]).length;
  const list = B.onlyUnentered ? all.filter(x => !S.entered[entryKey(x)]) : all;
  out.innerHTML = `<section class="panel"><div class="panel-h"><div><h2>진우 입력 목록</h2><div class="faint small">금액·적요를 누르면 복사돼요</div></div>
    <div class="row"><span class="chip ${doneN===all.length&&all.length?'ok':'acc'} num">${doneN}/${all.length} 입력</span><label class="row small"><input type="checkbox" id="unent" ${B.onlyUnentered?'checked':''}> 남은 것만</label></div></div>
    <div style="padding:10px 16px 0"><div class="prog"><i style="width:${all.length?doneN/all.length*100:0}%"></i></div></div>
    <div class="panel-b">${tableHtml([
      {h:'입력', f:x=>`<button class="check" aria-pressed="${!!S.entered[entryKey(x)]}" data-ent="${esc(entryKey(x))}" aria-label="입력 완료">${S.entered[entryKey(x)]?icon('check'):''}</button>`},
      {h:'일자', f:x=>`<span class="mono copyc" data-cp="${x.date}">${x.date}</span>`},
      {h:'계정·목', f:x=>esc(x.acct)},
      {h:'적요', cls:'wrap t', f:x=>`<span class="copyc" data-cp="${esc(x.desc)}">${esc(x.desc)||'<span class="faint">–</span>'}</span>`},
      {h:'거래처', f:x=>esc(x.party)}, {h:'재원', f:x=>esc(x.fund)},
      {h:'금액', r:1, f:x=>`<b class="num copyc" data-cp="${x.abs}">${won(x.abs)}</b>`},
    ], list.map(x => Object.assign({_attr: S.entered[entryKey(x)] ? 'class="entered"' : ''}, x)),
    `<td colspan="6">합계 ${list.length}건</td><td class="r">${won(list.reduce((s,x)=>s+x.abs,0))}</td>`)}</div></section>`;
  $('#unent', out).onchange = e => { B.onlyUnentered = e.target.checked; render(); };
  out.addEventListener('click', e => {
    const c = e.target.closest('[data-cp]'); if (c) { copyText(c.dataset.cp, `복사: ${c.dataset.cp}`); return; }
    const b = e.target.closest('[data-ent]'); if (b) { const k = b.dataset.ent; if (S.entered[k]) delete S.entered[k]; else S.entered[k] = Date.now(); save(); render(); }
  });
}
