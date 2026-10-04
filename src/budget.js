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
  const tabs = [['fund', '재원별 잔액'], ['led', '원장 계정별'], ['grant', '교부·집행 격자'], ['acct', '계정별 세부'], ['proj', '사업별 사용액'], ['plan', '예산 입력'], ['unm', '미분류']];
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
  ({fund: bgFundView, led: bgLedView, grant: bgGrantView, acct: bgAcctView, proj: bgProjView, plan: bgPlanView, unm: bgUnmView})[BG.tab](body, b, y);
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
  const ls = linesOf(fund, y).filter(l => bnorm(l.mok) === bnorm(acct));
  return {v: ls.reduce((a, l) => a + curBudget(l), 0), own: false};
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


/* ---------- 교부·집행 격자 (서울시 IL센터 지원사업처럼 분기마다 교부액이 달라지는 보조금) ----------
   계정과목 × (연간 결정액, 1~4분기 교부액, 자부담 예산·집행, 집행, 미교부, 잔액). 집행은 올린 원장에서 자동으로 가져옴(연동).
   금액은 직접 입력 → 이 기기 브라우저에만 저장. S.budget.grant['재원|연도'] = {계정:{annual,q:[4],sb,sj}}, grantQ = 분기별 재배정액[4] */
function grantState(fund, y) { const b = bgState(); b.grant = b.grant || {}; b.grantQ = b.grantQ || {}; return {rows: b.grant[`${fund}|${y}`] ||= {}, q: b.grantQ[`${fund}|${y}`] ||= ['', '', '', '']}; }
function bgGrantView(el, b, y) {
  const g = ledAgg(BG.fund, y), G = grantState(BG.fund, y), t = today(), curQ = y === t.getFullYear() ? Math.floor(t.getMonth() / 3) + 1 : 4;
  const accts = new Map(); (g ? g.list.filter(a => ['hr', 'ops', 'biz'].includes(a.grp)) : []).forEach(a => accts.set(a.acct, a));
  Object.keys(G.rows).forEach(k => { if (!accts.has(k)) accts.set(k, {acct: k, used: 0, mon: Array(12).fill(0), n: 0, grp: 'biz'}); });
  const rows = [...accts.values()].sort((a, c) => ['hr', 'ops', 'biz'].indexOf(a.grp) - ['hr', 'ops', 'biz'].indexOf(c.grp) || c.used - a.used).map(a => {
    const r = G.rows[a.acct] || {}, q = (r.q || []).map(x => Number(x) || 0), cq = [0, 1, 2, 3].map(i => q[i] || 0), grant = cq.reduce((x, z) => x + z, 0), ann = Number(r.annual) || 0;
    const eq = [0, 1, 2, 3].map(i => a.mon.slice(i * 3, i * 3 + 3).reduce((x, z) => x + z, 0));
    return {a, r, ann, cq, grant, used: a.used, eq, rest: ann - grant, bal: grant - a.used, sb: Number(r.sb) || 0, sj: Number(r.sj) || 0};
  });
  const sum = f => rows.reduce((x, r) => x + f(r), 0), qsum = i => sum(r => r.cq[i]);
  // 확인할 곳
  const warn = [], bad = new Set();
  rows.forEach(r => { const n = r.a.acct;
    if (r.ann && r.grant > r.ann) { warn.push(`${n}: 교부 합계가 연간 결정액보다 ${won(r.grant - r.ann)}원 많아요`); bad.add(n + '|annual'); }
    if (r.used > r.grant && (r.grant || r.ann)) { warn.push(`${n}: 집행이 교부액보다 ${won(r.used - r.grant)}원 많아요`); bad.add(n + '|used'); }
    if (r.sb && r.sj > r.sb) { warn.push(`${n}: 자부담 집행이 자부담 예산보다 ${won(r.sj - r.sb)}원 많아요`); bad.add(n + '|sj'); }
    if (r.used && !r.ann && !r.grant) warn.push(`${n}: 집행은 있는데 연간 결정액·교부액이 비어 있어요`);
  });
  [0, 1, 2, 3].forEach(i => { const rq = Number(G.q[i]) || 0;
    if (rq && Math.abs(rq - qsum(i)) > 0) { warn.push(`${i + 1}분기: 재배정액 ${won(rq)} ↔ 계정 교부 합 ${won(qsum(i))} (차이 ${won(rq - qsum(i))}원) — 천원 단위 반올림 차이인지 확인`); bad.add('q' + i); }
    if (i + 1 <= curQ && sum(r => r.ann) && !qsum(i) && qsum(0) + qsum(1) + qsum(2) + qsum(3)) { warn.push(`${i + 1}분기 교부액이 비어 있어요`); bad.add('q' + i); } });
  const nq = Math.min(4, curQ + 1), need = rows.filter(r => r.rest > 0 && !r.cq[nq - 1]);
  const needTot = need.reduce((x, r) => x + r.rest, 0);
  const inp = (a, k, v, cls = '') => `<input class="inp num r ${cls}" style="width:112px;height:28px;padding:2px 6px;min-height:0;${bad.has(a + '|' + k) ? 'border-color:var(--stamp);background:rgba(190,60,50,.10)' : ''}" data-g="${esc(a)}" data-gk="${k}" value="${v ? Number(v).toLocaleString('ko-KR') : ''}">`;
  const head = '<th>계정과목</th><th class="r">연간 결정액</th>' + [1, 2, 3, 4].map(i => `<th class="r">${i}분기 교부</th>`).join('') + '<th class="r">교부 합</th><th class="r">미교부</th><th class="r">집행(원장)</th><th class="r">교부 잔액</th><th class="r">자부담 예산</th><th class="r">자부담 집행</th>';
  el.innerHTML = `
  <div class="row">${fundSelect(b)}<span class="grow"></span><span class="faint small">${g ? `집행은 원장 ${g.L.to.slice(0, 2)}/${g.L.to.slice(2)}까지 자동 연동` : '원장을 올리면 집행이 자동으로 채워져요'}</span><button class="btn sm" data-up="${BG.fund}">원장 올리기</button></div>
  <div class="note small">서울시 교부액은 <b>분기마다 달라요</b>. 연간 결정액과 분기별 교부액(교부신청서·알림 공문 기준)을 입력하면 집행(원장 연동)과 비교해 잔액·미교부·확인할 곳을 계산해요. 계정 목록은 올린 원장에서 가져옵니다.</div>
  ${nq <= 4 && needTot ? `<section class="panel" style="border-left:4px solid var(--accent)"><div class="panel-h"><h2>${nq}분기 교부 신청 예정액</h2><button class="btn sm" id="gr-copy">${icon('copy')}계정별 내역 복사</button></div><div class="panel-b"><div class="num" style="font:700 28px var(--f-display)">${won(needTot)}원</div><div class="faint small">연간 결정액 − 지금까지 교부액 (${nq}분기 교부액을 입력하지 않은 계정만) · 교부신청서에는 천원 단위로 적어요</div>
    <div class="tbl-wrap" style="margin-top:8px"><table class="tbl"><tbody>${need.map(r => `<tr><td>${esc(r.a.acct)}</td><td class="r">${won(r.rest)}</td></tr>`).join('')}</tbody></table></div></div></section>` : ''}
  <section class="panel ${warn.length ? '' : 'ok'}"><div class="panel-h"><h2>확인할 곳 ${warn.length ? `<span class="chip warn">${warn.length}</span>` : ''}</h2></div><div class="panel-b">${warn.length ? `<ul style="margin:0;padding-left:18px">${warn.map(w => `<li class="small">${esc(w)}</li>`).join('')}</ul>` : '<span class="faint small">입력한 금액에서 어긋나는 곳이 없어요 (또는 아직 입력 전이에요)</span>'}</div></section>
  ${rows.length ? `<div class="tbl-wrap"><table class="tbl bg-tbl"><thead><tr>${head}</tr></thead><tbody>
  ${rows.map(r => `<tr><td class="wrap">${esc(r.a.acct)}</td><td class="r">${inp(r.a.acct, 'annual', r.ann)}</td>${[0, 1, 2, 3].map(i => `<td class="r">${inp(r.a.acct, 'q' + i, r.cq[i])}${r.eq[i] ? `<div class="faint small">집행 ${won(r.eq[i])}</div>` : ''}</td>`).join('')}<td class="r">${won(r.grant)}</td><td class="r">${r.ann ? won(r.rest) : ''}</td><td class="r ${bad.has(r.a.acct + '|used') ? 'neg' : ''}">${won(r.used)}</td><td class="r ${r.bal < 0 ? 'neg' : ''}">${r.grant ? won(r.bal) : ''}</td><td class="r">${inp(r.a.acct, 'sb', r.sb)}</td><td class="r">${inp(r.a.acct, 'sj', r.sj)}</td></tr>`).join('')}</tbody>
  <tfoot><tr class="bg-g"><td><b>합계</b></td><td class="r">${won(sum(r => r.ann))}</td>${[0, 1, 2, 3].map(i => `<td class="r">${won(qsum(i))}</td>`).join('')}<td class="r">${won(sum(r => r.grant))}</td><td class="r">${won(sum(r => r.ann ? r.rest : 0))}</td><td class="r">${won(sum(r => r.used))}</td><td class="r">${won(sum(r => r.grant ? r.bal : 0))}</td><td class="r">${won(sum(r => r.sb))}</td><td class="r">${won(sum(r => r.sj))}</td></tr>
  <tr><td class="small">분기별 재배정액 (교부신청서 합계)</td><td></td>${[0, 1, 2, 3].map(i => `<td class="r"><input class="inp num r" style="width:112px;height:28px;padding:2px 6px;min-height:0;${bad.has('q' + i) ? 'border-color:var(--stamp)' : ''}" data-gq="${i}" value="${Number(G.q[i]) ? Number(G.q[i]).toLocaleString('ko-KR') : ''}"></td>`).join('')}<td colspan="6" class="small faint">교부신청서는 천원 단위 반올림이라 계정 합과 몇백 원 어긋날 수 있어요</td></tr></tfoot></table></div>`
  : `<div class="empty">원장을 올리면 계정 목록이 자동으로 나와요.</div>`}`;
  bindFundSelect(el);
  el.addEventListener('change', e => {
    const i = e.target.closest('[data-g]'), q = e.target.closest('[data-gq]');
    if (q) { G.q[Number(q.dataset.gq)] = toNum(q.value) || ''; save(); render(); return; }
    if (!i) return; const r = G.rows[i.dataset.g] ||= {annual: '', q: ['', '', '', ''], sb: '', sj: ''}, k = i.dataset.gk, v = toNum(i.value) || '';
    if (k[0] === 'q') { r.q = r.q || ['', '', '', '']; r.q[Number(k[1])] = v; } else r[k] = v; save(); render(); });
  el.addEventListener('click', e => { const u = e.target.closest('[data-up]'); if (u) return uploadLedger(u.dataset.up);
    if (e.target.closest('#gr-copy')) copyText(`${y}년 ${nq}분기 교부 신청 예정액 ${won(needTot)}원\n` + need.map(r => `- ${r.a.acct}: ${won(r.rest)}원`).join('\n'), '복사했어요'); });
}


/* ---------- 예산 교환 파일 (다른 앱 ↔ 업무허브) ----------
   {schema:'il-budget-exchange', v:1, year, funds:[{name}], lines:[...예산 줄], grant:{재원명|연도:{계정:{annual,q,sb,sj}}}, grantQ, ledBud, usage:[{fund,acct,group,used,mon[12]}]}
   - 내보내기: 예산 줄·교부 격자·계정별 집행 요약만 담음 (원장 적요/실명 내역은 담지 않음)
   - 가져오기: 재원은 이름으로 맞춤(없으면 새로 만듦). 관/항/목·본예산 같은 한글·영문 열 이름도 알아봄 */
function bgExchange(y = bgState().year) {
  const b = bgState(), nm = id => fundName(id), out = {schema: 'il-budget-exchange', v: 1, year: y, exported: ymd(today()), from: 'il-hub', funds: b.funds.map(f => ({name: f.name, owner: f.owner || ''})), lines: [], grant: {}, grantQ: {}, ledBud: {}, usage: []};
  b.lines.filter(l => Number(l.y) === Number(y)).forEach(l => out.lines.push({fund: nm(l.fund), year: l.y, type: l.type, gwan: l.gwan, hang: l.hang, mok: l.mok, proj: l.proj, owner: l.owner, kw: l.kw, base: Number(l.base) || 0, sup1: Number(l.sup1) || 0, sup2: Number(l.sup2) || 0}));
  const keyOf = k => { const [f, yy, ...r] = k.split('|'); return {f, yy, r: r.join('|')}; };
  Object.entries(b.grant || {}).forEach(([k, v]) => { const [f, yy] = k.split('|'); if (Number(yy) === Number(y)) out.grant[nm(f) + '|' + yy] = v; });
  Object.entries(b.grantQ || {}).forEach(([k, v]) => { const [f, yy] = k.split('|'); if (Number(yy) === Number(y)) out.grantQ[nm(f) + '|' + yy] = v; });
  Object.entries(b.ledBud || {}).forEach(([k, v]) => { const { f, yy, r } = keyOf(k); if (Number(yy) === Number(y)) out.ledBud[nm(f) + '|' + yy + '|' + r] = v; });
  b.funds.forEach(f => { const g = ledAgg(f.id, y); if (g) g.list.forEach(a => out.usage.push({fund: f.name, acct: a.acct, group: a.grp, n: a.n, used: a.used, mon: a.mon})); });
  return out;
}
const XK = {gwan: ['gwan', '관'], hang: ['hang', '항'], mok: ['mok', '목', '세목', '계정', '계정과목', '과목'], proj: ['proj', '사업', '사업명'], base: ['base', '본예산', '예산액', '예산'], sup1: ['sup1', '1차추경', '1차 추경'], sup2: ['sup2', '2차추경', '2차 추경'], fund: ['fund', '재원', '재원명'], type: ['type', '구분']};
function xpick(o, k) { for (const n of XK[k]) if (o[n] != null && o[n] !== '') return o[n]; return ''; }
function bgApplyExchange(data, mode = 'merge', y = null) {
  const b = bgState(); const arr = Array.isArray(data) ? data : (data.lines || []); const yy = Number(y || data.year || b.year);
  const fid = name => { name = String(name || '').trim() || b.funds[0].name; let f = b.funds.find(x => x.name === name || bnorm(x.name) === bnorm(name)); if (!f) { f = {id: 'f' + uid(), name, owner: '', mine: false}; b.funds.push(f); } return f.id; };
  const lines = arr.map(o => { const t = String(xpick(o, 'type')); return {id: uid(), y: Number(o.year || o.y || yy), fund: fid(xpick(o, 'fund')), type: /입|in/i.test(t) ? 'in' : 'out', gwan: String(xpick(o, 'gwan')), hang: String(xpick(o, 'hang')), mok: String(xpick(o, 'mok')), proj: String(xpick(o, 'proj')), owner: o.owner || '', kw: o.kw || '', base: toNum(xpick(o, 'base')), sup1: toNum(xpick(o, 'sup1')), sup2: toNum(xpick(o, 'sup2'))}; }).filter(l => l.mok);
  let add = 0, rep = 0;
  if (mode === 'replace') { const keys = new Set(lines.map(l => l.fund + '|' + l.y)); const before = b.lines.length; b.lines = b.lines.filter(l => !keys.has(l.fund + '|' + l.y)); rep = before - b.lines.length; }
  lines.forEach(l => { if (mode === 'merge' && b.lines.some(x => x.fund === l.fund && Number(x.y) === l.y && bnorm(x.mok) === bnorm(l.mok) && bnorm(x.proj) === bnorm(l.proj))) return; b.lines.push(l); add++; });
  const idOf = name => b.funds.find(f => f.name === name || bnorm(f.name) === bnorm(name));
  [['grant', 'grant'], ['grantQ', 'grantQ']].forEach(([src, dst]) => Object.entries(data[src] || {}).forEach(([k, v]) => { const [fn, y2] = k.split('|'), f = idOf(fn); if (!f) return; b[dst] = b[dst] || {}; const kk = `${f.id}|${y2}`; if (mode === 'replace' || !b[dst][kk]) b[dst][kk] = v; else if (src === 'grant') Object.entries(v).forEach(([a, r]) => { b[dst][kk][a] = b[dst][kk][a] || r; }); }));
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
