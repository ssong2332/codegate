// 2026-10-27(사용자 지시) — 통화 화면의 "모양만 있던" 버튼에 대략적인 실제 기능을 붙인다(One UI형 먼저 · iOS형은 같은 표를 쓴다).
//
// 실기 동작 조사(출처):
// - 녹음: 통화 중 '더 보기' → "Record call" · 녹음 파일은 전화 앱 설정의 "Recorded calls"에 남는다
//   https://www.samsung.com/sa_en/support/mobile-devices/how-to-use-the-call-recording-feature-on-your-samsung-galaxy-smartphone/
// - 블루투스: 통화 중 블루투스 아이콘을 누르면 휴대전화로 소리가 옮겨지고, 아이콘 아래 화살표로 "Select Bluetooth device" 목록이 열린다
//   https://www.samsung.com/hk_en/support/mobile-devices/how-to-manage-calls-when-multiple-bluetooth-devices-are-connected/
// - 통화 자막(Call captions, One UI 8~): 통화 중 각자의 말을 실시간 자막으로 보여 준다
//   https://samsung.com/latin_en/support/mobile-devices/one-ui-8-upgrade-with-android-16
// - AI(통화 어시스트): 통화 중 "Call assist" → "Live translate"(실시간 통역)
//   https://www.samsung.com/uk/support/mobile-devices/how-to-use-live-translate-for-phone-calls-on-the-galaxy-s24/
// - 통화 대기 · 연락처 보기 · 영상통화: 공식 문서를 찾지 못했다(일반적인 전화 앱 동작 — 추정).
//
// | 버튼 | 실기 | 이 앱(대략) |
// |---|---|---|
// | 통화 자막 | 양쪽 말 실시간 자막 | 켜면 화면에 **사기범 대사만** 자막(기존 `pillCaption` — 턴 완료 단위). ⛔ 참가자 말은 그리지 않는다(G79/G93 — 계좌 · 생년월일 노출 방지) |
// | 녹음 | 통화 녹음 · 파일 저장 | 눌림 + 상단 "녹음 중 mm:ss" 표시만. ⛔ 파일 · 저장 · 전송 0(마이크를 따로 잡지 않는다) |
// | 블루투스 | 휴대전화 ↔ 블루투스 · 기기 선택 | 오디오 기기 시트 — 휴대전화 / 스피커(기존 스피커 전환과 같은 상태) + 블루투스는 웹에서 고를 수 없다는 안내(§74.2) |
// | 연락처 보기 | 연락처 상세 | "저장되지 않은 번호" 카드(번호 · 부제) |
// | 영상통화 | 영상통화 전환 | 토스트 "상대방이 영상통화를 받을 수 없습니다"(추정 문구) |
// | AI 반짝이 | 통화 어시스트 | 시트 — 통화 자막 켜기/끄기 · 실시간 통역(토스트: 사용할 수 없음) |
// | 통화 대기 | 상대를 대기시킴 | ⛔ 구현하지 않는다 — 토스트만. 진짜 대기는 마이크 · 재생 · AI 발화를 함께 멈춰야 하는데, 재생만 끄면 AI는 계속 말해
// |  |  | 사기범 대사를 놓치고(Live 스트림은 되감기 없음), AI에 대기 사실을 주입하면 대본이 흔들린다(사용자 지시의 위험 조건) |
//
// 잎(leaf) 모듈 — import 0. 문구만 둔다(세션 중 문면 — 표식 낱말 0 · G437).

export type CallExtraPanel = "more" | "audio" | "contact" | "assist";

export const CALL_EXTRA_COPY = {
  videoUnavailable: "상대방이 영상통화를 받을 수 없습니다",
  holdUnavailable: "지금은 통화 대기를 사용할 수 없습니다",
  // iOS형 '더 보기'(추정 구성) — 통화 대기 지원 · 실시간 번역 · 화면 공유.
  holdAssistUnavailable: "지금은 통화 대기 지원을 사용할 수 없습니다",
  screenShareUnavailable: "상대방이 화면 공유를 받을 수 없습니다",
  iosTranslate: "실시간 번역",
  translateUnavailable: "이 통화에서는 실시간 통역을 사용할 수 없습니다",
  recording: "녹음 중",
  captionsTitle: "통화 자막",
  captionsWaiting: "상대방의 말을 기다리는 중…",
  captionsSpeaker: "상대방",
  audioTitle: "오디오 기기",
  audioPhone: "휴대전화",
  audioSpeaker: "스피커",
  audioBluetoothNote: "블루투스 기기는 휴대전화 설정에서 연결하세요. 이 화면에서는 기기를 고를 수 없습니다.",
  contactUnsaved: "저장되지 않은 번호",
  assistTitle: "통화 어시스트",
  assistCaptions: "통화 자막",
  assistTranslate: "실시간 통역",
  close: "닫기",
} as const;

/** 토스트 표시 시간(ms) — 판단값. */
export const CALL_EXTRA_TOAST_MS = 2600;

/** 녹음 표시 경과 초 — 인자는 통화 경과 초(녹음을 누른 순간 · 지금). 시작이 없으면 null. 음수는 0. */
export function recordingElapsedSec(startedAtSec: number | null, nowSec: number): number | null {
  if (startedAtSec === null) return null;
  return Math.max(0, Math.floor(nowSec - startedAtSec));
}

/** 자막 줄 — 사기범 대사만(빈 문자열 · 공백은 없음 = 기다리는 중). */
export function captionLine(scammerCaption: string | null): string | null {
  const text = scammerCaption?.trim();
  return text ? text : null;
}
