/* ================= defaults & schedule engine ================= */
const CATS = {
  pay:{name:'급여·인사', color:'var(--cat-pay)'},
  tax:{name:'세무', color:'var(--cat-tax)'},
  ins:{name:'4대보험', color:'var(--cat-ins)'},
  acc:{name:'회계·예결산', color:'var(--cat-acc)'},
  don:{name:'후원', color:'var(--cat-don)'},
  etc:{name:'기타', color:'var(--cat-etc)'},
};

// 공휴일 (대체공휴일 포함). 설정 화면에서 편집 가능.
const HOLIDAYS_DEFAULT = {
  '2026-01-01':'신정','2026-02-16':'설날 연휴','2026-02-17':'설날','2026-02-18':'설날 연휴','2026-03-01':'삼일절','2026-03-02':'대체공휴일',
  '2026-05-05':'어린이날','2026-05-24':'부처님오신날','2026-05-25':'대체공휴일','2026-06-03':'지방선거','2026-06-06':'현충일',
  '2026-08-15':'광복절','2026-08-17':'대체공휴일','2026-09-24':'추석 연휴','2026-09-25':'추석','2026-09-26':'추석 연휴',
  '2026-10-03':'개천절','2026-10-05':'대체공휴일','2026-10-09':'한글날','2026-12-25':'성탄절',
  '2027-01-01':'신정','2027-02-06':'설날 연휴','2027-02-07':'설날','2027-02-08':'설날 연휴','2027-02-09':'대체공휴일','2027-03-01':'삼일절',
  '2027-05-05':'어린이날','2027-05-13':'부처님오신날','2027-06-06':'현충일','2027-08-15':'광복절','2027-08-16':'대체공휴일',
  '2027-09-14':'추석 연휴','2027-09-15':'추석','2027-09-16':'추석 연휴','2027-10-03':'개천절','2027-10-04':'대체공휴일',
  '2027-10-09':'한글날','2027-10-11':'대체공휴일','2027-12-25':'성탄절','2027-12-27':'대체공휴일',
};

function defaults() {
  return {
    v: 6,
    settings: {
      payday: 25,
      since: ymd(today()),   // 이 날짜 이전 마감은 '지난 마감'으로 치지 않음
      docPrefix: '구로IL',
      org: {name:'구로장애인자립생활센터', rep:'', addr:'서울특별시 구로구', tel:''},
      approvers: ['담당','팀장','사무국장','소장','대표'],
      nasRoot: '',
    },
    holidays: clone(HOLIDAYS_DEFAULT),
    apps: [
      {id:'a1', name:'업무분장·인수인계', repo:'eopmu-bunjang', url:'https://kittycong.github.io/eopmu-bunjang/', desc:'업무 담당 매핑, 인수인계 기록', st:'ok'},
      {id:'a2', name:'휴가 대시보드', repo:'guro_huga', url:'https://kittycong.github.io/guro_huga/', desc:'연차·반차 현황, 휴가신청서 출력 · 허브에 휴가 연동', st:'ok'},
      {id:'a3', name:'채용 캘린더', repo:'guro_recruitment-calendar-app', url:'https://kittycong.github.io/guro_recruitment-calendar-app/', desc:'채용 일정·칸반·HWPX 공고 생성', st:'ok'},
      {id:'a4', name:'출장·기안 문서생성', repo:'chulchang-munseo', url:'https://chulchang-munseo.vercel.app/', desc:'출장신청서·복명서, 물품구매 기안, 급여명세서 (Vercel)', st:'ok'},
      {id:'a5', name:'생일 관리', repo:'birth_guro1', url:'https://kittycong.github.io/birth_guro1/', desc:'직원 생일 알림 · 허브에 생일 연동', st:'ok'},
      {id:'a6', name:'빵 수령 당번표', repo:'bread-duty-app', url:'https://bread-duty-app-1-bread-duty.vercel.app/', desc:'수요일 빵 수령 당번, 공휴일이면 목요일로 (Vercel)', st:'ok'},
      {id:'a8', name:'진우정보시스템', url:'', desc:'총무·회계: 급여, 증명서, 전표, 장부, 예결산·추경', st:'pc'},
      {id:'a9', name:'시놀로지 NAS 캘린더', url:'', desc:'센터 공유 일정. 이 허브의 .ics를 가져오기', st:'url'},
    ],
    rules: [
      {id:'r1', title:'급여 지급', cat:'pay', type:'monthly', day:'payday', shift:'prev', note:'진우 급여 → 급여대장 결재 → 이체', sop:'pay'},
      {id:'r2', title:'급여 계산·급여대장 결재', cat:'pay', type:'monthly', day:20, shift:'prev', note:'근태·연차 반영 후 진우 급여 메뉴에서 계산', sop:'pay', verify:true},
      {id:'r3', title:'원천세 신고·납부 (지방소득세 포함)', cat:'tax', type:'monthly', day:10, shift:'next', note:'반기납부 승인 기관이면 1·7월만 해당. 홈택스·위택스'},
      {id:'r4', title:'4대보험료 납부', cat:'ins', type:'monthly', day:10, shift:'next', note:'전월분 고지서 확인 (EDI)'},
      {id:'r5', title:'4대보험 취득·상실 신고 확인', cat:'ins', type:'monthly', day:15, shift:'next', note:'사유 발생 다음 달 15일까지. 입·퇴사자 있을 때만'},
      {id:'r6', title:'간이지급명세서 제출', cat:'tax', type:'monthly', day:'last', shift:'next', note:'근로소득(상용)·일용·사업소득 해당분. 센터 적용 대상 확인'},
      {id:'r7', title:'월 회계마감 (진우 전표 정리)', cat:'acc', type:'monthly', day:'last', shift:'prev', note:'수기 엑셀과 대조 후 마감', sop:'monthclose'},
      {id:'r8', title:'CMS 후원금 입금 대사', cat:'don', type:'monthly', day:26, shift:'next', note:'CMS 출금일 기준으로 날짜 조정', sop:'monthclose', verify:true},
      {id:'r9', title:'월초 전월 정리', cat:'acc', type:'monthly', day:3, shift:'next', note:'전월 전표·재원별 요약', sop:'monthclose', verify:true},
      {id:'y1', title:'근로소득 지급명세서 제출 (연말정산)', cat:'tax', type:'yearly', month:3, day:10, shift:'next', note:'', sop:'yearend'},
      {id:'y2', title:'건강보험 보수총액 신고', cat:'ins', type:'yearly', month:3, day:10, shift:'next', note:''},
      {id:'y3', title:'고용·산재 보수총액 신고', cat:'ins', type:'yearly', month:3, day:15, shift:'next', note:''},
      {id:'y4', title:'전년도 결산보고서 제출', cat:'acc', type:'yearly', month:3, day:31, shift:'next', note:'관할 구청. 사회복지법인 및 사회복지시설 재무·회계 규칙 기준', sop:'budget'},
      {id:'y5', title:'후원금 수입·사용결과 보고·공개', cat:'don', type:'yearly', month:3, day:31, shift:'next', note:'결산 제출과 함께', sop:'budget'},
      {id:'y6', title:'기부금영수증 발급명세서 제출', cat:'don', type:'yearly', month:6, day:30, shift:'next', note:'센터 해당 여부 확인', verify:true},
      {id:'y7', title:'다음 연도 예산서 제출', cat:'acc', type:'yearly', month:12, day:26, shift:'prev', note:'회계연도 개시 5일 전까지', sop:'budget'},
      ...HO_RULES,
      {id:'o1', title:'전임자 퇴사 · 인수 완료', cat:'etc', type:'once', date:'2026-09-29', shift:'none', note:'반복업무·마감 목록을 캘린더에 모두 등록했는지 확인'},
    ],
    done: {},
    routines: [
      {id:'rt1', name:'월초 정리', freq:'monthly', when:'매월 1~5일', steps:[
        {t:'전월 전표 입력 누락 확인 (진우)'},
        {t:'수기 엑셀 ↔ 진우 장부 대조', link:'bridge'},
        {t:'재원×월 요약표 갱신', link:'bridge'},
        {t:'4대보험 고지서 확인 (EDI)'},
        {t:'원천세 신고 자료 준비'}]},
      {id:'rt2', name:'급여', freq:'monthly', when:'매월 20~25일', steps:[
        {t:'입퇴사자 일할계산 · 4대보험 고지내역 저장', link:'handover'},
        {t:'진우 급여정보 입력 → 급여계산', link:'handover'},
        {t:'급여지급관리 보험료 실제 고지액으로 수정 (이후 재계산 금지)', link:'handover'},
        {t:'급여베이스·사회보험부담금 대사', link:'handover'},
        {t:'재원별 급여 기안·결재', link:'handover'},
        {t:'보탬e 인건비 집행요청', link:'handover'},
        {t:'급여·보험료·퇴직적립금 예약이체', link:'handover'},
        {t:'명세서 발송·송금확인증 전달', link:'handover'},
        {t:'원천세 신고 엑셀 입력', link:'handover'}]},
      {id:'rt3', name:'월말 마감', freq:'monthly', when:'매월 말일 전후', steps:[
        {t:'CMS 후원금 입금 대사'},
        {t:'지출결의서·증빙 누락 점검', link:'docs'},
        {t:'진우 전표 입력 완료 체크', link:'bridge'},
        {t:'월별 장부 출력 (진우)'},
        {t:'간이지급명세서 제출 대상 확인'}]},
      {id:'rt4', name:'연말·연초', freq:'yearly', when:'12월~3월', steps:[
        {t:'다음 연도 예산안 작성·진우 입력'},
        {t:'연말정산 자료 수집·진우 처리'},
        {t:'근로소득 지급명세서 제출 (3/10)'},
        {t:'보수총액 신고 (건강 3/10, 고용·산재 3/15)'},
        {t:'결산서 작성·진우 연 장부 출력'},
        {t:'결산보고·후원금 사용결과 보고 (3/31)'}]},
      {id:'rt5', name:'추경예산', freq:'adhoc', when:'필요 시', steps:[
        {t:'재원별 세입 변동 확인 (후원·보조금)'},
        {t:'관·항·목별 증감안 작성 (엑셀)'},
        {t:'결재 및 이사회/운영위 보고'},
        {t:'진우 추경예산 입력·출력'},
        {t:'재원×월 요약표 갱신', link:'bridge'}]},
    ],
    checks: {},
    staff: [
      {id:'s1', name:'김휘원', birth:'', dept:'사무행정팀', pos:'간사', hired:'2025-04-02', left:'', duty:'인사·급여, 후원자 관리, 문서 처리'},
      {id:'s2', name:'홍길동 (예시)', birth:'1990-05-12', dept:'권익옹호팀', pos:'팀장', hired:'2021-03-02', left:'', duty:'권익옹호 사업 총괄'},
      {id:'s3', name:'김예시 (예시)', birth:'1995-11-03', dept:'자립지원팀', pos:'활동가', hired:'2023-07-01', left:'2025-12-31', duty:'자립생활 기술훈련 운영'},
    ],
    docLog: [],
    docSeq: {},
    entered: {},
    imports: {},
  };
}

/* ---------- schedule expansion ---------- */
const isHoliday = d => { const k = ymd(d); return !!S.holidays[k]; };
const isOff = d => d.getDay() === 0 || d.getDay() === 6 || isHoliday(d);
function shiftDay(d, how) {
  if (how === 'none') return d;
  let x = new Date(d), step = how === 'prev' ? -1 : 1, guard = 0;
  while (isOff(x) && guard++ < 14) x = addDays(x, step);
  return x;
}
function ruleDay(rule, y, m) { // m: 0-based
  const last = new Date(y, m+1, 0).getDate();
  let day = rule.day === 'payday' ? Number(S.settings.payday) : rule.day === 'last' ? last : Number(rule.day);
  return new Date(y, m, Math.min(day, last));
}
// returns [{rule, date(Date), orig(Date), key}]
function occurrences(from, to) {
  const out = [];
  for (const r of S.rules) {
    if (r.off) continue;
    if (r.type === 'once') {
      const d = parseYmd(r.date);
      if (d >= from && d <= to) out.push(mk(r, d, d));
      continue;
    }
    let y = from.getFullYear(), m = from.getMonth() - 1; // start 1 month earlier to catch shifted dates
    const endY = to.getFullYear(), endM = to.getMonth() + 1;
    while (y < endY || (y === endY && m <= endM)) {
      const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
      if (r.type === 'monthly' || (r.type === 'yearly' && (Array.isArray(r.month) ? r.month.map(Number).includes(mm + 1) : Number(r.month) - 1 === mm))) {
        const orig = ruleDay(r, yy, mm), d = shiftDay(orig, r.shift);
        if (d >= from && d <= to) out.push(mk(r, d, orig));
      }
      m++; if (m >= 12) { m -= 12; y++; }
    }
  }
  return out.sort((a, b) => a.date - b.date || a.rule.title.localeCompare(b.rule.title));
  function mk(rule, date, orig) { const key = rule.id + '@' + ymd(orig); return {rule, date, orig, key, done: !!S.done[key]}; }
}
function overdueList() {
  const t = today(), since = S.settings.since ? parseYmd(S.settings.since) : addDays(t, -45);
  const from = since > addDays(t, -45) ? since : addDays(t, -45);
  return occurrences(from, addDays(t, -1)).filter(o => !o.done);
}
function overdueCount() { try { return overdueList().length; } catch (e) { return 0; } }
function dday(d) {
  const n = Math.round((d - today()) / 864e5);
  return n === 0 ? '오늘' : n > 0 ? `D-${n}` : `D+${-n}`;
}
function toggleDone(key) { if (S.done[key]) delete S.done[key]; else S.done[key] = Date.now(); save(); }

/* ---------- routine periods ---------- */
function periodKey(rt, d = today()) {
  if (rt.freq === 'monthly') return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
  if (rt.freq === 'yearly') { const s = d.getMonth() >= 9 ? d.getFullYear() : d.getFullYear() - 1; return `${s}년 말~${s+1}년 초`; } // 10월에 새 사이클 시작
  return S.checks[rt.id + ':adhoc-cur'] || '1차';
}
function routineState(rt, period = periodKey(rt)) {
  const arr = S.checks[rt.id + '@' + period] || [];
  const done = rt.steps.filter((_, i) => arr[i]).length;
  return {period, arr, done, total: rt.steps.length};
}
