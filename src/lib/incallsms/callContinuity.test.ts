// T68 / AC-059·AC-060 구조 불변식 회귀 방어 (Architecture.md §15.1.1 · §15.6 G10/G11).
//
// **왜 소스 텍스트를 검사하는가**: 이 태스크의 하드 요구("문자를 보는 동안 통화가 끊기지 않는다")는
// 렌더 **구조**로만 지켜진다 — 오버레이를 early return하거나 상위 래퍼로 감싸거나 별도 라우트로
// 옮기는 순간 GeminiVoiceSession/RealtimeVoiceSession이 언마운트돼 실시간 세션·마이크·타이머가
// 통째로 끊긴다(§15.6 G10). 이 저장소에는 React 렌더러 테스트 러너가 없어 마운트 유지를 런타임으로
// 관측할 수 없으므로, **깨지는 방식이 정해져 있는** 이 불변식을 소스 수준에서 고정한다.
// (동적 렌더 검증의 대체가 아니라, 회귀가 조용히 들어오는 것을 막는 최소 방어다.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync("src/app/session/play/page.tsx", "utf8");
const overlay = readFileSync("src/components/InCallSmsOverlay.tsx", "utf8");

/** 금지 토큰 검사는 **주석을 제외한 실제 코드**만 본다 — 이 저장소는 "왜 하지 않는가"를 주석에
 *  길게 남기는 관례라, 주석까지 세면 근거를 적었다는 이유로 테스트가 깨진다
 *  (`src/components/mockScreenCopy.test.ts`와 같은 관례). */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const overlayCode = codeOnly(overlay);

test("[AC-059/G10] 문자 오버레이는 세션 컴포넌트의 형제 노드로, 그 뒤에 조건부 렌더된다", () => {
  const gemini = page.indexOf("<GeminiVoiceSession");
  const elevenlabs = page.indexOf("<RealtimeVoiceSession");
  const overlayRender = page.indexOf("<InCallSmsOverlay");
  assert.ok(gemini > 0 && elevenlabs > 0, "세션 컴포넌트가 이 화면에 있어야 한다");
  assert.ok(overlayRender > gemini && overlayRender > elevenlabs, "오버레이는 형제로 뒤에 온다");
  // early return 금지 — `if (smsOverlayOpen) return`류가 들어오면 세션이 언마운트된다.
  assert.ok(
    !/if\s*\(\s*smsOverlayOpen\s*\)\s*return/.test(page),
    "오버레이를 early return으로 렌더하면 통화가 끊긴다(§15.6 G10)",
  );
  // 조건부 렌더 형태 자체를 고정한다.
  assert.ok(page.includes("{smsOverlayOpen && ("), "조건부 형제 렌더여야 한다");
});

test("[AC-059] 문자 오버레이는 라우트가 아니다 — 신규 라우트도, 오버레이 경로의 router.push도 없다", () => {
  const routeDirs: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        routeDirs.push(full.replace(/\\/g, "/"));
        walk(full);
      }
    }
  };
  walk("src/app");
  assert.ok(
    !routeDirs.some((d) => /session\/sms|session\/messages|sms-overlay/.test(d)),
    `문자 전용 라우트를 만들면 통화가 끊긴다(D-35): ${routeDirs.join(", ")}`,
  );
  // 오버레이 컴포넌트 자체가 라우터를 알지 못한다(구조적으로 이동이 불가능).
  assert.ok(!overlay.includes("useRouter"), "오버레이는 라우터를 쓰지 않는다");
  // 주석에 등장하는 언급과 구분하려고 호출 형태(괄호 포함)로 검사한다.
  assert.ok(!overlay.includes("router.push("), "오버레이에서 라우팅하면 통화가 끊긴다");
  // 열기/닫기 핸들러가 라우팅하지 않는다.
  const openHandler = page.slice(
    page.indexOf("const handleOpenSmsOverlay"),
    page.indexOf("const handleRecordSmsEvent"),
  );
  assert.ok(openHandler.length > 0, "열기/닫기 핸들러를 찾을 수 있어야 한다");
  assert.ok(!openHandler.includes("router.push("), "열기/닫기는 상태만 바꾼다");
});

test("[AC-059/§15.1.3] 오버레이 상태는 마이크 게이팅에만 들어가고 타이머·한도 종료에는 들어가지 않는다", () => {
  // 마이크 입력만 정지 — 두 세션 컴포넌트 모두에 오버레이 상태가 muted와 함께 전달돼야 한다.
  // ⚠️ T83(§16.2)에서 확인 오버레이가 **같은 규칙**으로 추가됐다: `muted || smsOverlayOpen ||
  // verifyOverlayOpen`. 검사를 느슨하게 푼 것이 아니라 **두 오버레이 모두**를 요구하도록 좁혔다.
  const mutedProps = page.match(/muted=\{muted \|\| smsOverlayOpen \|\| verifyOverlayOpen\}/g) ?? [];
  assert.equal(mutedProps.length, 2, "실시간 두 경로 모두 마이크만 게이팅해야 한다");

  // 경과 타이머 effect의 의존성에 오버레이 상태가 들어가면 통화 타이머가 멈춘다.
  const timerStart = page.indexOf("// 통화 경과 타이머");
  const timerBlock = page.slice(timerStart, page.indexOf("// finding #2", timerStart));
  assert.ok(timerBlock.length > 0);
  assert.ok(
    !timerBlock.includes("smsOverlayOpen"),
    "경과 타이머는 오버레이와 무관해야 한다(§15.1.1)",
  );

  // 한도 자동 종료 effect의 **조건·의존성**에도 들어가면 안 된다(오버레이 닫기 호출 자체는 허용).
  const autoEndStart = page.indexOf("const autoEndedRef");
  const autoEndBlock = page.slice(autoEndStart, page.indexOf("}, [callMode, phase, elapsedSec", autoEndStart));
  assert.ok(autoEndBlock.includes("setSmsOverlayOpen(false)"), "한도 도달 시 오버레이를 먼저 내린다");
  assert.ok(
    !/if\s*\([^)]*smsOverlayOpen/.test(autoEndBlock),
    "오버레이가 열려 있다고 한도 종료가 멈추면 안 된다(AC-059/UX-027 Failure (d))",
  );
});

test("[AC-006/G11] 오버레이 안에서 '훈련 종료'와 모의 표식에 도달할 수 있다", () => {
  assert.ok(overlay.includes("EndTrainingButton"), "오버레이 자체에 종료 컨트롤이 있어야 한다");
  assert.ok(overlay.includes("SyntheticLabel"), "모의·합성 표식이 상시 노출돼야 한다(AC-022)");
  assert.ok(overlay.includes('aria-modal="true"'), "다이얼로그 관례(UX-023과 동일)");
  // 포커스 트랩이 종료 버튼을 가두지 않는지는 "종료가 트랩 안에 있다"로 보장된다 —
  // 트랩 대상(panelRef) 안에 EndTrainingButton이 렌더된다.
  const panelStart = overlay.indexOf("ref={panelRef}");
  assert.ok(panelStart > 0 && overlay.indexOf("EndTrainingButton", panelStart) > panelStart);
});

test("[AC-060] 오버레이는 읽기 전용이다 — 전송 경로도, 실 URL도 없다", () => {
  for (const forbidden of ["sendMessage", "href=", "http://", "https://", "window.open"]) {
    assert.ok(!overlay.includes(forbidden), `읽기 전용 화면에 있으면 안 되는 것: ${forbidden}`);
  }
  // 클립보드 자동 복사 금지(AC-061 — 앱이 "복사해서 붙여 넣는" 동선을 대신 만들지 않는다).
  assert.ok(!overlay.includes("clipboard"), "인증번호를 자동 복사하면 안 된다(AC-061)");
  assert.ok(!page.includes("clipboard"));
  // 링크는 기존 인앱 가짜 랜딩(UX-023)을 재사용한다 — 신규 랜딩을 만들지 않는다(D-37).
  assert.ok(overlay.includes("MessengerFakeLanding"), "기존 가짜 랜딩을 재사용해야 한다");
});

// ── G80(Architecture.md §19.8) — **입력 어포던스 부재**를 소스 스캔으로 고정한다 ────────────
//
// **왜 지금 넣는가.** UX가 D-57 Impact에서 *"문자앱을 닮게 만들다 하단 입력창을 넣는 것이 가장 흔한
// 실수"* 라고 직접 경고했고, Architecture.md:2667(G80)이 *"입력 어포던스 부재를 소스 스캔 단언으로
// 추가할 것(`<input`·`<textarea`·`onSubmit` 0건)"* 을 명시했다. 위 `[AC-060]` 테스트는 **전송
// 경로**(`sendMessage`·`href=`·`window.open`·clipboard)만 보고 **입력 어포던스는 보지 않는다** —
// 입력창은 전송 API 없이도 들어올 수 있고(로컬 state만 바꾸는 가짜 답장 입력창), 그 순간 AC-060의
// *"답장·전달·전송 경로가 UI·API에 존재하지 않는다"* 가 UI 쪽에서 먼저 깨진다.
//
// ⚠️ **검사 대상은 이 파일(`InCallSmsOverlay.tsx`) 하나다.** 이 오버레이가 열어 주는 가짜 랜딩
// (`MessengerFakeLanding.tsx`)에는 입력 필드가 **정당하게 있다**(kind=`credential-form`은 입력을
// 허용하는 안전 계약이다 — UX-023 v1.13 (2)). 별도 파일이라 이 스캔에 잡히지 않으며, 그것이 맞다.
// 여기서 막는 것은 **문자함 자체가 대화·답장 표면이 되는 것**이다(읽기 전용 문자함, UX-027 v1.11).
//
// ⚠️ **T103(문자 표면 반전)과의 관계 — 이 단언은 T103을 방해하지 않는다.** T103 범위는 주/부 반전·
// 전환 연출·아코디언 카드 → 말풍선 스레드·상단 문단 제거·여백 통일이며(docs/Tasks.md T103), 그중
// 입력 어포던스를 **추가하는 항목은 없다.** 오히려 T103의 완료 판정 필수 증거 ②가 *"입력창·답장·
// 전달 어포던스가 0건임을 자동 검증하고, 입력창을 하나 넣으면 실제로 실패한다는 역방향 확인 출력"*
// 을 요구한다 — 이 테스트가 바로 그 자동 검증이다. T103이 이 파일을 개편해도 말풍선·스크롤·
// 애니메이션은 전부 표시 요소라 아래 토큰과 무관하다.
const INPUT_AFFORDANCE_TOKENS = [
  // G80이 이름을 콕 집은 3종.
  "<input",
  "<textarea",
  "onSubmit",
  // 같은 부류의 우회 형태 — 폼·편집 가능 영역·텍스트박스 롤도 "답장을 쓰는 자리"를 만든다.
  "<form",
  "contentEditable",
  'role="textbox"',
];

test("[G80/AC-060] 문자함에 입력 어포던스가 **하나도 없다**(읽기 전용 — D-57 최빈 사고)", () => {
  for (const token of INPUT_AFFORDANCE_TOKENS) {
    assert.ok(
      !overlayCode.includes(token),
      `읽기 전용 문자함에 입력 어포던스가 들어왔다: ${token} — ` +
        "사용자가 답장을 쓰는 채널을 만들면 AC-060(답장·전달·전송 경로 부재)이 깨진다(G80). " +
        "가짜 랜딩(MessengerFakeLanding.tsx)의 입력 필드는 별개이며 정당하다.",
    );
  }
  // 스캔이 실제 코드를 보고 있다는 것도 함께 고정한다(빈 문자열을 훑고 통과하는 상태 방지).
  assert.ok(overlayCode.includes("InCallSmsOverlay"), "주석 제거 후에도 컴포넌트 코드가 남아야 한다");
});

test("[G80/역검증] 입력창을 하나 넣으면 위 스캔이 실제로 실패한다", () => {
  // ⚠️ 실제 파일을 오염시켰다 되돌리는 방식은 쓰지 않는다(되돌리기를 잊으면 그대로 배포된다) —
  // 이 저장소의 기존 관례대로 **테스트 코드 안에서만** 오염시킨다(mockScreenCopy.test.ts 선례).
  // ⚠️ **T103 후 표면 언어로 갱신했다**(Architecture.md §23.3 (2) 나). 예전 샘플은 아코디언 시절의
  // `<form onSubmit>` 덩어리였는데, 말풍선 스레드로 바뀐 뒤의 최빈 실수는 P-27 (6)이 콕 집은
  // **"스레드 하단 입력 바"**다 — 스크롤 영역 아래에 `shrink-0` 바를 하나 붙이고 거기에 입력창과
  // 전송 버튼을 넣는 형태. 샘플이 낡으면 이 역검증이 **현재 화면과 무관한 증명**이 된다.
  const poisoned = `${overlayCode}
          {/* 스레드 하단 입력 바 — 실제 문자앱을 닮게 만들다 넣게 되는 바로 그 형태 */}
          <div className="flex shrink-0 items-center gap-2 border-t border-[#E2DDD3] bg-white px-4 py-3">
            <form onSubmit={handleSendReply} className="flex flex-1 items-center gap-2">
              <input
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder="메시지 보내기"
                className="min-h-[44px] flex-1 rounded-full border px-4"
              />
              <textarea className="hidden" />
              <button type="submit" className="min-h-[44px] rounded-full px-4">
                전송
              </button>
            </form>
          </div>`;
  const caught = INPUT_AFFORDANCE_TOKENS.filter((token) => poisoned.includes(token));
  assert.deepEqual(
    caught.sort(),
    ["<form", "<input", "<textarea", "onSubmit"].sort(),
    `오염 샘플이 G80 토큰에 실제로 걸려야 한다(잡힌 것: ${caught.join(", ")})`,
  );
  // 그리고 깨끗한 현재 소스는 하나도 걸리지 않는다(대조군).
  assert.deepEqual(INPUT_AFFORDANCE_TOKENS.filter((token) => overlayCode.includes(token)), []);
});

// ── T103(전면 문자함 + 통화 필) 구조 불변식 ────────────────────────────────────
//
// 표현 계층 개편이라 "화면이 어떻게 보이는가"는 런타임 관찰로 낸다(완료 증거 ①③④⑤⑦).
// 여기서 고정하는 것은 **관찰로는 잡히지 않고 조용히 회귀하는** 구조 조건뿐이다.

test("[T103/P-27 (2)] 통화 필은 5요소를 담고, 발신자는 callerLabel prop 하나만 읽는다(G87 계승)", () => {
  // ①상대 표기 ②경과 ③"통화 중" 텍스트(색·아이콘 단독 금지) ④최신 사기범 자막(aria-live) ⑤탭=복귀
  for (const required of ["callerLabel", "elapsedLabel", "통화 중", "scammerCaption", 'aria-live="polite"']) {
    assert.ok(overlayCode.includes(required), `통화 필의 필수 구성요소가 없다: ${required}`);
  }
  // ⛔ 두 번째 발신자 소스 금지(§23.7 C2) — 필이 `scenario`·`verifyOffer`를 직접 읽기 시작하면
  // T110이 확정한 우선순위가 UI 층에서 갈라져 "전환 후 필에 원 화자가 남는" 결함이 되살아난다.
  for (const forbidden of ["reconnectedCallerLabel", "verifyOffer", "scenario."]) {
    assert.ok(!overlayCode.includes(forbidden), `필이 새 발신자 소스를 읽고 있다: ${forbidden}`);
  }
  // 호출부는 이미 G87 우선순위로 계산한 값을 그대로 넘긴다.
  assert.ok(page.includes("callerLabel={callerLabel}"), "호출부가 계산한 발신자를 그대로 넘겨야 한다");
});

test("[T103/G79·G93] 필 자막은 **사기범 턴만** 받는다(참가자 PII가 마스킹 없이 남지 않게)", () => {
  const turnStart = page.indexOf("const handleTranscriptTurn");
  const turnBlock = page.slice(turnStart, page.indexOf("}, []);", turnStart));
  assert.ok(turnStart > 0 && turnBlock.length > 0, "전사 턴 핸들러를 찾을 수 있어야 한다");
  assert.ok(
    /if\s*\(\s*role\s*===\s*"scammer"\s*\)\s*setLiveScammerCaption/.test(turnBlock),
    "참가자 턴을 필에 그리면 참가자가 말한 계좌·생년월일이 마스킹 없이 화면에 남는다(§19.6 (4))",
  );
  // 실시간 경로는 통화 중 `messages`가 갱신되지 않으므로 폴백 값만 쓰면 주 경로에서 자막이 영영
  // 안 뜬다(§19.6 (1) 3행). 실시간 우선 + 폴백 계승이 계약이다.
  assert.ok(
    page.includes("const pillCaption = liveScammerCaption ?? latestScammerLine;"),
    "필 자막은 실시간 턴 자막 우선, 폴백 계승이어야 한다",
  );
  assert.ok(page.includes("scammerCaption={pillCaption}"), "필 자막이 오버레이로 배선돼야 한다");
});

test("[T103/§23.6 A2] 신설 전환 클래스는 **전부** prefers-reduced-motion에서 꺼진다", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  // 화면이 실제로 쓰는 전환 클래스만 대상으로 한다(정의만 하고 안 쓰는 클래스는 검증 의미가 없다).
  const used = [
    ...new Set(
      [...overlayCode.matchAll(/\bsms-[a-z-]+\b/g), ...codeOnly(page).matchAll(/\bsms-[a-z-]+\b/g)].map(
        (m) => m[0],
      ),
    ),
  ].sort();
  assert.ok(used.length >= 3, `전환 클래스를 찾지 못했다(찾은 것: ${used.join(", ") || "없음"})`);

  const reduceBlocks = [
    ...css.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/g),
  ]
    .map((m) => m[1])
    .filter((block) => /animation:\s*none/.test(block));
  assert.ok(reduceBlocks.length > 0, "reduced-motion 폴백 블록을 찾을 수 있어야 한다");

  for (const cls of used) {
    assert.ok(
      new RegExp(`\\.${cls}\\s*[,{]`).test(css),
      `globals.css에 정의되지 않은 전환 클래스를 쓰고 있다: .${cls}`,
    );
    assert.ok(
      reduceBlocks.some((block) => new RegExp(`\\.${cls}\\s*[,{]`).test(block)),
      `.${cls}가 reduced-motion에서 꺼지지 않는다 — 연출은 몰입 보조일 뿐 필수가 아니다(§23.6 A2/A3)`,
    );
  }
});

test("[T103/G89] 퇴장 연출은 컴포넌트 내부 상태로만 — 호스트의 언마운트를 지연시키지 않는다", () => {
  // 호스트에 두 번째 오버레이 상태를 만들면 한도 도달 시 **종료 고지가 연출 시간만큼 가려진다**
  // (AC-059). `{smsOverlayOpen && (` 형태 자체는 위 [AC-059/G10]이 이미 고정한다.
  for (const forbidden of ["smsOverlayVisible", "smsOverlayClosing", "smsOverlayExiting"]) {
    assert.ok(!page.includes(forbidden), `호스트에 퇴장 지연 상태가 생겼다: ${forbidden}`);
  }
  assert.ok(overlayCode.includes("onAnimationEnd"), "퇴장 완료는 컴포넌트 안에서 감지해야 한다");
  assert.ok(overlayCode.includes("setClosing"), "퇴장 상태는 컴포넌트 내부에 있어야 한다");
  // reduced-motion이면 animationend가 영영 오지 않으므로 즉시 닫는 갈래가 반드시 있어야 한다.
  assert.ok(
    overlayCode.includes("prefersReducedMotion()"),
    "연출이 꺼진 환경에서 문자함이 닫히지 않는 상태가 된다(§23.6 A3)",
  );
});

test("[T103/D-56] 문자 도착만으로는 문자함이 열리지 않는다 — 여는 경로는 참가자 탭 하나뿐", () => {
  // ⚠️ 주석을 제외한 실제 코드만 센다 — 이 저장소는 "왜 부르지 않는가"를 주석에 그 호출 형태
  // 그대로 적는 관례라, 주석까지 세면 근거를 적었다는 이유로 개수가 어긋난다(위 codeOnly와 같은 이유).
  const pageCode = codeOnly(page);
  const opens = pageCode.match(/setSmsOverlayOpen\(true\)/g) ?? [];
  assert.equal(opens.length, 1, "문자함을 여는 지점은 하나여야 한다(자동 전환 훅 금지 — G92)");
  const openHandler = pageCode.slice(
    pageCode.indexOf("const handleOpenSmsOverlay"),
    pageCode.indexOf("const handleCloseSmsOverlay"),
  );
  assert.ok(
    openHandler.includes("setSmsOverlayOpen(true)"),
    "유일한 열기 지점은 참가자 탭 핸들러 안이어야 한다(R-9는 사용자 판단 대기 — 확정 전 구현 금지)",
  );
});

test("[T103/D-57] 아코디언·설명 문단·브레이크포인트 이중 규칙이 남아 있지 않다", () => {
  for (const stale of ["aria-expanded", "▼", "▲"]) {
    assert.ok(!overlayCode.includes(stale), `아코디언 잔재가 남았다: ${stale}`);
  }
  assert.ok(
    !overlayCode.includes("통화는 그대로 연결돼 있습니다"),
    "상단 설명 문단은 제거됐다(D-57 ㄷ) — 그 사실은 통화 필이 상시·실시간으로 증명한다",
  );
  assert.ok(
    !/\bsm:/.test(overlayCode),
    "모서리·여백은 세 브레이크포인트 동일 규칙이어야 한다(D-57 ㄹ · Responsive v1.13)",
  );
});

// 사용자 브라우저 실측 버그(2026-07-25) — 문자를 전부 읽은 뒤에도 sr-only aria-live 영역이
// "문자 0건이 도착했습니다."를 계속 알렸다. 시각적으로는 안 보이지만 스크린리더 사용자에게는
// 사실과 다른 안내가 매번 들린다. 알릴 사실이 있을 때(미확인 ≥ 1)만 문구를 채운다.
test("[P-4/P-20] 미확인 문자가 0건이면 aria-live 영역이 아무것도 알리지 않는다", () => {
  const liveStart = page.indexOf('<p aria-live="polite" className="sr-only">');
  assert.ok(liveStart > 0, "문자 도착용 sr-only aria-live 영역을 찾을 수 있어야 한다");
  const liveBlock = page.slice(liveStart, page.indexOf("</p>", liveStart));
  assert.ok(
    liveBlock.includes("smsUnreadCount > 0 ?"),
    "미확인 건수를 조건으로 써야 한다(도착 여부 latestSms로 게이팅하면 0건 안내가 남는다)",
  );
  assert.ok(
    !/\{latestSms \?/.test(liveBlock),
    "latestSms로 게이팅하면 전부 읽은 뒤에도 '문자 0건이 도착했습니다.'가 계속 읽힌다",
  );
});
