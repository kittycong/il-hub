/* ================= 개선: 빠른 검색 · 주간 보고 · 앱 점검 · 매핑 기억 · 오프라인 ================= */

/* ---------- 1. 빠른 검색 (Ctrl+K) ---------- */
function searchIndex() {
  const out = [];
  ROUTES.filter(r => !['routine','tools','embed'].includes(r.id)).forEach(r => out.push({k:'화면', t:r.label, go:() => go(r.id)}));
  S.apps.forEach(a => out.push({k:'앱', t:a.name, s:a.desc, go:() => { if (a.url && a.embed !== false) location.hash = 'embed/' + a.id; else if (a.url) window.open(a.url, '_blank', 'noopener'); else go('apps'); }}));
  S.rules.forEach(r => out.push({k:'마감', t:r.title, s:ruleText(r), go:() => { go('calendar'); setTimeout(() => editRule(r.id), 60); }}));
  S.staff.forEach(p => out.push({k:'직원', t:p.name, s:`${p.dept} ${p.pos}`, go:() => { D.type = 'emp'; D.staffIds = [p.id]; go('docs'); }}));
  Object.entries(DOCT).forEach(([k, o]) => out.push({k:'문서', t:o.name, go:() => { D.type = k; go('docs'); }}));
  Object.values(MODES).forEach((m, i) => out.push({k:'진우 연결', t:m.title, go:() => { B.mode = Object.keys(MODES)[i]; go('bridge'); }}));
  sops().forEach(s => { out.push({k:'업무', t:s.title, s:s.when, go:() => { HO.open = s.id; go('handover'); }}); s.sections.forEach(sec => sec.steps.forEach(t => out.push({k:'절차', t, s:s.title, go:() => { HO.open = s.id; go('handover'); }}))); });
  (S.budget?.funds || []).forEach(f => out.push({k:'예산', t:f.name, s:f.owner || '재원', go:() => { BG.fund = f.id; BG.tab = 'acct'; go('budget'); }}));
  [...new Set((S.budget?.lines || []).map(l => l.proj).filter(Boolean))].forEach(p => out.push({k:'사업', t:p, s:'사업별 사용액', go:() => { BG.tab = 'proj'; go('budget'); }}));
  out.push({k:'기능', t:'인수인계 질문 목록', go:() => { HO.open = null; go('handover'); }});
  out.push({k:'기능', t:'주간 업무 보고 만들기', go:weeklyReport});
  out.push({k:'기능', t:'NAS 캘린더용 .ics 내보내기', go:exportIcs});
  return out;
}
function openSearch() {
  const idx = searchIndex(); let sel = 0, hits = [];
  sheet({title:'빠른 검색', body:`<input class="inp" id="q" placeholder="앱·마감·업무·직원·문서 이름 (예: 급여, 휴가, 재직)" autocomplete="off"><div id="qr" style="display:flex;flex-direction:column;max-height:50vh;overflow:auto;margin:0 -16px"></div><div class="faint small">↑↓ 이동 · Enter 열기 · Esc 닫기</div>`,
    onMount: el => {
      const q = $('#q', el), qr = $('#qr', el);
      const draw = () => {
        const w = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        hits = (w.length ? idx.filter(x => w.every(t => (x.t + ' ' + (x.s||'') + ' ' + x.k).toLowerCase().includes(t))) : idx.filter(x => x.k === '화면' || x.k === '앱' || x.k === '기능')).slice(0, 40);
        sel = Math.min(sel, Math.max(0, hits.length - 1));
        qr.innerHTML = hits.length ? hits.map((x, i) => `<button class="qi" data-i="${i}" style="display:flex;gap:10px;align-items:center;text-align:left;border:0;background:${i===sel?'var(--accent-soft)':'transparent'};padding:9px 16px;cursor:pointer;width:100%"><span class="chip" style="min-width:64px;justify-content:center">${esc(x.k)}</span><span style="min-width:0"><b>${esc(x.t)}</b>${x.s?`<span class="faint small"> · ${esc(x.s)}</span>`:''}</span></button>`).join('') : '<div class="empty">찾는 항목이 없어요</div>';
      };
      const pick = i => { const x = hits[i]; if (!x) return; closeSheet(); x.go(); };
      q.oninput = () => { sel = 0; draw(); };
      q.onkeydown = e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, hits.length - 1); draw(); $(`[data-i="${sel}"]`, qr)?.scrollIntoView({block:'nearest'}); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); draw(); $(`[data-i="${sel}"]`, qr)?.scrollIntoView({block:'nearest'}); }
        else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
      };
      qr.onclick = e => { const b = e.target.closest('[data-i]'); if (b) pick(Number(b.dataset.i)); };
      draw();
    }});
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
  else if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') && !$('.sheet')) { e.preventDefault(); openSearch(); }
});

/* ---------- 2. 주간 업무 보고 자동 작성 ---------- */
function weekRange(d = today()) { const mon = addDays(d, -((d.getDay() + 6) % 7)); return [mon, addDays(mon, 6)]; }
function weeklyReport() {
  const [mon, sun] = weekRange(), [nMon, nSun] = [addDays(mon, 7), addDays(sun, 7)];
  const f = d => `${d.getMonth()+1}/${d.getDate()}(${DOW[d.getDay()]})`;
  const occ = occurrences(mon, sun), next = occurrences(nMon, nSun);
  const done = occ.filter(o => o.done), open = occ.filter(o => !o.done);
  const lv = leaveEvents(mon, nSun);
  const me = S.staff[0] || {};
  const lines = [
    `[주간 업무 보고] ${mon.getFullYear()}.${mon.getMonth()+1}.${mon.getDate()} ~ ${sun.getMonth()+1}.${sun.getDate()}  ${me.dept||''} ${me.pos||''} ${me.name||''}`.trim(),
    '', '■ 이번 주 완료',
    ...(done.length ? done.map(o => `  - ${f(o.date)} ${o.rule.title}`) : ['  - (완료 표시한 마감 없음)']),
    '', '■ 이번 주 미완료 · 진행 중',
    ...(open.length ? open.map(o => `  - ${f(o.date)} ${o.rule.title}${o.date < today() ? ' (기한 지남)' : ''}`) : ['  - 없음']),
    '', '■ 이번 달 업무 진행',
    ...monthSops().map(s => { const r = hoRun(s); return `  - ${s.title} ${r.done}/${r.total}${r.total && r.done === r.total ? ' 완료' : ''}`; }),
    '', '■ 다음 주 예정',
    ...(next.length ? next.map(o => `  - ${f(o.date)} ${o.rule.title}`) : ['  - 없음']),
    ...(lv.length ? ['', '■ 휴가 (연동)', ...lv.map(e => `  - ${f(e.date)} ${e.title}`)] : []),
  ];
  const txt = lines.join('\n');
  sheet({title:'주간 업무 보고', wide:true, body:`<div class="note small">캘린더의 완료 표시와 업무 체크로 자동 작성했어요. 필요한 부분만 고쳐서 복사하세요.</div><textarea class="inp mono" id="wr" rows="18">${esc(txt)}</textarea>`,
    foot:`<button class="btn" data-close>닫기</button><button class="btn primary" id="wr-c">${icon('copy')}복사</button>`,
    onMount: el => { $('#wr-c', el).onclick = () => copyText($('#wr', el).value, '주간 보고를 복사했어요'); }});
}

/* ---------- 3. 앱 연결 상태 자동 점검 ---------- */
const HEALTH = {};
async function checkApps() {
  if (ENV === 'artifact') return;
  await Promise.all(S.apps.filter(a => a.url).map(async a => {
    try {
      const u = new URL(a.url, location.href), same = u.origin === location.origin;
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(u.href, same ? {cache:'no-store', signal:ctl.signal} : {mode:'no-cors', cache:'no-store', signal:ctl.signal});
      clearTimeout(tm);
      HEALTH[a.id] = same ? (r.ok ? 'ok' : 'down') : 'ok';
    } catch (e) { HEALTH[a.id] = 'down'; }
  }));
}

/* ---------- 4. 휴가 데이터 기준일 경고 ---------- */
function hugaStaleDays() {
  const u = CONN.huga.data?.updatedAt; if (!u) return 0;
  const d = new Date(u.replace(' ', 'T')); if (isNaN(d)) return 0;
  return Math.floor((today() - d) / 864e5);
}

/* ---------- 5. 진우 연결: 열 지정 기억 ---------- */
function mapSig(slot) { const f = B.files[slot]; return f ? B.mode + ':' + (f.rows[f.hdr] || []).map(String).join('|') : ''; }
function rememberMap(slot) { const sig = mapSig(slot); if (!sig) return; S.mapPresets = S.mapPresets || {}; S.mapPresets[sig] = B.map[slot]; save(); }
function recallMap(slot) { const p = (S.mapPresets || {})[mapSig(slot)]; if (p) B.map[slot] = clone(p); return !!p; }

/* ---------- 6. 오프라인·홈 화면 앱 (GitHub 배포판) ---------- */
if (ENV === 'web' && location.protocol === 'https:' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
