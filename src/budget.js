/* ================= 예산 · 재원별 잔액 · 계정별 · 사업별 =================
   데이터: S.budget = {year, funds:[{id,name,owner,mine}], lines:[{id,y,fund,type,gwan,hang,mok,proj,owner,kw,base,sup1,sup2}],
                       ledgers:{'fund|year':{file,up,from,to,rows:[[mmdd,acct,proj,dr,cr,memo]]}}, alias:{'fund|y|계정':lineMokKey}}
   모든 데이터는 이 기기 브라우저에만 저장 (공개 사이트에는 없음) */
const BG = {tab:'fund', fund:'', type:'out', mine:false, projFund:'all', open:{}};
const BG_TYPES = {out:'세출', in:'세입'};
const IN_RE = /수입|보조금|후원금|전입|이월금|이자|수익|잡수입|입금|세입|자부담\s*수입|환급/;
function bgState() {
  const y = today().getFullYear();
  S.budget = S.budget || {};
  const b = S.budget;
  b.year = b.year || y; b.funds = b.funds || [
    {id:'f1', name:'서울시 보조 (IL센터지원)', owner:'', mine:true}, {id:'f2', name:'구비 보조', owner:'', mine:true},
    {id:'f3', name:'활동지원', owner:'', mine:false}, {id:'f4', name:'주택 (코디)', owner:'', mine:false},
    {id:'f5', name:'PAS', owner:'', mine:false}, {id:'f6', name:'후원금', owner:'', mine:false}, {id:'f7', name:'자부담·자율재원', owner:'', mine:false}];
  b.lines = b.lines || []; b.ledgers = b.ledgers || {}; b.alias = b.alias || {};
  if (!BG.fund || !b.funds.some(f => f.id === BG.fund)) BG.fund = (b.funds[0] || {}).id || '';
  return b;
}
const bnorm = s => String(s || '').replace(/\[[^\]]*\]|\([^)]*\)|계정과목|계정명|계정|과목|세목|[:：]/g, '').replace(/^[\s\d.\-]+/, '').replace(/[\s·.\-_/]/g, '').trim();
const curBudget = l => Number(l.sup2) || Number(l.sup1) || Number(l.base) || 0;
const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : 0;
const fundName = id => (bgState().funds.find(f => f.id === id) || {}).name || '(재원 없음)';

/* ---------- 원장 파싱 (진우 총계정별원장 · 계정별원장) ---------- */
const LFIELD = {
  date:{label:'일자', re:/일\s*자|날짜|거래일|전표일|결의일/},
  desc:{label:'적요', re:/적\s*요|내\s*용|내역/},
  dr:{label:'차변 (지출)', re:/차\s*변|지출|출금|금액/},
  cr:{label:'대변 (수입)', re:/대\s*변|수입|입금/},
  acct:{label:'계정·목 (열이 있으면)', re:/계정|과목|세\s*목|^목$/},
  proj:{label:'사업명 (열이 있으면)', re:/사업|프로젝트|단위/},
};
function ledgerHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const c = rows[i].map(x => String(x || '').trim());
    const hit = ['date', 'desc', 'dr', 'cr'].filter(k => c.some(x => x && x.length < 12 && LFIELD[k].re.test(x))).length;
    if (hit >= 3) return i;
  }
  return -1;
}
function ledgerAutoMap(h) {
  const m = {}, used = new Set();
  ['date', 'desc', 'cr', 'dr', 'acct', 'proj'].forEach(k => { const i = h.findIndex((x, j) => !used.has(j) && String(x || '').trim().length < 14 && LFIELD[k].re.test(String(x || ''))); if (i >= 0) { m[k] = i; used.add(i); } });
  return m;
}
/* 계정이 열이 아니라 "구획 제목 줄"로 나오는 원장 대응: 날짜·금액 없는 줄의 글자를 계정으로 */
function parseLedger(rows, hdr, mp, y = bgState().year) {
  const dt = v => { const d = toYmd(v); if (d) return d; const m = String(v ?? '').trim().match(/^(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})일?$/); return m && Number(m[1]) <= 12 ? `${y}-${pad(m[1])}-${pad(m[2])}` : null; };
  let acct = ''; const out = []; let min = '9999', max = '0000';
  rows.slice(hdr + 1).forEach(r => {
    const get = k => mp[k] != null ? r[mp[k]] : '';
    const date = dt(get('date')), dr = toNum(get('dr')), cr = toNum(get('cr'));
    const texts = r.map(x => (x instanceof Date ? '' : String(x ?? '').trim())).filter(Boolean);
    const line = texts.join(' ');
    if (!date) {
      if (!dr && !cr && texts.length && texts.length <= 4 && !SKIP_RE.test(line)) {
        const t = texts.find(x => /계정|과목|\[\d+\]|^\d{3,}\s*\S/.test(x)) || (texts.length <= 2 ? texts[0] : '');
        if (t && !LFIELD.date.re.test(t)) acct = t.replace(/^.*?(계정과목|계정명|계정)\s*[:：]?\s*/, '').trim();
      }
      return;
    }
    const desc = String(get('desc') ?? '').trim();
    if (SKIP_RE.test(desc) || (!dr && !cr)) return;
    const a = mp.acct != null && String(get('acct')).trim() ? String(get('acct')).trim() : acct;
    const md = date.slice(5, 7) + date.slice(8, 10); if (md < min) min = md; if (md > max) max = md;
    out.push([md, a || '(계정 없음)', mp.proj != null ? String(get('proj') ?? '').trim() : '', dr, cr, desc.slice(0, 60), date.slice(0, 4)]);
  });
  return {rows: out, from: min, to: max};
}

/* ---------- 집계 ---------- */
function linesOf(fund, y = bgState().year) { return bgState().lines.filter(l => l.fund === fund && Number(l.y) === Number(y)); }
function matchLine(fund, y, acct, proj, memo) {
  const b = bgState(), n = bnorm(acct), al = b.alias[`${fund}|${y}|${n}`];
  const cands = linesOf(fund, y).filter(l => bnorm(l.mok) === (al || n));
  if (!cands.length) return null;
  if (cands.length === 1) return cands[0];
  const pj = bnorm(proj), m = String(memo || '');
  const byProj = cands.find(l => l.proj && pj && (bnorm(l.proj) === pj || pj.includes(bnorm(l.proj)) || bnorm(l.proj).includes(pj)));
  if (byProj) return byProj;
  const byKw = cands.find(l => l.proj && [l.proj, ...String(l.kw || '').split(',')].map(x => x.trim()).filter(x => x.length >= 2).some(k => m.includes(k)));
  if (byKw) return byKw;
  return cands.find(l => !l.proj) || {unassigned: true, mok: cands[0].mok, type: cands[0].type, gwan: cands[0].gwan, hang: cands[0].hang, fund, y};
}
/* 결과: {byLine:{id:{amt,mon[12],rows[]}}, unmatched:{acct:{n,dr,cr,rows}}, unassigned:{mok:{amt,rows}}, lastMon} */
function computeFund(fund, y = bgState().year) {
  const b = bgState(), L = b.ledgers[`${fund}|${y}`], res = {byLine:{}, unmatched:{}, unassigned:{}, lastMon: 0, has: !!L};
  if (!L) return res;
  res.lastMon = Number(String(L.to || '').slice(0, 2)) || 0;
  L.rows.forEach(r => {
    const [md, acct, proj, dr, cr, memo] = r, mon = Number(md.slice(0, 2)) - 1;
    const l = matchLine(fund, y, acct, proj, memo);
    if (!l) { const u = res.unmatched[acct] ||= {n: 0, dr: 0, cr: 0, rows: []}; u.n++; u.dr += dr; u.cr += cr; u.rows.push(r); return; }
    const amt = l.type === 'in' ? cr - dr : dr - cr;
    if (l.unassigned) { const u = res.unassigned[l.mok] ||= {amt: 0, rows: [], type: l.type}; u.amt += amt; u.rows.push(r); return; }
    const x = res.byLine[l.id] ||= {amt: 0, mon: Array(12).fill(0), rows: []};
    x.amt += amt; if (mon >= 0 && mon < 12) x.mon[mon] += amt; x.rows.push(r);
  });
  return res;
}
function fundSummary(fund, y) {
  const c = computeFund(fund, y), ls = linesOf(fund, y), sum = {out:{base:0, cur:0, used:0}, in:{base:0, cur:0, used:0}};
  ls.forEach(l => { const s = sum[l.type] || sum.out; s.base += Number(l.base) || 0; s.cur += curBudget(l); s.used += (c.byLine[l.id] || {}).amt || 0; });
  Object.values(c.unassigned).forEach(u => { (sum[u.type] || sum.out).used += u.amt; });
  const um = Object.values(c.unmatched).reduce((a, u) => a + u.n, 0);
  return {c, ls, sum, um};
}
function paceNote(rate, lastMon) {
  if (!lastMon) return '';
  const el = Math.round(lastMon / 12 * 100);
  if (rate > 100) return `<span class="chip crit">초과</span>`;
  if (rate - el > 15) return `<span class="chip warn" title="경과 ${el}% 대비">빠름</span>`;
  if (el - rate > 30) return `<span class="chip" title="경과 ${el}% 대비">느림</span>`;
  return '';
}
const bar = (r, lastMon) => `<div class="bgbar" title="집행률 ${r}%${lastMon ? ` · 경과 ${Math.round(lastMon / 12 * 100)}%` : ''}"><i style="width:${Math.min(100, r)}%;${r > 100 ? 'background:var(--stamp)' : ''}"></i>${lastMon ? `<b style="left:${lastMon / 12 * 100}%"></b>` : ''}</div>`;

/* ---------- 화면 ---------- */
VIEWS.budget = v => {
  const b = bgState(), y = b.year;
  const tabs = [['fund', '재원별 잔액'], ['led', '원장 계정별'], ['grant', '교부·집행 격자'], ['settle', '세목별 정산'], ['acct', '계정별 세부'], ['proj', '사업별 사용액'], ['plan', '예산 입력'], ['unm', '미분류']];
  const umTotal = b.funds.reduce((a, f) => a + (linesOf(f.id, y).length ? fundSummary(f.id, y).um : 0), 0);
  v.innerHTML = `
  <div class="page-head"><div><h1>예산 · 잔액</h1><p>연초 예산(본예산·추경)과 진우 <b>총계정별원장</b> 엑셀을 맞춰 재원별·계정별·사업별 집행액과 잔액을 봅니다. 파일은 이 기기 안에서만 읽어요.</p></div>
    <div class="row"><select class="inp" id="bg-y" style="width:auto">${[y - 1, y, y + 1].map(x => `<option ${x === y ? 'selected' : ''}>${x}</option>`).join('')}</select>
    <button class="btn" id="bg-ex" title="출장 웹앱 등 다른 앱과 예산을 주고받는 파일">${icon('down')}예산 교환 파일</button><button class="btn primary" id="bg-up">${icon('plus')}원장 올리기</button></div></div>
  <div class="seg" role="group" aria-label="보기">${tabs.map(([k, n]) => `<button aria-pressed="${BG.tab === k}" data-bt="${k}">${n}${k === 'unm' && umTotal ? ` <span class="chip warn" style="height:18px;padding:0 6px">${umTotal}</span>` : ''}</button>`).join('')}</div>
  <div id="bg-body"></div>`;
  $('#bg-y', v).onchange = e => { b.year = Number(e.target.value); save(); render(); };
  $('#bg-up', v).onclick = () => uploadLedger(BG.tab === 'fund' ? '' : BG.fund);
  $('#bg-ex', v).onclick = () => exchangeSheet();
  $$('[data-bt]', v).forEach(x => x.onclick = () => { BG.tab = x.dataset.bt; render(); });
  const body = $('#bg-body', v);
  ({fund: bgFundView, led: bgLedView, grant: bgGrantView, settle: bgSettleView, acct: bgAcctView, proj: bgProjView, plan: bgPlanView, unm: bgUnmView})[BG.tab](body, b, y);
};
function fundSelect(b, extra = '') {
  return `<select class="inp" id="bg-f" style="width:auto;min-width:200px">${extra}${b.funds.map(f => `<option value="${f.id}" ${BG.fund === f.id ? 'selected' : ''}>${esc(f.name)}${f.owner ? ' · ' + esc(f.owner) : ''}</option>`).join('')}</select>`;
}
function bindFundSelect(el) { const s = $('#bg-f', el); if (s) s.onchange = e => { BG.fund = e.target.value; render(); }; }

function bgFundView(el, b, y) {
  const funds = b.funds.filter(f => !BG.mine || f.mine);
  const anyPlan = b.lines.some(l => Number(l.y) === y);
  el.innerHTML = `
  ${!anyPlan ? `<div class="note">아직 ${y}년 예산이 없어요. <b>예산 입력</b> 탭에서 엑셀 예산서를 붙여 넣거나, <button class="btn sm" id="bg-demo">예시 데이터로 둘러보기</button></div>` : ''}
  <div class="row"><label class="row small"><input type="checkbox" id="bg-mine" ${BG.mine ? 'checked' : ''}> 내 담당 재원만</label><span class="grow"></span><button class="btn ghost sm" id="bg-funds">${icon('edit')}재원·담당자 편집</button>${b.lines.some(l => l.demo) ? '<button class="btn ghost sm" id="bg-undemo">예시 지우기</button>' : ''}<button class="btn ghost sm" id="bg-xls">${icon('down')}엑셀로 내보내기</button></div>
  <div class="bg-cards">${funds.map(f => { const s = fundSummary(f.id, y), o = s.sum.out, i = s.sum.in, r = pct(o.used, o.cur), L = b.ledgers[`${f.id}|${y}`];
    if (!s.ls.length && !L) return `<section class="panel bg-card empty-f"><div class="panel-h"><div style="min-width:0"><h3>${esc(f.name)}</h3><div class="faint small">${f.owner ? '담당 ' + esc(f.owner) : '담당 미지정'} · ${y}년 예산·원장 없음</div></div></div>
      <div class="panel-b row" style="gap:6px"><button class="btn sm" data-go-plan="${f.id}">예산 입력</button><button class="btn ghost sm" data-up="${f.id}">원장 올리기</button></div></section>`;
    return `<section class="panel bg-card"><div class="panel-h"><div style="min-width:0"><h3>${esc(f.name)}</h3><div class="faint small">${f.owner ? '담당 ' + esc(f.owner) : '담당 미지정'}${f.mine ? ' · <span class="chip acc" style="height:18px;padding:0 6px">내 담당</span>' : ''}</div></div>
      <button class="btn ghost sm" data-go-acct="${f.id}">계정별</button></div>
      <div class="panel-b" style="display:flex;flex-direction:column;gap:10px">
        <div class="bg-kv"><div><span>세출 예산</span><b class="num">${won(o.cur)}</b>${o.cur !== o.base ? `<em class="faint small">본예산 ${won(o.base)}</em>` : ''}</div><div><span>집행</span><b class="num">${won(o.used)}</b></div><div><span>잔액</span><b class="num ${o.cur - o.used < 0 ? 'neg' : ''}">${won(o.cur - o.used)}</b></div></div>
        <div class="row small" style="gap:8px">${bar(r, s.c.lastMon)}<span class="num">${r}%</span>${paceNote(r, s.c.lastMon)}</div>
        ${i.cur || i.used ? `<div class="small muted">세입 ${won(i.used)} / 예산 ${won(i.cur)} (${pct(i.used, i.cur)}%)</div>` : ''}
        <div class="small faint">${L && L.demo ? '<span class="chip warn" style="height:18px;padding:0 6px">예시</span> ' : ''}${L ? `원장 ${L.from.slice(0, 2)}/${L.from.slice(2)}~${L.to.slice(0, 2)}/${L.to.slice(2)} · ${L.rows.length}건 · ${esc(L.up)} 올림` : '원장 없음'}${s.um ? ` · <a href="#budget" data-go-unm>미분류 ${s.um}건</a>` : ''}</div>
        <div class="row" style="gap:6px"><button class="btn sm" data-up="${f.id}">${L ? '원장 다시 올리기' : '원장 올리기'}</button>${linesOf(f.id, y).length ? '' : `<button class="btn ghost sm" data-go-plan="${f.id}">예산 입력</button>`}</div>
      </div></section>`; }).join('')}</div>
  <div class="note small">막대의 세로선은 원장 마지막 달 기준 <b>경과율</b>이에요 (예: 9월까지면 75%). 집행률이 경과율보다 15%p 넘게 빠르면 "빠름", 30%p 넘게 느리면 "느림"으로 표시해요.</div>`;
  const d = $('#bg-demo', el); if (d) d.onclick = () => { loadBudgetDemo(); render(); toast('예시 데이터를 넣었어요 (예시 재원에만)'); };
  $('#bg-mine', el).onchange = e => { BG.mine = e.target.checked; render(); };
  $('#bg-funds', el).onclick = editFunds;
  $('#bg-xls', el).onclick = () => exportBudgetXlsx(y);
  const ud = $('#bg-undemo', el); if (ud) ud.onclick = () => { b.lines = b.lines.filter(l => !l.demo); Object.keys(b.ledgers).forEach(k => { if (b.ledgers[k].demo) delete b.ledgers[k]; }); save(); render(); toast('예시 데이터를 지웠어요'); };
  el.addEventListener('click', e => {
    const a = e.target.closest('[data-go-acct]'); if (a) { BG.fund = a.dataset.goAcct; BG.tab = (linesOf(a.dataset.goAcct, y).length ? 'acct' : 'led'); render(); return; }
    const p = e.target.closest('[data-go-plan]'); if (p) { BG.fund = p.dataset.goPlan; BG.tab = 'plan'; render(); return; }
    if (e.target.closest('[data-go-unm]')) { e.preventDefault(); BG.tab = 'unm'; render(); return; }
    const u = e.target.closest('[data-up]'); if (u) uploadLedger(u.dataset.up);
  });
}

function bgAcctView(el, b, y) {
  const s = fundSummary(BG.fund, y), c = s.c, lm = c.lastMon;
  const ls = s.ls.filter(l => l.type === BG.type);
  const groups = {};
  ls.forEach(l => { ((groups[l.gwan || '(관 없음)'] ||= {})[l.hang || '(항 없음)'] ||= []).push(l); });
  const tot = ls => ls.reduce((a, l) => { const u = (c.byLine[l.id] || {}).amt || 0; a.base += Number(l.base) || 0; a.cur += curBudget(l); a.used += u; return a; }, {base: 0, cur: 0, used: 0});
  const row = (label, t, cls, extra = '', mon) => { const r = pct(t.used, t.cur);
    return `<tr class="${cls}" ${extra}><td class="wrap">${label}</td><td class="r">${won(t.base)}</td><td class="r">${t.cur !== t.base ? `${won(t.cur)}<div class="faint small">${t.cur > t.base ? '+' : ''}${won(t.cur - t.base)}</div>` : won(t.cur)}</td><td class="r">${won(t.used)}</td><td class="r ${t.cur - t.used < 0 ? 'neg' : ''}"><b>${won(t.cur - t.used)}</b></td><td class="r">${r}% ${paceNote(r, lm)}</td>${mon ? `<td>${monCells(mon)}</td>` : '<td></td>'}</tr>`; };
  const unas = Object.entries(c.unassigned).filter(([, u]) => u.type === BG.type);
  let html = '';
  Object.entries(groups).forEach(([g, hs]) => {
    const gl = Object.values(hs).flat(); html += row(`<b>${esc(g)}</b>`, tot(gl), 'bg-g');
    Object.entries(hs).forEach(([h, arr]) => {
      html += row(`<span style="padding-left:12px">${esc(h)}</span>`, tot(arr), 'bg-h');
      arr.forEach(l => { const x = c.byLine[l.id]; html += row(`<span style="padding-left:26px">${esc(l.mok)}</span>${l.proj ? ` <span class="chip acc">${esc(l.proj)}</span>` : ''}`, tot([l]), 'bg-l', `data-line="${l.id}" style="cursor:pointer"`, x ? x.mon : Array(12).fill(0)); });
    });
  });
  const T = tot(ls);
  el.innerHTML = `
  <div class="row">${fundSelect(b)}<div class="seg" role="group">${Object.entries(BG_TYPES).map(([k, n]) => `<button aria-pressed="${BG.type === k}" data-ty="${k}">${n}</button>`).join('')}</div><span class="grow"></span>
    <span class="faint small">${c.has ? `원장 ${lm}월까지 · 경과 ${Math.round(lm / 12 * 100)}%` : '원장 없음'}</span><button class="btn sm" data-up="${BG.fund}">원장 올리기</button></div>
  ${ls.length ? `<div class="tbl-wrap"><table class="tbl bg-tbl"><thead><tr><th>관 · 항 · 목</th><th class="r">본예산 (연초)</th><th class="r">현재 예산 (추경)</th><th class="r">집행 누계</th><th class="r">잔액</th><th class="r">집행률</th><th>월별 집행 1~12월</th></tr></thead>
    <tbody>${html}${unas.map(([m, u]) => `<tr class="bg-l"><td class="wrap"><span style="padding-left:26px">${esc(m)}</span> <span class="chip warn">사업 미지정</span></td><td></td><td></td><td class="r">${won(u.amt)}</td><td></td><td></td><td class="small faint">사업별 예산이 나뉜 목인데 적요로 사업을 못 찾았어요 → 사업별 탭</td></tr>`).join('')}</tbody>
    <tfoot><tr class="bg-g"><td><b>${BG_TYPES[BG.type]} 합계</b></td><td class="r">${won(T.base)}</td><td class="r">${won(T.cur)}</td><td class="r">${won(T.used + unas.reduce((a, [, u]) => a + u.amt, 0))}</td><td class="r"><b>${won(T.cur - T.used - unas.reduce((a, [, u]) => a + u.amt, 0))}</b></td><td class="r">${pct(T.used + unas.reduce((a, [, u]) => a + u.amt, 0), T.cur)}%</td><td></td></tr></tfoot></table></div>
    <div class="faint small">줄을 누르면 해당 계정의 원장 내역이 나와요.</div>`
  : `<div class="empty">${esc(fundName(BG.fund))} ${y}년 ${BG_TYPES[BG.type]} 예산이 없어요. <a href="#budget" data-go-plan>예산 입력</a>에서 넣어 주세요.</div>`}`;
  bindFundSelect(el);
  $$('[data-ty]', el).forEach(x => x.onclick = () => { BG.type = x.dataset.ty; render(); });
  el.addEventListener('click', e => {
    const u = e.target.closest('[data-up]'); if (u) return uploadLedger(u.dataset.up);
    if (e.target.closest('[data-go-plan]')) { e.preventDefault(); BG.tab = 'plan'; render(); return; }
    const tr = e.target.closest('[data-line]'); if (tr) lineDetail(tr.dataset.line, c);
  });
}
function monCells(mon) { const mx = Math.max(...mon.map(Math.abs), 1);
  return `<div class="moncells">${mon.map((m, i) => `<i title="${i + 1}월 ${won(m)}" style="opacity:${m ? 0.25 + 0.75 * Math.abs(m) / mx : 0.08}"></i>`).join('')}</div>`; }
function lineDetail(id, c) {
  const l = bgState().lines.find(x => x.id === id); if (!l) return; const x = c.byLine[id] || {amt: 0, mon: Array(12).fill(0), rows: []};
  sheet({title: `${l.mok}${l.proj ? ' · ' + l.proj : ''}`, wide: true, body: `
    <div class="bg-kv"><div><span>현재 예산</span><b class="num">${won(curBudget(l))}</b></div><div><span>집행</span><b class="num">${won(x.amt)}</b></div><div><span>잔액</span><b class="num">${won(curBudget(l) - x.amt)}</b></div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr>${x.mon.map((_, i) => `<th class="r">${i + 1}월</th>`).join('')}</tr></thead><tbody><tr>${x.mon.map(m => `<td class="r">${m ? won(m) : '·'}</td>`).join('')}</tr></tbody></table></div>
    <div class="tbl-wrap" style="max-height:50vh;overflow:auto"><table class="tbl"><thead><tr><th>일자</th><th>적요</th><th>사업</th><th class="r">금액</th></tr></thead><tbody>
    ${x.rows.length ? x.rows.map(r => `<tr><td class="mono small">${r[0].slice(0, 2)}/${r[0].slice(2)}</td><td class="wrap">${esc(r[5])}</td><td class="small">${esc(r[2])}</td><td class="r">${won(l.type === 'in' ? r[4] - r[3] : r[3] - r[4])}</td></tr>`).join('') : '<tr><td colspan="4" class="faint">원장 내역 없음</td></tr>'}</tbody></table></div>`,
    foot: `<button class="btn" data-close>닫기</button>`});
}

function bgProjView(el, b, y) {
  const fs = BG.projFund === 'all' ? b.funds.map(f => f.id) : [BG.projFund];
  const rows = [];
  fs.forEach(fid => { const c = computeFund(fid, y); const byP = {};
    linesOf(fid, y).filter(l => l.proj && l.type === 'out').forEach(l => { const p = byP[l.proj] ||= {fund: fid, proj: l.proj, owner: l.owner || '', cur: 0, base: 0, used: 0, lines: []};
      p.cur += curBudget(l); p.base += Number(l.base) || 0; p.used += (c.byLine[l.id] || {}).amt || 0; p.lines.push(l); if (l.owner && !p.owner) p.owner = l.owner; });
    Object.values(byP).forEach(p => { p.lastMon = c.lastMon; p.c = c; rows.push(p); });
    Object.entries(c.unassigned).forEach(([m, u]) => { if (u.type === 'out') rows.push({fund: fid, proj: null, mok: m, used: u.amt, rows: u.rows}); });
  });
  el.innerHTML = `
  <div class="row"><select class="inp" id="bg-pf" style="width:auto"><option value="all">모든 재원</option>${b.funds.map(f => `<option value="${f.id}" ${BG.projFund === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select><span class="grow"></span><span class="faint small">예산 입력에서 목마다 "사업명"을 적은 줄이 여기로 모여요</span></div>
  ${rows.length ? `<div class="tbl-wrap"><table class="tbl bg-tbl"><thead><tr><th>사업명</th><th class="r">잔액</th><th class="r">집행률</th><th class="r">사용액</th><th class="r">예산</th><th>재원</th><th>담당</th></tr></thead><tbody>
    ${rows.map((p, i) => p.proj ? `<tr data-pj="${i}" style="cursor:pointer" class="bg-g"><td class="wrap"><b>${esc(p.proj)}</b> <span class="faint small">${p.lines.length}개 목</span></td><td class="r ${p.cur - p.used < 0 ? 'neg' : ''}"><b>${won(p.cur - p.used)}</b></td><td class="r">${pct(p.used, p.cur)}% ${paceNote(pct(p.used, p.cur), p.lastMon)}</td><td class="r">${won(p.used)}</td><td class="r">${won(p.cur)}</td><td class="small">${esc(fundName(p.fund))}</td><td class="small">${esc(p.owner)}</td></tr>
      ${BG.open[p.fund + p.proj] ? p.lines.map(l => { const u = (p.c.byLine[l.id] || {}).amt || 0; return `<tr class="bg-l"><td style="padding-left:26px">${esc(l.mok)}</td><td class="r">${won(curBudget(l) - u)}</td><td class="r">${pct(u, curBudget(l))}%</td><td class="r">${won(u)}</td><td class="r">${won(curBudget(l))}</td><td></td><td></td></tr>`; }).join('') : ''}`
      : `<tr><td class="wrap"><span class="chip warn">사업 미지정</span> ${esc(p.mok)}</td><td colspan="2" class="small"><button class="btn ghost sm" data-unas="${i}">내역 보고 사업 정하기</button></td><td class="r">${won(p.used)}</td><td></td><td class="small">${esc(fundName(p.fund))}</td><td></td></tr>`).join('')}</tbody></table></div>
    <div class="note small">사업 구분 방법: ① 원장에 <b>사업명 열</b>이 있으면 그걸로 ② 없으면 <b>적요</b>에 사업명이나 예산 입력의 "적요 키워드"가 들어 있는지로 나눠요. 못 찾은 건 "사업 미지정"으로 남아요.</div>`
  : `<div class="empty">사업명이 들어간 예산 줄이 없어요. 예산 입력에서 목마다 "사업명"을 적어 주세요.</div>`}`;
  $('#bg-pf', el).onchange = e => { BG.projFund = e.target.value; render(); };
  el.addEventListener('click', e => {
    const u = e.target.closest('[data-unas]'); if (u) { const p = rows[Number(u.dataset.unas)]; return assignSheet(p); }
    const t = e.target.closest('[data-pj]'); if (t) { const p = rows[Number(t.dataset.pj)]; BG.open[p.fund + p.proj] = !BG.open[p.fund + p.proj]; render(); }
  });
}
function assignSheet(p) {
  const ls = linesOf(p.fund, bgState().year).filter(l => bnorm(l.mok) === bnorm(p.mok) && l.proj);
  sheet({title: `사업 미지정 · ${p.mok}`, wide: true, body: `
    <div class="note small">적요에 들어 있는 단어를 사업의 <b>적요 키워드</b>로 넣으면 다음부터 자동으로 나뉘어요. (예: "자조모임", "동료상담")</div>
    ${ls.map(l => `<label class="f">${esc(l.proj)} 적요 키워드 (쉼표로)<input class="inp" data-kw="${l.id}" value="${esc(l.kw || '')}"></label>`).join('')}
    <div class="tbl-wrap" style="max-height:40vh;overflow:auto"><table class="tbl"><thead><tr><th>일자</th><th>적요</th><th class="r">금액</th></tr></thead><tbody>${p.rows.map(r => `<tr><td class="mono small">${r[0].slice(0, 2)}/${r[0].slice(2)}</td><td class="wrap">${esc(r[5])}</td><td class="r">${won(r[3] - r[4])}</td></tr>`).join('')}</tbody></table></div>`,
    foot: `<button class="btn" data-close>취소</button><button class="btn primary" id="kw-save">저장</button>`,
    onMount: el => { $('#kw-save', el).onclick = () => { $$('[data-kw]', el).forEach(i => { const l = bgState().lines.find(x => x.id === i.dataset.kw); if (l) l.kw = i.value.trim(); }); save(); closeSheet(); render(); toast('키워드를 저장했어요'); }; }});
}

function bgUnmView(el, b, y) {
  const list = [];
  b.funds.filter(f => linesOf(f.id, y).length).forEach(f => { const c = computeFund(f.id, y); Object.entries(c.unmatched).forEach(([a, u]) => list.push({fund: f.id, acct: a, ...u})); });
  BG.unSel = BG.unSel || {}; BG.unAmt = BG.unAmt || {}; BG.unType = BG.unType || {};
  const key = u => `${u.fund}|${u.acct}`, typeOf = u => BG.unType[key(u)] || (u.cr > u.dr || IN_RE.test(u.acct) ? 'in' : 'out');
  const sel = list.filter(u => BG.unSel[key(u)]), allOn = list.length && sel.length === list.length;
  const mokName = a => a.replace(/^[\[\(]?\d+[\]\)]?\s*/, '');
  const optsAll = [...new Map(list.flatMap(u => linesOf(u.fund, y)).map(l => [bnorm(l.mok), l])).values()];
  el.innerHTML = list.length ? `
    <div class="note small">원장에는 있는데 예산에 같은 이름의 목이 없는 계정이에요. <b>체크해서 한 번에</b> 예산 목으로 추가하고 금액까지 반영하거나, 기존 목에 한 번에 연결하세요. 예산액은 본예산으로 들어가요 (비우면 0원 → 예산 입력 탭에서 나중에 채우기).</div>
    <div class="panel" style="position:sticky;top:0;z-index:3"><div class="panel-b row" style="gap:8px;flex-wrap:wrap">
      <label class="row small"><input type="checkbox" id="um-all" ${allOn ? 'checked' : ''}> 전체 선택</label><b class="small">${sel.length}개 선택</b><span class="grow"></span>
      <button class="btn primary sm" id="um-add" ${sel.length ? '' : 'disabled'}>${icon('plus')}선택한 ${sel.length}개를 예산에 추가·반영</button>
      <select class="inp" id="um-to" style="width:auto;max-width:200px"><option value="">연결할 목 선택</option>${optsAll.map(l => `<option value="${esc(bnorm(l.mok))}">${BG_TYPES[l.type]} · ${esc(l.mok)}</option>`).join('')}</select>
      <button class="btn sm" id="um-link" ${sel.length ? '' : 'disabled'}>선택 ${sel.length}개를 이 목에 연결</button></div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>재원</th><th>원장 계정</th><th class="r">건수</th><th class="r">사용(차변−대변)</th><th>구분</th><th class="r">예산액(본예산)</th></tr></thead><tbody>
    ${list.map((u, i) => `<tr><td><input type="checkbox" data-sel="${i}" ${BG.unSel[key(u)] ? 'checked' : ''} aria-label="선택"></td><td class="small">${esc(fundName(u.fund))}</td><td class="wrap">${esc(u.acct)}</td><td class="r">${u.n}</td><td class="r">${won(u.dr - u.cr)}</td>
      <td><select class="inp" data-ut="${i}" style="width:auto"><option value="out" ${typeOf(u) === 'out' ? 'selected' : ''}>세출</option><option value="in" ${typeOf(u) === 'in' ? 'selected' : ''}>세입</option></select></td>
      <td class="r"><input class="inp num r" data-ua="${i}" style="width:120px;height:30px;min-height:0" value="${BG.unAmt[key(u)] ? Number(BG.unAmt[key(u)]).toLocaleString('ko-KR') : ''}" placeholder="0"></td></tr>`).join('')}</tbody></table></div>`
    : `<div class="empty">미분류 계정이 없어요</div>`;
  if (!list.length) return;
  el.addEventListener('change', e => { const x = e.target;
    if (x.id === 'um-all') { list.forEach(u => { BG.unSel[key(u)] = x.checked; }); render(); return; }
    if (x.dataset.sel != null && x.dataset.sel !== '') { BG.unSel[key(list[Number(x.dataset.sel)])] = x.checked; render(); return; }
    if (x.dataset.ut != null && x.dataset.ut !== '') { BG.unType[key(list[Number(x.dataset.ut)])] = x.value; return; }
    if (x.dataset.ua != null && x.dataset.ua !== '') { const v = toNum(x.value); BG.unAmt[key(list[Number(x.dataset.ua)])] = v || ''; x.value = v ? won(v) : ''; } });
  el.addEventListener('click', e => {
    if (e.target.closest('#um-add')) { sel.forEach(u => b.lines.push({id: uid(), y, fund: u.fund, type: typeOf(u), gwan: '', hang: '', mok: mokName(u.acct), proj: '', owner: '', kw: '', base: Number(BG.unAmt[key(u)]) || 0, sup1: 0, sup2: 0}));
      sel.forEach(u => { delete BG.unSel[key(u)]; delete BG.unAmt[key(u)]; delete BG.unType[key(u)]; }); save(); render(); toast(`${sel.length}개를 예산 목으로 추가했어요`); return; }
    if (e.target.closest('#um-link')) { const to = $('#um-to', el).value; if (!to) return toast('연결할 목을 먼저 골라 주세요'); sel.forEach(u => { b.alias[`${u.fund}|${y}|${bnorm(u.acct)}`] = to; delete BG.unSel[key(u)]; }); save(); render(); toast(`${sel.length}개를 연결했어요`); } });
}

/* ---------- 원장 계정별 (예산표 없이도: 원장만 올리면 계정별 사용액·잔액) ----------
   수입 계정(보조금·이월금·이자·반환금) / 인건비·직원경비 / 운영비 / 사업별 / 반납·반환 으로 자동 분류.
   예산액은 계정마다 직접 입력(없으면 예산 입력 탭의 같은 이름 목 합계) → 잔액·집행률 */
const LED_GRP = [['in', '수입 (보조금·이월·이자·반환)'], ['hr', '인건비·직원 경비'], ['ops', '운영비'], ['biz', '사업별 (단위사업)'], ['ret', '반납·반환']];
function ledGroupOf(acct, net) {
  if (/반납|반환금\s*반|환수/.test(acct)) return 'ret';
  if (net.in > net.out || IN_RE.test(acct) && net.in >= net.out) return 'in';
  if (/급여|제수당|수당|후생경비|사회보험|퇴직연금|퇴직급여|상여|복리후생|4대보험/.test(acct)) return 'hr';
  if (/수용비|수수료|공공요금|임차|관리비|여비|운영비|소모품|사무용품|통신|제세/.test(acct)) return 'ops';
  return 'biz';
}
function ledAgg(fund, y) {
  const b = bgState(), L = b.ledgers[`${fund}|${y}`]; if (!L) return null;
  const m = {};
  L.rows.forEach(r => { const [md, acct, , dr, cr] = r, a = m[acct] ||= {acct, n: 0, in: 0, out: 0, mon: Array(12).fill(0), rows: []};
    a.n++; a.in += cr; a.out += dr; const k = Number(md.slice(0, 2)) - 1; if (k >= 0 && k < 12) a.mon[k] += dr - cr; a.rows.push(r); });
  const list = Object.values(m); list.forEach(a => { a.grp = ledGroupOf(a.acct, a); a.used = a.grp === 'in' ? a.in - a.out : a.out - a.in; if (a.grp === 'in') a.mon = a.mon.map(x => -x); });
  return {L, list};
}
function ledBudget(fund, y, acct) {
  const b = bgState(), k = `${fund}|${y}|${bnorm(acct)}`; b.ledBud = b.ledBud || {};
  if (b.ledBud[k] != null && b.ledBud[k] !== '') return {v: Number(b.ledBud[k]) || 0, own: true};
  const ls = linesOf(fund, y).filter(l => bnorm(l.mok) === bnorm(acct)), gr = ((b.grant || {})[`${fund}|${y}`] || {})[acct], ga = gr ? Number(gr.annual) || 0 : 0;
  const lv = ls.reduce((a, l) => a + curBudget(l), 0);
  return {v: lv || ga, own: false, fromGrant: !lv && !!ga};
}
function bgLedView(el, b, y) {
  const g = ledAgg(BG.fund, y), lm = g ? Number(String(g.L.to || '').slice(0, 2)) || 0 : 0;
  if (!g) { el.innerHTML = `<div class="row">${fundSelect(b)}<span class="grow"></span><button class="btn primary sm" data-up="${BG.fund}">원장 올리기</button></div>
    <div class="empty">${esc(fundName(BG.fund))} ${y}년 원장이 없어요. 진우 <b>총계정원장보조부</b> / 통장출납부 엑셀을 올리면 계정별 사용액이 바로 나와요. 예산표는 없어도 돼요.</div>`; bindFundSelect(el); el.querySelector('[data-up]').onclick = () => uploadLedger(BG.fund); return; }
  const tot = k => g.list.filter(a => a.grp === k).reduce((t, a) => { const bg = ledBudget(BG.fund, y, a.acct); t.used += a.used; t.n += a.n; if (bg.v) { t.bud += bg.v; t.bused += a.used; } return t; }, {used: 0, bud: 0, bused: 0, n: 0});
  const inn = tot('in').used, outAll = ['hr', 'ops', 'biz', 'ret'].reduce((a, k) => a + tot(k).used, 0), spend = ['hr', 'ops', 'biz'].reduce((a, k) => a + tot(k).used, 0), ret = tot('ret').used;
  const bud = ['hr', 'ops', 'biz'].reduce((a, k) => a + tot(k).bud, 0), bused = ['hr', 'ops', 'biz'].reduce((a, k) => a + tot(k).bused, 0);
  let body = '';
  LED_GRP.forEach(([k, name]) => {
    const rows = g.list.filter(a => a.grp === k).sort((a, c) => c.used - a.used); if (!rows.length) return;
    const t = tot(k), hasB = k !== 'in' && k !== 'ret';
    body += `<tr class="bg-g"><td><b>${name}</b> <span class="faint small">${rows.length}개 계정</span></td><td class="r">${t.n}</td><td class="r"><b>${won(t.used)}</b></td>${hasB ? `<td class="r">${t.bud ? won(t.bud) : ''}</td><td class="r ${t.bud && t.bud - t.bused < 0 ? 'neg' : ''}">${t.bud ? '<b>' + won(t.bud - t.bused) + '</b>' : ''}</td><td class="r">${t.bud ? pct(t.bused, t.bud) + '%' : ''}</td>` : '<td></td><td></td><td></td>'}<td></td></tr>`;
    rows.forEach(a => { const bg = ledBudget(BG.fund, y, a.acct), r = pct(a.used, bg.v);
      body += `<tr class="bg-l" data-ledacct="${esc(a.acct)}" style="cursor:pointer"><td class="wrap" style="padding-left:20px">${esc(a.acct)}</td><td class="r">${a.n}</td><td class="r">${won(a.used)}</td>
        ${hasB ? `<td class="r"><input class="inp num r" style="width:112px;height:30px;padding:2px 8px;min-height:0" data-lb="${esc(a.acct)}" value="${bg.v ? bg.v.toLocaleString('ko-KR') : ''}" placeholder="예산 입력" ${bg.own ? '' : 'title="예산 입력 탭 금액 사용 중"'}></td><td class="r ${bg.v && bg.v - a.used < 0 ? 'neg' : ''}">${bg.v ? won(bg.v - a.used) : '<span class="faint small">예산 입력 시</span>'}</td><td class="r">${bg.v ? r + '% ' + paceNote(r, lm) : ''}</td>` : '<td></td><td></td><td></td>'}<td>${monCells(a.mon)}</td></tr>`; });
  });
  el.innerHTML = `
  <div class="row">${fundSelect(b)}<span class="grow"></span><span class="faint small">원장 ${g.L.from.slice(0, 2)}/${g.L.from.slice(2)}~${g.L.to.slice(0, 2)}/${g.L.to.slice(2)} · ${g.L.rows.length}건 · ${esc(g.L.up)} 올림</span><button class="btn sm" data-up="${BG.fund}">원장 다시 올리기</button></div>
  <div class="bg-cards" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
    <section class="panel"><div class="panel-b bg-kv"><div><span>수입 (이월 포함)</span><b class="num">${won(inn)}</b></div></div></section>
    <section class="panel"><div class="panel-b bg-kv"><div><span>사용액 (반납 제외)</span><b class="num">${won(spend)}</b></div></div></section>
    <section class="panel"><div class="panel-b bg-kv"><div><span>반납·반환</span><b class="num">${won(ret)}</b></div></div></section>
    <section class="panel"><div class="panel-b bg-kv"><div><span>통장 잔액 (수입−지출−반납)</span><b class="num ${inn - outAll < 0 ? 'neg' : ''}">${won(inn - outAll)}</b></div></div></section>
    ${bud ? `<section class="panel"><div class="panel-b bg-kv"><div><span>예산 입력한 계정 잔액</span><b class="num ${bud - bused < 0 ? 'neg' : ''}">${won(bud - bused)}</b></div></div></section>` : ''}</div>
  <div class="tbl-wrap"><table class="tbl bg-tbl"><thead><tr><th>계정</th><th class="r">건수</th><th class="r">사용액(순)</th><th class="r">예산</th><th class="r">잔액</th><th class="r">집행률</th><th>월별 1~12월</th></tr></thead><tbody>${body}</tbody></table></div>
  <div class="note small">계정 이름으로 <b>수입 / 인건비·직원경비 / 운영비 / 사업별 / 반납</b>을 자동으로 나눴어요. 취소·재결의로 +/−가 쌓인 건은 순액으로 계산합니다. 사업(단위사업) 계정에 <b>예산을 입력</b>하면 잔액·집행률이 바로 나오고, 줄을 누르면 내역이 열려요. 통장 잔액은 원장의 차인잔액과 같아야 해요.</div>`;
  bindFundSelect(el);
  el.addEventListener('change', e => { const i = e.target.closest('[data-lb]'); if (!i) return; b.ledBud = b.ledBud || {}; const v = toNum(i.value); b.ledBud[`${BG.fund}|${y}|${bnorm(i.dataset.lb)}`] = v || ''; save(); render(); });
  el.addEventListener('click', e => {
    const u = e.target.closest('[data-up]'); if (u) return uploadLedger(u.dataset.up);
    if (e.target.closest('input')) return;
    const tr = e.target.closest('[data-ledacct]'); if (tr) ledDetail(g.list.find(a => a.acct === tr.dataset.ledacct), y);
  });
}
function ledDetail(a, y) {
  if (!a) return; const bg = ledBudget(BG.fund, y, a.acct);
  sheet({title: `${a.acct} · 원장 내역`, wide: true, body: `
    <div class="bg-kv"><div><span>사용액(순)</span><b class="num">${won(a.used)}</b></div>${bg.v ? `<div><span>예산</span><b class="num">${won(bg.v)}</b></div><div><span>잔액</span><b class="num ${bg.v - a.used < 0 ? 'neg' : ''}">${won(bg.v - a.used)}</b></div>` : ''}<div><span>건수</span><b class="num">${a.n}</b></div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr>${a.mon.map((_, i) => `<th class="r">${i + 1}월</th>`).join('')}</tr></thead><tbody><tr>${a.mon.map(m => `<td class="r">${m ? won(m) : '·'}</td>`).join('')}</tr></tbody></table></div>
    <div class="tbl-wrap" style="max-height:50vh;overflow:auto"><table class="tbl"><thead><tr><th>일자</th><th>적요</th><th class="r">수입</th><th class="r">지출</th></tr></thead><tbody>${a.rows.map(r => `<tr><td class="mono small">${r[0].slice(0, 2)}/${r[0].slice(2)}</td><td class="wrap">${esc(r[5])}</td><td class="r">${r[4] ? won(r[4]) : ''}</td><td class="r">${r[3] ? won(r[3]) : ''}</td></tr>`).join('')}</tbody></table></div>`,
    foot: `<button class="btn" data-close>닫기</button>`});
}


/* ---------- 교부·집행 (서울시 IL센터 지원사업처럼 분기마다 교부액이 달라지는 보조금) ----------
   한 화면: ① 분기 교부신청액(인건비·운영비·사업비, 직접 입력 또는 붙여넣기) ② 정산내역서 4구분 ③ 확인할 곳·검증표 ④ 계정별 상세
   집행은 올린 원장에서 자동 연동. 금액은 이 기기 브라우저에만 저장 (원 단위로 저장, 화면은 천원/원 전환).
   S.budget.grant['재원|연도'] = {계정:{annual,q[4],sb,sj,lk,end}} · grantG = {hr|ops|biz:{annual,q[4]}, lk:{annual}, sbA} · grantS = 자부담 분기[4] · grantQ = 구청 통보 재배정액[4] · grantI = 이자 · unit = 'k'|'w' */
function grantState(fund, y) { const b = bgState(); b.grant = b.grant || {}; b.grantQ = b.grantQ || {}; return {rows: b.grant[`${fund}|${y}`] ||= {}, q: b.grantQ[`${fund}|${y}`] ||= ['', '', '', '']}; }
function grantG(fund, y) { const b = bgState(); b.grantG = b.grantG || {}; const o = b.grantG[`${fund}|${y}`] ||= {}; ['hr', 'ops', 'biz'].forEach(k => { o[k] ||= {annual: '', q: ['', '', '', '']}; }); o.lk ||= {annual: ''}; return o; }
const GG = [['hr', '인건비'], ['ops', '운영비'], ['biz', '사업비']];
const gUnit = () => bgState().unit === 'w' ? 'w' : 'k';
const gFmt = v => { if (v === '' || v == null || isNaN(Number(v))) return ''; return (gUnit() === 'k' ? Math.round(Number(v) / 1000) : Math.round(Number(v))).toLocaleString('ko-KR'); };
const gDash = v => (Number(v) ? gFmt(v) : '-');
const gIn = t => { const n = toNum(t); return gUnit() === 'k' ? n * 1000 : n; };
function grantCalc(b, y, fund) {
  const g = ledAgg(fund, y), G = grantState(fund, y), GR = grantG(fund, y), t = today(), curQ = y === t.getFullYear() ? Math.floor(t.getMonth() / 3) + 1 : 4;
  b.grantS = b.grantS || {}; const sbq = b.grantS[`${fund}|${y}`] ||= ['', '', '', '']; b.grantI = b.grantI || {}; const interest = Number(b.grantI[`${fund}|${y}`]) || 0;
  const accts = new Map(); (g ? g.list.filter(a => ['hr', 'ops', 'biz'].includes(a.grp)) : []).forEach(a => accts.set(a.acct, a));
  Object.keys(G.rows).forEach(k => { if (!accts.has(k)) accts.set(k, {acct: k, used: 0, mon: Array(12).fill(0), n: 0, grp: 'biz'}); });
  const ord = ['hr', 'ops', 'biz'];
  const rows = [...accts.values()].sort((a, c) => ord.indexOf(a.grp) - ord.indexOf(c.grp) || c.used - a.used).map(a => {
    const r = G.rows[a.acct] || {}, cq = [0, 1, 2, 3].map(i => Number((r.q || [])[i]) || 0), grant = cq.reduce((x, z) => x + z, 0), ann = Number(r.annual) || 0;
    const eq = [0, 1, 2, 3].map(i => a.mon.slice(i * 3, i * 3 + 3).reduce((x, z) => x + z, 0));
    return {a, r, ann, cq, grant, used: a.used, eq, rest: ann - grant, bal: grant - a.used, sb: Number(r.sb) || 0, sj: Number(r.sj) || 0, lk: !!r.lk, end: !!r.end};
  });
  const sum = f => rows.reduce((x, r) => x + f(r), 0);
  // 구분별(인건비·운영비·사업비): 계정에 금액을 넣었으면 계정 합, 아니면 구분 칸에 직접 입력한 값
  const grp = GG.map(([k, n]) => { const rr = rows.filter(r => r.a.grp === k), src = GR[k];
    const aAnn = rr.reduce((x, r) => x + r.ann, 0), aQ = [0, 1, 2, 3].map(i => rr.reduce((x, r) => x + r.cq[i], 0)), hasAcc = aAnn > 0 || aQ.some(x => x > 0);
    const ann = Number(src.annual) || aAnn, cq = src.q.some(v => Number(v) > 0) ? [0, 1, 2, 3].map(i => Number(src.q[i]) || 0) : aQ, got = cq.reduce((x, z) => x + z, 0);
    const used = rr.reduce((x, r) => x + r.used, 0), eq = [0, 1, 2, 3].map(i => rr.reduce((x, r) => x + r.eq[i], 0)), endRest = rr.filter(r => r.end && r.rest > 0).reduce((x, r) => x + r.rest, 0);
    return {k, n, hasAcc, ann, cq, got, used, eq, rest: ann - got, open: Math.max(0, ann - got - endRest)}; });
  const tAnn = grp.reduce((x, s) => x + s.ann, 0), tq = [0, 1, 2, 3].map(i => grp.reduce((x, s) => x + s.cq[i], 0)), tGot = tq.reduce((x, z) => x + z, 0), tUsed = grp.reduce((x, s) => x + s.used, 0);
  const sbSum = sbq.reduce((x, z) => x + (Number(z) || 0), 0), sbAnn = Number(GR.sbA) || sum(r => r.sb), sjSum = sum(r => r.sj);
  const lastIdx = Math.max(-1, ...tq.map((v, i) => v > 0 ? i : -1)), nq = lastIdx >= 0 ? Math.min(4, lastIdx + 2) : Math.min(4, curQ);
  const propose = i => i + 1 === nq && !tq[i] && tAnn > tGot;
  const needTot = grp.reduce((x, s) => x + s.open, 0);
  return {ord, g, G, GR, curQ, sbq, interest, rows, sum, grp, tAnn, tq, tGot, tUsed, sbSum, sbAnn, sjSum, lastIdx, nq, propose, needTot};
}
function bgGrantView(el, b, y) {
  const U = gUnit(), intKey = `${BG.fund}|${y}`;
  const {ord, g, G, GR, curQ, sbq, interest, rows, sum, grp, tAnn, tq, tGot, tUsed, sbSum, sbAnn, sjSum, lastIdx, nq, propose, needTot} = grantCalc(b, y, BG.fund);
  // 정산내역서 4구분
  const lkRows = rows.filter(r => r.a.grp === 'biz' && r.lk), lkAnn = lkRows.reduce((x, r) => x + r.ann, 0) || Number(GR.lk.annual) || 0, lkUsed = lkRows.reduce((x, r) => x + r.used, 0), biz = grp[2];
  const sett = [['인건비', grp[0].ann, grp[0].used], ['운영비', grp[1].ann, grp[1].used], ['사업비', Math.max(0, biz.ann - lkAnn), biz.used - lkUsed], ['(단위사업) 거주시설 연계사업', lkAnn, lkUsed]];
  const sTot = sett.reduce((t2, s) => ({ann: t2.ann + s[1], used: t2.used + s[2]}), {ann: 0, used: 0});
  const inAcc = g ? g.list.filter(a => a.grp === 'in').reduce((x, a) => x + a.used, 0) : 0, retAcc = g ? g.list.filter(a => a.grp === 'ret').reduce((x, a) => x + a.used, 0) : 0, bankLed = g ? inAcc - tUsed - retAcc : 0;
  // 확인할 곳
  const warn = [], bad = new Set();
  grp.forEach(s => { if (s.ann && s.got > s.ann) warn.push(`${s.n}: 교부 합이 연간 결정액보다 ${gFmt(s.got - s.ann)} 많아요`); if (s.got && s.used > s.got) warn.push(`${s.n}: 집행이 교부 누계보다 ${gFmt(s.used - s.got)} 많아요`); });
  rows.forEach(r => { const n = r.a.acct;
    if (r.ann && r.grant > r.ann) { warn.push(`${n}: 교부 합이 연간 결정액보다 ${gFmt(r.grant - r.ann)} 많아요`); bad.add(n + '|annual'); }
    if (r.used > r.grant && r.grant) { warn.push(`${n}: 집행이 교부액보다 ${gFmt(r.used - r.grant)} 많아요`); bad.add(n + '|used'); }
    if (r.sb && r.sj > r.sb) { warn.push(`${n}: 자부담 집행이 예산보다 ${gFmt(r.sj - r.sb)} 많아요`); bad.add(n + '|sj'); }
    if (r.used && !r.ann && !r.grant && !grp.find(s => s.k === r.a.grp).got) warn.push(`${n}: 집행은 있는데 연간 결정액·교부액이 비어 있어요`); });
  [0, 1, 2, 3].forEach(i => { const rq = Number(G.q[i]) || 0; if (rq && Math.abs(rq - tq[i]) >= 1000) { warn.push(`${i + 1}분기: 구청 통보액 ${gFmt(rq)} ↔ 신청액 합 ${gFmt(tq[i])} (차이 ${gFmt(rq - tq[i])})`); bad.add('q' + i); } });
  const chk = [];
  if (tAnn || tUsed) {
    chk.push(['4구분 집행 합 = 계정 집행 합', sTot.used === tUsed, `${gFmt(sTot.used)} / ${gFmt(tUsed)}`]);
    chk.push(['구분별 집행 ≤ 교부 누계', grp.every(s => !s.got || s.used <= s.got), grp.filter(s => s.got && s.used > s.got).map(s => s.n).join(', ')]);
    chk.push(['교부 누계 ≤ 연간 결정액', grp.every(s => !s.ann || s.got <= s.ann), '']);
    if (tAnn && nq <= 4 && tq.some(v => v)) chk.push(['교부 누계 + 다음 분기 신청 제안 = 연간 결정액', tGot + needTot === tAnn || tGot >= tAnn, needTot ? `제안 ${gFmt(needTot)}` : '']);
    if (tGot && g) { const df = bankLed - (tGot + interest - tUsed); chk.push(['통장 잔액 = 교부 누계 + 이자 − 사용액', Math.abs(df) < 1 || (!interest && df > 0 && df < 100000), `계산 ${gFmt(tGot + interest - tUsed)} / 원장 ${gFmt(bankLed)}${interest ? '' : df > 0 && df < 100000 ? ` · 차이 ${won(df)}원은 이자일 수 있어요 (아래에 이자 입력)` : ''}`]); }
    const hrN = rows.filter(r => r.a.grp === 'hr').length;
    chk.push([hrN ? '인건비 계정 합 = 보탬e "보수" (직접 대조)' : '인건비 계정이 원장에 보이지 않아요', !!hrN, hrN ? `${hrN}개 계정 ${gFmt(grp[0].used)}` : '급여·제수당·퇴직연금·사회보험·후생경비']);
  }
  const bad2 = chk.filter(c => !c[1]).length;
  // 입력 칸
  const inp = (attr, v, extra = '', st = '') => `<input class="gi ${extra}" inputmode="numeric" ${attr} value="${v ? gFmt(v) : ''}" style="${st}" aria-label="금액 입력">`;
  const sg = i => `<div class="gs">제안 ${gFmt(needTot)}</div>`;
  const gsum = (a, f) => a.reduce((x, r) => x + f(r), 0);
  const unitBtn = `<div class="seg" role="group" aria-label="단위"><button aria-pressed="${U === 'k'}" data-unit="k">천원</button><button aria-pressed="${U === 'w'}" data-unit="w">원</button></div>`;
  // ① 신청액 표
  const t1 = `<table class="gt"><thead><tr><th>구분 <span class="faint">(${U === 'k' ? '천원' : '원'})</span></th>${[1, 2, 3, 4].map(i => `<th>${i}분기</th>`).join('')}<th>합계</th><th>연간 결정액</th><th>미교부</th></tr></thead><tbody>
    ${grp.map(s => `<tr><td class="nm"><b>${s.n}</b>${s.k === 'biz' ? '<div class="faint gs0">연계사업 포함</div>' : ''}</td>${[0, 1, 2, 3].map(i => `<td>${inp(`data-gg="${s.k}" data-gi="${i}"`, s.cq[i])}${propose(i) && s.open > 0 ? `<div class="gs">제안 ${gFmt(s.open)}</div>` : ''}</td>`).join('')}<td><b>${gDash(s.got)}</b></td><td>${inp(`data-gg="${s.k}" data-gi="a"`, s.ann)}</td><td class="${s.ann && s.rest < 0 ? 'neg' : ''}">${s.ann ? gFmt(s.rest) : ''}</td></tr>`).join('')}
    <tr class="tot"><td>신청액 합계</td>${[0, 1, 2, 3].map(i => `<td>${gDash(tq[i])}${propose(i) ? `<div class="gs">제안 ${gFmt(needTot)}</div>` : ''}</td>`).join('')}<td>${gDash(tGot)}</td><td>${gDash(tAnn)}</td><td>${tAnn ? gFmt(tAnn - tGot) : ''}</td></tr>
    <tr><td class="nm">자부담</td>${[0, 1, 2, 3].map(i => `<td>${inp(`data-sbq="${i}"`, Number(sbq[i]) || 0)}</td>`).join('')}<td>${gDash(sbSum)}</td><td>${inp('data-sba="1"', sbAnn)}</td><td></td></tr>
    <tr class="tot"><td>총 보조수입</td>${[0, 1, 2, 3].map(i => `<td>${gDash(tq[i] + (Number(sbq[i]) || 0))}</td>`).join('')}<td>${gDash(tGot + sbSum)}</td><td>${gDash(tAnn + sbAnn)}</td><td></td></tr>
    <tr class="sub"><td class="nm">구청 통보 재배정액 <span class="faint">(선택)</span></td>${[0, 1, 2, 3].map(i => `<td>${inp(`data-gq="${i}"`, Number(G.q[i]) || 0, '', bad.has('q' + i) ? 'border-color:var(--stamp)' : '')}</td>`).join('')}<td colspan="3"></td></tr></tbody></table>`;
  // ② 정산내역서 4구분
  const t2 = `<table class="gt"><thead><tr><th>구분 <span class="faint">(${U === 'k' ? '천원' : '원'})</span></th><th class="rd">예산액(A)</th><th>집행액(B)</th><th class="rd">집행잔액(A−B)</th><th>집행률</th></tr></thead><tbody>
    ${sett.map((s, i) => `<tr><td class="nm">${esc(s[0])}</td><td class="rd">${i === 3 && !lkRows.some(r => r.ann) ? inp('data-lka="1"', s[1], 'rd') : gDash(s[1])}</td><td>${gDash(s[2])}</td><td class="rd">${s[1] ? gFmt(s[1] - s[2]) : ''}</td><td>${s[1] ? pct(s[2], s[1]) + '%' : ''}</td></tr>`).join('')}
    <tr class="tot"><td>계</td><td class="rd">${gDash(sTot.ann)}</td><td>${gDash(sTot.used)}</td><td class="rd">${sTot.ann ? gFmt(sTot.ann - sTot.used) : ''}</td><td>${sTot.ann ? pct(sTot.used, sTot.ann) + '%' : ''}</td></tr></tbody></table>
    <div class="faint small" style="margin-top:6px">사업비 = 행사운영비 − 연계사업. 아래 계정 상세에서 거주시설 자립지원 계정에 "연계"를 체크하면 따로 나눠요. 예산액(A)은 센터 연간 결정액이에요 (여러 센터 합계 아님).</div>`;
  // 계정 상세
  const head = `<th>계정과목</th><th class="rd">연간 결정액</th>${[1, 2, 3, 4].map(i => `<th>${i}분기 교부</th>`).join('')}<th>교부 합</th><th>집행(원장)</th><th>교부 잔액</th><th class="rd">집행 잔액(연간)</th><th>종료</th><th>연계</th>`;
  const gname = {hr: '인건비·직원경비', ops: '운영비', biz: '사업비 (단위사업)'};
  let body = '';
  ord.forEach(k => { const rr = rows.filter(r => r.a.grp === k); if (!rr.length) return; body += `<tr class="gh"><td colspan="12">${gname[k]} <span class="faint">${rr.length}개 계정</span></td></tr>`;
    rr.forEach(r => { body += `<tr><td class="nm">${esc(r.a.acct)}</td><td>${inp(`data-g="${esc(r.a.acct)}" data-gk="annual"`, r.ann, 'rd', bad.has(r.a.acct + '|annual') ? 'border-color:var(--stamp)' : '')}</td>${[0, 1, 2, 3].map(i => `<td>${inp(`data-g="${esc(r.a.acct)}" data-gk="q${i}"`, r.cq[i])}${r.eq[i] ? `<div class="gs0 faint">집행 ${gFmt(r.eq[i])}</div>` : ''}</td>`).join('')}<td>${gDash(r.grant)}</td><td class="${bad.has(r.a.acct + '|used') ? 'neg' : ''}">${gDash(r.used)}</td><td class="${r.bal < 0 ? 'neg' : ''}">${r.grant ? gFmt(r.bal) : ''}</td><td class="rd">${r.ann ? gFmt(r.ann - r.used) : ''}</td><td>${k === 'biz' ? `<input type="checkbox" data-ge="${esc(r.a.acct)}" ${r.end ? 'checked' : ''} aria-label="사업종료">` : ''}</td><td>${k === 'biz' ? `<input type="checkbox" data-gl="${esc(r.a.acct)}" ${r.lk ? 'checked' : ''} aria-label="연계사업">` : ''}</td></tr>`; }); });
  const kpi = [['연간 결정액', gDash(tAnn), ''], ['교부 누계', gDash(tGot), tAnn ? pct(tGot, tAnn) + '%' : ''], ['집행 누계', gDash(tUsed), tGot ? '교부 대비 ' + pct(tUsed, tGot) + '%' : ''], ['교부 잔액', tGot ? gFmt(tGot - tUsed) : '-', tGot && tGot - tUsed < 0 ? 'neg' : ''], [`${nq}분기 신청 제안`, needTot && tq.some(v => v) ? gFmt(needTot) : '-', 'acc'], ['통장 잔액(원장)', g ? gFmt(bankLed) : '-', '']];
  el.innerHTML = `
  <div class="row" style="flex-wrap:wrap;gap:8px">${fundSelect(b)}${unitBtn}<span class="grow"></span><span class="faint small">${g ? `집행: 원장 ${g.L.to.slice(0, 2)}/${g.L.to.slice(2)}까지 자동 연동` : '원장을 올리면 집행이 채워져요'}</span><button class="btn sm" id="gr-paste">${icon('copy')}표 붙여넣기</button><button class="btn sm" id="gx-down">${icon('down')}엑셀 내려받기</button><button class="btn sm" id="gx-up">${icon('plus')}엑셀 올리기</button><button class="btn sm" data-up="${BG.fund}">원장 올리기</button></div>
  <div class="gp-kpi">${kpi.map(([n, v, c]) => `<div><span>${n}</span><b class="${c === 'neg' ? 'neg' : c === 'acc' ? 'acc' : ''}">${v}</b>${c && c !== 'neg' && c !== 'acc' ? `<em>${c}</em>` : ''}</div>`).join('')}</div>
  <div class="gp-cols" style="grid-template-columns:1fr">
    <section class="panel"><div class="panel-h"><h2>① 분기 교부신청액</h2><button class="btn sm" id="ap-copy">${icon('copy')}표 복사</button></div><div class="panel-b gp-x">${t1}<div class="faint small" style="margin-top:6px">칸을 눌러 직접 쓰거나 "표 붙여넣기"로 한 번에 넣어요. 다음 분기 신청액 = 연간 결정액 − 교부 누계 (끝난 사업 제외). 저장은 원 단위로 정확히 해요 (${U === 'k' ? '화면은 천원 단위 반올림' : '원 단위 표시'}).</div></div></section>
  </div>
  <div class="gp-cols">
    <section class="panel"><div class="panel-h"><h2>② 서울시 정산내역서 (누적)</h2><button class="btn sm" id="st-copy">${icon('copy')}복사</button></div><div class="panel-b gp-x">${t2}</div></section>
    <div style="display:grid;gap:12px;min-width:0">
    <section class="panel ${warn.length ? '' : 'ok'}"><div class="panel-h"><h2>③ 확인할 곳 ${warn.length ? `<span class="chip warn">${warn.length}</span>` : ''}</h2></div><div class="panel-b">${warn.length ? `<ul class="gl">${warn.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : '<span class="faint small">어긋나는 곳이 없어요 (또는 아직 입력 전이에요)</span>'}</div></section>
    <section class="panel ${chk.length && !bad2 ? 'ok' : ''}"><div class="panel-h"><h2>정산 검증표 ${bad2 ? `<span class="chip warn">${bad2}</span>` : ''}</h2></div><div class="panel-b">${chk.length ? `<ul class="gl">${chk.map(c => `<li class="${c[1] ? 'okx' : 'ngx'}"><b>${c[1] ? '✓' : '✗'}</b> ${esc(c[0])}${c[2] ? ` <span class="faint">${esc(c[2])}</span>` : ''}</li>`).join('')}</ul>` : '<span class="faint small">금액을 입력하면 검증해요</span>'}
      <label class="f" style="max-width:240px;margin-top:8px">누적 이자 <span class="faint">(${U === 'k' ? '천원' : '원'}, 자부담 이자 제외)</span><input class="gi" style="max-width:none" inputmode="numeric" id="gr-int" value="${interest ? gFmt(interest) : ''}"></label>
      <div class="faint small" style="margin-top:6px">3자 대조: 진우 원장 = 통장 = 보탬e. 차이는 ① 회계일자 vs 보탬e 등록일 ② 이월·반납·퇴직연금반환 ③ 마이너스 지출부터 보세요.</div></div></section>
    </div>
  </div>
  <section class="panel"><div class="panel-h"><h2>④ 계정별 상세 <span class="faint small">(${U === 'k' ? '천원' : '원'})</span></h2></div><div class="panel-b gp-x">${rows.length ? `<table class="gt gd"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>
    <tfoot><tr class="tot"><td>합계</td><td>${gDash(gsum(rows, r => r.ann))}</td>${[0, 1, 2, 3].map(i => `<td>${gDash(gsum(rows, r => r.cq[i]))}</td>`).join('')}<td>${gDash(gsum(rows, r => r.grant))}</td><td>${gDash(tUsed)}</td><td>${gDash(gsum(rows, r => r.grant ? r.bal : 0))}</td><td>${gDash(gsum(rows, r => r.ann ? r.ann - r.used : 0))}</td><td></td><td></td></tr></tfoot></table>` : '<div class="empty">원장을 올리면 계정 목록이 자동으로 나와요. 계정별 입력은 선택이고, ①의 구분별 입력만으로도 신청액 표가 만들어져요.</div>'}</div></section>`;
  GM = {fund: BG.fund, g, grp, rows, tq, tGot, tAnn, tUsed, sbq, sbSum, sbAnn, sett, sTot, interest, bankLed, G, needTot};
  bindFundSelect(el);
  const gr = a => G.rows[a] ||= {annual: '', q: ['', '', '', ''], sb: '', sj: ''};
  el.addEventListener('change', e => { const x = e.target;
    if (x.dataset.gg) { const s = GR[x.dataset.gg], v = gIn(x.value) || ''; if (x.dataset.gi === 'a') s.annual = v; else s.q[Number(x.dataset.gi)] = v; save(); render(); return; }
    if (x.dataset.sbq != null && x.dataset.sbq !== '') { sbq[Number(x.dataset.sbq)] = gIn(x.value) || ''; save(); render(); return; }
    if (x.dataset.sba) { GR.sbA = gIn(x.value) || ''; save(); render(); return; }
    if (x.dataset.lka) { GR.lk.annual = gIn(x.value) || ''; save(); render(); return; }
    if (x.dataset.gq != null && x.dataset.gq !== '') { G.q[Number(x.dataset.gq)] = gIn(x.value) || ''; save(); render(); return; }
    if (x.id === 'gr-int') { b.grantI[intKey] = gIn(x.value) || ''; save(); render(); return; }
    if (x.dataset.ge) { gr(x.dataset.ge).end = x.checked; save(); render(); return; }
    if (x.dataset.gl) { gr(x.dataset.gl).lk = x.checked; save(); render(); return; }
    if (x.dataset.g) { const r = gr(x.dataset.g), k = x.dataset.gk, v = gIn(x.value) || ''; if (k[0] === 'q') r.q[Number(k[1])] = v; else r[k] = v; save(); render(); } });
  el.addEventListener('click', e => { const u = e.target.closest('[data-up]'); if (u) return uploadLedger(u.dataset.up);
    const un = e.target.closest('[data-unit]'); if (un) { b.unit = un.dataset.unit; save(); render(); return; }
    if (e.target.closest('#gr-paste')) return grantPasteSheet(y);
    if (e.target.closest('#gx-down')) return grantXlsx(y);
    if (e.target.closest('#gx-up')) return grantXlsxSheet(y);
    const K = v => Math.round(v / 1000);
    if (e.target.closest('#ap-copy')) return copyText(`${y}년 분기 교부신청액 (천원)\n구분\t1분기\t2분기\t3분기\t4분기\t합계\t연간\n` + grp.map(s => s.n + '\t' + s.cq.map(K).join('\t') + '\t' + K(s.got) + '\t' + K(s.ann)).join('\n') + `\n신청액\t${tq.map(K).join('\t')}\t${K(tGot)}\t${K(tAnn)}\n자부담\t${sbq.map(v => K(Number(v) || 0)).join('\t')}\t${K(sbSum)}\t${K(sbAnn)}\n총보조수입\t${tq.map((v, i) => K(v + (Number(sbq[i]) || 0))).join('\t')}\t${K(tGot + sbSum)}\t${K(tAnn + sbAnn)}`, '복사했어요');
    if (e.target.closest('#st-copy')) return copyText(`${y}년 정산내역서(누적)\n구분\t예산액(A)\t집행액(B)\t잔액\n` + sett.map(s => `${s[0]}\t${s[1]}\t${s[2]}\t${s[1] - s[2]}`).join('\n') + `\n계\t${sTot.ann}\t${sTot.used}\t${sTot.ann - sTot.used}`, '복사했어요 (원 단위)'); });
}
/* 표 붙여넣기: 엑셀에서 신청액 표를 복사해 붙이면 구분(인건비·운영비·사업비·자부담)·계정 줄을 알아봐요.
   머리글에 연간/1분기~4분기가 있으면 그 순서대로, 없으면 구분 줄은 [1~4분기], 계정 줄은 [연간, 1~4분기] */
function parseGrantPaste(text, unit, accts) {
  const lines = text.split(/\r?\n/).map(l => l.split('\t').map(c => c.trim())).filter(l => l.some(c => c)); let map = null; const out = {grp: {}, acct: {}, sb: null, lk: null, n: 0};
  const num = c => { const s = String(c || '').replace(/[,\s원]/g, ''); if (!s || s === '-' || !/\d/.test(s)) return ''; return toNum(s); };
  const ar = accts.map(a => [bnorm(a), a]);
  lines.forEach(cells => {
    const lab = cells[0], rest = cells.slice(1);
    if (/1\s*분기/.test(cells.join(' ')) && !rest.some(c => /^[\d,.\-]+$/.test(c) && c !== '-' && /\d/.test(c))) { map = cells.map((c, i) => /연간|결정|예산/.test(c) ? 'a' : (c.match(/([1-4])\s*분기/) || [])[1] ? 'q' + (Number(c.match(/([1-4])\s*분기/)[1]) - 1) : ''); return; }
    let key = /연계|^사업비\s*거주/.test(lab) ? 'lk' : /^(인건비|운영비|사업비)/.test(lab) ? ({인건비: 'hr', 운영비: 'ops', 사업비: 'biz'})[lab.match(/^(인건비|운영비|사업비)/)[0]] : /자부담/.test(lab) ? 'sb' : '';
    const vals = rest.map(num); if (!vals.some(v => v !== '')) return;
    const f = v => v === '' ? '' : v * (unit === 'k' ? 1000 : 1);
    let rec = {};
    if (map && vals.filter(v => v !== '').length > 1) cells.forEach((c, i) => { if (i > 0 && map[i]) rec[map[i]] = f(num(c)); });
    else if (key && key !== 'lk' && vals.filter(v => v !== '').length === 1 && rest.length === 1) rec = {a: f(vals[0])};
    else if (key === 'lk') rec = {a: f(vals.find(v => v !== '') ?? '')};
    else if (key) [0, 1, 2, 3].forEach(i => { rec['q' + i] = f(vals[i] ?? ''); });
    else { rec = {a: f(vals[0])}; [0, 1, 2, 3].forEach(i => { if (vals[i + 1] !== undefined) rec['q' + i] = f(vals[i + 1]); }); }
    if (key === 'sb') { out.sb = Object.assign(out.sb || {}, rec); out.n++; return; }
    if (key === 'lk') { out.lk = Object.assign(out.lk || {}, rec); out.n++; return; }
    if (key) { out.grp[key] = Object.assign(out.grp[key] || {}, rec); out.n++; return; }
    const hit = ar.find(([n]) => n === bnorm(lab)); if (hit) { out.acct[hit[1]] = Object.assign(out.acct[hit[1]] || {}, rec); out.n++; }
  });
  return out;
}
function grantPasteSheet(y) {
  const b = bgState(), fund = BG.fund, g = ledAgg(fund, y), names = g ? g.list.filter(a => ['hr', 'ops', 'biz'].includes(a.grp)).map(a => a.acct) : [];
  sheet({title: '교부신청액 표 붙여넣기', wide: true, body: `
    <div class="note small">엑셀에서 <b>신청액 표를 복사해 붙여 넣으세요</b>. 첫 칸이 <b>인건비·운영비·사업비·자부담</b>인 줄은 1~4분기 값으로, 한 칸 값만 있으면 연간 결정액으로 넣어요. 머리글에 "연간·1분기~4분기"가 있으면 그 순서를 따르고, 올린 원장의 계정 이름과 같은 줄은 계정별로 넣어요.</div>
    <div class="row small" style="gap:14px"><label class="row"><input type="radio" name="gp-u" value="auto" checked> 단위 자동 판단</label><label class="row"><input type="radio" name="gp-u" value="k"> 천원</label><label class="row"><input type="radio" name="gp-u" value="w"> 원</label></div>
    <textarea class="inp mono" id="gp-x" rows="9" placeholder="구분&#9;1분기&#9;2분기&#9;3분기&#9;4분기&#10;인건비&#9;100&#9;100&#9;100&#9;&#10;운영비&#9;10&#9;10&#9;10&#9;&#10;사업비&#9;20&#9;20&#9;20&#9;&#10;인건비&#9;1,000"></textarea>
    <div id="gp-prev" class="small" style="margin-top:8px"></div>`,
    foot: `<button class="btn" data-close>닫기</button><button class="btn primary" id="gp-go" disabled>넣기</button>`,
    onMount: el => {
      let cur = null; const upd = () => { const t = $('#gp-x', el).value, m = el.querySelector('[name="gp-u"]:checked').value, all = t.match(/[\d,]{4,}/g) || [], mx = Math.max(0, ...all.map(s => toNum(s))), unit = m === 'auto' ? (mx && mx < 3e6 ? 'k' : 'w') : m;
        cur = parseGrantPaste(t, unit, names); const gn = Object.keys(cur.grp).map(k => ({hr: '인건비', ops: '운영비', biz: '사업비'})[k]);
        $('#gp-prev', el).innerHTML = cur.n ? `알아본 줄 ${cur.n}개 · 단위 ${unit === 'k' ? '천원' : '원'} 기준 — ${[...gn, ...(cur.sb ? ['자부담'] : []), ...(cur.lk ? ['연계사업'] : []), ...Object.keys(cur.acct)].map(esc).join(', ')}` : '<span class="faint">알아볼 수 있는 줄이 아직 없어요</span>'; $('#gp-go', el).disabled = !cur.n; };
      $('#gp-x', el).oninput = upd; el.querySelectorAll('[name="gp-u"]').forEach(r => r.onchange = upd);
      $('#gp-go', el).onclick = () => { if (!cur) return; const GR = grantG(fund, y), G = grantState(fund, y), sbq = (b.grantS = b.grantS || {})[`${fund}|${y}`] ||= ['', '', '', ''];
        const apply = (dst, rec) => { if (rec.a !== undefined && rec.a !== '') dst.annual = rec.a; [0, 1, 2, 3].forEach(i => { if (rec['q' + i] !== undefined) dst.q[i] = rec['q' + i]; }); };
        Object.entries(cur.grp).forEach(([k, rec]) => apply(GR[k], rec)); Object.entries(cur.acct).forEach(([a, rec]) => apply(G.rows[a] ||= {annual: '', q: ['', '', '', ''], sb: '', sj: ''}, rec));
        if (cur.sb) { [0, 1, 2, 3].forEach(i => { if (cur.sb['q' + i] !== undefined) sbq[i] = cur.sb['q' + i]; }); if (cur.sb.a) GR.sbA = cur.sb.a; }
        if (cur.lk && cur.lk.a) GR.lk.annual = cur.lk.a;
        save(); closeSheet(); render(); toast(`${cur.n}개 줄을 넣었어요`); };
    }});
}


/* ---------- 교부·집행 엑셀 내려받기 / 올리기 (수식 포함) ----------
   원칙: 합계·미교부·잔액·집행률·검증은 모두 엑셀 수식. 입력 칸은 숫자(원 단위)만 — 화면 표시만 천원(#,##0,). 올릴 때는 입력 칸만 읽고 수식 칸은 무시해서 계산이 어긋나지 않게 함. */
let GM = null;
const GX_Z = '#,##0,;-#,##0,;"-"', GX_W = '#,##0;-#,##0;"-"';
function grantXlsx(y) {
  if (!GM || typeof XLSX === 'undefined') return toast('엑셀 도구를 불러오지 못했어요');
  const m = GM, N = v => Number(v) || 0, fn = fundName(m.fund);
  const wb = XLSX.utils.book_new(), put = (ws, a, o) => { ws[a] = o; };
  const num = (v, z = GX_Z) => ({t: 'n', v: N(v), z}), fx = (f, v, z = GX_Z) => ({t: 'n', f, v: N(v), z}), str = v => ({t: 's', v: String(v)}), fs = (f, v) => ({t: 's', f, v: String(v)});
  const mk = (cells, ref, cols) => { const ws = {}; Object.entries(cells).forEach(([a, c]) => ws[a] = c); ws['!ref'] = ref; ws['!cols'] = cols.map(w => ({wch: w})); return ws; };
  const L = (c, r) => 'ABCDEFGHIJKLMNOP'[c] + r;
  // ── 시트1 교부신청
  const c1 = {A1: str(`${y}년 분기 교부신청액 — ${fn}`), A2: str('● 표시가 있는 칸만 입력하세요 (원 단위 숫자, 화면은 천원으로 보여요). 합계·미교부·총 보조수입은 수식이라 고치지 마세요.')};
  ['구분', '1분기', '2분기', '3분기', '4분기', '합계', '연간 결정액', '미교부', '입력'].forEach((h, i) => c1[L(i, 4)] = str(h));
  m.grp.forEach((s, i) => { const r = 5 + i; c1['A' + r] = str(s.n + (s.k === 'biz' ? ' (연계사업 포함)' : '')); [0, 1, 2, 3].forEach(q => c1[L(1 + q, r)] = num(s.cq[q])); c1['F' + r] = fx(`SUM(B${r}:E${r})`, s.got); c1['G' + r] = num(s.ann); c1['H' + r] = fx(`G${r}-F${r}`, s.ann - s.got); c1['I' + r] = str('● B~E, G'); });
  c1.A8 = str('신청액 합계'); ['B', 'C', 'D', 'E', 'F', 'G'].forEach((c, i) => { const v = i < 4 ? m.tq[i] : i === 4 ? m.tGot : m.tAnn; c1[c + 8] = fx(`SUM(${c}5:${c}7)`, v); }); c1.H8 = fx('G8-F8', m.tAnn - m.tGot);
  c1.A9 = str('자부담'); [0, 1, 2, 3].forEach(q => c1[L(1 + q, 9)] = num(m.sbq[q])); c1.F9 = fx('SUM(B9:E9)', m.sbSum); c1.G9 = num(m.sbAnn); c1.I9 = str('● B~E, G');
  c1.A10 = str('총 보조수입'); ['B', 'C', 'D', 'E', 'F', 'G'].forEach((c, i) => { const v = (i < 4 ? m.tq[i] + N(m.sbq[i]) : i === 4 ? m.tGot + m.sbSum : m.tAnn + m.sbAnn); c1[c + 10] = fx(`${c}8+${c}9`, v); });
  c1.A11 = str('구청 통보 재배정액 (선택)'); [0, 1, 2, 3].forEach(q => c1[L(1 + q, 11)] = num(m.G.q[q])); c1.I11 = str('● B~E');
  c1.A13 = str('누적 이자 (자부담 이자 제외)'); c1.B13 = num(m.interest, GX_W); c1.I13 = str('●');
  c1.A14 = str('통장 잔액 (원장)'); c1.B14 = num(m.g ? m.bankLed : 0, GX_W); c1.C14 = str('원장 올린 값 — 통장출납부 마지막 잔액으로 고쳐도 돼요');
  XLSX.utils.book_append_sheet(wb, mk(c1, 'A1:I14', [26, 14, 14, 14, 14, 15, 15, 14, 12]), '교부신청');
  // ── 시트2 정산내역서
  const c2 = {A1: str(`${y}년 서울시 정산내역서 (누적) — 단위 원`), A2: str('예산액은 교부신청 시트의 연간 결정액에서 자동. 사업비 = 사업비 − 연계사업. 집행액은 원장에서 가져온 값 (원장을 바꾸면 허브에서 다시 내려받으세요).')};
  ['구분', '예산액(A)', '집행액(B)', '잔액(A−B)', '집행률'].forEach((h, i) => c2[L(i, 4)] = str(h));
  const st = m.sett; // [이름, 예산, 집행]
  c2.A5 = str('인건비'); c2.B5 = fx('교부신청!G5', st[0][1], GX_W); c2.A6 = str('운영비'); c2.B6 = fx('교부신청!G6', st[1][1], GX_W);
  c2.A7 = str('사업비'); c2.B7 = fx('MAX(0,교부신청!G7-B8)', st[2][1], GX_W); c2.A8 = str('(단위사업) 거주시설 연계사업'); c2.B8 = num(st[3][1], GX_W); c2.F8 = str('● B8 연계 예산 입력');
  st.forEach((s, i) => { const r = 5 + i; c2['C' + r] = num(s[2], GX_W); c2['D' + r] = fx(`B${r}-C${r}`, s[1] - s[2], GX_W); c2['E' + r] = fs(`IF(B${r}=0,"",C${r}/B${r})`, ''); c2['E' + r].z = '0.0%'; });
  c2.A9 = str('계'); ['B', 'C', 'D'].forEach(c => c2[c + 9] = fx(`SUM(${c}5:${c}8)`, c === 'B' ? m.sTot.ann : c === 'C' ? m.sTot.used : m.sTot.ann - m.sTot.used, GX_W)); c2.E9 = fs('IF(B9=0,"",C9/B9)', ''); c2.E9.z = '0.0%';
  XLSX.utils.book_append_sheet(wb, mk(c2, 'A1:F9', [34, 16, 16, 16, 10, 24]), '정산내역서');
  // ── 시트3 계정상세
  const c3 = {A1: str(`${y}년 계정별 상세 — 연계·종료는 Y로 표시`), A2: str('입력: 연계, 종료, 연간 결정액, 1~4분기 교부. 집행(원장)은 허브에서 가져온 값, 나머지는 수식.')};
  ['계정과목', '구분', '연계(Y)', '종료(Y)', '연간 결정액', '1분기 교부', '2분기 교부', '3분기 교부', '4분기 교부', '교부 합', '집행(원장)', '교부 잔액', '연간 잔액'].forEach((h, i) => c3[L(i, 4)] = str(h));
  const gn = {hr: '인건비', ops: '운영비', biz: '사업비'};
  m.rows.forEach((r, i) => { const x = 5 + i; c3['A' + x] = str(r.a.acct); c3['B' + x] = str(gn[r.a.grp]); c3['C' + x] = str(r.lk ? 'Y' : ''); c3['D' + x] = str(r.end ? 'Y' : ''); c3['E' + x] = num(r.ann);
    [0, 1, 2, 3].forEach(q => c3[L(5 + q, x)] = num(r.cq[q])); c3['J' + x] = fx(`SUM(F${x}:I${x})`, r.grant); c3['K' + x] = num(r.used); c3['L' + x] = fx(`J${x}-K${x}`, r.grant - r.used); c3['M' + x] = fx(`E${x}-K${x}`, r.ann - r.used); });
  const t3 = 5 + m.rows.length, last = Math.max(5, t3 - 1);
  c3['A' + t3] = str('합계'); 'EFGHIJKLM'.split('').forEach(c => { const v = m.rows.reduce((a, r) => a + ({E: r.ann, F: r.cq[0], G: r.cq[1], H: r.cq[2], I: r.cq[3], J: r.grant, K: r.used, L: r.grant - r.used, M: r.ann - r.used}[c]), 0); c3[c + t3] = fx(m.rows.length ? `SUM(${c}5:${c}${last})` : '0', v); });
  XLSX.utils.book_append_sheet(wb, mk(c3, `A1:M${t3}`, [30, 8, 9, 9, 15, 13, 13, 13, 13, 14, 14, 14, 14]), '계정상세');
  // ── 시트4 검증 (수식)
  const bank = m.g ? '교부신청!B14' : '""', ok = '"일치"';
  const c4 = {A1: str('정산 검증 — 모두 "일치"여야 해요'), A4: str('항목'), B4: str('결과'), C4: str('설명')};
  const V = [
    ['4구분 집행 합 = 계정 집행 합', `IF(ROUND(정산내역서!C9-계정상세!K${t3},0)=0,"일치","불일치")`, '정산내역서 계 = 계정상세 집행 합'],
    ['구분별 집행 ≤ 교부 누계', 'IF(AND(OR(교부신청!F5=0,정산내역서!C5<=교부신청!F5),OR(교부신청!F6=0,정산내역서!C6<=교부신청!F6),OR(교부신청!F7=0,정산내역서!C7+정산내역서!C8<=교부신청!F7)),"일치","확인")', '교부액보다 많이 쓴 구분이 있으면 확인'],
    ['교부 누계 ≤ 연간 결정액', 'IF(AND(OR(교부신청!G5=0,교부신청!F5<=교부신청!G5),OR(교부신청!G6=0,교부신청!F6<=교부신청!G6),OR(교부신청!G7=0,교부신청!F7<=교부신청!G7)),"일치","확인")', ''],
    ['통장 잔액 = 교부 누계 + 이자 − 사용액', `IF(교부신청!F8=0,"입력 전",IF(ABS(교부신청!B14-(교부신청!F8+교부신청!B13-정산내역서!C9))<1,"일치","차이 "&TEXT(교부신청!B14-(교부신청!F8+교부신청!B13-정산내역서!C9),"#,##0")))`, '이자를 B13에 입력하면 맞아요 (작은 차이는 이자)'],
    ['다음 분기 신청 제안 합 (인건비+운영비+사업비)', 'MAX(0,교부신청!G5-교부신청!F5)+MAX(0,교부신청!G6-교부신청!F6)+MAX(0,교부신청!G7-교부신청!F7)', '연간 결정액 − 교부 누계']];
  V.forEach((v, i) => { const r = 5 + i; c4['A' + r] = str(v[0]); c4['B' + r] = i === 4 ? fx(v[1], m.needTot) : fs(v[1], ''); if (i === 4) c4['B' + r].z = GX_Z; c4['C' + r] = str(v[2]); });
  XLSX.utils.book_append_sheet(wb, mk(c4, 'A1:C9', [44, 18, 52]), '검증');
  const buf = XLSX.write(wb, {bookType: 'xlsx', type: 'array'});
  download(`${ymdShort()}_교부집행_${fn.replace(/[\\/:*?"<>|\s]/g, '')}_${y}.xlsx`, new Blob([buf])); toast('엑셀을 저장했어요 — 수식이 들어 있어요');
}
const ymdShort = () => { const d = today(); return String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); };
function parseGrantXlsx(wb) {
  const rowsOf = n => { const ws = wb.Sheets[n]; return ws ? XLSX.utils.sheet_to_json(ws, {header: 1, raw: true, defval: ''}) : null; }, N = v => typeof v === 'number' ? v : toNum(v);
  const out = {grp: {}, sb: null, lk: null, q: null, interest: null, acct: {}, n: 0}, r1 = rowsOf('교부신청'); if (!r1) return null;
  const val = c => (c === '' || c == null) ? '' : N(c);
  r1.forEach(r => { const a = String(r[0] || '').trim(); const q = [1, 2, 3, 4].map(i => val(r[i]));
    const g = /^인건비/.test(a) ? 'hr' : /^운영비/.test(a) ? 'ops' : /^사업비/.test(a) ? 'biz' : '';
    if (g) { out.grp[g] = {annual: val(r[6]), q}; out.n++; }
    else if (/^자부담/.test(a)) { out.sb = {q, annual: val(r[6])}; out.n++; }
    else if (/^구청/.test(a)) { out.q = q; out.n++; }
    else if (/^누적 이자/.test(a)) { out.interest = val(r[1]); out.n++; } });
  const r2 = rowsOf('정산내역서'); if (r2) r2.forEach(r => { if (/연계사업/.test(String(r[0] || '')) && typeof r[1] === 'number') { out.lk = r[1]; out.n++; } });
  const r3 = rowsOf('계정상세'); if (r3) r3.forEach((r, i) => { const a = String(r[0] || '').trim(); if (i < 4 || !a || a === '합계') return; out.acct[a] = {annual: val(r[4]), q: [5, 6, 7, 8].map(k => val(r[k])), lk: /^y/i.test(String(r[2])), end: /^y/i.test(String(r[3]))}; out.n++; });
  // 단위 보호: 연간 결정액이 100만 미만이면 천원으로 입력한 것으로 보고 ×1000
  const big = [...Object.values(out.grp).map(s => s.annual), ...Object.values(out.acct).map(s => s.annual)].filter(v => v !== ''); out.scaled = big.length && Math.max(...big) < 1e6;
  if (out.scaled) { const f = v => v === '' ? '' : v * 1000; Object.values(out.grp).forEach(s => { s.annual = f(s.annual); s.q = s.q.map(f); }); if (out.sb) { out.sb.q = out.sb.q.map(f); out.sb.annual = f(out.sb.annual); } if (out.q) out.q = out.q.map(f); if (out.lk != null) out.lk *= 1000; if (out.interest !== null) out.interest = f(out.interest); Object.values(out.acct).forEach(s => { s.annual = f(s.annual); s.q = s.q.map(f); }); }
  return out;
}
function grantXlsxSheet(y) {
  const fund = BG.fund; let cur = null;
  sheet({title: '교부·집행 엑셀 올리기', wide: true, body: `
    <div class="note small">허브에서 <b>내려받은 엑셀</b>(교부신청·정산내역서·계정상세 시트)에 값을 고쳐서 올려요. <b>입력 칸의 숫자만</b> 읽고 합계·잔액 같은 수식 칸은 무시하니 계산이 어긋나지 않아요. 시트·칸 위치(줄 순서)는 바꾸지 마세요.</div>
    <label class="f">엑셀 파일 (.xlsx)<input type="file" id="gx-file" accept=".xlsx"></label><div id="gx-info" class="small" style="margin-top:8px"></div>`,
    foot: `<button class="btn" data-close>닫기</button><button class="btn primary" id="gx-ok" disabled>이 값으로 바꾸기</button>`,
    onMount: el => {
      $('#gx-file', el).onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const wb = XLSX.read(await f.arrayBuffer(), {type: 'array'}); cur = parseGrantXlsx(wb);
        $('#gx-info', el).innerHTML = cur && cur.n ? `읽은 항목 ${cur.n}개 — 구분 ${Object.keys(cur.grp).length}개 · 계정 ${Object.keys(cur.acct).length}개${cur.sb ? ' · 자부담' : ''}${cur.lk != null ? ' · 연계 예산' : ''}${cur.scaled ? '<br><b>금액이 작아서 천원 단위로 보고 ×1000 했어요.</b>' : ''}<br><span class="faint">${esc(fundName(fund))} ${y}년의 교부·연간 금액이 이 값으로 바뀌어요 (집행은 원장 그대로).</span>` : '<span class="neg">교부신청 시트를 못 찾았어요. 허브에서 내려받은 엑셀인지 확인해 주세요.</span>'; $('#gx-ok', el).disabled = !(cur && cur.n); } catch (err) { cur = null; $('#gx-info', el).textContent = '엑셀을 읽지 못했어요'; } };
      $('#gx-ok', el).onclick = () => { if (!cur) return; const b = bgState(), GR = grantG(fund, y), G = grantState(fund, y), sbq = (b.grantS = b.grantS || {})[`${fund}|${y}`] ||= ['', '', '', ''];
        Object.entries(cur.grp).forEach(([k, s]) => { GR[k].annual = s.annual; GR[k].q = s.q.slice(0, 4); });
        if (cur.sb) { cur.sb.q.forEach((v, i) => sbq[i] = v); GR.sbA = cur.sb.annual; } if (cur.q) cur.q.forEach((v, i) => G.q[i] = v); if (cur.lk != null) GR.lk.annual = cur.lk || '';
        if (cur.interest !== null) (b.grantI = b.grantI || {})[`${fund}|${y}`] = cur.interest;
        Object.entries(cur.acct).forEach(([a, s]) => { const r = G.rows[a] ||= {annual: '', q: ['', '', '', ''], sb: '', sj: ''}; r.annual = s.annual; r.q = s.q; r.lk = s.lk; r.end = s.end; });
        save(); closeSheet(); render(); toast('엑셀 값으로 바꿨어요'); };
    }});
}

/* ---------- 세목별 정산 (교부액에 맞춰 세목별 사용액 → 남은 잔액 → 신청할지·쓸지) ----------
   구분(인건비·운영비·사업비)마다: 교부 누계 − 세목별 집행 = 지금 쓸 수 있는 잔액 / 연간 결정액 − 교부 누계 = 아직 신청 안 한 돈 */
function bgSettleView(el, b, y) {
  const U = gUnit(), C = grantCalc(b, y, BG.fund), {g, G, rows, grp, tq, tGot, tAnn, tUsed, nq, needTot, curQ} = C, lm = g ? Number(String(g.L.to || '').slice(0, 2)) || 0 : 0;
  const qn = (i) => `${i + 1}분기`, sumOf = (rr, f) => rr.reduce((x, r) => x + f(r), 0);
  const unitBtn = `<div class="seg" role="group" aria-label="단위"><button aria-pressed="${U === 'k'}" data-unit="k">천원</button><button aria-pressed="${U === 'w'}" data-unit="w">원</button></div>`;
  const spare = tGot - tUsed, endLeft = sumOf(rows.filter(r => r.end && r.ann > r.used), r => r.ann - r.used);
  const inp = (a, v) => `<input class="gi rd" inputmode="numeric" data-sa="${esc(a)}" value="${v ? gFmt(v) : ''}" aria-label="연간 예산">`;
  const block = s => { const rr = rows.filter(r => r.a.grp === s.k), eq = [0, 1, 2, 3].map(i => sumOf(rr, r => r.eq[i])), accAnn = sumOf(rr, r => r.ann);
    const bal = s.got - s.used, openLeft = s.ann - s.got;
    const pace = r => r.ann ? (r.end ? '<span class="chip">종료</span>' : paceNote(pct(r.used, r.ann), lm)) : '';
    return `<section class="panel"><div class="panel-h"><h2>${s.n}</h2><span class="faint small">${rr.length}개 세목</span>${s.k === 'biz' ? `<button class="btn sm" id="se-paste">${icon('copy')}연 예산 표 붙여넣기</button>` : ''}</div><div class="panel-b gp-x">
    <table class="gt"><thead><tr><th>세목 <span class="faint">(${U === 'k' ? '천원' : '원'})</span></th><th class="rd">연간 예산</th>${[0, 1, 2, 3].map(i => `<th>${qn(i)} 집행</th>`).join('')}<th>집행 합</th><th class="rd">집행 잔액</th><th>집행률</th><th>종료</th></tr></thead><tbody>
    ${rr.map(r => `<tr><td class="nm">${esc(r.a.acct)}${r.lk ? ' <span class="chip">연계</span>' : ''}</td><td>${inp(r.a.acct, r.ann)}</td>${[0, 1, 2, 3].map(i => `<td>${gDash(r.eq[i])}</td>`).join('')}<td><b>${gDash(r.used)}</b></td><td class="rd">${r.ann ? gFmt(r.ann - r.used) : ''}</td><td>${r.ann ? pct(r.used, r.ann) + '% ' + pace(r) : ''}</td><td>${s.k === 'biz' ? `<input type="checkbox" data-se="${esc(r.a.acct)}" ${r.end ? 'checked' : ''} aria-label="사업종료">` : ''}</td></tr>`).join('') || `<tr><td colspan="9" class="faint" style="text-align:left">원장을 올리면 세목이 나와요</td></tr>`}
    <tr class="tot"><td>${s.n} 집행 합계</td><td class="rd">${gDash(accAnn || s.ann)}</td>${eq.map(v => `<td>${gDash(v)}</td>`).join('')}<td>${gDash(s.used)}</td><td class="rd">${s.ann ? gFmt(s.ann - s.used) : ''}</td><td>${s.ann ? pct(s.used, s.ann) + '%' : ''}</td><td></td></tr></tbody></table>
    <div class="gp-kpi" style="margin:10px 0 0;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div><span>교부 누계</span><b>${gDash(s.got)}</b><em>${s.cq.map((v, i) => v ? qn(i) + ' ' + gFmt(v) : '').filter(Boolean).join(' · ')}</em></div>
      <div><span>지금 쓸 수 있는 잔액 (교부−집행)</span><b class="${s.got && bal < 0 ? 'neg' : 'acc'}">${s.got ? gFmt(bal) : '-'}</b></div>
      <div><span>아직 신청 안 한 돈 (연간−교부)</span><b>${s.ann ? gFmt(openLeft) : '-'}</b></div>
      <div><span>${nq}분기 신청 제안${s.open < openLeft ? ' (종료 사업 제외)' : ''}</span><b class="acc">${s.open && tq.some(v => v) ? gFmt(s.open) : '-'}</b></div></div></div></section>`; };
  el.innerHTML = `
  <div class="row" style="flex-wrap:wrap;gap:8px">${fundSelect(b)}${unitBtn}<span class="grow"></span><span class="faint small">${g ? `집행: 원장 ${g.L.to.slice(0, 2)}/${g.L.to.slice(2)}까지` : '원장을 올리면 집행이 채워져요'}</span><button class="btn sm" data-up="${BG.fund}">원장 올리기</button></div>
  <div class="note small">교부액은 <b>구분(인건비·운영비·사업비)별</b>로 나오고, 사용액은 <b>세목(계정)별</b>로 쌓여요. 구분마다 "교부 누계 − 집행 합 = 지금 쓸 수 있는 잔액"을 보고, 남았으면 쓰고 부족하면 다음 분기에 신청하세요. 연간 예산(세목별)은 칸에 입력, 교부액 입력은 "교부·집행 격자" 탭에서 해요.</div>
  <div class="gp-kpi"><div><span>교부 누계</span><b>${gDash(tGot)}</b></div><div><span>집행 누계</span><b>${gDash(tUsed)}</b></div><div><span>지금 쓸 수 있는 잔액</span><b class="${tGot && spare < 0 ? 'neg' : 'acc'}">${tGot ? gFmt(spare) : '-'}</b></div><div><span>아직 신청 안 한 돈</span><b>${tAnn ? gFmt(tAnn - tGot) : '-'}</b></div><div><span>${nq}분기 신청 제안</span><b class="acc">${needTot && tq.some(v => v) ? gFmt(needTot) : '-'}</b></div>${endLeft ? `<div><span>종료 사업 남은 예산</span><b>${gFmt(endLeft)}</b><em>신청 제외 · 정리할 돈</em></div>` : ''}</div>
  <div style="display:grid;gap:12px;margin-top:4px">${grp.map(block).join('')}</div>`;
  bindFundSelect(el);
  el.addEventListener('change', e => { const x = e.target, gr = a => G.rows[a] ||= {annual: '', q: ['', '', '', ''], sb: '', sj: ''};
    if (x.dataset.sa) { gr(x.dataset.sa).annual = gIn(x.value) || ''; save(); render(); return; }
    if (x.dataset.se) { gr(x.dataset.se).end = x.checked; save(); render(); } });
  el.addEventListener('click', e => { const u = e.target.closest('[data-up]'); if (u) return uploadLedger(u.dataset.up); if (e.target.closest('#se-paste')) return budgetPasteSheet(y, rows.filter(r => r.a.grp === 'biz').map(r => r.a.acct)); const un = e.target.closest('[data-unit]'); if (un) { b.unit = un.dataset.unit; save(); render(); } });
}
/* 사업비 연 예산 표 붙여넣기: 세부사업명(예: 권익옹호/쉬운정보만들기)과 연 예산이 있는 줄을 원장 계정과 이름으로 맞춰요. '사업종료'가 적힌 줄은 종료 표시. */
const bpKey = t => String(t).replace(/[\s·:()\-]/g, '').replace(/인/g, '');
function parseBudgetPaste(text, accts) {
  const out = []; const ak = accts.map(a => [bpKey(a), a]);
  text.split(/\r?\n/).forEach(line => { const nums = line.match(/\d[\d,]{3,}/g); if (!nums) return; const label = line.replace(/\d[\d,]*/g, ' '); const segs = label.split(/[\/\t]/).map(bpKey).filter(x => x.length >= 3);
    let hit = null; for (const sg of segs.slice().reverse()) { hit = ak.find(([k]) => k === sg) || ak.find(([k]) => k.length >= 4 && sg.length >= 4 && (k.includes(sg) || sg.includes(k))); if (hit) break; }
    out.push({acct: hit ? hit[1] : '', line: label.replace(/\s+/g, ' ').trim().slice(0, 40), annual: toNum(nums[0]), end: /사업\s*종료/.test(line)}); });
  return out;
}
function budgetPasteSheet(y, accts) {
  const b = bgState(), fund = BG.fund;
  sheet({title: '사업비 연 예산 표 붙여넣기', wide: true, body: `
    <div class="note small">엑셀에서 <b>세부사업명과 연 예산이 있는 표</b>를 복사해 붙여 넣으세요. 줄마다 첫 금액을 연 예산으로 읽고, 사업 이름이 원장 계정과 비슷하면 자동으로 맞춰요 ("사업종료"가 적힌 줄은 종료로 표시).</div>
    <textarea class="inp mono" id="bp-x" rows="9" placeholder="장애인복지사업&#9;사업명/세부사업&#9;1,000,000&#9;800,000&#9;200,000"></textarea><div id="bp-prev" class="small" style="margin-top:8px"></div>`,
    foot: `<button class="btn" data-close>닫기</button><button class="btn primary" id="bp-go" disabled>연간 예산에 반영</button>`,
    onMount: el => { let cur = [];
      $('#bp-x', el).oninput = () => { cur = parseBudgetPaste($('#bp-x', el).value, accts); const ok = cur.filter(c => c.acct), no = cur.filter(c => !c.acct);
        $('#bp-prev', el).innerHTML = (ok.length ? `<table class="tbl"><tbody>${ok.map(c => `<tr><td>${esc(c.acct)}</td><td class="r">${won(c.annual)}원</td><td>${c.end ? '종료' : ''}</td></tr>`).join('')}</tbody></table>` : '') + (no.length ? `<div class="neg" style="margin-top:6px">맞는 계정을 못 찾은 줄: ${no.map(c => esc(c.line)).join(' / ')}</div>` : ''); $('#bp-go', el).disabled = !ok.length; };
      $('#bp-go', el).onclick = () => { const G = grantState(fund, y), ok = cur.filter(c => c.acct), f = ok.every(c => c.annual < 100000) ? 1000 : 1;
        ok.forEach(c => { const r = G.rows[c.acct] ||= {annual: '', q: ['', '', '', ''], sb: '', sj: ''}; r.annual = c.annual * f; if (c.end) r.end = true; }); save(); closeSheet(); render(); toast(`${ok.length}개 세목의 연간 예산을 반영했어요`); };
    }});
}


/* ---------- 예산 교환 파일 (다른 앱 ↔ 업무허브) ----------
   {schema:'il-budget-exchange', v:1, year, funds:[{name}], lines:[...예산 줄], grant:{재원명|연도:{계정:{annual,q,sb,sj}}}, grantQ, ledBud, usage:[{fund,acct,group,used,mon[12]}]}
   - 내보내기: 예산 줄·교부 격자·계정별 집행 요약만 담음 (원장 적요/실명 내역은 담지 않음)
   - 가져오기: 재원은 이름으로 맞춤(없으면 새로 만듦). 관/항/목·본예산 같은 한글·영문 열 이름도 알아봄 */
function bgExchange(y = bgState().year) {
  const b = bgState(), nm = id => fundName(id), out = {schema: 'il-budget-exchange', v: 1, year: y, exported: ymd(today()), from: 'il-hub', funds: b.funds.map(f => ({name: f.name, owner: f.owner || ''})), lines: [], grant: {}, grantQ: {}, grantG: {}, grantS: {}, ledBud: {}, usage: []};
  b.lines.filter(l => Number(l.y) === Number(y)).forEach(l => out.lines.push({fund: nm(l.fund), year: l.y, type: l.type, gwan: l.gwan, hang: l.hang, mok: l.mok, proj: l.proj, owner: l.owner, kw: l.kw, base: Number(l.base) || 0, sup1: Number(l.sup1) || 0, sup2: Number(l.sup2) || 0}));
  const keyOf = k => { const [f, yy, ...r] = k.split('|'); return {f, yy, r: r.join('|')}; };
  Object.entries(b.grant || {}).forEach(([k, v]) => { const [f, yy] = k.split('|'); if (Number(yy) === Number(y)) out.grant[nm(f) + '|' + yy] = v; });
  Object.entries(b.grantQ || {}).forEach(([k, v]) => { const [f, yy] = k.split('|'); if (Number(yy) === Number(y)) out.grantQ[nm(f) + '|' + yy] = v; });
  [['grantG', b.grantG], ['grantS', b.grantS]].forEach(([n2, src]) => Object.entries(src || {}).forEach(([k, v]) => { const [f, yy] = k.split('|'); if (Number(yy) === Number(y)) out[n2][nm(f) + '|' + yy] = v; }));
  Object.entries(b.ledBud || {}).forEach(([k, v]) => { const { f, yy, r } = keyOf(k); if (Number(yy) === Number(y)) out.ledBud[nm(f) + '|' + yy + '|' + r] = v; });
  b.funds.forEach(f => { const g = ledAgg(f.id, y); if (g) g.list.forEach(a => out.usage.push({fund: f.name, acct: a.acct, group: a.grp, n: a.n, used: a.used, mon: a.mon})); });
  return out;
}
const XK = {gwan: ['gwan', '관'], hang: ['hang', '항'], mok: ['mok', '목', '세목', '계정', '계정과목', '과목'], proj: ['proj', '사업', '사업명'], base: ['base', '본예산', '예산액', '예산'], sup1: ['sup1', '1차추경', '1차 추경'], sup2: ['sup2', '2차추경', '2차 추경'], fund: ['fund', '재원', '재원명'], type: ['type', '구분']};
function xpick(o, k) { for (const n of XK[k]) if (o[n] != null && o[n] !== '') return o[n]; return ''; }
function fillEmpty(d, v) { Object.keys(v).forEach(k => { const x = v[k]; if (x && typeof x === 'object') { if (d[k] == null || typeof d[k] !== 'object') d[k] = Array.isArray(x) ? [] : {}; fillEmpty(d[k], x); } else if (d[k] === '' || d[k] == null || d[k] === 0 || (x === true && d[k] === false)) d[k] = x; }); }
function bgApplyExchange(data, mode = 'merge', y = null) {
  const b = bgState(); const arr = Array.isArray(data) ? data : (data.lines || []); const yy = Number(y || data.year || b.year);
  const fid = name => { name = String(name || '').trim() || b.funds[0].name; let f = b.funds.find(x => x.name === name || bnorm(x.name) === bnorm(name)); if (!f) { f = {id: 'f' + uid(), name, owner: '', mine: false}; b.funds.push(f); } return f.id; };
  const lines = arr.map(o => { const t = String(xpick(o, 'type')); return {id: uid(), y: Number(o.year || o.y || yy), fund: fid(xpick(o, 'fund')), type: /입|in/i.test(t) ? 'in' : 'out', gwan: String(xpick(o, 'gwan')), hang: String(xpick(o, 'hang')), mok: String(xpick(o, 'mok')), proj: String(xpick(o, 'proj')), owner: o.owner || '', kw: o.kw || '', base: toNum(xpick(o, 'base')), sup1: toNum(xpick(o, 'sup1')), sup2: toNum(xpick(o, 'sup2'))}; }).filter(l => l.mok);
  let add = 0, rep = 0;
  if (mode === 'replace') { const keys = new Set(lines.map(l => l.fund + '|' + l.y)); const before = b.lines.length; b.lines = b.lines.filter(l => !keys.has(l.fund + '|' + l.y)); rep = before - b.lines.length; }
  lines.forEach(l => { if (mode === 'merge' && b.lines.some(x => x.fund === l.fund && Number(x.y) === l.y && bnorm(x.mok) === bnorm(l.mok) && bnorm(x.proj) === bnorm(l.proj))) return; b.lines.push(l); add++; });
  const idOf = name => b.funds.find(f => f.name === name || bnorm(f.name) === bnorm(name));
  [['grant', 'grant'], ['grantQ', 'grantQ'], ['grantG', 'grantG'], ['grantS', 'grantS']].forEach(([src, dst]) => Object.entries(data[src] || {}).forEach(([k, v]) => { const [fn, y2] = k.split('|'), f = idOf(fn); if (!f) return; b[dst] = b[dst] || {}; const kk = `${f.id}|${y2}`; if (mode === 'replace' || !b[dst][kk]) b[dst][kk] = v; else if (src === 'grant') Object.entries(v).forEach(([a, r]) => { if (b[dst][kk][a]) fillEmpty(b[dst][kk][a], r); else b[dst][kk][a] = r; }); else fillEmpty(b[dst][kk], v); }));
  Object.entries(data.ledBud || {}).forEach(([k, v]) => { const [fn, y2, ...r] = k.split('|'), f = idOf(fn); if (!f) return; b.ledBud = b.ledBud || {}; const kk = `${f.id}|${y2}|${r.join('|')}`; if (mode === 'replace' || b.ledBud[kk] == null || b.ledBud[kk] === '') b.ledBud[kk] = v; });
  save(); return {add, rep, total: lines.length};
}
function exchangeSheet() {
  const y = bgState().year;
  sheet({title: '예산 교환 파일', wide: true, body: `
    <div class="note small">출장 웹앱처럼 <b>주소가 다른 앱</b>과는 브라우저 저장소를 공유할 수 없어서, 파일로 예산을 주고받아요. 파일에는 예산 줄·교부 격자·계정별 집행 요약만 들어가고, <b>원장 적요(실명 포함 내역)는 들어가지 않아요</b>.</div>
    <div class="row" style="gap:8px"><button class="btn primary" id="ex-out">${icon('down')}${y}년 예산 내보내기 (.json)</button></div>
    <hr style="border:0;border-top:1px solid var(--line);margin:14px 0">
    <label class="f">가져올 파일 (.json — 업무허브/출장 웹앱에서 내보낸 예산)<input class="inp" type="file" id="ex-file" accept=".json,application/json"></label>
    <div class="row small" style="gap:14px"><label class="row"><input type="radio" name="ex-m" value="merge" checked> 없는 줄만 추가 (기존 유지)</label><label class="row"><input type="radio" name="ex-m" value="replace"> 해당 재원·연도를 파일 내용으로 교체</label></div>
    <div id="ex-info" class="small faint" style="margin-top:8px"></div>`,
    foot: `<button class="btn" data-close>닫기</button><button class="btn primary" id="ex-in" disabled>가져오기</button>`,
    onMount: el => {
      let data = null;
      $('#ex-out', el).onclick = () => { const o = bgExchange(y); download(`예산교환_${y}_${ymd(today())}.json`, JSON.stringify(o, null, 1), 'application/json'); toast(`예산 줄 ${o.lines.length}개 · 집행 요약 ${o.usage.length}개 계정을 내보냈어요`); };
      $('#ex-file', el).onchange = async e => { const f = e.target.files[0]; if (!f) return; try { data = JSON.parse(await f.text()); const n = (Array.isArray(data) ? data : data.lines || []).length; $('#ex-info', el).textContent = `${f.name} · 예산 줄 ${n}개${data.year ? ' · ' + data.year + '년' : ''}${data.from ? ' · ' + data.from + '에서 내보냄' : ''}`; $('#ex-in', el).disabled = !n && !data.grant; } catch (err) { data = null; $('#ex-info', el).textContent = '읽을 수 없는 파일이에요 (json이 아니에요)'; $('#ex-in', el).disabled = true; } };
      $('#ex-in', el).onclick = () => { if (!data) return; const m = el.querySelector('[name="ex-m"]:checked').value, r = bgApplyExchange(data, m); closeSheet(); render(); toast(`예산 줄 ${r.add}개 추가${r.rep ? ` (기존 ${r.rep}개 교체)` : ''}`); };
    }});
}

/* ---------- 예산 입력 ---------- */
function bgPlanView(el, b, y) {
  const ls = linesOf(BG.fund, y);
  const inp = (l, k, cls = '', ph = '') => `<input class="inp ${cls}" data-l="${l.id}" data-k="${k}" value="${esc(l[k] ?? '')}" placeholder="${ph}">`;
  el.innerHTML = `
  <div class="row">${fundSelect(b)}<span class="grow"></span><button class="btn" id="pl-paste">${icon('copy')}엑셀에서 붙여넣기</button><button class="btn" id="pl-add">${icon('plus')}줄 추가</button></div>
  <div class="note small">본예산 = 연초 계획, 1차·2차 추경 = <b>추경 후 전체 금액</b>(증감액 아님). 현재 예산은 가장 최근 추경 금액으로 계산해요. 한 목을 여러 사업으로 나눠 쓰면 줄을 나눠 <b>사업명</b>을 적고, 적요로 구분할 단어가 있으면 <b>적요 키워드</b>에 적어 주세요.</div>
  ${ls.length ? `<div class="tbl-wrap"><table class="tbl bg-plan"><thead><tr><th>구분</th><th>관</th><th>항</th><th>목 (진우 계정명)</th><th>사업명</th><th>사업 담당</th><th>적요 키워드</th><th class="r">본예산</th><th class="r">1차 추경</th><th class="r">2차 추경</th><th></th></tr></thead><tbody>
    ${ls.map(l => `<tr><td><select class="inp" data-l="${l.id}" data-k="type">${Object.entries(BG_TYPES).map(([k, n]) => `<option value="${k}" ${l.type === k ? 'selected' : ''}>${n}</option>`).join('')}</select></td>
      <td>${inp(l, 'gwan')}</td><td>${inp(l, 'hang')}</td><td>${inp(l, 'mok')}</td><td>${inp(l, 'proj', '', '없으면 비움')}</td><td>${inp(l, 'owner')}</td><td>${inp(l, 'kw', '', '예: 자조모임')}</td>
      <td>${inp(l, 'base', 'num r')}</td><td>${inp(l, 'sup1', 'num r')}</td><td>${inp(l, 'sup2', 'num r')}</td><td><button class="btn ghost sm" data-del="${l.id}" aria-label="삭제">삭제</button></td></tr>`).join('')}</tbody></table></div>
    <div class="row"><span class="faint small grow">입력하면 바로 저장돼요 · ${ls.length}줄</span><button class="btn ghost sm" id="pl-copy">${y + 1}년으로 복사</button><button class="btn danger sm" id="pl-clr">이 재원 ${y}년 예산 지우기</button></div>`
  : `<div class="empty">${esc(fundName(BG.fund))} ${y}년 예산이 없어요. 진우 예산서(엑셀)에서 표를 복사해 "엑셀에서 붙여넣기"로 넣으면 가장 빨라요.</div>`}`;
  bindFundSelect(el);
  $('#pl-add', el).onclick = () => { b.lines.push({id: uid(), y, fund: BG.fund, type: 'out', gwan: '', hang: '', mok: '', proj: '', owner: '', kw: '', base: 0, sup1: 0, sup2: 0}); save(); render(); };
  $('#pl-paste', el).onclick = () => pastePlan(b, y);
  el.addEventListener('change', e => { const t = e.target.closest('[data-l]'); if (!t) return; const l = b.lines.find(x => x.id === t.dataset.l); if (!l) return;
    const k = t.dataset.k; l[k] = ['base', 'sup1', 'sup2'].includes(k) ? toNum(t.value) : t.value.trim(); if (['base', 'sup1', 'sup2'].includes(k)) t.value = l[k] ? won(l[k]) : ''; save(); });
  $$('.bg-plan input.num', el).forEach(i => { if (i.value && i.value !== '0') i.value = won(i.value); else if (i.value === '0') i.value = ''; });
  el.addEventListener('click', e => { const d = e.target.closest('[data-del]'); if (!d) return; if (!d.dataset.armed) { d.dataset.armed = 1; d.textContent = '한 번 더'; return; } b.lines = b.lines.filter(x => x.id !== d.dataset.del); save(); render(); });
  const cp = $('#pl-copy', el); if (cp) cp.onclick = () => { const n = ls.map(l => Object.assign({}, l, {id: uid(), y: y + 1, base: curBudget(l), sup1: 0, sup2: 0})); b.lines.push(...n); save(); toast(`${n.length}줄을 ${y + 1}년 본예산으로 복사했어요`); };
  const cl = $('#pl-clr', el); if (cl) cl.onclick = () => { if (!cl.dataset.armed) { cl.dataset.armed = 1; cl.textContent = '한 번 더 누르면 지움'; return; } b.lines = b.lines.filter(l => !(l.fund === BG.fund && Number(l.y) === y)); save(); render(); };
}
function pastePlan(b, y) {
  sheet({title: '예산서 붙여넣기', wide: true, body: `
    <div class="note small">엑셀에서 <b>제목 줄까지 포함해</b> 표를 복사해 붙여 넣으세요. 열 이름으로 알아봐요: <b>구분(세입/세출) · 관 · 항 · 목 · 사업명 · 본예산 · 1차 추경 · 2차 추경</b> (없는 열은 빼도 돼요). 관·항이 위 칸에만 적힌 병합 표도 아래로 채워 읽어요.</div>
    <label class="f">재원<select class="inp" id="pp-f">${b.funds.map(f => `<option value="${f.id}" ${BG.fund === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
    <label class="f">구분 열이 없을 때<select class="inp" id="pp-t"><option value="out">모두 세출</option><option value="in">모두 세입</option></select></label>
    <textarea class="inp mono" id="pp-x" rows="10" placeholder="관	항	목	사업명	본예산	1차추경&#10;사무비	인건비	급여		120,000,000	125,000,000"></textarea>
    <div id="pp-prev" class="small"></div>`,
    foot: `<button class="btn" data-close>취소</button><button class="btn primary" id="pp-ok">넣기</button>`,
    onMount: el => {
      const parse = () => {
        const rows = $('#pp-x', el).value.split(/\r?\n/).map(r => r.split('\t')).filter(r => r.some(c => c.trim()));
        if (rows.length < 2) return [];
        const h = rows[0].map(c => c.replace(/\s/g, ''));
        const ix = re => h.findIndex(c => re.test(c));
        const I = {type: ix(/구분|세입세출/), gwan: ix(/^관/), hang: ix(/^항/), mok: ix(/^목|계정|세목/), proj: ix(/사업/), base: ix(/본예산|당초|예산액|^예산$|금액/), sup1: ix(/1차|추경1/), sup2: ix(/2차|추경2/)};
        if (I.sup1 < 0) I.sup1 = ix(/추경/);
        const def = $('#pp-t', el).value; let g = '', hg = '';
        return rows.slice(1).map(r => { const v = k => I[k] >= 0 ? String(r[I[k]] || '').trim() : '';
          if (v('gwan')) g = v('gwan'); if (v('hang')) hg = v('hang');
          const mok = v('mok'); if (!mok || SKIP_RE.test(mok) || /합계|총계|계$/.test(mok)) return null;
          const t = v('type'); const type = /세입|수입/.test(t) ? 'in' : /세출|지출/.test(t) ? 'out' : def;
          return {id: uid(), y, fund: $('#pp-f', el).value, type, gwan: g, hang: hg, mok, proj: v('proj'), owner: '', kw: '', base: toNum(v('base')), sup1: toNum(v('sup1')), sup2: toNum(v('sup2'))}; }).filter(Boolean);
      };
      const prev = () => { const p = parse(); $('#pp-prev', el).innerHTML = p.length ? `${p.length}줄 인식 · 본예산 합계 ${won(p.reduce((a, l) => a + l.base, 0))}원 · 예: ${esc(p[0].gwan)} › ${esc(p[0].hang)} › <b>${esc(p[0].mok)}</b> ${won(curBudget(p[0]))}` : '<span class="faint">아직 인식된 줄이 없어요 (제목 줄 포함해서 붙여 넣기)</span>'; };
      $('#pp-x', el).oninput = prev; $('#pp-t', el).onchange = prev; prev();
      $('#pp-ok', el).onclick = () => { const p = parse(); if (!p.length) { toast('인식된 줄이 없어요'); return; } b.lines.push(...p); BG.fund = p[0].fund; save(); closeSheet(); render(); toast(`예산 ${p.length}줄을 넣었어요`); };
    }});
}
function editFunds() {
  const b = bgState();
  sheet({title: '재원 · 담당자', wide: true, body: `
    <div class="note small">담당자 이름은 이 기기에만 저장돼요. "내 담당"을 체크하면 재원별 화면에서 내 것만 모아 볼 수 있어요.</div>
    <div id="fu" style="display:flex;flex-direction:column;gap:8px">${b.funds.map(f => `<div class="path-row" data-fid="${f.id}"><input class="inp" data-fn value="${esc(f.name)}" placeholder="재원 이름"><input class="inp" data-fo value="${esc(f.owner || '')}" placeholder="담당자"><div class="row" style="gap:6px"><label class="row small"><input type="checkbox" data-fm ${f.mine ? 'checked' : ''}> 내 담당</label><button class="btn ghost sm" data-fdel>삭제</button></div></div>`).join('')}</div>
    <button class="btn sm" id="fu-add" style="align-self:flex-start">${icon('plus')}재원 추가</button>`,
    foot: `<button class="btn" data-close>취소</button><button class="btn primary" id="fu-save">저장</button>`,
    onMount: el => {
      $('#fu-add', el).onclick = () => $('#fu', el).insertAdjacentHTML('beforeend', `<div class="path-row" data-fid="f${uid()}"><input class="inp" data-fn placeholder="재원 이름"><input class="inp" data-fo placeholder="담당자"><div class="row" style="gap:6px"><label class="row small"><input type="checkbox" data-fm> 내 담당</label><button class="btn ghost sm" data-fdel>삭제</button></div></div>`);
      el.addEventListener('click', e => { const d = e.target.closest('[data-fdel]'); if (!d) return; const r = d.closest('[data-fid]'); const used = b.lines.some(l => l.fund === r.dataset.fid);
        if (used && !d.dataset.armed) { d.dataset.armed = 1; d.textContent = '예산 있음 · 한 번 더'; return; } r.remove(); });
      $('#fu-save', el).onclick = () => {
        const nf = $$('[data-fid]', el).map(r => ({id: r.dataset.fid, name: $('[data-fn]', r).value.trim(), owner: $('[data-fo]', r).value.trim(), mine: $('[data-fm]', r).checked})).filter(f => f.name);
        const keep = new Set(nf.map(f => f.id)); b.funds = nf; b.lines = b.lines.filter(l => keep.has(l.fund));
        Object.keys(b.ledgers).forEach(k => { if (!keep.has(k.split('|')[0])) delete b.ledgers[k]; }); save(); closeSheet(); render(); toast('저장했어요');
      };
    }});
}

/* ---------- 원장 올리기 ---------- */
function uploadLedger(fund) {
  const b = bgState(); let wb = null, rows = [], hdr = -1, mp = {};
  sheet({title: '진우 총계정별원장 올리기', wide: true, body: `
    <div class="note small">진우 <b>회계 → 장부 → 총계정별원장</b>(또는 계정별원장)을 재원(회계단위)별로 엑셀 저장해서 올리세요. 같은 재원·연도로 다시 올리면 새 파일로 바뀌어요. 월계·누계·이월 줄은 빼고 읽어요.</div>
    <div class="form-grid"><label class="f">재원<select class="inp" id="lu-f">${b.funds.map(f => `<option value="${f.id}" ${(fund || BG.fund) === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
      <label class="f">연도<input class="inp" id="lu-y" type="number" value="${b.year}"></label></div>
    <label class="f">엑셀 파일<input type="file" id="lu-file" accept=".xlsx,.xls,.csv"></label>
    <div id="lu-map"></div><div id="lu-prev" class="small"></div>`,
    foot: `<button class="btn" data-close>취소</button><button class="btn primary" id="lu-ok" disabled>저장</button>`,
    onMount: el => {
      const drawMap = () => {
        const h = rows[hdr] || [];
        $('#lu-map', el).innerHTML = hdr < 0 ? '<div class="note warn small">제목 줄(일자·적요·차변·대변)을 못 찾았어요. 다른 시트를 고르거나 진우에서 엑셀 저장 형식을 확인해 주세요.</div>' : `
          ${wb.SheetNames.length > 1 ? `<label class="f">시트<select class="inp" id="lu-sh">${wb.SheetNames.map(n => `<option>${esc(n)}</option>`).join('')}</select></label>` : ''}
          <div class="form-grid">${Object.entries(LFIELD).map(([k, f]) => `<label class="f">${f.label}<select class="inp" data-m="${k}"><option value="">없음</option>${h.map((c, i) => `<option value="${i}" ${mp[k] === i ? 'selected' : ''}>${XLSXcol(i)} · ${esc(String(c).slice(0, 14))}</option>`).join('')}</select></label>`).join('')}</div>`;
        $$('[data-m]', el).forEach(s => s.onchange = () => { mp[s.dataset.m] = s.value === '' ? undefined : Number(s.value); prev(); });
        const sh = $('#lu-sh', el); if (sh) sh.onchange = () => pick(sh.value);
        prev();
      };
      const prev = () => {
        if (hdr < 0 || mp.date == null || (mp.dr == null && mp.cr == null)) { $('#lu-prev', el).innerHTML = ''; $('#lu-ok', el).disabled = true; return; }
        const p = parseLedger(rows, hdr, mp, Number($('#lu-y', el).value)), accts = [...new Set(p.rows.map(r => r[1]))];
        const y = Number($('#lu-y', el).value), fid = $('#lu-f', el).value, n = accts.filter(a => matchLine(fid, y, a, '', '')).length;
        const yrs = [...new Set(p.rows.map(r => r[6]))];
        $('#lu-prev', el).innerHTML = p.rows.length ? `<div class="note small"><b>${p.rows.length}건</b> · ${p.from.slice(0, 2)}/${p.from.slice(2)} ~ ${p.to.slice(0, 2)}/${p.to.slice(2)} · 계정 ${accts.length}개 (예산 목과 맞음 ${n}개${accts.length - n ? ` · 미분류 ${accts.length - n}개는 저장 후 "미분류"에서 연결` : ''})${yrs.length && !yrs.includes(String(y)) ? `<br><b style="color:var(--stamp)">파일의 연도(${yrs.join(', ')})가 선택한 연도와 달라요</b>` : ''}<br>계정 예: ${accts.slice(0, 6).map(esc).join(' · ')}</div>` : '<div class="note warn small">읽은 거래가 없어요. 일자·차변·대변 열 지정을 확인해 주세요.</div>';
        $('#lu-ok', el).disabled = !p.rows.length;
      };
      const pick = name => { rows = XLSX.utils.sheet_to_json(wb.Sheets[name], {header: 1, raw: true, defval: ''}); hdr = ledgerHeader(rows); mp = hdr >= 0 ? ledgerAutoMap(rows[hdr]) : {};
        const pre = (S.mapPresets || {})['ledger:' + (rows[hdr] || []).join('|')]; if (pre) mp = clone(pre); drawMap(); };
      $('#lu-file', el).onchange = async e => { const f = e.target.files[0]; if (!f) return; try { wb = await readWorkbook(f); pick(wb.SheetNames[0]); } catch (err) { toast(err.message || '파일을 읽지 못했어요'); } };
      $('#lu-f', el).onchange = prev; $('#lu-y', el).onchange = prev;
      $('#lu-ok', el).onclick = () => {
        const fid = $('#lu-f', el).value, y = Number($('#lu-y', el).value), p = parseLedger(rows, hdr, mp, y);
        b.ledgers[`${fid}|${y}`] = {file: ($('#lu-file', el).files[0] || {}).name || '', up: ymd(today()), from: p.from, to: p.to, rows: p.rows.map(r => r.slice(0, 6))};
        S.mapPresets = S.mapPresets || {}; S.mapPresets['ledger:' + (rows[hdr] || []).join('|')] = clone(mp);
        b.year = y; BG.fund = fid; save(); closeSheet(); render(); toast(`${fundName(fid)} 원장 ${p.rows.length}건을 반영했어요`);
      };
    }});
}

/* ---------- 엑셀 내보내기 ---------- */
function exportBudgetXlsx(y) {
  if (!window.XLSX) { toast('엑셀 모듈을 불러오지 못했어요'); return; }
  const b = bgState(), wb = XLSX.utils.book_new(), Z = '#,##0;-#,##0;"-"', n0 = v => Number(v) || 0;
  const cn = (v, z = Z) => ({t: 'n', v: n0(v), z}), cf = (f, v, z = Z) => ({t: 'n', f, v: n0(v), z}), cs = v => ({t: 's', v: String(v ?? '')});
  const COL = i => (i < 26 ? String.fromCharCode(65 + i) : 'A' + String.fromCharCode(65 + i - 26));
  // 계정별: 본예산·1차·2차 입력 → 현재예산·잔액·집행률은 수식, 집행은 월별 합 수식
  const H = ['재원', '구분', '관', '항', '목', '사업명', '본예산', '1차 추경', '2차 추경', '현재예산', '집행', '잔액', '집행률(%)', ...Array.from({length: 12}, (_, i) => `${i + 1}월`)];
  const det = {}; H.forEach((h, i) => det[COL(i) + '1'] = cs(h)); let r = 2; const first = 2;
  b.funds.forEach(f => { const c = computeFund(f.id, y); linesOf(f.id, y).forEach(l => { const x = c.byLine[l.id] || {amt: 0, mon: Array(12).fill(0)}, cur = curBudget(l), mon = x.mon.reduce((a, z) => a + z, 0), same = Math.abs(mon - x.amt) < 1;
    [f.name, BG_TYPES[l.type], l.gwan, l.hang, l.mok, l.proj].forEach((v, i) => det[COL(i) + r] = cs(v));
    det['G' + r] = cn(l.base); det['H' + r] = cn(l.sup1); det['I' + r] = cn(l.sup2);
    det['J' + r] = cf(`IF(I${r}>0,I${r},IF(H${r}>0,H${r},G${r}))`, cur);
    det['K' + r] = same ? cf(`SUM(N${r}:Y${r})`, x.amt) : cn(x.amt);
    det['L' + r] = cf(`J${r}-K${r}`, cur - x.amt); det['M' + r] = cf(`IF(J${r}=0,0,ROUND(K${r}/J${r}*100,0))`, pct(x.amt, cur), '0');
    x.mon.forEach((v, i) => det[COL(13 + i) + r] = cn(v)); r++; }); });
  const lastD = Math.max(first, r - 1); det['!ref'] = `A1:Y${lastD}`; det['!cols'] = [18, 6, 14, 14, 18, 16, 14, 14, 14, 14, 14, 14, 9, ...Array(12).fill(11)].map(w => ({wch: w}));
  // 재원별: 계정별 시트의 합계를 SUMIFS 수식으로
  const S = {}; ['재원', '담당', '세출 본예산', '세출 현재예산', '집행', '잔액', '집행률(%)', '세입 예산', '세입 실적', '원장 기간'].forEach((h, i) => S[COL(i) + '1'] = cs(h));
  const rng = c => `계정별!$${c}$${first}:$${c}$${lastD}`; let q = 2;
  b.funds.forEach(f => { const s = fundSummary(f.id, y), L = b.ledgers[`${f.id}|${y}`];
    S['A' + q] = cs(f.name); S['B' + q] = cs(f.owner || '');
    const sf = (col, t) => `SUMIFS(${rng(col)},${rng('A')},$A${q},${rng('B')},"${t}")`;
    S['C' + q] = cf(sf('G', '세출'), s.sum.out.base); S['D' + q] = cf(sf('J', '세출'), s.sum.out.cur); S['E' + q] = cf(sf('K', '세출'), s.sum.out.used);
    S['F' + q] = cf(`D${q}-E${q}`, s.sum.out.cur - s.sum.out.used); S['G' + q] = cf(`IF(D${q}=0,0,ROUND(E${q}/D${q}*100,0))`, pct(s.sum.out.used, s.sum.out.cur), '0');
    S['H' + q] = cf(sf('J', '세입'), s.sum.in.cur); S['I' + q] = cf(sf('K', '세입'), s.sum.in.used ?? 0); S['J' + q] = cs(L ? `${L.from}~${L.to}` : ''); q++; });
  S['A' + q] = cs('합계'); 'CDEFHI'.split('').forEach(c => { S[c + q] = cf(`SUM(${c}2:${c}${q - 1})`, 0); }); S['G' + q] = cf(`IF(D${q}=0,0,ROUND(E${q}/D${q}*100,0))`, 0, '0');
  S['!ref'] = `A1:J${q}`; S['!cols'] = [22, 10, 15, 15, 15, 15, 9, 15, 15, 12].map(w => ({wch: w}));
  XLSX.utils.book_append_sheet(wb, S, '재원별'); XLSX.utils.book_append_sheet(wb, det, '계정별');
  const out = XLSX.write(wb, {bookType: 'xlsx', type: 'array'});
  download(`${ymdShort()}_예산집행_${y}.xlsx`, new Blob([out], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  toast('엑셀을 저장했어요 — 현재예산·잔액·합계는 수식이에요');
}

/* ---------- 예시 데이터 (둘러보기용) ---------- */
function loadBudgetDemo() {
  const b = bgState(), y = b.year, f = b.funds[0].id;
  if (b.lines.some(l => l.fund === f && Number(l.y) === y)) return;
  const L = (type, gwan, hang, mok, proj, base, sup1, kw = '') => ({id: uid(), y, fund: f, type, gwan, hang, mok, proj, owner: proj ? '담당자' : '', kw, base, sup1, sup2: 0, demo: true});
  b.lines.push(
    L('in', '보조금수입', '보조금수입', '시도보조금', '', 180000000, 185000000),
    L('out', '사무비', '인건비', '급여', '', 120000000, 124000000), L('out', '사무비', '인건비', '제수당', '', 12000000, 12000000),
    L('out', '사무비', '업무추진비', '회의비', '', 2400000, 2400000), L('out', '사무비', '운영비', '수용비및수수료', '', 8000000, 8000000),
    L('out', '사무비', '운영비', '공공요금', '', 3600000, 3600000),
    L('out', '사업비', '운영비', '사업운영비', '동료상담', 9000000, 9000000, '동료상담,상담'), L('out', '사업비', '운영비', '사업운영비', '자조모임', 6000000, 6500000, '자조모임'),
    L('out', '사업비', '운영비', '사업운영비', '권익옹호', 5000000, 5000000, '권익,옹호'));
  const rows = []; const add = (m, d, a, memo, dr, cr = 0) => rows.push([pad(m) + pad(d), a, '', dr, cr, memo]);
  for (let m = 1; m <= 9; m++) {
    add(m, 10, '[4111] 시도보조금', `${m}월 보조금 입금`, 0, 15000000);
    add(m, 25, '[5111] 급여', `${m}월 급여`, 10200000); add(m, 25, '[5121] 제수당', `${m}월 제수당`, 950000);
    add(m, 12, '[5211] 수용비및수수료', '사무용품 구입', 520000 + m * 13000); add(m, 20, '[5231] 공공요금', `${m}월 전기·통신`, 290000);
    if (m % 2) add(m, 15, '[5311] 사업운영비', `동료상담 ${m}월 활동비`, 610000);
    if (m % 3 === 0) add(m, 18, '[5311] 사업운영비', `자조모임 간식·교통`, 880000);
    if (m === 4 || m === 8) add(m, 22, '[5311] 사업운영비', '권익옹호 캠페인 물품', 1200000);
    if (m === 6) add(m, 5, '[5311] 사업운영비', '홍보물 제작', 350000);
    if (m === 7) add(m, 3, '[5141] 퇴직적립금', '퇴직적립', 3000000);
  }
  b.ledgers[`${f}|${y}`] = {file: '예시_총계정별원장.xlsx', up: ymd(today()), from: '0110', to: '0925', rows, demo: true};
  save();
}

/* 오늘 화면: 내 담당 재원 잔액 */
function budgetHomePanel() {
  if (!S.budget) return '';
  const b = bgState(), y = b.year, fs = b.funds.filter(f => f.mine && linesOf(f.id, y).length);
  if (!fs.length) return '';
  return `<section class="panel"><div class="panel-h"><h2>내 담당 재원 · ${y}</h2><a class="btn ghost sm" href="#budget">예산</a></div>
    <div class="panel-b" style="display:flex;flex-direction:column;gap:12px">${fs.map(f => { const s = fundSummary(f.id, y), o = s.sum.out, r = pct(o.used, o.cur);
      return `<a href="#budget" data-bgf="${f.id}" style="text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:6px">
        <div class="row"><b>${esc(f.name)}</b><span class="grow"></span><span class="small muted">잔액</span><b class="num ${o.cur - o.used < 0 ? 'neg' : ''}">${won(o.cur - o.used)}</b></div>
        <div class="row small" style="gap:8px">${bar(r, s.c.lastMon)}<span class="num">${r}%</span>${paceNote(r, s.c.lastMon)}</div></a>`; }).join('')}</div></section>`;
}
document.addEventListener('click', e => { const a = e.target.closest('[data-bgf]'); if (a) { BG.fund = a.dataset.bgf; BG.tab = 'acct'; } });
