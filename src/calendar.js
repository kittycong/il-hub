/* ================= calendar ================= */
let calMonth = (() => { const t = today(); return new Date(t.getFullYear(), t.getMonth(), 1); })();
let calFilter = new Set([...Object.keys(CATS), 'leave', 'bday']);
const calMineOn = () => S.calMine !== false;
const calShow = o => calFilter.has(o.rule.cat) && !(calMineOn() && o.rule.who === 'other');
const WHO = {me:'내 담당', shared:'공통', other:'다른 담당'};
const CAL_GROUPS = ['sub','edu','insp','mtg'];
// 분류별 모아보기: 다음 일정 날짜(또는 날짜 미정)
function calGroupPanel() {
  const t = today(), to = addDays(t, 366), occ = occurrences(t, to);
  const vis = r => !r.off && !(calMineOn() && r.who === 'other');
  const col = CAL_GROUPS.map(cat => {
    const rules = S.rules.filter(r => r.cat === cat && vis(r));
    const rows = rules.map(r => { const o = occ.find(x => x.rule.id === r.id); return {r, o}; })
      .sort((a, b) => (a.r.undated ? 1 : 0) - (b.r.undated ? 1 : 0) || ((a.o ? a.o.date : addDays(t, 999)) - (b.o ? b.o.date : addDays(t, 999))));
    return `<div class="cg"><div class="row" style="gap:6px"><span class="dotcat" style="background:${CATS[cat].color}"></span><b>${CATS[cat].name}</b><span class="faint small">${rules.length}건</span></div>
      <ul class="cg-l">${rows.map(({r, o}) => `<li><button class="cg-i" data-edit-rule="${r.id}"><span class="cg-t">${esc(r.title)}</span><span class="cg-d ${r.undated?'und':''}">${r.undated ? '날짜 미정' : o ? `${o.date.getMonth()+1}/${o.date.getDate()} · D${(() => { const d = Math.round((o.date - t) / 864e5); return d === 0 ? '-day' : d > 0 ? '-' + d : '+' + (-d); })()}` : '—'}</span></button></li>`).join('') || '<li class="faint small">없음</li>'}</ul></div>`;
  }).join('');
  const und = S.rules.filter(r => r.undated && !r.off && vis(r)).length;
  return `<section class="panel"><div class="panel-h"><h2>정기·만기 모아보기</h2><span class="faint small">${und ? `날짜 미정 ${und}건 — 눌러서 날짜를 입력하면 캘린더에 올라가요` : '보험·구독 만기, 교육, 점검·평가·감사, 회의·임기'}</span></div><div class="panel-b cg-grid">${col}</div></section>`;
}

VIEWS.calendar = v => {
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const start = addDays(calMonth, -calMonth.getDay());
  const end = addDays(new Date(y, m+1, 0), 6 - new Date(y, m+1, 0).getDay());
  const occ = occurrences(start, end).filter(o => calShow(o));
  const byDay = {}; occ.forEach(o => (byDay[ymd(o.date)] ||= []).push(o));
  const xs = extraEvents(start, end).filter(e => calFilter.has(e.kind)); const xByDay = {}; xs.forEach(e => (xByDay[ymd(e.date)] ||= []).push(e));
  const tk = ymd(today());
  let cells = '';
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    const k = ymd(d), list = byDay[k] || [], xl = xByDay[k] || [], h = S.holidays[k];
    const cls = ['cell', d.getMonth()!==m?'out':'', d.getDay()===0?'sun':'', d.getDay()===6?'sat':'', h?'hol':'', k===tk?'today':''].join(' ');
    cells += `<div class="${cls}" data-day="${k}" role="button" tabindex="0" aria-label="${d.getMonth()+1}월 ${d.getDate()}일, 일정 ${list.length}건">
      <div class="dn"><span class="n">${d.getDate()}</span>${h?`<span class="hn">${esc(h)}</span>`:''}</div>
      ${list.slice(0,3).map(o=>`<div class="ev ${o.done?'done':''}" style="border-left-color:${CATS[o.rule.cat].color}" title="${esc(o.rule.title)}">${esc(o.rule.title)}</div>`).join('')}
      ${xl.slice(0, Math.max(0, 3-list.length)).map(e=>`<div class="ev x" style="border-left-color:${XCAT[e.kind].color}" title="${esc(e.title)}">${esc(e.title)}</div>`).join('')}
      ${list.length+xl.length>3?`<div class="cal-more">+${list.length+xl.length-3}건</div>`:''}
      ${wlogGet(k) ? `<span class="wl-mark" title="업무일지 기록됨">일지</span>` : ''}
      <div class="pips">${list.map(o=>`<i style="background:${o.done?'var(--line-strong)':CATS[o.rule.cat].color}"></i>`).join('')}${xl.map(e=>`<i style="background:${XCAT[e.kind].color}"></i>`).join('')}</div>
    </div>`;
  }
  const monthOcc = occ.filter(o => o.date.getMonth() === m);

  v.innerHTML = `
  <div class="page-head"><div><h1>마감 캘린더</h1><p>법정·정기 마감이 매달 자동으로 잡히고, 주말·공휴일이면 규칙에 따라 앞뒤로 옮겨집니다.</p></div>
    <div class="row"><button class="btn" id="wl-today">${icon('edit')}오늘 업무일지</button><button class="btn" id="ics">${icon('down')}NAS 캘린더용 .ics</button><button class="btn primary" id="add-rule">${icon('plus')}일정·규칙 추가</button></div></div>

  <div class="row small" style="gap:8px;margin:0 0 8px"><button class="chip" id="mine-tg" aria-pressed="${calMineOn()}">${calMineOn() ? '내 담당 + 공통만 보는 중' : '전체 담당 보는 중'}</button><span class="faint">누르면 ${calMineOn() ? '다른 담당 일정까지 모두' : '내 담당 + 공통만'} 봅니다 · 일정 편집에서 담당을 바꿀 수 있어요</span></div>
  <section class="panel">
    <div class="panel-h">
      <div class="row"><button class="btn ghost sm" id="prev" aria-label="이전 달">${icon('left')}</button>
        <h2 class="num" style="min-width:104px;text-align:center;font:700 18px var(--f-display)">${y}년 ${m+1}월</h2>
        <button class="btn ghost sm" id="next" aria-label="다음 달">${icon('right')}</button><button class="btn sm" id="thism">이번 달</button></div>
      <div class="row" style="gap:6px">${Object.entries({...CATS, ...(CONN.huga.status==='ok'?{leave:XCAT.leave}:{}), ...(CONN.birth.status==='ok'?{bday:XCAT.bday}:{})}).map(([k,c])=>`<button class="chip" data-cat="${k}" aria-pressed="${calFilter.has(k)}" style="cursor:pointer;border:0;${calFilter.has(k)?'':'opacity:.4'}"><span class="dotcat" style="background:${c.color}"></span>${c.name}</button>`).join('')}</div>
    </div>
    <div style="overflow-x:auto"><div class="cal">${DOW.map((d,i)=>`<div class="dow" style="${i===0?'color:var(--stamp)':i===6?'color:var(--accent)':''}">${d}</div>`).join('')}${cells}</div></div>
  </section>

  ${calGroupPanel()}

  <div class="grid-2">
    <section class="panel"><div class="panel-h"><h2>${m+1}월 마감 목록</h2><div class="row" style="gap:6px"><span class="faint small">${monthOcc.filter(o=>o.done).length}/${monthOcc.length} 완료</span><button class="btn ghost sm" id="wl-month" title="이 달 업무일지 전체 복사">${icon('copy')}${m+1}월 업무일지</button><button class="btn ghost sm" id="wl-hwpx-month" title="이 달 업무일지를 hwpx 파일 묶음(zip)으로">${icon('doc')}hwpx 묶음</button></div></div>
      ${monthOcc.length?`<ul class="dl" id="mlist">${monthOcc.map(o=>deadlineItem(o)).join('')}</ul>`:'<div class="empty">이 달에는 마감이 없어요</div>'}</section>
    <section class="panel"><div class="panel-h"><h2>반복 규칙 ${S.rules.length}개</h2><span class="faint small">${S.rules.filter(r=>r.verify&&!r.off).length?`"날짜 확인" ${S.rules.filter(r=>r.verify&&!r.off).length}개는 추정 날짜예요`:'센터 기준에 맞게 날짜를 고쳐 쓰세요'}</span></div>
      <div class="tbl-wrap" style="border:0;border-radius:0;max-height:520px;overflow:auto"><table class="tbl"><thead><tr><th>일정</th><th>주기</th><th>휴일이면</th><th></th></tr></thead><tbody>
      ${S.rules.map(r=>`<tr style="${r.off?'opacity:.45':''}"><td class="wrap"><span class="dotcat" style="background:${CATS[r.cat].color};margin-right:6px"></span>${esc(r.title)}${r.verify?' <span class="chip vfy">날짜 확인</span>':''}${r.who&&r.who!=='me'?` <span class="chip">${WHO[r.who]}</span>`:''}</td><td>${ruleText(r)}</td><td>${{prev:'앞당김',next:'미룸',none:'그대로'}[r.shift]}</td><td><button class="btn ghost sm" data-edit-rule="${r.id}">편집</button></td></tr>`).join('')}
      </tbody></table></div></section>
  </div>`;

  $('#prev').onclick = () => { calMonth = new Date(y, m-1, 1); render(); };
  $('#next').onclick = () => { calMonth = new Date(y, m+1, 1); render(); };
  $('#thism').onclick = () => { const t = today(); calMonth = new Date(t.getFullYear(), t.getMonth(), 1); render(); };
  $('#add-rule').onclick = () => editRule(null);
  $('#mine-tg').onclick = () => { S.calMine = !calMineOn(); save(); render(); };
  $('#ics').onclick = exportIcs;
  $('#wl-today').onclick = () => { const k = ymd(today()); dayDetail(k, occurrences(today(), today()).filter(o => calShow(o))); };
  const wh = $('#wl-hwpx-month'); if (wh) wh.onclick = () => wlHwpxMonth(y, m);
  const wm = $('#wl-month'); if (wm) wm.onclick = () => { const t = wlogMonthText(y, m); t ? copyText(t, `${m+1}월 업무일지 ${Object.keys(S.wlog || {}).filter(x => x.startsWith(`${y}-${pad(m+1)}`)).length}일치를 복사했어요`) : toast('이 달에 기록한 업무일지가 없어요'); };
  $$('[data-cat]', v).forEach(b => b.onclick = () => { const k = b.dataset.cat; calFilter.has(k) ? calFilter.delete(k) : calFilter.add(k); if (!calFilter.size) calFilter = new Set([...Object.keys(CATS), 'leave', 'bday']); render(); });
  $$('[data-edit-rule]', v).forEach(b => b.onclick = () => editRule(b.dataset.editRule));
  $$('.cal .cell', v).forEach(c => { const open = () => dayDetail(c.dataset.day, byDay[c.dataset.day] || [], xByDay[c.dataset.day] || []); c.onclick = open; c.onkeydown = e => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); open(); } }; });
  const ml = $('#mlist', v); if (ml) bindDone(ml, () => render());
};
function ruleText(r) {
  if (r.undated) return '날짜 미정';
  const dd = r.day === 'payday' ? `${S.settings.payday}일(급여일)` : r.day === 'last' ? '말일' : `${r.day}일`;
  if (r.type === 'monthly') return `매월 ${dd}`;
  if (r.type === 'yearly') return Array.isArray(r.month) ? `매년 ${r.month.join('·')}월 ${dd}` : `매년 ${r.month}월 ${dd}`;
  return r.date;
}
function dayDetail(k, list, xl = extraEvents(parseYmd(k), parseYmd(k))) {
  const d = parseYmd(k), h = S.holidays[k], saved = (S.wlog || {})[k];
  const content = saved ? saved.content : '';
  sheet({title: `${d.getMonth()+1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일${h?' · '+h:''}`, wide: true,
    body: (list.length ? `<ul class="dl" style="margin:-16px -16px 0">${list.map(o=>deadlineItem(o)).join('')}</ul>` : '<div class="empty" style="padding:10px">잡힌 마감이 없어요</div>') + (xl.length ? `<div style="display:flex;flex-direction:column;gap:6px;padding-top:8px">${xl.map(e=>`<div class="row small" style="gap:8px"><span class="dotcat" style="background:${XCAT[e.kind].color}"></span>${esc(e.title)}<span class="faint">${XCAT[e.kind].name} · 연동 데이터</span></div>`).join('')}</div>` : '')
      + `<div class="wl-box"><div class="row"><b>업무일지 (결재용)</b><span class="faint small" id="wl-st">${saved ? '저장됨 · ' + esc(new Date(saved.at).toLocaleString('ko-KR', {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'})) : '아직 기록 없음'}</span><span class="grow"></span><button class="btn ghost sm" id="wl-ph">문구 넣기</button><button class="btn ghost sm" id="wl-fill">${icon('check')}완료한 일로 채우기</button></div>
        <textarea class="inp" id="wl-tx" rows="8" placeholder="한 줄에 업무 하나씩 적어요&#10;예) 9월분 급여 계산 및 급여대장 결재&#10;예) 4대보험 고지내역 확인">${esc(content)}</textarea>
        <label class="f">비고<input class="inp" id="wl-note" value="${esc(saved ? saved.note : '')}"></label>
        <div class="row" style="gap:6px"><button class="btn primary sm" id="wl-hwpx">${icon('doc')}hwpx 파일로 저장</button><button class="btn sm" id="wl-copy">${icon('copy')}업무내용 복사</button><button class="btn sm" id="wl-doc">${icon('print')}업무일지 양식으로 보기·인쇄</button><span class="grow"></span><button class="btn ghost sm" id="wl-tpl">양식 등록·변경</button></div><div class="faint small" style="margin-top:4px">입력하면 바로 저장돼요 · hwpx 저장은 등록한 센터 양식으로 만들어요</div></div>`,
    foot: `<button class="btn" data-close>닫기</button><button class="btn" id="dd-add">${icon('plus')}이 날짜에 일정 추가</button>`,
    onMount: el => {
      $('#dd-add', el).onclick = () => editRule(null, k);
      el.addEventListener('click', e => { const b = e.target.closest('[data-done]'); if (!b) return; toggleDone(b.dataset.done); render(); dayDetail(k, occurrences(d, d).filter(o=>calShow(o))); });
      let tm; const put = () => { clearTimeout(tm); tm = setTimeout(() => { wlogSet(k, $('#wl-tx', el).value, $('#wl-note', el).value); const st = $('#wl-st', el); if (st) st.textContent = '저장됨 · 방금'; if (current() === 'calendar') { const c = document.querySelector(`.cal .cell[data-day="${k}"]`); if (c && !c.querySelector('.wl-mark') && wlogGet(k)) c.querySelector('.pips').insertAdjacentHTML('beforebegin', '<span class="wl-mark" title="업무일지 기록됨">일지</span>'); } }, 400); };
      $('#wl-tx', el).oninput = put; $('#wl-note', el).oninput = put;
      $('#wl-fill', el).onclick = () => { const cur = $('#wl-tx', el).value.trim(), auto = worklogAuto(k); $('#wl-tx', el).value = cur ? [...new Set([...cur.split('\n'), ...auto.split('\n')].map(s => s.trim()).filter(Boolean))].join('\n') : auto; put(); toast('완료한 마감·업무로 채웠어요 (기존 내용은 유지)'); };
      const reopen = () => dayDetail(k, occurrences(d, d).filter(o => calShow(o)));
      $('#wl-ph', el).onclick = () => { wlogSet(k, $('#wl-tx', el).value, $('#wl-note', el).value); const note = $('#wl-note', el).value, cur = $('#wl-tx', el).value; wlPhraseSheet(k, v => { const merged = [...new Set([...cur.split('\n'), ...v].map(x => x.trim()).filter(Boolean))].join('\n'); wlogSet(k, merged, note); closeSheet(); reopen(); render(); }); };
      $('#wl-hwpx', el).onclick = async () => { wlogSet(k, $('#wl-tx', el).value, $('#wl-note', el).value); await wlHwpxSave(k, $('#wl-tx', el).value, $('#wl-note', el).value); if (!document.querySelector('#wl-tx')) reopen(); };
      $('#wl-tpl', el).onclick = () => wlTplSheet(() => reopen());
      $('#wl-copy', el).onclick = () => { const t = wlogHwpText($('#wl-tx', el).value); t ? copyText(t, '복사했어요. hwpx 업무일지의 업무내용 칸에 붙여 넣으세요') : toast('업무일지 내용을 먼저 적어 주세요'); };
      $('#wl-doc', el).onclick = () => { wlogSet(k, $('#wl-tx', el).value, $('#wl-note', el).value); D.type = 'worklog'; D.f.worklog = Object.assign(D.f.worklog || {}, {date: k, content: $('#wl-tx', el).value, note: $('#wl-note', el).value}); closeSheet(); go('docs'); };
    }});
}
function editRule(id, date) {
  const r = id ? S.rules.find(x => x.id === id) : {id: uid(), title:'', cat:'etc', type: date?'once':'monthly', day:10, month:1, date: date || ymd(today()), shift: date?'none':'next', note:'', sop:''};
  const dayOpts = [...Array(31)].map((_, i) => `<option value="${i+1}" ${String(r.day)===String(i+1)?'selected':''}>${i+1}일</option>`).join('') + `<option value="last" ${r.day==='last'?'selected':''}>말일</option><option value="payday" ${r.day==='payday'?'selected':''}>급여일(${S.settings.payday}일)</option>`;
  sheet({title: id ? '일정 규칙 편집' : '일정·규칙 추가', body: `
    <label class="f">일정 이름<input class="inp" id="ru-t" value="${esc(r.title)}" placeholder="예: 2차 추경예산 진우 입력"></label>
    <div class="form-grid">
      <label class="f">분류<select class="inp" id="ru-c">${Object.entries(CATS).map(([k,c])=>`<option value="${k}" ${r.cat===k?'selected':''}>${c.name}</option>`).join('')}</select></label>
      <label class="f">주기<select class="inp" id="ru-ty"><option value="monthly">매월</option><option value="yearly">매년</option><option value="once">한 번</option></select></label>
      <label class="f" data-for="yearly">월<select class="inp" id="ru-m">${[...Array(12)].map((_,i)=>`<option value="${i+1}" ${Number(r.month)===i+1?'selected':''}>${i+1}월</option>`).join('')}</select></label>
      <label class="f" data-for="monthly yearly">날짜<select class="inp" id="ru-d">${dayOpts}</select></label>
      <label class="f" data-for="once">날짜<input class="inp" type="date" id="ru-date" value="${esc(r.date||'')}"></label>
      <label class="f">주말·공휴일이면<select class="inp" id="ru-s"><option value="next">다음 평일로 미룸</option><option value="prev">전 평일로 앞당김</option><option value="none">그대로</option></select></label>
    </div>
    <label class="f">담당<select class="inp" id="ru-w">${Object.entries(WHO).map(([k,n])=>`<option value="${k}" ${(r.who||'me')===k?'selected':''}>${n}</option>`).join('')}</select></label>
    ${r.undated?`<label class="row small"><input type="checkbox" id="ru-set"> 날짜 정함 (체크하면 위 주기·날짜로 캘린더에 표시)</label>`:''}
    <label class="f">메모<input class="inp" id="ru-n" value="${esc(r.note)}"></label>
    <label class="f">연결 절차 (업무)<select class="inp" id="ru-rt"><option value="">없음</option>${sops().map(x=>`<option value="${x.id}" ${(sopOfRule(r)||{}).id===x.id?'selected':''}>${esc(x.title)}</option>`).join('')}</select></label>
    ${r.verify?`<div class="note warn small">이 날짜는 문서에서 정확히 확인되지 않은 <b>추정값</b>이에요. 전임자·공문으로 확인한 뒤 날짜를 고치고 아래를 체크해 주세요.</div>
    <label class="row small"><input type="checkbox" id="ru-vf"> 날짜 확인됨 ("날짜 확인" 표시 없애기)</label>`:''}
    ${id?`<label class="row small"><input type="checkbox" id="ru-off" ${r.off?'checked':''}> 이 규칙 끄기 (캘린더에 표시 안 함)</label>`:''}`,
    foot: `${id?'<button class="btn danger" id="ru-del">삭제</button><span class="grow"></span>':''}<button class="btn" data-close>취소</button><button class="btn primary" id="ru-save">저장</button>`,
    onMount: el => {
      $('#ru-ty', el).value = r.type; $('#ru-s', el).value = r.shift;
      const sync = () => { const t = $('#ru-ty', el).value; $$('[data-for]', el).forEach(x => x.hidden = !x.dataset.for.split(' ').includes(t)); };
      $('#ru-ty', el).onchange = sync; sync();
      $('#ru-save', el).onclick = () => {
        const t = $('#ru-t', el).value.trim(); if (!t) { $('#ru-t', el).focus(); toast('일정 이름을 적어 주세요'); return; }
        Object.assign(r, {title:t, cat:$('#ru-c', el).value, type:$('#ru-ty', el).value, month:(Array.isArray(r.month) && Number($('#ru-m', el).value) === Number(r.month[0])) ? r.month : Number($('#ru-m', el).value), shift:$('#ru-s', el).value, note:$('#ru-n', el).value.trim(), sop:$('#ru-rt', el).value, date:$('#ru-date', el).value || (r.undated ? '' : ymd(today())), who:$('#ru-w', el).value});
        const st = $('#ru-set', el); if (st) { if (st.checked) { if ($('#ru-ty', el).value === 'once' && !$('#ru-date', el).value) { toast('한 번 일정은 날짜를 골라 주세요'); return; } delete r.undated; } }
        const dv = $('#ru-d', el).value; r.day = /^\d+$/.test(dv) ? Number(dv) : dv;
        const off = $('#ru-off', el); if (off) r.off = off.checked;
        const vf = $('#ru-vf', el); if (vf && vf.checked) { delete r.verify; r.verified = true; }
        if (!id) S.rules.push(r); save(); closeSheet(); render(); toast('저장했어요');
      };
      const del = $('#ru-del', el);
      if (del) del.onclick = () => { if (del.dataset.armed) { S.rules = S.rules.filter(x => x.id !== id); save(); closeSheet(); render(); toast('삭제했어요'); } else { del.dataset.armed = 1; del.textContent = '한 번 더 누르면 삭제'; } };
    }});
}
function exportIcs() {
  const t = today(), occ = occurrences(new Date(t.getFullYear(), t.getMonth(), 1), addDays(t, 365));
  const e = s => String(s).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
  const d8 = d => ymd(d).replace(/-/g,'');
  const stamp = new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+/,'');
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//il-hub//Work Hub//KO','CALSCALE:GREGORIAN','X-WR-CALNAME:업무허브 행정 마감'];
  occ.forEach(o => lines.push('BEGIN:VEVENT', `UID:${o.key}@il-hub`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d8(o.date)}`, `DTEND;VALUE=DATE:${d8(addDays(o.date,1))}`,
    `SUMMARY:${e('[' + CATS[o.rule.cat].name + '] ' + o.rule.title)}`, `DESCRIPTION:${e(o.rule.note || '')}`, 'BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:-P2D',`DESCRIPTION:${e(o.rule.title)}`,'END:VALARM','END:VEVENT'));
  lines.push('END:VCALENDAR');
  const txt = lines.join('\r\n');
  if (CAN_FILE) { download(`업무허브_마감_${ymd(t)}.ics`, txt, 'text/calendar'); toast(`${occ.length}건을 .ics로 내보냈어요`); }
  else sheet({title:'NAS 캘린더용 .ics', body:`<div class="note">여기서는 파일 저장이 막혀 있어요. 아래 내용을 복사해 메모장에 붙여 넣고 <b>업무허브_마감.ics</b>로 저장한 뒤, 시놀로지 캘린더 → 가져오기로 넣어 주세요. (GitHub 배포본에서는 바로 파일로 받아져요)</div><textarea class="inp mono" rows="10" readonly id="ics-t">${esc(txt)}</textarea>`,
    foot:`<button class="btn" data-close>닫기</button><button class="btn primary" id="ics-c">${icon('copy')}${occ.length}건 복사</button>`, onMount: el => { $('#ics-c', el).onclick = () => copyText(txt, '.ics 내용을 복사했어요'); }});
}

/* 예전 '루틴' 주소는 업무 화면으로 */
VIEWS.routine = v => { HO.tab = 'month'; HO.open = null; location.replace('#handover'); };
