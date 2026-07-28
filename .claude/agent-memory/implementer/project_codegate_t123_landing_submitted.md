---
name: codegate-t123-landing-submitted
description: T123 가짜 랜딩 제출 기록 — 라이브 가드 검증이 "다른 이유로 먼저 걸려" 미검증이던 함정, 격리 에뮬레이터 3단 포트 충돌 레시피, 빨간불 커밋을 설계가 지시했을 때의 문서 우선순위 판단
metadata:
  type: project
---

T123(AC-080 — 제출 사실 기록)에서 얻은, 코드만 읽어서는 안 나오는 것들.

## 1. ⭐⭐ 라이브 가드 검증이 **다른 이유로 먼저 걸려** 통과처럼 보였다
신규 서버 가드 2건(`landing_submitted`는 `fakeLandingId` 필요 / `submitted`는 app-install 금지)을
에뮬레이터로 확인했더니 둘 다 400이 떴다. **그런데 에러 메시지가 내 가드가 아니었다** —
"이 시나리오의 문자가 아닙니다" / "이 시나리오의 모의 화면이 아닙니다"(둘 다 카탈로그 소속 검증).
샘플로 고른 문서가 **그 시나리오 소속이 아니어서** 앞단 가드에서 먼저 걸린 것이다.

**Why:** 400을 보고 "가드가 동작한다"고 보고했으면 근거 없는 성공 보고였다. 실제로는
내 가드 코드가 한 번도 실행되지 않았다.

**How to apply:** 가드 검증은 **HTTP 코드가 아니라 에러 메시지 원문**으로 판정하라.
그리고 대조군은 **앞단 가드를 전부 통과하는 샘플**이어야 한다(같은 시나리오 소속 문서).
T125 메모의 "게이트 전부 초록인데 라이브 1/3만 먹혔다"와 같은 계열이며, 이쪽이 더 조용하다.

## 2. 격리 에뮬레이터 — 이 저장소에서 실제로 밟은 3단 장애물
순서대로 전부 걸렸다. 다음엔 처음부터 이렇게:
1. **9098/5002/8081도 이미 점유돼 있었다**(다른 워크트리 에이전트). `netstat -ano | grep LISTENING`
   으로 **먼저 비어 있는 포트를 찾고** 쓴다. 최종 사용: **9095 / 5007 / 8085**.
2. 죽일 때 `TaskStop`만으로는 **자식 프로세스가 남는다**. 포트 PID를 `taskkill //PID <n> //F`.
3. `functions/.env`가 없으면 에뮬레이터가 **대화형 프롬프트에서 멈춘다**(`Enter a string value
   for LLM_PROVIDER:`) — 로그만 보면 "기동 중"으로 보인다. `.env.example` 플레이스홀더로 만들고
   검증 후 지운다(gitignore 대상).
4. 검증 스크립트에서 `firebase-admin`을 import하려면 **스크립트 파일이 `functions/` 안에** 있어야
   한다(ESM 해석은 cwd가 아니라 **파일 위치** 기준). 스크래치패드에 두면 `ERR_MODULE_NOT_FOUND`.
   `functions/*.local.mjs`로 두고 끝나면 지운다.

## 3. 설계가 **빨간불 커밋**을 지시했을 때
`Architecture.md` §31.7 (4)는 "배치-1(게이트)은 아직 없는 심볼을 단언하므로 이 커밋 시점에는
빨간불이고 배치-2·3 직후 초록이 된다"고 **명시적으로** 지시했다. 그런데 `docs/GitWorkflow.md`는
"No commit without a passing local test run"을 금지로 못박는다.

**Why:** AGENTS.md Document Priority에서 Architecture.md(6)가 GitWorkflow.md(10)보다 **높다**.
그래서 설계를 따르되, 커밋 메시지 본문에 "설계상 순서"임을 적어 다음 사람이 사고로 읽지 않게 했다.

**How to apply:** 우선순위표로 갈리는 충돌은 **멈추지 말고 높은 쪽을 따르되 흔적을 남긴다**.
멈춰야 하는 것은 우선순위로 **갈리지 않는** 모순(ID 부재·상호 모순)뿐이다.

## 4. 지역 유니언이 계약 타입의 사본이었다
`play/page.tsx`가 `event: "opened" | "link_tapped"`를 **손으로 다시 적어** 두고 있었다.
서버 enum에 값을 더하니 여기서만 타입 에러가 났다 — 즉 그동안 **드리프트 원천**이었다.
`@/lib/api`의 `InCallSmsEvent`를 import해 치환했다(범위 밖 수정이 아니라 이번 변경이 **드러낸**
결함이고, 고치지 않으면 배선 자체가 컴파일되지 않는다).

## 5. 새 워크트리 `npm install`의 매니페스트 오염은 **여전히 재현된다**
`functions/package.json` + lock에 `"fraud-vaccine-web": "file:.."`가 또 붙었다
([[codegate-t107-field-divergence]] 1번 그대로). 커밋 전 `git checkout --`로 되돌렸다.
