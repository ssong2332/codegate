"use client";

// 시안 E2 시나리오 목록(UX D-141 (1) · §97) — UX-017(보이스) · UX-024(메신저) 공용. 묶음(카테고리 · 표면)마다 제목(h2 ·
// 목록 이동 대상 `data-toc-target`)을 두고, 그 아래 화면 가로 판을 쌓는다. 번호 · 밝기 교차는 묶음을 넘어 이어진다.
// 판을 누르면 그 판이 화면 전체로 커지며 난이도 화면으로 간다(종전 "고르고 → 아래 '다음' 버튼" 2탭 → 1탭).
// 미리 지목된 시나리오(실패 아카이브의 "이 시나리오 다시 훈련" · T74)는 자동 시작하지 않고 "다시 훈련" 표를 달아
// 처음 한 번 그 판이 보이게 스크롤만 한다 — 시작은 여전히 사용자가 누른다.
import { useEffect, type ReactNode } from "react";
import { PanelBadge, PanelList, type LineIconName, type PanelItem } from "@/components/ui";

export type ScenarioPanelGroup = {
  /** 묶음 제목 id(목록 이동 대상) */
  id: string;
  label: ReactNode;
  items: readonly PanelItem[];
};

export default function ScenarioPanelGroups({
  groups,
  onSelect,
  presetId,
}: {
  groups: readonly ScenarioPanelGroup[];
  /** 이동하지 않으면 false(판 확장 덮개 0) */
  onSelect: (scenarioId: string) => boolean | void;
  presetId: string | null;
}) {
  useEffect(() => {
    if (!presetId) return;
    const el = document.querySelector<HTMLElement>(`[data-panel-key="${CSS.escape(presetId)}"]`);
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    // 처음 한 번만(지목은 마운트 때 정해진다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 묶음마다 번호 · 색 교차의 시작 순번(앞 묶음들의 판 수 합).
  const starts = groups.map((_, i) => groups.slice(0, i).reduce((n, g) => n + g.items.length, 0));
  return (
    <>
      {groups.map((group, gi) => {
        const startIndex = starts[gi];
        return (
          <section key={group.id} aria-labelledby={group.id} className="flex flex-col">
            {/* UX D-144(§103 · 2026-10-22 실기 피드백 "분류가 눈에 잘 안 들어온다") — 묶음 제목을 강한 색 판 사이에서 갈라 보이게:
                위 여백을 넓히고(앞 묶음과 끊기) · 큰 제목 글씨 + 모래색 막대 + 판 수 · 아래 굵은 선(첫 판과 한 묶음으로). */}
            <h2
              id={group.id}
              data-toc-target
              className="flex items-center gap-3 border-b-[3px] border-ink px-[22px] pb-3 pt-10 text-[26px] font-extrabold leading-[1.3] tracking-[-0.02em] text-ink [word-break:keep-all]"
            >
              <span aria-hidden="true" className="h-8 w-2 shrink-0 rounded-full bg-sand" />
              <span className="min-w-0">
                {group.label}
                <span className="ml-2 whitespace-nowrap text-[17px] font-semibold tracking-normal text-ink-sub">
                  {group.items.length}개
                </span>
              </span>
            </h2>
            <PanelList items={group.items} startIndex={startIndex} onSelect={onSelect} />
          </section>
        );
      })}
    </>
  );
}

/** 시나리오 판 하나 — 제목 · 표(고급 전용 · 다시 훈련) · 설명 3줄(누가 연락하는지 / 소요 시간 · 수법 / 성향). */
export function scenarioPanelItem({
  id,
  icon,
  title,
  tags,
  lines,
}: {
  id: string;
  icon: LineIconName;
  title: string;
  /** 제목 옆 표(글자 — 색 단독 표기 금지 P-22) */
  tags: readonly string[];
  lines: readonly ReactNode[];
}): PanelItem {
  return {
    key: id,
    icon,
    title,
    badge:
      tags.length > 0 ? (
        <span className="inline-flex flex-wrap gap-1">
          {tags.map((t) => (
            <PanelBadge key={t}>{t}</PanelBadge>
          ))}
        </span>
      ) : undefined,
    description: (
      <span className="flex flex-col">
        {lines.map((line, i) => (
          <span key={i}>{line}</span>
        ))}
      </span>
    ),
  };
}
