"use client";

// UX-017 시나리오 노출(드릴다운 3단계) — clone 방식 정적 라우트. 실제 UI/로직은
// ScenarioListView(../ScenarioListView.tsx)에 위임한다(voice/generic과 공유, mode만 다름).
import { ScenarioListView } from "../ScenarioListView";

export default function ScenariosCloneModePage() {
  return <ScenarioListView mode="clone" />;
}
