---
name: codegate-t118-transfer-persistence
description: T118 호 전환 지속성(A5) — Node에서 Gemini Live 세션을 헤드리스로 여는 하네스 레시피, P-1 프로브 결과, 스크린샷 증거를 못 낸 이유
metadata:
  type: project
---

**Gemini Live 세션은 브라우저·마이크 없이 Node에서 열 수 있다.** `@google/genai`의 `ai.live.connect`에 에뮬레이터 `createRealtimeCall`이 준 **ephemeral token을 apiKey 자리에** 넣고 `httpOptions.apiVersion:"v1alpha"`만 맞추면 된다. 오디오를 보내지 않고 `sendClientContent({turns: "…", turnComplete: true})`로 사용자 턴을 대신하면 `outputTranscription`으로 사기범 전사가 그대로 나온다 — 통화 흐름 전체(오퍼 게이트 → 전환 → 이후 N턴)를 라이브로 재현할 수 있다.

**Why:** T118 지시문은 *"P-1을 실행할 수단이 없으면 멈추고 보고하라"* 고 했지만, 실제로는 수단이 있었다. 이 저장소의 라이브 검증은 그동안 "사용자가 브라우저로 해야 한다"로 미뤄져 왔는데 **모델 행동 검증에 한해서는 그 전제가 틀렸다.**

**How to apply:** 라이브 증거가 필요한 태스크에서 먼저 이 하네스를 고려하라. 필요한 부품 4개 — ⓐ Auth 에뮬레이터 REST `accounts:signUp`(익명 uid), ⓑ **Firestore REST `Authorization: Bearer owner`로 `users/{uid}/consents` 1건 직접 write**(없으면 `createSession`이 `failed-precondition "훈련 참여 동의가 필요합니다"`로 막는다), ⓒ 콜러블 REST `POST /{project}/us-central1/{fn}` + `{"data":{...}}`, ⓓ `@google/genai`를 **스크래치패드에 따로 npm install**(워크트리 node_modules는 ESM에서 경로 해석이 안 된다).

**측정할 수 없었던 것 1건**: 발신자 라벨 **스크린샷**. 마이크 하드웨어가 없고 워크트리에 `.env`가 없어 클라 앱 자체가 부팅되지 않는다(`auth/invalid-api-key`). 즉 **모델 행동은 헤드리스로 검증되지만 화면 렌더는 안 된다** — 이 경계를 알고 착수 전에 고지하라.

**P-1 실측(2026-07-27)**: `turnComplete:false`로 지문 1줄을 보내고 30초 무발화 → **소켓 오류 0 · close 0 · 신규 발화 0**. 즉 Live는 "턴을 넘기지 않는 컨텍스트 주입"을 받아 준다(§25.3 A5-α의 근거).

**격리 에뮬레이터**: 공유 에뮬레이터는 main 코드를 쥐고 있어 내 변경이 안 보인다. `firebase.t118.json`(포트 전부 다르게 · `ui:false`) + `firebase emulators:start --config firebase.t118.json`으로 워크트리 코드를 띄웠고, **`C:\codegate\functions\.env`를 워크트리로 복사**해야 실 Gemini 키가 붙는다(양쪽 `.gitignore`가 `.env`·`functions/.env`를 이미 덮는다). 끝나면 **키 사본과 임시 config를 지울 것.** 종료는 `TaskStop`이 아니라 **포트 PID를 netstat으로 찾아 taskkill** — 에뮬레이터는 자식 프로세스를 2개(hub/functions와 firestore가 다른 PID) 남긴다.

**⭐ 라이브에서 본 것을 보고에만 쓰고 산출물에 안 옮기면 없는 것이 된다.** 전환 후 모델이 *"앞서 담당자는 현재 다른 업무를 진행 중이십니다"* 라고 말한 것을 오케스트레이터에게 구두 보고했지만 PR·Tasks.md·메모리 어디에도 안 남겼고, reviewer가 `git grep`으로 그 부재를 잡아냈다. 판정은 합격이었다(기준이 *"이름·직책·1인칭"* 만 본다) — 문제는 **다음 사람이 완전히 닫힌 문제로 오인한다**는 것. 라이브 관찰은 **합격이어도 원문 인용으로 산출물에 남겨라.**

**그 관찰이 드러낸 구조적 한계**: 이 저장소의 잔류 요구 게이트(`positiveResidencyDemands`/`returnAllowingMentions`)는 **카탈로그 문자열만** 본다. 모델이 즉흥으로 만든 **잔류 암시형 3인칭 서술**은 A5·R-1·R-2 어느 것도 막지 못한다. 서버가 강제할 수 있는 지점이 *"모델에게 도달하는 문자열 집합"* 하나뿐이라는 §22.2 판정의 직접적 귀결이다.

**역검증 A·B가 증명하는 범위를 스스로 좁혀 적어라**: 순수 함수·데이터 단위 테스트는 ***"선언된 조건대로 배선됐고 죽은 게이트가 아니다"* 까지**만 증명한다. 증상 소멸은 증명하지 않는다 — 안 적으면 *"테스트가 늘었으니 고쳐졌다"* 로 읽힌다.

**대조군 없는 라이브 증거의 한계**: QA가 **base main(패치 전 코드)** 을 같은 하네스로 완주시켰더니 거기서도 원 증상이 미재현이었다. ⇒ 사용자 신고 증상이 저빈도라면 **패치 전/후 각 1~2회 관측으로는 인과가 서지 않는다.** 라이브 예산이 적은 이 저장소에서는 *"미재현"* 이 최대 주장치임을 처음부터 계획에 넣어라.

관련: [[codegate-t83-verify-intercept]] · [[feedback-background-emulator-task-tracking]] · [[feedback-emulator-script-sdk-split]] · [[feedback-unobservable-behavior-gates]]
