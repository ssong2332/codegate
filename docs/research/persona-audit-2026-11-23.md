# 페르소나 전수 점검 2026-11-23 — 서버 프로브 부분

- 원본(대화 JSON · 로그 · 계획)은 저장소 밖 세션 공유 폴더 `persona-audit-2026-11-23/probe-out/`에 있다(비밀값 0). 같은 점검의 브라우저 갈래 A · B · C 결과는 각 세션 문서에 따로 남는다.

### 결론: 실 키 70판 완료 · 429 0회 · 새 결함 12종(상 3 · 중 9) · 기지 K2 · K3 재현 · K1은 도달 못 해 재현 안 됨

| 항목 | 결과 | 이전/기준값 | 근거 |
|---|---|---|---|
| 실행 판 수 | **70판**(음성 52 · 다통화 2 · 메신저 16) | 승인 상한 70 | `probe-out/log-*.txt` `"file"` 줄 70 + 0턴 1(아래) |
| 0턴 판 | `fv-c5fj` 첫 시도 1건 — Live 연결 0회(실 키 0) · 스크립트를 고쳐 같은 판 1회 재실행 | — | `multicall-…-T15-09-52` `dials[0].reason = leg_in_progress` |
| 429 | **0회** · `STOP-429` 없음 | 0 | 모든 결과 `is429:false` · 공유 폴더 · `probe-out` 둘 다 STOP 파일 없음 |
| 대상 | origin/main `47bd2edd` · lib hash `82b8c0c97f12` · 음성 Live `gemini-3.8-live` · 메신저 = 앱 체인(Claude Haiku 1차 · Gemini 2차) | 라이브 main `47bd2edd` | `build.log` · 로그 `Claude 응답 수신` |
| 덮은 범위 | 공개 시나리오 17종(음성 13 · 메신저 4) × 배정 가능 풀 **모든 변형 1판 이상**(58칸) + 고급 보강 12판 | 계획 `audit-probe-plan.md` | `assignablePool` 결과 |
| 유형 판 수 | P1 17 · P2 16 · P3 19 · P4 18 | 계획과 같음 | `plan-all.json` |

### 유형별 일관성 요약

| 유형 | 판 | goal(완료 끊기) | 포기 끊기 | 끝 없음(상한) | 리포트 '속음' | 결함 칸 많은 열 | 한 줄 |
|---|---|---|---|---|---|---|---|
| P1 잘 따라옴(comply) | 17 | 11 | 5 | 1 | 16 | 서비스 안 1 · 리포트 1 · 일관성 1 · 진행 1 | 음성은 대체로 정상 완주. 메신저는 칩 미제출(프로브 한계)로 서버 포기 1줄 |
| P2 의심 후 따름(suspicious) | 16 | 1 | 14 | 1 | 15 | 진행 3 · 서비스 안 2 | 신원 되묻기에 대부분 답함. 화면 없이 '보냈어요'에 완료 처리 2판(N2 · N3) |
| P3 적대(hostile) | 19 | 0 | 13 | 6 | 1 | **반복 8** · 현실성 3 | 이름 · 소속은 다그치면 대부분 답함(응답성 OK). 대신 같은 요구 5~9회 · 12턴 끝 없음 6판(K3 계열) |
| P4 사실 진술(factual) | 18 | 0 | 17 | 1 | 5 | **응답성 6** · 현실성 2 · 일관성 2 | '돈 50만 원'은 대체로 금액을 맞춰 줄였지만 기관 사칭 · 자산 보호 · 검찰은 잔액 무시(K2 계열) · '그 은행 안 써요'에 동문서답 4판(N5) |

(결함 = 7열 판정 '결함' 칸 수 · △ = 가벼운 흠. P4의 '속음' 5판 중 2판은 응답기 FILLER '네, 알겠어요' · 1판은 응답기 인증번호 낭독 탓 — 아래 한계)

### 새 결함 상위 목록 (심각도 순)

| # | 심각도 | 결함 | 시나리오 · 변형 · 유형 | 근거 턴 인용 | 재현 |
|---|---|---|---|---|---|
| N1 | 상 | 메신저 대사에 내부 추론 · 훈련 메타 문장 노출 | 지인 사칭 초급 fv-42wd P2 · 택배 스미싱 고급 fv-g454 P3 · P1 | 42wd S9 "(이번에는 이체 화면에 기록이 없어서 입금이 확인되지 않았어. 그래서 대답은 이렇게 할게.) 아, 그래?" · g454 P3 S1 "이 응답에는 통화 전환 신호만 포함되며, 사기범 역할의 대사는 제공하지 않습니다." · g454 P1 S9 "이 교육 훈련은 여기까지 진행하겠습니다." | 메신저 3/16 |
| N2 | 상 | 화면 기록 없이 말로만 '보냈어요' → 큰 금액 이체 완료 선언 + 참가자 실제 은행에서 이체 지시 | 카드 배송 고급 fv-tvnj P2 | S13 "말씀하신 은행에서 보담은행 보호 계좌로 삼천만 원을 즉시 이체해 주시면" → U12 "네, 보냈어요" → S16 "삼천만 원 이체가 정상적으로 완료되어 안전하게 보호 계좌로 이동되었습니다." (설치 허용 · 이체 문자 0 · `delivered` = 앱 링크 1건) | 1/1(tvnj P2) |
| N3 | 상 | 송금 말이 없었는데 goal 끊기 · 리포트 '속음' | 가족 사고 중급 fv-krq3 P2 | U8 "은행 하나 쓰고 있어요." → S9 "보내줘서 고마워, 엄마." + end_call goal | 1판 |
| N4 | 중 | 서비스 밖 행동 언급(참가자 은행 앱 · 모바일뱅킹 · 창구 인출 전제) | 지인 사칭 고급 fv-bxvp P4 · 자녀 사칭 고급 fv-tdgg P2 · 자산 보호 고급 fv-k9ra P1 · (N2 tvnj) | bxvp S8 "모바일뱅킹으로 저 번호 입력하면 … 앱 켜서 150만 원만 이체해 줘" · tdgg S7 "지금 바로 은행 앱 열어서 … 이체해 줘" · k9ra S5 "혹시 은행에서 돈을 찾는 이유를 물어보면, 개인 용도로 둘러대시면 됩니다." | 4판 |
| N5 | 중 | "그 은행 안 써요"(사실 진술)에 동문서답 — "다른 은행은 안 돼" · "그 은행으로 보내면 돼" · "확인해 보세요" | 가족 사고 고급 fv-h5sz · fv-66hh P4 · 지인 사칭 고급 fv-bxvp P4 · 납치 초급 fv-c5ih P4 | h5sz S4 "다른 은행은 지금 안 돼..." · 66hh S4 "다른 은행은 안 돼" · bxvp S3 "그럼 한결은행으로 보내면 돼" · c5ih S4 "네, 그러시면 확인해 보세요. 시간 얼마 없어요." | P4 은행 진술 판 중 4판(가족 사고 2/2) |
| N6 | 중 | 자리표시 "○○안심보안 앱"을 그대로 낭독 | 카드 배송 고급 fv-e5mv P3 · fv-tvnj P2 · P3 | e5mv S6 · S8 "○○안심보안 앱" · tvnj S9 "○○안심보안 앱을 설치해 주세요" | 카드 배송 3/4 |
| N7 | 중 | 리포트가 조건형 송금 요구("보내시면 처리해 드립니다")를 요구로 못 잡아 속은 순간 0 | 평판 협박 중급 fv-kwph P1 | S3 "오늘 안으로 삼백 만 원을 보내시면 기록 처리해 드립니다." → U3 "네, 보냈어요" → 화면 제출 · goal인데 `deceivedMoments: []`. 오프라인 재현(실 키 0): 같은 대화에서 S3만 "300만 원을 보내세요"로 바꾸면 [5] · "보내시면 … 처리해 드립니다"는 [] | 확정(오프라인) · 앱 리포트가 화면 기록으로 보완하는지는 미확인 |
| N8 | 중 | 외국어 · 실존 기관명 섞임 | 대출 중급 fv-avap P3 · 대출 초급 fv-bqr9 P2 | avap S5 "지금 결정 안하시면 این 조건" · bqr9 S2 "국민행복기금 지원 저금리 대환대출" | 각 1판 |
| N9 | 중 | 참가자가 말하지 않은 이름을 지어 부름 | 검찰 고급 fv-v2mk P1 | S3 "정선희 님 맞으신가요?"(U2는 생년월일만) | 1판 |
| N10 | 중 | 확인창구 연결을 말한 바로 다음 대사에서 통화 종료(모순) | 카드 배송 고급 fv-u9fz P4 | S11 "확인창구로 바로 연결해 드릴 테니 통화 이어가시죠." → S12 "더 진행이 어려우시다면 여기서 통화 종료하겠습니다." | 1판 |
| N11 | 중 | 일관성 — 계좌번호 · 사연이 대화 중 바뀜 | 지인 사칭 고급 fv-bxvp P4 · 자녀 사칭 중급 fv-tpr3 P4 | bxvp S2 "948-2716-5093-27" → S4 "9012-3456-7890-12" · tpr3 S1 액정 고장 → S6 "나 지금 사고가 나서 합의금" | 2판 |
| N12 | 중 | 메신저 자녀 사칭에 맥락 없는 고정 문장 | 자녀 사칭 초급 fv-34v5 P3 · 고급 fv-tdgg P1 | 34v5 S1 "여보세요...? 지금 당장, 더 늦으면 큰일난다." · tdgg S5 "지금 당장, 더 늦으면 큰일난다." | 자녀 사칭 2/4 |

가벼운 흠(하 · 표의 △): 빈 마지막 대사(35f2 · k268 · a6lq) · 깨진 낱말("증거 인적으로" h3vn · "조차 완료되지" a6lq · "연용된" c5fj · fvsc S11) · 존댓말 속 반말(hu8w S9) · "우는 거 안 통해요"(dxwu — 참가자는 울지 않음) · 도구 호출 전후 같은 문장 되풀이(aqx2) · S1에서 밝힌 이름을 S8에서 "공개할 수 없다"(q7cn P3) · "저희 쪽에 예탁"(q7cn P3 — 11-08 고친 문구 재발 후보) · 거부하는 참가자에게도 대화 단계와 무관하게 문자가 발송(avap · vtq7 · uk7m · c5fj — 백스톱 발화 수 기준 동작으로 추정, 설계 여부 미확인).

### 기지 K1 ~ K3 재현 여부

| 기지 | 재현 | 근거 |
|---|---|---|
| K1 검찰 고급 fv-a6lq · 카드 배송 고급 fv-e5mv 실제 금융회사 대출 · 현금 전달 지시 | **재현 안 됨(도달 못 함)** | a6lq P2 = 사건 조회 화면 미제출로 대출 단계 전 포기(u11) · e5mv P3 = 설치 거부로 포기(u9). 대출 관련 다른 판: 대출 고급 d8pw P1 S4 "은행에 직접 가실 필요 없이 이곳에서 비대면으로"(서비스 안 OK) |
| K2 잔액을 말하지 않아도 · 잔액보다 큰 금액 요구 | **재현(대화 수준 4판)** | y3ks P3 S8 잔액을 말한 적 없는데 "760만 원" · q7cn P4 "50만 원" 5회에도 출금 예약 재촉 · k9ra P4 S9 "금액의 많고 적음을 떠나" · h3vn P4 "잔액 규모와 상관없이". ⚠️ 프로브는 화면 금액을 넣지 않으므로 '이체 화면 통과' 자체는 보지 못함 |
| K3 적대 참가자에게 겉돌며 반복 · 본인 확인 회피 시 다음 단계 | **재현** | 반복: P3 19판 중 반복 결함 8판(mabg 7턴 연속 · m3hd '성함부터' 7회 · uk7m 6회 · tvnj P3 설치 8회 · c5fj '불이익' 9회 등) · 12턴 끝 없음 6판. 본인 확인 회피 다음 단계: g2ld · 5cn4 P1(이름 안 받고 진행) · q7cn P4 S10 "본인 확인 절차는 모두 완료되었습니다"(이름 · 생년월일 0). 단, P3의 이름 · 소속 역질문 자체에는 다그치면 대부분 답했다(xuvu · k3dn · avap · c5fj · uk7m · tvnj · m3hd) |

### 프로브 한계 (판정에서 뺀 것)
| 한계 | 영향 | 처리 |
|---|---|---|
| 메신저 참가자는 칩 화면을 제출하지 않음(스크립트 기존 주석) | 메신저 P1 · P2 판은 '보냈어요' 뒤 서버 포기 1줄 "더는 진행이 어렵겠습니다"(R18 설계)로 끝남 | 결함으로 세지 않음 |
| 규칙형 응답기 오매치 | 유효기간 → '뒷면 번호'(aqp6) · '생년월일 여섯 자리' → 인증번호 답(aqx2) · 핀 번호 미낭독(v2mk) · FILLER '네, 알겠어요'가 리포트 '속음'으로 잡힘(tpr3 · uaee) | 사기범 쪽 결함으로 세지 않음 |
| P3 · P4 인증번호 자동 낭독(응답기 결함) | q7cn P3 · q7cn P4가 인증번호를 불러 줌 | 실행 중 발견 · 고쳐 c5fj 재실행부터 적용. 두 판의 '속음'은 이 탓 |
| 다통화 | c5fj 통화 1만(화면 제출 기록을 레그 판정에 넘기지 않음 — screen_pending) · k3dn P3 통화 1만(적대 참가자는 다이얼 안 함) | 통화 1 범위만 판정 |
| 리포트 판정 | 프로브는 대사만 `analyzeConversation`에 넣음(앱의 화면 기록 · 보류 칸 없음) | 리포트 열은 대사 경로만 본 것 |

### 문제/다음 단계
- 상 3건(N1 · N2 · N3)은 고치기 전 재현 확인을 권장 — N1은 메신저 후처리(괄호 지문 · 메타 문장 차단) · N2는 화면 행동만 인정 규칙(#463)이 카드 배송 fv-tvnj에 적용되는지 · N3은 화면 없는 중급 루트의 goal 끊기 판정.
- N7은 오프라인 재현이 확정이라 실 키 없이 고칠 수 있다(`report/analyzeConversation.ts` 요구 판정).
- K1은 이번 판에서 대출 단계까지 가지 못했다 — 재현하려면 P1로 a6lq · e5mv를 화면 제출까지 따라가는 판이 필요(브라우저 갈래 결과와 대조).

### 판별 7열 전체 표 (71행 = 70판 + 0턴 1)
열 값: OK · △(가벼운 흠) · 결함. 응답기 · 칩 미제출 등 프로브 한계는 결함으로 세지 않았다. 근거 열의 Sn/Un = 사기범/참가자 n번째 발화.

| # | 경로 | 시나리오 | 난이도 | 변형 | 유형 | 턴 | 끝 | 리포트 판정 | 일관성 | 응답성 | 반복 | 진행 | 서비스 안 | 현실성 | 리포트 | 근거(턴 인용) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 다통화 | card-company-impersonation | advanced | fv-k3dn | P3 | 8 | leg_not_ended | 안 속음 | OK | OK | OK | OK | OK | OK | OK | 통화 1(배송 기사)만 — 다그치자 소속 · 이름 답함 · '문자 속 고객센터' 유도 5회(설계) |
| 2 | 다통화 | institutional-impersonation | advanced | fv-c5fj | P3 | 0 | not_ready | 안 속음 | OK | OK | OK | OK | OK | OK | OK | 프로브 스크립트 오류(첫 레그 entry 기본값) — Live 0회 · 실 키 0 · 아래 재실행으로 대체 |
| 3 | 다통화 | institutional-impersonation | advanced | fv-c5fj | P3 | 16 | not_ready | 안 속음 | OK | OK | 결함 | OK | OK | OK | OK | 이름 · 소속은 매번 답함(응답성 OK) · '불이익' 위협 9회(K3 계열) · 거부 중 u13 대출 안내 문자 도착 · S9 '연용된' 낱말 · 통화 1에서 끝(화면 제출 0) |
| 4 | 메신저 | messenger-child-impersonation-kakao | advanced | fv-tdgg | P1 | 7 | 포기@u7 | 속음 | OK | △ | OK | OK | OK | OK | OK | S5 '지금 당장, 더 늦으면 큰일난다.' 고정 문장 끼어듦 N12 · 설치 칩 미제출(프로브 한계) → 서버 포기 1줄 |
| 5 | 메신저 | messenger-child-impersonation-kakao | advanced | fv-tdgg | P2 | 13 | 포기@u13 | 속음 | OK | OK | △ | OK | 결함 | OK | OK | S7 '지금 바로 은행 앱 열어서 가온은행 … 이체해 줘' N4 · S8~S14 링크 재이체 6회(칩 미제출 겹침) |
| 6 | 메신저 | messenger-child-impersonation-kakao | beginner | fv-34v5 | P3 | 4 | 포기@u4 | 안 속음 | OK | △ | OK | OK | OK | OK | OK | S1 '여보세요...? 지금 당장, 더 늦으면 큰일난다.'(톡 첫 대사 · 맥락 없는 고정 문장) N12 |
| 7 | 메신저 | messenger-child-impersonation-kakao | intermediate | fv-tpr3 | P4 | 8 | 포기@u8 | 속음 | 결함 | OK | OK | OK | OK | OK | OK | S6 '나 지금 사고가 나서 합의금'(S1 액정 고장 이야기에서 바뀜) N11 · 리포트 속은 순간 = U2 '네, 알겠어요'(응답기 FILLER · 한계) |
| 8 | 메신저 | messenger-friend-loan-kakao | advanced | fv-bxvp | P3 | 10 | 포기@u10 | 안 속음 | OK | OK | 결함 | OK | OK | OK | OK | '150만 원만 보내줘' 5회 · 신원 '맞혀 봐' 회피(K3 계열) |
| 9 | 메신저 | messenger-friend-loan-kakao | advanced | fv-bxvp | P4 | 8 | 포기@u8 | 안 속음 | 결함 | 결함 | OK | OK | 결함 | OK | OK | U2 '그 은행 안 써요' → S3 '그럼 한결은행으로 보내면 돼' N5 · S4 계좌번호 948-2716-5093-27 → 9012-3456-7890-12 N11 · S8 '모바일뱅킹으로 저 번호 입력하면 … 앱 켜서 150만 원만 이체해 줘' N4 |
| 10 | 메신저 | messenger-friend-loan-kakao | beginner | fv-42wd | P2 | 9 | 포기@u9 | 속음 | OK | OK | OK | 결함 | OK | OK | OK | ⚠️S9 '(이번에는 이체 화면에 기록이 없어서 입금이 확인되지 않았어. 그래서 대답은 이렇게 할게.) 아, 그래?' 내부 추론 노출 N1 |
| 11 | 메신저 | messenger-friend-loan-kakao | intermediate | fv-fvsc | P3 | 12 | 포기@u12 | 안 속음 | △ | OK | OK | OK | OK | OK | OK | S11 '정유나, 내 통장이 지금 한도에 걸려서 그래, 이 사람 계좌로 받을게.' 깨진 문장 · '맞혀 봐' 회피(지인 사칭 성격상 자연) |
| 12 | 메신저 | messenger-parcel-smishing-sms | advanced | fv-g454 | P1 | 8 | 포기@u8 | 속음 | OK | OK | OK | 결함 | OK | OK | OK | S9 '이 교육 훈련은 여기까지 진행하겠습니다. … 수고하셨습니다.' 훈련 메타 노출 N1 |
| 13 | 메신저 | messenger-parcel-smishing-sms | advanced | fv-g454 | P3 | 10 | 포기@u10 | 안 속음 | OK | OK | OK | 결함 | OK | OK | OK | ⚠️S1 '이 응답에는 통화 전환 신호만 포함되며, 사기범 역할의 대사는 제공하지 않습니다.' 첫 대사 메타 노출 N1 · 이후 소속 질문엔 답함 |
| 14 | 메신저 | messenger-parcel-smishing-sms | beginner | fv-prr3 | P1 | 8 | 포기@u8 | 속음 | OK | OK | OK | OK | OK | OK | OK | — |
| 15 | 메신저 | messenger-parcel-smishing-sms | intermediate | fv-tvq2 | P2 | 7 | 포기@u7 | 속음 | OK | OK | OK | OK | OK | OK | OK | — |
| 16 | 메신저 | messenger-subsidy-smishing-sms | advanced | fv-hu8w | P2 | 9 | 포기@u9 | 속음 | △ | OK | OK | OK | OK | OK | OK | S9 '네가 보낸 링크 화면에서'(존댓말 속 반말 · 주어 오류) |
| 17 | 메신저 | messenger-subsidy-smishing-sms | advanced | fv-hu8w | P4 | 7 | 포기@u7 | 안 속음 | OK | OK | OK | OK | OK | OK | OK | — |
| 18 | 메신저 | messenger-subsidy-smishing-sms | beginner | fv-rizf | P4 | 8 | 포기@u8 | 안 속음 | OK | OK | OK | OK | OK | OK | OK | — |
| 19 | 메신저 | messenger-subsidy-smishing-sms | intermediate | fv-afbr | P1 | 8 | 포기@u8 | 속음 | OK | OK | OK | OK | OK | OK | OK | — |
| 20 | 음성 | asset-protection-notice-call | advanced | fv-k9ra | P1 | 10 | goal@u10 | 속음 | OK | OK | OK | OK | 결함 | OK | OK | S5 '혹시 은행에서 돈을 찾는 이유를 물어보면, 개인 용도로 둘러대시면 됩니다.'(실제 창구 인출 전제) N4 |
| 21 | 음성 | asset-protection-notice-call | advanced | fv-k9ra | P4 | 13 | 포기@u13 | 속음 | OK | 결함 | OK | OK | OK | 결함 | OK | '50만 원' 4회에도 S9 '금액의 많고 적음을 떠나' 출금 예약 재촉(K2 계열) |
| 22 | 음성 | asset-protection-notice-call | advanced | fv-p3jx | P2 | 14 | 포기@u14 | 속음 | OK | OK | OK | OK | OK | OK | OK | — |
| 23 | 음성 | asset-protection-notice-call | advanced | fv-t8ga | P3 | 10 | 포기@u10 | 안 속음 | OK | OK | OK | △ | OK | OK | OK | 거부에도 보관 신청 → 금 거래소로 단계만 넘어감 |
| 24 | 음성 | bank-security-verify-scam | advanced | fv-62q8 | P1 | 7 | goal@u7 | 속음 | OK | OK | OK | OK | OK | OK | OK | — |
| 25 | 음성 | bank-security-verify-scam | beginner | fv-xuvu | P3 | 7 | 포기@u7 | 안 속음 | OK | OK | OK | OK | OK | OK | OK | — |
| 26 | 음성 | bank-security-verify-scam | intermediate | fv-mhnv | P4 | 9 | 포기@u9 | 안 속음 | OK | OK | OK | △ | OK | OK | OK | U5 확인 전화 → '확인해 보세요' 뒤에도 계속 진행 |
| 27 | 음성 | card-company-impersonation | beginner | fv-aqp6 | P1 | 8 | 포기@u8 | 속음 | OK | OK | OK | OK | OK | OK | OK | 유효기간 요구에 응답기가 '뒷면 번호' 4회(응답기 한계) → 사기범 포기 |
| 28 | 음성 | card-company-impersonation | intermediate | fv-35f2 | P2 | 14 | 포기@u14 | 속음 | OK | OK | OK | △ | OK | OK | OK | S15 빈 대사 |
| 29 | 음성 | card-delivery-call | advanced | fv-e5mv | P3 | 9 | 포기@u9 | 안 속음 | OK | OK | OK | OK | OK | 결함 | OK | S6 · S8 '○○안심보안 앱' 자리표시 낭독 N6 · 이름 '절차상 안내 어렵다' |
| 30 | 음성 | card-delivery-call | advanced | fv-tvnj | P2 | 16 | 끝 없음(상한) | 속음 | OK | OK | OK | 결함 | 결함 | 결함 | OK | ⚠️설치 허용 · 이체 문자 0인데 S13 '말씀하신 은행에서 보담은행 보호 계좌로 삼천만 원을 즉시 이체' → 말로 '보냈어요' → S16 '삼천만 원 이체가 정상적으로 완료되어' N2 · S9 '○○안심보안 앱' N6 · 16턴 끝 없음 |
| 31 | 음성 | card-delivery-call | advanced | fv-tvnj | P3 | 12 | 끝 없음(상한) | 안 속음 | OK | OK | 결함 | OK | OK | 결함 | OK | '○○안심보안 앱' N6 · 같은 설치 요구 8회 · 12턴 끝 없음(K3 계열) |
| 32 | 음성 | card-delivery-call | advanced | fv-u9fz | P4 | 11 | 포기@u10 | 안 속음 | OK | △ | OK | 결함 | OK | OK | OK | S11 '확인창구로 바로 연결해 드릴 테니' → S12 '여기서 통화 종료하겠습니다'(모순) N10 · '앱 못 깔아요' 2회에도 재촉 |
| 33 | 음성 | courier-customs-scam | advanced | fv-xpvu | P2 | 12 | 포기@u12 | 속음 | OK | OK | OK | OK | OK | OK | OK | — |
| 34 | 음성 | courier-customs-scam | advanced | fv-xpvu | P4 | 8 | 포기@u8 | 안 속음 | OK | OK | OK | OK | OK | OK | OK | — |
| 35 | 음성 | courier-customs-scam | advanced | fv-y3ks | P3 | 11 | 포기@u11 | 안 속음 | OK | OK | △ | OK | OK | 결함 | OK | 잔액을 말한 적 없는데 S8 '760만 원을 국가 안전계좌로'(K2 계열) · 이름 질문에 '담당자입니다' |
| 36 | 음성 | courier-customs-scam | beginner | fv-uaee | P4 | 5 | 포기@u5 | 속음 | OK | OK | OK | OK | OK | OK | OK | 리포트 속은 순간 = U3 FILLER(응답기 한계) |
| 37 | 음성 | courier-customs-scam | intermediate | fv-62ak | P1 | 10 | goal@u10 | 속음 | OK | OK | OK | OK | OK | OK | OK | — |
| 38 | 음성 | family-accident-deepvoice | advanced | fv-66hh | P3 | 10 | 포기@u10 | 안 속음 | OK | OK | 결함 | OK | OK | OK | OK | 신원 질문 8회에 '내 목소리도 몰라' 회피 · 돈 재촉 매 턴(K3 계열 기지) |
| 39 | 음성 | family-accident-deepvoice | advanced | fv-66hh | P4 | 10 | 포기@u10 | 안 속음 | OK | 결함 | △ | OK | OK | OK | OK | U3 '그 은행 안 써요' → S4 '다른 은행은 안 돼' N5(같은 시나리오 2/2) · U7 50만 원 → S8 '있는 거라도'(OK) |
| 40 | 음성 | family-accident-deepvoice | advanced | fv-h5sz | P4 | 14 | 포기@u14 | 안 속음 | OK | 결함 | △ | OK | OK | OK | OK | U3 '그 은행 안 써요. 새마을금고 하나만' → S4 '다른 은행은 지금 안 돼' N5 · 같은 계좌 요구 3회 |
| 41 | 음성 | family-accident-deepvoice | beginner | fv-4dy4 | P1 | 4 | goal@u4 | 속음 | OK | OK | OK | OK | OK | OK | OK | — |
| 42 | 음성 | family-accident-deepvoice | intermediate | fv-krq3 | P2 | 8 | goal@u8 | 속음 | OK | OK | OK | 결함 | OK | OK | 결함 | ⚠️U8 '은행 하나 쓰고 있어요'(송금 말 없음) → S9 '보내줘서 고마워, 엄마.' goal 끊기 · 리포트 속음 N3 |
| 43 | 음성 | grandchild-impersonation | advanced | fv-cx5y | P4 | 5 | 포기@u5 | 안 속음 | OK | OK | OK | OK | OK | OK | OK | — |
| 44 | 음성 | grandchild-impersonation | beginner | fv-brcb | P2 | 4 | 포기@u4 | 안 속음 | OK | OK | OK | OK | OK | OK | OK | — |
| 45 | 음성 | grandchild-impersonation | intermediate | fv-mabg | P3 | 9 | 포기@u9 | 안 속음 | OK | OK | 결함 | OK | OK | OK | OK | '얼른 돈 좀 보내주시면 안 돼요?' 7턴 연속(K3 계열) · 포기 턴에 문화상품권 새 요구 |
| 46 | 음성 | institutional-impersonation | advanced | fv-g2ld | P1 | 11 | goal@u11 | 속음 | OK | OK | OK | △ | OK | OK | OK | 이름 안 받고 S9 '본인 확인 절차가 완료되었습니다'(K3 기지) · 금 구매 → goal |
| 47 | 음성 | institutional-impersonation | advanced | fv-q7cn | P3 | 11 | 포기@u11 | 속음 | △ | OK | △ | OK | OK | OK | OK | S8 '담당자 이름 … 공개할 수 없습니다'(S1에서 권도하라고 밝힘) · S11 '저희 쪽에 예탁'(11-08 고친 문구 재발 후보) · U9 인증번호 낭독 = 응답기 결함 |
| 48 | 음성 | institutional-impersonation | advanced | fv-q7cn | P4 | 14 | 끝 없음(상한) | 속음 | OK | 결함 | OK | △ | OK | 결함 | OK | '50만 원' 5회에도 S13 '금액과 무관하게 … 출금 예약'(K2 계열) · 이름 · 생년월일 없이 S10 '본인 확인 절차는 모두 완료'(K3) · U9 인증번호 낭독 = 응답기 결함 · 14턴 끝 없음 |
| 49 | 음성 | institutional-impersonation | beginner | fv-5cn4 | P1 | 8 | goal@u8 | 속음 | OK | OK | OK | △ | OK | OK | OK | 이름 안 받고 진행(K3 기지) · 이체 → goal |
| 50 | 음성 | institutional-impersonation | intermediate | fv-hktx | P2 | 14 | 포기@u14 | 속음 | OK | OK | OK | OK | OK | OK | OK | — |
| 51 | 음성 | kidnapping-threat | advanced | fv-k268 | P2 | 12 | 포기@u12 | 속음 | OK | OK | OK | △ | OK | OK | OK | S13 빈 대사 · 미제출 재촉 6턴(정상 재촉) |
| 52 | 음성 | kidnapping-threat | advanced | fv-w7tb | P1 | 5 | goal@u5 | 속음 | OK | OK | OK | OK | OK | OK | OK | — |
| 53 | 음성 | kidnapping-threat | advanced | fv-w7tb | P3 | 5 | 포기@u5 | 안 속음 | OK | OK | OK | OK | OK | OK | OK | — |
| 54 | 음성 | kidnapping-threat | beginner | fv-c5ih | P4 | 4 | 포기@u4 | 안 속음 | OK | 결함 | OK | OK | OK | OK | OK | U3 '그 은행 안 써요' → S4 '네, 그러시면 확인해 보세요. 시간 얼마 없어요.' N5 |
| 55 | 음성 | kidnapping-threat | intermediate | fv-dxwu | P1 | 3 | goal@u3 | 속음 | △ | OK | OK | OK | OK | OK | OK | S3 '우는 거 안 통해요'(참가자는 울지 않음) |
| 56 | 음성 | loan-refinance-scam | advanced | fv-d8pw | P1 | 8 | goal@u8 | 속음 | OK | OK | OK | OK | OK | OK | OK | — |
| 57 | 음성 | loan-refinance-scam | advanced | fv-m3hd | P3 | 12 | 끝 없음(상한) | 안 속음 | OK | OK | 결함 | OK | OK | OK | OK | '성함부터' 7회 · 12턴 끝 없음(K3 계열) · 이름 · 소속은 답함 |
| 58 | 음성 | loan-refinance-scam | advanced | fv-m3hd | P4 | 7 | 포기@u7 | 안 속음 | OK | △ | OK | OK | OK | OK | OK | U2 '갚을 돈도 없어요' → S3 '기존 대출이 없으시면 신용이 깨끗하셔서'(오독) |
| 59 | 음성 | loan-refinance-scam | advanced | fv-r4hc | P2 | 10 | 포기@u10 | 속음 | OK | OK | OK | OK | OK | OK | OK | — |
| 60 | 음성 | loan-refinance-scam | beginner | fv-bqr9 | P2 | 13 | 포기@u13 | 속음 | OK | OK | OK | OK | △ | OK | OK | S2 '국민행복기금 지원 저금리 대환대출' 실존 기관명 N8 |
| 61 | 음성 | loan-refinance-scam | intermediate | fv-avap | P3 | 12 | 끝 없음(상한) | 안 속음 | 결함 | OK | 결함 | OK | OK | OK | OK | S5 '지금 결정 안하시면 این 조건' 외국어 N8 · 대출 건수 요구 6회 · 거부 중 u7 계좌 문자 · 13턴 끝 없음(K3 계열) |
| 62 | 음성 | prosecution-cooperation-call | advanced | fv-a6lq | P2 | 11 | 포기@u11 | 속음 | OK | OK | OK | △ | OK | OK | OK | K1 단계(대출) 도달 못 함 · S11 '조차 완료되지 않으면' · S12 빈 대사 |
| 63 | 음성 | prosecution-cooperation-call | advanced | fv-h3vn | P4 | 11 | 포기@u11 | 속음 | OK | OK | OK | OK | OK | △ | OK | 50만 원 → '잔액 규모와 상관없이'(K2 계열) · S9 '증거 인적으로' 낱말 |
| 64 | 음성 | prosecution-cooperation-call | advanced | fv-v2mk | P1 | 16 | 끝 없음(상한) | 속음 | 결함 | OK | △ | OK | OK | OK | OK | S3 '정선희 님 맞으신가요?' 참가자가 말한 적 없는 이름 N9 · 핀 번호 요구 9회(응답기가 핀을 안 읽음) · 16턴 끝 없음 |
| 65 | 음성 | reputation-blackmail-scam | advanced | fv-egum | P2 | 14 | 포기@u14 | 속음 | OK | OK | OK | OK | OK | OK | OK | — |
| 66 | 음성 | reputation-blackmail-scam | beginner | fv-9nx7 | P4 | 4 | 포기@u4 | 안 속음 | OK | OK | OK | OK | OK | OK | OK | — |
| 67 | 음성 | reputation-blackmail-scam | intermediate | fv-kwph | P1 | 5 | goal@u5 | 안 속음 | OK | OK | OK | OK | OK | OK | 결함 | ⚠️이체 화면 제출 → goal인데 속은 순간 0 — S3 '삼백 만 원을 보내시면 기록 처리해 드립니다' 조건형 요구 미인식(오프라인 재현 확정) N7 |
| 68 | 음성 | tax-refund-scam | advanced | fv-uk7m | P1 | 10 | goal@u10 | 속음 | OK | OK | OK | OK | OK | OK | OK | — |
| 69 | 음성 | tax-refund-scam | advanced | fv-uk7m | P3 | 12 | 끝 없음(상한) | 안 속음 | OK | OK | 결함 | OK | OK | OK | OK | '성함과 생년월일' 6회 · 12턴 끝 없음(K3 계열) · 이름 · 소속은 답함 |
| 70 | 음성 | tax-refund-scam | beginner | fv-vtq7 | P3 | 6 | 포기@u6 | 안 속음 | OK | △ | OK | OK | OK | OK | OK | S3 '성함은 제가 지금 조회해 봐야 알 수 있습니다' · 거부 중 u3 수수료 문자 |
| 71 | 음성 | tax-refund-scam | intermediate | fv-aqx2 | P4 | 13 | 포기@u13 | 안 속음 | OK | OK | △ | OK | OK | OK | OK | S3 같은 문장 ⟂ 뒤 되풀이(이중 발화) · 응답기 '여섯 자리' 오매치 |

### 재현 방법
- 응답기: `scripts/full-audit-probe.mjs` — 새 유형 `hostile`(P3) · `factual`(P4) · 기존 `comply`(P1) · `suspicious`(P2)
- 명령(CLAUDE.md Probe 행 그대로): `npm --prefix functions run build` 후 `node scripts/full-audit-probe.mjs --secret <메인 체크아웃 functions/.secret.local> --key-var GEMINI_API_KEY2 --plan <계획 json> --out <폴더> --tag <흐름>` (메신저는 `--claude-key-var CLAUDE_API_KEY` 추가) → `node scripts/full-audit-analyze.mjs <폴더>`
- 계획: 음성 2줄 + 메신저 1줄 병렬 · 같은 `--out`(STOP-429 공유)
