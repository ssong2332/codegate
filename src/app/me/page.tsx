"use client";

// '내 정보' 허브(§144 · DECISIONS #257 · UX D-164) — 저장한 목소리 · 내가 만든 챌린지 · 내 리포트를 한 화면에서 요약하고
// 기존 화면(/challenge/results · /history · /report/archive · /grade)으로 들어간다. 목록 화면을 새로 만들지 않는다.
// 익명(챌린지 받는 사람)은 이 경로가 수신 흐름 허용 목록(anonymousScope.ts)에 없어 RouteGuard가 /login 안내로 보낸다(AC-090).
// 서버 쪽 판정도 그대로다(listMyChallenges · deleteVoiceProfile = 익명 거부 · AC-085).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/auth";
import { deleteVoiceProfile } from "@/lib/api";
import { fetchMyChallenges, mapChallengesToListItems, type ChallengeListItem } from "@/lib/challenge";
import { fetchReportHistory, mapReportsToHistoryItems, type HistoryListItem } from "@/lib/history";
import { fetchVoiceProfiles } from "@/lib/voices/fetchStoredVoices";
import { voiceUsageCounts, type VoiceProfileSummary } from "@/lib/voices/voiceProfileConsent";
import VoiceProfileList from "@/components/VoiceProfileList";
import { Button, DisplayTitle, LoadingDots } from "@/components/ui";

const RECENT_COUNT = 3;

type Loaded<T> = { status: "loading" } | { status: "error" } | { status: "ok"; data: T };

type VoicesData = { profiles: VoiceProfileSummary[]; nowMs: number };
type ChallengesData = { recent: ChallengeListItem[]; total: number; usage: Record<string, number> };
type ReportsData = { recent: HistoryListItem[]; total: number };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-[8px] border-[1.5px] border-line bg-white p-4">
      <h2 className="text-[19px] font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function StateLine({ state, empty }: { state: Loaded<unknown>; empty: boolean }) {
  if (state.status === "loading") {
    return (
      <p role="status" className="flex items-center gap-2 text-base text-ink-sub">
        <LoadingDots /> 불러오는 중
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="text-base text-danger">
        불러오지 못했습니다. 새로고침해 주세요.
      </p>
    );
  }
  return empty ? <p className="text-base text-ink-sub">아직 없습니다.</p> : null;
}

export default function MyHubPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [voices, setVoices] = useState<Loaded<VoicesData>>({ status: "loading" });
  const [challenges, setChallenges] = useState<Loaded<ChallengesData>>({ status: "loading" });
  const [reports, setReports] = useState<Loaded<ReportsData>>({ status: "loading" });
  const [reload, setReload] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    // 세 묶음은 서로 기다리지 않는다 — 하나가 실패해도 나머지는 보인다.
    (async () => {
      try {
        const profiles = await fetchVoiceProfiles(user.uid);
        const nowMs = Date.now();
        if (!cancelled) setVoices({ status: "ok", data: { profiles: profiles.filter((p) => p.retentionDeleteAtMs > nowMs), nowMs } });
      } catch {
        if (!cancelled) setVoices({ status: "error" });
      }
    })();
    (async () => {
      try {
        const raw = await fetchMyChallenges();
        const sorted = [...raw].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
        const items = mapChallengesToListItems(sorted);
        if (!cancelled) {
          setChallenges({
            status: "ok",
            data: { recent: items.slice(0, RECENT_COUNT), total: items.length, usage: voiceUsageCounts(raw) },
          });
        }
      } catch {
        if (!cancelled) setChallenges({ status: "error" });
      }
    })();
    (async () => {
      try {
        const items = mapReportsToHistoryItems(await fetchReportHistory(user.uid));
        if (!cancelled) setReports({ status: "ok", data: { recent: items.slice(0, RECENT_COUNT), total: items.length } });
      } catch {
        if (!cancelled) setReports({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, reload]);

  const handleDelete = async (profile: VoiceProfileSummary) => {
    setDeletingId(profile.profileId);
    setDeleteError(null);
    try {
      await deleteVoiceProfile({ profileId: profile.profileId });
      setReload((n) => n + 1); // 함께 폐기된 챌린지도 다시 센다
    } catch {
      setDeleteError("목소리를 지우지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 bg-page p-6">
      <header className="flex flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.push("/scenarios")}
          className="-ml-2 flex min-h-[48px] w-fit items-center gap-1 rounded-lg px-2 text-lg font-medium text-ink-sub hover:bg-neutral-tint"
        >
          <span aria-hidden="true">←</span> 처음으로
        </button>
        <DisplayTitle as="h1" size="lg" className="text-ink">
          내 기록 · 목소리
        </DisplayTitle>
      </header>

      <Section title="저장한 목소리">
        <StateLine state={voices} empty={voices.status === "ok" && voices.data.profiles.length === 0} />
        {voices.status === "ok" && (
          <VoiceProfileList
            profiles={voices.data.profiles}
            nowMs={voices.data.nowMs}
            onDelete={(profile) => void handleDelete(profile)}
            deletingId={deletingId}
            usage={challenges.status === "ok" ? challenges.data.usage : undefined}
          />
        )}
        {deleteError && (
          <p role="alert" className="text-base text-danger">
            {deleteError}
          </p>
        )}
        <p className="text-sm leading-relaxed text-ink-sub">
          목소리는 지인에게 보내기에서 녹음해 저장합니다. 지우면 그 목소리로 만든 챌린지 링크도 함께 사라집니다.
        </p>
      </Section>

      <Section title="내가 만든 챌린지">
        <StateLine state={challenges} empty={challenges.status === "ok" && challenges.data.total === 0} />
        {challenges.status === "ok" &&
          challenges.data.recent.map((item) => (
            <p key={item.challengeId} className="flex flex-col">
              <span className="text-[17px] font-semibold text-ink">{item.displayName}</span>
              <span className="text-sm text-ink-sub">
                {item.dateLabel} · {item.statusLabel}
              </span>
            </p>
          ))}
        <Button type="button" variant="secondary" onClick={() => router.push("/challenge/results")}>
          {challenges.status === "ok" ? `챌린지 모두 보기 (${challenges.data.total})` : "챌린지 모두 보기"}
        </Button>
      </Section>

      <Section title="내 리포트">
        <StateLine state={reports} empty={reports.status === "ok" && reports.data.total === 0} />
        {reports.status === "ok" &&
          reports.data.recent.map((item) => (
            <button
              key={item.reportId}
              type="button"
              onClick={() => router.push(`/report?sessionId=${item.sessionId}`)}
              className="flex min-h-[48px] items-center justify-between rounded-[8px] px-1 text-left text-[17px] text-ink hover:bg-neutral-tint"
            >
              <span>{item.dateLabel}</span>
              <span className="font-semibold">{item.resultLabel}</span>
            </button>
          ))}
        <Button type="button" variant="secondary" onClick={() => router.push("/history")}>
          {reports.status === "ok" ? `리포트 모두 보기 (${reports.data.total})` : "리포트 모두 보기"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push("/report/archive")}>
          속았던 순간 모아보기
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push("/grade")}>
          방어 등급
        </Button>
      </Section>
    </main>
  );
}
