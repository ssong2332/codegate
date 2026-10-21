"use client";

// 시안 E2 "큰 판 한 장씩"(UX D-141 · §97) — 화면 가로 큰 판 목록. 시안 A 카드 목록(SelectableCard · DrilldownOptionCard)을
// 선택 화면에서 대체한다(기존 결정 예외 — DECISIONS #210).
//
// 두 가지 쓰임:
//   - mode="navigate"(유형 · 시나리오): 누르면 그 판이 화면 전체로 커지며 다음 화면으로 간다(panelExpand.ts).
//     판 색은 밝기 교차(e2Layout.ts PANEL_TONES) — 색 + 번호 + 아이콘 + 경계선으로 구분한다(색만으로 구분 안 함).
//   - mode="choose"(난이도): 모든 판이 옅은 남색이고, 고른 판만 남색으로 채워지며 체크가 나타난다(이동 없음 —
//     아래 설명 시트에서 "이걸로 시작"을 누른다).
// ⚠️ ui 배럴 안에서는 `@/` 별칭 금지(렌더 하네스가 못 푼다) — 상대 경로만 쓴다.
// ⚠️ 부모는 좌우 여백 없이(가장자리까지) 이 목록을 놓는다 — 판 안쪽 여백(22px)이 화면 여백 역할을 한다.
import { useRef, type ReactNode } from "react";
import LineIcon, { type LineIconName } from "./LineIcon";
import { panelMinHeight, panelsFillHeight, panelTone } from "../../lib/design/e2Layout";
import { expandPanelThen } from "../../lib/motion/panelExpand";

export type PanelItem = {
  key: string;
  title: ReactNode;
  description?: ReactNode;
  icon?: LineIconName;
  /** 제목 옆 작은 표(예: "추천") */
  badge?: ReactNode;
  disabled?: boolean;
  "aria-label"?: string;
};

type Props = {
  items: readonly PanelItem[];
  /** 판 이동에서 `false`를 돌려주면 "이동 안 함"(덮개 0 — panelExpand.ts) */
  onSelect: (key: string) => boolean | void;
  mode?: "navigate" | "choose";
  /** mode="choose"에서 고른 판 */
  selectedKey?: string | null;
  /** 판 번호 원을 그린다(기본 true) */
  numbered?: boolean;
  /** 묶음으로 나눈 목록에서 번호 · 색 교차를 이어 가는 시작 순번(기본 0) */
  startIndex?: number;
  className?: string;
};

export default function PanelList({ items, onSelect, mode = "navigate", selectedKey = null, numbered = true, startIndex = 0, className = "" }: Props) {
  // choose(난이도)는 채우지 않는다 — 설명 시트가 열리면 목록 아래 여백으로 마지막 판까지 보이게(D-141 (3)).
  const fill = mode === "navigate" && panelsFillHeight(items.length);
  const minHeight = panelMinHeight(items.length);
  return (
    <ul className={`flex flex-col ${fill ? "flex-1" : ""} ${className}`} style={{ counterReset: "e2panel" }}>
      {items.map((item, i) => (
        <li key={item.key} className={`flex flex-col ${fill ? "flex-1" : ""}`}>
          <Panel
            item={item}
            index={startIndex + i}
            mode={mode}
            selected={mode === "choose" && selectedKey === item.key}
            numbered={numbered}
            minHeight={mode === "choose" ? 96 : minHeight}
            onSelect={onSelect}
          />
        </li>
      ))}
    </ul>
  );
}

function Panel({
  item,
  index,
  mode,
  selected,
  numbered,
  minHeight,
  onSelect,
}: {
  item: PanelItem;
  index: number;
  mode: "navigate" | "choose";
  selected: boolean;
  numbered: boolean;
  minHeight: number;
  /** 판 이동에서 `false`를 돌려주면 "이동 안 함"(덮개 0 — panelExpand.ts) */
  onSelect: (key: string) => boolean | void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const tone =
    mode === "choose"
      ? selected
        ? { surface: "bg-brand text-white", sub: "text-brand-tint", accent: "text-white" }
        : { surface: "bg-brand-tint text-ink border-t border-panel-line", sub: "text-ink-sub", accent: "text-brand" }
      : panelTone(index);

  const handleClick = () => {
    if (item.disabled) return;
    if (mode === "navigate" && ref.current) {
      expandPanelThen(ref.current, () => onSelect(item.key));
      return;
    }
    onSelect(item.key);
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={handleClick}
      disabled={item.disabled}
      aria-pressed={mode === "choose" ? selected : undefined}
      aria-label={item["aria-label"]}
      data-panel-key={item.key}
      /* 등장 순서는 6번째에서 멈춘다(긴 목록 아래쪽 판이 늦게 나타나지 않게). */
      style={{ minHeight, ["--e2-i" as string]: Math.min(index, 6) }}
      className={`e2-rise relative flex w-full flex-1 text-left transition-colors duration-150 focus-visible:outline-[3px] focus-visible:-outline-offset-[6px] focus-visible:outline-current disabled:cursor-not-allowed disabled:opacity-60 ${tone.surface} ${
        mode === "choose" ? "items-center gap-4 py-4 pl-[22px] pr-[64px]" : "flex-col justify-end gap-1 px-[22px] pb-4 pt-[58px]"
      }`}
    >
      {numbered && (
        <span
          aria-hidden="true"
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-current text-[17px] font-semibold tabular-nums ${
            mode === "choose" ? "" : "absolute left-[22px] top-4"
          } ${tone.accent}`}
        >
          {index + 1}
        </span>
      )}
      {item.icon && mode === "navigate" && (
        <span aria-hidden="true" className={`absolute right-[18px] top-[14px] ${tone.accent}`}>
          <LineIcon name={item.icon} size={42} />
        </span>
      )}
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-[25px] font-bold leading-[1.2] tracking-[-0.01em] [word-break:keep-all]">
          {item.title}
          {item.badge && <span className="ml-2 align-middle">{item.badge}</span>}
        </span>
        {item.description && (
          <span className={`text-[17px] leading-[1.45] [word-break:keep-all] ${tone.sub}`}>{item.description}</span>
        )}
      </span>
      {mode === "choose" && (
        <span
          aria-hidden="true"
          className={`absolute right-[22px] top-1/2 -mt-[17px] flex h-[34px] w-[34px] items-center justify-center rounded-full border-[3px] ${
            selected ? "border-white bg-white text-brand" : "border-line-strong"
          }`}
        >
          {selected && <LineIcon name="check" size={20} className="check-pop" />}
        </span>
      )}
    </button>
  );
}

/** 판 제목 옆 작은 표(모래 바탕 · 진한 글자). */
export function PanelBadge({ children }: { children: ReactNode }) {
  return <span className="inline-block rounded-[4px] bg-sand px-[6px] text-[14px] font-bold leading-[1.6] text-ink">{children}</span>;
}
