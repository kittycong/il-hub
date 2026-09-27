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
  const tabs = [['fund', '재원별 잔액'], ['acct', '계정별 세부'], ['proj', '사업별 사용액'], ['plan', '예산 입력'], ['unm', '미분류']];
  const umTotal = b.funds.reduce((a, f) => a + fundSummary(f.id, y).um, 0);
  v.innerHTML = `
  <div class="page-head"><div><h1>예산 · 잔액</h1><p>연초 예산(본예산·추경)과 진우 <b>총계정별원장</b> 엑셀을 맞춰 재원별·계정별·사업별 집행액과 잔액을 봅니다. 파일은 이 기기 안에서만 읽어요.</p></div>
    <div class="row"><select class="inp" id="bg-y" style="width:auto">${[y - 1, y, y + 1].map(x => `<option ${x === y ? 'selected' : ''}>${x}</option>`).join('')}</select>
    <button class="btn primary" id="bg-up">${icon('plus')}원장 올리기</button></div></div>
  <div class="seg" role="group" aria-label="보기">${tabs.map(([k, n]) => `<button aria-pressed="${BG.tab === k}" data-bt="${k}">${n}${k === 'unm' && umTotal ? ` <span class="chip warn" style="height:18px;padding:0 6px">${umTotal}</span>` : ''}</button>`).join('')}</div>
  <div id="bg-body"></div>`;
  $('#bg-y', v).onchange = e => { b.year = Number(e.target.value); save(); render(); };
  $('#bg-up', v).onclick = () => uploadLedger(BG.tab === 'fund' ? '' : BG.fund);
  $$('[data-bt]', v).forEach(x => x.onclick = () => { BG.tab = x.dataset.bt; render(); });
  const body = $('#bg-body', v);
  ({fund: bgFundView, acct: bgAcctView, proj: bgProjView, plan: bgPlanView, unm: bgUnmView})[BG.tab](body, b, y);
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
    const a = e.target.closest('[data-go-acct]'); if (a) { BG.fund = a.dataset.goAcct; BG.tab = 'acct'; render(); return; }
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
  b.funds.forEach(f => { const c = computeFund(f.id, y); Object.entries(c.unmatched).forEach(([a, u]) => list.push({fund: f.id, acct: a, ...u})); });
  el.innerHTML = list.length ? `
    <div class="note small">원장에는 있는데 예산에 같은 이름의 목이 없는 계정이에요. 예산의 어느 목인지 고르면 다음부터 자동으로 맞춰요. (이름이 달라도 연결 가능)</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>재원</th><th>원장 계정</th><th class="r">건수</th><th class="r">차변</th><th class="r">대변</th><th>예산 목에 연결</th></tr></thead><tbody>
    ${list.map((u, i) => { const opts = linesOf(u.fund, y).filter((l, j, a) => a.findIndex(z => bnorm(z.mok) === bnorm(l.mok)) === j);
      return `<tr><td class="small">${esc(fundName(u.fund))}</td><td class="wrap">${esc(u.acct)}</td><td class="r">${u.n}</td><td class="r">${won(u.dr)}</td><td class="r">${won(u.cr)}</td>
      <td><div class="row" style="gap:4px"><select class="inp" data-map="${i}" style="width:auto;max-width:220px"><option value="">선택</option>${opts.map(l => `<option value="${esc(bnorm(l.mok))}">${BG_TYPES[l.type]} · ${esc(l.mok)}</option>`).join('')}</select><button class="btn ghost sm" data-addline="${i}">예산에 새 목 추가</button></div></td></tr>`; }).join('')}</tbody></table></div>`
    : `<div class="empty">미분류 계정이 없어요</div>`;
  el.addEventListener('change', e => { const s = e.target.closest('[data-map]'); if (!s || !s.value) return; const u = list[Number(s.dataset.map)]; b.alias[`${u.fund}|${y}|${bnorm(u.acct)}`] = s.value; save(); render(); toast('연결했어요'); });
  el.addEventListener('click', e => { const a = e.target.closest('[data-addline]'); if (!a) return; const u = list[Number(a.dataset.addline)];
    const type = u.cr > u.dr || IN_RE.test(u.acct) ? 'in' : 'out';
    b.lines.push({id: uid(), y, fund: u.fund, type, gwan: '', hang: '', mok: u.acct.replace(/^[\[\(]?\d+[\]\)]?\s*/, ''), proj: '', owner: '', kw: '', base: 0, sup1: 0, sup2: 0}); save(); render(); toast('예산에 목을 추가했어요 (금액은 예산 입력에서)'); });
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
  const b = bgState(), wb = XLSX.utils.book_new();
  const sum = [['재원', '담당', '세출 본예산', '세출 현재예산', '집행', '잔액', '집행률(%)', '세입 예산', '세입 실적', '원장 기간']];
  b.funds.forEach(f => { const s = fundSummary(f.id, y), L = b.ledgers[`${f.id}|${y}`]; sum.push([f.name, f.owner || '', s.sum.out.base, s.sum.out.cur, s.sum.out.used, s.sum.out.cur - s.sum.out.used, pct(s.sum.out.used, s.sum.out.cur), s.sum.in.cur, s.sum.in.used, L ? `${L.from}~${L.to}` : '']); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), '재원별');
  const det = [['재원', '구분', '관', '항', '목', '사업명', '본예산', '현재예산', '집행', '잔액', '집행률(%)', ...Array.from({length: 12}, (_, i) => `${i + 1}월`)]];
  b.funds.forEach(f => { const c = computeFund(f.id, y); linesOf(f.id, y).forEach(l => { const x = c.byLine[l.id] || {amt: 0, mon: Array(12).fill(0)};
    det.push([f.name, BG_TYPES[l.type], l.gwan, l.hang, l.mok, l.proj, Number(l.base) || 0, curBudget(l), x.amt, curBudget(l) - x.amt, pct(x.amt, curBudget(l)), ...x.mon]); }); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(det), '계정별');
  const out = XLSX.write(wb, {bookType: 'xlsx', type: 'array'});
  download(`예산집행_${y}_${ymd(today())}.xlsx`, new Blob([out], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
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
