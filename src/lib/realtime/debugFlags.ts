// §134 — 실기 진단 플래그를 탭 sessionStorage에 남긴다(2026-10-25 실기 신고: 통화 중 주소창에 `?audiodebug=1`을 붙여
// 다시 열었더니 페이지가 새로 로드돼 통화가 깨졌다).
// 어느 페이지에서든 주소에 한 번 붙이면 같은 탭 안에서는 `/session/play`까지 유지된다. 운영 빌드에서도 같은 규칙이다.
//
// | # | If (주소 쿼리) | Then |
// |---|---|---|
// | F1 | `debugflags=off` | 저장된 플래그 전부 지움(같은 주소의 다른 플래그 값은 그 뒤 F2~F3대로) |
// | F2 | `<키>=off` · 허용 밖 값 | 그 키를 지움 · 이번 판정에도 없는 것으로 본다(= 기본값) |
// | F3 | `<키>=<값>`(off 밖) | 그 값을 저장 · 이번 판정에 쓴다 |
// | F4 | 키 없음 | 저장된 값이 있으면 그것을 쓴다 |
// | F5 | 저장소를 읽거나 쓸 수 없음 · 저장 값이 깨짐 | 주소 쿼리만 쓴다(종전) |
// ⛔ 여기 적힌 키 밖의 쿼리는 저장하지 않는다. 값은 짧은 영문 · 숫자만 받는다(비밀값 · 식별자가 섞일 자리가 없다).

/** 저장해 유지하는 키 — 진단 패널 · 출력 컨텍스트 A/B · '통화' 스트림 감쇠 A/B · §137 출력 싱크 A/B(`callAudio.ts` E1~E4) ·
 * BA-1 훈련용 홈 · 내 은행 앱(`@/lib/bankapp/bankApp` `isBankAppEnabled`). */
export const PERSISTED_DEBUG_FLAGS = ["audiodebug", "outaftermic", "voicetrim", "outelement", "bankapp"] as const;
export type PersistedDebugFlag = (typeof PERSISTED_DEBUG_FLAGS)[number];

export const DEBUG_FLAGS_STORAGE_KEY = "debug.flags";
/** 저장된 플래그를 한 번에 지우는 쿼리 키(`?debugflags=off`). */
export const DEBUG_FLAGS_CLEAR_PARAM = "debugflags";
export const DEBUG_FLAG_OFF = "off";

const VALUE_PATTERN = /^[a-z0-9]{1,16}$/i;

export type StoredDebugFlags = Partial<Record<PersistedDebugFlag, string>>;

function parseStored(raw: string | null): StoredDebugFlags {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: StoredDebugFlags = {};
    for (const key of PERSISTED_DEBUG_FLAGS) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === "string" && VALUE_PATTERN.test(value) && value !== DEBUG_FLAG_OFF) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * 위 표 F1 ~ F4(순수 함수). `effectiveSearch`는 주소 쿼리에 저장 값을 얹은 것이다 — 기존 판독 함수
 * (`isAudioDebugEnabled` · `readOutputAfterMicFlag` · `readVoiceTrimFlag` · `readAudioFlags`)에 그대로 넘긴다.
 */
export function resolveDebugFlags(
  search: string,
  storedRaw: string | null,
): { stored: StoredDebugFlags; effectiveSearch: string } {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    params = new URLSearchParams();
  }
  let stored = parseStored(storedRaw);
  if (params.get(DEBUG_FLAGS_CLEAR_PARAM) === DEBUG_FLAG_OFF) stored = {};
  params.delete(DEBUG_FLAGS_CLEAR_PARAM);
  for (const key of PERSISTED_DEBUG_FLAGS) {
    const value = params.get(key);
    if (value === null) continue;
    if (value === DEBUG_FLAG_OFF || !VALUE_PATTERN.test(value)) {
      delete stored[key];
      params.delete(key);
    } else {
      stored[key] = value;
    }
  }
  for (const key of PERSISTED_DEBUG_FLAGS) {
    const value = stored[key];
    if (value !== undefined && params.get(key) === null) params.set(key, value);
  }
  const query = params.toString();
  return { stored, effectiveSearch: query ? `?${query}` : "" };
}

/** 저장된 키 목록(진단 패널 `flag.saved`). 없으면 "-". */
export function describeStoredDebugFlags(stored: StoredDebugFlags): string {
  const keys = PERSISTED_DEBUG_FLAGS.filter((key) => stored[key] !== undefined).map((key) => `${key}=${stored[key]}`);
  return keys.length > 0 ? keys.join(",") : "-";
}

/**
 * 브라우저 판독 — 주소 쿼리를 저장소에 반영한 뒤(F1~F3) 판정에 쓸 쿼리를 돌려준다. 저장소를 못 쓰면 F5.
 * 멱등이라 어느 화면에서 몇 번 불러도 된다(전역 셸 `DebugFlagCapture` + 각 판독 지점).
 */
export function readDebugFlagSearch(): string {
  if (typeof window === "undefined") return "";
  const search = window.location.search;
  try {
    const storage = window.sessionStorage;
    const { stored, effectiveSearch } = resolveDebugFlags(search, storage.getItem(DEBUG_FLAGS_STORAGE_KEY));
    if (Object.keys(stored).length > 0) storage.setItem(DEBUG_FLAGS_STORAGE_KEY, JSON.stringify(stored));
    else storage.removeItem(DEBUG_FLAGS_STORAGE_KEY);
    return effectiveSearch;
  } catch {
    return search;
  }
}

/** 진단 패널용 — 지금 저장된 플래그(읽기만). */
export function readStoredDebugFlags(): StoredDebugFlags {
  if (typeof window === "undefined") return {};
  try {
    return parseStored(window.sessionStorage.getItem(DEBUG_FLAGS_STORAGE_KEY));
  } catch {
    return {};
  }
}
