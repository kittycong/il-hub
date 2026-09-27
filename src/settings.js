/* ================= settings & backup ================= */
VIEWS.settings = v => {
  const st = S.settings, o = st.org;
  const hol = Object.entries(S.holidays).sort().map(([d, n]) => `${d} ${n}`).join('\n');
  v.innerHTML = `
  <div class="page-head"><div><h1>설정 · 백업</h1><p>기관 정보, 급여일, 공휴일을 고치고 데이터를 다른 기기로 옮깁니다.</p></div></div>
  <div class="grid-2">
    <section class="panel"><div class="panel-h"><h2>기관 · 문서</h2></div><div class="panel-b" style="display:flex;flex-direction:column;gap:12px">
      <div class="form-grid">
        <label class="f span2">기관명<input class="inp" id="o-name" value="${esc(o.name)}"></label>
        <label class="f">대표자(센터장)<input class="inp" id="o-rep" value="${esc(o.rep)}"></label>
        <label class="f">전화<input class="inp" id="o-tel" value="${esc(o.tel)}"></label>
        <label class="f span2">소재지<input class="inp" id="o-addr" value="${esc(o.addr)}"></label>
        <label class="f">문서번호 머리말<input class="inp" id="o-pre" value="${esc(st.docPrefix)}"></label>
        <label class="f">급여일 (매월)<input class="inp" type="number" min="1" max="31" id="o-pay" value="${esc(st.payday)}"></label>
        <label class="f span2">공용서버 주소 (이 기기에만 저장 · 예: \\\\서버IP)<input class="inp" id="o-nas" value="${esc(st.nasRoot||'')}" placeholder="비우면 '공용서버\\'로 표시"></label>
        <label class="f span2">결재란 (쉼표로 구분)<input class="inp" id="o-appr" value="${esc(st.approvers.join(', '))}"></label>
      </div>
      <div class="row"><button class="btn primary" id="o-save">저장</button></div>
    </div></section>

    <section class="panel"><div class="panel-h"><h2>백업 · 기기 간 옮기기</h2></div><div class="panel-b" style="display:flex;flex-direction:column;gap:12px">
      <div class="note">데이터는 <b>이 브라우저</b>에만 저장돼요. PC ↔ 휴대폰, 아티팩트판 ↔ GitHub 배포본 사이에서는 백업을 내보내고 다른 쪽에서 가져오세요. 주 1회 백업 파일을 NAS에 넣어 두기를 권해요.</div>
      <div class="row">
        <button class="btn" id="bk-copy">${icon('copy')}백업 복사</button>
        <button class="btn" id="bk-dl">${icon('down')}백업 파일 저장</button>
      </div>
      <label class="f">가져오기 — 백업 내용을 붙여 넣거나 파일을 고르세요<textarea class="inp mono" id="bk-in" rows="4" placeholder='{"v":1,...}'></textarea></label>
      <div class="row"><input type="file" id="bk-file" accept=".json,application/json" class="small"><span class="grow"></span><button class="btn primary" id="bk-load">가져오기</button></div>
      <div style="border-top:1px solid var(--line);padding-top:12px" class="row"><span class="faint small grow">모든 데이터를 처음 상태로 되돌립니다</span><button class="btn danger sm" id="bk-reset">초기화</button></div>
    </div></section>
  </div>
  <section class="panel"><div class="panel-h"><h2>업무 단계 사진</h2><span class="faint small">${PH.count}장 · 이 기기에만 저장</span></div><div class="panel-b" style="display:flex;flex-direction:column;gap:10px">
    <div class="note small">사진은 설정 백업에 포함되지 않아요. 다른 기기로 옮길 땐 <b>사진 팩 저장</b> → 다른 기기에서 <b>사진 팩 넣기</b>. 사진 팩은 내부 화면이 담겨 있으니 GitHub에 올리지 말고 NAS·메신저로 옮기세요.</div>
    <div class="row"><button class="btn" id="ph-in">${icon('plus')}사진 팩 넣기</button><button class="btn" id="ph-out" ${PH.count?'':'disabled'}>${icon('down')}사진 팩 저장</button><span class="grow"></span><button class="btn danger sm" id="ph-clr" ${PH.count?'':'disabled'}>사진 모두 지우기</button></div></div></section>
  <section class="panel"><div class="panel-h"><h2>공휴일</h2><span class="faint small">한 줄에 "YYYY-MM-DD 이름". 마감 순연 계산에 쓰여요</span></div><div class="panel-b" style="display:flex;flex-direction:column;gap:10px">
    <textarea class="inp mono" id="hol" rows="8">${esc(hol)}</textarea><div class="row"><button class="btn" id="hol-save">공휴일 저장</button><span class="faint small">2026~2027년 기본값 포함 · 임시공휴일은 직접 추가</span></div></div></section>`;

  $('#o-save').onclick = () => {
    Object.assign(o, {name:$('#o-name').value.trim(), rep:$('#o-rep').value.trim(), tel:$('#o-tel').value.trim(), addr:$('#o-addr').value.trim()});
    st.docPrefix = $('#o-pre').value.trim(); st.payday = Math.min(31, Math.max(1, Number($('#o-pay').value) || 25));
    st.approvers = $('#o-appr').value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 6);
    st.nasRoot = $('#o-nas').value.trim();
    save(); toast('저장했어요');
  };
  const dump = () => JSON.stringify(S);
  $('#bk-copy').onclick = () => copyText(dump(), '백업 내용을 복사했어요. 다른 기기의 "가져오기"에 붙여 넣으세요');
  $('#bk-dl').onclick = () => { download(`업무허브_백업_${ymd(today())}.json`, dump(), 'application/json'); if (CAN_FILE) toast('백업 파일을 저장했어요'); };
  $('#bk-file').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { $('#bk-in').value = r.result; toast('파일을 읽었어요. "가져오기"를 누르세요'); }; r.readAsText(f); };
  $('#bk-load').onclick = () => {
    try { const d = JSON.parse($('#bk-in').value); if (d && d.type === 'il-hub-photos') { importPack(d).then(n => { toast(`사진 ${n}장을 넣었어요`); render(); }); return; } if (!d || !d.rules || !d.settings) throw 0; S = d; const def = defaults(); for (const k of Object.keys(def)) if (S[k] === undefined) S[k] = def[k]; save(); render(); toast('가져왔어요'); }
    catch (e) { toast('백업 형식이 아니에요. 복사한 내용 전체를 붙여 넣어 주세요'); }
  };
  const rs = $('#bk-reset'); rs.onclick = () => { if (rs.dataset.armed) { S = defaults(); save(); render(); toast('초기화했어요'); } else { rs.dataset.armed = 1; rs.textContent = '한 번 더 누르면 초기화'; } };
  $('#ph-in').onclick = () => pickPackFile(render);
  $('#ph-out').onclick = () => { if (!CAN_FILE) { toast('사진 팩 저장은 GitHub 배포본에서 돼요'); return; } download(`업무허브_사진팩_${ymd(today())}.json`, exportPack(), 'application/json'); toast(`사진 ${PH.count}장을 저장했어요`); };
  const pc = $('#ph-clr'); pc.onclick = async () => { if (!pc.dataset.armed) { pc.dataset.armed = 1; pc.textContent = '한 번 더 누르면 모두 지움'; return; } await photoClear(); render(); toast('사진을 모두 지웠어요'); };
  $('#hol-save').onclick = () => {
    const h = {}; $('#hol').value.split('\n').forEach(l => { const m = l.trim().match(/^(\d{4}-\d{2}-\d{2})\s*(.*)$/); if (m) h[m[1]] = m[2] || '공휴일'; });
    S.holidays = h; save(); toast(`공휴일 ${Object.keys(h).length}일을 저장했어요`);
  };
};

/* ================= boot ================= */
S = load();
render();
loadPhotos().then(() => { if (['handover','settings'].includes(current())) render(); });
loadConnectors().then(() => { if (['home','calendar','apps'].includes(current())) render(); return checkApps(); }).then(() => { if (['home','apps'].includes(current())) render(); });
