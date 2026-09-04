// 목업 TTS 오디오 생성기 (T19) — ElevenLabs 없이 즉석에서 만들 수 있는 가장 단순한 방식으로,
// 짧은 무음 WAV를 코드로 합성해 data URI로 반환한다. 외부 에셋 파일이 필요 없어 팀의 사전 준비
// 없이도 바로 동작한다(하루 스코프 최적).
//
// ⛔ **소리로 목업임을 알리지 않는다(D1, docs/Architecture.md §54.8·§54.9 (1)).** 예전에는 880Hz
// 사인파 0.6초 "삐" 톤을 넣고 주석이 그것을 *"육안+청각 이중 식별"* 이라고 적었으나, **PRD 원문에
// "청각"은 없다**: PRD Risks "목업 잔존 위험"의 완화책은 *"목업 오디오에 명백한 플레이스홀더 표식을
// 넣어 **육안** 식별 가능하게 한다"* 이고(`docs/PRD.md:810`), AC-022도 *"오디오 안내 문구 **또는**
// 화면 라벨"* 이다(`:635`) — 사인파 톤은 "안내 문구"가 아니다. 그 축은 코드 주석이 스스로 덧붙인
// 것이었다(§54.0 8).
//
// ⇒ **육안 식별은 전부 그대로 살아 있다**(§54.8 (1)): `isMock: true` · `mock-voice-`/`mock-artifact-`
// 접두사 · `MOCK_NOTICE`(mockProvider.ts) · `synthetic`/`syntheticLabel` 응답 계약 · 수신 화면의
// `PREROLL_NOTICE` · AC-084 강등 고지 · 모의 화면 배지 · T16 데모 게이팅 체크리스트.
// ⛔ **무음화로 D-3/P-3 ②(오디오 프리롤 *안내 문구*)를 충족했다고 적지 말 것(G346)** — 그 공백은
// 이 변경이 만든 것이 아니라 원래 있던 것이다(현행은 텍스트 PREROLL_NOTICE 1곳뿐, OQ-A60).
//
// ⚠️ **WAV 자체는 계속 만든다 — 재생을 생략하지 않는다**(§54.9 (2) B안 기각). 헤더·길이·data URI
// 형태가 그대로여야 클라의 `<audio>`가 오늘처럼 `onEnded`를 쏘고, 그 신호에 매달린 폴백의 자동청취
// 재개·"상대방이 말하는 중" 표시가 한 글자도 바뀌지 않는다.

const SAMPLE_RATE_HZ = 8000;
const DURATION_SEC = 0.6;

/** 전 샘플이 0인(무음) 16bit PCM mono WAV 버퍼를 만든다(새 의존성 없이 Buffer만 사용). */
export function buildMockSilentWavBuffer(): Buffer {
  const numSamples = Math.floor(SAMPLE_RATE_HZ * DURATION_SEC);
  const dataSize = numSamples * 2; // 16-bit mono => 2 bytes/sample
  // Buffer.alloc은 0으로 채운다 — data 청크에 따로 쓰지 않는 것이 곧 무음이다(§54.9 (1) 1).
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE_HZ, 24);
  buffer.writeUInt32LE(SAMPLE_RATE_HZ * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

/** MockVoiceProvider.synthesize()가 반환하는 audioUrl — data URI라 별도 Storage 업로드 없이 즉시 재생 가능. */
export function buildMockSilentWavDataUri(): string {
  const wav = buildMockSilentWavBuffer();
  return `data:audio/wav;base64,${wav.toString("base64")}`;
}
