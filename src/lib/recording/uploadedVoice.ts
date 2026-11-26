// 목소리 파일 업로드(§145 · DECISIONS #259) — 지인에게 보내기 녹음 화면에서 즉석 녹음 대신 파일을 고른다.
// 고른 파일은 브라우저에서 풀어(decodeAudioData) 길이를 재고 16kHz 모노 WAV로 바꿔, 즉석 녹음과 같은
// Storage 경로(voice_input.webm) · createVoiceClone · 프로필 저장 경로를 그대로 탄다. 1분 WAV = 1.92MB < storage.rules 3MB.
// ⛔ firebase 등 브라우저 의존 import 금지 — node 시험 러너가 그대로 읽는다.
// 즉석 녹음과 같은 길이 기준(useVoiceRecorder.ts — react를 불러 이 러너에서 import 불가 · 시험이 두 값을 대조한다).
export const MIN_RECORDING_SECONDS = 20;
export const MAX_RECORDING_SECONDS = 60;

/** 고르기 전 원본 파일 상한 — 풀기(메모리) 보호. 1분 무압축 WAV 48kHz 스테레오 ≈ 11.5MB. */
export const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const UPLOAD_ACCEPT = "audio/*,.wav,.mp3,.m4a,.aac,.webm,.ogg,.opus,.flac";
export const UPLOAD_SAMPLE_RATE = 16_000;
const AUDIO_EXT = /\.(wav|mp3|m4a|aac|webm|ogg|opus|flac)$/i;

export type UploadVerdict = "ok" | "empty" | "too_big" | "not_audio" | "decode_failed" | "too_short" | "too_long";

// 판정표 UF(파일) — 풀기 전.
// UF1 크기 0 → empty · UF2 크기 > 20MB → too_big · UF3 MIME audio/* 또는 확장자가 목록에 있음 → ok · UF4 그 밖 → not_audio
export function judgeUploadFile(file: { size: number; type: string; name: string }): UploadVerdict {
  if (file.size <= 0) return "empty";
  if (file.size > UPLOAD_MAX_BYTES) return "too_big";
  if (file.type.startsWith("audio/") || AUDIO_EXT.test(file.name)) return "ok";
  return "not_audio";
}

// 판정표 UD(길이) — 풀린 뒤. 즉석 녹음과 같은 기준.
// UD1 < 20초 → too_short · UD2 > 60초(+0.5초 여유) → too_long · UD3 그 사이 → ok · UD4 숫자 아님 · 0 이하 → decode_failed
export function judgeUploadDuration(seconds: number): UploadVerdict {
  if (!Number.isFinite(seconds) || seconds <= 0) return "decode_failed";
  if (seconds < MIN_RECORDING_SECONDS) return "too_short";
  if (seconds > MAX_RECORDING_SECONDS + 0.5) return "too_long";
  return "ok";
}

export const UPLOAD_MESSAGES: Record<Exclude<UploadVerdict, "ok">, string> = {
  empty: "빈 파일입니다. 목소리가 담긴 음성 파일을 골라 주세요.",
  too_big: "파일이 너무 큽니다(20MB까지). 1분 이하로 자른 파일을 올려 주세요.",
  not_audio: "음성 파일만 올릴 수 있습니다(wav · mp3 · m4a · webm 등).",
  decode_failed: "이 파일을 재생할 수 없습니다. 다른 형식(wav · mp3 · m4a)으로 다시 올려 주세요.",
  too_short: `목소리가 너무 짧습니다. ${MIN_RECORDING_SECONDS}초 이상인 파일을 올려 주세요.`,
  too_long: `1분이 넘는 파일입니다. ${MAX_RECORDING_SECONDS}초 이하로 잘라서 올려 주세요.`,
};

/** 업로드 확인 문구 — 남의 목소리를 허락 없이 올리지 못하게(즉석 녹음의 본인 확인 문항과 짝). */
export const UPLOAD_OWNER_CONFIRM_TEXT =
  "이 파일은 제 목소리이거나, 목소리 주인에게 사용 허락을 받은 녹음입니다. 다른 사람의 목소리를 허락 없이 올리지 않습니다.";

/** 채널 평균(모노) → 선형 보간 재표본화 → 16bit PCM WAV. */
export function encodeWav16kMono(channels: readonly Float32Array[], sampleRate: number): Uint8Array {
  const len = channels[0]?.length ?? 0;
  const outLen = Math.floor((len * UPLOAD_SAMPLE_RATE) / sampleRate);
  const ratio = sampleRate / UPLOAD_SAMPLE_RATE;
  const mono = (i: number) => {
    let s = 0;
    for (const ch of channels) s += ch[i] ?? 0;
    return s / channels.length;
  };
  const buf = new ArrayBuffer(44 + outLen * 2);
  const v = new DataView(buf);
  const str = (o: number, t: string) => [...t].forEach((c, k) => v.setUint8(o + k, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + outLen * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // 모노
  v.setUint32(24, UPLOAD_SAMPLE_RATE, true);
  v.setUint32(28, UPLOAD_SAMPLE_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, outLen * 2, true);
  for (let j = 0; j < outLen; j++) {
    const x = j * ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(i0 + 1, len - 1);
    const sample = mono(i0) + (mono(i1) - mono(i0)) * (x - i0);
    const c = Math.max(-1, Math.min(1, sample));
    v.setInt16(44 + j * 2, c < 0 ? c * 0x8000 : c * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

export type PreparedUpload = { ok: true; wav: Blob; seconds: number } | { ok: false; verdict: Exclude<UploadVerdict, "ok"> };

/** 브라우저 전용: 파일 판정 → 풀기 → 길이 판정 → WAV. */
export async function prepareUploadedVoice(file: File): Promise<PreparedUpload> {
  const fileVerdict = judgeUploadFile(file);
  if (fileVerdict !== "ok") return { ok: false, verdict: fileVerdict };
  let audio: AudioBuffer;
  const ctx = new AudioContext();
  try {
    audio = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    return { ok: false, verdict: "decode_failed" };
  } finally {
    void ctx.close();
  }
  const durationVerdict = judgeUploadDuration(audio.duration);
  if (durationVerdict !== "ok") return { ok: false, verdict: durationVerdict };
  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
  const wav = encodeWav16kMono(channels, audio.sampleRate);
  return { ok: true, wav: new Blob([wav.buffer as ArrayBuffer], { type: "audio/wav" }), seconds: Math.round(audio.duration) };
}
