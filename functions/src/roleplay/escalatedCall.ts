// A-1 ⑧(2026-10-19 · audit-B 1일차 #2) — 메신저→통화 에스컬레이션 **뒤의 텍스트 폴백**에서 전화 예고를 되풀이하지 않게.
//
// 재현(messenger-subsidy-smishing-sms 중급 · 폴백): S3에서 `[[SIGNAL:ESCALATE_VOICE]]`로 채널이 voice로 넘어간 뒤에도
// 사기범이 "상담원이 곧바로 전화드릴게요"·"직접 전화드리겠습니다. 잠시만 기다려 주세요"를 5연속 말했다(전화는 이미
// 넘어왔다). 원인 두 갈래:
//   ① 페르소나의 [에스컬레이션] 규칙("그럼 상담원이 직접 전화드릴게요"라며 통화로 넘어가려 한다)은 채널이 이미 voice여도
//      그대로 실리고, 모델은 자기가 이미 통화 중이라는 사실을 모른다(폴백 프롬프트에 채널 정보가 없다).
//   ② 설치 응낙 턴 지시(`MOCK_INSTALL_CONSENT_INSTRUCTION`)가 "이제 담당자가 전화로 이어서 안내하겠다고 말하라"를
//      채널과 무관하게 싣는다.
// ⇒ 채널이 에스컬레이션으로 voice가 된 세션의 **폴백 턴**에만 ① 맥락 1줄을 싣고 ② 응낙 지시를 통화 중 변형으로 바꾼다.
// ⛔ Live(실시간)는 이 경로가 아니다 — 폴백(`sendMessage`)만 부른다. ⛔ 채널 전이 판정(`transitionChannel` · 구조화 신호)은
//    무접촉이다. ⛔ 잎 모듈(타입 import만).
import type { ChannelTransitionEntry, MessengerChannel, ScenarioPromptDoc } from "../shared/types";

/**
 * 판정표:
 * | If | Then |
 * |---|---|
 * | `channel !== "voice"` | `false`(메신저 단계 · 채널 미표기 보이스 세션) |
 * | 전이 기록에 messenger→voice가 없다 | `false`(처음부터 통화로 시작한 세션 — 예고할 일이 애초에 없다) |
 * | 그 외 | `true` |
 */
export function isEscalatedVoiceCall(
  channel: MessengerChannel | undefined,
  channelHistory: readonly ChannelTransitionEntry[] | undefined,
): boolean {
  if (channel !== "voice") return false;
  return (channelHistory ?? []).some((entry) => entry.from === "messenger" && entry.to === "voice");
}

/**
 * §131(14) — 메신저에서 넘어온 통화의 **통화 진입 뒤** 참가자 발화 수(이번 발화 포함 · 끊기 판정 5행 입력 `turnsSinceCallEntry`).
 * 기준 = 가장 최근 `messenger → voice` 전환 시각. 그 뒤에 저장된 통화 채널 참가자 메시지 + 1(이번 발화).
 * | If | Then |
 * |---|---|
 * | 메신저에서 넘어온 통화가 아니다(`isEscalatedVoiceCall` 거짓) | `undefined`(종전 — 세션 전체 발화만) |
 * | 그 밖 | 위 개수 |
 * ⚠️ 전환 기록에 턴 수가 없어(`turnCountAtTransition`은 메신저 복귀에만 기록) 시각으로 센다.
 */
export function userTurnsSinceCallEntry(
  channel: MessengerChannel | undefined,
  channelHistory: readonly ChannelTransitionEntry[] | undefined,
  history: readonly { role: "scammer" | "user"; channel?: MessengerChannel; createdAt: { toMillis(): number } }[],
): number | undefined {
  if (!isEscalatedVoiceCall(channel, channelHistory)) return undefined;
  const entries = (channelHistory ?? []).filter((entry) => entry.from === "messenger" && entry.to === "voice");
  const since = entries[entries.length - 1].at.toMillis();
  return history.filter((m) => m.role === "user" && m.channel === "voice" && m.createdAt.toMillis() >= since).length + 1;
}

/** 에스컬레이션 뒤 폴백 턴의 맥락 1줄(서버 소유 · 횟수 0 · 따옴표 대사 예시 0). */
export const ESCALATED_CALL_CONTEXT_INSTRUCTION =
  "(이 대화는 이미 전화 통화로 넘어와 있다 — 지금 너는 상대와 통화하고 있다. 전화를 걸겠다거나 전화드리겠다거나 연결될 때까지 기다려 달라는 말을 다시 하지 말고, 이 통화 안에서 하던 안내를 바로 이어간다.)";

/**
 * 2026-10-21 라이브 실측(child-kakao · 통화 첫 발화 "액정 나가서 통화가 아예 안 된다니까?") — 채팅 단계에서만 말이 되는 수법 라벨.
 * 통화로 넘어온 뒤 Mock 강등 턴(시스템 프롬프트를 읽지 않고 수법 원문만 돌려 쓴다)에서도 "통화가 안 돼" 대사가 나오지 않게,
 * 에스컬레이션 뒤 폴백 턴의 `mockTacticHints`에서 이 라벨들을 뺀다. LLM 경로의 같은 규칙은 페르소나 블록(`CHILD_CALL_PHASE_RULE`)이 진다.
 * ⚠️ 오늘 이 라벨을 쓰는 에스컬레이션 시나리오는 child-kakao뿐이다(처음부터 통화인 시나리오는 `escalatedCall`이 거짓이라 무관).
 */
export const CHAT_ONLY_TACTIC_LABELS: readonly string[] = ["확인 전화 차단 유도", "원격 확인 차단"];

/**
 * 판정표:
 * | If | Then |
 * |---|---|
 * | `escalatedCall === false` | 원본 그대로(같은 배열 — 메신저 단계 · 처음부터 통화인 세션 바이트 동일) |
 * | 그 외 | 라벨(" — " 앞)이 `CHAT_ONLY_TACTIC_LABELS`인 항목만 뺀다. 다 빠지면 원본(Mock 대사 원천 0 방지) |
 */
export function callPhaseMockTacticHints(tactics: string[], escalatedCall: boolean): string[] {
  if (!escalatedCall) return tactics;
  const kept = tactics.filter((tactic) => {
    const dashIndex = tactic.indexOf("—");
    const label = (dashIndex === -1 ? tactic : tactic.slice(0, dashIndex)).trim();
    return !CHAT_ONLY_TACTIC_LABELS.includes(label);
  });
  return kept.length > 0 ? kept : tactics;
}

// ── Edge 시험 판 23 · 24(2026-11-07 · 택배 · 정부지원금 스미싱) — 이미 통화 중인데 "상담원이 직접 전화드릴게요"(+ `[[SIGNAL:ESCALATE_VOICE]]`) →
//    판 23은 아무 일도 없이 50초 무음. 원인: 통화 단계(Live 토큰 · 폴백 턴) 프롬프트에도 페르소나의 [에스컬레이션] 절 · "전화드릴게요" 줄 · "채널 전환 유도"
//    수법이 그대로 실린다(위 A-1 ⑧ 맥락 1줄은 폴백의 "다른 턴 지시가 없는 턴"에만 실리고 Live에는 없다). 모델이 지금 통화 중이라는 사실보다 페르소나 지시를 따랐다.
// ⇒ 메신저에서 넘어온 통화에서는 그 지시들을 빼고 통화 단계 절 1개로 바꾼다. 판정표(위에서 첫 매치):
// | # | If | Then |
// |---|---|---|
// | C0 | `escalatedCall === false`(메신저 단계 · 처음부터 통화인 세션) | 원본 그대로(같은 객체 — 바이트 동일) |
// | C1 | 페르소나에 `[에스컬레이션` 절이 있다 | 그 절(다음 `[` 절 앞까지)을 지운다 |
// | C2 | 페르소나 줄(`- `로 시작)이 전환 신호 토큰 · "전화드릴게요/전화드리겠" 예고를 담는다 | 그 줄을 지운다 |
// | C3 | 수법 항목이 전환 신호 토큰을 담는다 | 그 항목을 뺀다(다 빠지면 원본 — 수법 0 방지) |
// | C4 | C1 ~ C3 중 하나라도 지웠다 | 페르소나 끝에 `CALL_PHASE_BLOCK`(+ 통화 중 문자가 없는 세션이면 링크 줄)을 붙인다 |
// ⛔ 채널 전이 판정(`transitionChannel` · 구조화 신호 처리)은 무접촉 — 통화 단계에서 신호가 와도 서버가 무시하는 것은 그대로다.
/** 줄 머리의 절 제목부터(본문 속 "(아래 [에스컬레이션] 참고)" 같은 언급은 아니다) 다음 절 앞까지. */
const ESCALATION_SECTION = /\n\[에스컬레이션[^\]\n]*\]\n[\s\S]*?(?=\n\n\[|$)/;
const ESCALATION_TOKEN = "ESCALATE_VOICE";
const CALL_ANNOUNCE_LINE = /^- .*전화\s*드(?:릴게요|리겠)/;

/** C4 — 통화 단계 절(따옴표 대사 예시 0). */
export const CALL_PHASE_BLOCK = `[통화 단계 — 지금 이미 통화 중이다]
- 너는 문자에서 넘어와 지금 상대와 전화 통화를 하고 있다. 전화를 걸겠다, 상담원이 직접 전화하겠다, 상담을 연결해 주겠다, 잠시 기다려 달라는 말을 하지 않는다 — 그런 말을 하면 상대는 아무도 말하지 않는 전화기를 들고 기다리게 된다. 이 통화 안에서 네가 직접 안내를 이어간다.
- 상대가 의심하거나 거절하면 다른 사람에게 넘기지 말고 이 통화 안에서 마감 압박이나 명의 도용 걱정 같은 다른 말로 붙잡는다.`;

/**
 * C4 — 통화 중 문자를 선언하지 않은 세션: 통화 안에서는 새 링크를 보낼 수 없다.
 * ⭐ Edge 재시험 4(2026-11-08 · main `94a18fa9` · 정부지원금 스미싱 고급 · 세션 `30d32f49`) — 설치 · 권한 허용을 이미 마친 뒤 통화에서 이름 · 생년월일을
 * 받고 *"문자로 보내 드린 링크 화면에서 최종 확인 버튼을 눌러 신청을 완료해 주시면 됩니다"*(그 화면은 이미 끝났고 그런 버튼 0)라고 한 뒤 끊었다
 * (`requestScammerHangup` kind=goal · goalActionDone=true). 원인(추정 — 모델 입력 문면 기준): 이 줄의 옛 문면 *"화면이 필요하면 앞서 문자로 보낸 링크 화면에서
 * 하라고 한다"* 가 끝난 화면으로도 돌려보냈고, 남은 행동이 없을 때 어떻게 끝내는지가 없어 모델이 마지막 단계를 지어냈다(앞선 대화 맥락에는 설치 완료가 실려 있다).
 * 판정표 N(이 줄이 모델에게 주는 규칙):
 * | # | If | Then |
 * |---|---|---|
 * | N1 | 앞서 보낸 링크 화면을 상대가 아직 마치지 않았다 | 그 화면에서 마치라고만 한다(그 화면에 있는 설치 · 권한 허용 · 입력만) |
 * | N2 | 상대가 그 화면을 이미 마쳤다 | 그 화면을 다시 열거나 다시 누르라고 하지 않는다 |
 * | N3 | 남은 화면 행동이 없고 이 통화에서 물을 것에 답을 받았다 | 처리가 접수됐다고 말로만 알리고 통화를 마무리한다(버튼 · 화면 · 단계를 새로 만들어 끝을 미루지 않는다) |
 * | — | 어느 경우든 | 화면에 없는 버튼 · 단계(최종 확인 · 승인 · 완료 버튼, 권한 하나 더, 다른 앱 설치, 인증번호 입력)를 지어내 요구하지 않는다 |
 */
export const CALL_PHASE_NO_LINK_LINE =
  "- 통화 중에는 새 문자나 링크를 보낼 수 없다. 링크를 보내 주겠다고 말하지 않는다. 앞서 문자로 보낸 링크 화면은 상대가 아직 마치지 않았을 때만 그 화면에서 마치라고 하고, 이미 마쳤으면 그 화면을 다시 열거나 다시 누르라고 하지 않는다. 그 화면에 없는 버튼이나 단계(최종 확인 · 승인 · 완료 버튼, 권한을 하나 더 허용, 다른 앱 설치, 인증번호 입력)를 지어내 요구하지 않는다.\n- 상대가 해야 할 화면 행동이 남지 않았고 이 통화에서 물을 것에 답을 받았으면, 처리가 접수됐다고 말로만 알리고 통화를 마무리한다. 끝을 미루려고 새 버튼 · 화면 · 단계를 만들지 않는다.";

export function callPhaseScenarioPrompt(
  prompt: ScenarioPromptDoc,
  opts: { escalatedCall: boolean; inCallSmsEnabled: boolean },
): ScenarioPromptDoc {
  if (!opts.escalatedCall) return prompt; // C0
  const withoutSection = prompt.personaPrompt.replace(ESCALATION_SECTION, "").replace(/\n{3,}/g, "\n\n"); // C1
  const persona = withoutSection
    .split("\n")
    .filter((line) => !(line.startsWith("- ") && (line.includes(ESCALATION_TOKEN) || CALL_ANNOUNCE_LINE.test(line)))) // C2
    .join("\n");
  const keptTactics = prompt.weakenedTactics.filter((tactic) => !tactic.includes(ESCALATION_TOKEN)); // C3
  const tactics = keptTactics.length > 0 ? keptTactics : prompt.weakenedTactics;
  if (persona === prompt.personaPrompt && tactics.length === prompt.weakenedTactics.length) return prompt;
  const block = opts.inCallSmsEnabled ? CALL_PHASE_BLOCK : `${CALL_PHASE_BLOCK}\n${CALL_PHASE_NO_LINK_LINE}`;
  return { ...prompt, personaPrompt: `${persona.trimEnd()}\n\n${block}`, weakenedTactics: tactics }; // C4
}
