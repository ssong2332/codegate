# 라이브 재시험 23 관찰 ⑫ · ⑬ — 인증번호 문자 시점 · 대출 실행 확인 전화 순서 (2026-11-12)

⛔ 실 키 프로브 · 운영 로그 · 운영 Firestore를 보지 않았다. 아래 원인은 코드 경로와 라이브 기록(재시험 23 표 — `docs/research/edge-scenario-test-2026-11-07.md`, PR #570 브랜치)의 대사 문면으로 좁힌 것이다.

## ⑫ 인증번호 문자 — 원인

| 항목 | 내용 | 근거 |
|---|---|---|
| 관찰 | 0:57 사기범 "문자로 발송해 드린 인증 번호를 불러 주시겠습니까?" → 1:09 문자함 비어 있음 → 1:32 인증번호 문자 도착 · 사기범 다음 대사 "인증번호는 금방 도착할 테니" | 재시험 23 M3 행 |
| 주장 감지 | 클라 `SMS_SENT_CLAIM`이 "문자로 발송해 드린"을 잡는다 · 대상 말 "인증 번호" → 목적 `identity` | `src/lib/realtime/toolWindow.ts` `SMS_SENT_CLAIM` · `CLAIM_PURPOSE_WORDS` |
| 서버 응답 | 다음 대사 "금방 도착할 테니"는 서버 정정 문면 `SMS_CLAIM_NOT_YET`("상대가 문자를 찾으면 곧 도착한다고만 짧게 답한 뒤")와 일치 ⇒ 주장 백스톱이 `wait`를 돌려줬다(추정 — 운영 로그로 확인 가능: `[T191] deliverInCallSms 판정` 대신 waiting 응답이라 로그 줄 없음 · 클라 진단 로그 필요) | `functions/src/inCallSms/index.ts` `plan.action === "wait"` 분기 · `scenarios/inCallSms.ts` `SMS_CLAIM_NOT_YET` |
| `wait`가 난 이유 | 인증번호 문자(`INSTITUTION_OTP_V2`)는 명시 하한 3 · 자동 하한 5. 앞선 문자 0통이라 간격 · D-c · 화면 보류(SB) 해당 없음 ⇒ 남는 원인은 **사용자 발화 수 < 3**(=2 이하). 흐름 4단계(검사 · 안심 · 자산 · 인증번호)가 참가자 두 번 답한 사이에 압축됐다(0:56 자산 답 → 0:57 인증번호 요구) | `functions/src/scenarios/flowVariants.ts` `INSTITUTION_OTP_V2` · `smsGate.ts` `gateOpensAtUserTurns` |
| 왜 FE · CL이 안 걸렸나 | **FE**는 `explicitAfterScreenOf`가 있는 문자(대출 안내 — 이체 화면 제출 뒤)에만 걸린다 · 인증번호 문자는 첫 문자라 앞 화면이 없다. **CL**은 "이미 도착한 문자만 가리키는 주장"을 걸러 내는 규칙이라 아무것도 도착하지 않은 이 판과 무관하다. 둘 다 하한 3 자체를 건드리지 않는다 | `smsGate.ts` 판정표 FE · CL |
| 같은 꼴 다른 판 | M2 현금 루트(`fv-q7cn`)도 같은 `INSTITUTION_OTP_V2`를 쓴다 | `flowVariants.ts` `INSTITUTION_ADVANCED_SMS_V3[0]` |
| 하한 3을 둔 이유 | §115 — 모델 **도구**가 발화 2에 인증번호 문자를 보내 앞 단계가 압축됐다(운영 b6dfcbcf). 도구는 말하기 **전** 판단이라 하한이 압축을 막는다 | `flowVariants.ts` §115 주석 |
| 결론 | "보냈다 · 불러 달라" **주장은 이미 말해진 뒤**다 — 이때 하한으로 막으면 압축은 그대로이고 말과 문자만 어긋난다. 주장이 그 문자를 가리킬 때만 첫 문자 하한(2)까지 연다. 도구 하한(3)과 자동 하한(5)은 그대로 둔다 | — |

또 실시간 경로는 **"인증번호 불러 주세요"처럼 '보냈다' 없이 요구만 하는 대사**를 주장으로 보지 않는다(텍스트 폴백은 §132.17 O1이 본다 — `roleplay/smsClaim.ts` `SMS_OTP_DEMAND`). 같은 꼴을 화면에도 둔다.

### 판정표 OC — 인증번호 요구 주장의 하한(`smsGate.ts`)

| # | If | Then |
|---|---|---|
| OC1 | 선언에 `claimNotBeforeUserTurns` 없음 | 종전(판정표 F · FE) |
| OC2 | 있음 ∧ "보냈다/불러 달라" 주장 백스톱(`explicitFloor`) ∧ 주장 대상 목적에 그 문자의 목적이 있다 | 3행 하한 = `claimNotBeforeUserTurns`(첫 문자 하한 2와 max) |
| OC3 | 있음 ∧ 주장인데 대상 목록이 비었거나 그 목적이 없다(판정 불가 · 다른 문자) | 종전(F — 명시 하한 3) |
| OC4 | 있음 ∧ 모델 도구 호출(주장 아님) | 종전(F — 3 · §115 압축 방지) |
| OC5 | 있음 ∧ 자동 백스톱 · 텍스트 폴백 | 종전(F3 — 5) |

`INSTITUTION_OTP_V2`에만 `claimNotBeforeUserTurns: 2`를 둔다(기관 사칭 고급 루트 전부 — `fv-c5fj` · `fv-q7cn` · `fv-g2ld`).

### 판정표 CL 추가 행 CL5 — 선언에 없는 목적만 가리키는 주장(`claimTargetsPending`)

| # | If | Then |
|---|---|---|
| CL5 | 주장 대상 목록이 있고 그 목적이 **모두 현재 선언(레그) 밖**이다 | 주장으로 보지 않는다(인증번호 요구가 다른 목적의 문자를 당기지 않게 — 폴백 `claimMatchesPurpose`와 같은 뜻) |

### 화면 판정 OD — 인증번호 요구 대사(`toolWindow.ts`)

| # | If(사기범 전사) | Then |
|---|---|---|
| OD1 | 인증번호를 불러 · 알려 · 말해 · 읽어 달라는 꼴(폴백 `SMS_OTP_DEMAND`와 같은 글자) | "보냈다" 주장으로 본다 · 대상 = `identity` |
| OD2 | 인증번호 문자가 이미 도착 | 서버 CL3이 주장으로 보지 않는다(다음 문자를 당기지 않는다 — 종전) |
| OD3 | 앞으로 보내겠다 · 필요 없다 등 요구 꼴이 아님 | 종전 |

## ⑬ 대출 실행 확인 전화 — 원인

| 항목 | 내용 | 근거 |
|---|---|---|
| 관찰 | 상담원 "대출 용도가 어떻게 되시는지" → 참가자 "네, 했어요"(0:45) 순간 입금 문자 도착 → 한 덩어리 대사 "누군가로부터 대출을 권유받으셨거나…확인 부탁드립니다. 확인됐습니다. 오늘 중으로…입금될 예정입니다" · 통화 2 스스로 안 끝남 | 재시험 23 M3 행 |
| (a) 답 없이 확인 | 결과 보고 콜러블이 **답 수를 보지 않는다** — 모델이 `report_loan_review(approved)`를 부르면 바로 기록 | `functions/src/callLegs/loanReview.ts` 판정표 R1 ~ R5 |
| (b) 문자가 먼저 | 기록(R5)과 **같은 요청에서** 입금 안내 문자를 도착시킨다 · 도구는 "결과를 말하기 전에" 부르게 돼 있다 ⇒ 문자는 항상 안내 대사보다 먼저 | `loanReview.ts` `deliverServerNoticeSms` 호출 · `roleplay/genuineLegPrompt.ts` `GENUINE_LEG_TOOL_RULE` |
| (c) "입금될 예정"과 어긋남 | 문자 본문은 "입금되었습니다", 모델 지시(`loanReviewGuidance`)는 "오늘 중 입금된다고 안내" | `loanReview.ts` `loanReviewGuidance` · `scenarios/inCallSms.ts` `institution-loan-disbursed` |
| 스스로 안 끝남 | 추정 — 레그 2 하한 `minUserTurns: 3`보다 답이 적은 상태(답 2)에서 `end_call`이 막혔을 가능성. (a)를 고치면 실행 전 답이 3 이상이라 같은 막힘이 줄어든다. 확인 방법: 다음 라이브에서 통화 2 끝 무렵 `end_call` 응답 status | `flowVariants.ts` `INSTITUTION_LOAN_LEG_OFFICER.minUserTurns` |

### 현실 대조 — 대출 실행 전 확인 전화 순서

| 순서 | 현실(금융회사 비대면 대출 실행 전 확인) | 서비스(고친 뒤) |
|---|---|---|
| 1 | 본인이 직접 신청했는지 | 통화 2 단계 1 |
| 2 | 대출 용도 | 단계 2 |
| 3 | 누가 권했는지 · 지금 누구와 통화하며 안내받는지 · 수사기관 연락 여부 | 단계 3 |
| 4 | **답을 들은 뒤** 실행 · 보류 결정 | LR — 답 3개 전 실행 기록 0 |
| 5 | "확인됐습니다, 오늘 중 입금됩니다" 안내 · 종료 | 지시 문면 그대로 |
| 6 | 실행 뒤 입금 문자 | LD — 통화 2가 끝난 뒤 도착 |

### 판정표 LR — 결과 기록(`recordLoanReview`)

| # | If | Then |
|---|---|---|
| LR1 | outcome = held | 기록(답 수 무관 — 의심 답이 나오면 언제든 보류) |
| LR2 | approved ∧ 요청에 `userTurns` 없음(옛 화면) | 종전(기록) |
| LR3 | approved ∧ 이 레그 답 수(`userTurns − legStartUserTurns`) < 3 | 기록 0 · `recorded:false` · `pending:true` · 지시 = 결과를 말하지 말고 남은 확인 질문을 하나씩 묻고 답을 들은 뒤 다시 보고 |
| LR4 | 그 밖 | 기록(종전 R4 · R5 — 단 문자는 아래 LD) |

### 판정표 LD — 입금 안내 문자 시점

| # | If | Then |
|---|---|---|
| LD1 | 결과 held | 문자 0(종전) |
| LD2 | approved 기록 ∧ 통화 2가 아직 연결 중 | 문자 보류(기록만) |
| LD3 | approved ∧ 통화 2가 끝났다(상담원 `end_call` 승인 · 참가자 끊기 · 기록 시점에 이미 끝남) | 입금 문자 도착(이미 있으면 0) |
| LD4 | 통화 3 연결(callback) 때 approved인데 문자 없음 | 그때 도착(안전망) |

지시 문면(`loanReviewGuidance` approved)은 "오늘 중 입금된다"를 그대로 둔다 — 문자가 안내 뒤에 오므로 어긋나지 않는다.
