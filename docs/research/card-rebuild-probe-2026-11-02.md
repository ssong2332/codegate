# §142 카드사 고급 재구성 확인 실측 — 6세션(2026-11-02)

⛔ 이 문서는 결과 기록이다. 새 결함은 **수정하지 않았다**(목록만). 운영 Firestore 쓰기 0.

- 승인: 사용자 "권고대로" — 카드사 묶음 병합·배포 + 확인 실측 6세션(메인 전달).
- 대상: main `d6b5d9a6`(#486 포함 · 라이브 배포본과 같은 서버 lib). 브랜치 `claude/card-rebuild-probe`.
- 키: `GEMINI_API_KEY2`만. **429 0회**. Live 새 연결 9회(레그마다 1회 · R2 genuine은 0회).
- 도구: `scripts/full-audit-probe.mjs`에 `ch: "multicall"` 추가(이 PR). 레그마다 Live 새 연결 · 레그 사이 판정은 앱 콜러블과 같은 `planLegStart`를 메모리 `relay`로 흉내.
  흉내 안 함: 화면 대기 시간(재발신 30초 · 연결음 4.5초/3.5초) · 오디오 · 리포트 LLM 문장 → **판단값 · 목소리 음질은 이 실측으로 확인되지 않았다**(실기기 필요).

## 결론: 레그 전환 · 다이얼 판정 · R7 · 진짜 기관 안내 · D4는 설계대로. 그러나 **감독기관 첫 레그가 검사에게 넘기지 못하고 마지막 레그 내용으로 건너뛰어 따름 흐름이 2/2 끝까지 가지 못한다**(D1).

| # | 경우 | 결과 | 기대 | 근거(결과 json `outcome` · `dials` · `legs`) |
|---|---|---|---|---|
| 1 | R1 따름 | ❌ 레그 2(감독기관 첫)에서 멈춤 — `leg_not_ended` | 레그 0~4 완주 | 레그 0 goal@7 · 다이얼 콜백번호 connected · 레그 1 설치 허용 후 goal@13 · 다이얼 대표번호(설치 응낙) connected · 레그 2: 끊기 0회 · `send_prepared_sms(transfer)` 4회 = `not_allowed` |
| 2 | R1 원격 앱 거절(R7) | ✅ 레그 1 give_up 승인 · 창구 오퍼 0 · 대표번호 다이얼 = **genuine**(설치 응낙 없음 → 가로채기 안 됨) | 같음 | 레그 1 `end_call give_up/accepted@13` · `dials[1].status = genuine` · 속음 판정 false |
| 3 | R1 공식 번호 확인 | ✅ 배송원 레그 뒤 연락처의 진짜 카드사 번호 → genuine 안내 3줄 | 같음 | `dials[0] = card-genuine-center/genuine` · 속음 false |
| 4 | R2 따름 | ❌ 레그 1(감독기관 첫)에서 멈춤 — #1과 같은 증상 | 레그 0~3 완주 | 시작 다이얼 콜백번호 connected(entry dial) · 레그 0 goal@6 · 레그 1: 끊기 0회 · transfer 문자 3회 `not_allowed` |
| 5 | R2 진짜 카드사 번호 | ✅ 시작 화면에서 진짜 번호 → genuine(Live 0) | 같음 | `dials[0].status = genuine` |
| 6 | R2 재발신 대기(D4) | ✅ `callback` → 레그 0 incoming 연결 · goal@5 | 같음 | `dials[0] = callback/connected` · 계획대로 레그 0 뒤 정지 |

| 항목 | 결과 | 근거 |
|---|---|---|
| 레그 목소리 자리 | R1 배송원 Puck · 상담원 Aoede · 감독기관 Charon(자리 1) — 레그마다 다름 | `legs[].voiceName` |
| 앞 통화 인계 블록 | 레그 1 15줄 · 레그 2 16줄(상한) — 감독기관이 "카드 명의 도용 건"을 이어받아 말함 | `legs[].priorContextLines` · R1 L2 대사 |
| 레그 문자 게이트 | 레그 1 설치 문자 하한 = 레그 시작 뒤(R1 @10 · 시작 7) · 다른 레그 문자 = `not_allowed` | `delivered` · toolResult |
| 화면 행동만 인정 | 3/3 — "설치했어요"만으로는 권한 허용을 다시 요구 · 허용 기록 뒤에만 다음 단계 | R1 L1 · R2 L0 · 재발신 L0 |
| 끊기 = 레그 끝 | 마지막이 아닌 레그 승인 7회 전부 `legEnd` 기록 · 세션 끝 0 | `legs[].ended.legEnd` |
| 리포트 수법 해석(변형 전체) | 따름 세션에서 설치 요구 · 공식 번호 확인 무력화 · 자산 보호 이체 요구 순간 검출 | `verdict.deceivedMoments` |

## 새 결함(수정 안 함 · 목록만)

| # | 심각도 | 증상 | 재현 | 원인(추정 — 확인 방법) |
|---|---|---|---|---|
| D1 | **높음(따름 흐름 완주 불가)** | 감독기관 **첫** 레그(exit transfer)가 "담당 검사에게 연결해 드릴게요, 잠시만요"만 되풀이하고 `end_call`을 부르지 않는다. 이어서 **마지막 레그 내용**(안전계좌 980만 원 · "가족 사업 자금" 코칭)으로 건너뛴다. 그 레그에 선언되지 않은 transfer 문자를 3~4회 요청해 전부 거절 | 2/2(R1 · R2) | ① 두 감독기관 레그가 같은 `CARD_REBUILD_SUPERVISOR_PERSONA`를 써서, 레그 2 프롬프트 [캐릭터]에 "검사와 통화를 마치고 다시 넘어오면 … 980만 원" 문장이 들어 있다(`resolveSessionScenarioPrompt(…, "fv-k3dn", 2)` 조립본 실측). ② "통화를 넘긴다" = `end_call(goal)`이라는 연결이 프롬프트에 없다(조립본에 "통화를 끝" 0회). 확인: 레그 2 조립본에서 마지막 레그 문장을 빼고 넘김 = end_call 1줄을 넣은 뒤 같은 계획 #1 재실측 |
| D2 | 낮음 | 참가자가 건 레그(dial)의 첫마디가 **건 쪽처럼** 말한다 — "…확인되어 접수 도와드리려고 하는데요"(R1 L1) · "…접수된 내용이 있어 연락드렸습니다"(R2 L1). 받는 쪽 인사만 한 경우도 있다(R2 L0 "네, 윤슬카드 고객센터입니다.") | 2/4 dial 레그 | 레그 연결 첫 신호가 클라 기본 트리거("전화를 받은 상대에게 … 전화를 건 이유를 밝히고")다(`GeminiVoiceSession.tsx` OPENING_TRIGGER_TURN · 레그 연결은 `resumeTurn` null). dial 레그 전용 첫 신호가 필요한지 판단 대기 |

관찰(결함 아님): 레그 끝 승인 직후 작별 대사가 비는 경우 1회(R1 L1 — 직전 턴에 "직접 전화하셔야 접수가 됩니다"로 마무리). 원격 앱 거절 뒤 상담원이 "대표번호로 직접 신고하라"고 안내한 것은 레그 단계(신고 유도)와 같다.

## 재실행
```
npm --prefix functions run build
node scripts/full-audit-probe.mjs --secret <메인 체크아웃 functions/.secret.local> --key-var GEMINI_API_KEY2 --plan <계획 json> --out <스크래치 폴더> --tag cr142
```
계획 항목 예: `{ "ch": "multicall", "id": "card-company-impersonation", "level": "advanced", "variant": "fv-k3dn", "persona": "comply", "dials": { "0": { "action": "dial", "numberId": "card-fake-callback" }, "1": { "action": "dial", "numberId": "supervisor-official" } } }`
— `persona`: comply · refuseInstall(설치만 거절) · 그 밖 이름은 comply 응답기. `dials` 키 = `"start"` 또는 끝난 레그 번호(부재면 transfer 레그는 transfer · 그 밖은 계획 끝). `stopAfterLeg`로 조기 정지.
