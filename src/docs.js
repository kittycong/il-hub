/* ================= documents ================= */
const DOCT = {
  emp:{name:'재직증명서', log:true},
  career:{name:'경력증명서', log:true},
  expense:{name:'지출결의서', log:false},
  draft:{name:'기안문 (내부결재)', log:true},
};
const D = { type:'emp', staffIds:['s1'], f:{} };
function dfDefaults() {
  const t = ymd(today());
  return {
    emp:{purpose:'금융기관 제출용', issue:t},
    career:{purpose:'경력 확인용', issue:t},
    expense:{date:t, gwan:'사무비', hang:'운영비', mok:'사무용품비', fund:'보조금', amount:184000, desc:'사무용 A4 용지 및 토너 구입', party:'오피스디포', pay:'법인카드', proof:'카드전표, 거래명세서'},
    draft:{date:t, title:'2026년 2차 추가경정예산(안) 보고', body:'1. 관련: 2026년 1차 추가경정예산\n2. 후원 재원의 수입 변동에 따라 2026년 2차 추가경정예산(안)을 아래와 같이 보고하오니 검토 후 결재하여 주시기 바랍니다.\n\n  가. 변경 사유: 개인 CMS 정기후원 감소분 반영\n  나. 변경 내역: 붙임 참조\n  다. 시행: 결재 후 진우정보시스템 추경예산 입력', attach:'2026년 2차 추경예산(안) 1부.  끝.'},
  };
}
function docPre() { const p = (S.settings.docPrefix || '').trim(); return p ? p + ' ' : ''; }
function nextDocNo() { const y = today().getFullYear(); return `${docPre()}제${y}-${String((S.docSeq[y] || 0) + 1).padStart(4, '0')}호`; }
function korWon(n) {
  n = Math.floor(Math.abs(Number(n) || 0)); if (!n) return '영';
  const dg = ['','일','이','삼','사','오','육','칠','팔','구'], su = ['','십','백','천'], big = ['','만','억','조'];
  let out = '', g = 0;
  while (n > 0) {
    const part = n % 10000; n = Math.floor(n / 10000);
    if (part) { let s = ''; const ds = String(part).padStart(4, '0').split('').map(Number);
      ds.forEach((d, i) => { if (d) s += dg[d] + su[3 - i]; }); out = s + big[g] + out; }
    g++;
  }
  return out;
}
const fmtK = s => { if (!s) return ''; const d = parseYmd(s); return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`; };
function orgSeal() { const o = S.settings.org; return `<div class="issuer">${esc(o.name)}<br>센터장 ${esc(o.rep || '○○○')} <span class="seal">${esc(o.name.replace(/(장애인)?자립생활센터$|센터$/, '').slice(0,4) || '직인')}<br>직인</span></div>`; }
function apprTable() { const a = S.settings.approvers; return `<table class="appr"><tr><td class="lab" rowspan="2">결 재</td>${a.map(x=>`<td>${esc(x)}</td>`).join('')}</tr><tr>${a.map(()=>'<td></td>').join('')}</tr></table>`; }

function docHtml(type, f, st, no) {
  if (typeof docHtml2 === 'function' && ['trip','purchase','fixed','outgoing','leave','worklog'].includes(type)) return docHtml2(type, f, no);
  const o = S.settings.org;
  if (type === 'emp' || type === 'career') {
    const career = type === 'career';
    const until = st.left ? fmtK(st.left) : (career ? fmtK(f.issue) : '현재');
    return `<div class="a4"><div class="docno">${esc(no)}</div><h1>${career?'경력증명서':'재직증명서'}</h1>
      <table class="dt">
        <tr><th>성 명</th><td>${esc(st.name.replace(/\s*\(예시\)/,''))}</td><th>생년월일</th><td>${esc(fmtK(st.birth)) || '<span style="color:#999">미입력</span>'}</td></tr>
        <tr><th>소 속</th><td>${esc(st.dept)}</td><th>직 위</th><td>${esc(st.pos)}</td></tr>
        <tr><th>${career?'근무기간':'재직기간'}</th><td colspan="3">${esc(fmtK(st.hired))} ~ ${esc(until)}${career||st.left?'':' (재직 중)'}</td></tr>
        ${career?`<tr><th>담당업무</th><td colspan="3">${esc(st.duty||'')}</td></tr>`:''}
        <tr><th>기관명</th><td colspan="3">${esc(o.name)}</td></tr>
        <tr><th>소재지</th><td colspan="3">${esc(o.addr)}${o.tel?` (☎ ${esc(o.tel)})`:''}</td></tr>
        <tr><th>용 도</th><td colspan="3">${esc(f.purpose)}</td></tr>
      </table>
      <p class="cert">위의 사실을 증명합니다.</p>
      <p class="date">${esc(fmtK(f.issue))}</p>${orgSeal()}</div>`;
  }
  if (type === 'expense') {
    return `<div class="a4"><div class="docno">결의일 ${esc(fmtK(f.date))}</div>${apprTable()}<div class="clear"></div>
      <h1 style="margin-top:4mm">지출결의서</h1>
      <table class="dt">
        <tr><th>금 액</th><td colspan="3"><span class="amount-big">금 ${korWon(f.amount)}원정</span> (₩${won(f.amount)})</td></tr>
        <tr><th>관 · 항 · 목</th><td colspan="3">${esc(f.gwan)} · ${esc(f.hang)} · ${esc(f.mok)}</td></tr>
        <tr><th>재 원</th><td>${esc(f.fund)}</td><th>결제 방법</th><td>${esc(f.pay)}</td></tr>
        <tr><th>거 래 처</th><td colspan="3">${esc(f.party)}</td></tr>
        <tr><th style="height:40mm">적 요</th><td colspan="3" class="body">${esc(f.desc)}</td></tr>
        <tr><th>증빙 서류</th><td colspan="3">${esc(f.proof)}</td></tr>
      </table>
      <p style="margin-top:8mm">위 금액을 지출하고자 하오니 결재하여 주시기 바랍니다.</p>
      <p style="text-align:right;margin-top:10mm">담당자 : ${esc(S.staff[0]?.name||'')} (인)</p></div>`;
  }
  return `<div class="a4"><div style="text-align:center;font:700 22px 'Hahmlet',serif;margin-bottom:6mm">${esc(o.name)}</div>${apprTable()}<div class="clear"></div>
    <table class="dt">
      <tr><th>문서번호</th><td>${esc(no)}</td><th>시행일자</th><td>${esc(fmtK(f.date))}</td></tr>
      <tr><th>수 신</th><td colspan="3">내부결재</td></tr>
      <tr><th>기 안 자</th><td colspan="3">${esc(S.staff[0]?.dept||'')} ${esc(S.staff[0]?.pos||'')} ${esc(S.staff[0]?.name||'')}</td></tr>
      <tr><th>제 목</th><td colspan="3"><b>${esc(f.title)}</b></td></tr>
    </table>
    <div class="body" style="margin-top:6mm;min-height:120mm">${esc(f.body)}</div>
    <p>붙임 &nbsp;${esc(f.attach)}</p></div>`;
}
function formHtml(type, f) {
  if (['trip','purchase','fixed','outgoing','leave','worklog'].includes(type)) return formHtml2(type, f);
  const inp = (k, l, t = 'text', cls = '') => `<label class="f ${cls}">${l}<input class="inp" type="${t}" id="df-${k}" value="${esc(f[k] ?? '')}"></label>`;
  if (type === 'emp' || type === 'career') return `
    <div class="f">직원 선택 <span class="faint" style="font-weight:400">(여러 명 고르면 한꺼번에 만들어져요)</span></div>
    <div style="display:flex;flex-direction:column;gap:4px;max-height:170px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:8px">
      ${S.staff.map(s=>`<label class="row small" style="gap:8px"><input type="checkbox" data-staff="${s.id}" ${D.staffIds.includes(s.id)?'checked':''}> <b>${esc(s.name)}</b> <span class="faint">${esc(s.dept)} · ${esc(s.pos)}${s.left?' · 퇴사':''}</span></label>`).join('')}
    </div>
    <div class="form-grid">${inp('purpose','용도','text','span2')}${inp('issue','발급일','date')}</div>`;
  if (type === 'expense') return `<div class="form-grid">${inp('date','결의일','date')}${inp('fund','재원')}${inp('gwan','관')}${inp('hang','항')}${inp('mok','목')}${inp('amount','금액 (원)','number')}${inp('party','거래처','text','span2')}${inp('pay','결제 방법')}${inp('proof','증빙 서류')}</div>
    <label class="f">적요<textarea class="inp" id="df-desc" rows="3">${esc(f.desc)}</textarea></label>`;
  return `<div class="form-grid">${inp('date','시행일자','date')}</div>${inp('title','제목')}
    <label class="f">본문<textarea class="inp" id="df-body" rows="9">${esc(f.body)}</textarea></label>${inp('attach','붙임')}`;
}
VIEWS.docs = v => {
  if (!D.f.emp) D.f = Object.assign(dfDefaults(), dfDefaults2());
  const f = D.f[D.type], T = DOCT[D.type];
  v.innerHTML = `
  <div class="page-head"><div><h1>문서 자동생성</h1><p>증명서·결의서·기안문과 문서 웹앱의 출장신청서·물품구매·고정거래·발신공문·휴가신청을 같은 항목으로 작성합니다. 문서번호는 발급대장에 기록할 때 자동으로 올라가요.</p></div></div>
  <div class="seg no-print" role="group">${Object.entries(DOCT).map(([k,o])=>`<button aria-pressed="${D.type===k}" data-dt="${k}">${o.name}</button>`).join('')}</div>
  <div class="print-host"><div class="doc-layout">
    <section class="panel doc-form"><div class="panel-h"><h2>${T.name} 내용</h2></div><div class="panel-b" style="display:flex;flex-direction:column;gap:12px" id="dform">
      ${formHtml(D.type, f)}
      ${T.log?`<div class="note small">다음 문서번호 <b class="mono">${esc(nextDocNo())}</b></div>`:''}
      <div class="row">
        <button class="btn primary" id="d-print">${icon('print')}인쇄 · PDF</button>
        ${T.log?`<button class="btn" id="d-log">발급대장에 기록</button>`:''}
      </div>
      ${CAN_FILE?'':'<div class="note warn small">이 화면(Claude 아티팩트)에서는 인쇄 창이 막혀 있어요. GitHub 배포본에서 같은 데이터로 인쇄하세요 — 설정·백업에서 데이터를 옮길 수 있어요.</div>'}
    </div></section>
    <div class="preview-wrap" id="pv"></div>
  </div></div>

  ${docappPanel()}
  <div class="grid-2 no-print">
    <section class="panel"><div class="panel-h"><h2>발급대장</h2><span class="faint small">${S.docLog.length}건</span></div>
      ${tableHtml([{h:'문서번호',f:r=>`<span class="mono">${esc(r.no)}</span>`},{h:'종류',f:r=>esc(r.type)},{h:'대상·제목',f:r=>esc(r.name),cls:'wrap'},{h:'용도',f:r=>esc(r.purpose||'')},{h:'발급일',f:r=>esc(r.date)}], S.docLog.slice().reverse())}
      <div class="panel-b row"><button class="btn sm" id="log-copy">${icon('copy')}대장 복사</button></div></section>
    <section class="panel"><div class="panel-h"><h2>직원 명부</h2><div class="row"><button class="btn sm" id="st-paste">엑셀에서 붙여넣기</button><button class="btn sm primary" id="st-add">${icon('plus')}추가</button></div></div>
      ${tableHtml([{h:'성명',f:s=>`<b>${esc(s.name)}</b>`},{h:'소속·직위',f:s=>esc(s.dept+' '+s.pos)},{h:'입사일',f:s=>`<span class="mono">${esc(s.hired)}</span>`},{h:'퇴사일',f:s=>s.left?`<span class="mono">${esc(s.left)}</span>`:'<span class="chip ok">재직</span>'},{h:'',f:s=>`<button class="btn ghost sm" data-edit-st="${s.id}">편집</button>`}], S.staff)}
      <div class="panel-b faint small">주민등록번호는 저장하지 않아요. 증명서에는 생년월일만 들어갑니다.</div></section>
  </div>`;

  const renderPreview = () => {
    const pv = $('#pv', v); let html;
    if (D.type === 'emp' || D.type === 'career') {
      const sel = S.staff.filter(s => D.staffIds.includes(s.id));
      const base = S.docSeq[today().getFullYear()] || 0, y = today().getFullYear();
      html = sel.length ? sel.map((s, i) => docHtml(D.type, f, s, `${docPre()}제${y}-${String(base + 1 + i).padStart(4, '0')}호`)).join('') : '<div class="empty">직원을 한 명 이상 골라 주세요</div>';
    } else html = docHtml(D.type, f, null, nextDocNo());
    pv.innerHTML = `<div class="a4-scale">${html}</div>`;
    fitA4(pv);
  };
  renderPreview();
  const ro = new ResizeObserver(() => fitA4($('#pv', v))); ro.observe($('#pv', v));

  $$('[data-dt]', v).forEach(b => b.onclick = () => { D.type = b.dataset.dt; render(); });
  $('#dform', v).addEventListener('input', e => {
    const id = e.target.id; if (!id || !id.startsWith('df-')) return;
    const k = id.slice(3); f[k] = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    if (k === 'preset') { const p = FUND_PRESETS[Number(f.preset)]; Object.assign(f, {fund:p.fund, subj:p.subj, short:p.short}); render(); return; }
    if (k === 'kind' && D.type === 'trip') { render(); return; }
    if (D.type === 'worklog') { if (k === 'date') { f.content = wlogGet(f.date) || worklogAuto(f.date); render(); return; } if (k === 'content' || k === 'note') wlogSet(f.date, f.content, f.note); }
    renderPreview();
  });
  $('#dform', v).addEventListener('change', e => {
    const s = e.target.dataset.staff; if (!s) return;
    D.staffIds = e.target.checked ? [...new Set([...D.staffIds, s])] : D.staffIds.filter(x => x !== s); renderPreview();
  });
  $('#d-print', v).onclick = () => { if (!CAN_FILE) { toast('인쇄는 GitHub 배포본에서 돼요'); return; } $('.a4-scale', v).style.transform = 'none'; window.print(); fitA4($('#pv', v)); };
  const lg = $('#d-log', v);
  if (lg) lg.onclick = () => {
    const y = today().getFullYear();
    const targets = (D.type === 'emp' || D.type === 'career') ? S.staff.filter(s => D.staffIds.includes(s.id)).map(s => s.name) : [f.title || (f.item ? f.item + ' 구매' : '') || (f.kind ? f.kind + ' · ' + (f.purpose || '') : '') || DOCT[D.type].name];
    if (!targets.length) { toast('대상을 먼저 골라 주세요'); return; }
    targets.forEach(nm => { S.docSeq[y] = (S.docSeq[y] || 0) + 1; S.docLog.push({no:`${docPre()}제${y}-${String(S.docSeq[y]).padStart(4,'0')}호`, type:DOCT[D.type].name, name:nm, purpose:f.purpose||'', date:f.issue||f.date}); });
    save(); render(); toast(`${targets.length}건을 발급대장에 기록했어요`);
  };
  $('#log-copy', v).onclick = () => copyText([['문서번호','종류','대상·제목','용도','발급일'], ...S.docLog.map(r => [r.no, r.type, r.name, r.purpose||'', r.date])].map(r => r.join('\t')).join('\n'), '발급대장을 복사했어요');
  $('#st-add', v).onclick = () => editStaff(null);
  $$('[data-edit-st]', v).forEach(b => b.onclick = () => editStaff(b.dataset.editSt));
  $('#st-paste', v).onclick = pasteStaff;
  $$('[data-hubdoc]', v).forEach(b => b.onclick = () => { D.type = b.dataset.hubdoc; render(); window.scrollTo(0, 0); });
};
function fitA4(pv) {
  if (!pv) return; const sc = $('.a4-scale', pv); if (!sc) return;
  const w = pv.clientWidth - 32, a4w = 794; // 210mm ≈ 794px
  const k = Math.min(1, w / a4w); sc.style.transform = `scale(${k})`; sc.style.width = a4w + 'px';
  sc.style.height = ''; const h = sc.scrollHeight; sc.style.height = (h * k) + 'px'; sc.style.marginBottom = '0';
}
function editStaff(id) {
  const s = id ? S.staff.find(x => x.id === id) : {id: uid(), name:'', birth:'', dept:'', pos:'', hired:'', left:'', duty:''};
  const inp = (k, l, t = 'text') => `<label class="f">${l}<input class="inp" type="${t}" id="st-${k}" value="${esc(s[k] || '')}"></label>`;
  sheet({title: id ? '직원 정보' : '직원 추가', body: `<div class="form-grid">${inp('name','성명')}${inp('birth','생년월일','date')}${inp('dept','소속')}${inp('pos','직위')}${inp('hired','입사일','date')}${inp('left','퇴사일','date')}</div>${inp('duty','담당업무')}`,
    foot: `${id?'<button class="btn danger" id="st-del">삭제</button><span class="grow"></span>':''}<button class="btn" data-close>취소</button><button class="btn primary" id="st-save">저장</button>`,
    onMount: el => {
      $('#st-save', el).onclick = () => { ['name','birth','dept','pos','hired','left','duty'].forEach(k => s[k] = $('#st-' + k, el).value.trim()); if (!s.name) { toast('성명을 적어 주세요'); return; } if (!id) S.staff.push(s); save(); closeSheet(); render(); toast('저장했어요'); };
      const del = $('#st-del', el); if (del) del.onclick = () => { if (del.dataset.armed) { S.staff = S.staff.filter(x => x.id !== id); D.staffIds = D.staffIds.filter(x => x !== id); save(); closeSheet(); render(); } else { del.dataset.armed = 1; del.textContent = '한 번 더 누르면 삭제'; } };
    }});
}
function pasteStaff() {
  sheet({title:'엑셀에서 직원 붙여넣기', wide:true, body:`<div class="note">엑셀에서 제목 줄까지 포함해 범위를 복사한 뒤 아래에 붙여 넣으세요. <b>성명, 생년월일, 소속(부서), 직위, 입사일, 퇴사일, 담당업무</b> 열을 이름으로 알아봅니다.</div>
    <textarea class="inp mono" id="sp-t" rows="9" placeholder="성명&#9;생년월일&#9;부서&#9;직위&#9;입사일"></textarea><div id="sp-r" class="small faint"></div>`,
    foot:`<button class="btn" data-close>취소</button><button class="btn primary" id="sp-go">추가하기</button>`,
    onMount: el => {
      const parse = () => {
        const lines = $('#sp-t', el).value.split(/\r?\n/).filter(l => l.trim()).map(l => l.split('\t'));
        if (lines.length < 2) return [];
        const h = lines[0].map(x => x.trim()), col = re => h.findIndex(x => re.test(x));
        const c = {name:col(/성명|이름/), birth:col(/생년|생일/), dept:col(/소속|부서|팀/), pos:col(/직위|직급|직책/), hired:col(/입사|채용/), left:col(/퇴사|퇴직/), duty:col(/업무|담당/)};
        if (c.name < 0) return [];
        return lines.slice(1).map(r => { const o = {id: uid()}; for (const k in c) { const v = c[k] >= 0 ? (r[c[k]] || '').trim() : ''; o[k] = /birth|hired|left/.test(k) ? (toYmd(v) || '') : v; } return o; }).filter(o => o.name);
      };
      $('#sp-t', el).oninput = () => { const p = parse(); $('#sp-r', el).textContent = p.length ? `${p.length}명 인식: ${p.slice(0,5).map(x=>x.name).join(', ')}${p.length>5?' …':''}` : '제목 줄에 "성명"이 있어야 해요'; };
      $('#sp-go', el).onclick = () => { const p = parse(); if (!p.length) { toast('인식된 직원이 없어요'); return; } S.staff.push(...p); save(); closeSheet(); render(); toast(`${p.length}명을 추가했어요`); };
    }});
}
