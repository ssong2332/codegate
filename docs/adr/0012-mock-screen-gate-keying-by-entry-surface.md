# ADR-0012: 모의 화면 카탈로그의 안전 게이트를 "시나리오 채널"이 아니라 "항목의 진입 표면 + kind"에 건다

- Status: accepted
- Date: 2026-07-27
- Owner: architect
- DECISIONS.md entry: #47

## Context

UX v1.13(D-58)은 사용자 실사용 신고 *"주어지는 링크를 들어가면 항상 똑같은 페이지가 나온다"* 에 대해, 랜딩 4종에 상황별 콘텐츠를 붙이되 **신규 kind·신규 화면 계열은 만들지 않는다**고 확정했다. 그중 3종(`loan-refinance-apply`·`tax-refund-claim`·`courier-customs-check`)은 **통화 중 문자(`IN_CALL_SMS`) 경로**에서 열린다.

이 셋을 T84가 만든 `MOCK_SCREENS` 카탈로그에 넣으면 **3개 테스트 4개 단언이 깨진다**(ux-design이 센 것은 2건이었고, 실측으로 G53과 G55의 `VERIFY_INTERCEPT` 절반이 추가로 발견됐다):

| 단언 | 위치 |
|---|---|
| G53 — 모든 landingId ∈ `LINK_LABELS` | `functions/src/scenarios/__tests__/mockScreens.test.ts:120-134` |
| G55-a — scenarioId ∩ `IN_CALL_SMS` = ∅ | 같은 파일 `:141-146` |
| G55-b — scenarioId ∩ `VERIFY_INTERCEPT` = ∅ | 같은 파일 `:147-151` |
| 모든 scenarioId의 `channel === "messenger"` | 같은 파일 `:174-179` |

네 단언의 **원문 사유**를 추적하면 셋은 전부 `kind === "app-install"`을, 하나는 `extractLinkMarker` 렌더 경로를 가리킨다:
- G55: *"`turnInstruction` 슬롯이 문자열 1개뿐이라 두 지시가 due이면 하나가 밀린다"*(Architecture.md §15.9.7 G55, §15.9.3). 그런데 `turnInstruction`을 만드는 경로는 `hasAppInstallMockScreen()` 게이트 뒤에만 있고(`functions/src/roleplay/index.ts:213` → `mockScreens.ts:117-124`), 지시의 전제인 `consentedAt`은 `kind !== "app-install"`이면 콜러블이 거부한다(`functions/src/mockScreens/index.ts:74-76`). 게다가 경합 규칙은 이미 코드로 구현돼 있다(`functions/src/verifyIntercept/fallbackTurn.ts:52-65`).
- `channel==="messenger"`: 단언 메시지 원문이 *"모의 설치는 메신저 단계에서 일어난다(UF-012 Step 2)"* 이고, 상위 규칙 §15.9.1 R6은 *"통화 중 문자를 통해 **`app-install` kind가 열리는 경로**는 범위 밖"* 이다 — 채널 자체를 금지한 것이 아니다.
- G53: *"`extractLinkMarker`가 기본 라벨('확인하기')로 떨어지면"* — 통화 경로 칩은 `InCallSmsItem.linkDisplayText`가 그리며 `extractLinkMarker`를 타지 않는다.

동시에, 통화 경로 랜딩은 **현재 어떤 정합 게이트도 타지 않는다**: `inCallSms.ts`의 `fakeLandingId` 3종은 `LINK_LABELS`에 없어 G53을, `MOCK_SCREENS`에 없어 `findMockScreenItem` 소속 재검증을 각각 애초에 우회한다.

## Decision

**게이트를 삭제하지 않는다. `MockScreenItem`에 필수 필드 `entrySurface: "messenger-link" | "in-call-sms"`를 도입해, 네 단언의 판정 키를 "시나리오의 채널/소속"에서 "항목이 스스로 선언한 진입 표면 + kind"로 옮긴다. 정밀화보다 먼저 신규 게이트(진입 표면 ↔ kind 정합, 양방향 참조 정합)를 넣는다.**

| Option | Pros | Cons |
|---|---|---|
| **A. `entrySurface` 도입 + 4개 단언을 kind/표면 스코프로 정밀화 + 신규 게이트 2건** ✅ | 실측 사유와 조건이 **정확히 일치**한다. 조건이 **선언 필드 1개에 모여** 게이트마다 갈리지 않는다. 새 항목이 표면을 선언하지 않으면 **타입이 깨진다**. 콘텐츠가 서버 `MockScreenItem`에 들어가므로 `mockSurface` 프로파일의 **실존 기관명 검사**(`harmlessnessGate.test.ts:74-83` → `harmlessnessPatterns.ts:310-318`)를 자동으로 탄다. **통화 경로의 정합 구멍(M5)까지 함께 닫힌다** | 게이트 4건을 손대는 커밋이 생긴다(순서를 틀리면 위험 — G75로 순서를 강제). `MockScreenItem`이 `consentLabel` 옵셔널화 등 kind별 필드를 갖게 된다 |
| B. 단언을 그냥 삭제·완화 | 가장 짧다 | **M1(턴 지시 경합)·M2(app-install이 통화 경로로 열림)를 막던 것이 통째로 사라진다.** T84가 세운 것을 되돌리는 것 |
| C. 통화 경로 콘텐츠를 **별도 서버 카탈로그 파일**에 둔다 | 기존 게이트를 한 줄도 안 건드린다 | ⛔ **T86 무해화 게이트가 새 도메인을 순회하지 않는다**(`harmlessnessGate.test.ts:126-174`가 카탈로그별로 하드코딩 순회) → **국세청·관세청이 어디서도 안 걸린다.** 클라 스캔은 기관명을 의도적으로 제외한다(`harmlessnessScreens.test.ts:80-82`). D-58이 최대 위험으로 지목한 지점이 무방비가 된다 |
| D. 콘텐츠를 **클라 상수에만** 둔다 | 서버 변경 0 | C와 같은 이유로 기각 + 정본이 사라져 드리프트 테스트의 기준이 없어진다 |
| E. `LINK_LABELS`에 3종을 추가해 G53을 통과시킨다 | 1줄 | ⛔ 어떤 프롬프트도 안 내보내는 **죽은 라벨**이 3개 는다(`subsidy-apply` 선례). G53의 의미가 *"프롬프트가 내보내는 id"* → *"카탈로그에 있는 id"* 로 조용히 바뀐다 |

**정밀화된 조건(정본은 Architecture.md §19.2 (2) 판정표):**

| 게이트 | 이전 | 이후 |
|---|---|---|
| G53 | 모든 landingId ∈ `LINK_LABELS` | `entrySurface === "messenger-link"` 인 항목만 |
| G55-a/b | scenarioId ∩ `IN_CALL_SMS`/`VERIFY_INTERCEPT` = ∅ | **`app-install` 항목을 가진** scenarioId만 |
| channel | 모든 scenarioId가 `messenger` | **`app-install` 항목을 가진** scenarioId만 |
| **G-A(신규)** | — | `entrySurface === "in-call-sms"` ⇒ `kind !== "app-install"` |
| **G-B(신규)** | — | `IN_CALL_SMS.fakeLandingId` ↔ `MOCK_SCREENS` **양방향 참조 정합** |

## Consequences

- **Positive:** 네 단언이 각자의 원문 사유와 정확히 같은 조건을 검사하게 된다. 지금까지 어떤 게이트도 타지 않던 통화 경로 랜딩이 처음으로 정합 검사 대상이 된다(G-B). 상황별 콘텐츠가 실존 기관명 검사를 자동으로 타므로 D-58이 지목한 최대 위험이 기계로 막힌다. `app-install` 관련 불변식(R6·G54·G55 사유·AC-072 입력 필드 0)은 **하나도 약해지지 않고 오히려 양방향으로 검사된다**.
- **Negative / accepted trade-offs:**
  - `MockScreenItem`이 kind별 옵셔널 필드를 갖는다(`consentLabel`은 app-install 전용, `fields`/`submitLabel`/`successHeadline`은 credential-form 전용). `InCallSmsItem`의 `otpCode`/`linkDisplayText`와 **동형**이며, kind가 유일한 판별자라는 §14.9.1 원칙은 유지된다(부재를 판별자로 오버로드하지 않는다 — G-C가 kind↔필드 정합을 단언한다).
  - 게이트를 손대는 커밋이 생긴다. **순서를 강제한다**: ① `entrySurface` + 신규 게이트 → ② 기존 4개 단언 정밀화(①과 같은 커밋) → ③ 콘텐츠 항목 추가. 역순이면 그 사이에 원래 막으려던 사고가 열린다(G75). ⚠️ **이 줄은 아래 "사후 노트 (2026-07-27)"가 정밀화한다 — G-B에 대해서는 그대로 만족 불가능하다.**
  - `credential-form` 랜딩은 여전히 `deceivedMoments`로 승격되지 않는다(§15.9.5 e-1 계승) — 상황에 맞는 폼에 정보를 다 입력해도 리포트에 안 남는다. 승격에는 AC 근거가 필요해 **OQ-A19(planner)** 로 남긴다.
- **Follow-ups required:**
  - `src/components/mockScreenCopy.test.ts`의 드리프트 파서가 **항목 1개 전제**로 짜여 있다(`bodyLines`는 첫 블록만, 신규 필드는 정규식이 못 읽음) — 항목 단위 순회 + 대조 건수 단언으로 개편(**G76**).
  - `harmlessnessGate.test.ts`의 `MOCK_SCREEN_FIELDS`에 `entrySurface`(skip)·`issuerLabel`·`fields`·`submitLabel`·`successHeadline`(전부 `mockSurface`) 등록 — 타입 게이트가 강제한다.
  - 랜딩 4종의 정본 문자열은 **OQ-A17(ux-design)**.
  - planner에게 OQ-U28 AC 신설 시 검증 가능한 술어 2개를 권고(Architecture.md §19.9).

## 사후 노트 — G-B 커밋 배치 사후 추인 (2026-07-27, T104)

> 이 절은 **결정을 뒤집지 않는다**(accepted ADR은 immutable). 위 Consequences의 **순서 강제 문면이 G-B에 대해 구조적으로 만족 불가능**했다는 사실을 기록하고, 그 문면이 실제 커밋 이력과 모순된 채로 남지 않게 한다. **정본 판정표는 `docs/Architecture.md` §19.8.1.**

**사실:** T104 구현자는 G-A·G-C·G-D·G-E와 정밀화 4건을 ①커밋(`53240da`)에 넣고, **G-B만 ③커밋(`6dc9884` — 콘텐츠와 같은 커밋)** 에 두었다.

**판정: 추인한다.** 사유는 재량 인정이 아니라 **문면 결함**이다 — G-B 방향 ①(*"모든 `IN_CALL_SMS.fakeLandingId`가 같은 scenarioId의 `MOCK_SCREENS`에 존재"*)이 참조하는 데이터는 ③에서 들어오므로, ①에 두면 중간 커밋이 **반드시** 실패한다. 위 순서 강제는 그 경우를 예상하지 못했다.

| 검증 항목 | 결과 | 근거 |
|---|---|---|
| G-B가 미루는 사이 **새로 열리는 구멍**이 있는가 | **없다** | G-B가 닫는 것은 **M5**뿐이고(Architecture.md §19.2 (2) G-B 행), M5는 base에 이미 열려 있었다 — `inCallSms.ts:59,108,122`의 3종이 `linkMarker.ts:21-25`에도 `mockScreens.ts:92-94`에도 없다 |
| G75가 실제로 막으려던 **M2**가 열렸는가 | **열리지 않았다** | M2는 ①의 **G-A** · 무변경 **R6** · 정밀화된 **channel 단언**이 닫는다(§19.2 (2) 세 행) — 전부 ①커밋에 있다 |
| G-B를 ①에 억지로 넣었다면 더 나았는가 | **아니다** | ① 시점에 `entrySurface === "in-call-sms"` 항목이 0건이라 G-B 방향 ②는 **공허하게 참** — **G-E**가 막으려던 상태 그 자체가 된다 |

**정밀화된 규칙(느슨해지지 않는다):** 게이트 배치는 §19.8.1 판정표를 따른다. **배치-1**(이번 변경이 새로 여는 위험을 닫는 게이트) = **① 커밋, 예외 없음**. **배치-2**(base에 이미 열려 있던 위험을 닫고, 참조 데이터가 나중 커밋에 들어오는 게이트) = **참조 데이터와 같은 커밋 — 그보다 뒤로는 금지**. 표에 없는 케이스는 architect에게 행 추가를 먼저 묻는다.

**추인 범위:** G-B **1건뿐**. 배치-1 게이트를 ① 밖으로 미루는 것은 이 추인이 허용하지 않는다.

---
*Copy this file to `NNNN-slug.md` (numbering starts at 0001, never reuse numbers). Accepted ADRs are immutable — to change course, write a new ADR that supersedes this one.*
