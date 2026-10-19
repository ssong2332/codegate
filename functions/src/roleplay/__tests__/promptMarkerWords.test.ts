// T187 — G446: 프롬프트 **대사 층**에 세션 중 표식 낱말이 없다 (docs/Architecture.md §72.5 D5 ·
// §72.7 G446 · PRD v1.18 AC-086 (e) — "PRD v1.18 AC-086 · T187 · §72").
//
// 층 경계(§72.5 D5 표 — ⛔ 이 표대로만):
//   P-1 따옴표('…' "…" “…”) 안의 대사 예시           → 대사 층(T1) — 낱말 0 · 허용목록 없음
//   P-2 행동·요구 예시 목록                           → 대사 층 — 아래 T2가 덮는다(허용목록 밖이면 실패)
//   P-3 `[…]` 섹션 제목                               → 대사 층(T1) — 낱말 0
//   P-4 상황·제약 서술문(가드레일·무해화·범위 지시)   → 메타 층(T2) — 낱말이 있으면 닫힌 허용목록에 있어야 한다
//
// ⚠️ 구현 중 발견 2건(설계 목록 밖 — 보고에 올렸다):
//   ① 기존 프롬프트가 메타 규칙을 **따옴표로 자기 인용**한다(`"페이로드는 가상값만 쓴다"` — 같은 프롬프트
//      따옴표 밖에 그 문장이 그대로 있다). 이것은 대사 예시(P-1)가 아니라 메타 규칙의 상호 참조라,
//      **같은 텍스트의 따옴표 밖 본문에 글자 그대로 있는 인용구**만 메타 층(T2)으로 판정한다. 대사
//      예시(`'가상값으로 보내드릴게요'`)는 본문에 없으므로 여전히 T1에서 잡힌다(아래 역검증).
//   ② 허용목록에 `"가상 은행"` 1행을 더했다 — `"OO"은 … 이 훈련에서 쓰는 가상 은행의 이름이다`
//      (자리표시자가 실존 은행이 아님을 모델에게 알리는 무해화 메타 서술, P-4 · AC-005). 설계 목록 4행만으로는
//      이 문장이 T2에 걸린다. 문장을 고치는 것은 무해화 지시 변경이라 금지(X-2)이므로 목록을 넓혔다.
//
// ⛔ 모델 실제 발화는 보지 않는다(AC-086 (e) — 문면만 보증) · 시나리오 콘텐츠 낱말 검사가 아니다(X-8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../promptAssembly";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { IN_CALL_SMS } from "../../scenarios/inCallSms";
import { hasVerifyIntercept, VERIFY_INTERCEPT } from "../../scenarios/verifyIntercept";
import { MOCK_INSTALL_CONSENT_INSTRUCTION } from "../../scenarios/mockScreens";
import { MOCK_INSTALL_CONSENT_INSTRUCTION_IN_CALL } from "../../scenarios/mockScreens";
import { buildConfirmResultInstruction, buildLiveConfirmResultInstruction } from "../../inCallSms/confirmResult";
import { ESCALATED_CALL_CONTEXT_INSTRUCTION } from "../escalatedCall";
import { isL3Procedural } from "../l3Depth";
import { asksIdentityCheck } from "../personaAuthority";
import { speakerGenderFor } from "../../realtime/scenarioVoice";
import { declaresOfferVerificationDesk } from "../../realtime/liveTools";
import { SESSION_MARKER_WORDS } from "../../scenarios/__tests__/sessionMarkerWords";

/** 메타 층(P-4)에서만 허용되는 구간 — 닫힌 목록. 항목마다 사유. */
const PROMPT_META_ALLOWLIST: readonly { phrase: string; reason: string }[] = [
  { phrase: "가상값", reason: "무해화 지시 — 페이로드는 가상값만(AC-005)" },
  { phrase: "가상으로 다룬다", reason: "무해화 지시 — 실제 카드사명 대신 값을 가상으로(AC-005)" },
  { phrase: "이미 재현하는 것", reason: "범위 지시 — 선행 요구 원천을 이 훈련이 하는 것으로 제한(§43)" },
  { phrase: "네가 재현하는 것은", reason: "범위 지시 — 절차의 형식만 재현(§17 D4)" },
  { phrase: "가상 은행", reason: "무해화 지시 — 'OO' 자리표시자가 실존 은행이 아님(AC-005) · T187 implementer 추가" },
];

type Span = { start: number; end: number; content: string };
type MarkerHit = { layer: "T1" | "T2"; word: string; excerpt: string };

/** 줄 안에서만 짝짓는 따옴표 구간(줄을 넘는 짝짓기는 하지 않는다 — 짝 안 맞는 따옴표가 구간을 부풀리지 않게). */
function quotedSpans(text: string): Span[] {
  const spans: Span[] = [];
  for (const match of text.matchAll(/'[^'\n]*'|"[^"\n]*"|“[^”\n]*”/g)) {
    const start = match.index ?? 0;
    spans.push({ start, end: start + match[0].length, content: match[0].slice(1, -1) });
  }
  return spans;
}

/** `[…]`로 시작하는 줄의 제목 부분(P-3). */
function titleSpans(text: string): Span[] {
  const spans: Span[] = [];
  for (const match of text.matchAll(/^[ \t]*\[[^[\]\n]+\]/gm)) {
    const start = match.index ?? 0;
    spans.push({ start, end: start + match[0].length, content: match[0] });
  }
  return spans;
}

function scanPromptMarkers(text: string): MarkerHit[] {
  const quotes = quotedSpans(text);
  const titles = titleSpans(text);
  // 따옴표 구간을 지운 본문(굵게 표기 제거) — 자기 인용 판정용.
  let unquoted = text;
  for (const q of [...quotes].reverse()) {
    unquoted = unquoted.slice(0, q.start) + " ".repeat(q.end - q.start) + unquoted.slice(q.end);
  }
  unquoted = unquoted.replace(/\*\*/g, "");
  // ⭐ reviewer M1(2026-10-18) — 자기 인용 판정을 조였다. 부분 문자열 일치(includes)만으로는 짧은 대사
  // 예시(`'가상값'`)가 본문 허용 구간 글자열과 겹치기만 해도 통과했다. 이제 둘 다 만족해야 자기 인용이다:
  //   ① 본문 길이 ≥ SELF_CITATION_MIN_LENGTH(짧은 낱말 단위 인용은 대사로 본다)
  //   ② 따옴표 밖 본문에 **독립 구절**로 등장(앞뒤가 문장 경계 — 다른 낱말 속 부분 일치 불인정)
  const SELF_CITATION_MIN_LENGTH = 8;
  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const isSelfCitation = (q: Span) => {
    const body = q.content.replace(/\*\*/g, "").trim();
    if (body.length < SELF_CITATION_MIN_LENGTH) return false;
    return new RegExp(`(^|[\\s(\\-·,:])${escapeRegExp(body)}($|[\\s.,)·!?:])`, "m").test(unquoted);
  };
  const quoteAt = (pos: number) => quotes.find((q) => q.start <= pos && pos < q.end);
  const inTitle = (pos: number) => titles.some((t) => t.start <= pos && pos < t.end);
  // 허용 구간은 **따옴표 밖** 출현만 센다 — 자기 인용 따옴표 안의 글자열도 허용 근거가 되지 않는다(M1).
  const allowed = (pos: number, length: number) =>
    PROMPT_META_ALLOWLIST.some(({ phrase }) => {
      for (let i = text.indexOf(phrase); i >= 0; i = text.indexOf(phrase, i + 1)) {
        if (i <= pos && pos + length <= i + phrase.length && !quoteAt(i)) return true;
      }
      return false;
    });

  const hits: MarkerHit[] = [];
  for (const word of SESSION_MARKER_WORDS) {
    for (let pos = text.indexOf(word); pos >= 0; pos = text.indexOf(word, pos + 1)) {
      const excerpt = text.slice(Math.max(0, pos - 30), pos + word.length + 30).replace(/\r?\n/g, " ⏎ ");
      const quote = quoteAt(pos);
      if (inTitle(pos)) hits.push({ layer: "T1", word, excerpt });
      else if (quote && !isSelfCitation(quote)) hits.push({ layer: "T1", word, excerpt });
      // 자기 인용 따옴표 안 낱말은 여기서 허용하지 않고 **원문 자리**에서 판정한다 — 원문은 따옴표 밖이라
      // 같은 루프가 그 위치에서 따로 검사한다(②가 원문의 존재를 보장).
      else if (quote) continue;
      else if (!allowed(pos, word.length)) hits.push({ layer: "T2", word, excerpt });
    }
  }
  return hits;
}

const LEVELS = ["beginner", "intermediate", "advanced"] as const;

/** 실제 호출부(roleplay/index.ts · geminiProvider.ts · openingLine.ts)가 넘기는 플래그 그대로 조립한 전 문면. */
function assembledPromptTexts(): Set<string> {
  const texts = new Set<string>();
  for (const id of Object.keys(SCENARIO_PROMPTS)) {
    for (const difficultyLevel of LEVELS) {
      for (const inCallSmsEnabled of [false, true]) {
        for (const toolDrivenTiming of [false, true]) {
          texts.add(
            buildSystemPrompt(SCENARIO_PROMPTS[id], {
              difficultyLevel,
              inCallSmsEnabled,
              verifyInterceptEnabled: hasVerifyIntercept(id) && difficultyLevel === "advanced",
              l3Procedural: isL3Procedural(id),
              identityCheckAllowed: asksIdentityCheck(id),
              speakerGender: speakerGenderFor(id),
              toolDrivenTiming,
              offerToolDeclared: declaresOfferVerificationDesk(id, difficultyLevel),
            }),
          );
        }
      }
    }
    // 실 호출부의 inCallSmsEnabled(= hasInCallSms(id))는 위 true/false 양쪽에 포함된다.
    const verify = VERIFY_INTERCEPT[id];
    if (verify) {
      texts.add(verify.announceInstruction);
      texts.add(verify.reconnectInstruction);
    }
    for (const sms of IN_CALL_SMS[id] ?? []) texts.add(sms.announceInstruction);
  }
  texts.add(MOCK_INSTALL_CONSENT_INSTRUCTION);
  // A-1 ⑦⑧ — 새 서버 소유 턴 지시(폴백) · Live 응답 필드도 같은 게이트를 받는다.
  texts.add(MOCK_INSTALL_CONSENT_INSTRUCTION_IN_CALL);
  texts.add(ESCALATED_CALL_CONTEXT_INSTRUCTION);
  for (const purpose of ["transfer", "link"] as const) {
    texts.add(buildConfirmResultInstruction(purpose));
    texts.add(buildLiveConfirmResultInstruction(purpose));
  }
  return texts;
}

test("[T187/G446] 전 시나리오 × 3난이도 × 문자 on/off × 도구 타이밍 on/off(실 플래그)의 조립 프롬프트와 턴 지시에 대사 층 표식 낱말이 0건이다", (t) => {
  const texts = assembledPromptTexts();
  assert.ok(texts.size >= Object.keys(SCENARIO_PROMPTS).length, "조립 문면이 시나리오 수보다 적다 — 매트릭스가 비었다");
  const hits = [...texts].flatMap((text) => scanPromptMarkers(text));
  const unique = [...new Set(hits.map((h) => `${h.layer} ${h.word} :: ${h.excerpt}`))];
  assert.deepEqual(unique, [], "프롬프트 대사 층(또는 허용목록 밖 메타 층)에 세션 중 표식 낱말이 있다");
  for (const text of texts) {
    assert.equal(text.includes("조회용 모의 앱 설치"), false, "옛 문면 '조회용 모의 앱 설치'가 남아 있다(§72.5 D5)");
  }
  t.diagnostic(`G446: 조립 문면 ${texts.size}종 · 낱말 ${SESSION_MARKER_WORDS.length}개 · 허용목록 ${PROMPT_META_ALLOWLIST.length}행 → T1 0 / T2 0`);
});

test("[T187/G446 역검증] 옛 문면 복원 → T2 검출 · 따옴표 대사 예시 → T1 검출(허용목록 무효) · 메타 문장 → 0", (t) => {
  const restored = scanPromptMarkers("선행 요구는 고른다(본인확인 항목 확인, 안내 문자·링크 확인, 조회용 모의 앱 설치 등).");
  assert.ok(restored.some((h) => h.layer === "T2" && h.word === "모의"), "옛 문면 복원을 T2가 놓쳤다");

  const dialogue = scanPromptMarkers("- 예: '가상값으로 보내드릴게요'라고 말한다.");
  assert.ok(dialogue.some((h) => h.layer === "T1" && h.word === "가상"), "따옴표 대사 예시를 T1이 놓쳤다(허용목록이 대사 층에 새면 안 된다)");

  // reviewer M1 — 짧은 대사 예시가 본문 허용 구간 글자열과 겹쳐도 자기 인용으로 빠지지 않는다.
  const shortDialogue = scanPromptMarkers("- 계좌는 가상값으로만 부른다.\n- 예: '가상값'이라고 말한다.");
  assert.ok(shortDialogue.some((h) => h.layer === "T1" && h.word === "가상"), "짧은 대사 예시('가상값')를 T1이 놓쳤다(M1)");
  // reviewer M1 — 길어도 본문에서 **다른 구절의 일부**로만 겹치면(독립 구절 아님) 자기 인용이 아니다.
  const partialOverlap = scanPromptMarkers("- 계좌는 가상값으로만 부른다.\n- 예: '계좌는 가상값으로'라고 말한다.");
  assert.ok(partialOverlap.some((h) => h.layer === "T1" && h.word === "가상"), "부분 겹침 인용을 자기 인용으로 오판했다(M1)");

  const title = scanPromptMarkers("[모의 앱 설치 유도 — 이 훈련의 2단계]\n- 본문");
  assert.ok(title.some((h) => h.layer === "T1" && h.word === "모의"), "섹션 제목(P-3)을 T1이 놓쳤다");

  const meta = scanPromptMarkers(
    '- **페이로드는 가상값만 쓴다.** 계좌는 가상값으로만 부른다.\n- 위 "페이로드는 가상값만 쓴다"가 그대로 적용된다.',
  );
  assert.deepEqual(meta, [], "메타 문장·자기 인용이 오검출됐다");

  t.diagnostic(
    `G446 역검증: 복원 T2 ${restored.length} · 대사 T1 ${dialogue.length} · 짧은 대사 T1 ${shortDialogue.length} · 부분 겹침 T1 ${partialOverlap.length} · 제목 T1 ${title.length} · 메타 ${meta.length}`,
  );
});
