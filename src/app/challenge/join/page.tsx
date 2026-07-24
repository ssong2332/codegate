"use client";

// UX-021 사용자2 동의 랜딩 (Track A/C, T37, AC-040/048/049, §14.7/ADR-0006).
//
// Entry: 사용자1이 공유한 링크(`/challenge/join?token=...`)를 로그인 없이 연다(AC-048). next.config.ts
// `output:"export"` 제약상 동적 경로 세그먼트 대신 이 앱의 기존 관례(report/replay 등)와 동일한
// query-param 패턴을 쓴다.
//
// **동의 흐름(§14.7/ADR-0006 A1)**: "동의하고 시작" 탭 → `signInAnonymously`(로그인 UI 없음, 익명
// uid 확보) → `consentChallenge({token})`(체험 세션 생성) → 그 sessionId를 세션 화면(UX-014,
// session/play)이 읽는 방식(getPendingSessionId, query param 아님)에 맞춰 `setPendingSessionId`로
// 채택한 뒤 `/session/play`로 이동한다(record/clone/wait 화면의 기존 관례와 동일).
//
// **무동의 경로 없음(AC-040)**: 이 화면에는 "동의하고 시작" 외에 체험(통화)로 진입하는 버튼/링크가
// 존재하지 않는다 — 동의 전에는 어떤 복제 음성도 재생되지 않는다.
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInAnonymously } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getChallengeLanding, consentChallenge, reportChallenge } from "@/lib/api";
import type { ChallengeReportReason } from "@/lib/api";
import {
  setPendingSessionId,
  setOpeningAudioUrl,
  setOpeningMessageText,
  setChallengeToken,
} from "@/lib/recording";
import { Banner, Button } from "@/components/ui";

type PageState = "no-token" | "loading" | "blocked" | "load-error" | "ready";

const REPORT_REASON_LABELS: { value: ChallengeReportReason; label: string }[] = [
  { value: "unwanted", label: "원치 않는 체험이에요" },
  { value: "harassment", label: "괴롭힘·악용으로 느껴져요" },
  { value: "impersonation_concern", label: "사칭 오남용이 걱정돼요" },
  { value: "other", label: "기타" },
];

export default function ChallengeJoinPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [state, setState] = useState<PageState>(token ? "loading" : "no-token");
  const [blockedMessage, setBlockedMessage] = useState<string>("이 링크는 더 이상 이용할 수 없습니다.");
  const [displayName, setDisplayName] = useState<string>("");
  const [consenting, setConsenting] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  const [showReportForm, setShowReportForm] = useState(false);
  const [reportReason, setReportReason] = useState<ChallengeReportReason>("unwanted");
  const [reportNote, setReportNote] = useState("");
  const [reportState, setReportState] = useState<"idle" | "submitting" | "submitted" | "error">(
    "idle",
  );

  const loadLanding = async (t: string) => {
    const result = await getChallengeLanding({ token: t });
    // AC-048/§14.4 — 만료됐거나(expired) 더 이상 진행 불가능한 status면 진입을 차단한다. status가
    // pending/consented/in_progress면(§14.4 "중도 이탈 복귀") 동의 화면을 그대로 보여준다 — 실제
    // "이미 다른 사람이 동의함" 판정은 consentChallenge가 서버에서 최종 검증한다(AC-040 재확인).
    const resumable = result.status === "pending" || result.status === "consented" || result.status === "in_progress";
    if (result.expired || !resumable) {
      setBlockedMessage(
        result.expired ? "이 링크는 만료되었습니다." : "이 챌린지는 더 이상 이용할 수 없습니다.",
      );
      setState("blocked");
      return;
    }
    setDisplayName(result.displayName);
    setState("ready");
  };

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        await loadLanding(token);
      } catch {
        if (!cancelled) setState("load-error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleRetryLoad = () => {
    if (!token) return;
    setState("loading");
    loadLanding(token).catch(() => setState("load-error"));
  };

  const handleConsent = async () => {
    if (!token || consenting) return;
    setConsentError(null);
    setConsenting(true);
    try {
      // §14.7/ADR-0006 A1 — 로그인 UI 없이 익명 uid만 확보한다. 이미 같은 브라우저에 익명 세션이
      // 있으면(로컬 persistence) 같은 uid가 그대로 재사용된다(중도 이탈 복귀와 자연히 정합).
      await signInAnonymously(auth);
      const result = await consentChallenge({ token });
      setPendingSessionId(result.sessionId);
      setChallengeToken(token);
      if (result.openingAudioUrl) setOpeningAudioUrl(result.openingAudioUrl);
      // 사용자 신고(2026-07-24) — 실시간 통화 "AI가 먼저 말해야" 수정, ScenarioListView.tsx와
      // 동일 근거.
      if (result.openingMessageText) setOpeningMessageText(result.openingMessageText);
      router.push("/session/play");
    } catch {
      setConsentError("동의 처리에 실패했습니다. 다시 시도해 주세요.");
      setConsenting(false);
    }
  };

  const handleSubmitReport = async () => {
    if (!token || reportState === "submitting") return;
    setReportState("submitting");
    try {
      await reportChallenge({
        token,
        reason: reportReason,
        ...(reportNote.trim() ? { note: reportNote.trim() } : {}),
      });
      setReportState("submitted");
    } catch {
      setReportState("error");
    }
  };

  if (state === "no-token") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>유효한 링크가 아닙니다. 받은 링크를 다시 확인해 주세요.</span>
        </p>
      </main>
    );
  }

  if (state === "loading") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p className="flex items-center gap-2 text-lg text-[#22303A]" role="status">
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-[#C9C2B6] border-t-transparent"
          />
          링크를 확인하는 중입니다...
        </p>
      </main>
    );
  }

  if (state === "blocked") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>{blockedMessage}</span>
        </p>
      </main>
    );
  }

  if (state === "load-error") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>링크 정보를 불러오지 못했습니다. 다시 시도해 주세요.</span>
        </p>
        <button
          type="button"
          onClick={handleRetryLoad}
          className="min-h-[48px] rounded-xl bg-[#0E6B62] px-6 py-3 text-lg font-bold text-white"
        >
          다시 시도
        </button>
      </main>
    );
  }

  // state === "ready"
  // 안내 요점 3개(챌린지 플로우.dc.html "화면 2" 안내 포인트 카드 재현) — 기존 한 문단이 담고
  // 있던 문장을 그대로 셋으로 나눈 것뿐, 새 정보를 추가하지 않았다(제목에 이미 있는 표시 이름
  // 소개 문장만 중복이라 제외).
  const consentPoints = [
    "지금부터 받는 전화·문자는 실제가 아닌 훈련입니다.",
    "실제로 돈이나 개인정보가 오가지 않습니다.",
    "통화 중 언제든 끊을 수 있습니다.",
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 bg-[#FAF8F5] p-6">
      {/* 상시 노출 훈련 초대 배너 — 닫기 불가(Banner 컴포넌트 계약, README "Interactions &
          Behavior"). 동의 전 무동의 재생 없음(AC-040)을 화면 진입 즉시 재확인시킨다. */}
      <Banner variant="caution">
        <span className="font-semibold text-[#B96A1B]">훈련 초대입니다.</span> 동의 전에는 아무것도
        시작되지 않아요.
      </Banner>

      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold leading-relaxed text-[#22303A]">
          <span className="text-[#0E6B62]">{displayName}</span>님이 보이스피싱 인식 테스트를
          준비했어요
        </h1>

        <div className="flex flex-col gap-3 rounded-[16px] border-[1.5px] border-[#E2DDD3] bg-white p-4">
          {consentPoints.map((point) => (
            <div key={point} className="flex items-start gap-2.5">
              <svg
                className="mt-[3px] shrink-0"
                width="14"
                height="14"
                viewBox="0 0 13 13"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M2.5 7L5.2 9.7L10.5 3.5"
                  stroke="#0E6B62"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p className="text-[14px] leading-[1.55] text-[#22303A]">{point}</p>
            </div>
          ))}
        </div>
      </header>

      {consentError && (
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>{consentError}</span>
        </p>
      )}

      {/* AC-040 — 무동의로 체험(통화)에 진입하는 버튼/경로는 이 화면에 존재하지 않는다. */}
      <Button type="button" onClick={() => void handleConsent()} disabled={consenting}>
        {consenting ? (
          <span className="flex items-center justify-center gap-2" role="status">
            <span
              aria-hidden="true"
              className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"
            />
            시작하는 중...
          </span>
        ) : (
          "동의하고 시작"
        )}
      </Button>

      {/* AC-049 — 신고 버튼 위치(이 랜딩). 정책·데이터 모델은 architect(§14.5), 이 화면은 UI만.
          경고색(#C6392F)으로 스타일해 신고 경로를 기존보다 더 눈에 띄게 한다(제약 #2 — 덜 눈에
          띄게 만들지 않는다는 요건과 상충하지 않음, 오히려 강화). */}
      {!showReportForm ? (
        <button
          type="button"
          onClick={() => setShowReportForm(true)}
          className="min-h-[48px] w-fit rounded-lg px-2 text-center text-[13px] font-semibold text-[#C6392F] underline hover:bg-[#F2EFE9]"
        >
          원치 않는 챌린지인가요? 신고하기
        </button>
      ) : reportState === "submitted" ? (
        <p role="status" className="text-base text-[#0E6B62]">
          신고가 접수되었습니다. 이 챌린지는 더 이상 재생되지 않습니다.
        </p>
      ) : (
        <div className="flex flex-col gap-3 rounded-[16px] border-[1.5px] border-[#E2DDD3] bg-white p-4">
          <p className="text-base font-semibold text-[#22303A]">신고 사유를 선택해 주세요</p>
          <div className="flex flex-col gap-2">
            {REPORT_REASON_LABELS.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-base text-[#22303A]">
                <input
                  type="radio"
                  name="report-reason"
                  value={option.value}
                  checked={reportReason === option.value}
                  onChange={() => setReportReason(option.value)}
                  disabled={reportState === "submitting"}
                />
                {option.label}
              </label>
            ))}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-[#6B655C]">추가 메모(선택)</span>
            <textarea
              value={reportNote}
              onChange={(event) => setReportNote(event.target.value)}
              disabled={reportState === "submitting"}
              rows={3}
              className="rounded-[10px] border-[1.5px] border-[#E2DDD3] bg-white p-3 text-base text-[#22303A] outline-none focus:border-[#0E6B62]"
            />
          </label>
          {reportState === "error" && (
            <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
              <span aria-hidden="true">⚠</span>
              <span>신고 접수에 실패했습니다. 다시 시도해 주세요.</span>
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void handleSubmitReport()}
              disabled={reportState === "submitting"}
              className="min-h-[48px] flex-1 rounded-[12px] bg-[#C6392F] px-4 py-2 text-base font-bold text-white transition-colors hover:bg-[#A82F27] disabled:opacity-50"
            >
              {reportState === "submitting" ? "접수하는 중..." : "신고하기"}
            </button>
            <button
              type="button"
              onClick={() => setShowReportForm(false)}
              disabled={reportState === "submitting"}
              className="min-h-[48px] flex-1 rounded-[12px] border-[1.5px] border-[#E2DDD3] px-4 py-2 text-base font-semibold text-[#22303A] transition-colors hover:border-[#C9C2B6] disabled:opacity-50"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
