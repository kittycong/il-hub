/* ================= 업무일지 hwpx 만들기 =================
   - 센터 업무일지 hwpx 파일 1개를 '양식'으로 등록하면(이 기기에만 저장), 날짜·업무내용·비고만 바꿔 같은 모양의 hwpx를 만들어요.
   - 결재란·로고·글꼴은 등록한 양식 그대로예요. 양식 파일은 공개 사이트에 올라가지 않아요.
   - hwpx = zip 묶음. 브라우저 기본 기능(DecompressionStream)만 써서 읽고, 무압축 zip으로 다시 묶어요(한글에서 정상으로 열림). */
const WL_PHRASES = [
  ['매일 기본', ['기관 업무 메일 확인 및 수신 공문 접수 처리', '활동지원사 관련 전화 문의 응대', '회계 전표 입력 및 지출 관련 업무 처리']],
  ['회계·재무', ['행정서류 접수 및 정리', '{월}월 후원금 수입 및 결산 확인', '추경예산 ○차 자료 작성', '월초 회계자료 및 행정서류 확인', '사업 관련 증빙자료 정리 및 보관', '회계서류 증빙 정리 및 보관', '복지기금 사업비 지출 처리', '복지일자리 급여 (e나라도움) 집행처리', '복지기금 사업 관련 서류 확인 보탬e 집행처리']],
  ['후원·CMS', ['후원물품 수령 여부 확인 및 배분 준비', '후원금 및 후원물품 관련 영수증 발급 내역 정리', 'cms후원 신청 자료 확인 및 대행처 업무협조 요청']],
  ['인사·채용', ['지원자 이력서 검토 및 채용 현황표 업데이트', '채용공고 기안 작성 및 각 채용처 게시', '홈페이지 등 채용 공고 게시글 작성', '면접 일정 조율 및 면접 대상자 유선 안내', '채용 진행 일정 확인 및 채용달력 업데이트', '직원 근태 자료 확인 및 행정서류 정리', '인사위원회 소집 기안 작성']],
  ['활동지원', ['활동지원사 근무 일정 확인 및 변동사항 정리', '활동지원 급여 제공기록지 확인 및 보완 요청', '활동지원사업 운영위원회 ○차 회의 참석 요청 및 회의 개최 홈페이지 게시물 작성']],
  ['문서·행정', ['내부 결재서류 검토 및 보완', '공문서 수신·발신 및 문서관리', '부서 간 업무협조 및 일정 공유', '주간 업무 일정 확인 및 내부 공유', '주간 업무 처리 내역 정리', '전화 응대 및 방문 민원 안내', '차량일지 작성관리']],
];

/* ---------- 작은 zip 도구 ---------- */
const WLZ = {crc: null};
function zCrc(u8) {
  if (!WLZ.crc) { WLZ.crc = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; WLZ.crc[n] = c >>> 0; } }
  let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = WLZ.crc[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0;
}
async function zInflate(u8) {
  const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter(); w.write(u8); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}
async function zRead(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf), dec = new TextDecoder(); let e = u8.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('zip이 아니에요');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = [];
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
    const ls = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), raw = u8.subarray(ls, ls + csize);
    if (name.endsWith('/')) continue;
    out.push({name, data: method === 0 ? raw.slice() : await zInflate(raw)});
  }
  return out;
}
function zWrite(files) {
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  const u16 = v => [v & 255, (v >> 8) & 255], u32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  files.forEach(f => {
    const nm = enc.encode(f.name), crc = zCrc(f.data), sz = f.data.length;
    const lh = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nm.length), ...u16(0), ...nm]);
    parts.push(lh, f.data);
    cen.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...nm]));
    off += lh.length + sz;
  });
  const cs = cen.reduce((a, b) => a + b.length, 0);
  return new Blob([...parts, ...cen, new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cs), ...u32(off), 0, 0])], {type: 'application/hwp+zip'});
}

/* ---------- 양식 저장 (이 기기 IndexedDB) ---------- */
async function wlTplGet() { const db = await flDb(); if (!db) return null; return new Promise(res => { const r = db.transaction('h').objectStore('h').get('wl-tpl'); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); }
async function wlTplPut(v) { const db = await flDb(); if (!db) return false; return new Promise(res => { const tx = db.transaction('h', 'readwrite'); tx.objectStore('h').put(v, 'wl-tpl'); tx.oncomplete = () => res(true); tx.onerror = () => res(false); }); }

/* ---------- hwpx 만들기 ---------- */
const xEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function wlLines(content) { return String(content || '').split('\n').map(s => s.trim().replace(/^[-·•]\s*/, '')).filter(Boolean); }
function wlDateText(k) { const d = parseYmd(k); return `${d.getFullYear()} 년  ${d.getMonth() + 1}월  ${d.getDate()}일  ${DOW[d.getDay()]}요일`; }
/* '라벨' 글자가 든 칸의 다음 칸(tc)에서 subList 안쪽 범위를 찾는다 */
function wlCell(xml, label) {
  const at = xml.indexOf('<hp:t>' + label + '</hp:t>'); if (at < 0) return null;
  const tc = xml.indexOf('<hp:tc ', at); if (tc < 0) return null;
  const a = xml.indexOf('>', xml.indexOf('<hp:subList', tc)) + 1, b = xml.indexOf('</hp:subList>', a);
  return a > 0 && b > a ? [a, b] : null;
}
function wlParas(lines, proto, step) {
  const one = t => proto.replace(/<hp:run([^>]*?)(\/>|>[\s\S]*?<\/hp:run>)/, (m, at) => `<hp:run${at}>${t ? '<hp:t>' + xEsc(t) + '</hp:t>' : ''}</hp:run>`)
    .replace(/vertpos="\d+"/, 'vertpos="__V__"').replace(/ id="\d+"/, ' id="0"');
  return (lines.length ? lines : ['']).map((t, i) => one(t).replace('__V__', String(i * step))).join('');
}
async function wlHwpxBuild(tpl, k, content, note) {
  const files = await zRead(tpl.buf), dec = new TextDecoder(), enc = new TextEncoder();
  const sec = files.find(f => /Contents\/section0\.xml$/.test(f.name)); if (!sec) throw new Error('양식에 본문이 없어요');
  let xml = dec.decode(sec.data);
  const lines = wlLines(content), items = lines.map(t => ' - ' + t);
  // 날짜
  const dt = wlDateText(k); let hit = false;
  xml = xml.replace(/<hp:t>\s*\d{4}\s*년\s*\d+\s*월\s*\d+\s*일\s*[^<]*요일\s*<\/hp:t>/, () => { hit = true; return `<hp:t>${dt}</hp:t>`; });
  if (!hit) throw new Error('양식에서 날짜 칸을 찾지 못했어요 (예: 2026 년 9월 1일 화요일)');
  // 업무내용·비고
  for (const [label, arr] of [['업무내용', items], ['비고', String(note || '').trim() ? String(note).split('\n').map(s => s.trim()).filter(Boolean) : []]]) {
    const r = wlCell(xml, label); if (!r) throw new Error(`양식에서 '${label}' 칸을 찾지 못했어요`);
    const inner = xml.slice(r[0], r[1]), pm = inner.match(/<hp:p [\s\S]*?<\/hp:p>/); if (!pm) throw new Error(`'${label}' 칸 형식이 달라요`);
    const step = Number((pm[0].match(/vertsize="(\d+)"/) || [0, 1000])[1]) * 1.6;
    xml = xml.slice(0, r[0]) + wlParas(arr, pm[0], Math.round(step)) + xml.slice(r[1]);
  }
  sec.data = enc.encode(xml);
  const pv = files.find(f => /Preview\/PrvText\.txt$/.test(f.name));
  if (pv) { let t = dec.decode(pv.data); t = t.replace(/(<날\s+짜><)[^>]*(>)/, `$1${dt}$2`).replace(/(<업무내용><)[\s\S]*?(>\s*<비고><)[\s\S]*?(>\s*(?:<>\s*)?$)/, `$1${items.join('  ')}$2${String(note || '').trim()}$3`); pv.data = enc.encode(t); }
  files.sort((a, b) => (a.name === 'mimetype' ? -1 : 0) - (b.name === 'mimetype' ? -1 : 0));
  return {blob: zWrite(files), lines: lines.length};
}
const wlFileName = k => '업무일지-' + k.slice(2, 4) + k.slice(5, 7) + k.slice(8, 10) + '.hwpx';
async function wlNeedTpl() {
  const t = await wlTplGet(); if (t) return t;
  await new Promise(res => wlTplSheet(res)); return await wlTplGet();
}
async function wlHwpxSave(k, content, note) {
  if (!wlLines(content).length) { toast('업무일지 내용을 먼저 적어 주세요'); return; }
  const tpl = await wlNeedTpl(); if (!tpl) return;
  try { const r = await wlHwpxBuild(tpl, k, content, note); if (r.lines > 24) toast('줄이 많아 양식 칸을 넘칠 수 있어요. 한글에서 확인해 주세요'); download(wlFileName(k), r.blob, 'application/hwp+zip'); toast(wlFileName(k) + ' 저장'); }
  catch (e) { toast('만들지 못했어요: ' + (e.message || e)); }
}
async function wlHwpxMonth(y, m) {
  const days = []; for (let d = new Date(y, m, 1); d.getMonth() === m; d = addDays(d, 1)) { const k = ymd(d), c = wlogGet(k); if (c) days.push([k, c, (S.wlog[k] || {}).note || '']); }
  if (!days.length) { toast('이 달에 기록한 업무일지가 없어요'); return; }
  const tpl = await wlNeedTpl(); if (!tpl) return;
  try {
    const out = []; for (const [k, c, n] of days) { const r = await wlHwpxBuild(tpl, k, c, n); out.push({name: wlFileName(k), data: new Uint8Array(await r.blob.arrayBuffer())}); }
    download(`업무일지-${String(y).slice(2)}${pad(m + 1)}.zip`, zWrite(out), 'application/zip'); toast(days.length + '일치를 zip으로 저장했어요');
  } catch (e) { toast('만들지 못했어요: ' + (e.message || e)); }
}
function wlTplSheet(done) {
  wlTplGet().then(cur => sheet({title: '업무일지 양식 등록', body: `
    <div class="note small">센터에서 쓰는 <b>업무일지 hwpx 파일 1개</b>(어느 날짜든 괜찮아요)를 등록하면, 날짜·업무내용·비고만 바꿔서 같은 모양으로 만들어 줘요. 결재란·로고는 등록한 파일 그대로예요. 양식은 <b>이 기기 브라우저에만</b> 저장되고 공개 사이트에는 올라가지 않아요. 회사 PC와 집 PC에서 각각 한 번씩 등록하세요.</div>
    <div class="small" style="margin:8px 0">현재 양식: <b>${cur ? esc(cur.name) : '없음'}</b></div>
    <label class="f">hwpx 파일<input class="inp" type="file" id="wt-f" accept=".hwpx"></label>`,
    foot: '<button class="btn" data-close>닫기</button><button class="btn primary" id="wt-ok">등록</button>',
    onMount: sh => {
      sh.closest('.sheet-back').addEventListener('click', e => { if (e.target.closest('button[data-close]') || e.target.classList.contains('sheet-back')) done && done(); });
      $('#wt-ok', sh).onclick = async () => {
        const f = $('#wt-f', sh).files[0]; if (!f) { toast('hwpx 파일을 선택해 주세요'); return; }
        try {
          const buf = await f.arrayBuffer(), fl2 = await zRead(buf.slice(0)), sec = fl2.find(x => /Contents\/section0\.xml$/.test(x.name));
          const xml = sec ? new TextDecoder().decode(sec.data) : '';
          if (!/<hp:t>\s*\d{4}\s*년/.test(xml) || !xml.includes('<hp:t>업무내용</hp:t>')) { toast('업무일지 양식이 아닌 것 같아요 (날짜·업무내용 칸이 없어요)'); return; }
          await wlTplPut({name: f.name, buf}); toast('양식을 등록했어요'); closeSheet(); done && done();
        } catch (e) { toast('hwpx를 읽지 못했어요: ' + (e.message || e)); }
      };
    }}));
}
function wlPhraseSheet(k, onPick) {
  const mo = k ? parseYmd(k).getMonth() + 1 : today().getMonth() + 1;
  sheet({title: '자주 쓰는 업무 문구', body: `<div class="small muted" style="margin-bottom:8px">지난 업무일지에서 반복된 문구예요. 체크해서 넣은 뒤 ○ 표시는 알맞게 고치세요.</div>` +
    WL_PHRASES.map(([g, arr]) => `<div class="eyebrow" style="margin:10px 0 4px">${esc(g)}</div>${arr.map(t => `<label class="row" style="gap:8px;padding:3px 0"><input type="checkbox" value="${esc(t.replace('{월}', mo))}"><span>${esc(t.replace('{월}', mo))}</span></label>`).join('')}`).join(''),
    foot: '<button class="btn" data-close>닫기</button><button class="btn primary" id="wp-ok">선택한 문구 넣기</button>',
    onMount: sh => { $('#wp-ok', sh).onclick = () => { const v = $$('input:checked', sh).map(x => x.value); if (!v.length) { toast('넣을 문구를 체크해 주세요'); return; } onPick(v); }; }});
}
