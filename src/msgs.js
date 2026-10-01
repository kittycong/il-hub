/* ================= 문구함 (거래처·기관에 보내는 메시지 문구 저장) =================
   - 문자/카카오톡/이메일/공문/전화 멘트 문구를 수신처별·분류별로 저장해 두고 한 번에 복사해요.
   - 문구 안에 {수신처} {담당자} {날짜} {기한} {금액} 처럼 중괄호를 쓰면, 복사할 때 빈칸을 채우는 창이 떠요.
   - 내용은 S.msgs에 저장돼 자동 연동(로그인)에 포함되고, 공개 사이트 파일에는 들어가지 않아요. */
const MSG_CH = ['문자·카톡', '이메일', '공문', '전화 멘트'];
const MSG_SEED = [
  {ch: '공문', title: '분기 보조금 신청 공문 (정산·실적 + 교부신청)', org: '', subject: '{연도}년 {이전분기}분기 장애인자립생활지원센터 운영실적, {분기}분기 보조금 신청 관련 자료 제출', body: '1. 관련: {구청} 장애인복지과-{문서번호} ({공문일자})\n2. {연도}년 {이전분기}분기 운영실적 및 {분기}분기 보조금 신청 자료를 아래와 같이 제출합니다.\n\n붙임 1. {분기}분기 보조금 교부신청서 1부\n     2. {이전분기}분기 정산 및 실적보고서(한글) 1부\n     3. {이전분기}분기 정산 및 실적보고서(엑셀) 1부.  끝.'},
  {ch: '이메일', title: '추경 예산서 제출 + 사업 전담인력 변경 안내', org: '', subject: '[{센터}] {연도}년 {차수}차 추경 예산서 제출 및 사업 전담인력 변경 안내의 건', body: '{호칭}, 안녕하십니까.\n{센터} {내이름} 간사입니다.\n항상 센터 사업 운영과 발전을 위해 애써주심에 깊이 감사드립니다.\n\n1. {연도}년 {차수}차 추경 예산서 제출\n{연도}년 {차수}차 추가경정예산서 제출과 관련하여 공문 및 관련 서류를 첨부하여 보내드립니다. (첨부파일 확인 부탁드립니다.)\n\n2. {사업명} 사업 전담인력 변경 안내\n기존 {전임자} 담당자의 퇴사로 인하여, {변경일자} 자로 {사업명} 사업 전담인력이 변경되어 함께 안내해 드립니다.\n\n* 변경일자: {변경일자} 자\n* 주요내용: {전임자} 담당자 퇴사에 따른 {사업명} 사업 전담인력 변경\n\n제출해 드린 서류와 관련하여 문의 사항이나 추가로 필요한 서류가 있으시면 언제든 연락해주시기 바랍니다.\n감사합니다.\n{센터} {내이름} 드림'},
  {ch: '이메일', title: '후원업무 담당자 변경 + 입금 내역 확인 요청', org: '', body: '안녕하세요, 선생님.\n{센터} {내이름} 사회복지사입니다.\n\n그동안 후원업무를 함께해 주시고 늘 꼼꼼하게 챙겨 주셔서 진심으로 감사했습니다.\n\n{날짜}자로 후원업무 담당자가 변경되어, 담당자 연락처와 업무 메일 주소를 안내드립니다.\n\n- 후원업무 담당: {새담당자}\n- 직통번호: {직통번호}\n- 업무 메일: {업무메일}\n\n아울러 {대상월}분 입금 내역 확인을 요청드립니다.\n\n1. CMS 입금액\n{대상월}분 CMS 입금액은 {CMS입금액}원으로 확인됩니다. {회원현황} 기준으로, 출금액 {출금액}원에서 수수료 {수수료}원이 차감된 금액이 맞는지 확인 부탁드립니다.\n\n2. {입금일}자 입금 건 (총 {건수}건)\n- {입금내역1}\n- {입금내역2}\n- {입금내역3}\n- {입금내역4}\n\n확인 후 회신해 주시면 감사하겠습니다.\n\n{다음달}분부터는 {새담당자}께 연락 부탁드립니다. CMS 출금 오류나 미입금자가 있을 경우에는 성명을 알려주시면 감사하겠습니다.\n\n그동안 많은 도움 주셔서 다시 한번 감사드리며, 앞으로도 변함없이 잘 부탁드립니다.\n\n감사합니다.\n{내이름} 드림'},
  {ch: '문자·카톡', title: '증빙서류 요청', org: '', body: '안녕하세요, {수신처} {담당자}님.\n{센터} {내이름}입니다.\n{금액} 건 정산을 위해 아래 서류를 {기한}까지 보내주시면 감사하겠습니다.\n- 세금계산서 또는 영수증\n- 거래명세서\n문의사항은 언제든 연락 주세요. 감사합니다.'},
  {ch: '문자·카톡', title: '후원 감사 인사', org: '', body: '안녕하세요, {수신처} {담당자}님.\n{센터} {내이름}입니다.\n보내주신 따뜻한 후원 덕분에 센터가 힘을 얻고 있습니다. 진심으로 감사드립니다.\n후원금 영수증은 {날짜}에 발송해 드릴 예정입니다.'},
  {ch: '문자·카톡', title: '면접 일정 안내', org: '', body: '안녕하세요, {수신처}님.\n{센터} {내이름}입니다.\n면접 일정 안내드립니다.\n- 일시: {날짜}\n- 장소: {센터}\n- 준비물: 신분증\n참석이 어려우시면 미리 연락 부탁드립니다.'},
  {ch: '이메일', title: '공문 발송 안내', org: '', body: '{수신처} {담당자}님께\n\n안녕하세요, {센터} {내이름}입니다.\n{날짜}자 공문을 첨부하여 발송드립니다. 확인 후 {기한}까지 회신 부탁드립니다.\n\n감사합니다.'},
  {ch: '이메일', title: '회의 참석 요청', org: '', body: '{수신처} {담당자}님께\n\n안녕하세요, {센터} {내이름}입니다.\n아래와 같이 회의를 개최하오니 참석해 주시기 바랍니다.\n- 일시: {날짜}\n- 장소: {센터}\n참석 여부를 {기한}까지 회신해 주시면 감사하겠습니다.'},
  {ch: '전화 멘트', title: '결제·입금 확인 요청', org: '', body: '안녕하세요, {센터} {내이름}입니다. {담당자}님 계신가요?\n{금액} 입금 건 확인차 연락드렸습니다. {날짜} 기준으로 입금 내역이 확인되지 않아서요. 처리 현황 확인 부탁드립니다.'},
];
const MSG = {q: '', ch: '', org: ''};
const MSG_KEEP = ['수신처', '담당자', '내이름', '센터', '새담당자', '직통번호', '업무메일', '호칭']; // 이 기기에만 기억 (매번 바뀌는 금액·날짜는 기억 안 함)
function msgState() { S.msgs ||= {items: []}; S.msgs.items ||= []; return S.msgs; }
function msgVars(body) { return [...new Set((String(body).match(/\{([^{}\n]{1,12})\}/g) || []).map(x => x.slice(1, -1)))]; }
function msgMem() { try { return JSON.parse(localStorage.getItem('il-hub-msgvars') || '{}'); } catch (e) { return {}; } }
function msgMemSet(o) { try { localStorage.setItem('il-hub-msgvars', JSON.stringify(o)); } catch (e) {} }
function msgFill(body, vals) { return String(body).replace(/\{([^{}\n]{1,12})\}/g, (m, k) => (vals[k] !== undefined && vals[k] !== '') ? vals[k] : m); }

function msgCopy(it) {
  const vars = msgVars((it.subject || '') + '\n' + it.body), mem = msgMem(), now = today();
  const mo = now.getMonth() + 1, prev = mo === 1 ? 12 : mo - 1;
  const pre = {'수신처': it.org || '', '센터': (S.settings.org || {}).name || '', '날짜': `${mo}월 ${now.getDate()}일`, '연도': String(now.getFullYear()), '대상월': `${prev}월`, '다음달': `${mo}월 말에 입금되는 ${mo}월`};
  const done = (vals, what) => {
    const txt = what === 'subject' ? msgFill(it.subject, vals) : msgFill(it.body, vals);
    copyText(txt, what === 'subject' ? '제목을 복사했어요. 메일 제목칸에 붙여 넣으세요' : '복사했어요. 메신저·메일에 붙여 넣으세요');
    it.used = (it.used || 0) + 1; it.last = ymd(today()); save();
    const m = msgMem(); vars.forEach(k => { if (vals[k] && MSG_KEEP.includes(k)) m[k] = vals[k]; }); msgMemSet(m);
  };
  if (!vars.length && !it.subject) { done({}, 'body'); return; }
  const need = vars; // 모든 빈칸을 보여 주되 아는 값은 미리 채워 둠
  sheet({title: '빈칸 채우기 후 복사', body: `<div class="small muted" style="margin-bottom:6px">비워 두면 {중괄호}가 그대로 복사돼요. 수신처·담당자·내이름은 다음에도 기억해요.</div>` +
    need.map(k => `<label class="f">${esc(k)}<input class="inp" data-v="${esc(k)}" value="${esc(mem[k] || pre[k] || '')}"></label>`).join('') +
    `<div class="note small" id="mg-pv" style="white-space:pre-wrap;margin-top:8px"></div>`,
    foot: `<button class="btn" data-close>취소</button>${it.subject ? '<button class="btn" id="mg-sub">제목 복사</button>' : ''}<button class="btn primary" id="mg-ok">${it.subject ? '본문 복사' : '복사'}</button>`,
    onMount: sh => {
      const get = () => { const v = Object.assign({}, pre); $$('[data-v]', sh).forEach(i => { v[i.dataset.v] = i.value.trim(); }); return v; };
      const pv = () => { const v = get(); $('#mg-pv', sh).textContent = (it.subject ? '제목: ' + msgFill(it.subject, v) + '\n\n' : '') + msgFill(it.body, v); };
      $$('[data-v]', sh).forEach(i => i.oninput = pv); pv();
      $('#mg-ok', sh).onclick = () => { const v = get(); closeSheet(); done(v, 'body'); setTimeout(render, 50); };
      const sb = $('#mg-sub', sh); if (sb) sb.onclick = () => { done(get(), 'subject'); };
    }});
}
function msgEdit(it) {
  const isNew = !it, m = it ? Object.assign({}, it) : {id: uid(), ch: MSG.ch || MSG_CH[0], title: '', org: MSG.org || '', body: '', fav: false};
  const orgs = [...new Set(msgState().items.map(x => x.org).filter(Boolean))];
  sheet({title: isNew ? '문구 추가' : '문구 수정', body: `
    <label class="f">제목<input class="inp" id="me-t" value="${esc(m.title)}" placeholder="예: 증빙서류 요청"></label>
    <div class="form-grid">
      <label class="f">보내는 방법<select class="inp" id="me-c">${MSG_CH.map(c => `<option ${c === m.ch ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="f">수신처 (거래처·기관, 비워도 돼요)<input class="inp" id="me-o" list="me-ol" value="${esc(m.org)}" placeholder="예: ○○복지관"><datalist id="me-ol">${orgs.map(o => `<option value="${esc(o)}">`).join('')}</datalist></label>
    </div>
    <label class="f" id="me-sw">메일 제목 (이메일일 때만)<input class="inp" id="me-s" value="${esc(m.subject || '')}" placeholder="예: [{센터}] 서류 제출 안내의 건"></label>
    <label class="f">문구<textarea class="inp" id="me-b" rows="9" placeholder="안녕하세요, {수신처} {담당자}님.&#10;{센터} {내이름}입니다.">${esc(m.body)}</textarea></label>
    <div class="small muted">{수신처} {담당자} {날짜} {기한} {금액} {센터} {내이름} 처럼 중괄호로 빈칸을 만들어 두면, 복사할 때 채우는 창이 떠요. 직접 이름을 지어도 돼요 (예: {차량번호}).</div>`,
    foot: `${isNew ? '' : '<button class="btn ghost" id="me-del" style="margin-right:auto">삭제</button>'}<button class="btn" data-close>취소</button><button class="btn primary" id="me-ok">저장</button>`,
    onMount: sh => {
      const sw = () => { $('#me-sw', sh).style.display = $('#me-c', sh).value === '이메일' ? '' : 'none'; }; $('#me-c', sh).onchange = sw; sw();
      $('#me-ok', sh).onclick = () => {
        m.title = $('#me-t', sh).value.trim(); m.ch = $('#me-c', sh).value; m.org = $('#me-o', sh).value.trim(); m.body = $('#me-b', sh).value.replace(/\s+$/, ''); m.subject = m.ch === '이메일' ? $('#me-s', sh).value.trim() : '';
        if (!m.title || !m.body) { toast('제목과 문구를 적어 주세요'); return; }
        const st = msgState();
        if (isNew) st.items.unshift(m); else { const i = st.items.findIndex(x => x.id === m.id); Object.assign(st.items[i], m); }
        save(); closeSheet(); render(); toast('저장했어요');
      };
      const d = $('#me-del', sh); if (d) d.onclick = () => { if (!d.dataset.armed) { d.dataset.armed = 1; d.textContent = '한 번 더 누르면 삭제'; return; } const st = msgState(); st.items = st.items.filter(x => x.id !== m.id); save(); closeSheet(); render(); };
    }});
}
VIEWS.msgs = v => {
  const items = msgState().items, q = MSG.q.trim().toLowerCase();
  const list = items.filter(i => (!MSG.ch || i.ch === MSG.ch) && (!MSG.org || i.org === MSG.org) && (!q || (i.title + ' ' + i.org + ' ' + (i.subject || '') + ' ' + i.body).toLowerCase().includes(q)))
    .sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || (b.last || '').localeCompare(a.last || '') || 0);
  const orgs = [...new Set(items.map(x => x.org).filter(Boolean))].sort();
  v.innerHTML = `
  <div class="page-head"><div><h1>문구함</h1><p>거래처·기관에 자주 보내는 메시지 문구를 저장해 두고 <b>빈칸만 채워 바로 복사</b>해요. 내용은 이 기기와 로그인 동기화에만 저장되고 공개 사이트에는 올라가지 않아요.</p></div>
    <div class="row"><button class="btn" id="mg-seed2">예시 불러오기</button><button class="btn primary" id="mg-add">${icon('plus')}문구 추가</button></div></div>
  <div class="row" style="flex-wrap:wrap;gap:6px;margin:4px 0 8px">
    <button class="btn sm ${MSG.ch ? 'ghost' : 'primary'}" data-ch="">전체 ${items.length}</button>
    ${MSG_CH.map(c => `<button class="btn sm ${MSG.ch === c ? 'primary' : 'ghost'}" data-ch="${c}">${c} ${items.filter(i => i.ch === c).length}</button>`).join('')}</div>
  ${orgs.length ? `<div class="row" style="flex-wrap:wrap;gap:6px;margin-bottom:8px"><span class="faint small">수신처</span>${orgs.map(o => `<button class="chip ${MSG.org === o ? 'acc' : ''}" data-org="${esc(o)}" style="cursor:pointer;border:0">${esc(o)}</button>`).join('')}${MSG.org ? '<button class="chip" data-org="" style="cursor:pointer;border:0">× 해제</button>' : ''}</div>` : ''}
  <input class="inp" id="mg-q" placeholder="제목·수신처·내용 검색" value="${esc(MSG.q)}" style="margin-bottom:10px">
  <div id="mg-list">${list.length ? list.map(i => `<div class="panel mg-card" data-id="${i.id}"><div class="panel-b">
      <div class="row" style="gap:8px;align-items:flex-start"><div style="min-width:0;flex:1"><b>${esc(i.title)}</b>
        <div class="small muted">${esc(i.ch)}${i.org ? ' · ' + esc(i.org) : ''}${i.used ? ` · ${i.used}회 사용` : ''}${i.last ? ' · 최근 ' + esc(i.last.slice(5).replace('-', '/')) : ''}</div></div>
        <button class="btn ghost sm" data-a="fav" aria-label="즐겨찾기" aria-pressed="${!!i.fav}" style="font-size:16px;line-height:1">${i.fav ? '★' : '☆'}</button></div>
      ${i.subject ? `<div class="small" style="margin:6px 0 2px"><b>제목</b> ${esc(i.subject)}</div>` : ''}<div class="mg-body small">${esc(i.body)}</div>
      <div class="row" style="gap:6px;margin-top:8px"><button class="btn primary sm" data-a="copy">${icon('copy')}복사</button><button class="btn sm ghost" data-a="edit">수정</button></div>
    </div></div>`).join('') : `<div class="panel"><div class="panel-b muted" style="text-align:center;padding:22px 8px">${items.length ? '조건에 맞는 문구가 없어요' : `아직 저장한 문구가 없어요.<div style="margin-top:10px"><button class="btn" id="mg-seed">예시 문구 ${MSG_SEED.length}개 불러오기</button></div>`}</div></div>`}</div>`;
  $('#mg-add', v).onclick = () => msgEdit(null);
  const seed = () => { const have = new Set(msgState().items.map(x => x.title)), add = MSG_SEED.filter(x => !have.has(x.title)); if (!add.length) { toast('예시 문구가 이미 모두 들어 있어요'); return; } msgState().items.push(...add.map(x => Object.assign({id: uid(), fav: false}, x))); save(); render(); toast(add.length + '개를 불러왔어요'); };
  const sd = $('#mg-seed', v); if (sd) sd.onclick = seed; $('#mg-seed2', v).onclick = seed;
  $('#mg-q', v).oninput = e => { MSG.q = e.target.value; const p = e.target.selectionStart; render(); const el = $('#mg-q'); el.focus(); el.setSelectionRange(p, p); };
  $$('[data-ch]', v).forEach(b => b.onclick = () => { MSG.ch = b.dataset.ch; render(); });
  $$('[data-org]', v).forEach(b => b.onclick = () => { MSG.org = b.dataset.org; render(); });
  $$('.mg-card', v).forEach(c => { const it = msgState().items.find(x => x.id === c.dataset.id);
    $$('[data-a]', c).forEach(b => b.onclick = () => ({copy: () => msgCopy(it), edit: () => msgEdit(it), fav: () => { it.fav = !it.fav; save(); render(); }})[b.dataset.a]()); });
};
