// T192 C4 · G535 — 서버 · 클라 계약 리터럴 양방향 대조(Architecture.md §79.19 (6) ⑤ ⓐ~ⓓ · (8) G535).
//
// 서버 타입(`functions/src/**`)과 클라 타입(`src/lib/api/types.ts`)은 별도 빌드 루트라 import로 공유하지 않고 손으로
// 미러링한다(1:1 주석 관례). 손 미러는 한쪽만 바뀌어도 컴파일이 통과하므로, **서버 소스를 읽어** 리터럴 집합을 뽑고 클라와
// 양방향으로 대조한다(선례: `src/lib/difficulty/difficulty.test.ts`의 서버 리터럴 대조 · G428).
// ⛔ 손으로 쓴 기대값과 대조하지 않는다 — 기대값은 언제나 반대편 소스다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const read = (rel: string): string => fs.readFileSync(path.join(REPO, rel), "utf8");

const CLIENT_TYPES = "src/lib/api/types.ts";
const SERVER = {
  decide: "functions/src/scammerHangup/decide.ts",
  hangupTypes: "functions/src/scammerHangup/types.ts",
  endReason: "functions/src/session/endReason.ts",
  sessionTypes: "functions/src/session/types.ts",
  roleplayTypes: "functions/src/roleplay/types.ts",
} as const;

/** 주석 제거(블록 · 줄) — 주석 속 리터럴이 집합에 섞이지 않게. 문자열 안의 `//`는 이 계약 타입들에 없다. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** `export type Name = …;` 본문(주석 제거 뒤). 중괄호 균형을 따라 끝 `;`를 찾는다(인라인 객체 타입의 `};` 오인 방지). */
function typeBody(src: string, name: string): string {
  const clean = stripComments(src);
  const head = `export type ${name} =`;
  const start = clean.indexOf(head);
  assert.ok(start >= 0, `타입 ${name}을 찾지 못했다 — 조용한 건너뜀 금지`);
  let depth = 0;
  for (let i = start + head.length; i < clean.length; i += 1) {
    const ch = clean[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === ";" && depth === 0) return clean.slice(start + head.length, i);
  }
  throw new Error(`타입 ${name}의 끝을 찾지 못했다`);
}

function stringLiterals(text: string): string[] {
  return [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]!).sort();
}

/** 객체 타입의 최상위 키(중첩 객체 안의 키는 뺀다). */
function topLevelKeys(body: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let token = "";
  for (const ch of body) {
    if (ch === "{") {
      depth += 1;
      token = "";
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      token = "";
      continue;
    }
    if (depth === 1) {
      if (ch === ":") {
        const key = token.trim().replace(/\?$/, "");
        if (/^\w+$/.test(key)) keys.push(key);
        token = "";
      } else if (ch === ";" || ch === "\n") {
        token = "";
      } else {
        token += ch;
      }
    }
  }
  return keys.sort();
}

/** 객체 타입 안 한 필드의 타입 표현(최상위 · 주석 제거 뒤). */
function fieldType(body: string, field: string): string {
  const m = new RegExp(`(?:^|[;{\\s])${field}\\??:\\s*([^;]+);`).exec(body);
  assert.ok(m, `필드 ${field}를 찾지 못했다`);
  return m[1]!;
}

const contract = (client: string) => ({
  // ⓐ 판정 status 집합
  statusServer: stringLiterals(typeBody(read(SERVER.decide), "ScammerHangupStatus")),
  statusClient: stringLiterals(typeBody(client, "ScammerHangupStatus")),
  // ⓑ 종료 요청 사유 = 서버 허용목록
  endReasonServer: (() => {
    const m = /END_SESSION_ALLOWED_REASONS = \[([^\]]*)\] as const/.exec(stripComments(read(SERVER.endReason)));
    assert.ok(m, "END_SESSION_ALLOWED_REASONS를 찾지 못했다");
    return stringLiterals(m[1]!);
  })(),
  endReasonClient: stringLiterals(typeBody(client, "EndSessionReason")),
  // ⓒ requestScammerHangup 요청 키
  requestKeysServer: topLevelKeys(typeBody(read(SERVER.hangupTypes), "RequestScammerHangupRequest")),
  requestKeysClient: topLevelKeys(typeBody(client, "RequestScammerHangupRequest")),
  // ⓓ sendMessage 응답 endReason 집합
  sendEndServer: stringLiterals(fieldType(typeBody(read(SERVER.roleplayTypes), "SendMessageResponse"), "endReason")),
  sendEndClient: stringLiterals(fieldType(typeBody(client, "SendMessageResponse"), "endReason")),
});

function assertContract(client: string): void {
  const c = contract(client);
  assert.deepEqual(c.statusClient, c.statusServer, "ⓐ ScammerHangupStatus 집합이 서버와 다르다");
  assert.deepEqual(c.endReasonClient, c.endReasonServer, "ⓑ EndSessionReason이 서버 허용목록과 다르다");
  assert.deepEqual(c.requestKeysClient, c.requestKeysServer, "ⓒ RequestScammerHangupRequest 키 집합이 서버와 다르다");
  assert.deepEqual(c.sendEndClient, c.sendEndServer, "ⓓ SendMessageResponse.endReason 집합이 서버와 다르다");
}

test("[G535] 서버 · 클라 계약 리터럴 4종이 양방향으로 같다(ⓐ status · ⓑ 종료 사유 · ⓒ 요청 키 · ⓓ sendMessage endReason)", (t) => {
  const client = read(CLIENT_TYPES);
  assertContract(client);
  const c = contract(client);
  // 공허 통과 방지 — 각 집합이 실제로 채워져 있다(스캔이 0을 0과 비교하지 않게).
  assert.equal(c.statusServer.length, 10, "ⓐ 판정 status는 10종");
  assert.deepEqual(c.endReasonServer, ["limit_reached", "scammer_ended", "user_ended"]);
  assert.deepEqual(c.requestKeysServer, ["kind", "pendingInstruction", "sessionId", "userTurns"]);
  assert.deepEqual(c.sendEndServer, ["limit_reached", "scammer_ended"]);
  t.diagnostic(`[G535] status ${c.statusServer.length} · 종료 사유 ${c.endReasonServer.join("/")} · 요청 키 ${c.requestKeysServer.join("/")}`);
});

test("[G535 ⓑ] 서버 요청 타입 EndSessionReason은 허용목록 타입의 별칭이다(손 미러 0 — C1 Minor ④)", () => {
  const body = typeBody(read(SERVER.sessionTypes), "EndSessionReason").trim();
  assert.equal(body, "AllowedEndSessionReason", "서버 요청 타입이 허용목록과 따로 노는 유니언으로 돌아갔다");
});

test("[G535 역검증] 클라 사본에서 리터럴 하나를 빼거나 더하면 해당 항목이 실패한다(ⓐ~ⓓ 각각)", () => {
  const client = read(CLIENT_TYPES);
  // ⚠️ 앵커는 한 줄짜리만 쓴다(줄바꿈 리터럴 앵커 금지 — CRLF 체크아웃). ⓒ는 요청 타입 블록 안에서만 바꾼다.
  const requestHead = "export type RequestScammerHangupRequest = {";
  const mutations: ReadonlyArray<readonly [string, (src: string) => string]> = [
    ["ⓐ status 하나 삭제", (src) => src.replace('  | "not_last_leg"', "")],
    [
      "ⓑ 옛 사유 되살림",
      (src) =>
        src.replace(
          'export type EndSessionReason = "user_ended" | "limit_reached" | "scammer_ended";',
          'export type EndSessionReason = "user_ended" | "completed" | "limit_reached" | "scammer_ended";',
        ),
    ],
    [
      "ⓒ 요청 키 이름 바꿈",
      (src) => {
        const at = src.indexOf(requestHead);
        return src.slice(0, at) + src.slice(at).replace("  userTurns: number;", "  turnCount: number;");
      },
    ],
    ["ⓓ endReason 좁힘", (src) => src.replace('  endReason?: "limit_reached" | "scammer_ended";', '  endReason?: "limit_reached";')],
  ];
  for (const [label, mutate] of mutations) {
    const poisoned = mutate(client);
    assert.notEqual(poisoned, client, `${label}: 주입 앵커가 클라 소스에 없다 — 역검증이 공회전한다`);
    assert.throws(() => assertContract(poisoned), `${label} 사본이 통과했다 — 대조가 죽었다`);
  }
});
