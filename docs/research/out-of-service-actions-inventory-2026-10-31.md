# 서비스 밖 행동 전수 목록 — 부록 (2026-10-31)

## 금지·범위
- **결정 (2026-10-31)**: 판정표에 D9 행 3개를 확정 추가했다. (i) 통화 · 대화 안에서 말로 정보 요구 → O4(세지 않음) · (ii) 확인 차단 · 통화 유지 → O5(세지 않음) · (iii) 기기 실제 사진첩 · 신분증 사진 → O1-device. 이 문서의 "미분류" 행은 이 세 행으로 다시 읽는다. 회귀 테스트 `functions/src/roleplay/__tests__/outOfServiceActions.test.ts`가 판정표를 고정한다.
- 본문은 `in-service-experience-plan-2026-10-31.md`. 이 문서는 그 부록이다.
- 읽기 전용 서브에이전트 4개가 작성했다(A: 통화 6종 · B: 통화 7종(클론 포함) · C: 메신저 4종 · D: 공통 블록 · 모의 화면 · 리포트). 메인 세션은 표본 10곳의 원문과 줄 번호를 다시 열어 확인했다(본문 §0).
- 줄 번호는 main `b9d25cb2` 기준이다. 약어: FV = `functions/src/scenarios/flowVariants.ts`, SMS = `inCallSms.ts`.


---

<!-- inventory-A -->
### 서비스 밖 실제 행동 유도 인벤토리 — 통화 시나리오 A군

- 대상: `institutional-impersonation` · `card-company-impersonation` · `card-delivery-call` · `asset-protection-notice-call` · `prosecution-cooperation-call` · `bank-security-verify-scam`
- 기준 저장소: `C:\Projects\codegate\.claude\worktrees\elegant-cray-d1b0d2` (읽기 전용 조사, 수정 0)
- 파일 약칭: **FV** = `functions/src/scenarios/flowVariants.ts` · **SMS** = `functions/src/scenarios/inCallSms.ts` · **MS** = `functions/src/scenarios/mockScreens.ts` · **VI** = `functions/src/scenarios/verifyIntercept.ts` · **II** = `institutionalImpersonation.prompt.ts` · **CC** = `cardCompanyImpersonation.prompt.ts` · **CD** = `cardDeliveryCall.prompt.ts` · **AP** = `assetProtectionNoticeCall.prompt.ts` · **PC** = `prosecutionCooperationCall.prompt.ts` · **BS** = `bankSecurityVerifyScam.prompt.ts` (모두 `functions/src/scenarios/`) · **SC/** = `src/content/scenarios/`
- 판정표는 지시받은 5행만 적용했다. 어느 행에도 맞지 않는 것은 유형 = **미분류**(주로 "통화 안에서 말로 정보를 불러 달라는 요구" · "통화 유지 요구" · "확인하지 말라는 차단")로 적고 근거를 남겼다.
- "고급 확인 창구(VI)"는 `VI:209-215`에 등록된 시나리오의 **고급에서만** 켜지는 앱 안 확인 컨트롤(오퍼 · 모의 재연결)이다.
- `RELAY_RUNTIME_AVAILABLE = false`(FV:141) — legs 2인 변형도 실제로는 한 화자가 진행한다.

### 표

| 시나리오 | 루트(variantId, 난이도, 은퇴여부) | 단계/위치 | 원문(120자 이내) | 근거(파일:줄) | 유형 | 위험도 | 서비스 안 화면 존재 여부 |
|---|---|---|---|---|---|---|---|
| institutional-impersonation | 공통 수법(hktx 전부 · 각 변형 keepLabels) | 수법 "권위 암시" | 구체적 소속·사건번호 없이 '수사관', '금융감독원'이라는 직함만으로 신뢰를 유도한다. | II:54 | O5-mention | 낮음 | 해당 없음 |
| institutional-impersonation | 공통(5cn4 · hktx · pgqt) | 수법 "긴급성 조성" | '지금 즉시', '오늘 안에 처리해야 한다' 식으로 생각할 시간을 주지 않는다. | II:55 | O5-mention | 낮음 | 해당 없음 |
| institutional-impersonation | 공통(hktx만 — 다른 변형 keepLabels에 없음) | 수법 "확인 절차 차단" | '직접 방문하시면 안 됩니다', '유선으로만 처리 가능합니다' 처럼 제3자·기관 재확인을 막으려 하되 | II:56 | 미분류(실제 확인을 하지 말라는 차단 — 밖 행동 요구 아님) | — | 없음 |
| institutional-impersonation | 공통(전 변형) | 수법 "불이익 암시" | '협조하지 않으시면 불이익이 있을 수 있습니다' 식으로 막연히 위협하되 | II:59 | O5-mention | 낮음 | 해당 없음 |
| institutional-impersonation | 공통(5cn4 · hktx · c5fj · pgqt) | 수법 "안전계좌 이체 요구" | 국가 안전계좌로 이관하셔야 합니다 … 계좌는 네가 불러 주지 말고 문자로 보낸 것을 확인하게 한다. | II:63 | O4-in-service | 참고 | 있음 — `safe-account-transfer`(MS:450, 문자 institution-safe-account) |
| institutional-impersonation | 공통(전 변형) | 수법 "신원정보 직접 요구" | '주민번호 뒤 7자리 불러주세요' … '계좌 비밀번호도 불러주셔야 조회가 됩니다' | II:69 | 미분류(통화 안 말로 정보 제공 — 표에 행 없음) | — | 통화 안(발화) |
| institutional-impersonation | 공통(전 변형) | 수법 "부인 시 명의 도용 암시" | '그래서 더 위험합니다, 명의가 도용돼 개설된 것으로 보입니다'라며 본인 확인 절차 쪽으로 넘긴 뒤 | II:73 | O5-mention | 낮음 | 해당 없음 |
| institutional-impersonation | 공통(hktx · c5fj · pgqt · q7cn · g2ld) | 수법 "비밀 유지 요구" | '수사 기밀이라 가족·은행 직원 누구에게도 말씀하시면 안 됩니다', '은행에서 물어보면 그냥 개인 자금 이체라고 하세요' | II:74 | O1-physical | 중간 | 없음 |
| institutional-impersonation | 공통(hktx · c5fj · pgqt · q7cn · g2ld) | 수법 "전화 끊음 저지" | '지금 끊으시면 조사에 비협조적인 것으로 기록될 수 있습니다' 식으로 … 끊지 못하게 한다. | II:75 | 미분류(통화 유지 — 앱 안) | — | 통화 안 |
| institutional-impersonation | 공통(hktx만) | 수법 "확인질문 재촉" | '성함이랑 생년월일 불러주십시오, 지금 바로 답변 주셔야 절차가 진행됩니다' | II:83 | 미분류(통화 안 정보 제공) | — | 통화 안(발화) |
| institutional-impersonation | 참가자 문구(전 난이도 오프닝) | deepvoiceLines line-3 | 협조하지 않으시면 불이익이 있을 수 있습니다. 지금 통화를 끊지 말고 계속 진행해 주십시오. | SC/institutionalImpersonation.ts:21 | 미분류(통화 유지) | — | 통화 안 |
| institutional-impersonation | fv-5cn4, 초급, 현행 | s1 | 수사관이라며 본인 명의 계좌가 범죄에 연루됐다고 알린다. | FV:655 | O5-mention | 낮음 | 해당 없음 |
| institutional-impersonation | fv-5cn4, 초급, 현행 | s2 | 본인 확인을 위해 신원 정보를 묻는다. | FV:656 | 미분류(통화 안 정보 제공) | — | 통화 안 |
| institutional-impersonation | fv-5cn4, 초급, 현행 | s3 | 계좌를 보호해야 한다며 안전계좌로 이체하라고 곧바로 요구한다. | FV:657 | O4-in-service | 참고 | 있음 — `safe-account-transfer`(MS:450) · 문자 FV:661 |
| institutional-impersonation | fv-hktx, 중급, 현행 | s1 | 수사관이라며 본인 명의가 범죄에 쓰였다고 알린다. | FV:673 | O5-mention | 낮음 | 해당 없음 |
| institutional-impersonation | fv-hktx, 중급, 현행 | s2 | 본인 확인 절차라며 신원 정보와 인증번호를 요구한다. | FV:674 | O4-in-service(인증번호는 앱 안 문자) | 참고 | 있음 — 문자 `institution-otp`(SMS:213, 선택 문자 FV:679) |
| institutional-impersonation | fv-hktx, 중급, 현행 | s3 | 명의 도용으로 자산이 위험하다며 안전계좌 이체를 요구한다. | FV:675 | O4-in-service | 참고 | 있음 — `safe-account-transfer` |
| institutional-impersonation | fv-c5fj, 고급, 현행 | s1 | 검사라며 본인 명의가 범죄에 쓰였다고 알리고 구속 가능성을 비춘다. (+미리 확보한 상대 정보 사용) | FV:349 · FV:348 · FV:700 | O5-mention | 낮음 | 해당 없음 |
| institutional-impersonation | fv-c5fj, 고급, 현행 | s2 | 협조하면 조용히 끝난다며 안심시키고, 금융감독기관이 자산 보호를 돕는다고 말한다. | FV:369 | O5-mention | 낮음 | 해당 없음 |
| institutional-impersonation | fv-c5fj, 고급, 현행 | s3 | 계좌번호보다 거래 은행과 자산 규모부터 묻는다. | FV:370 | 미분류(통화 안 정보 제공) | — | 통화 안 |
| institutional-impersonation | fv-c5fj, 고급, 현행 | s4 | 본인 확인 마지막 절차라며 문자로 간 인증번호를 불러 달라고 요구한다. | FV:366 · FV:294 | O4-in-service | 참고 | 있음 — 문자 `institution-otp`(SMS:213) |
| institutional-impersonation | fv-c5fj, 고급, 현행 | s5 | 문자로 보낸 안전계좌 안내의 링크를 열게 하고, 그 화면에서 금액을 직접 넣어 이체를 마치라고 요구한다. | FV:296 · FV:700 | O4-in-service | 참고 | 있음 — `safe-account-transfer`(MS:450) |
| institutional-impersonation | fv-c5fj, 고급, 현행 | s6(이체 뒤 추가 요구) | 이체가 끝났다고 하면 … 금융회사에서 대출을 받아 그 돈도 같은 안전계좌로 옮기라고 요구한다. | FV:357 · FV:356 | O1-money(실제 대출 신청 · 대출금 이체) | 높음 | 없음(대출 화면 0) |
| institutional-impersonation | fv-c5fj, 고급, 현행 | s6 부속 | 은행 직원이 대출 용도를 물으면 생활비라고만 답하라고 시키고 … 가족 · 은행에 알리면 안 된다 | FV:357 | O1-physical(창구 둘러대기 · 가족 차단) | 중간 | 없음 |
| institutional-impersonation | fv-c5fj, 고급, 현행 | 추가 수법 "대출금 이체 요구" | 정상 절차로 대출을 받아 보셔야 명의 도용 여부가 입증됩니다 … 은행 직원이 물으면 용도를 둘러대라고 시킨다. | FV:359 · FV:706 | O1-money | 높음 | 없음 |
| institutional-impersonation | fv-c5fj, 고급, 현행 | 추가 수법 "인증번호 요구" | 방금 문자로 간 인증번호 여섯 자리 불러 주십시오 … 번호는 네가 지어내 말하지 않는다. | FV:298 · FV:704 | O4-in-service | 참고 | 있음 — 문자 `institution-otp` |
| institutional-impersonation | fv-c5fj, 고급, 현행 | 추가 수법 "이체 화면 유도" | 문자로 보낸 안내의 링크를 눌러 … 금액만 넣고 이체 누르시면 됩니다 … 은행 앱·창구·ATM에서 따로 보내라고 하지 않는다. | FV:300 · FV:705 | O4-in-service | 참고 | 있음 — `safe-account-transfer` |
| institutional-impersonation | fv-c5fj · fv-q7cn · fv-g2ld, 고급, 현행 | 추가 수법 "안심 유도" | '협조만 하시면 약식으로 조용히 끝납니다' 처럼 위협과 번갈아 안심시켜 경계를 낮춘다. | FV:707 · FV:763 · FV:786 | O5-mention | 낮음 | 해당 없음 |
| institutional-impersonation | fv-c5fj · fv-pgqt · fv-q7cn · fv-g2ld, 고급 | 추가 수법 "거래 은행·자산 정보 수집"(AP 차용) | '거래하시는 은행이 어디세요?', '예금은 대략 어느 정도 되세요?' | AP:43 · FV:288 | 미분류(통화 안 정보 제공) | — | 통화 안 |
| institutional-impersonation | fv-pgqt, 고급, **은퇴** | s1 | 검사라며 본인 명의 계좌가 범죄에 쓰였다고 알린다. | FV:730 | O5-mention | 낮음 | 해당 없음 |
| institutional-impersonation | fv-pgqt, 고급, **은퇴** | s2 | 자산이 범죄수익인지 검수해야 한다며 거래 은행과 자산 규모를 묻는다. | FV:731 | 미분류(통화 안 정보 제공) | — | 통화 안 |
| institutional-impersonation | fv-pgqt, 고급, **은퇴** | s3 | 본인 확인 마지막 절차라며 문자로 간 인증번호를 불러 달라고 요구한다. | FV:294 · FV:732 | O4-in-service | 참고 | 있음 — 문자 `institution-otp` |
| institutional-impersonation | fv-pgqt, 고급, **은퇴** | s4 | 문자로 보낸 안전계좌 안내의 링크를 열게 하고, 그 화면에서 금액을 직접 넣어 이체를 마치라고 요구한다. | FV:296 · FV:733 | O4-in-service | 참고 | 있음 — `safe-account-transfer` |
| institutional-impersonation | fv-pgqt, 고급, **은퇴** | s5(이체 뒤 추가 요구) | '…부정 대출 정황…정상 대출임을 입증해야 한다'며 금융회사에서 대출을 받아 그 돈도 같은 안전계좌로 옮기라고 요구 | FV:311 · FV:734 | O1-money | 높음 | 없음 |
| institutional-impersonation | fv-pgqt, 고급, **은퇴** | s5 부속 | 은행 직원이 대출 용도를 물으면 생활비라고만 답하라고 시키고, 수사 기밀이라 가족 · 은행에 알리면 안 된다 | FV:311 | O1-physical | 중간 | 없음 |
| institutional-impersonation | fv-pgqt, 고급, **은퇴** | 추가 수법 "대출금 이체 요구" | 정상 대출인지 확인하려면 대출을 받아 그 돈도 안전계좌로 옮기셔야 합니다 … 용도를 둘러대라고 시킨다. | FV:313 · FV:737 | O1-money | 높음 | 없음 |
| institutional-impersonation | fv-q7cn, 고급, 현행 | s1 | (fv-c5fj s1과 같음) 검사라며 … 구속 가능성을 비춘다. | FV:349 · FV:380 | O5-mention | 낮음 | 해당 없음 |
| institutional-impersonation | fv-q7cn · fv-g2ld, 고급, 현행 | s2 | 협조하면 조용히 끝난다며 안심 … 돈을 다른 계좌로 옮기라는 말을 어느 단계에서도 하지 않는다. | FV:369 · FV:378 · FV:381 | O5-mention | 낮음 | 해당 없음 |
| institutional-impersonation | fv-q7cn · fv-g2ld, 고급, 현행 | s3 | 계좌번호보다 거래 은행과 자산 규모부터 묻는다. | FV:370 · FV:382 | 미분류(통화 안 정보 제공) | — | 통화 안 |
| institutional-impersonation | fv-q7cn · fv-g2ld, 고급, 현행 | s4 | 문자로 간 인증번호를 불러 달라고 요구한다. | FV:366 · FV:383 | O4-in-service | 참고 | 있음 — 문자 `institution-otp`(FV:343) |
| institutional-impersonation | fv-q7cn, 고급, 현행 | s5(결말) | 예금을 현금이나 수표로 찾아 금융감독원 담당 직원에게 맡기겠다는 약속을 받아 내려 한다. | FV:386 · FV:757 | O1-money(현금·수표 인출 · 전달) | 높음 | 없음(인출 · 전달 화면 0) |
| institutional-impersonation | fv-q7cn, 고급, 현행 | s5 부속 | 은행 직원이 이유를 물으면 개인 용도라고만 하라고 시킨다. | FV:386 | O1-physical | 중간 | 없음 |
| institutional-impersonation | fv-q7cn, 고급, 현행 | 추가 수법 "예탁 명목 인출 요구" | 예금을 현금이나 수표로 찾아 담당 직원에게 맡겨 주십시오 … 만날 곳 · 시간은 정하지 않는다. | FV:390 · FV:762 | O1-money | 높음 | 없음 |
| institutional-impersonation | fv-g2ld, 고급, 현행 | s5(결말) | 예금 · 적금을 찾아 금을 사서 담당 직원에게 제출하겠다는 약속을 받아 내려 한다. | FV:388 · FV:780 | O1-money(적금 해지 · 금 구매 · 실물 전달) | 높음 | 없음 |
| institutional-impersonation | fv-g2ld, 고급, 현행 | s5 부속 | 판매점 직원이 용도를 물으면 개인 투자라고만 하라고 시킨다. | FV:388 | O1-physical(판매점 둘러대기) | 중간 | 없음 |
| institutional-impersonation | fv-g2ld, 고급, 현행 | 추가 수법 "실물 조사 명목 금 구매 인출 요구" | 예금을 해지하셔서 금으로 바꿔 담당 직원에게 맡겨 주셔야 합니다 | FV:392 · FV:785 | O1-money | 높음 | 없음 |
| institutional-impersonation | 문자 | institution-otp 본문 | [본인확인] 인증번호 [048231] 타인에게 절대 알려주지 마세요. | SMS:216 | O4-in-service | 참고 | 앱 안 문자 |
| institutional-impersonation | 문자 | institution-safe-account 본문 | [자산보호절차] 임시 안전계좌 안내 … 아래에서 안전계좌 이체를 진행해 주세요. 이체 후 담당자에게 바로 알려 주세요. | SMS:229 | O4-in-service | 참고 | 있음 — `safe-account-transfer`(SMS:233 · MS:450) |
| institutional-impersonation | 고급 확인 창구 | VI 오퍼 | (확인하겠다는 참가자를 앱 안 확인 창구로 받는 컨트롤) | VI:106 | O4-in-service | 참고 | 있음 — `institution-verify-desk`(고급만) |
| card-company-impersonation | 공통(35f2 전부 · 그 외 keepLabels) | 수법 "놀람 유발" | '방금 해외에서 고액 결제 시도가 확인됐습니다'처럼 … 놀라움만 조성한다. | CC:45 | O5-mention | 낮음 | 해당 없음 |
| card-company-impersonation | 공통(aqp6 · 35f2 · akj5 · x7ue) | 수법 "긴급성 조성" | '지금 확인 안 하시면 그대로 승인돼요' 식으로 생각할 시간을 주지 않는다. | CC:46 | O5-mention | 낮음 | 해당 없음 |
| card-company-impersonation | 공통(35f2만) | 수법 "확인 절차 차단" | '고객센터로 직접 거시면 다시 처음부터 접수하셔야 해요' 처럼 제3자·공식 창구 재확인을 막으려 하되 | CC:47 | 미분류(확인 차단) | — | 없음 |
| card-company-impersonation | 공통(35f2만) | 수법 "카드정보 직접 요구" | '카드번호 앞 8자리랑 유효기간 불러주세요', '본인확인 문자 지금 갈 거예요, 오시면 그 번호 바로 불러주세요' | CC:52 | 미분류(통화 안 정보 제공 · 인증번호는 문자 card-otp) | — | 통화 안 + 문자 `card-otp` |
| card-company-impersonation | 공통(35f2만) | 수법 "피해금 이관 요구" | 고객님 잔액을 이관 전용 계좌로 옮겨두셔야 해요 … 계좌는 … 문자로 보낸 것을 확인하게 한다. | CC:60 | O4-in-service | 참고 | 있음 — `card-relief-transfer`(MS:478) |
| card-company-impersonation | 공통(35f2만) | 수법 "부인 시 명의 도용 암시" | '그래서 더 위험한 겁니다, 본인도 모르게 발급된 것으로 보여요' | CC:66 | O5-mention | 낮음 | 해당 없음 |
| card-company-impersonation | 공통(35f2만 — 다른 변형은 FV 참조) | 수법 "안심 유도" | '별거 아닐 수도 있어요, 확인만 하면 끝나요' | CC:67 | O5-mention | 낮음 | 해당 없음 |
| card-company-impersonation | 공통(35f2만) | 수법 "전화 끊음 저지" | '지금 끊으시면 임시 정지 처리가 안 돼서 결제가 그대로 진행될 수 있어요' | CC:68 | 미분류(통화 유지) | — | 통화 안 |
| card-company-impersonation | 공통(35f2만) | 수법 "확인질문 재촉" | '성함부터 불러주세요, 바로 답변 주셔야 처리가 돼요' | CC:74 | 미분류(통화 안 정보 제공) | — | 통화 안 |
| card-company-impersonation | 참가자 문구(오프닝) | deepvoiceLines line-3 | 지금 안내해 드리는 대로만 확인해 주세요. | SC/cardCompanyImpersonation.ts:14 | O5-mention | 낮음 | 해당 없음 |
| card-company-impersonation | fv-aqp6, 초급, 현행 | s1 | 해외 가맹점 고액 결제 시도가 있었다고 놀라게 한다. | FV:805 | O5-mention | 낮음 | 해당 없음 |
| card-company-impersonation | fv-aqp6, 초급, 현행 | s2 | 결제를 막아 주겠다며 카드 정보를 곧바로 요구한다. | FV:805 | 미분류(통화 안 카드정보 발화 — "앱 밖 카드 정보 입력" 아님) | — | 통화 안 |
| card-company-impersonation | fv-aqp6 · fv-akj5 · fv-x7ue | 추가 수법 "카드정보 직접 요구"(무문자) | '결제 취소 처리하려면 카드번호 앞 8자리랑 유효기간 불러주세요' | FV:557 · FV:809 · FV:575 | 미분류(통화 안 정보 제공) | — | 통화 안 |
| card-company-impersonation | fv-aqp6 · fv-akj5 · fv-x7ue | 추가 수법 "부인 시 명의 도용 암시"(무문자) | '그래서 더 위험한 겁니다, 본인도 모르게 발급된 것으로 보여요'라며 … 카드정보 요구로 이어간다. | FV:559 | O5-mention | 낮음 | 해당 없음 |
| card-company-impersonation | fv-35f2, 중급, 현행 | s1 | 부정결제 시도를 알린다. | FV:823 | O5-mention | 낮음 | 해당 없음 |
| card-company-impersonation | fv-35f2, 중급, 현행 | s2 | 본인 확인이라며 인증번호를 요구한다. | FV:824 | O4-in-service | 참고 | 있음 — 문자 `card-otp`(SMS:243, 선택 FV:829) |
| card-company-impersonation | fv-35f2, 중급, 현행 | s3 | 피해금을 안전한 계좌로 옮겨야 한다며 이체를 요구한다. | FV:825 | O4-in-service | 참고 | 있음 — `card-relief-transfer`(MS:478, 문자 FV:830) |
| card-company-impersonation | fv-akj5, 고급, 현행(챌린지 수신자 풀 전용) | s1 | 카드사 상담원이라며 명의 도용 피해가 의심된다고 알린다. | FV:597 | O5-mention | 낮음 | 해당 없음 |
| card-company-impersonation | fv-akj5, 고급, 현행(챌린지) | s2 | 피해가 번지지 않게 휴대폰 보안 점검 앱을 설치하라고 요구한다. | FV:598 | **O1-device**(문자 선언 0 → 설치 화면 도달 불가) | 높음 | 없음(`sms: []` FV:608) |
| card-company-impersonation | fv-akj5, 고급, 현행(챌린지) | 추가 수법 "보안 점검 앱 설치 요구"(CD 차용) | ○○안심보안 점검 앱을 설치해 주세요' 처럼 … 설치 방법·경로·권한 설정은 설명하지 않는다. | CD:51 · FV:579 | O1-device | 높음 | 없음 |
| card-company-impersonation | fv-akj5 · fv-x7ue, 고급 | s3 | 금융당국 조사가 시작됐다며 불안을 키운다. | FV:599 | O5-mention | 낮음 | 해당 없음 |
| card-company-impersonation | fv-akj5 · fv-x7ue, 고급 | 추가 수법 "기관 조사 언급"(CD 차용) | '명의 도용 건이라 이미 금융당국 조사로 넘어갔습니다' | CD:53 · FV:580 | O5-mention | 낮음 | 해당 없음 |
| card-company-impersonation | fv-akj5 · fv-x7ue, 고급 | s4 | 확인하겠다는 상대를 막지 않고, 확인 뒤에도 같은 요구를 이어 간다. | FV:600 | O4-in-service(고급 확인 창구) — 추정: 챌린지 세션에서도 VI 활성인지 미확인 | 참고 | 있음 — `card-verify-desk`(VI:116) |
| card-company-impersonation | fv-akj5, 고급, 현행(챌린지) | s5 | 카드 정보와 피해금 이관을 요구한다. | FV:601 | O1-money(이관 화면 없음) | 높음 | 없음 |
| card-company-impersonation | fv-akj5, 고급, 현행(챌린지) | 추가 수법 "피해금 이관 요구"(낭독형) | 계좌는 'OO은행 948-2716-5093-27' 처럼 이 예시 번호로만 부르고 … 이체를 요구한다. | FV:561 · FV:606 | **O1-money**(계좌를 말로 불러 주고 실제 뱅킹 이체 유도) | 높음 | 없음 |
| card-company-impersonation | fv-x7ue, 고급, 현행(자가) | s2 | 피해가 번지지 않게 휴대폰 보안 점검 앱을 설치하라고 요구한다. | FV:598 · FV:844 | O4-in-service | 참고 | 있음 — `card-guard-app-install`(MS:500) |
| card-company-impersonation | fv-x7ue, 고급, 현행(자가) | 추가 수법 "보안 점검 앱 설치 요구" | ○○안심보안 점검 앱을 설치해 주세요 | CD:51 · FV:579 | O4-in-service | 참고 | 있음 — `card-guard-app-install` |
| card-company-impersonation | fv-x7ue, 고급, 현행(자가) | s5 | 카드 정보와 피해금 이관을 요구한다. | FV:601 | O1-money(이체 동의 요구 · 화면 없음) | 높음 | 없음(설치 화면엔 이체 입력 0 — FV:565) |
| card-company-impersonation | fv-x7ue, 고급, 현행(자가) | 추가 수법 "피해금 이관 요구"(무계좌) | 이관 전용 계좌로 옮겨두셔야 해요' 처럼 구체적 금액과 함께 이체에 동의하라고 요구한다. 계좌번호는 네가 불러 주지 않고 | FV:568 · FV:846 | O1-money(계좌 미제시라 실행 경로는 없음) | 높음 | 없음 |
| card-company-impersonation | fv-akj5 · fv-x7ue, 고급 | 추가 수법 "안심 유도" | '별거 아닐 수도 있어요, 확인만 하면 끝나요' | CC:67 · FV:578 | O5-mention | 낮음 | 해당 없음 |
| card-company-impersonation | fv-w3dq, 고급, 현행(자가) | s1 | 카드 배송 일정을 안내하며 말을 건다. | FV:417 · FV:864 | O5-mention | 낮음 | 해당 없음 |
| card-company-impersonation | fv-w3dq, 고급, 현행 | s2 | 카드를 신청하지 않았다면 명의 도용 사고라며 사고 접수로 넘긴다. | FV:418 | O5-mention | 낮음 | 해당 없음 |
| card-company-impersonation | fv-w3dq, 고급, 현행 | s3 | 본인 확인 뒤 휴대폰 보안 점검 앱을 설치하라고 요구한다. | FV:419 | O4-in-service | 참고 | 있음 — `card-guard-app-install`(MS:500, 문자 FV:877) |
| card-company-impersonation | fv-w3dq, 고급, 현행 | s4 | 금융당국 조사가 시작됐다며 불안을 키우고, 확인하겠다는 상대를 막지 않는다. | FV:420 | O4-in-service(고급 확인 창구) | 참고 | 있음 — `card-verify-desk`(VI:116) |
| card-company-impersonation | fv-w3dq, 고급, 현행 | s5 | 조사가 끝날 때까지 자산을 보호 계좌로 옮기라고 요구한다. | FV:421 | **O1-money**(계좌 문자 · 이체 화면 미선언) | 높음 | 없음(`card-relief-transfer`는 card-relief-account 문자로만 열림 — w3dq 미선언) |
| card-company-impersonation | fv-w3dq, 고급, 현행 | 추가 수법 "자산 보호 이체 요구"(CD 차용) | 잔액을 보호 계좌로 옮겨 두셔야 피해가 안 생깁니다' … 계좌번호를 네가 지어내 불러 주지 않고 | CD:54 · FV:873 | O1-money | 높음 | 없음 |
| card-company-impersonation | fv-w3dq, 고급, 현행 | 추가 수법 "본인확인 정보 직접 요구" | '사고 접수는 본인 확인부터라서요, 성함부터 불러주세요' | FV:426 · FV:869 | 미분류(통화 안 정보 제공) | — | 통화 안 |
| card-company-impersonation | fv-w3dq, 고급, 현행 | 추가 수법 "확인 시도 무력화"(CD 차용) | '그렇게 하시는 게 맞습니다, 확인해 보시고 이어서 진행하시죠' 라며 오히려 권한다. | CD:52 · FV:871 | O4-in-service(고급 확인 창구) | 참고 | 있음 — `card-verify-desk` |
| card-company-impersonation | fv-w3dq, 고급, 현행 | 추가 수법 안심 · 부인 · 기관 조사 · 긴급(CD 차용) | (CD:48 · 49 · 53 · 55 문면) | CD:48 · CD:49 · CD:53 · CD:55 · FV:867-874 | O5-mention | 낮음 | 해당 없음 |
| card-company-impersonation | 문자 | card-otp 본문 | [승인취소] 인증번호 [739104] 본인 외 타인에게 알려주지 마세요. 상담원도 요구하지 않습니다. | SMS:246 | O4-in-service | 참고 | 앱 안 문자 |
| card-company-impersonation | 문자 | card-relief-account 본문 | [승인취소 지원] 피해금 이관 전용 계좌 안내 … 아래에서 피해금 이관을 진행해 주세요. | SMS:260 | O4-in-service | 참고 | 있음 — `card-relief-transfer`(SMS:263) |
| card-company-impersonation | 문자 | card-guard-app-link 본문 | [명의도용 피해예방] … 아래에서 피해 차단용 보안 앱을 설치해 주세요. | SMS:274 | O4-in-service | 참고 | 있음 — `card-guard-app-install`(SMS:276) |
| card-delivery-call | 공통(tvnj · e5mv · u9fz) | 페르소나 [캐릭터] | 사고 처리를 돕는 척하며 보안 점검과 자산 보호를 요구하는 상황을 연기한다. | CD:31 | O5-mention(세부는 아래 단계) | 낮음 | — |
| card-delivery-call | 공통 | 수법 "안심 유도" | '고객님 앞으로 카드가 발급돼서 배송 일정 잡으려고 연락드렸습니다' | CD:48 | O5-mention | 낮음 | 해당 없음 |
| card-delivery-call | 공통 | 수법 "부인 시 명의 도용 암시" | '그럼 명의가 도용된 것 같습니다, 사고 접수부터 하셔야 합니다' | CD:49 | O5-mention | 낮음 | 해당 없음 |
| card-delivery-call | 공통 | 수법 "본인확인 정보 직접 요구" | '사고 접수는 본인 확인부터라서요, 성함이랑 생년월일부터 불러주세요' | CD:50 | 미분류(통화 안 정보 제공) | — | 통화 안 |
| card-delivery-call | 공통 | 수법 "보안 점검 앱 설치 요구" | ○○안심보안 점검 앱을 설치해 주세요' 처럼 … 설치를 요구한다. | CD:51 | O4-in-service | 참고 | 있음 — `card-delivery-app-install`(MS:522) |
| card-delivery-call | 공통 | 수법 "확인 시도 무력화" | 상대가 '카드사에 직접 확인해 보겠다'고 하면 막지 않고 … 오히려 권한다. | CD:52 | O4-in-service(고급 전용 시나리오 · 확인 창구) | 참고 | 있음 — `card-delivery-verify-desk`(VI:178) |
| card-delivery-call | 공통 | 수법 "기관 조사 언급" | '명의 도용 건이라 이미 금융당국 조사로 넘어갔습니다' | CD:53 | O5-mention | 낮음 | 해당 없음 |
| card-delivery-call | 공통(tvnj · u9fz — e5mv는 keepLabels에서 제외) | 수법 "자산 보호 이체 요구" | '조사가 끝날 때까지 잔액을 보호 계좌로 옮겨 두셔야 피해가 안 생깁니다' … 금액과 이체를 구체적으로 요구 | CD:54 | **O1-money** | 높음 | 없음(이 시나리오 카탈로그에 계좌 문자 · 이체 화면 0 — SMS:122-136) |
| card-delivery-call | 공통 | 수법 "긴급성 조성" | '지금도 결제 시도가 들어올 수 있어서 오늘 안에 처리하셔야 합니다' | CD:55 | O5-mention | 낮음 | 해당 없음 |
| card-delivery-call | 참가자 문구(목록 제외 · mergedInto) | deepvoiceLines line-1 | 카드 배송 안내 드리려고 연락드렸습니다. 오늘 받으실 수 있으세요? | SC/cardDeliveryCall.ts:15 | O5-mention | 낮음 | 해당 없음 |
| card-delivery-call | fv-tvnj, 고급, 현행(신규 세션 없음 — 시나리오 목록 제외) | s1 · s2 | 카드 배송 일정을 안내하며 말을 건다. / 명의 도용 사고라며 사고 접수로 넘긴다. | FV:417 · FV:418 · FV:1603 | O5-mention | 낮음 | 해당 없음 |
| card-delivery-call | fv-tvnj, 고급 | s3 | 본인 확인 뒤 휴대폰 보안 점검 앱을 설치하라고 요구한다. | FV:419 | O4-in-service | 참고 | 있음 — `card-delivery-app-install`(문자 FV:1607) |
| card-delivery-call | fv-tvnj, 고급 | s4 | 금융당국 조사가 시작됐다며 불안을 키우고, 확인하겠다는 상대를 막지 않는다. | FV:420 | O4-in-service | 참고 | 있음 — `card-delivery-verify-desk` |
| card-delivery-call | fv-tvnj, 고급 | s5 | 조사가 끝날 때까지 자산을 보호 계좌로 옮기라고 요구한다. | FV:421 | **O1-money** | 높음 | 없음 |
| card-delivery-call | fv-e5mv, 고급, 현행 | s1 · s2 | (tvnj s1 · s2와 같음) | FV:432-433 · FV:1625 | O5-mention | 낮음 | 해당 없음 |
| card-delivery-call | fv-e5mv, 고급, 현행 | s3 | 본인 확인 뒤 휴대폰 보안 점검 앱을 설치하라고 요구한다. (+문자 도구 먼저) | FV:419 · FV:1625 | O4-in-service | 참고 | 있음 — `card-delivery-app-install`(문자 FV:1629) |
| card-delivery-call | fv-e5mv, 고급, 현행 | s4 | 금융당국 조사가 시작됐다며 … 검사가 구속 수사를 검토 중이라는 말을 전해 들은 것처럼 전한다. | FV:434 | O5-mention(확인 막지 않음 → VI) | 낮음 | (확인은 `card-delivery-verify-desk`) |
| card-delivery-call | fv-e5mv, 고급, 현행 | s5(결말) | 금융회사에서 대출을 받아 그 대출금을 현금으로 찾아 담당 직원에게 맡기겠다는 약속을 받아 내려 한다. | FV:435 · FV:1625 | **O1-money**(대출 실행 + 현금 인출 · 전달) | 높음 | 없음 |
| card-delivery-call | fv-e5mv, 고급, 현행 | s5 부속 | 은행 직원이 용도를 물으면 생활비라고만 하라고 시킨다. | FV:435 | O1-physical | 중간 | 없음 |
| card-delivery-call | fv-e5mv, 고급, 현행 | 추가 수법 "대출금 현금 인출 요구" | 받으신 대출금은 확인이 끝날 때까지 현금으로 찾아 담당 직원에게 맡겨 주세요 | FV:438 · FV:1627 | O1-money | 높음 | 없음 |
| card-delivery-call | fv-u9fz, 고급, 현행 | s1 | 최근 개인정보 유출 사고로 배송 정보 확인이 늦어졌다며 … 신청하지 않은 카드가 발급됐을 수 있다고 알린다. | FV:440 | O5-mention | 낮음 | 해당 없음 |
| card-delivery-call | fv-u9fz, 고급, 현행 | s2 | 카드를 신청하지 않았다면 명의 도용 사고라며 사고 접수로 넘긴다. | FV:441 | O5-mention | 낮음 | 해당 없음 |
| card-delivery-call | fv-u9fz, 고급, 현행 | s3 | 유출된 정보로 휴대폰까지 위험하다며 보안 환경 점검 앱을 설치하라고 요구한다. | FV:442 | O4-in-service | 참고 | 있음 — `card-delivery-app-install`(문자 FV:1647) |
| card-delivery-call | fv-u9fz, 고급, 현행 | s4 | 금융당국 조사가 시작됐다며 불안을 키우고, 확인하겠다는 상대를 막지 않는다. | FV:443 | O4-in-service | 참고 | 있음 — `card-delivery-verify-desk` |
| card-delivery-call | fv-u9fz, 고급, 현행 | s5(결말) | 조사가 끝날 때까지 자산을 보호 계좌로 옮기라고 요구한다. | FV:444 | **O1-money** | 높음 | 없음 |
| card-delivery-call | fv-u9fz, 고급, 현행 | 추가 수법 "유출 사고 빌미 명의 도용 암시" | '최근 개인정보 유출 사고 때문에 배송 확인이 늦어졌는데 …' | FV:447 · FV:1645 | O5-mention | 낮음 | 해당 없음 |
| card-delivery-call | 문자 | card-delivery-app-link 본문 | [명의도용 사고접수] 휴대폰 보안 점검이 필요합니다. 아래에서 보안 점검 앱을 설치해 주세요. | SMS:127 | O4-in-service | 참고 | 있음 — `card-delivery-app-install`(SMS:129) |
| asset-protection-notice-call | 공통(bmiq · k9ra 원 페르소나) | 페르소나 [캐릭터] | 수사가 끝날 때까지 자산을 보호해 주겠다는 명목으로 돈을 찾아 담당 직원에게 맡기라고 요구하는 상황을 연기한다. | AP:23 | O1-money(bmiq) / O4 경계(k9ra) | 높음 | k9ra만 `asset-custody-apply`(약속 입력) |
| asset-protection-notice-call | 공통 | 수법 "권위 암시" | '금융감독원 직원입니다'라는 직함만으로 신뢰를 유도한다. | AP:39 | O5-mention | 낮음 | 해당 없음 |
| asset-protection-notice-call | 공통 | 수법 "수사 연루 통보" | '고객님 명의 계좌가 범죄에 쓰인 정황이 확인돼 보호 조치 대상이 되셨습니다' | AP:40 | O5-mention | 낮음 | 해당 없음 |
| asset-protection-notice-call | 공통 | 수법 "부인 시 명의 도용 암시" | '그래서 더 위험합니다, 명의가 도용된 것으로 보입니다' | AP:41 | O5-mention | 낮음 | 해당 없음 |
| asset-protection-notice-call | 공통 | 수법 "본인확인 정보 직접 요구" | '보호 조치는 본인 확인부터라서요, 성함이랑 생년월일 불러주세요' | AP:42 | 미분류(통화 안 정보 제공) | — | 통화 안 |
| asset-protection-notice-call | 공통 | 수법 "거래 은행·자산 정보 수집" | '거래하시는 은행이 어디세요?', '예금은 대략 어느 정도 되세요?' | AP:43 | 미분류(통화 안 정보 제공) | — | 통화 안 |
| asset-protection-notice-call | 공통 | 수법 "비밀 유지 요구" | 가족에게도 말씀하시면 안 됩니다' … 은행에서 돈을 찾는 이유를 물으면 그럴듯한 개인 용도로 둘러대라고 일러 준다. | AP:44 | O1-physical(가족 차단 · 창구 둘러대기) | 중간 | 없음 |
| asset-protection-notice-call | bmiq · p3jx(k9ra · t8ga는 drop) | 수법 "절차·서류 정당화" | '보관 조치 접수번호를 남겨 드리고, 끝나면 보관 증명서도 발급됩니다' | AP:45 | O5-mention | 낮음 | 해당 없음 |
| asset-protection-notice-call | bmiq(은퇴) | 수법 "인출·전달 요구" | '수표로 찾아 두시면 담당 직원이 받으러 갑니다' 처럼 돈을 찾아 맡기겠다는 약속을 받아 내려 한다. | AP:46 | **O1-money** | 높음 | 없음(bmiq `sms: []` FV:1664) |
| asset-protection-notice-call | k9ra(현행) | 수법 "인출·전달 요구" | (위와 같은 문면) | AP:46 · FV:1683 | O4-in-service(경계 — 신청서는 화면, 인출 · 전달 자체는 말로 요구) | 참고 | 있음 — `asset-custody-apply`(MS:545 — 금액 · 은행 · 현금/수표) |
| asset-protection-notice-call | 공통 | 수법 "긴급성 조성" | '오늘 안에 보관 조치가 안 되면 계좌가 동결될 수 있습니다' | AP:47 | O5-mention | 낮음 | 해당 없음 |
| asset-protection-notice-call | k9ra · t8ga | 변형 수법 "절차·서류 정당화"(신청서) | '문자로 보내 드린 보관 신청서만 작성해 주시면 접수되고 …' 문자 속 링크에서 신청서를 내게 한다. | AP:56 · FV:1684 · FV:1728 | O4-in-service | 참고 | 있음 — `asset-custody-apply` |
| asset-protection-notice-call | 참가자 문구 | deepvoiceLines line-1 | 금융감독원입니다. 고객님 명의 계좌 관련해서 안내드릴 사항이 있어 연락드렸습니다. | SC/assetProtectionNoticeCall.ts:15 | O5-mention | 낮음 | 해당 없음 |
| asset-protection-notice-call | fv-bmiq, 고급, **은퇴** | s1 | 본인 명의 계좌가 범죄에 쓰인 정황이 있다고 알린다. | FV:451 · FV:1662 | O5-mention | 낮음 | 해당 없음 |
| asset-protection-notice-call | fv-bmiq, 고급, **은퇴** | s2 | 본인 확인 뒤 계좌번호보다 거래 은행과 자산 규모부터 묻는다. | FV:452 | 미분류(통화 안 정보 제공) | — | 통화 안 |
| asset-protection-notice-call | fv-bmiq, 고급, **은퇴** | s3 | 비공개 진행을 강조하고, 은행에서 이유를 물으면 그럴듯한 개인 용도로 둘러대라고 일러 준다. | FV:453 | O1-physical | 중간 | 없음 |
| asset-protection-notice-call | fv-bmiq, 고급, **은퇴** | s4 | 보관 조치 절차를 설명하며 돈을 찾아 담당 직원에게 맡기겠다는 약속을 받아 내려 한다. | FV:456 | **O1-money** | 높음 | 없음 |
| asset-protection-notice-call | fv-k9ra, 고급, 현행 | s1 · s2 | (bmiq s1 · s2와 같음) | FV:451 · FV:452 · FV:1680 | O5 / 미분류 | 낮음 / — | 해당 없음 |
| asset-protection-notice-call | fv-k9ra, 고급, 현행 | s3 | 은행에서 이유를 물으면 그럴듯한 개인 용도로 둘러대라고 일러 준다. | FV:453 · FV:1680 | O1-physical | 중간 | 없음 |
| asset-protection-notice-call | fv-k9ra, 고급, 현행 | s4 | 문자로 보낸 링크에서 보관 신청서를 작성하게 하고, 돈을 찾아 담당 직원에게 맡기겠다는 약속을 받아 내려 한다. | FV:1681 | O4-in-service(경계 — 인출 · 전달 행위 자체는 화면 밖) | 참고 | 있음 — `asset-custody-apply`(문자 FV:1686) |
| asset-protection-notice-call | fv-p3jx, 고급, 현행 | 페르소나(결말) | 약식으로 처리해 주겠다는 명목으로 공탁금을 지정 계좌에 넣으라고 요구하는 상황을 연기한다. | FV:535 · FV:1709 | O1-money | 높음 | 없음 |
| asset-protection-notice-call | fv-p3jx, 고급, 현행 | s1 | 본인 명의 계좌가 범죄에 쓰인 정황이 있다고 알린다. (+미리 확보한 상대 정보) | FV:1701 | O5-mention | 낮음 | 해당 없음 |
| asset-protection-notice-call | fv-p3jx · fv-t8ga, 고급, 현행 | s2 | 본인 확인 뒤 계좌번호보다 거래 은행과 자산 규모부터 묻는다. | FV:452 · FV:1702 · FV:1723 | 미분류(통화 안 정보 제공) | — | 통화 안 |
| asset-protection-notice-call | fv-p3jx · fv-t8ga, 고급, 현행 | s3 | 비공개 진행을 강조하고, 은행에서 이유를 물으면 그럴듯한 개인 용도로 둘러대라고 일러 준다. | FV:453 · FV:1702 · FV:1723 | O1-physical | 중간 | 없음 |
| asset-protection-notice-call | fv-p3jx, 고급, 현행 | s4(결말) | 공탁금을 먼저 넣어 둬야 하고 수사가 끝나면 전액 돌려준다고 … 문자로 보낸 계좌에 공탁금을 넣으라고 요구한다. | FV:1703 | **O1-money**(계좌 문자에 링크 · 화면 없음 → 실제 뱅킹 이체로만 가능) | 높음 | 없음(`asset-deposit-account`는 fakeLandingId 0 — SMS:155-163) |
| asset-protection-notice-call | fv-p3jx, 고급, 현행 | 추가 수법 "공탁금 이체 요구" | 약식으로 처리하려면 공탁금을 먼저 넣어 두셔야 합니다 … 문자로 보낸 것을 확인하게 한다. | FV:541 · FV:1706 | O1-money | 높음 | 없음 |
| asset-protection-notice-call | fv-t8ga, 고급, 현행 | 페르소나(결말) | 자산 실물 전수 조사 명목으로 예금을 금으로 바꿔 담당 직원에게 제출하라고 요구하는 상황을 연기한다. | FV:538 · FV:1731 | O1-money | 높음 | 없음 |
| asset-protection-notice-call | fv-t8ga, 고급, 현행 | s1 | 본인 명의 계좌가 범죄에 쓰인 정황이 있다고 알린다. (+미리 확보한 상대 정보) | FV:1722 | O5-mention | 낮음 | 해당 없음 |
| asset-protection-notice-call | fv-t8ga, 고급, 현행 | s4 | 보관 조치 절차라며 문자로 보낸 링크에서 보관 신청서를 먼저 작성하게 한다. | FV:1724 | O4-in-service | 참고 | 있음 — `asset-custody-apply`(문자 FV:1730) |
| asset-protection-notice-call | fv-t8ga, 고급, 현행 | s5(결말) | 신청서 단계가 끝나면 … 예금 · 적금을 찾아 금을 사서 담당 직원에게 제출하겠다는 약속을 받아 내려 한다. | FV:1725 · FV:388 | **O1-money**(금 구매 · 실물 제출) | 높음 | 없음(신청서 화면엔 금 구매 0) |
| asset-protection-notice-call | fv-t8ga, 고급, 현행 | s5 부속 | 판매점 직원이 용도를 물으면 개인 투자라고만 하라고 시킨다. | FV:388 · FV:1725 | O1-physical | 중간 | 없음 |
| asset-protection-notice-call | fv-t8ga, 고급, 현행 | 추가 수법 "실물 조사 명목 금 구매 인출 요구" | 예금을 해지하셔서 금으로 바꿔 담당 직원에게 맡겨 주셔야 합니다 | FV:392 · FV:1728 | O1-money | 높음 | 없음 |
| asset-protection-notice-call | 문자 | asset-custody-link 본문 | [자산보호] 보관 조치 접수 안내 … 아래에서 보관 신청서를 작성해 주세요. | SMS:145 | O4-in-service | 참고 | 있음 — `asset-custody-apply`(SMS:147) |
| asset-protection-notice-call | 문자 | asset-deposit-account 본문 | [자산보호] 약식 처리 공탁금 안내 예금주: 자산보호공탁관리 OO은행 519-3306-7420-85 수사 종료 후 전액 반환됩니다. | SMS:159 | **O1-money**(계좌만 · 링크/화면 0) | 높음 | 없음 |
| prosecution-cooperation-call | 기본 페르소나(nss6 · 변형 없는 세션) | 페르소나 [캐릭터] | 주변과 떨어져 혼자 통화를 이어가게 한 뒤 자산 검수 명목으로 코인 구매·송금을 요구하는 상황을 연기한다. | PC:32 | O1-money | 높음 | 없음(nss6 `sms: []`) |
| prosecution-cooperation-call | 기본 페르소나 · 경로 페르소나 공통 | 페르소나 [진행 방식] | 혼자 있으라는 요구는 그 말 자체만 한다. 장소의 종류·이동 방법·머무를 곳 … 지시는 하지 않는다. | PC:43 | O1-physical(형식만이지만 "혼자 있으라" 자체는 요구) | 중간 | 없음 |
| prosecution-cooperation-call | 공통(nss6 · p4hz · c8wq — h3vn · v2mk · a6lq는 drop) | 수법 "권위 암시" | '검찰 수사관입니다'라는 직함만으로 신뢰를 유도한다. | PC:52 | O5-mention | 낮음 | 해당 없음 |
| prosecution-cooperation-call | 공통 | 수법 "구속 수사 위협" | '협조하지 않으시면 구속 수사로 바뀔 수 있습니다' | PC:53 | O5-mention | 낮음 | 해당 없음 |
| prosecution-cooperation-call | nss6(은퇴)만 | 수법 "수사 서류 언급" | '고객님 앞으로 영장이 청구된 상태입니다' 처럼 말로만 알리고 | PC:54 | O5-mention | 낮음 | 해당 없음 |
| prosecution-cooperation-call | 공통 | 수법 "부인 시 명의 도용 암시" | '그래서 명의 도용 피해자인지부터 가려야 합니다' | PC:55 | O5-mention | 낮음 | 해당 없음 |
| prosecution-cooperation-call | 공통 | 수법 "본인확인 정보 직접 요구" | '조사 대상 확인부터 해야 합니다, 성함이랑 생년월일 불러주세요' | PC:56 | 미분류(통화 안 정보 제공) | — | 통화 안 |
| prosecution-cooperation-call | 공통 | 수법 "비밀 유지 요구" | '비공개 수사라 가족에게 말씀하시면 가족도 조사 대상이 될 수 있습니다' | PC:57 | O1-physical(가족 차단) | 중간 | 없음 |
| prosecution-cooperation-call | 공통 | 수법 "고립 유도" | '주변에 사람이 있으면 안 됩니다, 혼자 계실 수 있게 해 주세요' | PC:58 | O1-physical | 중간 | 없음 |
| prosecution-cooperation-call | 공통 | 수법 "전화 끊음 저지" | '중간에 끊기면 바로 다시 연락 주셔야 합니다' 처럼 끊지 못하게 하고 수시로 진행 상황을 알려 달라고 한다. | PC:59 | 미분류(통화 유지 — "다시 연락"은 실제 번호 지정 0) | — | 통화 안 |
| prosecution-cooperation-call | nss6 · p4hz(은퇴) | 수법 "코인 구매·송금 요구" | '자산이 범죄수익인지 검수하려면 코인으로 바꿔 지정된 곳으로 옮겨 두셔야 합니다' | PC:60 | **O1-money**(코인 구매 · 송금) | 높음 | 없음 |
| prosecution-cooperation-call | 참가자 문구 | deepvoiceLines line-1 | 검찰 수사관입니다. 본인 명의 계좌 관련 사건으로 확인할 것이 있어 연락드렸습니다. | SC/prosecutionCooperationCall.ts:15 | O5-mention | 낮음 | 해당 없음 |
| prosecution-cooperation-call | fv-nss6, 고급, **은퇴** | s1 | 범죄 연루와 구속 가능성을 알린다. | FV:461 · FV:1743 | O5-mention | 낮음 | 해당 없음 |
| prosecution-cooperation-call | fv-nss6, 고급, **은퇴** | s2 | 영장이 청구됐다고 말로만 전한다. | FV:1743 | O5-mention | 낮음 | 해당 없음 |
| prosecution-cooperation-call | fv-nss6 · p4hz · c8wq · h3vn · v2mk · a6lq | s(비공개) | 비공개 수사라며 주변에 알리지 말고 혼자 있으라고 요구한다. 어디로 가라 · 무엇을 마련하라는 말은 하지 않는다. | FV:462 | O1-physical | 중간 | 없음 |
| prosecution-cooperation-call | 같은 6벌 | s(보고) | 끊지 말고 수시로 진행 상황을 알려 달라고 한다. | FV:463 | 미분류(통화 유지) | — | 통화 안 |
| prosecution-cooperation-call | fv-nss6 · fv-p4hz, 고급, **은퇴** | s(결말) | 자산 검수를 위해 코인으로 바꿔 지정된 곳으로 옮기라고 요구한다. | FV:464 · FV:1743 · FV:1762 | **O1-money** | 높음 | 없음 |
| prosecution-cooperation-call | fv-p4hz · fv-c8wq(은퇴) · fv-h3vn · fv-v2mk · fv-a6lq | s2 | 영장이 청구됐다며 문자로 보낸 사건 조회 링크에서 본인 확인 뒤 사건 기록을 직접 확인하라고 한다. | FV:469 · FV:519 · FV:1761 | O4-in-service | 참고 | 있음 — `case-record-view`(MS:566) |
| prosecution-cooperation-call | fv-p4hz · fv-c8wq, **은퇴** | 변형 수법 "수사 서류 언급"(링크) | 문자로 보내 드린 사건 조회에서 본인 확인하시면 직접 보실 수 있습니다' | PC:77 · FV:1765 · FV:1790 | O4-in-service | 참고 | 있음 — `case-record-view` |
| prosecution-cooperation-call | fv-h3vn · fv-v2mk · fv-a6lq, 현행 | 변형 수법 "수사 서류 언급"(열람본) | 방금 보신 기록에 본인 명의로 올라가 있죠? 그 계좌들이 지금 검수 대상입니다' | PC:84 · FV:1830 · FV:1853 · FV:1870 | O4-in-service | 참고 | 있음 — `case-record-view` |
| prosecution-cooperation-call | fv-h3vn · fv-v2mk · fv-a6lq, 현행 | 변형 수법 "권위 암시"(가상 고유명) | '… 수사관입니다, … 검사님 사건 때문에 연락드렸습니다' | PC:144 | O5-mention | 낮음 | 해당 없음 |
| prosecution-cooperation-call | fv-c8wq · h3vn · v2mk · a6lq | s(자산 진술) | 자산 검수 대상이라며 거래 은행과 예금 · 적금 규모를 묻고, 빠뜨리면 증거 은닉으로 본다고 압박한다. | FV:471 · FV:522 | 미분류(통화 안 정보 제공) | — | 통화 안 |
| prosecution-cooperation-call | fv-c8wq, 고급, **은퇴** | 페르소나 [진행 방식] | 예금을 OO거래소 계좌로 옮기신다 → 거기서 코인으로 바꾸신다 → 문자 속 보관 지갑 화면에서 전송하신다 | PC:97 | O1-money(거래소 이동 · 코인 구매는 화면 밖) | 높음 | 송금만 `asset-check-wallet` |
| prosecution-cooperation-call | fv-c8wq, 고급, **은퇴** | s6 | 예금을 본인 명의 OO거래소 계좌로 옮겨 코인으로 바꾸라고 한 단계씩 지시하고, 은행 · 거래소에서 이유를 물으면 개인 용도라고만 | FV:472 | **O1-money**(실제 거래소 계좌 · 코인 구매) | 높음 | 없음 |
| prosecution-cooperation-call | fv-c8wq, 고급, **은퇴** | 변형 수법 "코인 구매·송금 요구" | 예금을 OO거래소 계좌로 옮겨 코인으로 바꾸셔야 합니다, 바꾸신 건 문자로 보내 드린 검수 전용 보관 지갑으로 | PC:109 · FV:1790 | O1-money(구매 부분) | 높음 | 송금만 `asset-check-wallet` |
| prosecution-cooperation-call | fv-c8wq, 고급, **은퇴** | 변형 수법 "창구 확인 차단" | '은행이나 거래소에서 왜 그러냐고 물으면 개인적으로 쓸 데가 있다고만 하세요' | PC:111 | O1-physical | 중간 | 없음 |
| prosecution-cooperation-call | fv-c8wq, 고급, **은퇴** | s7 · 변형 수법 "보관 지갑 송금 화면 유도" | 바꾼 코인은 문자로 보낸 검수 전용 보관 지갑 안내의 링크 화면에서 지갑 번호와 금액을 넣어 전송하게 한다. | FV:473 · PC:112 | O4-in-service | 참고 | 있음 — `asset-check-wallet`(MS:623) |
| prosecution-cooperation-call | fv-c8wq, 고급, **은퇴** | s8(송금 뒤 추가 요구) | 남은 예금 · 적금 · 대출 가능액도 검수 대상이라며 추가로 바꿔 보내라고 요구 | FV:474 | **O1-money**(적금 해지 · 대출 · 추가 코인 구매) | 높음 | 없음 |
| prosecution-cooperation-call | fv-c8wq, 고급, **은퇴** | 변형 수법 "송금 뒤 추가 송금 요구" | 남은 예금·적금 해지·대출 가능액까지 추가로 바꿔 보내라고 요구하고 | PC:113 | O1-money | 높음 | 없음 |
| prosecution-cooperation-call | fv-c8wq(은퇴) · fv-h3vn | s9 · 수법 "거부 시 위협 격상" | '계좌가 전부 동결되고 가족분들도 조사받게 됩니다' … '일부라도 먼저 검수받으시죠' | FV:475 · PC:114 · PC:153 | O5-mention | 낮음 | 해당 없음 |
| prosecution-cooperation-call | fv-h3vn, 고급, 현행 | s1 | 범죄 연루와 구속 가능성을 알린다. (+미리 확보한 상대 정보) | FV:496 · FV:1817 | O5-mention | 낮음 | 해당 없음 |
| prosecution-cooperation-call | fv-h3vn, 고급, 현행 | s6 | 문자로 보낸 자산 검수 링크로 사이트에 들어가 본인 확인부터 하고 화면 안내대로만 진행하라고 한다. | FV:482 · FV:1822 | O4-in-service | 참고 | 있음 — `asset-check-site`(MS:646 — 본인 확인 → 전환 → 금액 → 이체) |
| prosecution-cooperation-call | fv-h3vn, 고급, 현행 | s7 | "지금 어느 화면까지 하셨어요?"처럼 한 단계마다 확인하고, 멈추면 오늘 안에 이체까지 끝내야 한다고 재촉한다. | FV:483 | O4-in-service | 참고 | 있음 — `asset-check-site` |
| prosecution-cooperation-call | fv-h3vn, 고급, 현행 | s8(이체 뒤 추가 요구) | 방금 검수한 자금이 … 적금 · 대출 한도 쪽으로도 … 같은 사이트에서 남은 예금 · 적금 · 대출 가능액도 진행하라고 한 번 요구 | FV:495 · FV:1824 | O1-money(경계 — 입력은 사이트 안, 적금 해지 · 대출 실행은 앱 밖이 전제) | 높음 | 부분 — `asset-check-site`(대출 화면 0) |
| prosecution-cooperation-call | fv-h3vn, 고급, 현행 | 페르소나 [진행 방식] | 문자로 보낸 자산 검수 링크로 사이트에 들어가 "화면 안내대로만 진행하시면 됩니다"라고만 한다. | PC:125 · PC:126 · FV:1837 | O4-in-service | 참고 | 있음 — `asset-check-site` |
| prosecution-cooperation-call | fv-h3vn, 고급, 현행 | 변형 수법 "코인 구매·송금 요구"(사이트) | 문자로 보내 드린 자산 검수 사이트에 들어가셔서 화면 안내대로만 진행하시면 됩니다' | PC:147 | O4-in-service | 참고 | 있음 — `asset-check-site` |
| prosecution-cooperation-call | fv-h3vn · fv-v2mk · fv-a6lq, 현행 | 변형 수법 "창구 확인 차단" | '은행에서 왜 그러냐고 물으면 개인적으로 쓸 데가 있다고만 하세요' | PC:149 · FV:1853 · FV:1870 | O1-physical | 중간 | 없음 |
| prosecution-cooperation-call | fv-h3vn, 고급, 현행 | 변형 수법 "검수 사이트 링크 진행 유도" · "진행 상황 확인 재촉" | '보내 드린 링크 누르시고 본인 확인부터 하시면 됩니다' / '지금 어디까지 하셨어요?' | PC:150 · PC:151 | O4-in-service | 참고 | 있음 — `asset-check-site` |
| prosecution-cooperation-call | fv-h3vn, 고급, 현행 | 변형 수법 "이체 뒤 추가 송금 요구" | 남은 예금·적금·대출 가능액도 같은 사이트에서 추가로 진행하라고 요구하고 | PC:152 | O1-money(경계 — 위 s8과 같음) | 높음 | 부분 — `asset-check-site` |
| prosecution-cooperation-call | fv-v2mk, 고급, 현행 | 페르소나(결말) | 자금 검수 명목으로 문화상품권을 사서 그 핀 번호를 불러 달라고 요구하는 상황을 연기한다. | FV:500 · FV:1856 | O1-money | 높음 | 없음 |
| prosecution-cooperation-call | fv-v2mk, 고급, 현행 | s6(결말) | 계좌 거래 기록이 남지 않는 상품권으로 바꿔 그 핀 번호를 검수번호로 제출 … 예금으로 문화상품권을 사서 핀 번호를 불러 달라 | FV:504 · FV:505 · FV:1851 | **O1-money**(상품권 실구매 + 핀) | 높음 | 없음 |
| prosecution-cooperation-call | fv-v2mk, 고급, 현행 | 추가 수법 "상품권 핀 번호 요구" | 예금을 문화상품권으로 바꾸셔야 합니다, 사신 상품권 핀 번호를 불러 주시면 검수번호로 등록됩니다' | FV:507 · FV:1853 | O1-money | 높음 | 없음 |
| prosecution-cooperation-call | fv-a6lq, 고급, 현행 | 페르소나(결말) | 명의 도용 대출 여부를 입증한다는 명목으로 대출을 받게 하고 그 대출금을 담당 직원에게 맡기라고 요구하는 상황 | FV:511 · FV:1873 | O1-money | 높음 | 없음 |
| prosecution-cooperation-call | fv-a6lq, 고급, 현행 | s6(결말) | 금융회사에서 대출을 받아 그 대출금을 현금으로 찾아 담당 직원에게 맡기겠다는 약속을 받아 내려 한다. | FV:514 · FV:1868 | **O1-money**(대출 실행 + 현금 인출 · 전달) | 높음 | 없음 |
| prosecution-cooperation-call | fv-a6lq, 고급, 현행 | s6 부속 | 은행 직원이 용도를 물으면 생활비라고만 하라고 시킨다. | FV:514 | O1-physical | 중간 | 없음 |
| prosecution-cooperation-call | fv-a6lq, 고급, 현행 | 추가 수법 "대출금 현금 인출 요구" | 정상 절차로 대출을 받으셔야 명의 도용 여부가 입증됩니다, 받으신 대출금은 현금으로 찾아 담당 직원에게 맡겨 주세요' | FV:516 · FV:1870 | O1-money | 높음 | 없음 |
| prosecution-cooperation-call | 문자 | prosecution-case-link 본문 | [사건조회] 본인 관련 사건이 접수되어 있습니다. … 열람 내용은 외부에 알리지 마십시오. | SMS:171 | O4-in-service | 참고 | 있음 — `case-record-view`(SMS:173) |
| prosecution-cooperation-call | 문자 | prosecution-wallet-link 본문(은퇴 c8wq) | [자산검수] 검수 전용 보관 지갑 안내 보관 지갑 번호: KW-7Q2X-4471 … 보관 지갑 전송을 진행해 주세요. | SMS:186 | O4-in-service | 참고 | 있음 — `asset-check-wallet`(SMS:188) |
| prosecution-cooperation-call | 문자 | prosecution-asset-site-link 본문 | [자산검수] … 검수 대상 자산은 안전 자산으로 전환해 보관하셔야 합니다. 아래 사이트에서 본인 확인 후 화면 안내대로 | SMS:201 | O4-in-service | 참고 | 있음 — `asset-check-site`(SMS:203) |
| prosecution-cooperation-call | 화면 | case-record-view 열람본 안내문 | 검수 절차는 담당 수사관이 별도로 안내합니다. 안내에 따르지 않으면 계좌가 동결될 수 있습니다. | MS:566 (recordDocument.noticeLines) | O5-mention | 낮음 | 화면 안 문구 |
| bank-security-verify-scam | 공통(전 난이도 페르소나) | 페르소나 [캐릭터] | 상대가 "보이스피싱 아니냐", "직접 확인해 보겠다"고 하면 … 오히려 "그렇게 하시는 게 맞습니다"라고 받아 준다. | BS:41 | **O1-device**(초급 · 중급 — 앱 안 확인 창구 없음 → 실제 번호로 확인 전화 권유) / O4(고급) | 높음 | 고급만 `bank-security-verify-desk`(VI:164) |
| bank-security-verify-scam | 참가자 문구(오프닝 — 추정: 전 난이도 공통) | deepvoiceLines line-2 | 의심스러우신 게 당연합니다. 직접 확인해 보셔도 됩니다. 저는 끊지 않고 기다리겠습니다. | SC/bankSecurityVerifyScam.ts:23 | O1-device(초급 · 중급) / O4(고급) | 높음 | 고급만 VI |
| bank-security-verify-scam | fv-62q8(고급)만 — xuvu 미보유 · mhnv drop | 수법 "확인 시도 무력화" | '의심되시면 직접 확인해 보세요, 저는 끊지 않고 기다리겠습니다' 처럼 막지 않고 오히려 권한다. | BS:58 | O4-in-service | 참고 | 있음 — `bank-security-verify-desk`(VI:164) |
| bank-security-verify-scam | 공통 | 수법 "안심 유도" | '확인까지 하셨으면 이제 마음 놓으셔도 됩니다' | BS:59 | O5-mention | 낮음 | 해당 없음 |
| bank-security-verify-scam | 공통 | 수법 "본인확인 정보 직접 요구" | '성함이랑 생년월일부터 불러주세요' … '출금 정지 걸려면 계좌 비밀번호까지 확인돼야 해요, 불러주세요' | BS:72 | 미분류(통화 안 정보 제공) | — | 통화 안 |
| bank-security-verify-scam | 공통 | 수법 "보호계좌 이체 요구" | '지금 잔액을 보호계좌로 옮겨두셔야 출금이 막힙니다' … 계좌는 … 문자로 보낸 것을 확인하게 한다. | BS:78 | O4-in-service | 참고 | 있음 — `protect-account-transfer`(MS:714) |
| bank-security-verify-scam | 공통 | 수법 "긴급성 조성" | '지금 출금이 진행 중이라 몇 분 안에 결정하셔야 해요' | BS:79 | O5-mention | 낮음 | 해당 없음 |
| bank-security-verify-scam | 공통 | 수법 "부인 시 명의 도용 암시" | '그래서 더 위험한 겁니다, 명의가 도용된 것으로 보입니다' | BS:80 | O5-mention | 낮음 | 해당 없음 |
| bank-security-verify-scam | fv-xuvu, 초급, 현행 | s1 | 계좌에서 비정상 출금 시도가 있었다고 알린다. | FV:1118 | O5-mention | 낮음 | 해당 없음 |
| bank-security-verify-scam | fv-xuvu, 초급, 현행 | s2 | 출금을 막으려면 보호계좌로 옮겨야 한다며 곧바로 이체를 요구한다. | FV:1118 | O4-in-service | 참고 | 있음 — `protect-account-transfer`(문자 FV:1121) |
| bank-security-verify-scam | fv-mhnv, 중급, 현행("current" — stages 0) | 단계 없음 → 기본 페르소나 · 수법(확인 시도 무력화 drop) | (위 공통 행 적용) | FV:1132 · FV:1134 | (위 공통 행) | — | 문자 FV:1136 → `protect-account-transfer` |
| bank-security-verify-scam | fv-62q8, 고급, 현행("current" — stages 0) | 단계 없음 → 기본 페르소나 · 수법 전부 | (위 공통 행 적용) | FV:1147 | (위 공통 행) | — | 문자 FV:1149 → `protect-account-transfer` · VI |
| bank-security-verify-scam | 문자 | bank-protect-account 본문 | [금융사고대응] 보호계좌 이체 안내 … 아래에서 보호계좌로 옮기기를 진행해 주세요. | SMS:332 | O4-in-service | 참고 | 있음 — `protect-account-transfer`(SMS:335) |

### 집계(위 표 기준, 행 수)

| 유형 | 위험도 | 행 수 |
|---|---|---|
| O1-money | 높음 | 45 |
| O1-device | 높음 | 4 |
| O1-physical | 중간 | 18 |
| O4-in-service | 참고 | 55 |
| O5-mention | 낮음 | 64 |
| 미분류 | — | 27 |
| (단계 없음 — 공통 행 참조: fv-mhnv · fv-62q8) | — | 2 |
| **합계** | | **215** |

- 집계는 표의 유형 열 첫 낱말을 awk로 센 값이다. 혼합 판정 행(예: AP:23 "O1-money(bmiq) / O4 경계(k9ra)", BS:41 "O1-device / O4") · "O5 / 미분류" 행은 **앞쪽 유형으로** 셌다.
- 미분류 27행의 성격: ① 통화 안에서 말로 신원 · 카드 · 계좌 정보를 불러 달라는 요구(앱 안에서 완결 — 판정표에 행 없음), ② 통화 유지 · 수시 보고 요구, ③ "확인하지 말라"는 차단(II:56 · CC:47). **판정표에 행 추가 여부 확인이 필요하다**(제안: "통화 안 발화로 완결되는 정보 요구 → O4-in-service 확장" · "확인/이동을 막는 지시 → O5").

### 구조 관찰

| 시나리오 | variantId(난이도 · 은퇴) | 필수 문자 수(하한 notBeforeUserTurns) | 선택 문자 | goalFollowUpUserTurns | legs | 마지막 단계가 "이체 뒤 추가 요구"인가 |
|---|---|---|---|---|---|---|
| institutional | fv-5cn4(초급) | 1 — transfer @3 | 0 | 없음 | 1 | 아니오 |
| institutional | fv-hktx(중급) | 1 — transfer @3 | identity @2 | 없음 | 1 | 아니오 |
| institutional | fv-c5fj(고급) | 2 — otp @5(백스톱 1) · transfer @6(백스톱 1) | 0 | 3 | 2(검사 · 금감원 — 릴레이 런타임 없음) | **예** — s6 대출 실행 · 대출금 이체(FV:357) |
| institutional | fv-pgqt(고급 · 은퇴) | 2 — otp @3 · transfer @6 | 0 | 3 | 1 | **예** — s5 대출(FV:311) |
| institutional | fv-q7cn(고급) | 1 — otp @5(백스톱 1) | 0 | 4 | 1 | 아니오(결말 자체가 현금 · 수표 전달 — 이체 없음) |
| institutional | fv-g2ld(고급) | 1 — otp @5(백스톱 1) | 0 | 4 | 1 | 아니오(결말 = 금 구매 · 제출) |
| card-company | fv-aqp6(초급) | 0 | 0 | 없음 | 1 | 아니오 |
| card-company | fv-35f2(중급) | 1 — transfer @3 | identity @2 | 없음 | 1 | 아니오 |
| card-company | fv-akj5(고급 · 챌린지 수신자 전용) | 0 | 0 | 없음 | 2 | 아니오(마지막 = 카드 정보 + 피해금 이관 낭독형 — 화면 0) |
| card-company | fv-x7ue(고급 · 자가) | 1 — link(설치) @2 | 0 | 없음 | 2 | 아니오(마지막 = 피해금 이관 동의 — 화면 0) |
| card-company | fv-w3dq(고급 · 자가) | 1 — link(설치) @2 | 0 | 없음 | 2 | 아니오(마지막 = 보호 계좌 이체 — 화면 0) |
| card-delivery | fv-tvnj(고급 · 시나리오 목록 제외 = 신규 세션 0) | 1 — link @2 | 0 | 없음 | 2 | 아니오(마지막 = 보호 계좌 이체 — 화면 0) |
| card-delivery | fv-e5mv(고급) | 1 — link @2(백스톱 1) | 0 | 4 | 1 | 아니오(결말 = 대출 실행 + 현금 전달) |
| card-delivery | fv-u9fz(고급) | 1 — link @2(백스톱 1) | 0 | 없음 | 1 | 아니오(마지막 = 보호 계좌 이체 — 화면 0) |
| asset-protection | fv-bmiq(고급 · 은퇴) | 0 | 0 | 없음 | 1 | 아니오 |
| asset-protection | fv-k9ra(고급) | 1 — link @3 | 0 | 없음 | 1 | 아니오 |
| asset-protection | fv-p3jx(고급) | 1 — transfer(계좌만 · 화면 0) @4(백스톱 1) | 0 | 없음 | 1 | 아니오 |
| asset-protection | fv-t8ga(고급) | 1 — link @3(백스톱 1) | 0 | 없음 | 1 | 아니오(신청서 뒤 금 구매 — 이체 뒤 아님) |
| prosecution | fv-nss6(고급 · 은퇴) | 0 | 0 | 없음 | 1 | 아니오 |
| prosecution | fv-p4hz(고급 · 은퇴) | 1 — link @2 | 0 | 없음 | 1 | 아니오 |
| prosecution | fv-c8wq(고급 · 은퇴) | 2 — link @2 · transfer @5 | 0 | 없음 | 1 | **예** — s8 송금 뒤 추가 송금 + s9 거부 시 격상(FV:474-475) |
| prosecution | fv-h3vn(고급) | 2 — link @2(백스톱 1) · transfer(사이트) @5(백스톱 1) | 0 | **없음**(이체 뒤 후속 단계가 있는데 설정 안 됨) | 1 | **예** — s8 이체 뒤 추가 검수 + s9 격상(FV:495 · FV:475) |
| prosecution | fv-v2mk(고급) | 1 — link @2(백스톱 1) | 0 | 없음 | 1 | 아니오(결말 = 상품권 핀) |
| prosecution | fv-a6lq(고급) | 1 — link @2(백스톱 1) | 0 | 없음 | 1 | 아니오(결말 = 대출 + 현금 전달) |
| bank-security | fv-xuvu(초급) | 1 — transfer @3 | 0 | 없음 | 1 | 아니오 |
| bank-security | fv-mhnv(중급 · current) | 1 — transfer @3 | 0 | 없음 | 1 | 단계 0(해당 없음) |
| bank-security | fv-62q8(고급 · current) | 1 — transfer @3 | 0 | 없음 | 1 | 단계 0(해당 없음) |

### 관찰 메모(근거 포함)

1. **현행 고급 결말 중 서비스 안 화면이 없는 것**: 기관 q7cn(현금 · 수표 전달) · g2ld(금) / 카드사 w3dq · x7ue(이체 동의) · akj5(계좌 낭독 이체 · 앱 설치 — 챌린지 풀) / 카드 배송 e5mv(대출 + 현금) · u9fz(보호 계좌) / 자산 p3jx(공탁금 — 계좌 문자에 링크 0, SMS:155-163) · t8ga(금) / 검찰 v2mk(상품권 핀) · a6lq(대출 + 현금). 현행 고급 결말 중 화면이 있는 것은 기관 c5fj(이체)·자산 k9ra(신청서)·검찰 h3vn(사이트) 3벌뿐이다.
2. **이체 뒤 추가 요구가 실제 대출 · 적금 해지를 전제**: c5fj s6(FV:357), h3vn s8(FV:495 · PC:152 — "대출 가능액"은 사이트 항목(MS:646 stepScreens)에는 있으나 대출을 받는 화면은 없다).
3. **창구 · 판매점 둘러대기 코칭**(O1-physical)이 결말 단계 문면에 직접 들어 있다: FV:357 · 311 · 386 · 388 · 435 · 453 · 514, PC:111 · 149, II:74, AP:44.
4. **확인 권유가 초급 · 중급에서 실제 전화로 새는 경로(추정)**: bank-security 페르소나(BS:41)와 오프닝 문구(SC/bankSecurityVerifyScam.ts:23)는 난이도와 무관하게 실리는데, 앱 안 확인 창구는 고급에서만 켜진다(BS 파일 머리 주석 BS:21-25 · VI). 확인 방법: `functions/src/roleplay/index.ts`의 `verifyEnabled` 조건과 deepvoiceLines가 초급 · 중급 세션에서 실제로 재생되는지 확인.
5. **fv-akj5**는 자가 배정 풀이 아니라 챌린지 수신자 고급 풀 전용(FV:837-839 주석)이지만, 문자 선언 0인 채로 앱 설치(FV:598)와 계좌 낭독 이체(FV:561)를 요구한다 — 이 그룹에서 서비스 안 표현이 가장 없는 현행 변형이다.
6. legs 2인 변형(c5fj · akj5 · x7ue · w3dq · tvnj)은 `RELAY_RUNTIME_AVAILABLE = false`(FV:141)라 실제로는 1화자다 — "금융감독원 직원" 2번째 화자 전환은 일어나지 않는다.
7. 모의 화면의 `correctAction`(예: MS:450 이하 "통화를 끊고 이미 알고 있는 은행 대표번호로 …")은 리포트용 올바른 대처 안내라 사기범 요구가 아니므로 표에서 뺐다.

---

<!-- inventory-B -->
### 통화 시나리오 B군 — 서비스 밖 실제 행동 유도 목록 (읽기 전용 감사)

기준: 워크트리 `elegant-cray-d1b0d2` (HEAD `b9d25cb2`). 파일 경로 약어 — `P/` = `functions/src/scenarios/`, `C/` = `src/content/scenarios/`.

### 금지·전제 (읽기 전에)
- 이 문서는 **분류 결과만** 담는다. 수정 제안은 없다.
- 판정표(지시문 그대로)만 적용했다. 표에 안 맞는 경우는 유형 `미분류`로 적고 맨 아래 "미분류" 절에 모았다.
- **계좌 문자(`kind: "account"`)는 계좌번호를 서비스 안 문자로 보여 줄 뿐, 이체 화면(`fakeLandingId`)이 없다.** 이 시나리오군의 `MOCK_SCREENS`에는 이체형 화면(`safe-account-transfer` 같은 것)이 하나도 없다(`P/mockScreens.ts:795-797` — loan 2건 · tax 1건 · courier 1건, 전부 정보 입력 또는 설치 화면). 따라서 "문자로 보낸 계좌에 넣어라"는 **O1-money**로 분류했다(이체 행동 자체를 받는 화면이 없음).
- `authoring: "current"` 변형은 페르소나 원문 + 원본 수법 전부(또는 `dropLabels`를 뺀 나머지)를 쓴다. `authored` 변형은 페르소나 원문 + [이번 통화의 흐름] 블록을 쓴다(`P/flowVariants.ts:1940-1955`). ⇒ **페르소나 원문의 문장은 그 시나리오의 모든 변형에 실린다**(초급 `keepLabels`로 수법을 뺀 변형 포함).
- 은퇴(`retired: true`) 변형: 이 7개 시나리오에는 **0건**(`P/flowVariants.ts` grep `retired` — 749 · 1672 · 1752 · 1777 · 1805행 모두 다른 시나리오).
- 가족 사고 · 손주 사칭(clone)은 실시간 통화가 ElevenLabs 에이전트 경로라 **변형이 적용되지 않는다**(`P/flowVariants.ts:1233` 주석 "clone = ElevenLabs 경로는 변형 미적용"). 실시간 통화에는 원본 페르소나·수법이 실리고, 변형 단계는 텍스트 폴백에서만 효력이 있다(추정 — 확인 방법: `functions/src/realtime/agentMap.ts`와 ElevenLabs 에이전트 저장 프롬프트 대조).
- 원본 수법 중 "해당 없음"으로 판정해 표에서 뺀 것(말로만 압박 · 통화 안 정보 질문 · 통화 유지): loan `권위·정당성 포장`·`이익 유혹`·`마감 압박`·`부인 시 이익 전환`·`전화 끊음 저지`·`확인질문 재촉`(43·44·45·58·67·70행) / tax `공짜 돈 유혹`·`권위 포장`·`본인확인 빙자 정보 수집`·`부인 시 절차 정당화`·`전화 끊음 저지`·`확인질문 재촉`(43·44·45·56·58·66행) / courier `생활 밀착형…`·`긴급성 조성`·`명의 도용 암시`·`전화 끊음 저지`·`확인질문 재촉`(39·40·42·49·52행) / kidnapping `자녀 인질 협박`·`명령조`·`냉담한 반응`·`말 끊기`·`여지를 남긴 경고`·`부인 시 냉담한 떠넘기기`·`전화 끊음 저지`·`촉박한 결정 압박`(49·50·51·52·54·66·69·70행) / family `다급함 조성`·`가족애·죄책감`·`권위·긴급상황 암시`·`부인 시 애정 호소`·`제3자 통화 전환 요구`(통화 안 화자 교체)·`전화 끊음 저지`·`패닉 격화`(140·141·143·153·154·156·157행) / grandchild `다급함 조성`·`애정·죄책감`·`전화 끊음 저지`·`애교 섞인 재촉`(135·136·143·144행) / reputation `단절적 어조`·`반박 무시`·`비밀 유지 미끼`·`노골적 시간 압박`·`전화 끊음 저지`(35·36·38·39·44행).

### 인벤토리 표

| 시나리오 | 루트(variantId, 난이도, 은퇴여부) | 단계/위치 | 원문(한국어 그대로, 120자 이내) | 근거(파일:줄) | 유형 | 위험도 | 서비스 안 화면 존재 여부(screen id) |
|---|---|---|---|---|---|---|---|
| loan-refinance-scam | 전 변형(bqr9·avap·6s5p·m3hd·d8pw·r4hc) | 페르소나 [캐릭터] | "정부 지원 저금리 대환대출 대상자"라는 명목으로 접근해, 기존 대출 상환·수수료 명목의 송금을 유도하는 상황을 연기한다. | P/loanScam.prompt.ts:27 | O1-money | 높음 | 없음(이체 화면 없음) |
| loan-refinance-scam | avap(중급)·6s5p·m3hd(고급), 현역 | 수법 `선상환 송금 요구` | '…기존 대출 얼마를 오늘 안에 상환하셔야 해요, 상환 전용 계좌로 지금 보내주세요' … 계좌는 … 문자로 보낸 것을 확인하게 한다. | P/loanScam.prompt.ts:48 | O1-money | 높음 | 없음 — 계좌 문자 `loan-account`만(이체 화면 없음) |
| loan-refinance-scam | bqr9(초급)·avap·6s5p·m3hd, 현역 | 수법 `신규 대출 승인 명목 선입금 요구` | '신규 승인은 나셨는데 전산 등록비(보증보험료)가 먼저 들어와야 실행됩니다, 그 금액만 지금 넣어주세요' | P/loanScam.prompt.ts:53 | O1-money | 높음 | 없음 — `loan-account` 문자만 |
| loan-refinance-scam | avap·6s5p·m3hd, 현역 | 수법 `수수료 낮춰 재요구` | '그럼 절반만 먼저, 나머지는 실행일에 빼드릴게요' 처럼 더 적은 금액의 새 조건으로 다시 요구한다. | P/loanScam.prompt.ts:54 | O1-money | 높음 | 없음 |
| loan-refinance-scam | avap·6s5p·m3hd·d8pw·r4hc, 현역 | 수법 `절차·서류 정당화` | '지금 심사 2단계까지 올라가 있고 오늘 안에 서류만 확인되면 실행됩니다' … 형식만 쓰고 … 서류 양식은 설명하지 않는다. | P/loanScam.prompt.ts:65 | O5-mention | 낮음 | 해당 없음 |
| loan-refinance-scam | avap·6s5p·m3hd·d8pw·r4hc, 현역 | 수법 `확인 차단` | '다른 데 알아보시면 대상이 취소돼요', '저희 통해서만 처리돼요' 처럼 제3자·공식창구 재확인을 막으려 하되 | P/loanScam.prompt.ts:66 | 미분류 | — | 해당 없음 |
| loan-refinance-scam | 전 변형 | 통화 중 문자 `loan-account` | [○○캐피탈] 저금리 전환 상환 전용 계좌 안내 … 금액: 1,850,000원 오늘 18시까지 입금해 주세요. | P/inCallSms.ts:85 | O1-money | 높음 | 문자 자체는 서비스 안, 이체 화면 없음(`fakeLandingId` 없음) |
| loan-refinance-scam | fv-bqr9, 초급, 현역 | s1 | 저금리 대환대출 대상이라고 안내한다. | P/flowVariants.ts:901 | 해당 없음 | — | — |
| loan-refinance-scam | fv-bqr9, 초급, 현역 | s2 | 신규 대출 승인을 위해 선입금이 필요하다고 곧바로 요구한다. | P/flowVariants.ts:901 | O1-money | 높음 | 없음 — `loan-account`(필수, 하한 3) |
| loan-refinance-scam | fv-avap, 중급, 현역 | s1 | 저금리 전환 대상이라고 안내한다. | P/flowVariants.ts:916 | 해당 없음 | — | — |
| loan-refinance-scam | fv-avap, 중급, 현역 | s2 | 기존 대출을 먼저 갚아야 전환된다며 상환을 요구한다. | P/flowVariants.ts:917 | O1-money | 높음 | 없음 — `loan-account` |
| loan-refinance-scam | fv-avap, 중급, 현역 | s3 | 망설이면 조건을 낮춰 다시 요구한다. | P/flowVariants.ts:918 | O1-money | 높음 | 없음 |
| loan-refinance-scam | fv-6s5p, 고급(챌린지 풀), 현역 | s1 | 상대 대출 이력을 이미 아는 듯 맞춤 안내라고 말한다. 상대가 말하지 않은 이름 · 금액은 지어내 단정하지 않는다. | P/flowVariants.ts:626 | 해당 없음 | — | — |
| loan-refinance-scam | fv-6s5p, 고급, 현역 | s2 (설치) | 대출 심사 전에 보안 점검 앱을 설치하고 … | P/flowVariants.ts:627 | O1-device | 높음 | **없음** — 이 변형의 링크 문자는 `loan-apply-link`(신청서 입력 화면 `loan-refinance-apply`, 필수 아님)뿐, 설치 화면 문자 미선언(P/flowVariants.ts:636-637) |
| loan-refinance-scam | fv-6s5p, 고급, 현역 | s2 (삭제) | … 쓰던 금융 앱은 잠시 지우라고 요구한다. | P/flowVariants.ts:627 | O1-device | 높음 | 없음(삭제를 받는 화면 없음) |
| loan-refinance-scam | fv-6s5p·fv-m3hd·fv-d8pw·fv-r4hc, 고급, 현역 | 추가 수법 `보안 앱 설치·금융 앱 삭제 요구` | '심사 전에 ○○안심보안 점검 앱을 설치하시고, 쓰시던 금융 앱은 잠시 지워 주셔야 합니다' | P/flowVariants.ts:633 · 954 · 975 | O1-device(삭제 부분) — 설치 부분은 6s5p만 O1-device, m3hd·d8pw·r4hc는 O4 | 높음 | 설치: m3hd·d8pw·r4hc = `loan-check-app-install` / 6s5p = 없음. 삭제: 전부 없음 |
| loan-refinance-scam | fv-6s5p, 고급, 현역 | s3 | 절차와 서류를 들어 정식 상담처럼 꾸민다. | P/flowVariants.ts:628 | O5-mention | 낮음 | — |
| loan-refinance-scam | fv-6s5p, 고급, 현역 | s4 | 기존 대출 상환 또는 선입금을 요구한다. | P/flowVariants.ts:629 | O1-money | 높음 | 없음 — `loan-account` |
| loan-refinance-scam | fv-6s5p, 고급, 현역 | 통화 중 문자 `loan-apply-link`(선택) | [○○캐피탈] 전환 신청서 서명이 남아 있습니다. 아래에서 본인확인 후 신청을 완료해 주세요. | P/inCallSms.ts:94 · P/mockScreens.ts:352 | O4-in-service | 참고 | 있음 `loan-refinance-apply`(성함·생년월일·연락처) |
| loan-refinance-scam | fv-m3hd, 고급(자가 풀), 현역 | s1·s3 | (6s5p와 동일 — 스프레드 상속) | P/flowVariants.ts:933-940 → 626 · 628 | 해당 없음 / O5-mention | — / 낮음 | — |
| loan-refinance-scam | fv-m3hd, 고급, 현역 | s2 (설치) | 대출 심사 전에 보안 점검 앱을 설치하고 … | P/flowVariants.ts:627(상속) · P/inCallSms.ts:109 | O4-in-service | 참고 | 있음 `loan-check-app-install` |
| loan-refinance-scam | fv-m3hd, 고급, 현역 | s2 (삭제) | … 쓰던 금융 앱은 잠시 지우라고 요구한다. | P/flowVariants.ts:627(상속) | O1-device | 높음 | 없음 |
| loan-refinance-scam | fv-m3hd, 고급, 현역 | s4 | 기존 대출 상환 또는 선입금을 요구한다. | P/flowVariants.ts:629(상속) | O1-money | 높음 | 없음 — `loan-account` |
| loan-refinance-scam | fv-d8pw, 고급, 현역 | s1 | 정부지원 저금리 대출 대상이라고 안내한다. … | P/flowVariants.ts:946 | 해당 없음 | — | — |
| loan-refinance-scam | fv-d8pw, 고급, 현역 | s2 | 대출 심사 전에 보안 점검 앱을 설치하라고 요구한다.(+문자 먼저) | P/flowVariants.ts:947 | O4-in-service | 참고 | 있음 `loan-check-app-install` |
| loan-refinance-scam | fv-d8pw, 고급, 현역 | s3 | 심사 결과 신용점수가 기준에 조금 못 미친다며, 예치금을 넣어 거래 실적을 만들면 점수가 올라 바로 승인되고 … | P/flowVariants.ts:948 | O5-mention(이유 설명) | 낮음 | — |
| loan-refinance-scam | fv-d8pw, 고급, 현역 | s4 | 문자로 보낸 계좌에 예치금을 넣으라고 요구하고, 망설이면 금액을 낮춰 한 번 더 요구한 뒤 더 조르지 않고 마무리한다. | P/flowVariants.ts:949 | O1-money | 높음 | 없음 — `loan-account` |
| loan-refinance-scam | fv-d8pw, 고급, 현역 | 추가 수법 `예치금 입금 요구` | '…예치금을 넣어 거래 실적을 만드시면 점수가 올라 바로 승인되고 예치금은 대출과 함께 돌려드립니다' | P/flowVariants.ts:398-399 (참조 953) | O1-money | 높음 | 없음 |
| loan-refinance-scam | fv-d8pw, 고급, 현역 | decisionMoment | 문자로 받은 계좌에 예치금을 넣겠다고 하는 순간 | P/flowVariants.ts:960 | O1-money | 높음 | 없음 |
| loan-refinance-scam | fv-r4hc, 고급, 현역 | s1 | 상대 대출 이력을 이미 아는 듯 연체 정리를 돕는 대환 안내라고 말한다. … | P/flowVariants.ts:967 | 해당 없음 | — | — |
| loan-refinance-scam | fv-r4hc, 고급, 현역 | s2 | 대출 심사 전에 보안 점검 앱을 설치하라고 요구한다.(+문자 먼저) | P/flowVariants.ts:968 | O4-in-service | 참고 | 있음 `loan-check-app-install` |
| loan-refinance-scam | fv-r4hc, 고급, 현역 | s3 | 기존 대출을 먼저 갚아야 대환이 되는데 계좌로 보내면 중도상환 기록이 남아 심사가 늦어진다며, 현금으로 직접 상환해야 하는 이유부터 설명한다. | P/flowVariants.ts:969 | O5-mention(이유 설명) | 낮음 | — |
| loan-refinance-scam | fv-r4hc, 고급, 현역 | s4 | 예금을 현금으로 찾아 회사 직원에게 직접 상환하겠다는 약속을 받아 내려 한다. 만날 장소 · 시간 · 주소는 정하지도 묻지도 않는다. | P/flowVariants.ts:970 | O1-money(현금 인출+대면 전달, 이동 함축) | 높음 | 없음 |
| loan-refinance-scam | fv-r4hc, 고급, 현역 | 추가 수법 `현금 상환 인출 요구` | '…현금으로 찾아 저희 직원에게 직접 상환하시면 바로 처리됩니다' 처럼 기록 · 속도를 이유로 현금 인출과 직원 전달을 약속하게 한다. | P/flowVariants.ts:400-401 (참조 976) | O1-money | 높음 | 없음 |
| loan-refinance-scam | fv-r4hc, 고급, 현역 | decisionMoment | 기존 대출을 현금으로 찾아 직원에게 상환하겠다고 약속하는 순간 | P/flowVariants.ts:980 | O1-money | 높음 | 없음 |
| loan-refinance-scam | (화면 표시용·재생 안 됨) | deepvoiceLines line-2 | 오늘까지만 신청 가능하신데, 기존 대출을 먼저 정리하셔야 저금리 전환이 됩니다. | C/loanScam.ts:12 | O5-mention(@deprecated 필드) | 낮음 | — |
| tax-refund-scam | 전 변형(vtq7·aqx2·uk7m) | 페르소나 [캐릭터] | "미수령 환급금이 있다"는 명목으로 접근해, 본인 확인·수수료·이체 명목의 조작(현금인출기 조작·앱 설치 유도 등)을 시도하는 상황을 연기한다. | P/taxRefundScam.prompt.ts:27 | O1-money(+O1-device) | 높음 | 없음 — **초급 vtq7은 ATM·앱 수법을 keepLabels로 뺐지만 이 페르소나 줄은 그대로 실린다** |
| tax-refund-scam | aqx2(중급)·uk7m(고급), 현역 | 수법 `ATM 조작 지시` | '지금 가까운 현금지급기로 가세요, 도착하시면 제가 순서 불러드릴게요, 끊지 마시고 이동하세요' | P/taxRefundScam.prompt.ts:46 | O1-money(ATM 조작) + O1-physical(이동) | 높음 | 없음 |
| tax-refund-scam | aqx2·uk7m, 현역 | 수법 `앱 설치 지시` | '환급 조회 앱 하나만 설치하시면 바로 처리돼요, 지금 문자로 보내드릴 테니 눌러서 설치해 주세요' | P/taxRefundScam.prompt.ts:47 | O1-device | 높음 | **없음** — tax 문자는 계좌 등록 화면(`tax-refund-claim`)만 연다. tax는 설치 허용목록 밖(P/mockScreens.ts:812-816) |
| tax-refund-scam | vtq7·aqx2·uk7m, 현역 | 수법 `환급 수수료 요구` | '환급금 나가려면 처리 수수료 얼마를 먼저 넣으셔야 해요' … 계좌는 'OO은행 948-2716-5093-27' 같은 가상값으로만 부른다. | P/taxRefundScam.prompt.ts:52 | O1-money | 높음 | 없음 — 계좌 문자도 없음(음성 낭독) |
| tax-refund-scam | aqx2·uk7m, 현역 | 수법 `확인 차단` | '다른 데 문의하시면 처리가 지연돼요', '지금 저랑만 진행하시면 돼요' | P/taxRefundScam.prompt.ts:57 | 미분류 | — | 해당 없음 |
| tax-refund-scam | 전 변형 | 통화 중 문자 `tax-refund-link` | [환급안내] 미수령 환급금 조회 결과가 있습니다. 아래에서 계좌를 등록하시면 당일 지급됩니다. | P/inCallSms.ts:289 · P/mockScreens.ts:395 | O4-in-service | 참고 | 있음 `tax-refund-claim`(예금주·은행·계좌번호) |
| tax-refund-scam | fv-vtq7, 초급, 현역 | s1 | 미수령 환급금이 있다고 알린다. | P/flowVariants.ts:993 | 해당 없음 | — | — |
| tax-refund-scam | fv-vtq7, 초급, 현역 | s2 (수수료) | 환급을 받으려면 수수료가 먼저 필요하다며 곧바로 요구하고, | P/flowVariants.ts:994 | O1-money | 높음 | 없음 — 수수료 이체 화면 없음 |
| tax-refund-scam | fv-vtq7, 초급, 현역 | s2 (접수) | … 접수는 문자로 보낸 안내에서 하라고 한다. | P/flowVariants.ts:994 | O4-in-service | 참고 | 있음 `tax-refund-claim` |
| tax-refund-scam | fv-aqx2(중급)·fv-uk7m(고급), 현역 | 단계 없음(`current`) | (stages: [] — 페르소나 · 원본 수법 전부) | P/flowVariants.ts:1009 · 1022 | (위 수법 행 참조) | — | — |
| tax-refund-scam | (재생 안 됨) | deepvoiceLines line-3 | 지금 안내해 드리는 대로만 따라 하시면 됩니다. 다른 곳에 문의하시면 처리가 지연돼요. | C/taxRefundScam.ts:12 | O5-mention(@deprecated) | 낮음 | — |
| courier-customs-scam | uaee(초급)·62ak(중급)·xpvu(고급), 현역 | 수법 `통관비 결제 요구` | '통관 보류 해제하려면 관세 얼마를 지금 입금하셔야 물건이 나갑니다' … 계좌는 … 문자로 보낸 것을 확인하게 한다. | P/courierCustomsScam.prompt.ts:45 | O1-money | 높음 | 없음 — 계좌 문자 `courier-customs-fee`만 |
| courier-customs-scam | xpvu(고급), 현역 | 수법 `개인정보 직접 요구` | '수취인 본인 확인해야 해서요, 주민번호 뒤 7자리 불러주시겠어요?' … '결제 확인용으로 카드번호도 불러주셔야 해요' | P/courierCustomsScam.prompt.ts:48 | O1-money(카드 정보) | 높음 | 없음 — 카드번호 입력 화면 없음(통화 발화로 받음; 62ak는 dropLabels로 제외, uaee·y3ks는 keepLabels 밖) |
| courier-customs-scam | uaee·62ak·xpvu·y3ks, 현역 | 수법 `확인 절차 차단` | '고객센터 대표번호로 거시면 확인이 오래 걸려요' 처럼 제3자·공식 창구 재확인을 막으려 하되 | P/courierCustomsScam.prompt.ts:41 | 미분류 | — | 해당 없음(※ uaee keepLabels에는 없음 — 62ak·xpvu·y3ks만) |
| courier-customs-scam | uaee·62ak·xpvu | 통화 중 문자 `courier-customs-fee` | [통관수수료] 납부 계좌 안내 예금주: 국제통관지원센터 OO은행 604-2270-1183-91 금액: 78,000원 | P/inCallSms.ts:359 | O1-money | 높음 | 문자만, 이체 화면 없음 |
| courier-customs-scam | 62ak·xpvu | 통화 중 문자 `courier-customs-link`(선택) | [통관보류] 수취인 정보 불일치로 통관이 보류되었습니다. 아래에서 정보를 확인해 주세요. | P/inCallSms.ts:347 · P/mockScreens.ts:418 | O4-in-service | 참고 | 있음 `courier-customs-check`(성함·연락처·생년월일) |
| courier-customs-scam | fv-uaee, 초급, 현역 | s1 | 국제 택배가 통관에서 보류됐다고 알린다. | P/flowVariants.ts:1037 | 해당 없음 | — | — |
| courier-customs-scam | fv-uaee, 초급, 현역 | s2 | 통관비를 내야 한다며 곧바로 결제를 요구한다. | P/flowVariants.ts:1037 | O1-money | 높음 | 없음 |
| courier-customs-scam | fv-62ak, 중급, 현역 | s1 | 통관 보류를 알린다. | P/flowVariants.ts:1052 | 해당 없음 | — | — |
| courier-customs-scam | fv-62ak, 중급, 현역 | s2 | 문자로 보낸 링크에서 통관 정보를 확인하라고 한다. | P/flowVariants.ts:1053 | O4-in-service | 참고 | 있음 `courier-customs-check`(단 문자 `required: false`) |
| courier-customs-scam | fv-62ak, 중급, 현역 | s3 | 수수료 결제를 요구한다. | P/flowVariants.ts:1054 | O1-money | 높음 | 없음 |
| courier-customs-scam | fv-xpvu, 고급, 현역 | s1 | 통관 보류를 알린다. | P/flowVariants.ts:1073 | 해당 없음 | — | — |
| courier-customs-scam | fv-xpvu, 고급, 현역 | s2 | 문자로 보낸 링크에서 통관 정보를 확인하라고 한다. | P/flowVariants.ts:1074 | O4-in-service | 참고 | 있음 `courier-customs-check`(선택 문자) |
| courier-customs-scam | fv-xpvu, 고급, 현역 | s3 | 통관 확인에 필요하다며 개인정보를 요구한다. | P/flowVariants.ts:1075 | O1-money(이 변형 수법에 카드번호 요구 포함) | 높음 | 없음 |
| courier-customs-scam | fv-xpvu, 고급, 현역 | s4 | 수수료 결제를 요구한다. | P/flowVariants.ts:1076 | O1-money | 높음 | 없음 |
| courier-customs-scam | fv-y3ks, 고급, 현역 | s1 | 해외 택배가 통관에서 보류됐다고 알린다. | P/flowVariants.ts:1095 | 해당 없음 | — | — |
| courier-customs-scam | fv-y3ks, 고급, 현역 | s2 | 보류된 물품이 고객님 명의로 수입 신고됐는데 본인이 아니면 명의가 도용된 것이라며, 이 건이 경찰 수사팀으로 넘어갔다고 … | P/flowVariants.ts:1096 | O5-mention | 낮음 | — |
| courier-customs-scam | fv-y3ks, 고급, 현역 | s3 | 도용 피해가 번지지 않게 자산을 확인해야 한다며 거래 은행과 잔액 규모를 묻는다. | P/flowVariants.ts:1097 | 해당 없음(통화 안 질문) | — | — |
| courier-customs-scam | fv-y3ks, 고급, 현역 | s4 | 수사가 끝날 때까지 자산을 국가 안전계좌로 옮겨야 도용 피해를 막는다며 문자로 보낸 계좌로 이체하라고 요구하고 … | P/flowVariants.ts:1098 | O1-money | 높음 | 없음 — 계좌 문자 `courier-safe-account`만 |
| courier-customs-scam | fv-y3ks, 고급, 현역 | 추가 수법 `국가 안전계좌 이체 요구` | '수사가 끝날 때까지 자산을 국가 안전계좌로 옮겨 두셔야 도용 피해가 번지지 않습니다, 계좌는 방금 문자로 보냈습니다' | P/flowVariants.ts:410-411 (참조 1101) | O1-money | 높음 | 없음 |
| courier-customs-scam | fv-y3ks, 고급, 현역 | 통화 중 문자 `courier-safe-account` | [명의도용 피해조치] 국가 안전계좌 안내 예금주: 자산보호관리센터 OO은행 604-2270-1183-91 수사 종료 시까지 보관 후 반환됩니다. | P/inCallSms.ts:370 | O1-money | 높음 | 문자만, 이체 화면 없음 |
| courier-customs-scam | fv-y3ks, 고급, 현역 | decisionMoment | 문자로 받은 국가 안전계좌로 자산을 옮기겠다고 하는 순간 | P/flowVariants.ts:1108 | O1-money | 높음 | 없음 |
| courier-customs-scam | (재생 안 됨) | deepvoiceLines line-3 | 오늘 처리하지 않으시면 반송될 수 있어서요. 지금 안내해 드리는 절차만 따라와 주시면 됩니다. | C/courierCustomsScam.ts:14 | O5-mention(@deprecated) | 낮음 | — |
| kidnapping-threat | 전 변형(c5ih·dxwu·k268·w7tb) | 페르소나 [말투/톤] | 상대가 신고하겠다거나 자녀에게 직접 연락하겠다고 하면 즉각적이고 단호하게("그럼 후회할 수도 있어요") 막으려 한다 | P/kidnappingThreat.prompt.ts:30 | O1-physical(실제 가족 연락 회피) | 중간 | 없음 |
| kidnapping-threat | 전 변형 | 페르소나 [진행 방식] — 입금 후 | 돈을 받은 뒤에는 금액 조정 재요구로 추가 금액을 요구할 수는 있다. | P/kidnappingThreat.prompt.ts:38 | O1-money(입금 후 추가 요구) | 높음 | 없음 |
| kidnapping-threat | 전 변형 | 페르소나 [진행 방식] — 입금 후 | … 돈이 들어왔다고 확인하는 그 대답 안에서 누구에게도 알리지 말라는 말을 한 문장만 덧붙이고 … | P/kidnappingThreat.prompt.ts:38 | O1-physical(가족·주변 연락 회피) | 중간 | 없음 |
| kidnapping-threat | 전 변형 | 페르소나 [진행 방식] | 이 통화에는 입금을 보여 주는 화면이 없어 상대가 보냈다는 것을 증명할 방법이 없다. | P/kidnappingThreat.prompt.ts:37 | O5-mention(이체 화면 부재를 코드가 스스로 명시) | 낮음 | 없음 — 계좌 문자도 의도적으로 없음(P/inCallSms.ts:393-394 G306) |
| kidnapping-threat | 전 변형 | 수법 `즉시 송금 요구` | '지금 얼마 준비해서 불러주는 계좌로 바로 넣어요' … 계좌는 'OO은행 948-2716-5093-27' 같은 가상값으로만 부르고 | P/kidnappingThreat.prompt.ts:61 | O1-money | 높음 | 없음(음성 낭독) |
| kidnapping-threat | dxwu·k268·w7tb, 현역 | 수법 `금액 조정 재요구` | '그럼 지금 당장 되는 만큼만 먼저 넣어요' 처럼 금액을 낮춘 새 조건으로 다시 요구한다. | P/kidnappingThreat.prompt.ts:67 | O1-money | 높음 | 없음 |
| kidnapping-threat | dxwu·k268·w7tb, 현역 | 수법 `확인 차단` | 자녀에게 직접 전화해보겠다고 하면 '그러면 상황이 더 나빠질 수 있다'는 식으로 단호하게 막되 | P/kidnappingThreat.prompt.ts:55 | O1-physical(실제 가족 연락 회피) | 중간 | 없음 |
| kidnapping-threat | dxwu·k268·w7tb, 현역 | 수법 `고립 유도` | '지금부터 저랑만 통화하세요' 식으로 제3자·경찰 신고를 막으려 하되 | P/kidnappingThreat.prompt.ts:53 | 미분류 | — | 해당 없음 |
| kidnapping-threat | dxwu·k268·w7tb, 현역 | 수법 `신고 차단 지시` | '경찰이나 다른 데 연락하면 없던 일로 안 끝나요, 이 통화 끊지 말고 그대로 있어요' | P/kidnappingThreat.prompt.ts:68 | 미분류 | — | 해당 없음 |
| kidnapping-threat | fv-c5ih, 초급, 현역 | s1 | 자녀가 자기 쪽에 있다고 위협한다. | P/flowVariants.ts:1162 | 해당 없음 | — | — |
| kidnapping-threat | fv-c5ih, 초급, 현역 | s2 | 곧바로 송금을 요구한다. | P/flowVariants.ts:1162 | O1-money | 높음 | 없음 |
| kidnapping-threat | fv-dxwu, 중급, 현역 | 단계 없음(`current`) | (stages: [] — 원본 수법 전부) | P/flowVariants.ts:1176 | (위 수법 행 참조) | — | — |
| kidnapping-threat | fv-k268, 고급, 현역 | s1 | 자녀가 자기 쪽에 있다고 말하고, 아이가 울고 있다고 말로만 전한다. | P/flowVariants.ts:1191 | 해당 없음 | — | — |
| kidnapping-threat | fv-k268, 고급, 현역 | s2 | 상대가 먼저 말한 자녀 이름만 되받아 이미 다 알고 있는 척한다. | P/flowVariants.ts:1192 | 해당 없음 | — | — |
| kidnapping-threat | fv-k268, 고급, 현역 | s3 | 소액을 즉시 이체하라고 요구하고, 망설이면 금액을 조정해 다시 요구한다. | P/flowVariants.ts:1193 | O1-money | 높음 | 없음 |
| kidnapping-threat | fv-w7tb, 고급, 현역 | s1 | 자녀가 자기 물건을 망가뜨리고 욕을 해서 지금 붙잡고 있다고 말하고, 아이가 울고 있다고 말로만 전한다. | P/flowVariants.ts:1215 | 해당 없음 | — | — |
| kidnapping-threat | fv-w7tb, 고급, 현역 | s2 | 상대가 먼저 말한 자녀 이름만 되받아 이미 다 알고 있는 척한다. | P/flowVariants.ts:1216 | 해당 없음 | — | — |
| kidnapping-threat | fv-w7tb, 고급, 현역 | s3 | 큰돈이 아니라 수리비 정도만 지금 바로 보내면 아이를 보내 주겠다며 소액 즉시 이체를 요구하고 … | P/flowVariants.ts:1217 | O1-money | 높음 | 없음 |
| kidnapping-threat | (재생 안 됨) | deepvoiceLines line-2 | 울거나 소리 지르지 마세요. 그런다고 달라지는 거 없습니다. 신고할 생각도 하지 마세요. | C/kidnappingThreat.ts:15 | O5-mention(@deprecated) | 낮음 | — |
| family-accident-deepvoice | 전 변형(4dy4·krq3·66hh·h5sz) | 페르소나 [캐릭터] | 사고를 당했거나 곤란한 상황에 처해 다급하게 도움(주로 합의금 등 금전적 도움)을 요청하는 상황을 연기한다. | P/familyAccidentDeepvoice.prompt.ts:123 | O1-money | 높음 | 없음 |
| family-accident-deepvoice | 전 변형 | 수법 `합의금 송금 요구` | '합의 안 하면 일이 커진대, 지금 300만 원만 바로 보내줘, 계좌 불러줄게' … 'OO은행 948-2716-5093-27' 같은 가상값으로만 부른다. | P/familyAccidentDeepvoice.prompt.ts:149 | O1-money | 높음 | 없음(음성 낭독, 문자 카탈로그 없음) |
| family-accident-deepvoice | krq3·66hh·h5sz, 현역 | 수법 `확인 전화 차단 유도` | '아빠한테는 비밀로 해줘', '지금 끊으면 연락 안 될 수도 있어' 처럼 제3자 확인을 막으려 하되 | P/familyAccidentDeepvoice.prompt.ts:142 | O1-physical(실제 가족 연락 회피) | 중간 | 없음 |
| family-accident-deepvoice | krq3·66hh·h5sz, 현역 | 수법 `확인 차단 지시` | '지금 다른 데 전화하면 상황 더 꼬여, 나한테만 집중해줘' 처럼 가족·기관 재확인을 막는 지시를 명시적으로 내린다. | P/familyAccidentDeepvoice.prompt.ts:155 | O1-physical | 중간 | 없음 |
| family-accident-deepvoice | 66hh·h5sz, 현역 | 추가 수법 `채널 전환 유도` | '폰이 고장 나서 다른 번호로 걸었어, 원래 번호로는 연락이 안 돼' 처럼 … 원래 번호로 확인해 보지 못하게 한다. | P/flowVariants.ts:544-545 (참조 1271 · 1293) | O1-physical(실제 가족 번호 확인 회피) | 중간 | 없음 |
| family-accident-deepvoice | fv-4dy4, 초급, 현역 | s1 | 사고가 났다고 다급하게 알린다. | P/flowVariants.ts:1239 | 해당 없음 | — | — |
| family-accident-deepvoice | fv-4dy4, 초급, 현역 | s2 | 합의금이 급하다며 곧바로 송금을 부탁한다. | P/flowVariants.ts:1239 | O1-money | 높음 | 없음 |
| family-accident-deepvoice | fv-krq3, 중급, 현역 | 단계 없음(`current`) | (stages: [] — 원본 수법 전부) | P/flowVariants.ts:1253 | (위 수법 행 참조) | — | — |
| family-accident-deepvoice | fv-66hh, 고급, 현역 | s1 | 사고가 났다고 알리며 다른 번호로 연락한 이유를 댄다. | P/flowVariants.ts:1267 | 해당 없음 | — | — |
| family-accident-deepvoice | fv-66hh, 고급, 현역 | s2 | 원래 번호로는 연락이 안 된다며 확인을 막는다. | P/flowVariants.ts:1268 | O1-physical | 중간 | 없음 |
| family-accident-deepvoice | fv-66hh, 고급, 현역 | s3 | 합의금 송금을 요구한다. | P/flowVariants.ts:1269 | O1-money | 높음 | 없음 |
| family-accident-deepvoice | fv-h5sz, 고급, 현역 | s1 | 작은 사고를 쳤다며 다른 번호로 연락한 이유를 댄다. | P/flowVariants.ts:1288 | 해당 없음 | — | — |
| family-accident-deepvoice | fv-h5sz, 고급, 현역 | s2 | 원래 번호로는 연락이 안 된다며 확인을 막는다. | P/flowVariants.ts:1289 | O1-physical | 중간 | 없음 |
| family-accident-deepvoice | fv-h5sz, 고급, 현역 | s3 | 큰돈은 아니고 술자리에서 남의 물건을 깨서 지금 수리비만 물어 주면 된다며, 바로 보낼 수 있는 소액을 지금 당장 보내 달라고 하고 … | P/flowVariants.ts:1290 | O1-money | 높음 | 없음 |
| family-accident-deepvoice | fv-h5sz, 고급, 현역 | 추가 수법 `소액 즉시 송금 요구` | '큰돈 아니야, 수리비만 지금 물어 주면 끝나, 바로 보내 줄 수 있지?' … 예시 계좌만 부른다. | P/flowVariants.ts:1294 | O1-money | 높음 | 없음 |
| family-accident-deepvoice | (재생 안 됨) | deepvoiceLines line-3 | 아빠한테는 아직 말하지 말고, 지금 나랑 통화하면서 처리하자. 시간이 없어. | C/familyAccidentDeepvoice.ts:89 | O5-mention(@deprecated) | 낮음 | — |
| grandchild-impersonation | 전 변형(brcb·mabg·cx5y) | 페르소나 [말투/톤] | 상대가 확인하려 하면("영상통화 하자", "엄마한테 물어볼게") 폰 고장·시간 압박·부모에게 비밀 유지로 확인을 막는다. | P/grandchildImpersonation.prompt.ts:125 | O1-physical | 중간 | 없음 |
| grandchild-impersonation | 전 변형 | 페르소나 [캐릭터] | "폰이 고장 났다", "급하게 낼 돈이 있다"는 명목으로 다급하게 도움을 요청하는 상황을 연기한다. | P/grandchildImpersonation.prompt.ts:120 | O1-money | 높음 | 없음 |
| grandchild-impersonation | 전 변형 | 수법 `디지털 취약 악용` | '앱이 안 돼서 그러는데 할머니가 대신 좀 해주세요' 처럼 대신 처리를 부탁하되, 실제 앱 이름·링크·조작 순서는 … 제시하지 않는다. | P/grandchildImpersonation.prompt.ts:138 | O1-device(실제 앱으로 대리 처리) | 높음 | 없음 |
| grandchild-impersonation | 전 변형 | 수법 `송금 직접 요구` | '할머니, 지금 50만 원만 좀 보내주시면 돼요, 계좌 불러드릴게요' … 'OO은행 948-2716-5093-27' 같은 가상값으로만 부른다. | P/grandchildImpersonation.prompt.ts:140 | O1-money | 높음 | 없음 |
| grandchild-impersonation | mabg·cx5y, 현역 | 수법 `상품권 대체 요구` | '그럼 편의점 가서 문화상품권 사서 뒷면 번호만 사진 찍어 보내주세요' 처럼 더 쉬운 방법의 새 조건으로 다시 요구한다. | P/grandchildImpersonation.prompt.ts:141 | O1-money(상품권+PIN) + O1-physical(편의점 이동) + O1-device(사진 전송) | 높음 | 없음 |
| grandchild-impersonation | mabg·cx5y, 현역 | 수법 `확인 차단` | '폰이 고장 나서 영상통화가 안 돼요', '엄마 아빠한테는 비밀로 해주세요' | P/grandchildImpersonation.prompt.ts:137 | O1-physical | 중간 | 없음 |
| grandchild-impersonation | mabg·cx5y, 현역 | 수법 `비밀 유지 요구` | '엄마 아빠한테는 절대 말하지 마세요, 알면 진짜 큰일나요' 처럼 가족 확인을 막는 지시를 명시적으로 내린다. | P/grandchildImpersonation.prompt.ts:142 | O1-physical | 중간 | 없음 |
| grandchild-impersonation | cx5y, 현역 | 추가 수법 `채널 전환 유도` | '폰이 고장 나서 다른 번호로 걸었어, 원래 번호로는 연락이 안 돼' … 원래 번호로 확인해 보지 못하게 한다. | P/flowVariants.ts:544-545 (참조 1343) | O1-physical | 중간 | 없음 |
| grandchild-impersonation | fv-brcb, 초급, 현역 | s1 | 급한 사정이 생겼다고 알린다. | P/flowVariants.ts:1311 | 해당 없음 | — | — |
| grandchild-impersonation | fv-brcb, 초급, 현역 | s2 | 곧바로 송금을 부탁한다. | P/flowVariants.ts:1311 | O1-money | 높음 | 없음 |
| grandchild-impersonation | fv-mabg, 중급, 현역 | 단계 없음(`current`) | (stages: [] — 원본 수법 전부) | P/flowVariants.ts:1325 | (위 수법 행 참조) | — | — |
| grandchild-impersonation | fv-cx5y, 고급, 현역 | s1 | 폰이 고장 나 다른 번호로 걸었다고 한다. | P/flowVariants.ts:1339 | 해당 없음 | — | — |
| grandchild-impersonation | fv-cx5y, 고급, 현역 | s2 | 원래 번호로는 연락이 안 된다며 확인을 막는다. | P/flowVariants.ts:1340 | O1-physical | 중간 | 없음 |
| grandchild-impersonation | fv-cx5y, 고급, 현역 | s3 | 송금을 요구하고, 어려우면 상품권으로 바꿔 다시 요구한다. | P/flowVariants.ts:1341 | O1-money(상품권 포함) | 높음 | 없음 |
| grandchild-impersonation | (재생 안 됨) | deepvoiceLines line-2·3 | 급하게 낼 돈이 있는데 지금 앱이 안 돼서요. 할머니가 잠깐만 도와주시면 안 돼요? / 엄마 아빠한테는 아직 말하지 마세요. | C/grandchildImpersonation.ts:12-13 | O5-mention(@deprecated) | 낮음 | — |
| reputation-blackmail-scam | 전 변형(9nx7·kwph·egum) | 페르소나 [캐릭터] | … 수치심을 자극하고 조용히 처리해 주겠다며 입막음 대가 지급에 협조하도록 유도하는 상황을 연기한다. | P/reputationBlackmailScam.prompt.ts:19 | O1-money | 높음 | 없음 |
| reputation-blackmail-scam | 전 변형 | 수법 `입막음 송금 요구` | '조용히 정리하시려면 얼마를 오늘 안에 보내세요' … 계좌는 네가 불러 주지 말고 문자로 보낸 것을 확인하게 하고 | P/reputationBlackmailScam.prompt.ts:41 | O1-money | 높음 | 없음 — 계좌 문자 `blackmail-hush-account`만 |
| reputation-blackmail-scam | 전 변형 | 수법 `분할 재요구` | '그럼 오늘은 절반만, 나머지는 내일 넣으세요' 처럼 나눠 내는 새 조건으로 다시 요구한다. | P/reputationBlackmailScam.prompt.ts:42 | O1-money(다음 날 추가 이체 포함) | 높음 | 없음 |
| reputation-blackmail-scam | kwph·egum, 현역 | 수법 `확인 차단` | 가족이나 경찰에 확인하려 하면 '그러면 이미 유포된 것으로 처리될 수 있다' 식으로 단호하게 막되 | P/reputationBlackmailScam.prompt.ts:40 | O1-physical | 중간 | 없음 |
| reputation-blackmail-scam | kwph·egum, 현역 | 수법 `주변 확인 차단` | '가족이나 회사에 알리시면 그때는 저도 못 막습니다, 이 통화만 유지하세요' | P/reputationBlackmailScam.prompt.ts:43 | O1-physical | 중간 | 없음 |
| reputation-blackmail-scam | 전 변형 | 수법 `수치심 자극` | '가족분들이나 회사에 알려지면 곤란하다'처럼 명예 훼손 위협은 암시만 하고 | P/reputationBlackmailScam.prompt.ts:37 | O5-mention | 낮음 | — |
| reputation-blackmail-scam | 전 변형 | 통화 중 문자 `blackmail-hush-account` | 예금주: 김민재 OO은행 352-0812-4471-63 금액: 3,000,000원 오늘 안에 입금 확인되면 정리됩니다. | P/inCallSms.ts:311 | O1-money | 높음 | 문자만, 이체 화면 없음 |
| reputation-blackmail-scam | fv-9nx7(초급)·fv-kwph(중급)·fv-egum(고급), 현역 | 단계 없음(3벌 모두 `current`) | (stages: [] — 9nx7은 dropLabels 4개 제외) | P/flowVariants.ts:1559 · 1574 · 1587 | (위 수법 행 참조) | — | — |
| reputation-blackmail-scam | (재생 안 됨) | deepvoiceLines line-2 | 믿고 안 믿고는 그쪽 사정이고요. 가족분들이나 회사에 알려지길 원치 않으시면 지금 확인 절차에 협조하세요. | C/reputationBlackmailScam.ts:15 | O5-mention(@deprecated) | 낮음 | — |

### 미분류 (판정표에 행 추가 여부 확인 필요)
판정표의 O1-physical은 "실제 **가족** 연락·회피"만 명시한다. 아래는 **가족이 아닌 공식 창구·경찰** 재확인을 막는 지시라 어느 행에도 정확히 맞지 않는다.
| 시나리오 | 위치 | 근거 |
|---|---|---|
| loan-refinance-scam | 수법 `확인 차단`(다른 데 알아보지 말라) | P/loanScam.prompt.ts:66 |
| tax-refund-scam | 수법 `확인 차단`(다른 데 문의 말라) | P/taxRefundScam.prompt.ts:57 |
| courier-customs-scam | 수법 `확인 절차 차단`(대표번호 걸지 말라) | P/courierCustomsScam.prompt.ts:41 |
| kidnapping-threat | 수법 `고립 유도`(제3자·경찰 신고 막음) | P/kidnappingThreat.prompt.ts:53 |
| kidnapping-threat | 수법 `신고 차단 지시`(경찰 연락 막음) | P/kidnappingThreat.prompt.ts:68 |
제안 후보 행(결정 대기): "공식 창구·경찰 재확인 차단 지시(행동 요구 아님 — 하지 말라는 지시)" → O5-mention 또는 O1-physical 중 택1.

### 구조 관찰 (변형별)

| variantId | 시나리오 · 난이도 | 필수 문자 수(smsId · notBeforeUserTurns) | 선택 문자 | goalFollowUpUserTurns | legs | 입금 뒤 추가 요구 단계 |
|---|---|---|---|---|---|---|
| fv-bqr9 | loan · 초급 | 1 (`loan-account` · 3) | — | 없음 | 1 | 없음 |
| fv-avap | loan · 중급 | 1 (`loan-account` · 3) | — | 없음 | 1 | 단계엔 없음 — 수법 `수수료 낮춰 재요구`("나머지는 실행일에")가 분할 납부를 함축 |
| fv-6s5p | loan · 고급(챌린지 풀) | 1 (`loan-account` · 3) | `loan-apply-link` · 2 | 없음 | 1 | 위와 같음(수법 `수수료 낮춰 재요구`) |
| fv-m3hd | loan · 고급(자가 풀) | 2 (`loan-check-app-link` · 2 / `loan-account` · 3) | — | 없음 | 1 | 위와 같음 |
| fv-d8pw | loan · 고급 | 2 (`loan-check-app-link` · 2 · backstop 1 / `loan-account` · 4 · backstop 1) | — | 없음 | 1 | 없음(s4 "더 조르지 않고 마무리") |
| fv-r4hc | loan · 고급 | 1 (`loan-check-app-link` · 2 · backstop 1) | — | **6** | 1 | 없음 — 결말 자체가 말로 끝나는 현금 상환(이체 문자 0) |
| fv-vtq7 | tax · 초급 | 1 (`tax-refund-link` · 2) | — | 없음 | 1 | 없음 |
| fv-aqx2 | tax · 중급(current) | 1 (`tax-refund-link` · 2) | — | 없음 | 1 | 명시 단계 없음 |
| fv-uk7m | tax · 고급(current) | 1 (`tax-refund-link` · 2) | — | 없음 | 1 | 명시 단계 없음 |
| fv-uaee | courier · 초급 | 1 (`courier-customs-fee` · 3) | — | 없음 | 1 | 없음 |
| fv-62ak | courier · 중급 | 1 (`courier-customs-fee` · 3) | `courier-customs-link` · 2 | 없음 | 1 | 없음 |
| fv-xpvu | courier · 고급 | 1 (`courier-customs-fee` · 3) | `courier-customs-link` · 2 | 없음 | 1 | 없음 |
| fv-y3ks | courier · 고급 | 1 (`courier-safe-account` · 4 · backstop 1) | — | 없음 | 1 | 없음(s4 "더 조르지 않고 마무리") |
| fv-c5ih | kidnapping · 초급 | 0 | — | 없음 | 1 | **있음** — 페르소나 38행 "돈을 받은 뒤에는 … 추가 금액을 요구할 수는 있다"(수법 `금액 조정 재요구`는 keepLabels 밖이지만 페르소나는 실림) |
| fv-dxwu | kidnapping · 중급(current) | 0 | — | 없음 | 1 | **있음** — 페르소나 38행 + 수법 67행 |
| fv-k268 | kidnapping · 고급 | 0 | — | 없음 | 1 | **있음** — 페르소나 38행 + 수법 67행 |
| fv-w7tb | kidnapping · 고급 | 0 | — | 없음 | 1 | **있음** — 페르소나 38행 + 수법 67행 (단계 s3는 "한 번 더 요구한 뒤 더 조르지 않고 마무리") |
| fv-4dy4 | family · 초급 | 0 | — | 없음 | 1 | 없음 |
| fv-krq3 | family · 중급(current) | 0 | — | 없음 | 1 | 없음 |
| fv-66hh | family · 고급 | 0 | — | 없음 | 1 | 없음 |
| fv-h5sz | family · 고급 | 0 | — | 없음 | 1 | 없음 |
| fv-brcb | grandchild · 초급 | 0 | — | 없음 | 1 | 없음 |
| fv-mabg | grandchild · 중급(current) | 0 | — | 없음 | 1 | 없음(상품권은 이체 대체 — 입금 뒤 아님) |
| fv-cx5y | grandchild · 고급 | 0 | — | 없음 | 1 | 없음(상품권은 이체 대체) |
| fv-9nx7 | reputation · 초급(current) | 1 (`blackmail-hush-account` · 3) | — | 없음 | 1 | 수법 `분할 재요구`("나머지는 내일") — 다음 날 추가 이체 함축. 페르소나 32행은 입금 뒤 송금 안내 반복을 금지 |
| fv-kwph | reputation · 중급(current) | 1 (`blackmail-hush-account` · 3) | — | 없음 | 1 | 위와 같음 |
| fv-egum | reputation · 고급(current) | 1 (`blackmail-hush-account` · 3) | — | 없음 | 1 | 위와 같음 |

추가 관찰(사실 · 근거):
- 이 7개 시나리오 전체에 **이체·송금을 받는 서비스 안 화면이 0건**이다. 서비스 안 화면 4건은 신상정보 입력 2(`loan-refinance-apply` · `courier-customs-check`), 계좌 등록 1(`tax-refund-claim` — 돈을 받을 계좌, 보내는 화면 아님), 설치 1(`loan-check-app-install`)이다(P/mockScreens.ts:352 · 374 · 395 · 418).
- 문자 0건 시나리오(kidnapping · family · grandchild)는 계좌를 **음성으로 낭독**한다(각 prompt.ts의 'OO은행 948-2716-5093-27'). kidnapping은 계좌 문자를 의도적으로 두지 않았다(P/inCallSms.ts:393-394).
- 판정표 A(`NO_ACCOUNT_ROUTE_KEYS`, P/flowVariants.ts:1913)에 `cash-repay`가 있어 fv-r4hc는 계좌 요구 문장이 빠진다 — 대신 **현금 인출 + 대면 전달** 약속이 결말이다.
- tax 초급 fv-vtq7은 `keepLabels`로 ATM·앱 수법을 뺐지만 페르소나 27행의 "현금인출기 조작·앱 설치 유도"는 남는다(P/flowVariants.ts:1940-1955 — 페르소나는 변형이 바꾸지 않음).

---

<!-- inventory-C -->
### 인벤토리 C — 메신저 4종 · 서비스 밖 행동 유도 전수

기준: 워크트리 `elegant-cray-d1b0d2` (HEAD `b9d25cb2`) · 읽기 전용 조사 · 2026-10-31
경로 약어: `FV`=functions/src/scenarios/flowVariants.ts · `MS`=functions/src/scenarios/mockScreens.ts · `P-child`=functions/src/scenarios/messengerChildImpersonationKakao.prompt.ts · `P-friend`=…/messengerFriendLoanKakao.prompt.ts · `P-parcel`=…/messengerParcelSmishingSms.prompt.ts · `P-subsidy`=…/messengerSubsidySmishingSms.prompt.ts · `C-*`=src/content/scenarios/messenger*.ts · `MCR`=src/components/MessengerChatRoom.tsx · `RP/`=functions/src/roleplay/

변형 목록(은퇴 변형 없음 — `retired: true` 5건은 전부 다른 시나리오: FV:749 · 1672 · 1752 · 1777 · 1805):
- 자녀 사칭: `fv-34v5`(초급, FV:1355) · `fv-tpr3`(중급, FV:1371, 현행 = 원본 프롬프트) · `fv-tdgg`(고급, FV:1385)
- 지인 사칭: `fv-42wd` / `fv-fvsc` / `fv-bxvp`(초·중·고, FV:1411-1425, 전부 현행 = 원본 프롬프트)
- 택배: `fv-prr3`(초급, FV:1427) · `fv-tvq2`(중급, FV:1441) · `fv-g454`(고급 자가, FV:1462) · `fv-k7qm`(고급 2인 챌린지 수신자, FV:1498)
- 지원금: `fv-rizf`(초급, FV:1512) · `fv-afbr`(중급, FV:1527) · `fv-hu8w`(고급, FV:1541)
- `inCallSms.ts`에는 이 4개 시나리오 항목이 **0건**이다(grep 결과 없음). 통화로 넘어간 뒤 통화 중 문자 · 이체 화면은 없다.

### 표

| 시나리오 | 루트(variantId, 난이도, 은퇴여부) | 단계/위치 | 원문(한국어 그대로, 120자 이내) | 근거(파일:줄) | 유형 | 위험도 | 서비스 안 화면 존재 여부(screen/landing id) |
|---|---|---|---|---|---|---|---|
| 자녀 사칭 | 전 변형(fv-34v5 · fv-tpr3 · fv-tdgg, 현행) | weakenedTactics "송금 직접 요구" | 송금 직접 요구 — '엄마 지금 200만 원만 급하게 보내줘, 계좌 알려줄게' 처럼 금액과 이체를 구체적으로 요구한다. | P-child:95 | O1-money | 높음 | 없음 — 메신저용 이체 화면 0(MCR에 송금 · 이체 UI 없음, grep 0건). 가상 계좌 `OO은행 948-2716-5093-27`를 말로만 부름 |
| 자녀 사칭 | fv-34v5, 초급, 현행 | 단계 2 | 곧바로 송금을 부탁한다. | FV:1359 | O1-money | 높음 | 없음(말로만) |
| 자녀 사칭 | fv-34v5, 초급, 현행 | keepLabels | "다급함 조성", "가족애·죄책감 이용", "채널 전환 유도", "송금 직접 요구" | FV:1360 | O1-money | 높음 | 없음(송금) · 통화 전환은 인앱 통화 |
| 자녀 사칭 | fv-tdgg, 고급, 현행 | 단계 4 | 급한 돈 송금을 부탁한다. | FV:1393 | O1-money | 높음 | 없음(말로만) |
| 자녀 사칭 | fv-tdgg, 고급, 현행 | 단계 2 · extraTactics | 보험 처리 앱 설치 요구 — '액정 보험 처리하려면 이 앱 깔아야 한대, 여기서 받으면 돼' … `[[LINK:child-insurance-install]]` 마커만 사용 | FV:1391, FV:1397 | O4-in-service | 참고 | 있음 — `child-insurance-install`(app-install, MS:770-785 · 칩 라벨 RP/linkMarker.ts:35) |
| 자녀 사칭 | fv-tdgg, 고급, 현행 | 단계 3 · extraTactics | 신원정보 직접 요구 — '보험 접수에 엄마 신분증 사진이 필요하대, 찍어서 보내 줘' 처럼 신분증 사진을 직접 요구한다. | FV:1392, FV:1398 | unclassified | — (판정표 밖 · 아래 주석) | 부분 — 대화방 '+' 사진 보내기(MCR:1207-1222)가 있으나 **기기의 실제 사진을 고른다**(가짜 사진 0). 서버 업로드 0(RP/photoTurn.ts:6) |
| 자녀 사칭 | 전 변형(통화 단계) | 사진 턴 지시 | 네가 앞서 사진 · 신분증을 요구했다면 그 목적대로 다음 단계(보증금 · 송금 · 인증번호 등 시나리오의 다음 수법)로 이어 가고 | RP/photoTurn.ts:29 | O1-money | 높음 | 없음(사진 뒤 송금 요구로 이어짐 — 이체 화면 0) |
| 자녀 사칭 | fv-tdgg, 고급, 현행 | 사진 뒤 끊기 차단 | 흐름에 남은 단계("급한 돈 송금을 부탁한다")를 꺼내지 않고 채팅방을 나갔다 → P5 받아들이지 않는다 | RP/photoFollowUp.ts:1-12 | O1-money | 높음 | 없음 — 송금 단계까지 대화를 강제로 이어가게 하는 장치 |
| 자녀 사칭 | 전 변형 | 페르소나 [에스컬레이션] | 대화가 충분히 진행됐는데도 송금 협조를 안 할 때 … "그럼 내가 지금 전화할게" | P-child:71 | O4-in-service | 참고 | 있음 — 인앱 통화(escalation clone, C-child:28) |
| 자녀 사칭 | 전 변형 | weakenedTactics "채널 전환 유도" | 상대가 계속 의심하면 '그럼 내가 지금 전화할게' `[[SIGNAL:ESCALATE_VOICE]]`라며 통화로 넘어가려 한다 | P-child:93 | O4-in-service | 참고 | 있음 — 인앱 통화 |
| 자녀 사칭 | 전 변형 | weakenedTactics "확인 전화 차단 유도" | '폰이 안 돼서 그래', '지금은 통화가 안 돼' 처럼 초반에는 제3자 확인을 막으려 하되, 실제 전화번호·연락처는 제시하지 않는다. | P-child:92 | O5-mention | 낮음 | 해당 없음(참가자의 실제 자녀 연락을 막는 대사 — 유도 아님) |
| 자녀 사칭 | 전 변형 | weakenedTactics "원격 확인 차단" | '지금 폰 액정 깨져서 통화가 안 돼, 톡으로만 해줘' 처럼 목소리 확인을 막는 핑계를 대며 재차 송금을 요구한다. | P-child:96 | O1-money | 높음 | 없음(재차 송금 — 이체 화면 0) |
| 자녀 사칭 | 전 변형(통화 단계) | [통화로 넘어온 뒤] | 통화 중에 길게 확인받기 싫으면 "친구 폰이라 오래 못 써"처럼 … 다시 도움 요청으로 돌아간다. | P-child:55 | O1-money | 높음 | 통화는 인앱 · 도움 요청(송금)은 화면 0 |
| 자녀 사칭 | 전 변형 | 공개 메타 오프닝 | 엄마, 나야. 폰 액정 깨져서 친구 폰으로 톡 보내. | C-child:12 | O5-mention | 낮음 | 인앱 카톡형 대화방 |
| 자녀 사칭 | fv-tdgg, 고급 | 설치 랜딩 정답 행동 | ① 원래 알고 있는 자녀 번호로 직접 전화해 확인하기 ② 폰이 고장 났다고 해도 다른 가족에게 먼저 확인하기 | MS:784 | O5-mention | 낮음 | 교육 문구(실생활 권고 — 훈련 단계 아님). `child-insurance-install` 안 |
| 자녀 사칭 | fv-tdgg, 고급 | 설치 응낙 뒤 지시 | 메시지 대화로 다음 요구를 이어가라. 전화를 걸겠다거나 … 전화로 연락하겠다는 말은 하지 마라. | MS:185-189 | O4-in-service | 참고 | 응낙 = 인앱 버튼 "권한 허용하고 계속하기"(MS:781) |
| 자녀 사칭 | 전 변형 | 송금 응대 사후 손질 | 이체 캡처 보내줘서 고마워 … 참가자는 이체도 캡처도 하지 않았다 → 그 문장을 지운다 | RP/actionAcknowledgement.ts:3-9 | O5-mention | 낮음 | 해당 없음(거짓 확인 제거 장치). 참가자가 "보냈어"라고 말만 하면 송금한 것으로 침(RP/actionAcknowledgement.ts:25, 58-59) |
| 지인 사칭 | fv-42wd · fv-fvsc · fv-bxvp, 초·중·고, 현행 | weakenedTactics "송금 직접 요구" | '150만 원만 좀 보내줄 수 있어? 계좌 지금 보낼게' 처럼 금액과 이체를 구체적으로 요구한다. | P-friend:47 | O1-money | 높음 | 없음 — 이체 화면 0, 에스컬레이션 0(C-friend:2-4). 가상 계좌 말로만 |
| 지인 사칭 | 위 3변형 | weakenedTactics "부인 시 친분 호소" | 상대가 너를 짐작해 이름을 대면 그 사람인 척 받아 송금 부탁을 그대로 유지한다. | P-friend:55 | O1-money | 높음 | 없음(말로만) |
| 지인 사칭 | 위 3변형 | weakenedTactics "금액 낮춰 재요구" | '그럼 지금 되는 만큼만이라도 부탁할게' 처럼 금액을 낮춘 새 조건으로 다시 요구한다. | P-friend:56 | O1-money | 높음 | 없음(말로만) |
| 지인 사칭 | 위 3변형 | weakenedTactics "친분 이용" · "다급함 조성" · "사정 얼버무리기" | '오랜만이다', '너니까 부탁하는 거야' … '지금 급하게 처리할 일이 있다' | P-friend:40-42 | O5-mention | 낮음 | 인앱 대화방 |
| 지인 사칭 | 위 3변형 | 페르소나 [캐릭터] | 오랜만에 연락하는 척 친근하게 접근한 뒤, 미안해하며 급전을 부탁하는 상황을 연기한다. | P-friend:18 | O1-money | 높음 | 없음(급전 — 이체 화면 0) |
| 지인 사칭 | 위 3변형 | 페르소나 [말투/톤] 보이스톡 | 상대가 보이스톡을 걸었는데 네가 받지 않았다는 메시지가 대화에 있으면, 같은 핑계를 되풀이하지 말고 이어서 부탁한다. | P-friend:32 | O4-in-service | 참고 | 있음 — 인앱 보이스톡 발신(받지 않음 연출) |
| 지인 사칭 | 위 3변형 | 공개 메타 오프닝 | 야 오랜만이다ㅋㅋ 잘 지내지? 근데 미안한데 부탁이 있어서 톡 했어. | C-friend:10 | O5-mention | 낮음 | 인앱 카톡형 대화방 |
| 택배 | fv-prr3 · fv-tvq2 · fv-k7qm, 초·중·고(챌린지), 현행 | weakenedTactics "링크 클릭 유도" | '여기서 주소 확인해 주세요' 처럼 자연스러운 문장과 함께 `[[LINK:parcel-redelivery]]` 마커만 사용 | P-parcel:39 | O4-in-service | 참고 | 있음 — `parcel-redelivery`(credential-form: 성함 · 연락처 · 주소, MS:308-325) |
| 택배 | 위 3변형 | 공개 메타 오프닝 | [국제택배] 고객님 물품이 주소지 오류로 배송이 보류되었습니다. 아래에서 주소를 확인해 주세요. | C-parcel:11 | O4-in-service | 참고 | 있음 — `parcel-redelivery` |
| 택배 | 위 3변형 | weakenedTactics "명의 도용 암시" | '본인이 안 시키셨으면 명의 도용일 수도 있다'며 불안감을 조성해 링크 클릭을 유도한다. | P-parcel:40 | O4-in-service | 참고 | 있음 — `parcel-redelivery` |
| 택배 | fv-tvq2 · fv-k7qm(fv-prr3은 dropLabels FV:1432로 제외) | weakenedTactics "확인 절차 차단" | '고객센터 대표번호로 거시면 확인이 오래 걸려요' 처럼 … 실제 전화번호는 제시하지 않는다. | P-parcel:41 | O5-mention | 낮음 | 해당 없음(실제 번호 0 · 전화를 막는 대사) |
| 택배 | 위 3변형 | 입력 제출 뒤 먼저 보내는 메시지 | 캐릭터로서 받았다고 짧게 확인한 뒤 다음 요구로 이어가라. | RP/screenActionFollowUp.ts:66-67 | unclassified | — (다음 요구가 정의되지 않음 · 아래 주석) | 수법 목록에 링크 뒤 요구 없음(P-parcel:36-42) — 모델 재량(추정) |
| 택배 | fv-g454, 고급 자가, 현행 | 단계 2 · 설치 수법 | '재배송 접수는 배송 확인 앱을 설치하셔야 진행됩니다' … `[[LINK:parcel-install]]` 마커만 사용 | FV:1468, P-parcel:106-107, P-parcel:83-90 | O4-in-service | 참고 | 있음 — `parcel-install`(app-install, MS:330-346) |
| 택배 | fv-g454, 고급 자가, 현행 | 단계 3 · 에스컬레이션 | 설치를 마쳤거나 상대가 계속 의심하면 배송 상담원이 직접 전화하겠다며 통화로 넘어간다. | FV:1469, P-parcel:92-94 | O4-in-service | 참고 | 있음 — 인앱 통화(advancedEscalation generic, C-parcel:23) |
| 택배 | fv-g454, 고급 자가, 현행 | 단계 4(통화) | 통화에서는 상담원으로서 재배송 접수를 마무리하려면 앱에서 권한을 하나 더 허용해야 한다며 다시 요구한다. | FV:1470 | O1-device | 높음 | **없음** — 통화 중 두 번째 권한 허용 화면 0(inCallSms 항목 0 · 이 시나리오 카탈로그는 MS:307-347 두 건뿐). 말로만 응낙 |
| 택배 | fv-g454, 고급 자가 | 설치 랜딩 정답 행동 | ① 배송 상태는 주문한 판매처나 택배사 공식 경로에서 직접 조회하기 ② … 이미 알고 있는 번호로 직접 확인하기 | MS:345 | O5-mention | 낮음 | 교육 문구(실생활 권고) |
| 택배 | fv-prr3 · fv-tvq2 · fv-k7qm | 입력 랜딩 정답 행동 | ① 배송 상태는 주문한 판매처나 택배사 공식 경로에서 직접 조회하기 … ④ 112(경찰)·1332(금융감독원)에 신고하기 | MS:324 | O5-mention | 낮음 | 교육 문구 |
| 지원금 | fv-rizf · fv-afbr · fv-hu8w, 초·중·고, 현행 | weakenedTactics "앱 설치·권한 허용 유도" | '신청 접수는 확인 앱을 설치하셔야 진행됩니다' … `[[LINK:subsidy-install]]` 마커만 사용 | P-subsidy:64, P-subsidy:48-51 | O4-in-service | 참고 | 있음 — `subsidy-install`(app-install, MS:231-249) |
| 지원금 | 위 3변형 | 공개 메타 오프닝 | [지원금 안내] 고객님은 정부 지원금 대상자로 확인되었습니다. 아래에서 신청 여부를 확인해 주세요. | C-subsidy:10 | O4-in-service | 참고 | 있음 — `subsidy-install` |
| 지원금 | 위 3변형 | weakenedTactics "채널 전환 유도" | 상대가 계속 의심하거나 설치를 마치면 '상담원이 직접 전화드리겠다' `[[SIGNAL:ESCALATE_VOICE]]` | P-subsidy:65, P-subsidy:54-55 | O4-in-service | 참고 | 있음 — 인앱 통화(escalation generic, C-subsidy:22) |
| 지원금 | 위 3변형(통화 단계) | 설치 응낙 뒤 지시 | 이제 담당자가 전화로 이어서 안내하겠다고 말하라. | MS:159-160 | O4-in-service | 참고 | 있음 — 인앱 통화 |
| 지원금 | 위 3변형(통화 단계) | 통화 뒤 최종 요구 | (페르소나 · 수법에 통화 단계 최종 요구 문장 없음 — "계속 안내를 이어간다"뿐) | P-subsidy:36, P-subsidy:62-66 | unclassified | — (요구 미정의 · 아래 주석) | 통화 중 화면 0(inCallSms 항목 0) — 모델이 무엇을 요구할지 미정(추정) |
| 지원금 | fv-afbr · fv-hu8w(fv-rizf는 dropLabels FV:1517로 제외) | weakenedTactics "확인 절차 차단" | '센터에 직접 알아보시면 처리가 늦어진다'는 식으로 … 실제 기관명·전화번호는 제시하지 않는다. | P-subsidy:66 | O5-mention | 낮음 | 해당 없음 |
| 지원금 | 위 3변형 | weakenedTactics "이익 유혹" · "긴급성 조성" | '정부 지원금 대상자로 확인됐습니다' … '지금 신청 안 하시면 대상에서 제외될 수 있다' | P-subsidy:62-63 | O5-mention | 낮음 | 인앱 문자형 대화방 |
| 지원금 | 위 3변형 | 설치 랜딩 정답 행동 | ① 앱은 기관 공식 경로에서만 설치하기 ② … 이미 알고 있는 번호로 직접 확인하기 | MS:247 | O5-mention | 낮음 | 교육 문구 |
| 공통(메신저) | 전 변형 | 고급 L4 선행 요구 예시 | 선행 요구는 이 훈련이 이미 재현하는 것 중에서만 고른다 … 새로운 형태의 요구를 발명하지 않는다. | functions/src/roleplay/promptAssembly.ts:754 | O5-mention | 낮음 | 해당 없음(제약 문구) |

### unclassified 주석(판정표에 행 추가 여부 결정 필요)
1. **신분증 사진(fv-tdgg 단계 3)** — 사진은 서비스 안 대화방으로 보내고 서버에 올라가지 않지만(MCR:252-255 · RP/photoTurn.ts:6), 고르는 이미지가 **참가자 기기의 실제 사진**이다(MCR:1206 "기기 사진 고르기", MCR:1209-1210 `type="file" accept="image/*"`). 판정표 O4는 "가짜 이미지가 있는 인앱 사진 선택"을, O1-device는 "서비스 밖으로 실제 서류 보내기"를 요구해 어느 쪽에도 정확히 맞지 않는다. 실제 신분증 촬영 · 선택을 유도하는 점에서 위험 성격은 O1-device에 가깝다(추정 판단 — 행 추가 결정 필요).
2. **택배 입력 제출 뒤 "다음 요구"** — 초·중급 수법 목록에 링크 뒤 요구가 없어 모델이 무엇을 요구할지 정의되지 않았다. 실측 로그로 확인 필요.
3. **지원금 통화 단계 최종 요구** — 페르소나 · 수법에 통화 뒤 요구 문장이 없다. 실측 통화 로그로 확인 필요.

### 구조 관찰

| variantId | 난이도 | 결정적 행동이 일어나는 방식 | 근거 |
|---|---|---|---|
| fv-34v5 | 자녀 초급 | **말(송금)** — 이체 화면 없음. 의심 시 인앱 통화로 전이 | FV:1359-1368 · P-child:71-72, 95 |
| fv-tpr3 | 자녀 중급 | **말(송금)** — 원본 수법 그대로, 이체 화면 없음. 인앱 통화 전이 | FV:1371-1382 · P-child:89-97 |
| fv-tdgg | 자녀 고급 | ① **랜딩 응낙**(`child-insurance-install` "권한 허용하고 계속하기") ② **사진**(기기 실제 사진) ③ **말(송금)** | FV:1389-1398 · MS:770-785 · MCR:1207-1222 · RP/photoFollowUp.ts:1-12 |
| fv-42wd / fv-fvsc / fv-bxvp | 지인 초·중·고 | **말(송금)** — 이체 화면 · 통화 전이 없음(보이스톡은 받지 않는 연출) | FV:1411-1425 · P-friend:24, 32, 47 · C-friend:2-4 |
| fv-prr3 / fv-tvq2 / fv-k7qm | 택배 초·중·고(챌린지) | **랜딩 제출**(`parcel-redelivery` 성함 · 연락처 · 주소 — 입력값 서버 미전송) | P-parcel:39 · MS:308-325 · src/components/MessengerFakeLanding.tsx:4-7 |
| fv-g454 | 택배 고급 자가 | ① **랜딩 응낙**(`parcel-install`) → ② 인앱 통화 → ③ **말(추가 권한 허용 — 화면 없음)** | FV:1466-1492 · MS:330-346 |
| fv-rizf / fv-afbr / fv-hu8w | 지원금 초·중·고 | ① **랜딩 응낙**(`subsidy-install`) → ② 인앱 통화 → ③ 통화 뒤 요구 미정의(말) | P-subsidy:48-55 · MS:231-249 |

- **이체 화면 부재**: 메신저 4종 어디에도 송금 · 이체 모의 화면이 없다. 이체형 랜딩(`safe-account-transfer` 등)은 통화 중 문자 표면(in-call-sms) 전용이고(MS:285-287), 메신저 대화방(MCR)에는 송금 UI가 없다(grep 0건). ⇒ 자녀 · 지인의 결정적 순간은 전부 "보냈어"라는 말로만 일어난다(RP/actionAcknowledgement.ts:25가 그 말을 송금 이행으로 침).
- **사진 흐름은 가짜 이미지만 쓰지 않는다**: '+' 버튼이 기기 사진첩 · 카메라를 연다(MCR:1206-1222). 서버 업로드 · 저장 · 로그는 0이고(MCR:252-255 · RP/photoTurn.ts:4-8), 서버에는 `(사진 1장을 보냈다)` 문장만 간다(RP/photoTurn.ts:13). 제공되는 가짜 신분증 · 샘플 이미지는 없다(`src` 전체 grep — 샘플 이미지 자산 · 선택지 0건).
- **설치 화면은 전부 서비스 안 가짜 버튼**: 실제 OS 권한 API · 외부 이동 · 실존 앱명 없음(src/components/MessengerFakeLanding.tsx:19-24). 링크는 `[[LINK:id]]` 마커 → 인앱 칩으로만 변환(RP/linkMarker.ts:28-36, 61-90). 도달 불가 설치 마커는 기본 입력 랜딩으로 강등(RP/linkMarker.ts:54-58).
- **통화 전이는 인앱 통화**: 자녀(clone) · 지원금(generic) 세 난이도, 택배는 고급 자가만(functions/src/scenarios/escalation.ts:26-32, 45-53), 지인은 없음.

---

<!-- inventory-D -->
### inventory-D — 공통 블록 · 모의 화면 · 통화 중 문자 · 리포트 (서비스 밖 실제 행동 유도 점검)

> 범위: 시나리오 공통 표면만(시나리오별 `*.prompt.ts` · `flowVariants.ts` 변형 문면은 다른 인벤토리 담당).
> 기준 저장소: `C:\Projects\codegate\.claude\worktrees\elegant-cray-d1b0d2` (읽기 전용 · 줄 번호는 이 트리 실측).
> 경로 약어: `F/` = `functions/src/`, `S/` = `src/`.
> 분류는 지정 판정표 그대로 적용. "가드"는 금지 문장(실제 행동을 막는 쪽)이라 O5로 두고 비고에 표시했다.

### 유형별 건수

| 유형 | 건수 |
|---|---|
| O1-money | 19 |
| O1-device | 2 |
| O1-physical | 2 |
| O3-defense-advice | 34 |
| O4-in-service | 40 |
| O5-mention | 25 |
| unclassified | 0 |

### 표

| 표면(공통 블록/모의 화면/문자/리포트) | 적용 범위(어느 시나리오·난이도) | 원문(한국어 그대로, 120자 이내) | 근거(파일:줄) | 유형 | 위험도 | 비고 |
|---|---|---|---|---|---|---|
| 공통 블록 [진행 강제] | 전 시나리오 · 전 난이도(메신저 포함 — SCENARIO_PROGRESSION) | "예: 얼마를 어디로 이체하라, … 현금을 찾아 어디로 가라, 앱을 설치하라, 화면에 뜬 번호를 읽어 달라 등" | F/roleplay/promptAssembly.ts:322 | O1-physical | 중간 | "현금을 찾아 어디로 가라" = 은행·ATM 인출 + 이동. 인앱 표현 0(자산 보호 보관 신청서 폼 1건 제외). 모든 시나리오 요구 예시로 실림 |
| 공통 블록 [진행 강제] | 같은 줄 · 앱 설치 모의 화면이 없는 시나리오 전부 | "앱을 설치하라" (같은 예시 목록) | F/roleplay/promptAssembly.ts:322 | O1-device | 높음 | app-install 화면 보유는 지원금·택배(고급)·자녀 카톡(고급)·카드배송·카드사·대출(자가 고급 Q2)뿐 — 그 밖은 말로만 설치 요구 |
| 공통 블록 [진행 강제] | 전 시나리오 · 전 난이도 | "요구 조건을 낮춰 재제안하거나(전액이 어려우면 일부만, 이체가 어려우면 다른 방법으로)" | F/roleplay/promptAssembly.ts:325 | O1-money | 높음 | "다른 방법" = 현금·상품권·코인 등으로 모델이 확장할 여지. 인앱 대응 화면 없음 |
| 공통 블록 [진행 강제] | 전 시나리오 · 전 난이도 | "다음 단계 요구로 이어가 … 겪게 한다(추가 이체, 추가 정보, 비밀 유지 요구 등)" | F/roleplay/promptAssembly.ts:326 | O1-money | 높음 | 이체 화면은 문자 1건당 1회 — "추가 이체"는 화면 없이 말로 진행 |
| 공통 블록 문자 예외(선언 목적 조립) | transfer 문자가 있고 그 문자에 랜딩이 없는 세션(대출·협박 유포·택배 수수료/안전계좌·자산보호 공탁금) | "\"문자로 보낸 계좌로 보내 달라\"" | F/roleplay/promptAssembly.ts:184 | O1-money | 높음 | 링크 없는 계좌 문자 → 은행 앱·ATM에서 실제 송금하라는 요구로 읽힘. 링크 있는 경우만 :206 문면으로 교체됨 |
| 공통 블록 문자 예외(옛 템플릿) | 변형 ID 없는 옛 세션 · 문자 카탈로그 보유 시나리오 | "\"문자로 보낸 계좌로 보내 달라\", \"문자 속 링크를 눌러 달라\"고 요구해도 된다" | F/roleplay/promptAssembly.ts:168 | O1-money | 높음 | 위와 같은 문면의 무조건판 |
| 공통 블록 끊기 규칙(TOOL·SIGNAL) | 끊기 허용 세션(폴백 SIGNAL · end_call 선언 Live) 전 시나리오 | "대출처럼 아직 권하지 않은 다른 수단이 있으면 그것만 권하고" | F/roleplay/promptAssembly.ts:371 | O1-money | 높음 | 실제 대출 실행 유도를 공통 규칙이 허용·권장. 대출 실행 인앱 화면 0 |
| 공통 블록 LIVE_NO_IDLE_RULE | Gemini Live · 끊기 슬롯 NONE(= 현행 Live 전부, END_CALL_LIVE_AVAILABLE=false) | "남은 돈이나 다른 계좌·적금·대출 가능액 같은 추가 요구, 주변 사람이나 은행에 알리지 말라는 구체적인 지시" | F/roleplay/promptAssembly.ts:422 | O1-money | 높음 | 적금 해지·대출 실행·타 계좌 이체 — 인앱 화면 0. "은행에 알리지 말라"는 실제 은행 방문 전제 |
| 공통 블록 CLAIM_CONSISTENCY_RULE | 폴백·Live 전 시나리오 | "아직 계좌를 알려 주지 않았는데 상대가 보냈다고 하면 … 어디로 보냈는지 되묻거나 계좌부터 알려 준다" | F/roleplay/promptAssembly.ts:414 | O1-money | 높음 | 간접 — 계좌를 불러 주고 말로 송금하게 하는 흐름을 전제(이체 화면 없는 세션) |
| 공통 블록 고급 L4 선행 요구 예시 | 고급 · 문자 카탈로그 보유 · institution(대출·기관·카드·환급·택배·은행·카드배송·자산보호·검찰) | "본인확인 항목 확인, 안내 문자·링크 확인, 조회용 앱 설치 등" | F/roleplay/promptAssembly.ts:725-726 | O1-device | 높음 | 설치 화면 없는 기관·환급·택배·은행·자산보호·검찰 고급에서 "조회용 앱 설치"를 말로만 요구하게 됨 |
| 공통 블록 고급 기존 단계 예시 | 고급 · 문자 카탈로그 보유 | "안내 링크 확인, 앱 설치 등" | F/roleplay/promptAssembly.ts:738 | O5-mention | 낮음 | "이미 있는 단계면 새로 만들지 않는다"의 예시 — 요구 생성 아님 |
| 공통 블록 화면 밖 금지(기본) | 문자 카탈로그 없는 세션 · identityCheckAllowed 참/거짓 | "참가자가 지금 알고 있거나 스스로 정할 수 있는 것(이름·생년월일·계좌 비밀번호·직접 누르는 번호)을 요구한다" | F/roleplay/promptAssembly.ts:142 | O5-mention | 낮음 | 정보 요구(말로 답함) — 외부 행동 아님. :144는 "지금 손에 든 것" |
| 공통 블록 화면 밖 금지(기본, FALSE) | identityCheckAllowed=false 세션 | "(계좌 비밀번호, 직접 누르는 번호, 지금 손에 든 것)을 요구한다" | F/roleplay/promptAssembly.ts:144 | O5-mention | 낮음 | "지금 손에 든 것"은 실물(카드 등) 언급 — 이동 요구 아님 |
| 공통 블록 이체 링크 한정 | transfer 문자에 랜딩이 붙은 세션(기관·카드사·은행) | "그 문자 속 링크의 이체 화면에서 하게 하고, 은행 앱·창구·ATM에서 따로 보내라고 하지 않는다." | F/roleplay/promptAssembly.ts:207-208 | O4-in-service | 참고 | 서비스 안으로 끌어들이는 가드 — 재사용 패턴(다른 결말에도 "X는 앱 화면에서만" 문장 확장 가능) |
| 공통 블록 이체 링크 한정(보조) | 위 세션 중 link 목적 미선언 | "그 밖의 링크 문자(앱 설치 등)는 보낸 적이 없으니 보냈다고 말하지 않는다." | F/roleplay/promptAssembly.ts:211-212 | O4-in-service | 참고 | 가드 |
| 공통 블록 문자 방법(폴백) | 문자 카탈로그 보유 세션 · 폴백 | "문자는 네가 임의로 \"보냈다\"고 지어내지 않는다. … 구체적인 값을 네가 지어내 읽어 주지도 않는다" | F/roleplay/promptAssembly.ts:152 | O4-in-service | 참고 | 문자는 앱 화면에 실제 도착 |
| 공통 블록 문자 방법(Live 도구) | 문자 카탈로그 보유 세션 · Live | "이 통화에서 문자를 실제로 보내는 방법은 send_prepared_sms 도구를 부르는 것 하나뿐이다" | F/roleplay/promptAssembly.ts:166 | O4-in-service | 참고 | 재사용 메커니즘(모델 도구 → 서버 카탈로그 문자) |
| 공통 블록 끊기 경우 | 끊기 허용 세션 | "상대가 문자로 온 이체 화면에서 이체를 마쳤거나, 네가 요구한 정보(…)를 불러 주었다" | F/roleplay/promptAssembly.ts:373 | O4-in-service | 참고 | 목표 달성 정의가 인앱 화면 기준 |
| 공통 블록 확인 결과(NO_STALL) | 전 세션 | "입금·이체·조회·서류처럼 무언가를 확인하겠다고 말했으면 … 그럴듯한 확인 결과를 지어내 알려 준다" | F/roleplay/promptAssembly.ts:406 | O5-mention | 낮음 | 결과 연출 규칙 — 외부 행동 요구 아님 |
| 공통 블록 가상값 | 전 세션 | "요구하는 행위 자체는 그대로 하되, 실존 기관의 실제 계좌·실제 동작하는 앱/링크·실제 연락처만 쓰지 않는다" | F/roleplay/promptAssembly.ts:331 | O5-mention | 낮음 | 가드(페이로드 가상화). 단 "행위 자체는 그대로" = 외부 행동 요구를 막지는 않음 |
| 공통 블록 초급 | 초급 전 시나리오 | "가족·지인·공식 창구에 물어보겠다고 하면 그대로 하게 둔다" | F/roleplay/promptAssembly.ts:664 | O5-mention | 낮음 | 참가자의 실제 확인 행동을 허용(막지 않음) — 사기범이 시키는 행동 아님 |
| 공통 블록 고급 안전 | 고급 전 시나리오 | "실존 기관의 실제 계좌·실제 동작하는 앱/링크·실제 연락처 금지" | F/roleplay/promptAssembly.ts:758 | O5-mention | 낮음 | 가드 |
| 공통 블록 고급 L3 절차 | 고급 · l3Procedural | "실존 기관의 실제 절차·실제 창구 운영 방식·실제 신청 경로를 설명하지 않는다." | F/roleplay/promptAssembly.ts:805 | O5-mention | 낮음 | 가드 |
| 공통 블록 인물 카드(기관형) | 카드 대상 institution 시나리오 | "'사는 곳'은 … 만날 곳·찾아갈 곳·돈을 건넬 곳을 정하는 데 쓰지 않는다." | F/roleplay/promptAssembly.ts:852 | O5-mention | 낮음 | 가드(대면 접선 금지) |
| 공통 블록 인물 카드(협박형) | 협박 2종(카드 있을 때) | "만날 곳·찾아갈 곳·돈을 건넬 곳이나 구체적인 장소·주소를 정하는 데 쓰지 않는다." | F/roleplay/promptAssembly.ts:867 | O5-mention | 낮음 | 가드 |
| 공통 블록 계좌 없는 결말 | §132.19 판정표 A 대상 변형 | "이 통화의 결말은 계좌 이체가 아니다 — 계좌번호를 불러 주거나 … 이체 · 송금하라고 요구하지 않는다." | F/roleplay/promptAssembly.ts:1194-1195 | O5-mention | 낮음 | 가드 — 단 대체 결말(현금 전달 등)이 무엇인지는 변형 문면 몫(범위 밖) |
| 공통 블록 인물 카드 값 | 카드 대상(loan 행) | "저축은행 대출 이용 중" | F/scenarios/personaCardCatalog.ts:163 | O5-mention | 낮음 | 배경 정보 |
| 공통 블록 확인 창구 안내 | 확인 무력화 7종(기관·카드사·대출·환급·택배·은행·카드배송) | "참가자가 새로 전화를 걸게 하지 말고 네가 확인 부서로 호를 넘겨 주겠다고 하라" | F/scenarios/verifyIntercept.ts:110,120,130,140,150,168,182 | O4-in-service | 참고 | 실제 번호로 다시 걸기 → 인앱 호 전환으로 대체한 핵심 선례 |
| 공통 블록 확인 창구 번호 금지 | 위 7종 | "번호를 네가 지어내 읽어 주지 마라 — 안내 창구 이름만 말한다." | F/scenarios/verifyIntercept.ts:92-93 | O4-in-service | 참고 | 가드 |
| 공통 블록 확인 창구(프롬프트) | 위 7종 | "이 훈련에서 참가자는 번호를 안내받지 않는다. 네가 직접 그 부서로 통화를 넘겨 준다." | F/roleplay/promptAssembly.ts:586,588 | O4-in-service | 참고 | |
| 공통 블록 설치 응낙(메신저) | 지원금·택배 고급 | "참가자가 방금 안내대로 설치와 권한 허용을 마쳤다 … 이제 담당자가 전화로 이어서 안내하겠다고 말하라." | F/scenarios/mockScreens.ts:160 | O4-in-service | 참고 | 인앱 통화 전이로 이어짐 |
| 공통 블록 설치 응낙(통화 중) | 통화로 넘어온 뒤 · 통화 중 문자 설치(폴백) | "이미 통화 중이니 전화하겠다는 말 없이 이 통화에서 다음 안내를 바로 이어가라." | F/scenarios/mockScreens.ts:169 | O4-in-service | 참고 | |
| 공통 블록 설치 응낙(Live) | 카드배송·카드사·대출 자가 고급 | "참가자가 방금 문자 속 링크에서 안내대로 앱 설치와 권한 허용을 마쳤다." | F/scenarios/mockScreens.ts:177 | O4-in-service | 참고 | |
| 공통 블록 설치 응낙(통화 없음) | 자녀 카톡 고급(child-insurance-install) | "메시지 대화로 다음 요구를 이어가라. 전화를 걸겠다거나 … 연락하겠다는 말은 하지 마라." | F/scenarios/mockScreens.ts:186 | O4-in-service | 참고 | |
| 공통 블록 화면 제출 후속 | 메신저 링크 credential-form 제출 | "참가자가 방금 네가 보낸 링크 화면에서 입력을 마치고 제출했다." | F/roleplay/screenActionFollowUp.ts:67 | O4-in-service | 참고 | |
| 공통 블록 이체 화면 제출 | 이체형 랜딩 제출(기관·카드사·은행·검찰 지갑/사이트) | "앱 확인: 상대가 방금 문자 링크 화면에서 이체하기를 눌러 이체를 마쳤다." | F/inCallSms/confirmResult.ts:81 | O4-in-service | 참고 | |
| 공통 블록 문자 완료 주장 결과 | 필수 transfer·link 문자 도착 뒤 "했다" 발화(폴백) | "상대가 방금 문자 안내대로 마쳤다고 말했다. 이번 대답에서 입금 확인이 끝났다고 그럴듯하게 알려 주고" | F/inCallSms/confirmResult.ts:31-34,47 | O1-money | 높음 | transfer 문자에 랜딩이 없는 세션에서는 "송금"이 말로만(서비스 밖) 처리됨을 확정하는 문면 |
| 공통 블록 문자 완료 주장(Live) | 위와 같음 · Live | "상대가 이 문자 안내대로 마쳤다고 말하면, 그 말에 대답할 때 입금 확인이 끝났다고 그럴듯하게 알려 주고" | F/inCallSms/confirmResult.ts:95 | O1-money | 높음 | 같은 구조 |
| 공통 블록 문자 없는 송금 주장 | 문자 선언 0 변형(협박·납치·가족 사고 등) | "상대가 방금 돈을 보냈다고 말했다. 이번 대답에서 돈이 들어왔다고 그럴듯하게 알려 주고" | F/inCallSms/confirmResult.ts:66 | O1-money | 높음 | 송금 화면·계좌 문자 모두 없는 결말 — 송금이 전부 서비스 밖 가정 |
| 공통 블록 문자 없는 송금 마무리 | 위 · 요구 단계 다 채움 | "상대가 방금 돈을 보냈다고 말했고, 이 통화에서 받아 낼 돈은 다 받았다." | F/inCallSms/confirmResult.ts:64 | O1-money | 높음 | 같은 구조 |
| 공통 블록 인증번호 재요구 | 인증번호 문자 보유(기관·카드사) | "참가자 휴대전화에 인증번호 문자가 이미 도착해 있는데 아직 번호를 묻지 않았다." | F/roleplay/otpFollowUp.ts:22 | O4-in-service | 참고 | 인앱 문자함 |
| 공통 블록 인증번호 대조 | 인증번호 문자 보유 · 폴백/Live | "서버 확인 결과 — 상대가 방금 불러 준 번호는 문자 속 인증번호와 일치한다." | F/scenarios/inCallSms.ts:450-466 | O4-in-service | 참고 | |
| 공통 블록 보이스톡 발신/수신 | 메신저 → 통화 시나리오 | "이 통화는 참가자가 너에게 건 보이스톡이다 — 네가 전화한 것이 아니다." | F/roleplay/callCaller.ts:25,35,37 | O4-in-service | 참고 | 인앱 통화 표면 |
| 공통 블록 전이 뒤 통화 | 메신저 → 통화 전이 세션 | "이 대화는 이미 전화 통화로 넘어와 있다 — 지금 너는 상대와 통화하고 있다." | F/roleplay/escalatedCall.ts:53 | O4-in-service | 참고 | |
| 공통 블록 통화 중 카톡 | 통화 중 채팅 가능 세션 | "참가자가 같은 대화방으로 카톡을 보냈다. … 통화로 하던 요구를 카톡에서도 이어 간다." | F/roleplay/chatDuringCall.ts:70,74 | O4-in-service | 참고 | |
| 공통 블록 통화 종료 뒤 메시지 | 메신저 시나리오 통화 복귀 | "통화에서 멈춘 요청을 이어간다. 다시 전화하겠다는 말로 끝내지 않는다." | F/roleplay/callReturnLine.ts:40,49 | O5-mention | 낮음 | |
| 공통 블록 메신저 오프닝 | 메신저 시나리오 첫 메시지 | "먼저 신분(사칭 기관·관계)과 연락한 이유 … 를 1~2문장으로 밝혀" | F/roleplay/openingLine.ts:57 | O5-mention | 낮음 | |
| 공통 블록 끊기 안내 | 끊기 허용 세션 | "이번 통화에서 할 일은 모두 마쳤다. … end_call 도구를 불러 통화를 끝내라." | F/scammerHangup/guidance.ts:7-52 | O5-mention | 낮음 | 7개 상수 모두 외부 행동 0 |
| 공통 블록 문자 거절 지시 | 문자 카탈로그 보유 | "아직 그 안내를 보낼 단계가 아니다. 문자를 보냈다고 말하지 말고" | F/scenarios/inCallSms.ts:413-419 | O5-mention | 낮음 | |
| 문자 (계좌 · 랜딩 없음) | loan-refinance-scam 전 난이도(fv-bqr9 등 transfer 슬롯) | "[○○캐피탈] 저금리 전환 상환 전용 계좌 안내 … 금액: 1,850,000원 오늘 18시까지 입금해 주세요." | F/scenarios/inCallSms.ts:85 | O1-money | 높음 | 이체 화면 링크 없음 → 송금은 서비스 밖(말로만) |
| 문자 (계좌 · 랜딩 없음) 도착 지시 | 위 | "문자를 보냈다는 사실과 확인 요청만 하라." | F/scenarios/inCallSms.ts:87-88 | O1-money | 높음 | 같은 문자 |
| 문자 (계좌 · 랜딩 없음) | asset-protection-notice-call 고급 fv-p3jx | "[자산보호] 약식 처리 공탁금 안내 … 수사 종료 후 전액 반환됩니다." | F/scenarios/inCallSms.ts:159 | O1-money | 높음 | 도착 지시 :162 "그 계좌로 공탁금을 넣어 달라" |
| 문자 (계좌 · 랜딩 없음) | reputation-blackmail-scam 전 난이도 | "예금주: 김민재 OO은행 352-0812-4471-63 금액: 3,000,000원 오늘 안에 입금 확인되면 정리됩니다." | F/scenarios/inCallSms.ts:311 | O1-money | 높음 | 도착 지시 :316 "오늘 안에 넣으라" |
| 문자 (계좌 · 랜딩 없음) | courier-customs-scam(수수료 슬롯) | "[통관수수료] 납부 계좌 안내 … 금액: 78,000원" | F/scenarios/inCallSms.ts:359 | O1-money | 높음 | 도착 지시 :362 "오늘 안에 넣어 달라" |
| 문자 (계좌 · 랜딩 없음) | courier-customs-scam 고급 fv-y3ks | "[명의도용 피해조치] 국가 안전계좌 안내 … 수사 종료 시까지 보관 후 반환됩니다." | F/scenarios/inCallSms.ts:370 | O1-money | 높음 | 도착 지시 :373 "그 계좌로 옮겨 두라" |
| 문자 (지갑 · 랜딩 있음) | prosecution-cooperation-call 고급 fv-c8wq | "코인으로 바꾼 금액을 문자 속 링크 화면에서 보관 지갑으로 전송해 달라" | F/scenarios/inCallSms.ts:192 | O1-money | 높음 | 전송은 인앱(asset-check-wallet)이나 **코인 전환(거래소 가입·매수)** 단계는 화면 없음 → 서비스 밖 전제. fv-h3vn 사이트는 전환까지 인앱 |
| 문자 (링크 → 화면) | 대출 · 환급 · 택배 통관 · 기관 · 카드사 · 은행 · 카드배송 · 자산보호 · 검찰(case/site) | 예: "아래에서 안전계좌 이체를 진행해 주세요." · "아래에서 보안 점검 앱을 설치해 주세요." | F/scenarios/inCallSms.ts:94,109,127,145,171,201,229,260,274,289,332,347 | O4-in-service | 참고 | 전부 `.invalid` 가짜 주소 + 인앱 랜딩(fakeLandingId). 실 URL 필드 자체가 타입에 없음(:12-14) |
| 문자 (인증번호) | 기관 · 카드사 | "[본인확인] 인증번호 [048231] 타인에게 절대 알려주지 마세요." | F/scenarios/inCallSms.ts:216,246 | O4-in-service | 참고 | 인앱 문자함에서 읽음 |
| 문자 발신번호 | 문자 보유 10종 | "02-0785-6043" 등 국번 첫 자리 0 가상 번호 | F/scenarios/inCallSms.ts:65-76 | O5-mention | 낮음 | 실존 회피 규칙은 "추정"(:62 원문 주석) — 탭 동작 없음 |
| 모의 화면 subsidy-install | 지원금 문자 전 난이도 | "업무처리 확인 앱을 설치해야 진행됩니다" / CTA "권한 허용하고 계속하기" | F/scenarios/mockScreens.ts:236,244 | O4-in-service | 참고 | 가짜 권한 확인창(OS 권한 API 0) |
| 모의 화면 parcel-redelivery | 택배 문자 전 난이도 | "주소가 확인되지 않아 배송이 보류되었습니다" / "재배송 신청하기" | F/scenarios/mockScreens.ts:312,320 | O4-in-service | 참고 | |
| 모의 화면 parcel-install | 택배 문자 고급 | "배송 확인 앱을 설치해야 재배송이 접수됩니다" | F/scenarios/mockScreens.ts:334 | O4-in-service | 참고 | |
| 모의 화면 loan-refinance-apply | 대출(챌린지 고급 fv-6s5p 등 link 슬롯) | "전환 신청서 본인확인이 필요합니다" / "본인확인 완료하기" | F/scenarios/mockScreens.ts:355,364 | O4-in-service | 참고 | |
| 모의 화면 loan-check-app-install | 대출 자가 고급(Q2) | "심사용 보안 점검 앱을 설치해야 대출 심사가 진행됩니다" | F/scenarios/mockScreens.ts:377 | O4-in-service | 참고 | |
| 모의 화면 tax-refund-claim | 환급 | "환급금 받으실 계좌를 등록해 주세요" / "계좌 등록하기" | F/scenarios/mockScreens.ts:398,407 | O4-in-service | 참고 | |
| 모의 화면 courier-customs-check | 택배 통관 | "수취인 정보가 일치하지 않아 통관이 보류되었습니다" | F/scenarios/mockScreens.ts:421 | O4-in-service | 참고 | |
| 모의 화면 safe-account-transfer | 기관 사칭(transfer 링크 슬롯) | "안전계좌 이체가 아직 완료되지 않았습니다" / "안전계좌로 이체하기" | F/scenarios/mockScreens.ts:453,463 | O4-in-service | 참고 | |
| 모의 화면 card-relief-transfer | 카드사 | "피해금 이관 신청이 완료되지 않았습니다" / "피해금 이관하기" | F/scenarios/mockScreens.ts:481,491 | O4-in-service | 참고 | |
| 모의 화면 card-guard-app-install | 카드사 자가 고급(Q2) | "피해 차단용 보안 앱을 설치해야 보호 조치가 시작됩니다" | F/scenarios/mockScreens.ts:503 | O4-in-service | 참고 | |
| 모의 화면 card-delivery-app-install | 카드배송(고급 전용) | "보안 점검 앱을 설치해야 사고 접수가 이어집니다" | F/scenarios/mockScreens.ts:525 | O4-in-service | 참고 | |
| 모의 화면 asset-custody-apply 입력 칸 | asset-protection-notice-call(고급 전용) | 입력 칸 "보관 신청 금액" · "돈을 찾을 은행" · "찾는 방법(현금 또는 수표)" | F/scenarios/mockScreens.ts:555 · S/components/MessengerFakeLanding.tsx:417-419 | O1-physical | 중간 | 폼 제출은 인앱이나, 화면이 전제하는 **은행 창구 현금 인출 · 전달**은 인앱 표현 0. 도착 지시는 만날 장소 금지(inCallSms.ts:151) |
| 모의 화면 case-record-view | 검찰 협조(고급 전용) | "사건 기록 열람 전 본인 확인이 필요합니다" / "사건 기록 열람하기" + 가짜 열람본 | F/scenarios/mockScreens.ts:569,577,583-614 | O4-in-service | 참고 | |
| 모의 화면 case-record-view 열람본 고지 | 위 | "검수 절차는 담당 수사관이 별도로 안내합니다. 안내에 따르지 않으면 계좌가 동결될 수 있습니다." | F/scenarios/mockScreens.ts:607 | O5-mention | 낮음 | |
| 모의 화면 asset-check-wallet | 검찰 고급 fv-c8wq | "범죄수익 여부 검수가 끝날 때까지 코인으로 바꾼 자산을 보관 지갑에 맡겨 두셔야 합니다." | F/scenarios/mockScreens.ts:628 | O1-money | 높음 | 전송은 인앱, **코인 전환은 서비스 밖 전제**(화면 0) — 위 문자 행과 같은 결함의 화면 쪽 |
| 모의 화면 asset-check-site | 검찰 고급 fv-h3vn | "안전 자산(코인)으로 전환하기" → "오늘 전환할 금액" → "보관 지갑으로 이체하기" | F/scenarios/mockScreens.ts:646-683 | O4-in-service | 참고 | 전환 · 이체 전체가 인앱(여러 화면 사이트) — 재사용 모델 |
| 모의 화면 protect-account-transfer | 은행 사칭(확인 무력화 전용) | "보호계좌로 옮기기가 아직 처리되지 않았습니다" / "보호계좌로 옮기기" | F/scenarios/mockScreens.ts:717,727 | O4-in-service | 참고 | |
| 모의 화면 child-insurance-install | 자녀 카톡 고급 fv-tdgg | "휴대폰 보험 접수 앱을 설치해야 보험 처리가 됩니다" | F/scenarios/mockScreens.ts:773 | O4-in-service | 참고 | |
| 모의 화면 기본 폴백 | 카탈로그에 없는 landingId | "본인확인이 필요합니다" / "안전한 서비스 이용을 위해 아래 정보를 입력해 주세요." | S/components/MessengerFakeLanding.tsx:346-354 | O4-in-service | 참고 | |
| 모의 화면 가짜 주소창 | 전 랜딩 | `mockHost` = `*.invalid`(누를 수 없는 텍스트) | F/scenarios/mockScreens.ts:58-64 | O4-in-service | 참고 | 실 URL · 앱스토어 링크 0(S/components/MessengerFakeLanding.tsx:20 주석 · 렌더 grep 0건) |
| 문자함 오버레이 진입 | 통화 중 문자 전 시나리오 | "문자함을 엽니다. 통화는 계속됩니다." | S/components/InCallSmsOverlay.tsx:215 | O4-in-service | 참고 | 링크 탭 = 인앱 랜딩만 |
| 확인 창구 오버레이 | 확인 무력화 7종 | "확인 부서로 연결 요청" · "상대가 연결해 주겠다는 확인 창구" | S/components/VerifyCallOverlay.tsx:118,129 | O4-in-service | 참고 | tel: · 다이얼 0 |
| 모의 화면 대처(correctAction) subsidy-install | 지원금 | "① 앱은 기관 공식 경로에서만 설치하기 ② … 이미 알고 있는 번호로 직접 확인하기 … ④ 112·1332에 신고" | F/scenarios/mockScreens.ts:247 | O3-defense-advice | 참고 | 리포트 표시용 |
| 모의 화면 대처 parcel-redelivery | 택배 문자 | "배송 상태는 주문한 판매처나 택배사 공식 경로에서 직접 조회하기 … 112·1332에 신고" | F/scenarios/mockScreens.ts:324 | O3-defense-advice | 참고 | |
| 모의 화면 대처 parcel-install | 택배 고급 | "설치를 권유받으면 대화를 멈추고 이미 알고 있는 번호로 직접 확인하기" | F/scenarios/mockScreens.ts:345 | O3-defense-advice | 참고 | |
| 모의 화면 대처 loan-refinance-apply | 대출 | "대출 상담은 이미 알고 있는 금융회사 대표번호로 직접 걸어 확인하기" | F/scenarios/mockScreens.ts:368 | O3-defense-advice | 참고 | |
| 모의 화면 대처 loan-check-app-install | 대출 고급 | "이미 허용했다면 가족 휴대폰이나 집 전화로 경찰이나 금융감독원에 신고하기" | F/scenarios/mockScreens.ts:388 | O3-defense-advice | 참고 | |
| 모의 화면 대처 tax-refund-claim | 환급 | "환급 여부는 공식 기관 창구에 직접 문의해 확인하기" | F/scenarios/mockScreens.ts:411 | O3-defense-advice | 참고 | |
| 모의 화면 대처 courier-customs-check | 택배 통관 | "배송 상태는 주문한 판매처나 배송사 공식 경로에서 직접 조회하기" | F/scenarios/mockScreens.ts:434 | O3-defense-advice | 참고 | |
| 모의 화면 대처 safe-account-transfer | 기관 | "통화를 끊고 이미 알고 있는 은행 대표번호로 직접 확인하기 … 가까운 은행 창구에서 함께 확인하기" | F/scenarios/mockScreens.ts:467 | O3-defense-advice | 참고 | |
| 모의 화면 대처 card-relief-transfer | 카드사 | "통화를 끊고 카드 뒷면이나 명세서에 적힌 번호로 직접 확인하기" | F/scenarios/mockScreens.ts:495 | O3-defense-advice | 참고 | |
| 모의 화면 대처 card-guard-app-install | 카드사 고급 | "가족 휴대폰이나 집 전화로 경찰이나 금융감독원에 신고하기" | F/scenarios/mockScreens.ts:514 | O3-defense-advice | 참고 | |
| 모의 화면 대처 card-delivery-app-install | 카드배송 | "카드 뒷면이나 카드사 공식 경로에서 찾은 번호로 직접 확인하기" | F/scenarios/mockScreens.ts:536 | O3-defense-advice | 참고 | |
| 모의 화면 대처 asset-custody-apply | 자산보호 | "은행 창구에서 돈을 찾는 이유를 물으면 사실대로 말하고 도움을 청하기 ③ 이미 돈을 건넸다면 바로 경찰에 신고" | F/scenarios/mockScreens.ts:560 | O3-defense-advice | 참고 | |
| 모의 화면 대처 case-record-view | 검찰 | "혼자 있으라거나 알리지 말라고 하면 오히려 가족에게 바로 알리기" | F/scenarios/mockScreens.ts:617 | O3-defense-advice | 참고 | |
| 모의 화면 대처 asset-check-wallet | 검찰 고급 | "이미 보냈다면 112 · 1332에 바로 신고하고 이용한 거래소에도 알리기" | F/scenarios/mockScreens.ts:638 | O3-defense-advice | 참고 | "거래소" 언급 = 실제 코인 전환을 전제한 대처 |
| 모의 화면 대처 asset-check-site(단계별 3 + 최종) | 검찰 고급 fv-h3vn | "문자 속 사이트의 전환 · 이체 버튼을 누르지 않기 ③ 가족이나 가까운 은행 창구에서 함께 확인하기" | F/scenarios/mockScreens.ts:688,693,698,703 | O3-defense-advice | 참고 | |
| 모의 화면 대처 protect-account-transfer | 은행 | "통장·카드·공식 창구에서 직접 찾은 번호로 확인하기" | F/scenarios/mockScreens.ts:735 | O3-defense-advice | 참고 | |
| 모의 화면 대처 child-insurance-install | 자녀 카톡 고급 | "원래 알고 있는 자녀 번호로 직접 전화해 확인하기 … 공식 앱 마켓에서도 모르는 사람의 부탁으로 설치하지 않기" | F/scenarios/mockScreens.ts:784 | O3-defense-advice | 참고 | |
| 리포트 대처(수법별) 확인 | 전 시나리오 리포트 | "반드시 알고 있는 번호로 직접 전화해 사실을 확인하세요." | F/report/analyzeConversation.ts:971 | O3-defense-advice | 참고 | |
| 리포트 대처 송금·계좌 | 전 시나리오 | "전화를 끊은 뒤 112(경찰)나 가족에게 직접 확인하세요." | F/report/analyzeConversation.ts:975-976 | O3-defense-advice | 참고 | 메신저판 "대화를 멈춘 뒤" |
| 리포트 대처 다급 | 전 시나리오 | "일단 전화를 끊고 잠시 시간을 두어 사실관계를 확인하세요." | F/report/analyzeConversation.ts:980-981 | O3-defense-advice | 참고 | |
| 리포트 대처 가족 | 전 시나리오 | "실제 그 사람이 맞는지부터 다른 방법(직접 전화·영상통화)으로 확인하세요." | F/report/analyzeConversation.ts:984 | O3-defense-advice | 참고 | |
| 리포트 대처 기관 | 전 시나리오 | "공식 대표번호로 직접 걸어 확인하세요." | F/report/analyzeConversation.ts:988-989 | O3-defense-advice | 참고 | |
| 리포트 대처 기본 | 전 시나리오 | "전화를 끊고 알고 있는 번호로 직접 다시 연락해 사실을 확인하세요." | F/report/analyzeConversation.ts:992-993 | O3-defense-advice | 참고 | |
| 리포트 마무리 조언 | 전 시나리오(안 속음) | "오늘처럼 전화를 끊고 직접 확인하는 습관을 계속 유지하는 것이 중요합니다." | F/report/analyzeConversation.ts:1011-1012 | O3-defense-advice | 참고 | |
| 리포트 확인 무력화 대처 | 확인 무력화 7종 | "① 다른 기기(가족의 전화 등)로 걸어 확인하기 ② … 직접 걸기 ③ 가까운 창구에서 직접 확인하기 ④ 112·1332" | F/report/verifyTimeline.ts:52 | O3-defense-advice | 참고 | |
| 리포트 확인 무력화 사실 공개 | 위 | "참가자가 새로 전화를 건 것이 아니라 같은 통화가 그대로 이어졌고" | F/report/verifyTimeline.ts:190 | O5-mention | 낮음 | |
| 리포트 문자 링크 대처 | 통화 중 문자 링크 탭 | "문자 속 링크는 누르지 말고, 기관 공식 앱이나 알고 있는 대표번호로 직접 확인하세요." | F/report/smsTimeline.ts:105 | O3-defense-advice | 참고 | |
| 리포트 요약 다음 행동(폴백) | 전 리포트 | "대답하지 말고 끊은 뒤 내가 알고 있는 번호로 직접 확인하세요." | S/lib/report/reportSummaryCopy.ts:32 | O3-defense-advice | 참고 | |
| 리포트 실제 피해 시 1 | 전 리포트 | "바로 112에 전화하세요. 신고와 함께 돈을 보낸 계좌의 지급정지를 요청할 수 있습니다." | S/lib/report/reportSummaryCopy.ts:71 | O3-defense-advice | 참고 | 텍스트만(전화 걸기 컨트롤 0 — :66) |
| 리포트 실제 피해 시 2 | 전 리포트 | "돈을 보낸 은행의 고객센터에도 지급정지를 요청하세요." | S/lib/report/reportSummaryCopy.ts:72 | O3-defense-advice | 참고 | |
| 리포트 실제 피해 시 3 | 전 리포트 | "금융감독원 1332에서 피해 상담을 받을 수 있습니다." | S/lib/report/reportSummaryCopy.ts:73 | O3-defense-advice | 참고 | |
| 리포트 실제 피해 시 4 | 전 리포트 | "'개인정보노출자 사고예방시스템'(pd.fss.or.kr)에 등록하고, '명의도용 방지서비스'(msafer.or.kr)에서" | S/lib/report/reportSummaryCopy.ts:74 | O3-defense-advice | 참고 | **실제 사이트 주소 2건** — 링크 아님(텍스트). 의도 확인 필요 |
| 리포트 위험 신호 비밀 유지 | 해당 신호 감지 리포트 | "이런 요구를 받으면 바로 가족이나 은행에 알리세요." | S/lib/report/riskSignalCopy.ts:24 | O3-defense-advice | 참고 | |
| 리포트 위험 신호 거래 은행 | 해당 신호 | "모르는 전화에는 거래 은행도 말하지 마세요." | S/lib/report/riskSignalCopy.ts:29 | O3-defense-advice | 참고 | |
| 리포트 위험 신호 맞대응 | 해당 신호 | "맞대응하지 말고 끊은 뒤 알고 있는 번호로 직접 확인하세요." | S/lib/report/riskSignalCopy.ts:34 | O3-defense-advice | 참고 | |
| 리포트 단계 안내 | 단계 표기 | "이번 훈련은 문자 → 앱 설치 → 전화로 이어지는 수법이었습니다." | S/lib/report/stageNotice.ts:18,40 | O5-mention | 낮음 | |
| 공개 메타 미리보기(가족 딥보이스) | 시나리오 선택 화면 | "지금 병원인데... 합의금 때문에 급하게 전화했어." | F/scenarios/publicMeta.ts:78 | O5-mention | 낮음 | 미리보기 대사 — 돈 요구 배경 |
| 공개 메타 미리보기(대환대출) | 시나리오 선택 화면 | "기존 대출을 먼저 정리하셔야 저금리 전환이 됩니다." | F/scenarios/publicMeta.ts:111 | O5-mention | 낮음 | 실제 대출 상환 암시(배경) |
| 공개 메타 미리보기(손주) | 시나리오 선택 화면 | "급하게 낼 돈이 있는데 지금 앱이 안 돼서요." | F/scenarios/publicMeta.ts:141 | O5-mention | 낮음 | |
| 공개 메타 미리보기(은행 사칭) | 시나리오 선택 화면 | "그 사이에 출금이 나가지 않도록 저희가 붙잡아 두겠습니다." | F/scenarios/publicMeta.ts:277 | O5-mention | 낮음 | |
| 공개 메타 제목(협박) | 시나리오 선택 화면 | "불법업소 방문 사실 유포 협박" | F/scenarios/publicMeta.ts:194 | O5-mention | 낮음 | "방문" = 배경 설정 |

> 범위 내 확인했으나 해당 문면 0: `F/roleplay/l3Depth.ts`(표 키·주석만), `personaAuthority.ts`(분류표), `firstTurn.ts`, `F/scenarios/tacticFlavor.ts`, `axes.ts`, `escalation.ts`, `beginnerBriefing.ts`(오류 메시지만), `F/verifyIntercept/*`(문자열은 카탈로그 재사용), `S/lib/mockscreenrender/*`(테스트 하네스), `S/app/report/**`(서버 문면 렌더만 · `https?://`·`tel:`·앱스토어 grep 0건).

---

### 모의 화면 목록 (재사용 가능한 인앱 도구 상자)

종류(kind)는 2개뿐이다: `credential-form`(입력 폼 · 입력값 서버 미전송) · `app-install`(가짜 권한 허용 버튼 · OS 권한 API 0). 진입 표면(entrySurface)은 `messenger-link`(채팅 링크 칩) · `in-call-sms`(통화 중 문자 링크). 정의 `F/scenarios/mockScreens.ts:43-137`, 카탈로그 `:788-804`.

| landingId | 시나리오 · 난이도 | 진입 | 시뮬레이션 행동 | 화면 단계(입력 칸 / 버튼) | 근거 |
|---|---|---|---|---|---|
| subsidy-install | messenger-subsidy-smishing-sms · 전 난이도 | messenger-link | 앱 설치 · 권한 허용 | 1화면: 안내 3줄 → "권한 허용하고 계속하기" → 응낙 시 통화 전이 | mockScreens.ts:231-249 |
| parcel-redelivery | messenger-parcel-smishing-sms · 전 난이도 | messenger-link | 개인정보 입력(재배송) | 받는 분 성함 · 연락처 · 받으실 주소 → "재배송 신청하기" → "재배송이 접수되었습니다." | :307-325 |
| parcel-install | messenger-parcel-smishing-sms · 고급 | messenger-link | 앱 설치 · 권한 허용 | 1화면 → "권한 허용하고 계속하기" | :330-346 |
| loan-refinance-apply | loan-refinance-scam · link 슬롯 변형(챌린지 고급 fv-6s5p 등) | in-call-sms | 본인 확인(신청서) | 성함 · 생년월일 · 연락처 → "본인확인 완료하기" | :351-369 |
| loan-check-app-install | loan-refinance-scam · 자가 고급(Q2) | in-call-sms | 앱 설치 · 권한 허용 | 1화면 → "권한 허용하고 계속하기" | :373-389 |
| tax-refund-claim | tax-refund-scam | in-call-sms | 계좌 등록 | 예금주 · 은행 · 계좌번호 → "계좌 등록하기" | :394-412 |
| courier-customs-check | courier-customs-scam | in-call-sms | 본인 확인(수취인) | 수취인 성함 · 연락처 · 생년월일 → "수취인 정보 확인하기" | :417-435 |
| safe-account-transfer | institutional-impersonation | in-call-sms | 이체(안전계좌) | 안전계좌 번호(문자 계좌 미리 채움) · 이체 금액 → "안전계좌로 이체하기" | :449-468 |
| card-relief-transfer | card-company-impersonation | in-call-sms | 이체(피해금 이관) | 이관 전용 계좌번호 · 이관 금액 → "피해금 이관하기" | :477-496 |
| card-guard-app-install | card-company-impersonation · 자가 고급(Q2) | in-call-sms | 앱 설치 · 권한 허용 | 1화면 → "권한 허용하고 계속하기" | :499-515 |
| card-delivery-app-install | card-delivery-call · 고급 전용 | in-call-sms | 앱 설치 · 권한 허용 | 1화면 → "권한 허용하고 계속하기" | :521-537 |
| asset-custody-apply | asset-protection-notice-call · 고급 전용 | in-call-sms | 현금 인출 · 보관 신청(약속) | 보관 신청 금액 · 돈을 찾을 은행 · 찾는 방법(현금 또는 수표) → "보관 신청하기" | :544-561 |
| case-record-view | prosecution-cooperation-call · 고급 전용 | in-call-sms | 본인 확인 → 사건 기록 열람 | 성명 · 생년월일 · 휴대전화 번호 → "사건 기록 열람하기" → 입력값이 찍힌 가짜 열람본(recordDocument: 사건번호 · 결재란 · 고지 3줄) | :565-618 |
| asset-check-wallet | prosecution-cooperation-call · 고급 fv-c8wq | in-call-sms | 이체(코인 보관 지갑 전송) | 보관 지갑 번호 · 전송 금액 → "보관 지갑으로 전송하기" | :622-639 |
| asset-check-site | prosecution-cooperation-call · 고급 fv-h3vn | in-call-sms | 자산 검수 사이트(본인 확인 → 코인 전환 → 금액 → 지갑 이체) | ① 성명 · 생년월일 → "본인 확인하기" ② 검수 대상 자산 목록(예금 · 적금 · 대출 가능액) → "안전 자산(코인)으로 전환하기" ③ 전환 금액 → "다음" ④ 지갑 번호 표시 → "보관 지갑으로 이체하기". 단계별 기록 이벤트 `landing_identity/converted/amount` + `landing_submitted`, 단계별 리포트 문면(progressMoments) | :645-704 · 단계 상수 :143 |
| protect-account-transfer | bank-security-verify-scam | in-call-sms | 이체(보호계좌) | 보호계좌 번호 · 옮길 금액 → "보호계좌로 옮기기" | :713-736 |
| child-insurance-install | messenger-child-impersonation-kakao · 고급 fv-tdgg | messenger-link | 앱 설치 · 권한 허용(통화 없이 메시지로 계속) | 1화면 → "권한 허용하고 계속하기" | :768-786 |
| (기본 폴백) | 카탈로그 밖 landingId | 양쪽 | 본인 확인 | 이름 · 연락처 → "확인" | S/components/MessengerFakeLanding.tsx:346-354 |

재사용 관련 부속 장치:
- 도달 게이트 `isMockScreenReachable`(세션 변형 × 난이도) `mockScreens.ts:875-888` · 통화 중 설치 허용목록 `IN_CALL_INSTALL_SCENARIOS` `:812-816`.
- 화면 이벤트 기록 콜러블 `recordMockScreenEvent` `F/mockScreens/index.ts:78` → 리포트 "속은 순간" 승격(`momentTactic`/`correctAction`).
- 화면 행동 후 사기범 후속 발화: 메신저 `requestScreenActionFollowUp` `F/roleplay/screenActionFollowUp.ts:103`, 통화 이체 제출 `LANDING_SUBMITTED_INSTRUCTION` `F/inCallSms/confirmResult.ts:80-81`, 설치 응낙 `installConsentInstructionFor` `mockScreens.ts:210-226`.
- 클라 렌더 정본: `S/components/MessengerFakeLanding.tsx`(서버 카탈로그와 글자 단위 대조 테스트) · 여러 화면 흐름 `STEP_FLOW_COPY` 약 :556-582 · 열람본 `RECORD_DOCUMENT_COPY` 약 :611-640.
- 결함 메모(위 표 O1): **코인 전환·현금 인출·대출 실행·적금 해지·말로 하는 송금**에 대응하는 인앱 화면이 없다. `asset-check-site`의 "버튼 하나가 전환을 대신한다" 패턴(:640-644 주석)이 이 빈칸을 메우는 가장 가까운 선례다.

---

### 통화 leg 교대 · 확인 가로채기 구조

### A. 확인 가로채기(verify intercept) — **현재 실제로 동작하는 유일한 통화 중 화자 교대**
1. 카탈로그: `F/scenarios/verifyIntercept.ts:39-74`(타입: offerId · deskLabel · reconnectedCallerLabel · availableAfterScammerTurns · announceInstruction · reconnectInstruction · transferStateLine), 7종 등록 `:211-219`. 번호 필드·url·tel 필드가 타입에 없음(`:18-21`).
2. 오퍼(예고): 클라가 사기범 턴을 세어 `deliverVerifyOffer` 호출(`S/app/session/play/page.tsx:1313`) → 서버 `F/verifyIntercept/index.ts:178-292`. 단계 `stage: announce`(지시만, 문서 0) / `commit`(예고 턴 뒤 문서 생성) 판정표 `F/verifyIntercept/buildDoc.ts:98-120`. Live에서는 모델 도구 `offer_verification_desk`(`F/realtime/liveTools.ts:31`)가 트리거, 하한 재검증 `:241-260`.
3. 호 전환: 클라 자동 전환 `handlePlaceVerifyCall`(`page.tsx:2286-2335`) — "연결 중…" 고정 연출 + `deliverVerifyReconnect`(`F/verifyIntercept/index.ts:294-344`)가 `placedAt` · `reconnectAnchorScammerTurn` · `reconnectedCallerLabel` 기록(멱등 `:330-336`) 후 `reconnectInstruction` · `transferStateLine` 반환.
4. 화자 교대: Live는 `enqueueTurnInstruction(result.reconnectInstruction, "verify", { speakerSwitch: true })`(`page.tsx:2329`) → `relayGreeting` 텍스트 턴(`S/lib/realtime/clientTurnQueue.ts:15-16` · `S/lib/realtime/contextInjection.ts:21`). 폴백은 서버가 다음 턴에 실음(`F/verifyIntercept/fallbackTurn.ts:41-60` `verify_reconnect`). 이후 턴마다 `transferStateLine` 재주입(`verifyIntercept.ts:62-75`).
5. 화면: 발신자 라벨이 `reconnectedCallerLabel`로 바뀜(`page.tsx:2571-2578`) · 오버레이 `S/components/VerifyCallOverlay.tsx`(tel:/다이얼 0).
6. 프롬프트 측: `[확인 안내]` 블록 `F/roleplay/promptAssembly.ts:590-596`(앞 담당자는 빠진 사람 · 번호 미안내) · 목소리 유지 `:95`.
7. 끊기 연동: 전환 전 끊기 금지 `HANGUP_RULE_TOOL_VERIFY_SUFFIX` `promptAssembly.ts:388` · `SCAMMER_HANGUP_BLOCKED_TRANSFER_GUIDANCE` `F/scammerHangup/guidance.ts:15-16` · 도달 판정 `F/scammerHangup/transferReach.ts`.

### B. 다중 leg(릴레이) — **데이터만 있고 런타임은 꺼져 있음**
- 타입 `FlowVariantLeg { callerLabel, personaPrompt?, speakerGender, minUserTurns, maxUserTurns }` `F/scenarios/flowVariants.ts:75-85`, 변형 필드 `legs` `:101`.
- 스위치 `RELAY_RUNTIME_AVAILABLE = false` `flowVariants.ts:140-141` — "S7 구현 전에는 legs ≥ 2 변형도 한 화자로 진행".
- 2-leg 데이터 예: fv-akj5 카드사 고급(카드사 상담원 → 금융감독원 직원) `:609-612` · fv-c5fj 기관 고급(검사 → 금융감독원 직원) `:712-715` · fv-w3dq 카드(카드 배송 안내[personaPrompt] → 금융감독원 직원) `:878-887`. 그 외는 `ONE_LEG` `:278-280`.
- 소비 지점(전부 현재 `undefined`): `resolveHangupRelay` `F/scammerHangup/relayContext.ts:15-28` → `F/realtime/index.ts:220` · `F/roleplay/index.ts:436` · `F/roleplay/chatDuringCall.ts:149` · `isNonLastRelayLeg` `F/realtime/liveTools.ts:103-109`. 세션 필드 `relay.legIndex`(쓰는 곳 `startRelayLeg` = 미구현 S7). 음성 성별 `F/realtime/scenarioVoice.ts:100`(legs[0]만).
- 클라 큐는 이미 `relayGreeting`을 "S7 릴레이 leg" 용도로 예약(`clientTurnQueue.ts:15`).

### C. 채널 전이 · 인앱 통화 표면 (새 인앱 통화 추가 시 함께 쓰는 장치)
- 메신저 → 통화 전이 `transitionChannel` `F/session/channelTransition.ts:38-60`(호출: `F/roleplay/index.ts:1107` `[[SIGNAL:ESCALATE_VOICE]]` · `screenActionFollowUp.ts:200` 설치 응낙 뒤). 신호 파서 `F/roleplay/escalationSignal.ts:8,44`. 공개 메타 술어 `F/scenarios/escalation.ts:19-31`.
- 보이스톡(참가자 발신/사기범 발신) 문면 `F/roleplay/callCaller.ts:25-49` · 통화 중 카톡 `chatDuringCall.ts:70-74` · 통화 뒤 메시지 복귀 `callReturnLine.ts:40-49`.
- 통화 중 문자 → 인앱 랜딩: `deliverInCallSms` `F/inCallSms/index.ts:130` · 발송 게이트 `F/inCallSms/smsGate.ts:103-226` · Live 도구 `send_prepared_sms` `liveTools.ts:26`.

### 새 인앱 통화(예: 대출 상담원 통화) 재사용 경로 요약
- **가장 짧은 경로 = A(확인 가로채기) 복제**: 카탈로그 항목 1건(새 offerId · deskLabel=예 "○○저축은행 대출상담" · reconnectInstruction=대출 상담원 페르소나) + 클라 자동 전환 · `speakerSwitch` 큐 재사용. 단 현재 A는 시나리오당 1건(`VERIFY_INTERCEPT: Record<string, Item>`)이고 "확인 시도"에 묶인 게이트(`availableAfterScammerTurns` · verifyIntent)라 일반 leg 교대로 쓰려면 키 구조 확장이 필요(추정 — 확인 방법: `verifyIntercept.ts:211` 타입과 `page.tsx` 오퍼 게이트 조건 읽기).
- **정식 경로 = B(S7 릴레이) 구현**: `legs` 데이터 · `relayGreeting` 큐 · 끊기 relay 판정이 이미 자리를 잡아 두었고 빠진 것은 `startRelayLeg`(세션 `relay.legIndex` 쓰기) · leg별 personaPrompt 주입 · 교대 트리거(min/maxUserTurns) · 화면 발신자 라벨 전환 · 목소리 교체뿐이다.

---

## 부록 E — 현행 루트 63개 구조 표 (빌드 산출물 `functions/lib`에서 생성 · 2026-10-31)

| 시나리오 | 난이도 | 루트 | 채널 | 단계 수 | 문자(목적@하한) | 화자 수 | 조기 종료 가드 | 필수 문자 | 결정 순간 |
|---|---|---|---|---|---|---|---|---|---|
| institutional-impersonation | beginner | fv-5cn4 | voice+sms | 3 | transfer@3 | 1 | 없음 | 필수 1통 | undefined |
| institutional-impersonation | intermediate | fv-hktx | voice+sms | 3 | identity@2(선택), transfer@3 | 1 | 없음 | 필수 1통 | undefined |
| institutional-impersonation | advanced | fv-c5fj | voice+sms | 6 | identity@5, transfer@6 | 2 | 4-b(followUp 3) | 필수 2통 | 문자 링크로 연 안전계좌 이체 화면에서 금액을 넣고 이체하기를 누르는 순간 |
| institutional-impersonation | advanced | fv-q7cn | voice+sms | 5 | identity@5 | 1 | 4-b(followUp 4) | 필수 1통 | 예금을 현금이나 수표로 찾아 직원에게 맡기겠다고 약속하는 순간 |
| institutional-impersonation | advanced | fv-g2ld | voice+sms | 5 | identity@5 | 1 | 4-b(followUp 4) | 필수 1통 | 예금을 찾아 금을 사서 직원에게 제출하겠다고 약속하는 순간 |
| card-company-impersonation | beginner | fv-aqp6 | voice | 2 | - | 1 | 없음 | 0 | undefined |
| card-company-impersonation | intermediate | fv-35f2 | voice+sms | 3 | identity@2(선택), transfer@3 | 1 | 없음 | 필수 1통 | undefined |
| card-company-impersonation | advanced | fv-akj5 | voice | 5 | - | 2 | 4(verify) | 0 | 보안 점검 앱 설치 또는 피해금 이관에 동의하는 순간 |
| card-company-impersonation | advanced | fv-x7ue | voice+sms | 5 | link@2 | 2 | 4(verify) | 필수 1통 | 보안 점검 앱 설치 또는 피해금 이관에 동의하는 순간 |
| card-company-impersonation | advanced | fv-w3dq | voice+sms | 5 | link@2 | 2 | 4(verify) | 필수 1통 | 보안 점검 앱 설치 또는 자산 보호 이체에 동의하는 순간 |
| loan-refinance-scam | beginner | fv-bqr9 | voice+sms | 2 | transfer@3 | 1 | 없음 | 필수 1통 | undefined |
| loan-refinance-scam | intermediate | fv-avap | voice+sms | 3 | transfer@3 | 1 | 없음 | 필수 1통 | undefined |
| loan-refinance-scam | advanced | fv-6s5p | voice+sms | 4 | link@2(선택), transfer@3 | 1 | 4(verify) | 필수 1통 | undefined |
| loan-refinance-scam | advanced | fv-m3hd | voice+sms | 4 | link@2, transfer@3 | 1 | 4(verify) | 필수 2통 | undefined |
| loan-refinance-scam | advanced | fv-d8pw | voice+sms | 4 | link@2, transfer@4 | 1 | 4(verify) | 필수 2통 | 문자로 받은 계좌에 예치금을 넣겠다고 하는 순간 |
| loan-refinance-scam | advanced | fv-r4hc | voice+sms | 4 | link@2 | 1 | 4-b(followUp 6) | 필수 1통 | 기존 대출을 현금으로 찾아 직원에게 상환하겠다고 약속하는 순간 |
| tax-refund-scam | beginner | fv-vtq7 | voice+sms | 2 | link@2 | 1 | 없음 | 필수 1통 | undefined |
| tax-refund-scam | intermediate | fv-aqx2 | voice+sms | 0 | link@2 | 1 | 없음 | 필수 1통 | undefined |
| tax-refund-scam | advanced | fv-uk7m | voice+sms | 0 | link@2 | 1 | 4(verify) | 필수 1통 | undefined |
| courier-customs-scam | beginner | fv-uaee | voice+sms | 2 | transfer@3 | 1 | 없음 | 필수 1통 | undefined |
| courier-customs-scam | intermediate | fv-62ak | voice+sms | 3 | link@2(선택), transfer@3 | 1 | 없음 | 필수 1통 | undefined |
| courier-customs-scam | advanced | fv-xpvu | voice+sms | 4 | link@2(선택), transfer@3 | 1 | 4(verify) | 필수 1통 | undefined |
| courier-customs-scam | advanced | fv-y3ks | voice+sms | 4 | transfer@4 | 1 | 4(verify) | 필수 1통 | 문자로 받은 국가 안전계좌로 자산을 옮기겠다고 하는 순간 |
| bank-security-verify-scam | beginner | fv-xuvu | voice+sms | 2 | transfer@3 | 1 | 없음 | 필수 1통 | undefined |
| bank-security-verify-scam | intermediate | fv-mhnv | voice+sms | 0 | transfer@3 | 1 | 없음 | 필수 1통 | undefined |
| bank-security-verify-scam | advanced | fv-62q8 | voice+sms | 0 | transfer@3 | 1 | 4(verify) | 필수 1통 | undefined |
| kidnapping-threat | beginner | fv-c5ih | voice | 2 | - | 1 | 없음 | 0 | undefined |
| kidnapping-threat | intermediate | fv-dxwu | voice | 0 | - | 1 | 없음 | 0 | undefined |
| kidnapping-threat | advanced | fv-k268 | voice | 3 | - | 1 | 없음 | 0 | undefined |
| kidnapping-threat | advanced | fv-w7tb | voice | 3 | - | 1 | 없음 | 0 | undefined |
| family-accident-deepvoice | beginner | fv-4dy4 | voice | 2 | - | 1 | 없음 | 0 | undefined |
| family-accident-deepvoice | intermediate | fv-krq3 | voice | 0 | - | 1 | 없음 | 0 | undefined |
| family-accident-deepvoice | advanced | fv-66hh | voice | 3 | - | 1 | 없음 | 0 | undefined |
| family-accident-deepvoice | advanced | fv-h5sz | voice | 3 | - | 1 | 없음 | 0 | undefined |
| grandchild-impersonation | beginner | fv-brcb | voice | 2 | - | 1 | 없음 | 0 | undefined |
| grandchild-impersonation | intermediate | fv-mabg | voice | 0 | - | 1 | 없음 | 0 | undefined |
| grandchild-impersonation | advanced | fv-cx5y | voice | 3 | - | 1 | 없음 | 0 | undefined |
| messenger-child-impersonation-kakao | beginner | fv-34v5 | messenger | 2 | - | 1 | 없음 | 0 | undefined |
| messenger-child-impersonation-kakao | intermediate | fv-tpr3 | messenger | 0 | - | 1 | 없음 | 0 | undefined |
| messenger-child-impersonation-kakao | advanced | fv-tdgg | messenger | 4 | - | 1 | 없음 | 0 | undefined |
| messenger-friend-loan-kakao | beginner | fv-42wd | messenger | 0 | - | 1 | 없음 | 0 | undefined |
| messenger-friend-loan-kakao | intermediate | fv-fvsc | messenger | 0 | - | 1 | 없음 | 0 | undefined |
| messenger-friend-loan-kakao | advanced | fv-bxvp | messenger | 0 | - | 1 | 없음 | 0 | undefined |
| messenger-parcel-smishing-sms | beginner | fv-prr3 | messenger | 0 | - | 1 | 없음 | 0 | undefined |
| messenger-parcel-smishing-sms | intermediate | fv-tvq2 | messenger | 0 | - | 1 | 없음 | 0 | undefined |
| messenger-parcel-smishing-sms | advanced | fv-g454 | messenger+voice | 4 | - | 1 | 없음 | 0 | undefined |
| messenger-parcel-smishing-sms | advanced | fv-k7qm | messenger | 0 | - | 1 | 없음 | 0 | undefined |
| messenger-subsidy-smishing-sms | beginner | fv-rizf | messenger | 0 | - | 1 | 없음 | 0 | undefined |
| messenger-subsidy-smishing-sms | intermediate | fv-afbr | messenger | 0 | - | 1 | 없음 | 0 | undefined |
| messenger-subsidy-smishing-sms | advanced | fv-hu8w | messenger | 0 | - | 1 | 없음 | 0 | undefined |
| reputation-blackmail-scam | beginner | fv-9nx7 | voice+sms | 0 | transfer@3 | 1 | 없음 | 필수 1통 | undefined |
| reputation-blackmail-scam | intermediate | fv-kwph | voice+sms | 0 | transfer@3 | 1 | 없음 | 필수 1통 | undefined |
| reputation-blackmail-scam | advanced | fv-egum | voice+sms | 0 | transfer@3 | 1 | 없음 | 필수 1통 | undefined |
| card-delivery-call | advanced | fv-tvnj | voice+sms | 5 | link@2 | 2 | 4(verify) | 필수 1통 | 보안 점검 앱 설치 또는 자산 보호 이체에 동의하는 순간 |
| card-delivery-call | advanced | fv-e5mv | voice+sms | 5 | link@2 | 1 | 4-b(followUp 4) | 필수 1통 | 대출을 받아 대출금을 찾아 직원에게 맡기겠다고 약속하는 순간 |
| card-delivery-call | advanced | fv-u9fz | voice+sms | 5 | link@2 | 1 | 4(verify) | 필수 1통 | 보안 점검 앱 설치 또는 자산 보호 이체에 동의하는 순간 |
| asset-protection-notice-call | advanced | fv-k9ra | voice+sms | 4 | link@3 | 1 | 없음 | 필수 1통 | 인출 · 전달 약속에 동의하는 순간 |
| asset-protection-notice-call | advanced | fv-p3jx | voice+sms | 4 | transfer@4 | 1 | 없음 | 필수 1통 | 문자로 받은 계좌에 공탁금을 넣겠다고 하는 순간 |
| asset-protection-notice-call | advanced | fv-t8ga | voice+sms | 5 | link@3 | 1 | 없음 | 필수 1통 | 예금을 찾아 금을 사서 직원에게 제출하겠다고 약속하는 순간 |
| prosecution-cooperation-call | advanced | fv-h3vn | voice+sms | 9 | link@2, transfer@5 | 1 | 없음 | 필수 2통 | 문자 링크로 연 자산 검수 사이트에서 본인 확인 · 코인 전환 · 금액 입력 · 보관 지갑 이체를 누르는 순간 |
| prosecution-cooperation-call | advanced | fv-v2mk | voice+sms | 6 | link@2 | 1 | 없음 | 필수 1통 | 상품권을 사서 핀 번호를 불러 주겠다고 하는 순간 |
| prosecution-cooperation-call | advanced | fv-a6lq | voice+sms | 6 | link@2 | 1 | 없음 | 필수 1통 | 대출을 받아 대출금을 찾아 직원에게 맡기겠다고 약속하는 순간 |
