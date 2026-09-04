---
name: feedback-mock-ignores-input-marks-anyway
description: 강등(Mock) 구현체가 무시하는 입력이 있으면 그 위의 순서 판정은 전부 조건문이다 — 그런데 부작용 기록(announcedAt류)은 결과와 무관하게 실행된다
metadata:
  type: feedback
---

**강등/스텁 구현체가 어떤 입력을 무시하는지 확인하고, 그 입력에 의존하는 상류 타임라인 서술에 "실 구현 전제"를
조건으로 붙인다.** 그리고 **"했다고 기록하는 write"가 그 결과 앞에 있는지 뒤에 있는지**를 반드시 본다.

**Why:** codegate `MockLlmClient.complete()`는 **`systemPrompt`를 한 번도 읽지 않는다**
(`functions/src/llm/mockClient.ts:55-67` — `messages`+`mockTacticHints`만). `turnInstruction`은 `systemPrompt`
안으로만 들어가므로 Mock 턴에서는 **sms announce·verify announce·verify reconnect·install consent가 전부 0효과**다.
그런데 `roleplay/index.ts:255-274`는 **LLM 호출 앞에서** `announcedAt`을 마크한다 ⇒ **말하지 않은 예고가
"예고 완료"로 기록되고**, 폴백 노출 조건(§38 후보 C)이 그것을 참으로 읽어 **자동 전환을 연다.** §38이 실시간에서
닫은 결함(*"컨트롤이 예고보다 먼저"*)이 **다른 문으로 재발**한다. §38.4 후보 C의 근거였던 *"폴백은 응답이 곧
대사라 그 턴에 반드시 발화된다"* 는 **실 LLM 전제 위에서만 참**이었다.

**How to apply:**
- 폴백/강등 경로의 타임라인을 쓸 때 **"화자" 열에 강등 여부를 조건으로 붙인다**(무조건문 금지).
- `*AnnouncedAt`·`*SentAt` 같은 **"했다" 마킹은 산출물에 종속시킨다**(`completion.isMock`을 보고 마크하지 않는 등).
  마킹 지점이 호출 **앞**이면 그 자체가 결함 후보다.
- ⛔ **"자격증명/입력을 배달되게 고쳤다"만으로 닫지 말 것** — 이 두 층은 **같은 커밋**이어야 한다.
  앞층만 고치면 *"예고 없는 자동 전환"* 이 **처음으로 실재**하게 된다. ([[feedback_check_input_reaches_the_path]])
- Mock의 결정론 산술도 확인한다: codegate Mock 대사 인덱스는 `turn % hints.length`인데 폴백의 `turn`은
  **항상 짝수**(오프닝 1건 + 2건씩) ⇒ **hints 길이가 짝수면 절반이 영영 안 나온다**(bank 6개 → {0,2,4}만).
  ⭐ 라이브 전사와 **필러·인덱스까지 대조**하면 이 모델을 라이브 없이 검증할 수 있다.
