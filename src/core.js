/* ================= core ================= */
const ENV = window.HUB_ENV || 'web';           // 'artifact' | 'web'
const CAN_FILE = ENV !== 'artifact';            // print & download only outside the artifact frame
const KEY = 'il-hub-v1';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const today = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const won = n => (Math.round(Number(n)||0)).toLocaleString('ko-KR');
const DOW = ['일','월','화','수','목','금','토'];
const clone = o => JSON.parse(JSON.stringify(o));

const ICON = {
  home:'<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  cal:'<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  list:'<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>',
  bridge:'<path d="M4 7h10l-3-3M20 17H10l3 3"/><rect x="2.5" y="10" width="7" height="4" rx="1"/><rect x="14.5" y="10" width="7" height="4" rx="1"/>',
  doc:'<path d="M6 2.5h8l5 5V21a.5.5 0 0 1-.5.5h-12A.5.5 0 0 1 6 21z"/><path d="M14 2.5v5h5M9 12h7M9 16h7"/>',
  apps:'<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  hand:'<path d="M4 7h9a3 3 0 0 1 0 6H9"/><path d="m7 10-3-3 3-3"/><path d="M20 17h-9a3 3 0 0 1 0-6"/><path d="m17 20 3-3-3-3"/>',
  won:'<path d="M4 7l3 11 5-11 5 11 3-11M3 11h18M3 14h18"/>',
  check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  left:'<path d="m15 5-7 7 7 7"/>', right:'<path d="m9 5 7 7-7 7"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  down:'<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>',
  print:'<path d="M7 9V3h10v6M7 17H4v-7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v7h-3"/><rect x="7" y="14" width="10" height="7"/>',
  ext:'<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
};
const icon = (k, cls='') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

/* ---------- storage ---------- */
let S;
function load() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  const def = defaults();
  if (!saved) return def;
  // merge shallowly so new default keys appear after updates
  for (const k of Object.keys(def)) if (saved[k] === undefined) saved[k] = def[k];
  saved.settings = Object.assign({}, def.settings, saved.settings);
  saved.settings.org = Object.assign({}, def.settings.org, saved.settings.org);
  if ((saved.v || 1) < 2) { // v2: 실제 저장소 목록으로 앱 교체, 직접 추가한 앱은 유지
    const mine = (saved.apps || []).filter(a => !/^a\d$/.test(a.id));
    saved.apps = [...def.apps, ...mine]; saved.v = 2;
  }
  if (saved.v < 3) { // v3: 확인된 실제 주소 반영 (기본 앱만 갱신, 직접 추가한 앱 유지)
    const byId = Object.fromEntries(def.apps.map(a => [a.id, a]));
    saved.apps = saved.apps.map(a => byId[a.id] ? {...a, url: byId[a.id].url || a.url, st: byId[a.id].st, desc: byId[a.id].desc} : a);
    saved.v = 3;
  }
  if (saved.v < 4) { // v4: 인수인계 문서에서 나온 마감 추가, 급여 루틴을 실제 절차로
    const have = new Set(saved.rules.map(r => r.id));
    saved.rules.push(...def.rules.filter(r => !have.has(r.id)));
    const rt2 = saved.routines.find(r => r.id === 'rt2'), d2 = def.routines.find(r => r.id === 'rt2');
    if (rt2 && rt2.steps.length === 6 && rt2.steps[0].t === '근태·연차·입퇴사 변동 반영') rt2.steps = d2.steps;
    saved.v = 4;
  }
  if (saved.v < 5) { const have = new Set(saved.rules.map(r => r.id)); saved.rules.push(...def.rules.filter(r => !have.has(r.id))); saved.v = 5; }
  if (saved.v < 6) {
    const have = new Set(saved.rules.map(r => r.id)); saved.rules.push(...def.rules.filter(r => !have.has(r.id)));
    const map = {rt1:'monthclose', rt2:'pay', rt3:'monthclose', rt4:'budget', rt5:'budget'};
    saved.rules.forEach(r => { if (r.routine && !r.sop) r.sop = map[r.routine] || ''; if (r.id === 'y1' && r.routine === 'rt4') r.sop = 'yearend'; delete r.routine; if (VERIFY_IDS.includes(r.id) && !r.verified) r.verify = true; });
    // 직접 만든 루틴은 "내 절차"로 옮김
    const own = (saved.routines || []).filter(r => !map[r.id] && r.steps && r.steps.length);
    saved.hoCustom = saved.hoCustom || [];
    own.forEach(r => saved.hoCustom.push({id:'c' + r.id, cat:'gen', freq: HO_FREQ[r.freq] ? r.freq : 'adhoc', title:r.name, when:r.when || '', sections:[{h:'단계', steps:r.steps.map(x => x.t), warn:[]}]}));
    saved.v = 6;
  }
  return saved;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

/* ---------- ui helpers ---------- */
let toastT;
function toast(msg) {
  let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role','status'); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2400);
}
async function copyText(txt, label = '복사했어요') {
  try { await navigator.clipboard.writeText(txt); toast(label); return true; }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove(); toast(ok ? label : '복사가 막혀 있어요. 직접 선택해 복사해 주세요'); return ok;
  }
}
function download(name, data, mime = 'application/octet-stream') {
  if (!CAN_FILE) { toast('다운로드는 GitHub 배포본에서 돼요. 여기서는 복사 버튼을 써 주세요'); return; }
  const blob = data instanceof Blob ? data : new Blob([data], {type: mime});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function sheet({title, body, foot, onMount, wide}) {
  const L = $('#layer');
  L.innerHTML = `<div class="sheet-back" data-close><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}" ${wide?'style="width:min(820px,100%)"':''}>
    <div class="panel-h"><h3>${esc(title)}</h3><button class="btn ghost sm" data-close aria-label="닫기">닫기</button></div>
    <div class="panel-b">${body}</div>${foot ? `<div class="sheet-foot">${foot}</div>` : ''}</div></div>`;
  const back = $('.sheet-back', L);
  back.addEventListener('click', e => { if (e.target === back || e.target.closest('button[data-close]')) closeSheet(); });
  onMount && onMount($('.sheet', L));
  const first = $('.sheet input,.sheet select,.sheet textarea', L); first && first.focus();
}
function closeSheet() { $('#layer').innerHTML = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

/* ---------- router ---------- */
const ROUTES = [
  {id:'home', label:'오늘', icon:'home'},
  {id:'calendar', label:'캘린더', icon:'cal'},
  {id:'handover', label:'업무', icon:'list'},
  {id:'tools', label:'도구', icon:'bridge'},
  {id:'bridge', label:'진우 연결', icon:'bridge', hidden:true},
  {id:'docs', label:'문서', icon:'doc', hidden:true},
  {id:'routine', label:'업무', icon:'list', hidden:true},
  {id:'budget', label:'예산', icon:'won'},
  {id:'apps', label:'앱', icon:'apps'},
  {id:'embed', label:'앱 화면', icon:'apps', hidden:true},
  {id:'settings', label:'설정·백업', icon:'gear', sideOnly:true},
];
const VIEWS = {};
VIEWS.tools = v => { let t = 'bridge'; try { t = localStorage.getItem('il-hub-tool') || 'bridge'; } catch (e) {} location.replace('#' + (TOOL_IDS.includes(t) ? t : 'bridge')); };
function go(id) { if (location.hash.slice(1) !== id) location.hash = id; else render(); }
function current() { const h = location.hash.slice(1).split('/')[0]; return ROUTES.some(r => r.id === h) ? h : 'home'; }
const TOOL_IDS = ['bridge', 'docs'];
function navOn(r, cur) { return r.id === cur || (r.id === 'tools' && TOOL_IDS.includes(cur)) || (r.id === 'handover' && cur === 'routine') || (r.id === 'apps' && cur === 'embed'); }
function renderNav() {
  const cur = current(), od = overdueCount();
  const eid = cur === 'embed' ? (typeof EMB !== 'undefined' ? embedId() || EMB.cur : '') : '';
  $('#nav-side').innerHTML = ROUTES.filter(r=>!r.hidden).map(r => `<a href="#${r.id}" ${navOn(r,cur)?'aria-current="page"':''}>${icon(r.icon)}<span>${r.label}</span>${r.id==='home'&&od?`<span class="badge">${od}</span>`:''}</a>`
    + (r.id === 'apps' && typeof embApps === 'function' ? `<div class="nav-sub">${embApps().map(a => `<a href="#embed/${a.id}" ${eid===a.id?'aria-current="page"':''}>${esc(a.name)}</a>`).join('')}</div>` : '')).join('');
  $('#nav-tab').innerHTML = ROUTES.filter(r=>!r.sideOnly&&!r.hidden).map(r => `<a href="#${r.id}" ${navOn(r,cur)?'aria-current="page"':''}>${icon(r.icon)}<span>${r.label}</span>${r.id==='home'&&od?'<i class="dot"></i>':''}</a>`).join('');
  $('#side-foot').innerHTML = `${ENV==='artifact'?'Claude 아티팩트판':'웹 배포판'} · 데이터는 이 기기 브라우저에 저장<br><a href="#settings">백업하기</a>`;
}
function render() {
  const cur = current();
  renderNav();
  const old = $('#view'), v = old.cloneNode(false); old.replaceWith(v); // fresh node → no stacked listeners
  v.dataset.view = cur;
  if (TOOL_IDS.includes(cur)) { try { localStorage.setItem('il-hub-tool', cur); } catch (e) {} }
  const eh = $('#embed-host'); if (eh) eh.hidden = cur !== 'embed';
  document.querySelector('.main').classList.toggle('embedding', cur === 'embed');
  VIEWS[cur](v);
  if (TOOL_IDS.includes(cur)) v.insertAdjacentHTML('afterbegin', `<div class="seg tool-seg" role="group" aria-label="도구">${[['bridge','진우 연결'],['docs','문서 작성']].map(([k,n]) => `<a href="#${k}" aria-pressed="${cur===k}" class="segl">${n}</a>`).join('')}</div>`);
  if (render.last !== cur) window.scrollTo(0, 0);
  render.last = cur;
}
window.addEventListener('hashchange', render);
