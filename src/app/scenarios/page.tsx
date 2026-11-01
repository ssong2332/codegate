"use client";

// UX-015 훈련 유형 선택(드릴다운 1단계, T28) — docs/UX.md UX-015(v1.5/v1.7), AC-028/AC-029.
// 구 UX-004(평면 목록)를 대체하는 드릴다운 3화면(UX-015→UX-016→UX-017)의 진입점. RouteGuard
// (lib/auth, T18)가 이미 인증되지 않은 사용자를 /login으로 보내므로, 이 화면은 "인증된 사용자"를
// 전제로 한다(다른 UX 화면과 동일 패턴). onboarding/consent·age-gate가 통과 직후 이 경로로 보낸다
// (기존 진입점 `/scenarios`를 그대로 유지 — 다른 화면들의 "다시 훈련"/"처음으로" 링크도 전부
// `/scenarios`를 가리키므로 재배선 불필요).
//
// **라우팅 방식 판단(P-12 "각 단계가 브라우저 히스토리 엔트리와 일치해야" 요구, 근거 남김)**: 이
// 코드베이스는 이미 "화면=라우트 폴더"(src/app/onboarding/*, src/app/session/*) 관례를 쓰고
// 있어, 드릴다운 3단계도 별도 Next.js 라우트 3개(`/scenarios`, `/scenarios/voice`,
// `/scenarios/voice/{clone|generic}`)로 구현한다(단일 라우트 내 history.pushState 수동 관리 대신).
// 각 단계가 실제 라우트라 브라우저 뒤로가기가 자동으로 직전 단계로 돌아가고, 화면 내 "뒤로" 버튼도
// `router.back()`으로 위임해 완전히 동일하게 동작한다(별도 push 목적지를 하드코딩하면 히스토리
// 스택이 갈라져 브라우저 뒤로가기와 어긋날 위험이 있어 피했다).
//
// **스코프 갱신(T29, D-22 스텁 해소)**: T28 시점엔 UX-024(메신저 시나리오 선택)가 아직 없어
// 메신저피싱 선택 시 "준비 중" 안내만 표시했다(T28 구현 보고서가 예고한 후속 수정). T29가
// UX-024/UX-022를 구현했으므로 이제 실제로 `/scenarios/messenger`로 라우팅한다(docs/UX.md
// v1.7 UX-015 Exit 규칙과 정합).
//
// **T56 갱신(v1.10, D-31, AC-056)**: 유형 선택 직후의 목적지가 `/scenarios/voice`·
// `/scenarios/messenger`(방식/시나리오 선택)에서 **`/scenarios/experience-select`(UX-026, 체험/발송
// 선택)**로 바뀐다 — "본인이 체험/지인에게 보내기"를 방식·시나리오 선택보다 먼저 묻는다(Architecture.md
// §14.9.5). 이 화면은 유형만 정하고(setSelectedTrainingType, 변경 없음) 그 다음은 유형 무관하게
// UX-026으로 간다 — 방식·시나리오·최종 목적지는 전부 UX-026 하류에서 갈린다.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PanelBadge, PanelList } from "@/components/ui";
import SelectScreenHeader from "@/components/SelectScreenHeader";
import LogoutButton from "@/components/LogoutButton";
import {
  getSelectedTrainingType,
  setSelectedTrainingType,
  type TrainingType,
} from "@/lib/recording";

export default function ScenarioTypeSelectPage() {
  const router = useRouter();
  // 뒤로가기(P-12 "이전 선택 유지")로 이 화면에 복귀했을 때 직전에 고른 유형을 강조 표시한다.
  // lazy initializer로 마운트 시 1회만 sessionStorage를 읽는다(clone/wait/page.tsx와 동일 패턴 —
  // 이 앱은 정적 export(next.config.ts)라 서버 프리렌더 HTML과의 하이드레이션 불일치가 없다).
  const [selected, setSelected] = useState<TrainingType | null>(() => getSelectedTrainingType());

  const handleSelectVoice = () => {
    setSelected("voice");
    setSelectedTrainingType("voice");
    router.push("/scenarios/experience-select");
  };

  const handleSelectMessenger = () => {
    setSelected("messenger");
    setSelectedTrainingType("messenger");
    router.push("/scenarios/experience-select");
  };

  // UX D-141(시안 E2) — 카드 2장 → 화면 가로 큰 판 2장. 판을 누르면 그 판이 화면 전체로 커지며 다음 단계로 간다.
  // 뒤로가기로 돌아왔을 때 직전 선택은 판 제목 옆 표("지난번 선택")로 알린다(색만으로 구분 안 함).
  const lastPick = (type: TrainingType) => (selected === type ? <PanelBadge>지난번 선택</PanelBadge> : undefined);
  return (
    <main className="drilldown-step mx-auto flex min-h-dvh w-full max-w-xl flex-col bg-page">
      <SelectScreenHeader step="① 유형" title={<>어떤 사기를<br />훈련해 볼까요?</>}>
        <p>훈련하고 싶은 사기 유형을 먼저 골라주세요. 고르면 바로 다음 단계로 넘어갑니다.</p>
      </SelectScreenHeader>
      <PanelList
        onSelect={(key) => (key === "voice" ? handleSelectVoice() : handleSelectMessenger())}
        items={[
          { key: "voice", icon: "phone", title: "보이스피싱", description: "전화로 걸려오는 사기", badge: lastPick("voice") },
          { key: "messenger", icon: "chat", title: "메신저피싱", description: "카카오톡·문자로 오는 사기", badge: lastPick("messenger") },
        ]}
      />
      <LogoutButton className="mt-auto pb-6 pt-8" />
    </main>
  );
}
