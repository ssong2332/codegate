// §122(6)(실기 신고 2026-10-23 · 자녀 사칭 카톡 고급 `fv-tdgg`) — 신분증 사진을 보낸 직후 사기범이 *"잘 받았어. 확인해볼게. 지금 접수 처리
// 들어갔어."* 와 함께 목표 끊기(`END_CALL_GOAL`)를 내, 흐름에 남은 단계("급한 돈 송금을 부탁한다")를 꺼내지 않고 채팅방을 나갔다.
// 메신저 단계 끊기(§104.9 대안 A)의 판정표(`scammerHangup/decide.ts`)는 사용자 발화 하한(3)만 보므로 사진 턴 뒤에도 그대로 승인됐다.
//
// ── 판정표 P: 사진 뒤 남은 단계(텍스트 폴백 · 메신저 단계의 `END_CALL_GOAL`만) ──────────────────────────────────────────────
// | # | If | Then |
// |---|---|---|
// | P1 | 메신저 단계가 아니다 · 끊기 신호가 목표(goal)가 아니다 | 판정하지 않는다(종전) |
// | P2 | 세션 변형 단계 중 사진 · 신분증 단계가 없다 · 그 단계가 마지막이다 | 판정하지 않는다(종전) |
// | P3 | 대화에 사진 턴이 없다(이번 턴 포함) | 판정하지 않는다(종전) |
// | P4 | 마지막 사진 턴 **뒤** 사기범 대사(이번 응답 제외)에 새 요구 형태가 있다(`NEW_TRANSFER_DEMAND` ∨ `NEW_REQUEST_FORM`) | 판정하지 않는다 — 뒤 단계를 이미 꺼냈다 |
// | P5 | 그 밖 | **받아들이지 않는다**(`photo_followup_pending`) — 대화는 이어진다 |
// - 이번 응답 자체에 요구가 있으면 판정표 B(`signalConsistency.ts` B1 · B1-b)가 이미 끊기를 막는다 — 여기서는 다시 보지 않는다.
// - `END_CALL_GIVEUP`(포기)은 대상이 아니다 — 참가자가 거절해 포기하는 끊기는 정상이다.
// ⛔ 판정만(Firestore · LLM import 0) · 흐름 재설계 0(multi-route 1차 범위) · 실시간 콜러블 판정(`decideScammerHangup`) 무변경.
import { NEW_REQUEST_FORM, NEW_TRANSFER_DEMAND } from "./signalConsistency";
import { PHOTO_DEMAND } from "./photoTurn";
import { findFlowVariant } from "../scenarios/flowVariants";

export type PhotoFollowUpInput = {
  channel: string | undefined;
  endCall: "goal" | "give_up" | undefined;
  /** 세션 변형의 단계 요약(순서대로). 변형이 없으면 빈 배열. */
  stageSummaries: readonly string[];
  /** 이번 사용자 턴을 **뺀** 저장된 대화(시간순). */
  history: readonly { role: string; textMasked: string; photo?: true }[];
  /** 이번 사용자 턴이 사진 턴인가. */
  isPhotoTurn: boolean;
};

/** 세션 변형의 단계 요약(변형이 없거나 시나리오가 다르면 빈 배열 = P2에서 종전 판정). */
export function sessionVariantStageSummaries(scenarioId: string, flowVariantId: string | undefined): string[] {
  const variant = findFlowVariant(flowVariantId);
  return variant && variant.scenarioId === scenarioId ? variant.stages.map((stage) => stage.summary) : [];
}

/** P2 — 사진 · 신분증 단계 뒤에 단계가 남아 있는가. */
export function hasStageAfterPhoto(stageSummaries: readonly string[]): boolean {
  const photoIndex = stageSummaries.findIndex((summary) => PHOTO_DEMAND.test(summary));
  return photoIndex >= 0 && photoIndex < stageSummaries.length - 1;
}

/** 판정표 P — `true`면 이번 목표 끊기를 받아들이지 않는다. */
export function isGoalBeforePhotoFollowUp(input: PhotoFollowUpInput): boolean {
  if (input.channel !== "messenger" || input.endCall !== "goal") return false; // P1
  if (!hasStageAfterPhoto(input.stageSummaries)) return false; // P2
  if (input.isPhotoTurn) return true; // P3 통과 · 사진 뒤 사기범 대사 = 이번 응답뿐(P4 대상 0) → P5
  const lastPhoto = input.history.map((m) => m.role === "user" && m.photo === true).lastIndexOf(true);
  if (lastPhoto < 0) return false; // P3
  const demandedAfter = input.history
    .slice(lastPhoto + 1)
    .some((m) => m.role === "scammer" && (NEW_TRANSFER_DEMAND.test(m.textMasked) || NEW_REQUEST_FORM.test(m.textMasked)));
  return !demandedAfter; // P4 · P5
}
