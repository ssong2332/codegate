---
name: project-codegate-s59-commit-c-tool-ignition
description: §59 커밋 C(Live 도구 점화) 완성 — 이전 세션의 uncommitted 워킹트리를 이어받아 감사·커밋. "grep 0건"이 실제 코드 누락과 동의어가 아니었던 사례(스프레드 패스스루로 이미 배선돼 있었음).
metadata:
  type: project
---

브랜치 `feat/s59-tool-ignition`(main `b5a277e` 기준, 커밋 `dd47173`)에서 `docs/Architecture.md` §59
커밋 C(도구 선언+`createRealtimeCall` 응답 `liveTools`+프롬프트 조건부 치환)를 완성했다.

**"grep 결과 0건 = 배선 누락"이라는 지시문 전제를 코드로 반증한 사례.** 작업 지시는
`functions/src/realtime/index.ts`에 리터럴 `liveTools` 문자열이 0건이라는 grep 결과를 근거로
"응답 배선이 빠져 있다"고 단정했다. 실제로 읽어보니 `credentials.liveTools`는
`GeminiRealtimeProvider.createCallCredentials`(`geminiProvider.ts`)에서만 조건부로 채워지고,
`index.ts`의 두 `return` 문(`return withVerifyOffer(withSmsTriggers(credentials))` 및 challenge
분기)은 `credentials`를 **필드별 재구성이 아니라 스프레드**로 통째로 넘긴다 — 그래서 `liveTools`는
리터럴 문자열 없이도 이미 응답에 실리고 있었다(같은 패턴이 `inCallSmsTriggers`/`verifyOffer`에도
있지만 그건 index.ts가 직접 계산해 `withSmsTriggers`/`withVerifyOffer` 래퍼로 얹는 반면,
`liveTools`는 provider별로 다르게 결정돼야 해서 provider 층에서 이미 결정돼 있다는 차이). 지시를
그대로 "구현"하는 대신 먼저 진짜로 없는지 코드로 검증했고, 없지 않다는 결론에 도달했다 — 이
판단 과정을 커밋 메시지에 명시했다(CLAUDE.md "근거 없는 성공 보고 금지"에 대응하는 반대 방향:
"근거 없는 결함 보고도 하지 않는다").

**그래도 "완성"으로 처리한 이유 — 관측 불가 지점의 증명 공백은 진짜 갭이었다.** 코드는 맞았지만
그것을 증명하는 테스트/문서가 전혀 없었다(`onCall` 핸들러라 에뮬레이터 없이 유닛 계층에서 직접
호출·관측 불가 — [[feedback_unobservable_behavior_gates]] 부류). 그래서:
1. `index.ts`에 "왜 별도 `withLiveTools` 게이트가 필요 없는지 + 재구성 형태로 바꾸면 안 되는
   이유"를 설명하는 주석 추가(행동 0 변화).
2. `toolDeclarationUnchanged.test.ts`에 소스 스캔 테스트 추가 — 두 `return` 문이 정확히 스프레드
   형태(`{ ...credentials, ... }` / `credentials` 그대로)인지 정규식으로 고정. 이 파일의 기존
   `deliverInCallSmsGateOrdering.test.ts` 관례(gate가 `.create(` 호출보다 먼저 return하는가를
   소스 위치 비교로 고정)와 같은 종류의 증명이다.

**전수 감사 — 나머지 6항목은 이미 완료 상태였다.** 이전 세션(우회 종료된 세션)이 uncommitted로
남긴 워킹트리를 감사한 결과: 도구 2개 선언 조건(R1②③)·G371 허용목록(R1⑤)·G389(deliverVerifyReconnect
미노출, verifyIntercept/index.ts 0줄 변경 확인)·R2(toolDrivenTiming 부재 시 프롬프트 바이트
동일)·promptAssembly.ts의 옛 금지 문구가 삭제가 아니라 DEFAULT 상수로 보존됐는지 — 전부 이미
구현+테스트 완료였다. architect 전용 문서(`docs/Architecture.md`·`API.md`·`DECISIONS.md`·`adr/`)도
`git diff`로 0줄 변경 확인. 유일한 진짜 갭이 `createRealtimeCall` 배선의 **증명 공백**이었다.

**인계 — 클라 파일의 스테일 주석(고치지 않음, 범위 밖 판단).** `src/lib/realtime/GeminiVoiceSession.tsx`·
`liveToolResponse.ts`(§59 커밋 A 소관, 이미 별도로 커밋됨)에 "이 분기는 오늘 도달 불가다(회귀 0)"라는
주석이 있는데, 이 커밋 C로 도구가 실제로 선언되는 시나리오/난이도에서는 그 전제가 깨진다(모델이
`toolCall`을 실제로 보낼 수 있게 됨). architect의 §59.10 커밋 C 행 자체가 이 상태를 "안전한 중간
상태"(백스톱이 여전히 즉시 발동해 실제 도착 경로는 무변경)로 명시적으로 설계했으므로 기능적으로는
문제가 없지만, 그 파일들은 이미 별도 커밋(A)으로 병합된 다른 커밋 경계의 소유물이라 이 패스에서
손대지 않고 보고서에만 인계했다.

**테스트 수**: functions 747 → 748(+1, 소스 스캔 1건) · root 357(무변경, 클라 파일 미접촉).
빌드·lint 전부 통과.
