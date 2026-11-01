# 카드사 부정결제 사칭 고급(fv-x7ue) 실기기 신고 U2 · U3 · U7 (2026-11-01)

## 금지 · 경계
- ⛔ `fv-akj5`(2인 챌린지 수신자 고급) · `fv-6s5p`(대환대출 챌린지 고급)는 #192 조립 바이트 고정이다. 해시 테스트(`inCallSms/__tests__/smsGate.test.ts`)가 지킨다. 두 변형이 끌어 쓰는 줄은 고치지 않고 아래 표에 "남김"으로 적는다.
- ⛔ 은퇴 변형(`retired: true` — 옛 세션 · 리포트 해석용)의 문면은 바꾸지 않는다(§84.16.2 "내용이 바뀌는 쪽이 새 ID").
- 실존 앱 · 은행 · 기관 이름은 쓰지 않는다. 화면에 고유명이 없는 자리는 고유명을 새로 만들지 않고 화면 제목의 일반명을 쓴다.
- 실 키 실측은 이 작업에 포함하지 않았다. 아래 "확인 안 됨" 칸 참고.

## U2 — 설치 문자 없이 설치 요구 · 말로만 "설치했다"에 다음 단계

### 원인
| # | 원인 | 근거 |
|---|---|---|
| 1 | `fv-x7ue`는 `fv-akj5`를 스프레드해 단계 2 "보안 점검 앱을 설치하라고 요구한다"와 수법 `APP_INSTALL`(card-delivery-call 원본 — 자리표시 앱 이름으로 **말로만** 설치 요구)을 물려받았다. 문자 도구를 먼저 부르라는 지시(`withSmsFirst`)도, 문자 링크 화면을 가리키는 말도 없었다 | `flowVariants.ts` fv-akj5 stages · `cardDeliveryCall.prompt.ts:51` |
| 2 | 설치 문자(`card-guard-app-link`)는 하한 2 · 백스톱 간격 2(넛지 4 · 강제 6)라, 사기범이 단계 2에서 설치를 요구한 뒤 문자가 몇 발화 늦게 왔다 | `smsGate.ts` `planSmsBackstop` |
| 3 | 실시간(Live) 사기범에게 "권한 허용을 눌렀다"를 알리는 배선이 없었다. 응낙은 기록만 되고(T194-c-1), Live 주입은 T194-c-2로 남아 있었다. 그래서 사기범이 판단할 근거는 참가자가 "설치했어요"라고 하는 말뿐이었다. 폴백(텍스트)은 `sendMessage` 응낙 턴 지시가 이미 있었다 | `session/play/page.tsx` `handleRecordInCallInstall` 주석 · `mockScreens.ts` `IN_CALL_INSTALL_CONSENT_INSTRUCTION`(소비처 0) |

### 고친 것
| 항목 | 변경 | 범위 |
|---|---|---|
| 단계 문면 | 설치 단계 = 문자 도구 먼저(`withSmsFirst`) · "앱이 상대가 설치와 권한 허용을 마쳤다고 알려 준 뒤에만(또는 분명히 거절하면) 다음 단계" | fv-x7ue 단계 2 · fv-w3dq 단계 3 |
| 수법 문면 | `CARD_APP_INSTALL_VIA_SMS` — 문자 링크 화면에서만 설치 · 문자 전 재촉 금지 · 말로만 설치했다고 하면 "권한 허용하고 계속하기"까지 누르게 한 번 되돌리고 화면에서 어디까지 했는지 묻기(같은 말 되풀이 금지). 라벨 "보안 점검 앱 설치 요구"는 그대로 | fv-x7ue · fv-w3dq |
| 백스톱 | 설치 문자 간격 1(넛지 3 · 강제 4) · 하한 2 그대로 | fv-x7ue · fv-w3dq |
| 실시간 신호 | `recordMockScreenEvent`가 통화 중 설치 화면의 **첫 응낙**(실시간)에 `contextInstruction`(= `IN_CALL_INSTALL_CONSENT_INSTRUCTION`, 호 전환 뒤면 없음)을 돌려주고, 화면이 맥락 주입(`installConsented`)으로 넣는다 | 통화 중 설치 화면이 있는 모든 세션(카드사 · 대환대출 자가 고급 등) |

## U3 — 예금주는 같은데 은행명이 세션마다 다름

### 판정표 (세션 은행명 `fictionalBankName`)
| 세션이 보여 주는 계좌 | 세션 은행명 |
|---|---|
| 선언한 계좌 문자에 "예금주:" 줄이 있다 | 그 예금주의 고정 은행(`fictionalBank.ts` `ACCOUNT_HOLDER_BANKS`) |
| 계좌 문자는 없고 변형에 가상 예금주(`accountHolder` — 메신저 6벌)가 있다 | 그 예금주의 고정 은행 |
| 예금주가 보이지 않는다(말로 부르는 예시 계좌 · 계좌 없음) | 세션마다 고른다(종전) |

### 권고안(계좌번호 · 은행 · 예금주 한 묶음 고정)을 택한 이유
| 대안 | 판단 |
|---|---|
| **A. 셋 다 고정 (택함)** | 한 사람 명의 통장은 한 은행에 있다. 세션 은행명 하나만 정하면 문자 · 대사 · 이체 화면 · 확인 창구 · 리포트가 지금처럼 같은 값을 쓴다(새 필드 0) |
| B. 셋 다 세션마다 바꿈 | 문자 본문 계좌번호 · 예금주와 변형 예금주를 세션마다 만들어야 한다. 대사 · 문자 · 이체 화면 · 리포트 · 예금주 수법 1줄이 같은 값을 쓰는지 검증할 축이 늘어나고, P2-d · S1 테스트가 고정값을 전제로 한다 |
| 현행(은행만 바뀜) | 같은 대포통장이 은행만 바뀌는 모양 — 신고 그대로 |

### 함께 바뀌는 것
- 세션 은행명과 같은 자리의 가상 카드사 · 캐피탈 이름(`fictionalOrgNamesFor`)도 그 변형에서 늘 같아진다. 예: fv-x7ue = 미르은행 자리.
- 이미 만든 세션은 저장된 `fictionalBankName`을 그대로 쓴다(무소급).
- 은행 앱(BA-1)의 "내 은행"은 사기범 계좌 은행을 피해서 고르므로(`myBankNameFor(seed, avoid)`) 영향이 없다.

## U7 — 자리표시(○○ · OO) 이름 잔재 전수 조사

조사 범위: `functions/src` · `src`의 비테스트 `.ts` · `.tsx` 전체, 패턴 `[○OＯ]{2}`. 분류 기준은 아래 판정표다.

### 판정표
| 분류 | 판정 |
|---|---|
| 실행 중 세션 가상 이름으로 바뀌는 토큰(`OO은행` · `○○은행` · `○○카드` · `○○캐피탈` — `applyFictionalBank`) | 잔재 아님 — 그대로 |
| 검출기 · 가드레일 · 주석 · 테스트용 문자열(`thoughtLeak` · `replyMarkup` · `realFinancialNames` 등) | 잔재 아님 — 그대로 |
| 모델이 채우는 틀(예: "○○ 님 본인 맞으시죠?" — ○○ = 참가자 이름) | 잔재 아님 — 그대로 |
| 화면 · 대사에 그 글자 그대로 나오는 이름 자리, 배정되는 변형 | **바꿈** |
| 위와 같으나 #192 바이트 고정 · 은퇴 변형만 쓰는 줄 | **남김** — 보고 |
| 기관 이름 일반 규칙("그 밖의 기관 이름은 OO를 붙여 말한다") | **남김** — 정책 결정 필요(아래) |

### 이름 자리 목록
| 자리 | 위치 | 쓰는 변형 | 처리 |
|---|---|---|---|
| 보안 앱 `○○안심보안` | `flowVariants.ts` 카드사 설치 수법(원본 `APP_INSTALL` 참조) | fv-x7ue · fv-w3dq | **바꿈** → "피해 차단용 보안 앱"(설치 화면 `card-guard-app-install` 제목) |
| 보안 앱 `○○안심보안` | `flowVariants.ts` 대환대출 설치 수법 | fv-m3hd(스프레드 덮어쓰기) · fv-d8pw · fv-r4hc | **바꿈** → "심사용 보안 점검 앱"(설치 화면 `loan-check-app-install` 제목) |
| 보안 앱 `○○안심보안` | `cardDeliveryCall.prompt.ts:51` 수법 "보안 점검 앱 설치 요구" | fv-akj5(라벨 참조) · fv-tvnj(은퇴 원본) | **남김** — fv-akj5 #192 바이트 고정. ⚠️ 2인 챌린지 수신자 고급에서 실제 사용자에게 "○○안심보안"이 계속 들린다 |
| 보안 앱 `○○안심보안` | `cardDeliveryCall.prompt.ts:42` 페르소나 규칙 | fv-w3dq 0번 화자(`CARD_DELIVERY_PERSONA`) · card-delivery-call 원본 세션(fv-tvnj · fv-e5mv · fv-u9fz — 합쳐진 시나리오 · 새 세션 거부 §92) | **fv-w3dq만 바꿈** → 그 줄만 "피해 차단용 보안 앱"으로 바꿔 끼운 페르소나(`CARD_DELIVERY_PERSONA_GUARD_APP`). 원본 줄은 옛 세션용으로 **남김** |
| 보안 앱 `○○안심보안` | `flowVariants.ts` LOAN_ADVANCED_FV_6S5P | fv-6s5p | **남김** — #192 바이트 고정 |
| 학원 `○○학원` | `flowVariants.ts` 납치 협박 고급 "가족 정보 언급" | fv-k268 · fv-w7tb | **남김 — 결정 필요**. 사기범이 "○○학원 앞이에요"처럼 가려 말하는 것이 설계다(`replyMarkup.ts` 4-d가 일부러 남기고 테스트가 고정 · "내 정보" 카드가 있으면 `personaCardIdentity.ts` `CHILD_ACADEMY_MASK` 치환으로 카드 학원 이름이 된다). 카드가 없을 때 소리 내어 "○○학원"이라 말하는 것을 바꿀지는 정책 결정 — 바꾸면 치환 원천 · 출력 정리 규칙 · 테스트 3곳이 함께 바뀐다 |
| 거래소 `OO거래소` | `flowVariants.ts` PROSECUTION_WALLET_STAGES_TAIL[1] · `prosecutionCooperationCall.prompt.ts:96 · 97 · 109` | fv-c8wq(은퇴) | **남김** — 은퇴 변형 문면. 지금 배정되는 fv-h3vn은 이 줄을 쓰지 않는다 |
| 은행 `○○은행` | `publicMeta.ts:275` · `src/content/scenarios/bankSecurityVerifyScam.ts:22` `deepvoiceLines` | (렌더하는 곳 없음 — 타입 필드만) | **남김** — 화면에 나오지 않는다(`deepvoiceLines` 소비처 0) |
| 기관 일반 규칙 "OO를 붙인 이름" | `assetProtectionNoticeCall.prompt.ts:24` · `institutionalImpersonation.prompt.ts:37` · `prosecutionCooperationCall.prompt.ts:26`(은퇴 fv-p4hz) | 자산 보호 · 기관 사칭 세션 | **남김 — 결정 필요**. 정해진 가상 이름(검찰 · 금감원 · 자산보호센터) **밖의** 기관을 모델이 말할 때 "OO경찰서"처럼 글자 그대로 나올 수 있다(`OO은행`은 세션 은행명으로 바뀐다). 가상 이름 허용은 정확 일치 1벌뿐이라는 DECISIONS #224와 묶인 정책이라 이 PR에서 바꾸지 않았다 |
| 저축은행 `○○저축은행` | `personaCardCatalog.ts:159` | 주석뿐(화면 값은 이미 "저축은행 대출 이용 중") | 해당 없음 |

## 확인 안 됨
- 실 모델이 새 수법 문면대로 문자 전 설치 재촉을 멈추고, 말로만 "설치했다"에 되돌리는지는 실 키 실측 전이라 모른다.
- 실시간 맥락 주입(`installConsented`)이 실기기 Live 통화에서 다음 응답에 반영되는지는 확인하지 않았다(같은 꼴인 §132.7 `landingSubmitted`는 실측 반영 기록이 있다 — 이번 변경의 근거로 대신하지 않는다).
