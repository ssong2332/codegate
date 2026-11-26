// 채점기 자체 시험(W0) — 손으로 만든 가짜 out 3판(합격 · 막다른 길 · 금액 불일치 + 메타 · 서비스 밖 1판)으로 Q별 기대 점수를 assert하고,
// 규칙을 하나씩 일부러 깨 보면(역검증) 같은 assert가 실패하는지 본다. 실 키 0.
// functions/lib가 없으면 건너뛴다(`npm --prefix functions run build` 뒤 실행 — 루트 `npm test`는 lib를 만들지 않는다).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RULES, loadLib, scoreDir, scoreSession, renderMarkdown, AUTO } from "./realism-score.mjs";

const fnRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../functions");
const hasLib = existsSync(path.join(fnRoot, "lib/roleplay/linkMarker.js"));
const S = (n, text) => ({ role: "scammer", n, text });
const U = (n, text) => ({ role: "user", kind: "user", n, text });

// A — 합격: 번호 일치 · 금액 일치 · 끝까지 · 반복 없음 · 말투 일관 · 메타 0 · 밖 유도 0.
const GOOD = {
  ch: "voice", id: "family-accident-deepvoice", level: "advanced", persona: "allIn", variantId: "fv-good", callNumber: "010-2447-8815",
  turns: [S(1, "어머니, 저예요. 사고가 났어요."), U(1, "어머, 어떻게 된 거야?"), S(2, "합의금 오십만 원이 급해요."), U(2, "알겠어요."), S(3, "문자로 계좌 보냈어요. 확인해 주세요."), U(3, "보냈어요."), S(4, "고마워요. 이제 들어왔어요.")],
  events: [
    { ev: "sms", smsId: "a", senderNumber: "010-2447-8815", senderLabel: "010-2447-8815 (아들)", body: "금액: 500,000원", turnIdx: 4 },
    { ev: "landingSubmitted", comparison: "equal", demand: "500,000", turnIdx: 5 },
    { ev: "ended_by_end_call", kind: "goal" },
  ],
};
// B — 막다른 길: 모자라게 보낸 뒤 같은 송금 재촉 4번 · 끝 없음 · 같은 말 반복.
const DEAD = {
  ch: "voice", id: "family-accident-deepvoice", level: "advanced", persona: "comply", variantId: "fv-dead", callNumber: "010-2447-8815",
  turns: [S(1, "합의금 삼백만 원을 이체하세요."), U(1, "네."), S(2, "아직 모자랍니다. 나머지를 이체하세요."), U(2, "화면에서 잔액이 부족하다고 나와요."), S(3, "모자란 금액을 이체해 주세요."), U(3, "더 없어요."), S(4, "나머지 금액을 송금하세요, 빨리."), U(4, "네."), S(5, "나머지 금액을 송금해 주세요.")],
  events: [{ ev: "sms", smsId: "a", senderNumber: "010-2447-8815", body: "금액: 3,000,000원", turnIdx: 0 }, { ev: "landingSubmitted", comparison: "less", demand: "3,000,000", turnIdx: 2 }],
};
// C — 금액 불일치 + 번호 불일치(설명 없음).
const MISMATCH = {
  ch: "voice", id: "family-accident-deepvoice", level: "advanced", persona: "comply", variantId: "fv-mis", callNumber: "010-2447-8815",
  turns: [S(1, "엄마, 합의금 이백만 원 보내야 돼요."), U(1, "응."), S(2, "문자로 보낸 계좌 확인해 줘요."), U(2, "알았어."), S(3, "고마워요.")],
  events: [{ ev: "sms", smsId: "a", senderNumber: "070-0472-3816", body: "금액: 500,000원", turnIdx: 2 }, { ev: "ended_by_end_call", kind: "goal" }],
};
// D — 번호 다르지만 설명 있음 · 메타 노출 · 서비스 밖 유도 · 말투 섞임.
const LEAK = {
  ch: "voice", id: "institutional-impersonation", level: "advanced", persona: "comply", variantId: "fv-leak", callNumber: "02-6478-2718",
  turns: [S(1, "저희 다른 번호로 문자를 보냈습니다. 확인해 주세요."), U(1, "네."), S(2, "이 훈련 대화에서는 안내를 드립니다. 너 알지?"), U(2, "네."), S(3, "은행 창구에 가서 현금을 찾아 오세요. 빨리 하세요! 너 지금 뭐해, 빨리 해."), U(3, "네.")],
  events: [{ ev: "sms", smsId: "a", senderNumber: "02-0731-5402", body: "안내 문자", turnIdx: 1 }],
};

// 기대 점수(규칙 하나가 틀리면 어긋난다).
const EXPECT = [
  ["합격", GOOD, { Q1: 2, Q2: 2, Q3: 2, Q4: 2, Q6: 2, Q8: 2, Q10: 2 }, { pass: true }],
  ["막다른 길", DEAD, { Q1: 2, Q2: 2, Q3: 0, Q4: 0, Q8: 2 }, { pass: false, frustration: true }],
  ["금액·번호 불일치", MISMATCH, { Q1: 0, Q2: 0, Q3: 2 }, { pass: false }],
  ["메타·밖 유도·설명 있는 번호", LEAK, { Q1: 2, Q8: 0, Q10: 0, Q6: 0 }, { pass: false }],
];

function check(rules, lib) {
  const bad = [];
  for (const [name, session, qs, extra] of EXPECT) {
    const got = scoreSession(session, lib, {}, rules);
    for (const [id, want] of Object.entries(qs)) if (got.q[id].score !== want) bad.push(`${name} ${id}: ${got.q[id].score} ≠ ${want}`);
    for (const [k, want] of Object.entries(extra)) if (got[k] !== want) bad.push(`${name} ${k}: ${got[k]} ≠ ${want}`);
  }
  return bad;
}

describe("realism-score 채점기", { skip: !hasLib && "functions/lib 없음 — npm --prefix functions run build 뒤 실행" }, () => {
  const lib = hasLib ? loadLib(fnRoot) : undefined;

  it("가짜 판 4개가 Q별 기대 점수를 낸다", () => {
    assert.deepEqual(check(RULES, lib), []);
  });

  it("역검증 — 규칙을 하나씩 '무조건 2점'으로 깨면 기대 점수 검사가 실패한다", () => {
    for (const id of AUTO) {
      const broken = { ...RULES, [id]: () => ({ score: 2, note: "깨짐" }) };
      assert.notDeepEqual(check(broken, lib), [], `${id}를 깨도 시험이 통과한다 — 이 규칙의 시험 판이 없다`);
    }
  });

  it("역검증 — 반대로 '무조건 0점'으로 깨도 실패한다", () => {
    for (const id of AUTO) {
      const broken = { ...RULES, [id]: () => ({ score: 0, note: "깨짐" }) };
      assert.notDeepEqual(check(broken, lib), [], `${id} 0점 고정이 통과한다`);
    }
  });

  it("합격선 — ★ 0점 하나면 합계가 높아도 불합격, 수동 입력이 있으면 16/20으로 판정", () => {
    const g = scoreSession(GOOD, lib, { Q5: 2, Q7: 2, Q9: 2 });
    assert.equal(g.total, 20);
    assert.equal(g.pass, true);
    const low = scoreSession(GOOD, lib, { Q5: 0, Q7: 0, Q9: 0 });
    assert.equal(low.total, 14);
    assert.equal(low.pass, false); // 14 < 16
    const star = scoreSession(LEAK, lib, { Q5: 2, Q7: 2, Q9: 2 });
    assert.deepEqual(star.starZero.sort(), ["Q10", "Q3", "Q8"]); // LEAK은 끝(goal)에도 못 갔다
    assert.equal(star.pass, false);
  });

  it("폴더 채점 — 변형별 합격 · md 표(수동 칸 · 답답함 표시)", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "realism-"));
    try {
      writeFileSync(path.join(dir, "good.json"), JSON.stringify(GOOD));
      writeFileSync(path.join(dir, "dead.json"), JSON.stringify(DEAD));
      const result = scoreDir(dir, lib);
      assert.equal(result.rows.length, 2);
      const byKey = Object.fromEntries(result.variants.map((v) => [v.key, v.pass]));
      assert.equal(byKey["family-accident-deepvoice/fv-good"], true);
      assert.equal(byKey["family-accident-deepvoice/fv-dead"], false);
      const md = renderMarkdown(result, dir);
      assert.match(md, /수동/);
      assert.match(md, /답답함 표시 1판/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("기준선 계획 생성기 — 승인된 32판(A 28 + B 2 + C 2) 안에서 묶음 A · B · C를 만든다", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "realism-plan-"));
    try {
      const gen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "realism-baseline-plan.mjs");
      const run = spawnSync(process.execPath, [gen, "--out", dir], { encoding: "utf8" });
      assert.equal(run.status, 0, run.stderr);
      const summary = JSON.parse(run.stdout.trim());
      assert.ok(summary.A <= 28 && summary.B === 2 && summary.C === 2 && summary.total <= 32, JSON.stringify(summary));
      const plan = (n) => JSON.parse(readFileSync(path.join(dir, `plan-${n}.json`), "utf8"));
      assert.deepEqual(plan("B").map((e) => [e.variant, e.persona]), [["fv-h5sz", "allIn"], ["fv-h5sz", "asker"]]);
      assert.deepEqual(plan("C").map((e) => [e.variant, e.persona]), [["fv-k268", "allIn"], ["fv-c5fj", "allIn"]]);
      assert.ok(plan("A").every((e) => e.persona === "comply" && e.variant && e.level && ["voice", "multicall"].includes(e.ch)));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("프로브 화면 제출 미러(--mirror-selftest) — 보낸 금액 · 비교 결과 · 남은 합계 불변식(Z4 · SF가 바뀌어도 성립)", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "realism-probe-"));
    try {
      writeFileSync(path.join(dir, "secret.txt"), "GEMINI_API_KEY2=fake-not-used\n");
      writeFileSync(path.join(dir, "plan.json"), "[]");
      const probe = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "full-audit-probe.mjs");
      const run = spawnSync(process.execPath, [probe, "--secret", path.join(dir, "secret.txt"), "--plan", path.join(dir, "plan.json"), "--out", dir, "--mirror-selftest"], { encoding: "utf8" });
      assert.equal(run.status, 0, run.stderr);
      const out = JSON.parse(run.stdout.trim().split("\n").at(-1));
      assert.equal(out.mirror, true, "클라 은행 모듈을 못 불러왔다 — 미러 없음");
      const demand = 500_000;
      let sent = 0;
      let prevRemaining = Infinity;
      for (const step of out.allIn) {
        assert.ok(step.remaining <= prevRemaining, "남은 합계가 늘었다");
        prevRemaining = step.remaining;
        if (step.blocked) { assert.equal(step.sentAmount, 0); continue; }
        sent += step.sentAmount;
        assert.ok(sent <= demand, "요구액을 넘겨 보냈다(allIn은 요구액까지만)");
        assert.equal(step.comparison, sent < demand ? "less" : sent === demand ? "equal" : "more");
      }
      const c = out.comply[0];
      assert.ok(c.blocked || (c.sentAmount <= demand && c.comparison === (c.sentAmount < demand ? "less" : "equal")));
      assert.equal(c.demand, "500,000");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
