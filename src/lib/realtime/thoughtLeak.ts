// 실시간 통화 사기범 전사·재생에서 모델의 영어 사고 문장 걸러내기 — 화면 쪽 (2026-10-23, Architecture.md §116 · DECISIONS #231).
//
// 판정표 정본은 서버 사본 `functions/src/realtime/thoughtLeak.ts` 머리 주석이다(행 1~4). 이 파일은 그 사본에 더해
//  (a) 통화 중 재생을 잠시 막는 스트리밍 게이트(`stepThoughtLeakGate`)와
//  (b) 사고 파트(`thought: true`)를 뺀 오디오 추출(`pickLiveAudioData`)을 가진다.
//
// 게이트 판정표(출력 전사 조각마다 · 턴 경계에서 초기화):
// | 행 | 상태        | 조건                                                                          | 다음 상태 · 동작                         |
// |----|-------------|-------------------------------------------------------------------------------|------------------------------------------|
// | G1 | 통과        | 이 턴 누적 전사가 `thought` 표지로 시작하고 아직 한글 0                        | 막음 · 예약 재생 중단(`startSuppress`)    |
// | G2 | 통과        | 누적 전사 끝의 한글 없는 구간 라틴 단어 ≥ `THOUGHT_SPAN_MIN_WORDS`             | 막음 · 예약 재생 중단                     |
// | G3 | 막음        | 이번 조각에 한글이 있고 한글 수 ≥ 라틴 글자 수                                 | 통과(다음 오디오부터 재생)               |
// | G4 | 어느 쪽이든 | 턴 경계(`turnComplete` · `interrupted`)                                       | 처음 상태                                |
// | G5 | 그 밖       | —                                                                             | 그대로                                   |
// ⚠️ 전사는 오디오보다 늦게 올 수 있다 — 막기 전에 이미 예약된 영어 오디오는 `startSuppress`에서 끊고, 그보다 앞서
//    재생된 소리는 되돌릴 수 없다. 풀린 직후 한국어 대사 첫 조각 오디오가 막힌 구간에 걸리면 앞머리가 잘릴 수 있다(대가).
//
// ⛔ 아래 "사본 시작" ~ "사본 끝" 구간은 서버 사본과 **글자까지 같아야 한다**(`thoughtLeak.test.ts`가 대조한다).

// ── 사본 시작 ──
/** 행 2의 문턱 — 한글 없는 구간에 이만큼 이상 라틴 단어가 있으면 사고 문장으로 본다(판단값). */
export const THOUGHT_SPAN_MIN_WORDS = 8;

const HANGUL = /[가-힣ㄱ-ㆎ]/;
const NON_HANGUL_SPAN = /[^가-힣ㄱ-ㆎ]+/g;
const LATIN_WORD = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;
const THOUGHT_MARKER = /^[\s*]*thought(?=[\s:*]|$)[\s:*]*/i;
const LEADING_PUNCT = /^[.,!?…~。]*/;
/** 행 2-b(§129 D3) — 도구 호출 문자열(`send_prepared_sms(purpose="transfer")`처럼 밑줄 식별자 + 괄호 인자, 백틱 감싸기 허용). */
const TOOL_CALL_TEXT = /`*\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\s*\([^()\n]{0,80}\)`*/g;

function latinWordCount(text: string): number {
  return (text.match(LATIN_WORD) ?? []).length;
}

/** 앞머리 `thought` 표지(행 1)가 있는가. */
export function hasThoughtMarker(text: string): boolean {
  return THOUGHT_MARKER.test(text);
}

/** 사기범 전사 1턴에서 사고 문장을 지운다. 지울 것이 없으면 원문을 그대로 돌려준다(행 3). */
export function stripLeakedThought(text: string): string {
  let rest = text;
  let stripped = false;
  const marker = rest.match(THOUGHT_MARKER);
  if (marker) {
    const after = rest.slice(marker[0].length);
    const firstHangul = after.search(HANGUL);
    rest = firstHangul < 0 ? "" : after.slice(firstHangul);
    stripped = true;
  }
  rest = rest.replace(TOOL_CALL_TEXT, () => {
    stripped = true;
    return " ";
  });
  rest = rest.replace(NON_HANGUL_SPAN, (span) => {
    if (latinWordCount(span) < THOUGHT_SPAN_MIN_WORDS) return span;
    stripped = true;
    return `${span.match(LEADING_PUNCT)?.[0] ?? ""} `;
  });
  if (!stripped) return text;
  return rest.replace(/\s+/g, " ").trim();
}
// ── 사본 끝 ──

/** 저장된 메시지를 화면에 그릴 때 — 사기범 줄만 거른다(참가자 줄은 원문). */
export function cleanStoredLine(role: "scammer" | "user", text: string): string {
  return role === "scammer" ? stripLeakedThought(text) : text;
}

export type ThoughtLeakGateState = { turnText: string; suppressing: boolean };
export const INITIAL_THOUGHT_LEAK_GATE_STATE: ThoughtLeakGateState = { turnText: "", suppressing: false };

export type ThoughtLeakGateEvent = { type: "transcript"; text: string } | { type: "boundary" };

function trailingSpanWords(text: string): number {
  const tail = text.match(/[^가-힣ㄱ-ㆎ]*$/)?.[0] ?? "";
  return latinWordCount(tail);
}

/** 위 게이트 판정표(G1~G5). `startSuppress`가 참이면 호출부는 예약된 재생을 끊는다. */
export function stepThoughtLeakGate(
  state: ThoughtLeakGateState,
  event: ThoughtLeakGateEvent,
): { state: ThoughtLeakGateState; startSuppress: boolean } {
  if (event.type === "boundary") return { state: INITIAL_THOUGHT_LEAK_GATE_STATE, startSuppress: false };
  const turnText = state.turnText + event.text;
  if (state.suppressing) {
    const hangul = (event.text.match(/[가-힣ㄱ-ㆎ]/g) ?? []).length;
    const latin = (event.text.match(/[A-Za-z]/g) ?? []).length;
    return { state: { turnText, suppressing: !(hangul > 0 && hangul >= latin) }, startSuppress: false };
  }
  const leading = !HANGUL.test(turnText) && hasThoughtMarker(turnText);
  if (leading || trailingSpanWords(turnText) >= THOUGHT_SPAN_MIN_WORDS) {
    return { state: { turnText, suppressing: true }, startSuppress: true };
  }
  return { state: { turnText, suppressing: false }, startSuppress: false };
}

export type LiveContentPart = { thought?: boolean; inlineData?: { data?: string } };

/**
 * 모델 턴 파트에서 재생할 오디오(base64)를 모은다 — 사고 파트(`thought: true`)는 뺀다.
 * SDK `LiveServerMessage.data` 게터는 `thought`를 보지 않고 모든 `inlineData`를 잇는다(@google/genai 2.13.0 `index.cjs`).
 * 이어 붙이는 방식은 그 게터와 같다(조각마다 디코드 → 이어 붙여 다시 인코드 — base64 채움 문자 때문).
 */
export function pickLiveAudioData(parts: readonly LiveContentPart[] | undefined): string | undefined {
  let bytes = "";
  for (const part of parts ?? []) {
    if (part.thought === true) continue;
    if (typeof part.inlineData?.data === "string") bytes += atob(part.inlineData.data);
  }
  return bytes.length > 0 ? btoa(bytes) : undefined;
}
