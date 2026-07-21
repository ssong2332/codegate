// 목업 TTS 오디오 생성기 (T19) — ElevenLabs 없이 즉석에서 만들 수 있는 가장 단순한 방식으로,
// 짧은 경고음(beep) WAV를 코드로 합성해 data URI로 반환한다. 외부 에셋 파일이 필요 없어
// 팀의 사전 준비 없이도 바로 동작한다(하루 스코프 최적).
//
// ⚠️ 의도적으로 "사람 목소리를 흉내 내지 않는" 사인파 톤을 쓴다 — 재생해 들어봐도 실제 음성
// 합성이 아님이 즉시 드러나게 하기 위함(육안+청각 이중 식별, PRD Risks "목업 잔존 위험" 대응).

const SAMPLE_RATE_HZ = 8000;
const DURATION_SEC = 0.6;
const TONE_FREQUENCY_HZ = 880; // 명백한 "삐" 경고음 톤(A5)
const AMPLITUDE = 0.3; // 클리핑 방지용 낮은 진폭

/** 무음이 아닌 사인파 beep을 담은 16bit PCM mono WAV 버퍼를 만든다(새 의존성 없이 Buffer만 사용). */
export function buildMockBeepWavBuffer(): Buffer {
  const numSamples = Math.floor(SAMPLE_RATE_HZ * DURATION_SEC);
  const dataSize = numSamples * 2; // 16-bit mono => 2 bytes/sample
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

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE_HZ;
    const sample = AMPLITUDE * Math.sin(2 * Math.PI * TONE_FREQUENCY_HZ * t);
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }

  return buffer;
}

/** MockVoiceProvider.synthesize()가 반환하는 audioUrl — data URI라 별도 Storage 업로드 없이 즉시 재생 가능. */
export function buildMockBeepWavDataUri(): string {
  const wav = buildMockBeepWavBuffer();
  return `data:audio/wav;base64,${wav.toString("base64")}`;
}
