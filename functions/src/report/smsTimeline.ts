// 통화 중 문자 이벤트 → 리포트 표시 전용 스냅샷 (T89, Architecture.md §15.1.5, AC-059).
//
// 부수효과 없는 순수 함수다(analyzeConversation.ts·tacticCategory.ts와 동일 관례) — Firestore
// 접근은 호출부(generateReportCore.ts)가 하고 여기서는 값 변환만 한다.
//
// ⚠️ 이 모듈이 **하지 않는 것**(리뷰 체크포인트):
//   - `wasDeceived`/`deceivedMoments`/`tacticsUsed`/`preventionAdvice`에 손대기 (§15.6 G22 —
//     문자 이벤트로 판정을 뒤집으면 AC-062/068/010/011이 연쇄로 흔들린다. **표시만 통합**)
//   - `arrivedAt` 등 시각으로 병합하기 (§15.6 G15 — 실시간 경로의 messages.createdAt은 통화 종료
//     시점 합성값이라 시간 병합 시 문자가 전부 대화 맨 앞에 몰린다. 병합 축은 **턴 앵커**다)
//   - `fakeLandingId`·`otpCode`·원시 타임스탬프를 스냅샷에 싣기 (§15.6 G19 — 사후 열람 화면에
//     가짜 랜딩 재진입 컨트롤·복사 가능 필드를 만들 수 있다)
import type { InCallSmsKind, SmsTimelineEntry, SmsTimelineEvent } from "../shared/types";

/** `sessions/{sid}/inCallSms/{smsId}` 1건의 순수값 표현(Timestamp → ms). */
export type SmsTimelineSource = {
  smsId: string;
  kind: InCallSmsKind;
  senderLabel: string;
  body: string;
  linkDisplayText?: string;
  /** 부재 = T89 이전에 쓰인 기존 문서(무백필) → 앵커 미해결로 정직하게 표기한다. */
  anchorScammerTurn?: number;
  arrivedAtMs: number;
  openedAtMs?: number;
  linkTappedAtMs?: number;
};

/** 앵커 해결에 필요한 최소 메시지 정보(analyzeConversation의 AnalysisMessage와 같은 모양). */
export type SmsTimelineMessage = {
  role: "scammer" | "user";
  turnIndex: number;
  createdAtMs: number;
};

/**
 * 이벤트 파생 규칙표(§15.1.5 (5)) — **저장 필드 추가 0건**. 문서에 이미 있는 값만 보고 계산한다.
 *
 * | # | 조건(위에서 첫 매치) | event |
 * |---|---|---|
 * | 1 | 문서 존재(항상)                  | `sms_received` |
 * | 2 | `kind==="otp"` && `openedAt` 존재 | `sms_otp_shown` |
 * | 3 | `openedAt` 존재(otp 아님)        | `sms_opened` |
 * | 4 | `linkTappedAt` 존재              | `sms_link_tapped` (가산) |
 *
 * 2·3은 상호배타, 4는 가산이다. `sms_otp_shown`은 신규 저장 이벤트가 아니라 **명시 필드 두 개의
 * 결합에서 나오는 파생 표기**라 `recordInCallSmsEvent`의 요청 enum이 무변경으로 남는다.
 * `sms_overlay_closed`는 기록하지 않는다(닫힘은 "무슨 일이 일어난 것"이 아니라 학습 가치가 없다).
 *
 * 문구는 Architecture.md §15.1.5 (5)의 참고 문구를 그대로 쓴다(확정 카피는 OQ-A1 — ux-design).
 */
export function deriveSmsEvents(doc: SmsTimelineSource): SmsTimelineEvent[] {
  const events: SmsTimelineEvent[] = [
    { event: "sms_received", what: `${doc.senderLabel}에서 문자가 도착했습니다.` },
  ];
  if (doc.openedAtMs !== undefined) {
    if (doc.kind === "otp") {
      events.push({
        event: "sms_otp_shown",
        what: "인증번호 문자를 열어 화면에 인증번호가 표시됐습니다.",
        correctAction:
          "인증번호는 어떤 기관·상담원도 요구하지 않습니다. 요구받는 것 자체가 사기 신호이니 불러 주지 말고 전화를 끊으세요.",
      });
    } else {
      events.push({ event: "sms_opened", what: "문자를 열어 확인했습니다." });
    }
  }
  if (doc.linkTappedAtMs !== undefined) {
    events.push({
      event: "sms_link_tapped",
      what: "문자 속 링크를 눌렀습니다.",
      correctAction:
        "문자 속 링크는 누르지 말고, 기관 공식 앱이나 알고 있는 대표번호로 직접 확인하세요.",
    });
  }
  return events;
}

type AnchorResolution = { anchorTurnIndex: number; anchorResolved: boolean; timeLabel?: string };

/**
 * 앵커 해결 규칙표(§15.1.5 (4)) — 위에서 첫 매치.
 *
 * | 순위 | 조건 | 결과 |
 * |---|---|---|
 * | 1 | `anchorScammerTurn <= 0`               | `{ -1, resolved:true }` (대화 맨 앞) |
 * | 2 | `anchorScammerTurn <= scammer 메시지 수` | `{ scammers[N-1].turnIndex, resolved:true }` |
 * | 3 | 그 외(부재·전사 누락·짧음)              | `{ 마지막 메시지 turnIndex ?? -1, resolved:false }` |
 *
 * 3은 **조용히 버리지 않기 위한 것**이다(P-4) — 화면이 "대화 중 어느 시점인지 확인하지 못했습니다"를
 * 고지한다. 리졸버는 경로와 무관하게 **이 하나뿐**이다(§15.1.5 (6) — 경로별로 다른 것은 write 시점
 * 값 하나뿐이고 그 의미는 동일하다).
 */
function resolveAnchor(
  anchorScammerTurn: number | undefined,
  sortedMessages: readonly SmsTimelineMessage[],
  sessionCreatedAtMs: number,
): AnchorResolution {
  const lastTurnIndex =
    sortedMessages.length > 0 ? sortedMessages[sortedMessages.length - 1].turnIndex : -1;
  if (anchorScammerTurn === undefined || !Number.isFinite(anchorScammerTurn)) {
    return { anchorTurnIndex: lastTurnIndex, anchorResolved: false };
  }
  if (anchorScammerTurn <= 0) {
    return { anchorTurnIndex: -1, anchorResolved: true };
  }
  const scammers = sortedMessages.filter((m) => m.role === "scammer");
  if (anchorScammerTurn > scammers.length) {
    return { anchorTurnIndex: lastTurnIndex, anchorResolved: false };
  }
  const anchorMessage = scammers[anchorScammerTurn - 1];
  // timeLabel은 **앵커 메시지에서** 파생한다(실제 arrivedAt이 아니라). 실시간 경로에서 문자의 진짜
  // 시각은 대화의 합성 시각보다 항상 작아, 그대로 쓰면 "12초 시점에 문자 도착 / 180초 시점에
  // 속았습니다"처럼 순서와 라벨이 모순된다. 대화 라벨 자체가 이미 근사값이므로 **정합성이 정확도보다
  // 우선**한다(§15.1.5 (4)). 포맷은 deceivedMoments와 동일한 `N초 시점`(analyzeConversation.ts).
  const elapsedSec = Math.max(0, Math.round((anchorMessage.createdAtMs - sessionCreatedAtMs) / 1000));
  return {
    anchorTurnIndex: anchorMessage.turnIndex,
    anchorResolved: true,
    timeLabel: `${elapsedSec}초 시점`,
  };
}

/**
 * 문자 문서 목록 + 대화 메시지 → **최종 표시 순서로 정렬된** 스냅샷 배열.
 *
 * 정렬 키는 `(anchorTurnIndex, arrivedAtMs, smsId)`다 — 화면은 이 순서를 다시 해석하지 않는다
 * (§15.1.5 (6) "스냅샷이 이미 최종 순서로 오므로 화면은 해석하지 않는다").
 */
export function buildSmsTimeline(
  docs: readonly SmsTimelineSource[],
  messages: readonly SmsTimelineMessage[],
  sessionCreatedAtMs: number,
): SmsTimelineEntry[] {
  if (docs.length === 0) return [];
  const sortedMessages = [...messages].sort((a, b) => a.turnIndex - b.turnIndex);
  return docs
    .map((doc) => {
      const anchor = resolveAnchor(doc.anchorScammerTurn, sortedMessages, sessionCreatedAtMs);
      return {
        smsId: doc.smsId,
        kind: doc.kind,
        senderLabel: doc.senderLabel,
        body: doc.body,
        // 링크 표시 텍스트는 kind==="link"일 때만 존재한다. Firestore가 undefined write를 거부하므로
        // 값이 있을 때만 키를 만든다(generateReportCore의 옵셔널 필드 관례와 동일).
        ...(doc.linkDisplayText ? { linkDisplayText: doc.linkDisplayText } : {}),
        anchorTurnIndex: anchor.anchorTurnIndex,
        anchorResolved: anchor.anchorResolved,
        ...(anchor.timeLabel ? { timeLabel: anchor.timeLabel } : {}),
        events: deriveSmsEvents(doc),
      } satisfies SmsTimelineEntry;
    })
    .sort(
      (a, b) =>
        a.anchorTurnIndex - b.anchorTurnIndex ||
        arrivedAtOf(docs, a.smsId) - arrivedAtOf(docs, b.smsId) ||
        a.smsId.localeCompare(b.smsId),
    );
}

/** 정렬용으로만 원본 `arrivedAtMs`를 참조한다 — 스냅샷 **결과물에는 싣지 않는다**(§15.6 G19). */
function arrivedAtOf(docs: readonly SmsTimelineSource[], smsId: string): number {
  return docs.find((d) => d.smsId === smsId)?.arrivedAtMs ?? 0;
}
