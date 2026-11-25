// GPT-SoVITS(Modal) 복제 공급자 — Architecture.md §143. 참조 클립 · 글은 우리 Storage `voices/{voiceId}/`에만 둔다(§143.7 P2).
// createClone = Modal `/prepare`(녹음 서명 URL) → 참조 1 + 보조 3 → Storage. deleteVoice = 그 접두 삭제(Modal 쪽 저장물 0이라 호출 없음).
// synthesize(오프닝 · 텍스트 경로 미리 합성)는 범위 밖 — 종전 Mock(무음)을 그대로 쓴다.
import { randomUUID } from "node:crypto";
import { gsvExp, sealGsvToken } from "./gsvToken";
import { MockVoiceProvider } from "./mockProvider";
import type { CreateVoiceCloneInput, SynthesizeInput, VoiceCloneResult, VoiceProvider, VoiceSynthesisResult } from "./provider";

export const GSV_VOICE_ID_PREFIX = "gsv_";
export const isGsvVoiceId = (voiceId: string | undefined): voiceId is string =>
  typeof voiceId === "string" && /^gsv_[0-9a-f-]{36}$/.test(voiceId);
export const gsvVoicePrefix = (voiceId: string): string => `voices/${voiceId}/`;
export const GSV_REF_JSON = "ref.json";

export type GsvRefMeta = { clips: { file: string; line: number; text: string; sec: number }[] };

export type GsvDeps = {
  endpoint: string;
  key: string;
  nowMs: () => number;
  /** Storage 읽기 서명 URL(분 단위 만료). */
  signedReadUrl(path: string, ttlMs: number): Promise<string>;
  writeFile(path: string, data: Buffer, contentType: string): Promise<void>;
  listFiles(prefix: string): Promise<string[]>;
  deleteFile(path: string): Promise<void>;
  fetchJson(url: string, body: unknown, timeoutMs: number): Promise<unknown>;
};

type PrepareResponse =
  | { ok: true; clips: { line: number; text: string; sec: number; wav: string }[] }
  | { ok: false; reason: string };

export class GsvVoiceProvider implements VoiceProvider {
  readonly providerName = "gsv" as const;
  constructor(private readonly deps: GsvDeps) {}

  async createClone(input: CreateVoiceCloneInput): Promise<VoiceCloneResult> {
    if (!input.voiceInputStoragePath) throw new Error("voiceInputStoragePath required");
    const d = this.deps;
    const audioUrl = await d.signedReadUrl(input.voiceInputStoragePath, 10 * 60_000);
    const token = sealGsvToken({ kind: "prepare", exp: gsvExp(d.nowMs(), 10 * 60_000), audioUrl }, d.key);
    // 콜드 스타트(실측 76초) + 받아쓰기 — 넉넉히 기다린다(콜러블 시간 한도는 voice/index.ts).
    const res = (await d.fetchJson(`${d.endpoint}/prepare`, { token }, 170_000)) as PrepareResponse;
    if (!res || res.ok !== true || !Array.isArray(res.clips) || res.clips.length === 0) {
      return { voiceId: "", cloneStatus: "failed", isMock: false };
    }
    const voiceId = `${GSV_VOICE_ID_PREFIX}${randomUUID()}`;
    const meta: GsvRefMeta = { clips: [] };
    for (const [i, c] of res.clips.entries()) {
      const file = `c${i}.wav`;
      await d.writeFile(gsvVoicePrefix(voiceId) + file, Buffer.from(c.wav, "base64"), "audio/wav");
      meta.clips.push({ file, line: c.line, text: c.text, sec: c.sec });
    }
    await d.writeFile(gsvVoicePrefix(voiceId) + GSV_REF_JSON, Buffer.from(JSON.stringify(meta)), "application/json");
    return { voiceId, cloneStatus: "ready", isMock: false };
  }

  /** §143.7 P2 — `voices/{voiceId}/` 전부. 실패는 throw(폐기 target failed 기록). gsv 아닌 id(옛 Mock)는 지울 것이 없다. */
  async deleteVoice(voiceId: string): Promise<void> {
    if (!isGsvVoiceId(voiceId)) return;
    const files = await this.deps.listFiles(gsvVoicePrefix(voiceId));
    for (const f of files) await this.deps.deleteFile(f);
  }

  synthesize(input: SynthesizeInput): Promise<VoiceSynthesisResult> {
    return new MockVoiceProvider().synthesize(input);
  }
}

/**
 * 통화용 합성 토큰(§143.8 · D4) — 참조 서명 URL은 암호문 안에만 있다. 반환 null = 이 voiceId로는 복제 통화 불가(D5 → 발급 거절).
 * `banned` = 합성 전 서비스 쪽 금지어(실존 기관명 목록 · `guardrails/realFinancialNames.ts`).
 */
export async function buildCloneTtsCredentials(
  voiceId: string | undefined,
  deps: Pick<GsvDeps, "endpoint" | "key" | "nowMs" | "signedReadUrl"> & { readText(path: string): Promise<string | null> },
  banned: readonly string[],
): Promise<{ url: string; token: string } | null> {
  if (!isGsvVoiceId(voiceId)) return null;
  const raw = await deps.readText(gsvVoicePrefix(voiceId) + GSV_REF_JSON);
  if (!raw) return null;
  const meta = JSON.parse(raw) as GsvRefMeta;
  if (!meta.clips?.length) return null;
  const refs = await Promise.all(
    meta.clips.map(async (c) => ({ url: await deps.signedReadUrl(gsvVoicePrefix(voiceId) + c.file, 30 * 60_000), text: c.text })),
  );
  const token = sealGsvToken(
    { kind: "synth", exp: gsvExp(deps.nowMs(), CLONE_TTS_TOKEN_TTL_MS), voiceId, charBudget: CLONE_TTS_CHAR_BUDGET, refs, banned: [...banned] },
    deps.key,
  );
  return { url: `${deps.endpoint.replace(/^http/, "ws")}/ws`, token };
}

export const CLONE_TTS_TOKEN_TTL_MS = 25 * 60_000; // 통화 20분 + 여유(§143.8)
export const CLONE_TTS_CHAR_BUDGET = 3000; // D4
