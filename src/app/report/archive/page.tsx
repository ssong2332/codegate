"use client";

// UX-030 실패 아카이브 — 내가 속았던 순간 모아보기 (T74, UF-010, AC-068/AC-069)
//
// **UX-012(히스토리)와 단위가 다르다(D-44)** — UX-012는 세션 1건 = 항목 1건, 이 화면은 **속은 순간
// 1건 = 항목 1건**이다(한 세션에서 3번 속았으면 항목 3개). 그래서 별도 화면이고, 정렬(최신순/수법별
// 묶기)과 항목별 재훈련 동선이 이 화면에만 붙는다.
//
// **읽기 전용 화면이다** — Firestore write가 없다(UX-030 Data Operations "쓰기 없음"). 신규 분석
// 파이프라인도 도입하지 않고 기존 리포트 산출물(`deceivedMoments`)만 재사용한다.
//
// ⚠️ AC-069(협상 대상 아님): ① 쿼리는 본인 uid 조건 하나뿐이고(fetchArchiveReportPage), ②
// `challengeId`가 있는 리포트는 summarizeArchive가 한 번 더 배제한다(2차 방어, §15.4.3). ③ 세션
// 종료 시 합성 음성·생성물은 폐기되므로(AC-021) **이 화면에는 오디오 재생 경로가 존재하지 않는다**
// — 텍스트 정보만 그린다. ④ 검색·기간/채널 필터·통계 대시보드는 만들지 않는다(D-45 스코프 크립 방지).
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { useCurrentUser } from "@/lib/auth";
import { scenarios } from "@/content/scenarios";
import { setExperienceMode, setSelectedTrainingType } from "@/lib/recording";
import { Badge, Button } from "@/components/ui";
import {
  fetchArchiveReportPage,
  groupArchiveItemsByTactic,
  resolveRetrainTarget,
  summarizeArchive,
  type ArchiveMomentItem,
  type ArchiveReportSource,
} from "@/lib/archive";

type PageState = "loading" | "error" | "empty-no-history" | "empty-never-deceived" | "success";
type SortMode = "recent" | "tactic";

const CHANNEL_LABEL: Record<"voice" | "messenger", string> = {
  voice: "보이스",
  messenger: "메신저",
};

export default function FailureArchivePage() {
  const router = useRouter();
  const { user } = useCurrentUser();

  const [state, setState] = useState<PageState>("loading");
  const [reports, setReports] = useState<ArchiveReportSource[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // 네트워크 호출은 setState 없는 순수 헬퍼로 분리한다(history/page.tsx·report/page.tsx와 동일한
  // react-hooks/set-state-in-effect 회피 관례).
  const loadFirstPage = useCallback((uid: string) => fetchArchiveReportPage(uid, null), []);

  const applyPage = useCallback(
    (nextReports: ArchiveReportSource[]) => {
      setReports(nextReports);
      const { items, ownedReportCount } = summarizeArchive(nextReports);
      if (items.length > 0) setState("success");
      else setState(ownedReportCount > 0 ? "empty-never-deceived" : "empty-no-history");
    },
    [],
  );

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await loadFirstPage(user.uid);
        if (cancelled) return;
        setCursor(page.cursor);
        setHasMore(page.hasMore);
        applyPage(page.reports);
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loadFirstPage, applyPage]);

  // UX-030 Focus Order — 진입 시 포커스는 목록 제목으로.
  useEffect(() => {
    if (state === "success") headingRef.current?.focus();
  }, [state]);

  const handleRetry = () => {
    if (!user) return;
    setState("loading");
    loadFirstPage(user.uid)
      .then((page) => {
        setCursor(page.cursor);
        setHasMore(page.hasMore);
        applyPage(page.reports);
      })
      .catch(() => setState("error"));
  };

  const handleLoadMore = () => {
    if (!user || !cursor || loadingMore) return;
    setLoadingMore(true);
    fetchArchiveReportPage(user.uid, cursor)
      .then((page) => {
        setCursor(page.cursor);
        setHasMore(page.hasMore);
        applyPage([...reports, ...page.reports]);
      })
      .catch(() => {
        // 추가 로드 실패는 이미 보고 있는 목록을 지우지 않는다(비차단) — 다시 누를 수 있게 둔다.
        setHasMore(true);
      })
      .finally(() => setLoadingMore(false));
  };

  const { items } = summarizeArchive(reports);
  const groups = groupArchiveItemsByTactic(items);

  const goToReplay = (item: ArchiveMomentItem) => {
    if (!item.sessionId) return;
    router.push(
      `/report/replay?sessionId=${encodeURIComponent(item.sessionId)}&moment=${item.momentIndex}`,
    );
  };
  const goToRewind = (item: ArchiveMomentItem) => {
    router.push(
      `/report/rewind?reportId=${encodeURIComponent(item.reportId)}&moment=${item.momentIndex}`,
    );
  };
  const goToRetrain = (item: ArchiveMomentItem) => {
    const target = resolveRetrainTarget(item.scenarioId, item.scenarioId ? scenarios[item.scenarioId] : null);
    // 드릴다운 화면들이 읽는 힌트를 미리 세팅한다(scenarios/page.tsx·experience-select와 동일 규약).
    // 재훈련은 언제나 "본인이 체험"이다 — 아카이브에서 지인 발송으로 새는 동선을 만들지 않는다.
    if (target.trainingType) {
      setSelectedTrainingType(target.trainingType);
      setExperienceMode("self");
    }
    router.push(target.path);
  };

  if (state === "loading") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p className="flex items-center gap-2 text-lg text-[#22303A]" role="status">
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-[#C9C2B6] border-t-transparent"
          />
          속았던 순간을 불러오는 중입니다...
        </p>
      </main>
    );
  }

  if (state === "error") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>속았던 순간을 불러오지 못했습니다. 다시 시도해 주세요.</span>
        </p>
        <div className="w-full max-w-xs">
          <Button type="button" variant="primary" onClick={handleRetry}>
            다시 시도
          </Button>
        </div>
      </main>
    );
  }

  // Empty(A) — 훈련 이력 자체가 없음. Empty(B)와 **구분해서** 보여준다(UX-030 States).
  if (state === "empty-no-history") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <h1 className="text-xl font-bold text-[#22303A]">내가 속았던 순간</h1>
        <p role="status" className="text-base leading-relaxed text-[#6B655C]">
          아직 훈련 기록이 없습니다. 훈련을 한 번 해보시면 여기에 되돌아볼 순간이 모입니다.
        </p>
        <div className="flex w-full max-w-xs flex-col gap-2.5">
          <Button type="button" variant="primary" onClick={() => router.push("/scenarios")}>
            훈련 시작하기
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/")}>
            처음으로
          </Button>
        </div>
      </main>
    );
  }

  // Empty(B) — 훈련은 했지만 한 번도 속지 않음. ⚠️ "이제 면역됐습니다" 류 과신 표현 금지(P-8,
  // AC-009 정합) — 사실만 말하고 계속 훈련하도록 안내한다.
  if (state === "empty-never-deceived") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <h1 className="text-xl font-bold text-[#22303A]">내가 속았던 순간</h1>
        <p role="status" className="text-base font-semibold text-[#0E6B62]">
          지금까지 넘어간 순간이 없습니다.
        </p>
        <p className="text-base leading-relaxed text-[#6B655C]">
          사기 수법은 계속 바뀌기 때문에 이걸로 끝은 아닙니다. 계속 훈련해 보세요 · 난이도를 올려볼
          수 있어요.
        </p>
        <div className="flex w-full max-w-xs flex-col gap-2.5">
          <Button type="button" variant="primary" onClick={() => router.push("/scenarios")}>
            훈련 시작하기
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/history")}>
            지난 훈련 기록 보기
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/")}>
            처음으로
          </Button>
        </div>
      </main>
    );
  }

  // P-23 속은 순간 카드 — ① 언제 ② 어떤 상황 ③ 어떤 수법 ④ 올바른 대처(기본 접힘).
  const renderCard = (item: ArchiveMomentItem) => {
    const scenario = item.scenarioId ? scenarios[item.scenarioId] : undefined;
    const scenarioTitle = scenario?.title ?? "훈련 시나리오";
    const cardName = [item.dateLabel, scenarioTitle].filter(Boolean).join(" ");
    const expanded = expandedKey === item.key;

    return (
      <li key={item.key} className="rounded-2xl border border-[#E2DDD3] bg-white p-[18px]">
        <p className="text-[13px] font-semibold text-[#6B655C]">
          {[item.dateLabel, item.timeLabel].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-1 text-lg font-bold text-[#22303A]">{scenarioTitle}</p>
        {/* 채널·수법은 색이 아니라 아이콘 + 텍스트 라벨로 이중 표기한다(UX-030 Accessibility). */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="neutral">
            <span aria-hidden="true">{item.channel === "messenger" ? "💬" : "📞"}</span>
            {CHANNEL_LABEL[item.channel]}
          </Badge>
          <Badge variant="caution">
            <span aria-hidden="true">⚠</span>
            {item.tactic}
          </Badge>
        </div>
        <p className="mt-2 text-base leading-relaxed text-[#6B655C]">
          이 수법에 넘어간 순간입니다.
        </p>

        {/* ④ 올바른 대처(AC-026) — 기본 접힘. */}
        <button
          type="button"
          onClick={() => setExpandedKey(expanded ? null : item.key)}
          aria-expanded={expanded}
          className="mt-3 flex min-h-[48px] w-full items-center justify-between rounded-xl border border-[#E2DDD3] px-4 text-base font-semibold text-[#22303A]"
        >
          그때 올바른 대처 보기
          <span aria-hidden="true" className="text-[#6B655C]">
            {expanded ? "▴" : "▾"}
          </span>
        </button>
        {expanded && (
          <p className="mt-2 rounded-xl bg-[#E4F0EC] p-4 text-base leading-relaxed text-[#22303A]">
            {item.correctAction}
          </p>
        )}

        {/* 재훈련 동선 3개(UX-030 Primary Actions). 접근 이름에 카드 제목을 붙여 스크린리더가
            "어느 순간의 버튼"인지 알 수 있게 한다(UX-030 Accessibility). */}
        <div className="mt-3 flex flex-col gap-2">
          {item.sessionId ? (
            <button
              type="button"
              onClick={() => goToReplay(item)}
              aria-label={`${cardName} — 그때 대화 보기`}
              className="min-h-[48px] w-full rounded-xl border border-[#E2DDD3] px-4 text-base font-semibold text-[#22303A]"
            >
              그때 대화 보기
            </button>
          ) : (
            // Failure(UX-030) — 침묵 실패 금지. 가리킬 원 대화가 없으면 그 동선만 비활성하고 사유를
            // 한 줄 남긴다. 나머지 정보·동선은 그대로 쓸 수 있다.
            <div>
              <button
                type="button"
                disabled
                aria-label={`${cardName} — 그때 대화 보기(사용 불가)`}
                className="min-h-[48px] w-full cursor-not-allowed rounded-xl border border-transparent bg-[#F2EFE9] px-4 text-base font-semibold text-[#C9C2B6]"
              >
                그때 대화 보기
              </button>
              <p className="mt-1 text-[13px] text-[#6B655C]">
                이 기록에는 원래 대화를 가리킬 정보가 없어 대화 보기를 열 수 없습니다.
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => goToRewind(item)}
            aria-label={`${cardName} — 그 순간 다시 해보기`}
            className="min-h-[48px] w-full rounded-xl border border-[#0E6B62] px-4 text-base font-semibold text-[#0E6B62]"
          >
            그 순간 다시 해보기
          </button>
          <button
            type="button"
            onClick={() => goToRetrain(item)}
            aria-label={`${cardName} — 이 시나리오 다시 훈련`}
            className="min-h-[48px] w-full rounded-xl border border-[#E2DDD3] px-4 text-base font-semibold text-[#22303A]"
          >
            이 시나리오 다시 훈련
          </button>
        </div>
      </li>
    );
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col bg-[#FAF8F5] pb-8">
      <div className="px-5 pt-[22px]">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-[24px] font-bold leading-[1.35] text-[#22303A] outline-none"
        >
          내가 속았던 순간
        </h1>
        {/* 톤(P-8) — 질책이 아니라 "개선 영역" 프레임. */}
        <p className="mt-1 text-base leading-relaxed text-[#6B655C]">
          지난 훈련에서 넘어갔던 순간 {items.length}개를 모았습니다. 잘못한 기록이 아니라 다시
          연습해볼 지점입니다.
        </p>
      </div>

      {/* 정렬 전환 2종만 — 검색·기간 필터·통계는 제공하지 않는다(D-45). */}
      <div
        role="group"
        aria-label="정렬 방식"
        className="mx-5 mt-4 flex gap-2 rounded-2xl border border-[#E2DDD3] bg-white p-2"
      >
        <button
          type="button"
          onClick={() => setSortMode("recent")}
          aria-pressed={sortMode === "recent"}
          className={`min-h-[48px] flex-1 rounded-xl px-3 text-base font-semibold ${
            sortMode === "recent" ? "bg-[#0E6B62] text-white" : "text-[#22303A]"
          }`}
        >
          최신순
        </button>
        <button
          type="button"
          onClick={() => setSortMode("tactic")}
          aria-pressed={sortMode === "tactic"}
          className={`min-h-[48px] flex-1 rounded-xl px-3 text-base font-semibold ${
            sortMode === "tactic" ? "bg-[#0E6B62] text-white" : "text-[#22303A]"
          }`}
        >
          수법별로 묶기
        </button>
      </div>

      {/* 정직성 요건(§15.4.1) — 아직 안 불러온 페이지가 있으면 집계가 "불러온 범위"임을 밝힌다. */}
      {hasMore && (
        <p role="status" className="mx-5 mt-2 text-[13px] leading-relaxed text-[#6B655C]">
          지금까지 불러온 기록만 세고 있습니다. 아래 &quot;더 보기&quot;로 이전 기록을 더 불러올 수
          있습니다.
        </p>
      )}

      {sortMode === "recent" ? (
        <ul className="mx-5 mt-4 flex flex-col gap-3">{items.map(renderCard)}</ul>
      ) : (
        <div className="mx-5 mt-4 flex flex-col gap-5">
          {groups.map((group) => (
            <section key={group.key} aria-label={`${group.label} — ${group.count}건`}>
              {/* 그룹 헤더 — 반복 횟수를 **텍스트로** 명시해 스크린리더에도 전달한다(P-23). */}
              <div className="sticky top-0 z-10 -mx-1 rounded-xl bg-[#FAF8F5] px-1 py-2">
                <p className="text-lg font-bold text-[#22303A]">
                  {group.label} — {group.count}건
                </p>
                <p className="text-[13px] text-[#6B655C]">
                  이 수법에 {group.count}번 넘어갔습니다.
                  {group.otherLabels.length > 0 &&
                    ` (같은 수법의 다른 표기: ${group.otherLabels.join(" · ")})`}
                </p>
              </div>
              <ul className="mt-2 flex flex-col gap-3">{group.items.map(renderCard)}</ul>
            </section>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="mx-5 mt-4">
          <Button type="button" variant="secondary" onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? "불러오는 중입니다..." : "더 보기"}
          </Button>
        </div>
      )}

      <div className="mx-5 mt-5 flex flex-col gap-2.5">
        <Button type="button" variant="secondary" onClick={() => router.push("/history")}>
          지난 훈련 기록 보기
        </Button>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="min-h-[48px] rounded-2xl px-6 py-3 text-base font-semibold text-[#6B655C]"
        >
          처음으로
        </button>
      </div>

      <div className="mx-5 mt-4 rounded-[12px] bg-[#F2EFE9] px-4 py-3">
        <p className="text-[13px] leading-[1.6] text-[#6B655C]">
          같은 수법에 여러 번 넘어갔더라도 이상한 일이 아닙니다. 어디서 반복해 흔들리는지 알아두는
          것만으로도 다음에 알아챌 가능성이 올라갑니다.
        </p>
      </div>
    </main>
  );
}
