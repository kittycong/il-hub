/* ================= 업무 (인수인계 절차 + 이번 달 할 일) ================= */
const HO_ST = {new:{t:'미숙지', c:''}, learn:{t:'실습 중', c:'warn'}, ok:{t:'혼자 가능', c:'ok'}};
const HO = {cat:'all', open:null, tab:'month'};
function hoState() { S.ho = S.ho || {status:{}, notes:{}, checks:{}}; return S.ho; }
function hoPeriod(sop) {
  const t = today();
  if (sop.freq === 'daily') return ymd(t);
  if (sop.freq === 'monthly') return `${t.getFullYear()}-${pad(t.getMonth()+1)}`;
  if (sop.freq === 'yearly') return `${t.getFullYear()}`;
  return hoState().checks[sop.id + ':cur'] || '1건';
}
function hoSteps(sop) { return sop.sections.flatMap((s, si) => s.steps.map((t, i) => ({t, k:`${si}.${i}`}))); }
function hoRun(sop) {
  const st = hoState(), key = sop.id + '@' + hoPeriod(sop), arr = st.checks[key] || {};
  const all = hoSteps(sop), done = all.filter(x => arr[x.k]).length;
  return {key, arr, done, total: all.length};
}
function monthSops() {
  const t = today(), from = new Date(t.getFullYear(), t.getMonth(), 1), to = new Date(t.getFullYear(), t.getMonth() + 1, 0);
  const due = new Set(occurrences(from, to).map(o => (sopOfRule(o.rule) || {}).id).filter(Boolean));
  return sops().filter(s => { if (s.freq === 'daily') return false; if (s.freq === 'monthly' || due.has(s.id)) return true;
    const r = hoRun(s); return s.freq === 'adhoc' && r.done > 0 && r.done < r.total; });
}
function sopCard(s, st) {
  const r = hoRun(s), ss = HO_ST[st.status[s.id] || 'new'], c = HO_CATS[s.cat] || HO_CATS.gen;
  return `<button class="app" data-open="${s.id}" style="text-align:left;cursor:pointer;font:inherit">
    <div class="row" style="gap:6px"><span class="dotcat" style="background:${c.color}"></span><span class="faint small">${c.name} · ${HO_FREQ[s.freq]}</span><span class="grow"></span>${s.custom?'<span class="chip acc">내 절차</span>':s.edited?'<span class="chip acc">수정함</span>':''}<span class="chip ${ss.c}">${ss.t}</span></div>
    <div class="n">${esc(s.title)}</div><div class="dsc">${esc(s.when)}</div>${HO_OWNER[s.id]?`<span class="chip" style="align-self:flex-start">인수: ${esc(HO_OWNER[s.id])}</span>`:''}
    <div class="st" style="width:100%"><div class="row small" style="gap:6px"><span class="faint">${esc(hoPeriod(s))} 진행</span><span class="grow"></span><span class="num">${r.done}/${r.total}</span>${r.total&&r.done===r.total?'<span class="chip ok">완료</span>':''}</div><div class="prog" style="margin-top:4px"><i style="width:${r.total?r.done/r.total*100:0}%"></i></div></div>
  </button>`;
}
function hoMonthPanel() {
  const list = monthSops(); if (!list.length) return '';
  const t = today();
  return `<section class="panel"><div class="panel-h"><h2>${t.getMonth()+1}월 업무</h2><a class="btn ghost sm" href="#handover">업무 화면</a></div>
    <div class="panel-b" style="display:flex;flex-direction:column;gap:12px">${list.map(s => { const r = hoRun(s), pct = r.total ? Math.round(r.done / r.total * 100) : 0;
      return `<a href="#handover" data-hoopen="${s.id}" style="text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:6px">
        <div class="row"><b>${esc(s.title)}</b><span class="faint small">${HO_FREQ[s.freq]}</span><span class="grow"></span><span class="num small ${pct===100?'':'muted'}">${r.done}/${r.total}</span>${pct===100?'<span class="chip ok">완료</span>':''}</div>
        <div class="prog"><i style="width:${pct}%"></i></div></a>`; }).join('')}</div></section>`;
}
function editSop(id) {
  const base = id ? sopById(id) : {id: 'c' + uid(), cat:'gen', freq:'monthly', title:'', when:'', sections:[{h:'준비', steps:[''], warn:[]}], custom:true};
  const isCustom = !id || base.custom;
  sheet({title: id ? '절차 편집' : '새 절차', wide: true, body: `
    <div class="form-grid">
      <label class="f">업무 이름<input class="inp" id="so-t" value="${esc(base.title)}" placeholder="예: 후원자 감사편지 발송"></label>
      <label class="f">언제<input class="inp" id="so-w" value="${esc(base.when)}" placeholder="예: 매월 10일 전후"></label>
      ${isCustom?`<label class="f">분류<select class="inp" id="so-c">${Object.entries(HO_CATS).map(([k,c])=>`<option value="${k}" ${base.cat===k?'selected':''}>${c.name}</option>`).join('')}</select></label>
      <label class="f">주기<select class="inp" id="so-f">${Object.entries(HO_FREQ).map(([k,n])=>`<option value="${k}" ${base.freq===k?'selected':''}>${n}</option>`).join('')}</select></label>`:''}
    </div>
    <label class="f">절차<textarea class="inp mono" id="so-x" rows="14">${esc(sopToText(base))}</textarea></label>
    <div class="note small"><b>## 제목</b> 줄은 단계 묶음, <b>- </b>로 시작하면 체크 단계, <b>! </b>로 시작하면 주의 문구예요. 단계 순서를 바꾸면 이번 기간 체크는 새로 해야 할 수 있어요.</div>`,
    foot: `${id && (base.custom || base.edited) ? `<button class="btn danger" id="so-del">${base.custom?'삭제':'원래대로'}</button><span class="grow"></span>` : ''}<button class="btn" data-close>취소</button><button class="btn primary" id="so-save">저장</button>`,
    onMount: el => {
      $('#so-save', el).onclick = () => {
        const title = $('#so-t', el).value.trim(); if (!title) { $('#so-t', el).focus(); toast('업무 이름을 적어 주세요'); return; }
        const sections = textToSections($('#so-x', el).value); if (!sections.length) { toast('단계를 한 줄 이상 적어 주세요'); return; }
        const patch = {title, when: $('#so-w', el).value.trim(), sections};
        if (isCustom) {
          S.hoCustom = S.hoCustom || []; patch.cat = $('#so-c', el).value; patch.freq = $('#so-f', el).value;
          const ex = S.hoCustom.find(x => x.id === base.id); ex ? Object.assign(ex, patch) : S.hoCustom.push(Object.assign({id: base.id}, patch));
        } else { S.hoEdit = S.hoEdit || {}; S.hoEdit[id] = patch; }
        save(); closeSheet(); HO.open = base.id; render(); toast('저장했어요');
      };
      const del = $('#so-del', el);
      if (del) del.onclick = () => {
        if (!del.dataset.armed) { del.dataset.armed = 1; del.textContent = '한 번 더 누르면 ' + (base.custom ? '삭제' : '원래대로'); return; }
        if (base.custom) { S.hoCustom = (S.hoCustom || []).filter(x => x.id !== id); HO.open = null; } else delete S.hoEdit[id];
        save(); closeSheet(); render(); toast(base.custom ? '삭제했어요' : '원래 절차로 되돌렸어요');
      };
    }});
}
function fullPath(p) { const r = (S.settings.nasRoot || '').replace(/\\+$/, ''); return r ? r + '\\' + p : '공용서버\\' + p; }

VIEWS.handover = v => {
  const st = hoState();
  if (HO.open) { const s = sopById(HO.open); if (s) return hoDetail(v, s); HO.open = null; }
  const all = sops(), ms = monthSops();
  const list = all.filter(s => HO.cat === 'all' || s.cat === HO.cat);
  const okN = all.filter(s => st.status[s.id] === 'ok').length, lrN = all.filter(s => st.status[s.id] === 'learn').length;
  const qN = Object.values(st.notes).filter(x => x && x.trim()).length;
  const t = today(), daily = all.filter(s => s.freq === 'daily');
  const mDone = ms.filter(s => { const r = hoRun(s); return r.total && r.done === r.total; }).length;
  v.innerHTML = `
  <div class="page-head"><div><h1>업무</h1><p>인계 문서·인수인계 확인표를 업무별 절차로 정리했어요. 단계마다 체크하며 실행하고, 모르는 건 질문 메모에 적어 두세요. 절차는 직접 고칠 수 있어요.</p></div>
    <div class="row"><button class="btn" id="ho-q">${icon('copy')}질문 목록 복사 (${qN})</button><button class="btn primary" id="ho-add">${icon('plus')}새 절차</button></div></div>
  <div class="seg" role="group" aria-label="보기">${[['month',`이번 달 할 일 ${mDone}/${ms.length}`],['all',`전체 절차 ${all.length}`]].map(([k,n]) => `<button aria-pressed="${HO.tab===k}" data-tab="${k}">${n}</button>`).join('')}</div>
  ${HO.tab === 'month' ? `
  ${daily.length ? `<div class="eyebrow">매일</div><div class="apps" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${daily.map(s => sopCard(s, st)).join('')}</div>` : ''}
  <div class="eyebrow">${t.getMonth()+1}월에 할 일 · 매월 업무 + 이번 달 마감이 걸린 업무 + 진행 중인 건</div>
  ${ms.length ? `<div class="apps" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${ms.map(s => sopCard(s, st)).join('')}</div>` : '<div class="empty">이번 달에 걸린 업무가 없어요</div>'}
  <div class="note small">마감 날짜는 <a href="#calendar">캘린더</a> 규칙에서 옵니다. 규칙 편집에서 "연결 절차"를 고르면 여기에 나타나요.</div>` : `
  <section class="panel today-strip">
    <div class="datebox"><div class="d num">${okN}<span style="font-size:20px;color:var(--ink-3)">/${all.length}</span></div><div class="m">혼자 가능</div></div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <div class="prog" style="height:10px"><i style="width:${all.length?okN/all.length*100:0}%;background:var(--ok)"></i></div>
      <div class="row small"><span class="chip ok">혼자 가능 ${okN}</span><span class="chip warn">실습 중 ${lrN}</span><span class="chip">미숙지 ${all.length-okN-lrN}</span><span class="faint">목표: 인수 후 1주 안에 전부 "혼자 가능"</span></div>
    </div>
  </section>
  <div class="seg" role="group">${[['all','전체'], ...Object.entries(HO_CATS).map(([k,c]) => [k, c.name])].map(([k,n]) => `<button aria-pressed="${HO.cat===k}" data-hc="${k}">${n} <span class="faint small">${k==='all'?all.length:all.filter(s=>s.cat===k).length}</span></button>`).join('')}</div>
  <div class="apps" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${list.map(s => sopCard(s, st)).join('')}</div>`}
  <div class="note small">비밀번호·아이디·계좌번호는 여기 넣지 않았어요. 공개 사이트라서 문서철이나 비밀번호 관리 앱에 따로 보관하세요. 공용서버 주소는 <a href="#settings">설정</a>에서 이 기기에만 저장할 수 있어요.</div>`;
  $$('[data-tab]', v).forEach(b => b.onclick = () => { HO.tab = b.dataset.tab; render(); });
  $$('[data-hc]', v).forEach(b => b.onclick = () => { HO.cat = b.dataset.hc; render(); });
  $$('[data-open]', v).forEach(b => b.onclick = () => { HO.open = b.dataset.open; render(); window.scrollTo(0, 0); });
  $('#ho-add', v).onclick = () => editSop(null);
  $('#ho-q', v).onclick = () => {
    const qs = all.filter(s => st.notes[s.id]?.trim()).map(s => `■ ${s.title}\n${st.notes[s.id].trim().split('\n').map(l => '  - ' + l.replace(/^[-•]\s*/, '')).join('\n')}`);
    if (!qs.length) { toast('아직 적은 질문이 없어요. 업무를 열어 질문 메모에 적어 주세요'); return; }
    copyText(`[인수인계 질문 목록] ${ymd(today())}\n\n` + qs.join('\n\n'), `질문 ${qs.length}개 업무를 복사했어요`);
  };
};

function hoDetail(v, s) {
  const st = hoState(), r = hoRun(s), cur = st.status[s.id] || 'new';
  const linked = S.rules.filter(x => !x.off && (sopOfRule(x) || {}).id === s.id);
  const cat = HO_CATS[s.cat] || HO_CATS.gen;
  const nextOf = rule => occurrences(today(), addDays(today(), 400)).find(o => o.rule.id === rule.id);
  v.innerHTML = `
  <div class="row"><button class="btn ghost sm" id="ho-back">${icon('left')}업무 목록</button><span class="grow"></span><button class="btn ghost sm" id="ho-edit">${icon('edit')}절차 편집</button></div>
  <div class="page-head"><div><div class="eyebrow">${cat.name} · ${HO_FREQ[s.freq]}${s.custom?' · 내 절차':s.edited?' · 수정함':''}</div><h1>${esc(s.title)}</h1><p>${esc(s.when)} · 인수: ${esc(HO_OWNER[s.id] || '본인')}</p></div>
    <div class="seg" role="group" aria-label="숙지 상태">${Object.entries(HO_ST).map(([k,o]) => `<button aria-pressed="${cur===k}" data-st="${k}">${o.t}</button>`).join('')}</div></div>
  <div class="ho-layout">
    <section class="panel">
      <div class="panel-h"><div><h2>실행 체크리스트</h2><div class="faint small">${esc(hoPeriod(s))} · ${r.done}/${r.total} 단계</div></div>
        <div class="row" style="gap:4px">${s.freq==='adhoc'?'<button class="btn ghost sm" id="ho-new">새 건 시작</button>':''}<button class="btn ghost sm" id="ho-reset">체크 초기화</button></div></div>
      <div style="padding:10px 16px 0"><div class="prog"><i style="width:${r.total?r.done/r.total*100:0}%"></i></div></div>
      ${s.sections.map((sec, si) => `
        <div style="padding:14px 16px 4px"><b>${esc(sec.h)}</b></div>
        <ul class="steps">${sec.steps.map((t, i) => { const k = `${si}.${i}`, on = !!r.arr[k];
          return `<li class="${on?'on':''}"><button class="check" aria-pressed="${on}" data-k="${k}" aria-label="${esc(t)}">${on?icon('check'):''}</button><span class="tx">${esc(t)}</span></li>`; }).join('')}</ul>
        ${(sec.warn||[]).map(w => `<div class="note warn small" style="margin:6px 16px">주의 · ${esc(w)}</div>`).join('')}`).join('')}
      <div style="height:12px"></div>
    </section>
    <div style="display:flex;flex-direction:column;gap:16px">
      <section class="panel"><div class="panel-h"><h3>질문 메모</h3><span class="faint small" id="ho-saved"></span></div>
        <div class="panel-b"><textarea class="inp" id="ho-note" rows="6" placeholder="전임자에게 물어볼 것, 실제로 해 보니 다른 점을 적어 두세요">${esc(st.notes[s.id] || '')}</textarea></div></section>
      ${(s.systems||[]).length?`<section class="panel"><div class="panel-h"><h3>사용 시스템</h3></div><div class="panel-b row" style="gap:6px">${s.systems.map(k => `<span class="chip">${esc(SYS[k] || k)}</span>`).join('')}</div></section>`:''}
      ${(s.paths||[]).length ? `<section class="panel"><div class="panel-h"><h3>파일 위치</h3><span class="faint small">누르면 복사</span></div>
        <div class="panel-b" style="display:flex;flex-direction:column;gap:10px">${s.paths.map(([l, p]) => `<div><div class="small muted">${esc(l)}</div><span class="mono small copyc" data-cp="${esc(fullPath(p))}" style="word-break:break-all">${esc(fullPath(p))}</span></div>`).join('')}</div></section>` : ''}
      ${linked.length ? `<section class="panel"><div class="panel-h"><h3>관련 마감</h3><a class="btn ghost sm" href="#calendar">캘린더</a></div>
        <ul class="dl">${linked.map(rule => { const o = nextOf(rule); return o ? deadlineItem(o, false) : ''; }).join('')}</ul></section>` : ''}
    </div>
  </div>`;
  $('#ho-back', v).onclick = () => { HO.open = null; render(); };
  $('#ho-edit', v).onclick = () => editSop(s.id);
  $$('[data-st]', v).forEach(b => b.onclick = () => { st.status[s.id] = b.dataset.st; save(); render(); toast(`"${HO_ST[b.dataset.st].t}"로 표시했어요`); });
  v.addEventListener('click', e => {
    const c = e.target.closest('[data-k]');
    if (c) { const arr = st.checks[r.key] = Object.assign({}, st.checks[r.key]); arr[c.dataset.k] = !arr[c.dataset.k]; if (arr[c.dataset.k]) { st.log = st.log || {}; const d = ymd(today()); st.log[d] = [...new Set([...(st.log[d] || []), s.title])]; } save(); render(); return; }
    const cp = e.target.closest('[data-cp]'); if (cp) { copyText(cp.dataset.cp, '경로를 복사했어요'); return; }
    const d = e.target.closest('[data-done]'); if (d) { toggleDone(d.dataset.done); render(); }
  });
  let tm; $('#ho-note', v).oninput = e => { clearTimeout(tm); tm = setTimeout(() => { st.notes[s.id] = e.target.value; save(); const x = $('#ho-saved'); if (x) x.textContent = '저장됨'; }, 400); };
  const rs = $('#ho-reset', v); rs.onclick = () => { if (rs.dataset.armed) { delete st.checks[r.key]; save(); render(); } else { rs.dataset.armed = 1; rs.textContent = '한 번 더'; } };
  const nw = $('#ho-new', v); if (nw) nw.onclick = () => { const n = (parseInt(hoPeriod(s)) || 1) + 1; st.checks[s.id + ':cur'] = n + '건'; save(); render(); toast(`${n}번째 건을 시작했어요`); };
}

/* 오늘 화면용: 매일 업무 */
function hoDailyPanel() {
  const daily = sops().filter(s => s.freq === 'daily');
  if (!daily.length) return '';
  return `<section class="panel"><div class="panel-h"><h2>매일 업무</h2><a class="btn ghost sm" href="#handover">업무</a></div>
    <ul class="dl">${daily.map(s => { const r = hoRun(s), done = r.done === r.total;
      return `<li class="${done?'done':''}"><div class="when"><b>오늘</b><span class="faint">${DOW[today().getDay()]}</span></div><div><div class="t">${esc(s.title)}</div><div class="s">${esc(s.when)} · ${r.done}/${r.total} 단계</div></div>${s.id==='worklog'?`<button class="btn sm" data-wl="1">작성</button>`:`<button class="btn sm" data-hoopen="${s.id}">${done?'완료':'열기'}</button>`}</li>`; }).join('')}</ul></section>`;
}
document.addEventListener('click', e => { const b = e.target.closest('[data-hoopen]'); if (b) { e.preventDefault(); HO.open = b.dataset.hoopen; closeSheet(); go('handover'); } });

document.addEventListener('click', e => { if (e.target.closest('[data-wl]')) { D.type = 'worklog'; if (D.f.worklog) D.f.worklog.content = ''; go('docs'); } });
