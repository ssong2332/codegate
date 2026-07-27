---
name: codegate-t103-sms-inversion
description: T103 전면 문자함+통화 필 반전 — 신규 파일 0건 제약이 만든 설계, 퇴장 애니메이션이 안전 게이트를 때리는 지점, 워크트리에 .env·functions/node_modules가 없어 생기는 착수 비용, 브라우저 검증 불가 판정 근거
metadata:
  type: project
---

T103(통화 중 문자 = 전면 문자함 + 통화 필)에서 얻은, 코드만 읽어서는 안 나오는 것들.

## 1. ⚠️ 새 워크트리 착수 비용 3종 (매번 반복된다 — 순서까지 기록)
1. `functions/node_modules` 없음 → `npm --prefix functions test`가 **TS2307 에러 더미**로 실패한다(테스트 실패처럼 보이지만 원인은 미설치). `npm --prefix functions install` 후 **반드시** `git checkout -- functions/package.json functions/package-lock.json`
   (`"fraud-vaccine-web": "file:.."`가 몰래 추가된다 — [[codegate-t107-field-divergence]]에 이미 있는 함정이 재현됐다).
2. `.env` 없음 → 루트 `npm run build`가 `auth/invalid-api-key`로 **페이지 데이터 수집 단계에서** 죽는다. TypeScript는 이미 통과한 뒤라 타입 오류로 오독하기 쉽다. `cp /c/codegate/.env .env`(gitignore됨)로 해소.
3. `npm test`(루트)는 위 둘 없이도 그냥 돈다 — 그래서 루트 테스트만 돌려 보고 "환경 정상"이라 판단하면 안 된다.

## 2. "신규 컴포넌트 파일 0건"이 **설계 제약이 아니라 안전 게이트 제약**인 이유
G80(입력 어포던스 스캔)은 `src/components/InCallSmsOverlay.tsx` **한 파일만** 읽는다.
말풍선 스레드를 새 파일로 쪼개면 게이트가 그 파일을 **보지 않은 채 초록불**이 된다.
화면 등록부(`harmlessnessScreens.test.ts`)는 신규 파일을 잡지만 **무해화 문구 스캔 등재일 뿐**
입력 어포던스 스캔에는 넣어 주지 않는다.

**Why:** 파일이 300줄을 넘어가면 "컴포넌트로 빼자"가 자연스러운 판단인데, 이 저장소에서는
그 자연스러운 판단이 곧 안전 경계 우회다.

**How to apply:** 이 파일을 만질 때는 길이를 이유로 분할하지 마라. 정말 필요하면
**같은 커밋에서** 스캔을 파일 집합 순회로 넓히고 등록부와 교차 검증해야 한다(§23.3 (2) 가).
검출 **방식** 변경은 T108 소관이라 손대면 안 된다.

## 3. 퇴장 애니메이션이 AC-059(한도 종료 고지 미가림)를 때리는 정확한 지점
"부드럽게 닫히게" 하려면 언마운트를 지연시켜야 하고, 그 유혹은 **호스트에**
`smsOverlayVisible` 같은 두 번째 상태를 만드는 형태로 온다. 그러면 한도 도달 시
`setSmsOverlayOpen(false)`가 연출 시간만큼 늦어져 **종료 고지가 그동안 가려진다.**

채택한 형태: 퇴장은 **컴포넌트 내부 `closing` state → 퇴장 클래스 → `onAnimationEnd`에서 `onClose()`**.
호스트가 직접 내리는 경로(한도 자동 종료·훈련 종료)는 이 상태를 안 거쳐 **즉시 언마운트**된다.

⚠️ **reduced-motion이면 `animationend`가 영영 안 온다** — `matchMedia("(prefers-reduced-motion: reduce)").matches`
갈래로 즉시 `onClose()`를 부르지 않으면 **연출을 끈 사용자에게만 문자함이 안 닫힌다.**
이건 CSS 폴백만 넣고 끝내면 반드시 놓치는 버그다.
`onAnimationEnd`는 진입 연출·자식 애니메이션에서도 오므로 `!closing || target !== currentTarget` 가드 필수.

## 4. 또 걸렸다 — 자기 주석이 자기 게이트를 때린다
D-56 게이트를 `page.match(/setSmsOverlayOpen\(true\)/g).length === 1`로 짰는데,
같은 커밋에서 내가 JSX 주석에 *"여기서 `setSmsOverlayOpen(true)`를 부르지 않는다"* 라고 적어
개수가 2가 되어 실패했다. [[codegate-t83-verify-intercept]]와 **완전히 같은 함정**이 재발했다.

**How to apply:** 이 저장소에서 **소스 텍스트 개수/부재를 세는 단언을 새로 짤 때는 처음부터
`codeOnly(...)`를 쓴다.** 이 저장소는 "왜 안 하는가"를 금지 형태 그대로 주석에 적는 관례라,
raw 소스를 세는 단언은 거의 항상 자기 주석에 걸린다. 부재 검사(`!includes`)도 마찬가지.

## 5. 아코디언 제거가 **데이터 의미를 바꾼다**(표현 계층 태스크인데도)
아코디언 시절 `onOpened`는 **펼쳐진 한 건**만 기록했다. 말풍선 스레드는 전건이 펼쳐진
상태로 보이므로 그대로 두면 **실제로 읽은 문자가 미확인으로 남는다**(리포트 AC-026 입력).
그래서 화면에 그려진 id 전부를 기록하도록 바꿨다 — 표현 개편이 데이터 경로를 건드린
유일한 지점이라 보고에 판단 근거로 명시했다.

## 6. 브라우저 검증 불가 판정의 근거(추측 아님)
포트 3000의 dev 서버는 `Get-CimInstance Win32_Process`로 실행 경로를 확인한 결과
**`C:\codegate\node_modules\next\...`** = main 체크아웃이다. 워크트리 코드가 아니므로
HMR로 이 변경을 볼 수 없다. 게다가 이 에이전트 세션에는 브라우저 구동 툴(`mcp__*`)이
함수 목록에 없다.

**How to apply:** "개발 서버가 떠 있다"는 지시를 받아도 **그 서버가 내 워크트리 것인지 먼저 확인하라.**
확인 명령: `netstat -ano | grep :3000` → PID → `Get-CimInstance Win32_Process -Filter 'ProcessId=<pid>'`.
아니면 런타임 증거는 낼 수 없고, 그 사실을 그대로 보고하는 것이 정답이다.
