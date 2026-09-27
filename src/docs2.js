/* ================= 문서 웹앱(chulchang-munseo)과 같은 방식의 양식 ================= */
// 문서 웹앱 메뉴 전체 — 허브에서 같이 쓰는 양식은 hub 키로 연결
const DOCAPP_URL = 'https://chulchang-munseo.vercel.app/';
const DOCAPP_MENU = [
  ['출장','출장신청서·복명서','trip'], ['출장','장블랑제리 합본 기안',null], ['출장','정기 출장 일괄 생성',null],
  ['기안·구매','물품구매 (내부기안)','purchase'], ['기안·구매','고정거래 기안','fixed'], ['기안·구매','처우개선비 기안',null], ['기안·구매','회의비 지급 기안',null],
  ['소모품','소모품 증빙',null], ['후원','후원물품 수령증',null], ['후원','센터 내부 후원수령',null],
  ['인사·근태','휴가신청','leave'], ['인사·근태','급여명세서',null], ['인사·근태','급여명세서 수정',null], ['인사·근태','면접평가표',null],
  ['공문·회의','발신공문','outgoing'], ['공문·회의','인사회의록 (운영위원회)',null], ['루틴','루틴 업무 (반복 출장)',null],
];
// 재원·예산과목 프리셋 (문서 웹앱 "예산과목·재원 프리셋"과 같은 구조: 이름 / 재원 / 예산과목 / 비목)
const FUND_PRESETS = [
  {n:'서울시 IL센터지원사업', fund:'보조금(서울시)', subj:'운영비-일반운영비-사무용품비', short:'사무용품비'},
  {n:'구비 운영비', fund:'보조금(구비)', subj:'운영비-일반운영비-임차료', short:'임차료'},
  {n:'주택 (가형·다형)', fund:'보조금(주택)', subj:'사업비-주택사업비', short:'사업비'},
  {n:'활동지원 (PAS)', fund:'활동지원사업 자부담', subj:'운영비-일반운영비', short:'운영비'},
  {n:'후원', fund:'후원금', subj:'사업비', short:'사업비'},
  {n:'자율재원', fund:'자부담', subj:'운영비-업무추진비-회의비', short:'회의비'},
];
Object.assign(DOCT, {
  trip:{name:'출장신청서·복명서', log:true, appr:['담당','사무국장','소장','대표']},
  purchase:{name:'물품구매 (내부기안)', log:true, appr:['담당','사무국장','소장','대표']},
  fixed:{name:'고정거래 기안', log:true, appr:['담당','팀장','사무국장','소장','대표']},
  outgoing:{name:'발신공문', log:true, appr:['담당','팀장','사무국장','소장','대표']},
  leave:{name:'휴가신청서', log:false, appr:['담당','팀장','사무국장','소장']},
  worklog:{name:'일일 업무일지', log:false, appr:['담당','팀장','사무국장','소장']},
});
function dfDefaults2() {
  const t = ymd(today()), tm = ymd(addDays(today(), 1));
  return {
    trip:{kind:'출장신청서', writer:'', travelers:'', purpose:'관내 장애인 자립생활 지원 협력기관 방문', purpose2:'', start:tm, end:'', date:t, tstart:'10:00', tend:'12:00', place:'구청', content:'', cost:'교통비 (대중교통)', etc:''},
    purchase:{gr:'GR-', date:t, pay:'카드결제', item:'사무용품', spec:'A4용지 80g 외', qty:1, recv:tm, preset:0, fund:FUND_PRESETS[0].fund, subj:FUND_PRESETS[0].subj, short:FUND_PRESETS[0].short, q1n:'키스오피스', q1:184000, q2n:'오피스디포', q2:192000, q3n:'알파문구', q3:198000, winner:'키스오피스', price:184000, ship:0, note:''},
    fixed:{gr:'GR-', open:'비공개', title:'2026년 10월 임차료 및 관리비 지출', body:'사무실 임차료 및 관리비를 아래와 같이 지출하고자 합니다.', what:'10월 임차료·관리비', period:'2026.01.01 ~ 2026.12.31', date:t, recv:t, pay:'계좌이체', payee:'(건물 관리 주체)', preset:1, fund:FUND_PRESETS[1].fund, subj:FUND_PRESETS[1].subj, total:1200000, attach:'붙임 1부', note:''},
    outgoing:{kind:'일반 발신공문', no:'', date:t, to:'구청장 (장애인복지과장)', via:'', title:'2026년 운영비 정산 자료 제출', body:'1. 귀 기관의 무궁한 발전을 기원합니다.\n2. 2026년 운영비 보조금 정산 자료를 아래와 같이 제출합니다.', items:'정산 기간: 2026. 1. 1. ~ 2026. 12. 31.\n제출 자료: 정산서 1부, 증빙 사본 1부', attach:'2026년 운영비 정산서 1부.'},
    worklog:{date:t, content:'', note:''},
    leave:{staff:'s1', type:'연차', date:t, start:tm, end:tm, reason:'개인 사유', succDept:'사무행정팀', succName:'', remain:''},
  };
}
function apprTable2(list) { const a = list || S.settings.approvers; return `<table class="appr"><tr><td class="lab" rowspan="2">결 재</td>${a.map(x=>`<td>${esc(x)}</td>`).join('')}</tr><tr>${a.map(()=>'<td></td>').join('')}</tr></table>`; }
const kd = s => { if (!s) return ''; const d = parseYmd(s); return `${d.getFullYear()}. ${d.getMonth()+1}. ${d.getDate()}.`; };
function bizDays(a, b) { if (!a) return 0; let n = 0; for (let d = parseYmd(a), e = parseYmd(b || a); d <= e; d = addDays(d, 1)) if (!isOff(d)) n++; return n; }
const HANGA = ['가','나','다','라','마','바','사','아','자','차'];

function docHtml2(type, f, no) {
  const o = S.settings.org, ap = apprTable2(DOCT[type].appr);
  if (type === 'worklog') {
    const me = S.staff[0] || {}, d = f.date ? parseYmd(f.date) : today();
    const lines = (f.content || worklogAuto(f.date)).split('\n').map(s => s.trim()).filter(Boolean);
    return `<div class="a4">${ap}<div class="clear"></div><h1 style="margin-top:4mm">일 일 업 무 일 지</h1>
      <table class="dt"><tr><th>날 짜</th><td colspan="3">${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일</td></tr>
      <tr><th>부서명</th><td>${esc(me.dept||'')}</td><th>직 책</th><td>${esc(me.pos||'')}</td></tr>
      <tr><th>담당자</th><td colspan="3">${esc((me.name||'').replace(/\s*\(예시\)/,''))}</td></tr>
      <tr><th style="height:150mm">업무내용</th><td colspan="3" style="vertical-align:top;line-height:2">${lines.map(l => '· ' + esc(l.replace(/^[-·•]\s*/, ''))).join('<br>')}</td></tr>
      <tr><th>비 고</th><td colspan="3" class="body">${esc(f.note)}</td></tr></table></div>`;
  }
  const head = `<div style="text-align:center;font:700 22px 'Hahmlet',serif;margin-bottom:6mm">${esc(o.name)}</div>`;
  if (type === 'trip') {
    const rep = f.kind === '출장복명서', span = f.end && f.end !== f.start ? `${kd(f.start)} ~ ${kd(f.end)}` : kd(f.start);
    return `<div class="a4"><div class="docno">${esc(no)}</div>${ap}<div class="clear"></div><h1>${rep?'출 장 복 명 서':'출 장 신 청 서'}</h1>
      <table class="dt">
        <tr><th>출 장 자</th><td colspan="3">${esc(f.travelers || f.writer)}</td></tr>
        <tr><th>출장 기간</th><td colspan="3">${span} ${esc(f.tstart)} ~ ${esc(f.tend)}</td></tr>
        <tr><th>출 장 지</th><td colspan="3">${esc(f.place)}</td></tr>
        <tr><th>출장 목적</th><td colspan="3">${esc(f.purpose)}${f.purpose2?'<br>'+esc(f.purpose2):''}</td></tr>
        ${rep?`<tr><th style="height:50mm">출장 내용<br>(결과)</th><td colspan="3" class="body">${esc(f.content)}</td></tr>`:''}
        <tr><th>출장 경비</th><td colspan="3">${esc(f.cost)}</td></tr>
        <tr><th>기타 사항</th><td colspan="3">${esc(f.etc)}</td></tr>
      </table>
      <p class="cert">위와 같이 출장을 ${rep?'다녀왔기에 복명':'신청'}합니다.</p><p class="date">${kd(f.date)}</p>
      <p style="text-align:right;margin-right:10mm">${rep?'보고자':'신청자'} : ${esc(f.writer)} (인)</p></div>`;
  }
  if (type === 'purchase') {
    const qty = Number(f.qty) || 1, sum = Number(f.price) * qty + Number(f.ship || 0);
    const qs = [[f.q1n,f.q1],[f.q2n,f.q2],[f.q3n,f.q3]].filter(x => x[0]);
    return `<div class="a4">${head}${ap}<div class="clear"></div>
      <table class="dt"><tr><th>내부결재번호</th><td>${esc(f.gr)}</td><th>지출일자</th><td>${kd(f.date)}</td></tr>
      <tr><th>제 목</th><td colspan="3"><b>${esc(f.item)} 구매 (${esc(f.short)})</b></td></tr></table>
      <div class="body" style="margin:4mm 0">1. ${esc(o.name)} 운영에 필요한 물품을 아래와 같이 구매하고자 합니다.\n2. 세부 내역</div>
      <table class="dt">
        <tr><th>품목명</th><td>${esc(f.item)}</td><th>규격/모델명</th><td>${esc(f.spec)}</td></tr>
        <tr><th>수량 · 단가</th><td>${qty} × ${won(f.price)}원</td><th>배송료</th><td>${won(f.ship)}원</td></tr>
        <tr><th>합 계</th><td colspan="3"><span class="amount-big">금 ${korWon(sum)}원정</span> (₩${won(sum)})</td></tr>
        <tr><th>재 원</th><td>${esc(f.fund)}</td><th>지출방법</th><td>${esc(f.pay)}</td></tr>
        <tr><th>예산과목</th><td colspan="3">${esc(f.subj)}</td></tr>
        <tr><th>예상 수령일</th><td>${kd(f.recv)}</td><th>낙찰 업체</th><td>${esc(f.winner)}</td></tr>
      </table>
      <div style="margin:2mm 0 1mm"><b>비교견적</b></div>
      <table class="dt" style="margin-top:0"><tr><th style="width:auto">업체</th>${qs.map(q=>`<td style="text-align:center">${esc(q[0])}${q[0]===f.winner?' ◎':''}</td>`).join('')}</tr>
        <tr><th style="width:auto">견적 금액</th>${qs.map(q=>`<td style="text-align:right">${won(q[1])}원</td>`).join('')}</tr></table>
      ${f.note?`<p>비고: ${esc(f.note)}</p>`:''}<p>붙임 &nbsp;비교견적서 ${qs.length}부.  끝.</p></div>`;
  }
  if (type === 'fixed') {
    return `<div class="a4">${head}${ap}<div class="clear"></div>
      <table class="dt"><tr><th>내부결재번호</th><td>${esc(f.gr)}</td><th>공개 구분</th><td>${esc(f.open)}</td></tr>
      <tr><th>접수일</th><td>${kd(f.recv)}</td><th>지출일자</th><td>${kd(f.date)}</td></tr>
      <tr><th>제 목</th><td colspan="3"><b>${esc(f.title)}</b></td></tr></table>
      <div class="body" style="margin:4mm 0;min-height:30mm">1. ${esc(f.body)}\n2. 지출 내역</div>
      <table class="dt">
        <tr><th>지출내용</th><td colspan="3">${esc(f.what)}</td></tr>
        <tr><th>계약기간</th><td colspan="3">${esc(f.period)}</td></tr>
        <tr><th>지 출 처</th><td>${esc(f.payee)}</td><th>지출방법</th><td>${esc(f.pay)}</td></tr>
        <tr><th>재 원</th><td>${esc(f.fund)}</td><th>예산과목</th><td>${esc(f.subj)}</td></tr>
        <tr><th>소요예산 총액</th><td colspan="3"><span class="amount-big">금 ${korWon(f.total)}원정</span> (₩${won(f.total)})</td></tr>
      </table>${f.note?`<p style="color:#c0392b;font-style:italic">${esc(f.note)}</p>`:''}
      <p>붙임 &nbsp;${f.attach==='붙임 없음'?'없음':esc(f.attach)+'.  끝.'}</p></div>`;
  }
  if (type === 'outgoing') {
    const items = (f.items || '').split('\n').map(s => s.trim()).filter(Boolean);
    return `<div class="a4"><div style="text-align:center;font:700 26px 'Hahmlet',serif;letter-spacing:.2em;margin:4mm 0 8mm">${esc(o.name)}</div>
      <table style="width:100%;font-size:15px;line-height:2"><tr><td style="width:18mm">수신</td><td>${esc(f.to)}</td></tr>${f.via?`<tr><td>(경유)</td><td>${esc(f.via)}</td></tr>`:''}<tr><td>제목</td><td><b>${esc(f.title)}</b></td></tr></table>
      <hr style="border:0;border-top:2px solid #333;margin:3mm 0 6mm">
      <div class="body">${esc(f.body)}</div>
      ${items.length?`<div style="margin:3mm 0 0 8mm;line-height:2">${items.map((x,i)=>`${HANGA[i]||'-'}. ${esc(x)}`).join('<br>')}</div>`:''}
      ${f.attach?`<p style="margin-top:8mm">붙임 &nbsp;${esc(f.attach)}  끝.</p>`:'<p style="text-align:right">끝.</p>'}
      <div class="issuer" style="margin-top:22mm">${esc(o.name)}장 <span class="seal">직인<br>생략</span></div>
      <div style="position:absolute;left:20mm;right:20mm;bottom:22mm;border-top:1px solid #333;padding-top:3mm;font-size:12px;line-height:1.8">
        ${ap.replace('class="appr"','class="appr" style="float:none;margin:0 0 3mm"')}
        시행 ${esc(f.no || no)} (${kd(f.date)}) &nbsp; 접수 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<br>${esc(o.addr)} ${o.tel?'/ 전화 '+esc(o.tel):''} / 공개구분: 비공개</div></div>`;
  }
  // leave
  const st = S.staff.find(s => s.id === f.staff) || {};
  const unit = f.type === '반차' ? 0.5 : f.type === '반반차' ? 0.25 : 1, days = f.type === '연차' ? bizDays(f.start, f.end) : unit;
  const tt = f.type === '반차' ? '09:00 ~ 13:00 (또는 14:00 ~ 18:00)' : f.type === '반반차' ? '2시간' : '09:00 ~ 18:00';
  return `<div class="a4">${ap}<div class="clear"></div><h1 style="margin-top:4mm">휴 가 신 청 서</h1>
    <table class="dt">
      <tr><th>소 속</th><td>${esc(st.dept||'')}</td><th>직 위</th><td>${esc(st.pos||'')}</td></tr>
      <tr><th>성 명</th><td colspan="3">${esc((st.name||'').replace(/\s*\(예시\)/,''))}</td></tr>
      <tr><th>휴가 구분</th><td>${esc(f.type)}</td><th>일 수</th><td>${days}일</td></tr>
      <tr><th>기 간</th><td colspan="3">${kd(f.start)}${f.type==='연차'&&f.end!==f.start?' ~ '+kd(f.end):''} (${tt})</td></tr>
      <tr><th>사 유</th><td colspan="3">${esc(f.reason)}</td></tr>
      <tr><th>업무 인수자</th><td colspan="3">${esc(f.succDept)} ${esc(f.succName)}</td></tr>
      ${f.remain!==''?`<tr><th>신청 후 잔여</th><td colspan="3">${esc(f.remain)}일</td></tr>`:''}
    </table>
    <p class="cert">위와 같이 휴가를 신청합니다.</p><p class="date">${kd(f.date)}</p>
    <p style="text-align:right;margin-right:10mm">신청자 : ${esc((st.name||'').replace(/\s*\(예시\)/,''))} (인)</p></div>`;
}

function formHtml2(type, f) {
  if (type === 'worklog') { if (!f.content) f.content = worklogAuto(f.date); return `<label class="f">날짜<input class="inp" type="date" id="df-date" value="${esc(f.date)}"></label>
    <label class="f">업무내용 (한 줄에 하나)<textarea class="inp" id="df-content" rows="12">${esc(f.content)}</textarea></label>
    <button class="btn" type="button" id="wl-auto">오늘 완료한 일로 다시 채우기</button><label class="f">비고<textarea class="inp" id="df-note" rows="2">${esc(f.note)}</textarea></label>
    <div class="note small">캘린더에서 완료 표시한 마감, 업무 화면에서 체크한 업무, 자금일보를 모아 채워요. 고정 업무는 설정에서 바꿀 수 있어요.</div>`; }
  const inp = (k, l, t = 'text', cls = '') => `<label class="f ${cls}">${l}<input class="inp" type="${t}" id="df-${k}" value="${esc(f[k] ?? '')}"></label>`;
  const sel = (k, l, opts, cls = '') => `<label class="f ${cls}">${l}<select class="inp" id="df-${k}">${opts.map(o => `<option ${String(f[k])===String(o)?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`;
  const area = (k, l, r = 3) => `<label class="f">${l}<textarea class="inp" id="df-${k}" rows="${r}">${esc(f[k] ?? '')}</textarea></label>`;
  const preset = `<label class="f span2">재원·예산과목 프리셋<select class="inp" id="df-preset">${FUND_PRESETS.map((p,i)=>`<option value="${i}" ${Number(f.preset)===i?'selected':''}>${esc(p.n)}</option>`).join('')}</select></label>`;
  if (type === 'trip') return `<div class="form-grid">${sel('kind','문서종류',['출장신청서','출장복명서'])}${inp('writer','작성자')}${inp('travelers','출장자 (최대 3명, 쉼표)','text','span2')}${inp('start','출장 시작일','date')}${inp('end','출장 종료일 (당일이면 비움)','date')}${inp('tstart','시작 시간','time')}${inp('tend','종료 시간','time')}${inp('date','작성(보고)일자','date')}</div>
    ${inp('place','출장지 (연락처 포함)')}${inp('purpose','출장 목적')}${inp('purpose2','출장 목적 2줄째 (선택)')}${f.kind==='출장복명서'?area('content','출장 내용 (결과)',5):''}${inp('cost','출장 경비')}${inp('etc','기타 사항')}`;
  if (type === 'purchase') return `<div class="form-grid">${inp('gr','내부결재번호 (GR)')}${inp('date','지출일자','date')}${sel('pay','지출방법',['카드결제','계좌이체'])}${inp('recv','예상 수령일','date')}${inp('item','품목명','text','span2')}${inp('spec','규격/모델명','text','span2')}${inp('qty','수량','number')}${inp('price','단가 (원)','number')}${inp('ship','배송료','number')}${preset}${inp('fund','재원')}${inp('subj','예산과목','text','span2')}</div>
    <div class="f">비교견적 (3곳)</div><div class="form-grid">${inp('q1n','업체 1')}${inp('q1','금액','number')}${inp('q2n','업체 2')}${inp('q2','금액','number')}${inp('q3n','업체 3')}${inp('q3','금액','number')}${inp('winner','낙찰 상호명','text','span2')}</div>${inp('note','비고')}`;
  if (type === 'fixed') return `<div class="form-grid">${inp('gr','내부결재번호 (GR)')}${sel('open','공개 구분',['비공개','공개'])}${inp('recv','접수일','date')}${inp('date','지출일자','date')}</div>${inp('title','제목')}${area('body','본문',3)}
    <div class="form-grid">${inp('what','지출내용','text','span2')}${inp('period','계약기간','text','span2')}${inp('payee','지출처')}${sel('pay','지출방법',['계좌이체','카드결제'])}${preset}${inp('fund','재원')}${inp('subj','예산과목')}${inp('total','소요예산 총액','number')}${sel('attach','붙임',['견적서 1부','붙임 1부','붙임 없음'])}</div>${inp('note','비고 (부재 사유 등, 빨간 기울임)')}`;
  if (type === 'outgoing') return `<div class="form-grid">${sel('kind','문서 종류',['일반 발신공문','종사자 전력조회 요청'])}${inp('no','문서번호 (비우면 자동)')}${inp('date','시행일','date')}</div>${inp('to','수신자')}${inp('via','경유 (선택)')}${inp('title','제목')}${area('body','본문',4)}${area('items','항목 (한 줄에 하나 → 가. 나. 다.)',3)}${inp('attach','붙임')}`;
  return `<div class="form-grid"><label class="f span2">신청자<select class="inp" id="df-staff">${S.staff.map(s=>`<option value="${s.id}" ${f.staff===s.id?'selected':''}>${esc(s.name)} · ${esc(s.dept)}</option>`).join('')}</select></label>${sel('type','휴가 종류',['연차','반차','반반차'])}${inp('date','작성일자','date')}${inp('start','시작일','date')}${inp('end','종료일','date')}${inp('remain','신청 후 잔여일수','number')}</div>
    ${inp('reason','사유')}<div class="form-grid">${inp('succDept','업무 인수자 부서')}${inp('succName','업무 인수자 성명')}</div>`;
}
function docappPanel() {
  const groups = {}; DOCAPP_MENU.forEach(([g, n, k]) => (groups[g] ||= []).push([n, k]));
  return `<section class="panel no-print"><div class="panel-h"><div><h2>문서 웹앱 메뉴</h2><div class="faint small">chulchang-munseo · 허브에 같은 양식이 있으면 바로 작성, 나머지는 웹앱에서</div></div><a class="btn sm" href="${DOCAPP_URL}" target="_blank" rel="noopener">${icon('ext')}웹앱 열기</a></div>
    <div class="panel-b" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px">${Object.entries(groups).map(([g, list]) => `<div><div class="eyebrow" style="margin-bottom:6px">${esc(g)}</div>${list.map(([n, k]) => k
      ? `<button class="btn ghost sm" data-hubdoc="${k}" style="width:100%;justify-content:space-between">${esc(n)}<span class="chip ok" style="height:18px">허브에서 작성</span></button>`
      : `<a class="btn ghost sm" href="#embed/${(S.apps.find(x => x.url === DOCAPP_URL) || {id:'a4'}).id}" style="width:100%;justify-content:space-between">${esc(n)}<span class="faint small">허브에서 열기 →</span></a>`).join('')}</div>`).join('')}</div></section>`;
}

const WORKLOG_BASE = ['민원 상담, 전화 응대 및 방문 민원 안내','공문서 수신·발신, 문서관리 및 부서 간 업무협조','내부 결재서류 검토·보완'];
function worklogAuto(date) {
  const d = date ? parseYmd(date) : today(), k = ymd(d), out = [];
  const daily = sops().filter(s => s.freq === 'daily' && s.id !== 'worklog');
  daily.forEach(s => { const arr = (S.ho?.checks || {})[s.id + '@' + k] || {}; if (Object.values(arr).some(Boolean)) out.push(s.id === 'daily' ? '자금일보 작성 및 일일 자금 집행내역 확인' : s.title); });
  occurrences(addDays(d, -7), d).filter(o => o.done && ymd(new Date(S.done[o.key])) === k).forEach(o => out.push(o.rule.title));
  ((S.ho?.log || {})[k] || []).filter(t => !daily.some(x => x.title === t)).forEach(t => out.push(t + ' 업무 처리'));
  (S.settings.worklogBase || WORKLOG_BASE).forEach(t => out.push(t));
  return [...new Set(out)].join('\n');
}
document.addEventListener('click', e => { if (e.target.id === 'wl-auto') { D.f.worklog.content = worklogAuto(D.f.worklog.date); render(); toast('오늘 완료한 일로 채웠어요'); } });
