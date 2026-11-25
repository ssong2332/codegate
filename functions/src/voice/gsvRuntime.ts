// GsvVoiceProvider의 운영 배선(Firebase Storage · fetch · 설정). 순수 로직은 gsvProvider.ts.
import { getStorage } from "firebase-admin/storage";
import { GSV_ENDPOINT_URL } from "../shared/config";
import { REAL_FINANCIAL_NAME_RULES } from "../guardrails/realFinancialNames";
import type { GsvDeps } from "./gsvProvider";

/** defineString · defineSecret 판독 — 바인딩 안 된 컨텍스트(단위 시험 · secrets 미선언 함수)는 빈 값. */
function read(param: { value: () => string }): string {
  try {
    return param.value() ?? "";
  } catch {
    return "";
  }
}

export function gsvEndpoint(): string {
  return read(GSV_ENDPOINT_URL).replace(/\/+$/, "");
}

// ⛔ 키 판독(`gsvKey`)은 이 파일에 두지 않는다 — `getVoiceProvider`가 이 파일을 가져오므로, 여기서 시크릿을 읽으면
// 목소리 공급자를 쓰는 모든 콜러블이 시크릿을 "읽는" 것으로 잡힌다(secretDeclarationGate). 키는 `gsvKey.ts`.

/** 합성 서비스 쪽 금지어(D4) — 실존 금융기관 규칙 이름(공백 없는 낱말만). 클라 가드가 먼저 가린 뒤의 백스톱이다. */
export const GSV_BANNED_TERMS: readonly string[] = REAL_FINANCIAL_NAME_RULES.map((r) => r.label).filter((l) => /^[가-힣A-Za-z]+$/.test(l));

async function fetchJson(url: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`gsv ${new URL(url).pathname} ${res.status}`);
  return res.json();
}

/** key = `gsvKey()` 값(그 콜러블이 시크릿을 선언했을 때만). 빈 키면 삭제 · 읽기만 되고 토큰 봉인은 실패한다. */
export function gsvDeps(key: string): GsvDeps & { readText(path: string): Promise<string | null> } {
  const bucket = () => getStorage().bucket();
  return {
    endpoint: gsvEndpoint(),
    key,
    nowMs: () => Date.now(),
    async signedReadUrl(path, ttlMs) {
      const [url] = await bucket().file(path).getSignedUrl({ action: "read", expires: Date.now() + ttlMs, version: "v4" });
      return url;
    },
    async writeFile(path, data, contentType) {
      await bucket().file(path).save(data, { contentType, resumable: false });
    },
    async listFiles(prefix) {
      const [files] = await bucket().getFiles({ prefix });
      return files.map((f) => f.name);
    },
    async deleteFile(path) {
      await bucket().file(path).delete({ ignoreNotFound: true });
    },
    async readText(path) {
      const f = bucket().file(path);
      const [exists] = await f.exists();
      if (!exists) return null;
      const [buf] = await f.download();
      return buf.toString("utf8");
    },
    fetchJson,
  };
}
