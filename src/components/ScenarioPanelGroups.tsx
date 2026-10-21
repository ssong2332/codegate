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
  onSelect: (scenarioId: string) => void;
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

  let offset = 0;
  return (
    <>
      {groups.map((group) => {
        const startIndex = offset;
        offset += group.items.length;
        return (
          <section key={group.id} aria-labelledby={group.id} className="flex flex-col">
            <h2 id={group.id} data-toc-target className="px-[22px] pb-3 pt-5 text-[20px] font-bold text-ink [word-break:keep-all]">
              {group.label}
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
