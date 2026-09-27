/* ================= home ================= */
function deadlineItem(o, showNote = true) {
  const c = CATS[o.rule.cat] || CATS.etc;
  const shifted = ymd(o.date) !== ymd(o.orig) ? ` · 원래 ${o.orig.getMonth()+1}/${o.orig.getDate()} → 휴일 순연` : '';
  const dd = dday(o.date), late = !o.done && o.date < today(), sp = sopOfRule(o.rule);
  return `<li class="${o.done?'done':''}">
    <div class="when"><b>${o.date.getMonth()+1}/${o.date.getDate()}</b><span class="${late?'chip crit':o.done?'faint':dd==='오늘'?'chip warn':'faint'}" style="${late||dd==='오늘'?'height:18px;padding:0 6px;font-size:11px':''}">${DOW[o.date.getDay()]} · ${dd}</span></div>
    <div style="min-width:0"><div class="t"><span class="dotcat" style="background:${c.color};margin-right:6px"></span>${esc(o.rule.title)}${o.rule.verify?` <span class="chip vfy" title="추정 날짜 · 캘린더 규칙 편집에서 확인">날짜 확인</span>`:''}</div>
      ${showNote ? `<div class="s">${esc(c.name)}${o.rule.note?' · '+esc(o.rule.note):''}${shifted}${sp?` · <a href="#handover" data-hoopen="${sp.id}">절차 열기</a>`:''}</div>` : ''}</div>
    <button class="check" aria-pressed="${o.done}" aria-label="${esc(o.rule.title)} 완료 표시" data-done="${o.key}">${o.done?icon('check'):''}</button>
  </li>`;
}
function bindDone(root, rerender) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-done]'); if (!b) return;
    toggleDone(b.dataset.done); toast(S.done[b.dataset.done] ? '완료로 표시했어요' : '완료를 취소했어요'); rerender();
  });
}

VIEWS.home = v => {
  const t = today(), od = overdueList();
  const upcoming = occurrences(t, addDays(t, 20));
  const todayList = upcoming.filter(o => ymd(o.date) === ymd(t));
  const week = upcoming.filter(o => o.date <= addDays(t, 6) && !o.done);
  const ms = monthSops().map(hoRun);
  const rtDone = ms.reduce((a, r) => a + r.done, 0), rtTot = ms.reduce((a, r) => a + r.total, 0);
  const hol = S.holidays[ymd(t)];

  v.innerHTML = `
  <div class="page-head">
    <div><div class="eyebrow">${t.getFullYear()}년 ${t.getMonth()+1}월 ${t.getDate()}일 ${DOW[t.getDay()]}요일${hol?' · '+esc(hol):''}</div><h1>오늘 챙길 일</h1></div>
    <div class="row"><button class="btn sm" id="h-search">검색</button><button class="btn sm primary" id="h-week">${icon('copy')}주간 보고</button><a class="btn sm" href="#settings">${icon('gear')}설정</a></div>
  </div>

  <section class="panel today-strip">
    <div class="datebox"><div class="d num">${t.getDate()}</div><div class="m">${t.getMonth()+1}월 · ${DOW[t.getDay()]}요일</div></div>
    <div class="kpis">
      <div class="kpi ${od.length?'crit':''}"><div class="v">${od.length}</div><div class="l">지난 마감 · 미완료</div></div>
      <div class="kpi ${todayList.filter(o=>!o.done).length?'warn':''}"><div class="v">${todayList.filter(o=>!o.done).length}</div><div class="l">오늘 마감</div></div>
      <div class="kpi"><div class="v">${week.length}</div><div class="l">7일 안 마감</div></div>
      <div class="kpi"><div class="v">${rtTot?Math.round(rtDone/rtTot*100):0}<span style="font-size:14px">%</span></div><div class="l">이번 달 업무 진행</div></div>
    </div>
  </section>

  <div class="grid-2">
    <section class="panel">
      <div class="panel-h"><h2>마감 · 앞으로 3주</h2><a class="btn ghost sm" href="#calendar">전체 보기</a></div>
      ${od.length ? `<div style="padding:10px 16px 0"><div class="eyebrow" style="color:var(--stamp)">지난 마감 · 미완료 ${od.length}건</div></div><ul class="dl" id="od-list">${od.map(o=>deadlineItem(o)).join('')}</ul><div style="border-top:1px solid var(--line)"></div>` : ''}
      ${upcoming.length ? `<ul class="dl" id="up-list">${upcoming.map(o=>deadlineItem(o)).join('')}</ul>` : '<div class="empty">3주 안에 잡힌 마감이 없어요</div>'}
    </section>

    <div style="display:flex;flex-direction:column;gap:16px">
      ${hoMonthPanel()}
      ${hoDailyPanel()}
      ${centerPanel()}
      <section class="panel">
        <div class="panel-h"><h2>바로가기</h2><a class="btn ghost sm" href="#apps">앱 관리</a></div>
        <div class="panel-b"><div class="apps" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${S.apps.slice(0,6).map(a=>appCard(a)).join('')}</div></div>
      </section>
    </div>
  </div>`;
  bindDone(v, () => render());
  $('#h-search', v).onclick = openSearch; $('#h-week', v).onclick = weeklyReport;
};

/* ================= apps ================= */
const APP_ST = {
  ok:{t:'연결됨', c:'ok'}, chk:{t:'열어서 확인 필요', c:'warn'}, url:{t:'주소 입력 필요', c:'warn'}, local:{t:'로컬 실행', c:''}, pc:{t:'PC 프로그램', c:''},
};
function appCard(a, editable = false) {
  let st = a.url ? (a.st === 'chk' ? APP_ST.chk : APP_ST.ok) : (APP_ST[a.st] || APP_ST.url);
  if (a.url && HEALTH[a.id] === 'ok') st = {t:'정상 응답', c:'ok'}; else if (a.url && HEALTH[a.id] === 'down') st = {t:'응답 없음', c:'crit'};
  const ini = esc(a.name.replace(/[^가-힣A-Za-z]/g,'').slice(0,1));
  const inner = `<div class="ic">${ini}</div><div class="n">${esc(a.name)}</div><div class="dsc">${esc(a.desc||'')}${editable&&a.repo?`<br><span class="mono">${esc(a.repo)}</span>`:''}</div>
    <div class="st row" style="gap:6px"><span class="chip ${st.c}">${st.t}</span>${a.url?`<span class="faint small">${icon('ext','').replace('<svg','<svg style="width:13px;height:13px;vertical-align:-2px"')}</span>`:''}</div>
    ${editable?`<button class="btn ghost sm edit" data-edit-app="${a.id}" aria-label="${esc(a.name)} 편집">${icon('edit')}</button>`:''}`;
  return a.url ? `<a class="app" href="${esc(a.url)}" target="_blank" rel="noopener">${inner}</a>` : `<div class="app" ${editable?'':`data-goapps`}>${inner}</div>`;
}
VIEWS.apps = v => {
  v.innerHTML = `
  <div class="page-head"><div><h1>업무 앱</h1><p>GitHub에 배포한 앱과 PC 프로그램을 한곳에서 엽니다. 주소가 없는 앱은 편집 버튼으로 URL을 넣어 주세요.</p></div>
    <button class="btn primary" id="add-app">${icon('plus')}앱 추가</button></div>
  <div class="apps">${S.apps.map(a => appCard(a, true)).join('')}</div>
  ${connPanel()}
  <section class="panel"><div class="panel-h"><h2>연결 방식</h2></div><div class="panel-b" style="display:flex;flex-direction:column;gap:10px">
    <div class="note"><b>웹앱 (GitHub Pages)</b> — 카드를 누르면 새 탭으로 열립니다. 휴대폰에서는 이 허브를 홈 화면에 추가하면 앱처럼 쓸 수 있어요.</div>
    <div class="note"><b>진우정보시스템</b> — PC 설치형이라 링크로 열 수 없어요. 대신 <a href="#bridge">진우 연결</a>에서 진우 장부를 엑셀로 내려받아 수기 엑셀과 대조하고, 입력할 목록을 정리합니다.</div>
    <div class="note"><b>시놀로지 NAS 캘린더</b> — <a href="#calendar">캘린더</a>에서 .ics 파일을 내보내 NAS 캘린더의 "가져오기"로 넣으면 마감이 센터 공유 일정에 들어갑니다.</div>
  </div></section>`;
  $('#add-app').onclick = () => editApp(null);
  bindConn(v);
  v.addEventListener('click', e => { const b = e.target.closest('[data-edit-app]'); if (b) { e.preventDefault(); editApp(b.dataset.editApp); } });
};
function editApp(id) {
  const a = id ? S.apps.find(x => x.id === id) : {id: uid(), name:'', url:'', desc:'', st:'url'};
  sheet({title: id ? '앱 편집' : '앱 추가', body: `
    <label class="f">이름<input class="inp" id="ap-name" value="${esc(a.name)}"></label>
    <label class="f">주소 (URL)<input class="inp" id="ap-url" placeholder="https://kittycong.github.io/..." value="${esc(a.url)}"></label>
    <label class="f">GitHub 저장소 이름<input class="inp" id="ap-repo" value="${esc(a.repo||'')}" placeholder="예: guro_huga"></label>
    <label class="f">설명<input class="inp" id="ap-desc" value="${esc(a.desc)}"></label>
    <label class="f">상태<select class="inp" id="ap-st">${Object.entries(APP_ST).map(([k,o])=>`<option value="${k}" ${a.st===k?'selected':''}>${o.t}</option>`).join('')}</select></label>
    <div id="ap-confirm"></div>`,
    foot: `${id?'<button class="btn danger" id="ap-del">삭제</button><span class="grow"></span>':''}<button class="btn" data-close>취소</button><button class="btn primary" id="ap-save">저장</button>`,
    onMount: el => {
      $('#ap-save', el).onclick = () => {
        a.name = $('#ap-name', el).value.trim() || '이름 없는 앱'; a.url = $('#ap-url', el).value.trim(); a.desc = $('#ap-desc', el).value.trim(); a.repo = $('#ap-repo', el).value.trim(); a.st = $('#ap-st', el).value;
        if (a.url && !/^https?:\/\//.test(a.url)) a.url = 'https://' + a.url;
        if (!id) S.apps.push(a); save(); closeSheet(); render(); toast('저장했어요');
      };
      const del = $('#ap-del', el);
      if (del) del.onclick = () => {
        if (del.dataset.armed) { S.apps = S.apps.filter(x => x.id !== id); save(); closeSheet(); render(); toast('삭제했어요'); }
        else { del.dataset.armed = 1; del.textContent = '한 번 더 누르면 삭제'; }
      };
    }});
}
document.addEventListener('click', e => { if (e.target.closest('[data-goapps]')) go('apps'); });

function centerPanel() {
  const t = today(), wk = addDays(t, 6);
  const lv = leaveEvents(t, wk), bd = birthdayEvents(t, addDays(t, 30));
  const hOk = CONN.huga.status === 'ok', bOk = CONN.birth.status === 'ok';
  if (!hOk && !bOk) return `<section class="panel"><div class="panel-h"><h2>휴가 · 생일</h2><a class="btn ghost sm" href="#apps">연동 설정</a></div><div class="panel-b small muted">${CONN.huga.status==='loading'?'연동 데이터를 읽는 중…':'휴가 대시보드·생일 관리 앱과 아직 연결되지 않았어요. 앱 화면의 "데이터 연동"에서 확인하세요.'}</div></section>`;
  const bal = leaveBalance();
  const day = e => `<span class="mono">${e.date.getMonth()+1}/${e.date.getDate()}</span> ${DOW[e.date.getDay()]}`;
  return `<section class="panel"><div class="panel-h"><h2>휴가 · 생일</h2><a class="btn ghost sm" href="#apps">연동 설정</a></div>
    <div class="panel-b" style="display:flex;flex-direction:column;gap:12px">
      ${hOk&&hugaStaleDays()>30?`<div class="note warn small">휴가 데이터가 ${hugaStaleDays()}일 전 기준이에요. 휴가 앱에서 <b>공유 저장</b>을 한 번 눌러 주세요.</div>`:''}
      ${hOk?`<div><div class="eyebrow" style="margin-bottom:6px">7일 안 휴가</div>${lv.length?lv.map(e=>`<div class="row small" style="gap:8px"><span class="dotcat" style="background:var(--cat-leave)"></span>${day(e)} · ${esc(e.title)}</div>`).join(''):'<div class="small faint">예정된 휴가가 없어요</div>'}</div>
      ${bal.length?`<div class="row small" style="gap:6px">${bal.slice(0,4).map(b=>`<span class="chip ${b.left!=null&&b.left<3?'warn':'acc'}">${esc(b.name)} 연차 ${b.left!=null?`잔여 ${b.left}일`:`사용 ${b.used}일`}</span>`).join('')}</div>`:''}`:''}
      ${bOk?`<div><div class="eyebrow" style="margin-bottom:6px">30일 안 생일</div>${bd.length?bd.slice(0,5).map(e=>`<div class="row small" style="gap:8px"><span class="dotcat" style="background:var(--cat-bday)"></span>${day(e)} · ${esc(e.p.name)} <span class="faint">${esc(e.p.dept||'')}</span>${ymd(e.date)===ymd(t)?'<span class="chip warn">오늘</span>':''}</div>`).join(''):'<div class="small faint">없어요</div>'}</div>`:''}
    </div></section>`;
}
