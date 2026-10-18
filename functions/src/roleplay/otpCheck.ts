// 텍스트 폴백 경로(sendMessage)의 인증번호 대조 지시 (2026-10-18, Architecture §77).
//
// 왜 매 턴인가: 실시간 경로는 도착 지시가 Live 세션 문맥에 남지만, 이 경로는 매 턴 시스템 프롬프트를 새로 조립하고
// `turnInstruction`은 그 턴에만 실린다. 참가자는 보통 문자 도착 **다음** 턴에 번호를 부르므로, 도착 이후 턴마다
// 대조 지시를 다시 넣어야 모델이 그 순간 번호를 안다.
//
// | 조건 | 지시 |
// |---|---|
// | 이 시나리오에 인증번호 문자가 없다 | 없음(Firestore 읽기 0회) |
// | 이번 사기범 턴이 그 문자의 도착 턴보다 이르다 | 없음(읽기 0회 — 도착 전에는 번호를 주지 않는다) |
// | 도착 턴 이후 + 그 문자가 이 세션에 실제로 도착했다(`isDelivered`) | `buildOtpCheckInstruction(otpCode)` |
// | 도착 여부 조회 실패 | 없음(대화를 막지 않는다 — P-4) |
import { buildOtpCheckInstruction, listOtpItems } from "../scenarios/inCallSms";

export async function resolveOtpCheckInstruction(input: {
  scenarioId: string;
  /** 지금 만들어질 사기범 응답이 몇 번째인가(roleplay/index.ts `scammerTurnNumber`). */
  scammerTurnNumber: number;
  /** 이 턴에 방금 도착 처리한 문자 id(있으면 조회 없이 도착으로 본다). */
  deliveredThisTurn?: string;
  /** 이 세션에 그 문자가 도착했는가(Firestore `sessions/{sid}/inCallSms/{smsId}` 존재). */
  isDelivered: (smsId: string) => Promise<boolean>;
}): Promise<string | undefined> {
  for (const item of listOtpItems(input.scenarioId)) {
    if (input.scammerTurnNumber < item.afterScammerTurns) continue;
    let delivered = item.smsId === input.deliveredThisTurn;
    if (!delivered) {
      try {
        delivered = await input.isDelivered(item.smsId);
      } catch {
        delivered = false;
      }
    }
    if (delivered && item.otpCode) return buildOtpCheckInstruction(item.otpCode);
  }
  return undefined;
}
