/* ================= 앱 화면을 허브 안에 띄우기 (iframe) =================
   - 앱 화면은 #embed-host 안에 한 번 만든 뒤 계속 살려 둠 → 다른 메뉴 갔다 와도 입력 중이던 내용 유지
   - 같은 주소(kittycong.github.io) 앱은 저장 데이터도 원래 앱과 같음. 다른 주소(vercel 등)는 브라우저 정책상 따로 저장될 수 있음 */
const EMB = {frames: {}, cur: ''};
const embApps = () => S.apps.filter(a => a.url && a.embed !== false);
const sameSite = url => { try { return new URL(url).hostname === location.hostname; } catch (e) { return false; } };
function embedId() { const p = location.hash.slice(1).split('/'); return p[0] === 'embed' ? decodeURIComponent(p[1] || '') : ''; }
function sizeEmbed() {
  const h = $('#embed-host'); if (!h || h.hidden) return;
  const tab = $('#nav-tab'), tabH = tab && getComputedStyle(tab).display !== 'none' ? tab.offsetHeight : 0;
  h.style.height = Math.max(320, window.innerHeight - h.getBoundingClientRect().top - tabH - 6) + 'px';
}
window.addEventListener('resize', sizeEmbed);
VIEWS.embed = v => {
  const list = embApps();
  let id = embedId(); if (!list.some(a => a.id === id)) { try { id = localStorage.getItem('il-hub-emb') || ''; } catch (e) {} }
  if (!list.some(a => a.id === id)) id = (list[0] || {}).id;
  const a = list.find(x => x.id === id);
  if (!a) { v.innerHTML = `<div class="empty">허브 안에 띄울 웹앱이 없어요. <a href="#apps">앱</a>에서 주소를 넣어 주세요.</div>`; return; }
  if (embedId() !== id) history.replaceState(null, '', '#embed/' + id);
  try { localStorage.setItem('il-hub-emb', id); } catch (e) {}
  EMB.cur = id;
  v.innerHTML = `
  <div class="emb-bar">
    <div class="emb-chips" role="tablist" aria-label="앱 화면">${list.map(x => `<a role="tab" href="#embed/${x.id}" aria-selected="${x.id === id}" class="emb-chip">${esc(x.name)}</a>`).join('')}</div>
    <div class="row" style="gap:4px;flex:0 0 auto">
      <button class="btn ghost sm" id="emb-re" title="새로고침">새로고침</button>
      <a class="btn ghost sm" href="${esc(a.url)}" target="_blank" rel="noopener" title="새 탭으로 열기">${icon('ext')}새 탭</a>
      <button class="btn ghost sm" id="emb-full" title="크게 보기">크게</button>
    </div>
  </div>
  <div class="emb-note small" id="emb-note">${ENV === 'artifact' ? 'Claude 아티팩트 안에서는 다른 사이트 화면이 막힐 수 있어요. GitHub 배포본에서 써 주세요 · ' : ''}${sameSite(a.url) ? '같은 주소 앱이라 여기서 저장한 내용이 원래 앱과 똑같이 보여요' : '<b>다른 주소 앱</b>이라 브라우저에 따라 허브 안 저장과 따로 연 앱 저장이 나뉠 수 있어요'} · 화면이 안 뜨면 <a href="${esc(a.url)}" target="_blank" rel="noopener">새 탭으로 열기</a></div>`;
  const host = $('#embed-host');
  Object.entries(EMB.frames).forEach(([k, f]) => { if (!S.apps.some(x => x.id === k && x.url)) { f.remove(); delete EMB.frames[k]; } });
  let f = EMB.frames[id];
  if (f && f.dataset.src !== a.url) { f.remove(); f = null; }
  if (!f) {
    f = document.createElement('iframe'); f.src = a.url; f.dataset.src = a.url; f.title = a.name; f.loading = 'eager';
    f.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen; camera');
    f.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    const t0 = Date.now(); f.dataset.ok = '';
    f.onload = () => { f.dataset.ok = '1'; f.dataset.ms = Date.now() - t0; };
    host.appendChild(f); EMB.frames[id] = f;
    setTimeout(() => { if (!f.dataset.ok && EMB.cur === id) { const n = $('#emb-note'); if (n) { n.classList.add('warn'); n.innerHTML = `화면을 불러오는 데 오래 걸리거나 이 앱이 다른 사이트 안에 뜨는 걸 막고 있어요. <a href="${esc(a.url)}" target="_blank" rel="noopener"><b>새 탭으로 열기</b></a>`; } } }, 9000);
  }
  Object.values(EMB.frames).forEach(x => x.hidden = x !== f);
  $('#emb-re', v).onclick = () => { f.dataset.ok = ''; f.src = a.url; toast('다시 불러와요'); };
  $('#emb-full', v).onclick = () => { const h = $('#embed-host'); (h.requestFullscreen ? h.requestFullscreen() : Promise.reject()).catch(() => window.open(a.url, '_blank', 'noopener')); };
  const sel = $('.emb-chip[aria-selected="true"]', v); if (sel) sel.scrollIntoView({block: 'nearest', inline: 'center'});
  requestAnimationFrame(sizeEmbed);
};
