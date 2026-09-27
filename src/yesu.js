/* ================= 예수금: 재원별 금액 확인 + 전표 문안 ================= */
const YS = {mon: ''};
const YS_TPL = [
  {k:'er', who:'각 재원 · 지출결의', t:'{Y}년 {M}월분 사회보험 사용자부담금 예수금 통장 이체 ({재원})', amt:'사용자'},
  {k:'emp', who:'각 재원 · 지출결의', t:'{Y}년 {M}월분 사회보험 근로자부담금(급여 공제분) 예수금 통장 이체 ({재원})', amt:'근로자'},
  {k:'ret', who:'각 재원 · 지출결의', t:'{Y}년 {M}월분 퇴직적립금 적립 ({재원})', amt:'퇴직'},
  {k:'in', who:'예수금 · 수입결의', t:'{Y}년 {M}월분 사회보험료 예수금 입금 ({재원} · 근로자 {근로자}원, 사용자 {사용자}원)', amt:'합계'},
  {k:'pay', who:'예수금 · 지출결의', t:'{Y}년 {M}월분 4대보험료 납부 (국민연금·건강·장기요양·고용·산재 / {NY}년 {NM}월 10일 납부)', amt:'고지'},
  {k:'diff', who:'차이가 있을 때', t:'{Y}년 {M}월분 사회보험료 고지액과 예수금 차액 정리 ({차액}원 · 사유: )', amt:'차액'},
];
function ysState() {
  S.yesu = S.yesu || {};
  const y = S.yesu; y.funds = y.funds || ['서울시', '주택', '활동지원(PAS)', '후원', '자율재원']; y.m = y.m || {}; y.tpl = y.tpl || {};
  if (!YS.mon) { const t = today(); YS.mon = `${t.getFullYear()}-${pad(t.getMonth() + 1)}`; }
  return y;
}
function ysMonth(key = YS.mon) { const y = ysState(); return y.m[key] ||= {rows: {}, notice: {np: 0, hi: 0, ei: 0, ia: 0}}; }
function ysCalc(d) {
  const f = ysState().funds, rows = f.map(n => { const r = d.rows[n] || {}; const emp = +r.emp || 0, er = +r.er || 0, ret = +r.ret || 0, dep = r.dep === '' || r.dep == null ? null : +r.dep;
    return {n, emp, er, ret, sum: emp + er, dep, gap: dep == null ? null : dep - (emp + er)}; });
  const T = rows.reduce((a, r) => ({emp: a.emp + r.emp, er: a.er + r.er, ret: a.ret + r.ret, sum: a.sum + r.sum, dep: a.dep + (r.dep || 0)}), {emp: 0, er: 0, ret: 0, sum: 0, dep: 0});
  const N = d.notice || {}, notice = (+N.np || 0) + (+N.hi || 0) + (+N.ei || 0) + (+N.ia || 0);
  return {rows, T, notice, diff: notice ? T.sum - notice : null};
}
function ysFill(t, v) { return t.replace(/\{([^}]+)\}/g, (m, k) => v[k] != null ? v[k] : m); }
SOP_TOOLS.yesu = {
  html(s) {
    const d = ysMonth(), c = ysCalc(d), [Y, M] = YS.mon.split('-').map(Number);
    const ni = (k, lab) => `<label class="f">${lab}<input class="inp num r" data-nt="${k}" value="${d.notice[k] ? won(d.notice[k]) : ''}" inputmode="numeric"></label>`;
    const cell = (n, k, v) => `<td><input class="inp num r" data-yr="${esc(n)}" data-yk="${k}" value="${v != null && v !== '' && +v ? won(v) : ''}" inputmode="numeric"></td>`;
    return `<section class="panel" id="ys-panel"><div class="panel-h"><div><h2>금액 확인</h2><div class="faint small">재원별로 예수금 통장에 모을 금액과 실제 입금·고지액을 맞춰 봐요</div></div>
      <div class="row" style="gap:6px"><input class="inp" type="month" id="ys-mon" value="${YS.mon}" style="width:auto"><button class="btn ghost sm" id="ys-prev">지난달 금액 복사</button></div></div>
      <div class="tbl-wrap" style="border:0;border-radius:0"><table class="tbl ys-tbl"><thead><tr><th>재원</th><th class="r">근로자부담</th><th class="r">사용자부담</th><th class="r">예수금 이체 합계</th><th class="r">실제 입금액</th><th class="r">차이</th><th class="r">퇴직적립금</th></tr></thead><tbody>
      ${c.rows.map(r => `<tr><td>${esc(r.n)}</td>${cell(r.n, 'emp', r.emp)}${cell(r.n, 'er', r.er)}<td class="r"><b>${won(r.sum)}</b></td>${cell(r.n, 'dep', r.dep)}<td class="r">${r.gap == null ? '<span class="faint">-</span>' : r.gap ? `<span class="chip crit">${r.gap > 0 ? '+' : ''}${won(r.gap)}</span>` : '<span class="chip ok">일치</span>'}</td>${cell(r.n, 'ret', r.ret)}</tr>`).join('')}
      </tbody><tfoot><tr class="bg-g"><td><b>합계</b></td><td class="r">${won(c.T.emp)}</td><td class="r">${won(c.T.er)}</td><td class="r"><b>${won(c.T.sum)}</b></td><td class="r">${won(c.T.dep)}</td><td></td><td class="r">${won(c.T.ret)}</td></tr></tfoot></table></div>
      <div class="panel-b" style="display:flex;flex-direction:column;gap:10px">
        <div class="eyebrow">4대보험 고지액 (EDI · ${M}월분 → ${M === 12 ? 1 : M + 1}월 10일 납부)</div>
        <div class="form-grid ys-notice">${ni('np', '국민연금')}${ni('hi', '건강·장기요양')}${ni('ei', '고용보험')}${ni('ia', '산재보험')}</div>
        <div class="row" style="gap:8px"><span>고지 합계 <b class="num">${won(c.notice)}</b></span><span class="faint">·</span><span>예수금 이체 합계 <b class="num">${won(c.T.sum)}</b></span><span class="grow"></span>
          ${c.diff == null ? '<span class="faint small">고지액을 넣으면 비교해요</span>' : c.diff === 0 ? '<span class="chip ok">고지액과 일치</span>' : `<span class="chip ${Math.abs(c.diff) > 0 ? 'warn' : ''}">차이 ${c.diff > 0 ? '+' : ''}${won(c.diff)}원 · ${c.diff > 0 ? '예수금이 많음(잔액 남음)' : '예수금이 부족'}</span>`}</div>
        <div class="row small" style="gap:6px"><span class="faint grow">재원 이름 바꾸기·추가: 쉼표로</span><input class="inp" id="ys-funds" value="${esc(ysState().funds.join(', '))}" style="max-width:360px"></div>
      </div></section>
    <section class="panel"><div class="panel-h"><div><h2>전표 문안 (진우 적요)</h2><div class="faint small">위 금액으로 자동 작성 · 누르면 복사 · 문안은 센터 방식에 맞게 고쳐 쓰세요</div></div><button class="btn ghost sm" id="ys-tpl">${icon('edit')}문안 편집</button></div>
      <div class="panel-b ys-vouchers">${this.vouchers(c, Y, M)}</div></section>`;
  },
  vouchers(c, Y, M) {
    const y = ysState(), NY = M === 12 ? Y + 1 : Y, NM = M === 12 ? 1 : M + 1, base = {Y, M, NY, NM};
    const tpl = k => y.tpl[k] || YS_TPL.find(x => x.k === k).t;
    const line = (who, text, amt) => `<div class="ys-v"><div class="small faint">${esc(who)}</div><button class="ys-copy" data-ycp="${esc(text)}" title="적요 복사">${esc(text)}</button><div class="row" style="gap:6px"><span class="num"><b>${won(amt)}</b>원</span><button class="btn ghost sm" data-ycp="${amt}" title="금액만 복사">금액 복사</button></div></div>`;
    let h = '';
    const act = c.rows.filter(r => r.sum || r.ret);
    if (!act.length) return '<div class="empty">위 표에 재원별 금액을 넣으면 전표 문안이 만들어져요</div>';
    act.forEach(r => { const v = Object.assign({}, base, {'재원': r.n, '근로자': won(r.emp), '사용자': won(r.er)});
      h += `<div class="eyebrow" style="margin-top:6px">${esc(r.n)}</div>`;
      if (r.er) h += line('각 재원 · 지출결의', ysFill(tpl('er'), v), r.er);
      if (r.emp) h += line('각 재원 · 지출결의', ysFill(tpl('emp'), v), r.emp);
      if (r.ret) h += line('각 재원 · 지출결의', ysFill(tpl('ret'), v), r.ret);
      if (r.sum) h += line('예수금 · 수입결의', ysFill(tpl('in'), v), r.sum); });
    h += `<div class="eyebrow" style="margin-top:6px">예수금 납부</div>` + line('예수금 · 지출결의', ysFill(tpl('pay'), base), c.notice || c.T.sum);
    if (c.diff) h += line('차이가 있을 때', ysFill(tpl('diff'), Object.assign({}, base, {'차액': won(c.diff)})), Math.abs(c.diff));
    return h;
  },
  bind(v, s) {
    const y = ysState(), d = ysMonth();
    const reval = () => { save(); const p = $('#ys-panel', v); if (!p) return; const sy = window.scrollY; render(); window.scrollTo(0, sy); };
    v.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.yr) { const r = d.rows[t.dataset.yr] ||= {}; r[t.dataset.yk] = t.value.trim() === '' ? (t.dataset.yk === 'dep' ? '' : 0) : toNum(t.value); reval(); }
      else if (t.dataset.nt) { d.notice[t.dataset.nt] = toNum(t.value); reval(); }
      else if (t.id === 'ys-mon' && t.value) { YS.mon = t.value; render(); }
      else if (t.id === 'ys-funds') { const f = t.value.split(',').map(x => x.trim()).filter(Boolean); if (f.length) { y.funds = [...new Set(f)]; reval(); } }
    });
    v.addEventListener('click', e => { const c = e.target.closest('[data-ycp]'); if (c) copyText(c.dataset.ycp, /^\d+$/.test(c.dataset.ycp) ? '금액을 복사했어요' : '적요를 복사했어요'); });
    const pv = $('#ys-prev', v); if (pv) pv.onclick = () => { const [Y, M] = YS.mon.split('-').map(Number), pk = M === 1 ? `${Y - 1}-12` : `${Y}-${pad(M - 1)}`, p = y.m[pk];
      if (!p) { toast('지난달 입력이 없어요'); return; } const cur = ysMonth(); cur.rows = clone(p.rows); Object.values(cur.rows).forEach(r => r.dep = ''); cur.notice = clone(p.notice); reval(); toast('지난달 금액을 복사했어요 (실제 입금액은 비움)'); };
    const tb = $('#ys-tpl', v); if (tb) tb.onclick = () => sheet({title: '전표 문안 편집', wide: true, body: `
      <div class="note small">바꿔 쓸 수 있는 칸: <span class="mono">{Y} {M}</span> 해당 연·월 · <span class="mono">{NY} {NM}</span> 납부 연·월 · <span class="mono">{재원} {근로자} {사용자} {차액}</span></div>
      ${YS_TPL.map(x => `<label class="f">${esc(x.who)} · ${esc(x.amt)}<input class="inp" data-tk="${x.k}" value="${esc(y.tpl[x.k] || x.t)}"></label>`).join('')}`,
      foot: `<button class="btn danger" id="tp-reset">기본 문안으로</button><span class="grow"></span><button class="btn" data-close>취소</button><button class="btn primary" id="tp-save">저장</button>`,
      onMount: el => {
        $('#tp-save', el).onclick = () => { $$('[data-tk]', el).forEach(i => { const def = YS_TPL.find(x => x.k === i.dataset.tk).t; if (i.value.trim() && i.value.trim() !== def) y.tpl[i.dataset.tk] = i.value.trim(); else delete y.tpl[i.dataset.tk]; }); save(); closeSheet(); render(); toast('문안을 저장했어요'); };
        $('#tp-reset', el).onclick = () => { y.tpl = {}; save(); closeSheet(); render(); toast('기본 문안으로 되돌렸어요'); };
      }});
    $$('.ys-tbl input.num, .ys-notice input', v).forEach(i => i.addEventListener('focus', () => { i.value = i.value.replace(/,/g, ''); }));
  },
};
