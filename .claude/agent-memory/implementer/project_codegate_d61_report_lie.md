---
name: codegate-d61-report-lie
description: D-61 리포트 자기모순 수정 — 조인 키를 "조립 지점 1곳"으로 확정하는 법, 낙인 방향으로 폴백 금지, 루트/functions 러너 경계 때문에 증명을 2조각으로 쪼갠 사례
metadata:
  type: project
---

`fix/D61-submitted-display` (PR #140, 2026-07-28). 담당 태스크 번호 없이 구현만 요청받음.

## ⭐ 조인 키가 "미확인"으로 남았을 때 — 조립 지점을 찾아라
ux-design이 OQ-U32로 *"두 항목을 '같은 순간'으로 묶는 키가 보장되는가"* 를 남겼다.
답은 **스키마 비교가 아니라 승격을 조립하는 함수 1곳**에서 나왔다 —
`buildLandingSubmitMoment(item, anchor.anchorTurnIndex, anchor.timeLabel)`.
그 인자가 곧 키다(`moment.turnIndex === entry.anchorTurnIndex`, **정의상** 참).
후보 탈락도 같은 자리에서 결정된다: `landingId`는 순간 쪽 타입에 **없어서** 구조적으로 탈락.

**How to apply:** "두 배열이 같은 순간인가"류 질문은 필드 이름을 대조하지 말고
**한쪽을 만드는 코드**를 찾아라. 단일 조립 지점(G137류 "규칙은 한 벌" 패턴)이 있으면
키는 증명 대상이 아니라 *정의*가 된다.

## ⛔ 폴백은 "덜 단정하는 쪽"이 아니라 "낙인찍지 않는 쪽"
서버는 `anchorResolved && anchorTurnIndex >= 0`일 때만 승격한다 ⇒ **제출했어도 승격이 없는 경로**가 존재한다.
그 경로를 "승격 없음 = 응하지 않았다"로 읽으면 **속은 사람을 '잘 대응했다'고 칭찬**한다.
그래서 대조 불성립(`!anchorResolved || anchorTurnIndex < 0`)은 전부 중립 분기로 떨어뜨렸다.

**Why:** 표시 오류의 비용이 방향에 따라 비대칭이다. 중립 문구가 틀리면 정보 손실뿐이지만,
칭찬/비난 문구가 틀리면 참가자에게 거짓을 말한다.
**How to apply:** 사용자에게 **평가**를 내는 분기는 애매할 때 **평가하지 않는 쪽**으로. 대칭 취급 금지.
`[[feedback-false-reassurance-over-precision]]` 와 같은 계열.

## 루트 러너는 functions/src를 못 읽는다 — 증명을 쪼갠다
`node --experimental-strip-types`(루트 `npm test`)는 `functions/src/report/*.ts`를 import 못 한다:
그쪽 코드가 **확장자 없는 상대 import**(`from "./tacticCategory"`)를 쓰기 때문(ESM 해석 실패).
⇒ **키 증명은 functions 테스트**(`applyMockScreens` 실행), **분기 판정은 루트 테스트**(순수 함수)로 나누고,
두 파일 주석이 서로를 가리키게 해서 짝을 잃지 않게 했다.
`functions/lib/*.js`(빌드 산출물)는 스크래치패드 `.mjs`/`.mts`에서 **file:/// 절대 URL**로 import 가능 —
이 조합으로 서버 파생 + 클라 판정을 **한 프로세스에서** 돌려 3분기 독립 샘플을 냈다.
(상대 경로 `../../..`는 스크래치패드가 딴 드라이브 경로라 깨진다. file:/// 로 쓸 것.)

## 렌더러 없는 저장소에서 "화면이 규칙을 우회하는 것" 막기
순수 함수만 고정하면 화면이 다시 `mockScreen.consented ? … : …`로 되돌아가는 회귀를 못 잡는다
(React 렌더러 테스트 러너 부재 — T19 known gap). 그래서 같은 테스트 파일에
**소스 스캔 단언 2줄**(금지: `mockScreen.consented` / 필수: `resolveMockScreenCopy(`)을 붙였다.
주석 제거(`codeOnly`)는 필수 — 이 저장소는 금지 이유를 주석에 길게 남기는 관례라 자기 주석에 걸린다(재발 4회째).

## 잡동사니
- 새 워크트리는 `functions/node_modules` 부재 → `npm --prefix functions test`가 TS2307 수백 줄로 실패. `npm install` 먼저. 이번엔 `functions/package.json`을 건드리지 않았다(과거 사례와 다름 — 매번 `git status`로 확인할 것).
- python으로 파일을 재작성하면 CRLF→LF로 뒤집히지만 git 정규화가 흡수해 **diff는 깨끗**했다(경고만 나옴). `git diff --cached --stat`로 전체 파일 diff가 아닌지 확인하고 넘어갈 것.
- 지시가 한 파일만 지목해도 **같은 결함이 자매 화면에 있으면** 정본(D-61 Impact)이 그 화면을 영향 표면으로 들었는지 보고 판단 — 이번엔 replay도 함께 고치고 PR에 판단 2건으로 명시했다.
