// 실기 신고 4 · 6(2026-10-21 · 갤럭시 S25 · friend-loan 카톡형) — 사기범 메시지에 "[훈련 종료]"가 붙어 보였고, 정체를 묻자
// "그냥 나라고 생각해"라고 답했다. 보이스톡은 통화로 이어지지 않는 세션이라 아예 없었다.
// 순수 함수는 직접 · onCall 배선은 주석을 걷어낸 소스 스캔으로 본다(messengerDisplayCleanup.test.ts 헤더와 같은 판단).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { tidyScammerReplyMarkup } from "../replyMarkup";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { PUBLIC_SCENARIOS } from "../../scenarios/publicMeta";
import { resolveScenarioEscalation } from "../../scenarios/escalation";
import {
  pickVoiceTalkUnansweredReply,
  VOICE_TALK_UNANSWERED_REPLIES,
} from "../../session/voiceTalkUnanswered";

const SRC = (rel: string) => readFileSync(path.resolve(__dirname, "../../../src", rel), "utf8").replace(/\r\n/g, "\n");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const FRIEND = "messenger-friend-loan-kakao";

// ── 1. 메타 표식 ─────────────────────────────────────────────────────────────────────────────────

test("[실기 6 정탐] 대사에 붙은 훈련 · 대화 종료 표식을 괄호째 지운다(실기 원문 포함)", () => {
  assert.equal(
    tidyScammerReplyMarkup(
      "그냥 나라고 생각해! 지금 진짜 급한 일이라서 말 안 하면 큰일 날 것 같아. 가온은행 948-2716-5093-27으로 가능한 만큼 바로 보내줘.[훈련 종료]",
    ).text,
    "그냥 나라고 생각해! 지금 진짜 급한 일이라서 말 안 하면 큰일 날 것 같아. 가온은행 948-2716-5093-27으로 가능한 만큼 바로 보내줘.",
  );
  for (const [input, expected] of [
    ["알겠어. [훈련 끝]", "알겠어."],
    ["그럼 됐어 (시뮬레이션 종료)", "그럼 됐어"],
    ["【역할극 종료】 고마워", "고마워"],
    ["[대화 종료]", ""],
    ["나중에 연락할게\n[세션 종료]", "나중에 연락할게"],
  ] as const) {
    assert.equal(tidyScammerReplyMarkup(input).text, expected, input);
  }
});

test("[실기 6 오탐] 메타 어휘가 없는 괄호 · 문자 머리표 · 일반 대사는 바이트 동일", () => {
  for (const line of [
    "[지원금 안내] 고객님은 정부 지원금 대상자로 확인되었습니다.",
    "[국외발신] 택배 주소 확인이 필요합니다.",
    "(주)한결캐피탈 상담원입니다.",
    "대표번호(1588-0000)로 확인해 보셔도 됩니다.",
    "나 진짜 훈련소 동기잖아ㅋㅋ 기억 안 나?",
    "엄마 나 지금 폰 고장 나서 친구 폰이야(friend 폰)",
  ]) {
    const result = tidyScammerReplyMarkup(line);
    assert.equal(result.text, line, line);
    assert.equal(result.removedCount, 0, line);
  }
});

// ── 2. 지인 사칭 프롬프트 ────────────────────────────────────────────────────────────────────────

test("[실기 6] friend-loan 페르소나 — 종료 버튼 · '마무리된다' 언급 0 · 정체 질문 처리 · 끝내지 않기 줄이 있다", () => {
  const { personaPrompt, weakenedTactics } = SCENARIO_PROMPTS[FRIEND];
  assert.equal(personaPrompt.includes("훈련 종료"), false, "모델이 '[훈련 종료]'를 흉내 낼 단서");
  assert.equal(personaPrompt.includes("마무리된다"), false, "대화를 스스로 마무리해도 된다는 단서(§50.7.2와 같은 결)");
  assert.ok(personaPrompt.includes("정체를 물으면 진짜 지인처럼 말이 되게 받는다"));
  assert.ok(personaPrompt.includes("정체를 묻는 말에는 매번 그 물음에 직접 답하는 문장으로 시작한다"));
  // 프로브(2026-10-22) — 금지 예로 실기 원문을 인용하자 초급에서 그 말을 그대로 했다 ⇒ 원문 인용 0(긍정 지시만).
  assert.equal(personaPrompt.includes("그냥 나라고"), false, "실기 원문 인용이 오히려 그 말을 유도한다");
  assert.ok(personaPrompt.includes("이름 자리를 OOO·000 같은 빈칸 표기로 채우지 않는다"), "프로브 — 이름 자리 '000'");
  assert.ok(personaPrompt.includes("이름은 상대가 너를 짐작해 먼저 말한 것만 쓰고 네가 지어내지 않는다"), "N4(T92) 유지 · §107 짐작한 이름으로 좁힘");
  // §107(2026-10-22 실기 신고) — 참가자가 자기를 다른 사람이라고 장난치면 그 이름을 받아 쓰지 않는다.
  assert.ok(personaPrompt.includes("상대가 자기 자신을 다른 사람이라고 하거나 이름으로 장난을 치면 그 이름을 받아 쓰지 않는다"));
  assert.equal(personaPrompt.includes("성섭"), false, "실기 원문 인용이 오히려 그 말을 유도한다(위 '그냥 나라고'와 같은 원칙)");
  assert.ok(personaPrompt.includes("의심을 받았다고 대화를 끝내지 않는다"));
  assert.ok(personaPrompt.includes("괄호 표시를 붙이지 않는다"));
  const pivot = weakenedTactics.filter((t) => t.startsWith("부인 시 친분 호소"));
  assert.equal(pivot.length, 1);
  assert.ok(pivot[0].includes("상대가 너를 짐작해 이름을 대면 그 사람인 척 받아"));
  assert.ok(pivot[0].includes("이름을 먼저 대지 않은 채"), "N4 유지");
});

test("[실기 6] 다른 시나리오 페르소나는 이번 변경과 무관하다(새 줄이 friend-loan에만 있다)", () => {
  for (const [id, doc] of Object.entries(SCENARIO_PROMPTS)) {
    if (id === FRIEND) continue;
    assert.equal(doc.personaPrompt.includes("정체를 물으면 진짜 지인처럼"), false, id);
  }
});

// ── 3. 보이스톡 응답 없음 ────────────────────────────────────────────────────────────────────────

test("[실기 4] 응답 없음 문면 — 시도 순서로 돌려 쓰고 연속 중복이 없다 · 반말 · 숫자 · 링크 0", () => {
  const seq = [0, 1, 2, 3, 4, 5].map(pickVoiceTalkUnansweredReply);
  for (let i = 1; i < seq.length; i += 1) assert.notEqual(seq[i], seq[i - 1]);
  assert.equal(pickVoiceTalkUnansweredReply(-3), VOICE_TALK_UNANSWERED_REPLIES[0]);
  assert.equal(pickVoiceTalkUnansweredReply(Number.NaN), VOICE_TALK_UNANSWERED_REPLIES[0]);
  for (const line of VOICE_TALK_UNANSWERED_REPLIES) {
    assert.doesNotMatch(line, /\d|http|습니다|세요/, line);
    assert.match(line, /톡/, "채팅으로 돌린다");
  }
});

test("[실기 4] 응답 없음 분기 대상 = 통화로 이어지지 않는 카톡형뿐(오늘 friend-loan 1종) · 세 난이도", () => {
  const targets = Object.entries(PUBLIC_SCENARIOS)
    .filter(([, meta]) => meta.surface === "kakao")
    .filter(([, meta]) => ["beginner", "intermediate", "advanced"].some((lv) => !resolveScenarioEscalation(meta, lv)))
    .map(([id]) => id);
  assert.deepEqual(targets, [FRIEND]);
});

test("[실기 4] requestEscalation — 전이 불가 분기 안에서만 via=voice_talk · 카톡형이면 응답 없음, 그 밖은 종전 거부", () => {
  const code = codeOnly(SRC("session/index.ts"));
  const start = code.indexOf("export const requestEscalation");
  const body = code.slice(start, code.indexOf("export const requestReverseEscalation"));
  assert.match(
    body,
    // A2 ㉢(2026-11-01) — 전환 판정은 `resolveTransitionNow` · 목소리 복제 짧은 통화 시나리오의 보이스톡도 같은 분기(늘 응답 없음).
    /if \(!resolveTransitionNow\(session, PUBLIC_SCENARIOS\) \|\| \(via === "voice_talk" && voiceTalkNeverAnswered\)\) \{\s*if \(via === "voice_talk" && PUBLIC_SCENARIOS\[session\.scenarioId\]\?\.surface === "kakao"\) \{\s*const turnIndex = await recordVoiceTalkUnanswered\(db, sessionId\);\s*return \{ voiceTalk: "unanswered", turnIndex \};\s*\}\s*throw new HttpsError\("failed-precondition", "이 시나리오는 통화 전이를 지원하지 않습니다\."\);/,
  );
  assert.ok(body.indexOf("assertAnonymousChallengeScope") < body.indexOf("recordVoiceTalkUnanswered"), "소유 · 익명 범위 검사 뒤");
  const record = codeOnly(SRC("session/voiceTalkUnanswered.ts"));
  assert.match(record, /history\[history\.length - 1\]\.role === "user"[\s\S]*?throw new HttpsError\("failed-precondition"/, "답장 생성 중 거부(4행)");
  assert.match(record, /turnIndex: history\.length/);
  assert.equal(/getLlm|complete\(|LLM_TEXT/.test(record), false, "LLM 호출 0");
});
