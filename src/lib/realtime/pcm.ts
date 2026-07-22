// Gemini Live API 오디오 포맷 변환 유틸 (2026-07-22).
//
// Live API는 ElevenLabs SDK와 달리 마이크/스피커를 대신 다뤄주지 않는다. 규격은 고정이다:
//   - 보내는 오디오: 16-bit PCM, 16kHz, mono, little-endian → base64
//   - 받는 오디오:  16-bit PCM, 24kHz, mono, little-endian ← base64
// 브라우저 마이크는 보통 44.1/48kHz Float32라 다운샘플 + Int16 변환이 필요하다.
//
// 순수 함수만 모아 둔다(오디오 노드·컨텍스트 없음) — 단위 검증이 쉽고, 세션 컴포넌트는
// "언제 부를지"만 신경 쓰면 된다.

export const GEMINI_INPUT_SAMPLE_RATE = 16000;
export const GEMINI_OUTPUT_SAMPLE_RATE = 24000;

/**
 * Float32 오디오(-1..1)를 목표 샘플레이트의 16-bit PCM으로 변환한다.
 * 가장 단순한 최근접 샘플 방식 — 음성 인식용이라 고품질 리샘플링까지는 필요 없고,
 * 통화 지연을 늘리지 않는 쪽이 중요하다.
 */
export function floatToPcm16(
  input: Float32Array,
  inputSampleRate: number,
  targetSampleRate: number = GEMINI_INPUT_SAMPLE_RATE,
): Int16Array {
  const ratio = inputSampleRate / targetSampleRate;
  const outputLength = ratio > 1 ? Math.floor(input.length / ratio) : input.length;
  const output = new Int16Array(outputLength);
  for (let i = 0; i < outputLength; i += 1) {
    const sample = input[Math.floor(i * ratio)] ?? 0;
    // 클리핑 후 16-bit 정수로 — 범위를 벗어난 값이 wrap-around 되어 잡음이 되는 것을 막는다.
    const clamped = Math.max(-1, Math.min(1, sample));
    output[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return output;
}

/** Int16 PCM을 Live API가 요구하는 base64 문자열로 만든다. */
export function pcm16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  // 큰 배열을 apply로 한 번에 넘기면 스택이 터지므로 청크로 나눈다.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Live API가 보내온 base64 PCM을 재생 가능한 Float32로 되돌린다.
 *
 * 반환 타입을 `Float32Array<ArrayBuffer>`로 좁힌다 — `AudioBuffer.copyToChannel`이 SharedArrayBuffer
 * 기반 뷰를 받지 않기 때문이다(기본 `Float32Array`는 ArrayBufferLike라 타입이 맞지 않는다).
 * 여기서는 항상 새 ArrayBuffer로 만들므로 이 좁힘이 사실과 어긋나지 않는다.
 */
export function base64ToFloat32(base64: string): Float32Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(bytes.length / 2);
  const output = new Float32Array(new ArrayBuffer(sampleCount * 4));
  for (let i = 0; i < sampleCount; i += 1) {
    output[i] = view.getInt16(i * 2, true) / 0x8000;
  }
  return output;
}
