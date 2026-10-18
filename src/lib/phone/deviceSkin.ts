// T190-1 — 기기 스킨 해석(표 K)·기기 저장값 파싱·UA-CH 보강 (docs/Architecture.md §73.3 표 K · §73.5).
//
// ⭐ 모든 기기 재현 표면(통화 · 문자함 · 랜딩 브라우저 바 · 메신저 문자형)이 **이 해석 함수 하나**를
// 쓴다(D-88 *"같은 기기에서 통화·문자·메신저가 같은 스킨"* · AC-092 (b)).
//
// ⚠️ 잎(leaf) 모듈이다 — 값 import 0(타입 import만). 감지 규칙표 v2는 `../messenger/detectSkin.ts`가
// 소유하고(그 파일 머리 주석 — 루트 테스트 러너가 확장자 없는 상대 import를 풀지 못한다), 이 파일은
// 그 **결과를 인자로 받아** 조합한다.
// ⚠️ 스킨은 프레젠테이션 전용이다 — 어떤 안전 판정·무해화·종료·고지도 이 값으로 갈리지 않는다(AC-092 (f)).
import type { DetectedMessengerSkin, MessengerSkin } from "../messenger/detectSkin";

export type DeviceSkin = MessengerSkin;
export type DeviceSkinSource = "auto" | "fallback" | "manual";
export type ResolvedDeviceSkin = { skin: DeviceSkin; source: DeviceSkinSource };

/** §73.5 (3) — 기기 저장 키. 값 = `{"skin":"ios"|"samsung","at":<ms>}`(PII 0 · 프레젠테이션 선호값). */
export const DEVICE_SKIN_STORAGE_KEY = "fv.deviceSkin.v1";

/**
 * 세션 전 선택지 라벨(OQ-U67 resolved · AC-092 (e)). ⛔ 세션 전 선택 줄에서만 렌더한다 — 세션 중 화면에
 * 스킨 이름 0건(AC-092 (d) · AC-095 (d)). `default`는 선택지가 아니다(감지 실패의 폴백 값일 뿐).
 */
export const DEVICE_SKIN_CHOICE_LABELS = { ios: "iOS형", samsung: "One UI형" } as const;

/** §73.4 — UA-CH `model` 대기 상한(판단값). 늦게 오면 버린다(화면 모양이 세션 중 바뀌지 않게 — D-100 (4)). */
export const UA_MODEL_HINT_TIMEOUT_MS = 300;

const SKINS: readonly DeviceSkin[] = ["ios", "samsung", "default"];
const SESSION_SOURCES: readonly DeviceSkinSource[] = ["auto", "fallback", "manual"];
const STORABLE_SKINS: readonly DeviceSkin[] = ["ios", "samsung"];

/** 세션 문서의 `messengerSkin`·`skinSource` — **둘 다** enum 안일 때만 값이 있다(표 K-1). */
export function parseSessionSkin(messengerSkin: unknown, skinSource: unknown): ResolvedDeviceSkin | null {
  if (typeof messengerSkin !== "string" || typeof skinSource !== "string") return null;
  if (!SKINS.includes(messengerSkin as DeviceSkin)) return null;
  if (!SESSION_SOURCES.includes(skinSource as DeviceSkinSource)) return null;
  return { skin: messengerSkin as DeviceSkin, source: skinSource as DeviceSkinSource };
}

/**
 * 기기 저장값 파싱(§73.5 (3)). 읽기 실패·파싱 실패·enum 밖 = **"선택 없음"(null)** — 조용한 폴백이 아니라
 * 정의된 값이다. `default`는 저장 대상이 아니므로 저장돼 있어도 무시한다.
 */
export function parseStoredDeviceSkin(raw: string | null | undefined): DeviceSkin | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { skin?: unknown } | null;
    const skin = parsed && typeof parsed === "object" ? parsed.skin : undefined;
    return typeof skin === "string" && STORABLE_SKINS.includes(skin as DeviceSkin) ? (skin as DeviceSkin) : null;
  } catch {
    return null;
  }
}

/** 저장값 직렬화 — 쓰는 곳은 수동 선택 1곳뿐이다(§73.5 (3) · T190-6 `DeviceSkinPicker`). */
export function serializeStoredDeviceSkin(skin: "ios" | "samsung", atMs: number): string {
  return JSON.stringify({ skin, at: atMs });
}

/**
 * 표 K(§73.3) — 스킨 해석 우선순위. ⛔ 이 표대로만 적용한다.
 * - K-1 세션 문서에 `messengerSkin`·`skinSource`가 둘 다 있다 → 그 값
 * - K-2 기기에 저장된 수동 선택이 있다 → 그 값(`manual`)
 * - K-3 그 밖 → 감지 규칙표 v2의 결과
 */
export function resolveDeviceSkin(input: {
  session: ResolvedDeviceSkin | null;
  stored: DeviceSkin | null;
  detected: DetectedMessengerSkin;
}): ResolvedDeviceSkin {
  if (input.session) return input.session;
  if (input.stored) return { skin: input.stored, source: "manual" };
  return input.detected;
}

/** `navigator`에서 이 파일이 쓰는 부분만(테스트에서 가짜로 대체 가능하게). */
export type UaHintNavigator = {
  userAgentData?: { getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string }> };
};

/**
 * UA-CH `model` 보강값(§73.4 — 규칙 4 입력). 미지원(Safari·Firefox·인앱 브라우저)·실패·상한 초과 =
 * `undefined`(규칙 4가 성립하지 않을 뿐 — 기존 규칙 그대로). 거부(reject)를 밖으로 던지지 않는다.
 */
export async function readUaModelHint(
  // ⚠️ `object`로 받는다 — TS lib.dom의 `Navigator`에는 `userAgentData`가 없어(비표준 WICG) 모든 속성이 옵셔널인
  // `UaHintNavigator`에 직접 대입하면 약한 타입 검사(TS2559)에 걸린다. 안에서 좁힌다.
  navLike: object | undefined,
  timeoutMs: number = UA_MODEL_HINT_TIMEOUT_MS,
): Promise<string | undefined> {
  const nav = navLike as UaHintNavigator | undefined;
  const getter = nav?.userAgentData?.getHighEntropyValues;
  if (typeof getter !== "function") return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), timeoutMs);
    });
    const hint = getter
      .call(nav?.userAgentData, ["model"])
      .then((values) => (typeof values?.model === "string" && values.model ? values.model : undefined))
      .catch(() => undefined);
    return await Promise.race([hint, timeout]);
  } catch {
    return undefined;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * T190-6(UX-014 v1.33 (11) ② · D-100) — 세션 전 화면 모양 줄이 **접힌 채** 시작하는가. 감지 성공(`auto`)·이전
 * 선택(`manual`)이면 접힘, 감지 실패(`fallback`)면 펼침. ⚠️ 표에 없는 경우: 감지 결과가 `default`(삼성 외
 * Android)이면 보여 줄 라벨이 없어("기본"은 선택지가 아니다) 펼친다 — 구현 판단(보고 대상).
 */
export function pickerStartsCollapsed(value: DeviceSkin, source: DeviceSkinSource): boolean {
  return source !== "fallback" && value !== "default";
}
