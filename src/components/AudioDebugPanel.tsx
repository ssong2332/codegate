"use client";

// `?audiodebug=1` 오디오 진단 패널(2026-10-18, 라이브 d13e718 무음 신고 — 실기 판정용).
//
// ⛔ 주소 쿼리에 `audiodebug=1`이 없으면 **아무것도 그리지 않는다**(DOM 0 — 아래 첫 분기). 운영 빌드에서도 같은 규칙이다.
// ⛔ 관찰만 한다 — 진단 저장소(`audioDiagnostics.ts`)와 지연 계측(`liveLatency.ts`)을 **읽기만** 하고 아무것도 바꾸지 않는다.
// ⛔ 비밀값 · 토큰 · 세션 id · uid · 전사 텍스트를 싣지 않는다 — 행은 `buildAudioDiagRows`가 고정 키 목록으로만 만든다.
// ⚠️ 탭을 가로채지 않는다(`pointer-events-none`) — 종료 버튼 등 컨트롤 도달성(AC-006)에 영향 0. 문구는 영문 키 이름뿐이다.
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  buildAudioDiagRows,
  isAudioDebugEnabled,
  readAudioDiag,
  summarizeBrowser,
} from "@/lib/realtime/audioDiagnostics";
import { buildCallSetupRecord, readCallSetupMarks } from "@/lib/realtime/liveLatency";
import { readAudioFlags, readOutputAfterMicFlag, readOutputElementFlag, readVoiceTrimFlag } from "@/lib/realtime/callAudio";
import { describeStoredDebugFlags, readDebugFlagSearch, readStoredDebugFlags } from "@/lib/realtime/debugFlags";

export type AudioDebugPanelProps = {
  callMode: string;
  status: string;
  provider: string;
  audioRoute: string;
};

const POLL_MS = 500;

const noopSubscribe = () => () => {};
// §134 — 주소 쿼리 + 탭에 저장된 플래그(`debugFlags.ts`) — 앞 화면에서 한 번 붙인 `audiodebug=1`도 켠다.
const readEnabled = () => isAudioDebugEnabled(readDebugFlagSearch());
const readEnabledOnServer = () => false;

type NavigatorWithExtras = Navigator & {
  userActivation?: { hasBeenActive: boolean; isActive: boolean };
  userAgentData?: { brands?: Array<{ brand: string; version: string }>; platform?: string };
};

export default function AudioDebugPanel(props: AudioDebugPanelProps) {
  const enabled = useSyncExternalStore(noopSubscribe, readEnabled, readEnabledOnServer);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setTick((n) => n + 1), POLL_MS);
    return () => clearInterval(timer);
  }, [enabled]);

  if (!enabled) return null;

  const nav = navigator as NavigatorWithExtras;
  const debugSearch = readDebugFlagSearch();
  const record = buildCallSetupRecord(readCallSetupMarks(), {});
  const rows = buildAudioDiagRows({
    snapshot: readAudioDiag(),
    callMode: props.callMode,
    status: props.status,
    provider: props.provider,
    audioRoute: props.audioRoute,
    credentialsPrefetched: record.credentialsPrefetched,
    acceptToCredentialsMs: record.acceptToCredentialsMs,
    userActivation: nav.userActivation
      ? { hasBeenActive: nav.userActivation.hasBeenActive, isActive: nav.userActivation.isActive }
      : null,
    browser: summarizeBrowser({
      brands: nav.userAgentData?.brands ?? null,
      platform: nav.userAgentData?.platform ?? null,
      userAgent: nav.userAgent,
    }),
    flags: {
      ...readAudioFlags(debugSearch),
      outputAfterMic: readOutputAfterMicFlag(debugSearch),
      voiceTrim: readVoiceTrimFlag(debugSearch),
      outputElement: readOutputElementFlag(debugSearch),
      saved: describeStoredDebugFlags(readStoredDebugFlags()),
    },
  });

  return (
    <div
      aria-hidden="true"
      data-tick={tick}
      className="pointer-events-none fixed left-1 z-[60] max-w-[62vw] rounded bg-black/60 px-1.5 py-1 font-mono text-[9px] leading-tight text-white"
      style={{ top: "calc(env(safe-area-inset-top) + 4px)" }}
    >
      {rows.map(([key, value]) => (
        <div key={key} className="whitespace-nowrap">
          {key}={value}
        </div>
      ))}
    </div>
  );
}
