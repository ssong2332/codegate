// createRealtimeCall 콜러블 요청/응답 — src/lib/api/types.ts(클라 계약)와 1:1(API.md 관례).
export type CreateRealtimeCallRequest = { sessionId: string };
export type CreateRealtimeCallResponse = {
  /** 접속할 실시간 프로바이더. `none`이면 실시간 불가 → 텍스트 폴백. */
  provider: "elevenlabs" | "gemini" | "none";
  /** ElevenLabs 서명 WebSocket URL. 그 외 프로바이더면 빈 문자열. */
  signedUrl: string;
  /** Gemini 단기 토큰(모델·프롬프트가 서버에서 고정돼 있음). 그 외면 빈 문자열. */
  geminiToken: string;
  /** Gemini 접속 모델명. 그 외면 빈 문자열. */
  geminiModel: string;
  /** ElevenLabs에서 쓸 목소리(clone 시나리오는 본인 클론 id). Gemini는 고정 음성이라 빈 문자열. */
  voiceId: string;
  language: "ko";
  /** true = 실시간 대화 불가(키/설정 미비 또는 발급 실패) → 클라는 텍스트 폴백으로 진행. */
  isMock: boolean;
  /**
   * T72(§15.3.3/§15.6 G6) — 사용자가 고른 난이도가 이 통화 경로에 실제로 반영됐는가.
   * ElevenLabs 경로는 프롬프트가 에이전트 쪽에 있어 주입 지점이 없으므로 false.
   * 클라는 false면 난이도 배지를 표시하지 않는다(근거 없는 표기 금지).
   */
  difficultyApplied: boolean;
  /**
   * T68(§15.1.2, API.md T57 증분) — 이 시나리오의 통화 중 문자 **트리거만**(`smsId` + 몇 번째
   * 사기범 턴 이후). **본문·인증번호·발신번호는 포함하지 않는다** — 도착 시점에 `deliverInCallSms`가
   * 서버 카탈로그에서 렌더해 Firestore에 쓰고, 화면은 그 구독으로만 그린다(사전 유출 방지).
   * 카탈로그가 없는 시나리오는 필드 부재.
   *
   * ⚠️ 이 카운팅은 §13.5 스킨과 같은 **프레젠테이션 층위**다 — 어떤 안전 판정도 게이팅하지 않는다.
   * 클라가 임의 `smsId`를 보내도 서버가 시나리오 카탈로그 소속을 재검증하므로(G12), 위조의 최대
   * 효과는 "자기 훈련용 모의 문자를 조금 일찍 보는 것"뿐이다.
   */
  inCallSmsTriggers?: { smsId: string; afterScammerTurns: number }[];
  /**
   * T83(§16.1.5, API.md T79 증분) — 확인 시도 무력화(UF-011)의 **가용 게이트만**. 창구명·번호·모델
   * 지시는 포함하지 않는다(오퍼 시점에 `deliverVerifyOffer`가 서버 카탈로그에서 렌더 — 사전 유출
   * 방지). **부착 조건 3개를 전부 만족할 때만 필드가 존재한다**: ① 카탈로그 보유 ② 세션 난이도
   * advanced ③ `difficultyApplied === true`. → **ElevenLabs 경로에는 구조적으로 붙지 않는다**
   * (주입 지점 부재 + 난이도 미적용, §16.6 G23) → 클라에 컨트롤이 **존재하지 않는다**.
   *
   * ⚠️ 이 카운팅도 §13.5 스킨과 같은 **프레젠테이션 층위**다 — 어떤 안전 판정도 게이팅하지 않으며,
   * 콜러블이 소유·활성·카탈로그·난이도·프로바이더를 전부 재검증한다(G24).
   */
  verifyOffer?: { availableAfterScammerTurns: number };
  /**
   * ⭐ §59.6/§59.10 커밋 C(G385/G386, `docs/API.md` 부록 C `createRealtimeCall` 증분) — Live 도구
   * 이름의 하향 전달. 클라는 `toolCall.functionCalls[].name`을 이 값과 **비교**해 어느 콜러블인지
   * 정한다(하드코딩 금지, G385) — 드리프트 게이트를 만드는 대신 드리프트가 성립할 자리를 없앤다.
   *
   * **부착 조건 = Gemini 프로바이더 && 도구가 하나라도 선언될 때만.** `sendPreparedSms`는
   * `hasInCallSms(scenarioId)`, `offerVerificationDesk`는 `hasVerifyIntercept && difficultyLevel===
   * "advanced" && verifySeriesFor()==="A"`(오늘은 `bank-security-verify-scam` 1종뿐 — 계열 B 확장은
   * OQ-A73, G392). 도구 선언 자체는 여전히 토큰(`liveConnectConstraints.config.tools`)에 서버
   * 고정이다 — 이 필드는 **이름 사본**일 뿐이라 클라가 바꿔도 세션의 도구 집합은 달라지지 않는다.
   *
   * `failureInstruction`은 콜러블이 아예 닿지 못했을 때 모델에게 돌려줄 서버 소유 한국어 1줄
   * (G386 — 클라가 저작하지 않는다).
   */
  liveTools?: {
    sendPreparedSms?: string;
    offerVerificationDesk?: string;
    failureInstruction: string;
  };
};
