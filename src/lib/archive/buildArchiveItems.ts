// 실패 아카이브(UX-030 / UF-010, T74, AC-068/AC-069) — 리포트 목록을 "속은 순간" 단위로
// 평탄화·묶기하는 순수 함수. Firestore 없이 단위 테스트 가능(lib/replay/buildReplayTimeline.ts·
// lib/rewind/buildRewindContext.ts와 동일 관례).
//
// **단위가 세션이 아니라 순간이다(D-44)** — 한 세션에서 3번 속았으면 항목 3개다. 신규 분석
// 파이프라인은 도입하지 않고 기존 리포트 산출물(`deceivedMoments`)만 재사용한다(UX-030 Business
// Rules, UX-018과 동일 원칙).
//
// **역정규화 컬렉션을 만들지 않는 이유**는 Architecture.md §15.4.1 참고 — 저장은 리포트 한 곳뿐이라
// 리포트가 사라지면 아카이브 항목도 자동으로 사라진다(고아 레코드 없음).

export type ArchiveChannel = "voice" | "messenger";

/** 리포트 문서의 `deceivedMoments[]` 원본(AC-026 3요소 + T74 묶기 키). */
export type ArchiveMomentSource = {
  turnIndex: number;
  timeLabel: string;
  tactic: string;
  correctAction: string;
  /** T74 이후 리포트에만 존재한다(§15.4.2). 없으면 `tactic` 원문으로 폴백한다(무백필). */
  tacticCategory?: string;
};

/** Firestore `reports/{rid}` 문서에서 아카이브가 쓰는 필드만 뽑은 형태. */
export type ArchiveReportSource = {
  reportId: string;
  sessionId: string | null;
  createdAt: Date | null;
  scenarioId: string | null;
  channel: ArchiveChannel | null;
  /** ⚠️ AC-069 2차 방어(§15.4.3) — 값이 있으면 2인 챌린지 체험 세션의 리포트다. */
  challengeId: string | null;
  deceivedMoments: ArchiveMomentSource[];
};

export type ArchiveMomentItem = {
  /** 리스트 key — 같은 리포트 안에서 순간 인덱스로 유일해진다. */
  key: string;
  reportId: string;
  /** 없으면 "그때 대화 보기"를 가리킬 대상이 없다(비활성 사유). */
  sessionId: string | null;
  /** 리포트 `deceivedMoments` 배열 안의 위치 — 되감기(`/report/rewind?moment=`)가 이 값을 쓴다. */
  momentIndex: number;
  turnIndex: number;
  createdAtMs: number | null;
  /** "2026년 7월 20일" — 값이 없으면 빈 문자열(없는 날짜를 지어내지 않는다). */
  dateLabel: string;
  /** "15초 시점" — 리포트가 저장한 원문 그대로. */
  timeLabel: string;
  scenarioId: string | null;
  channel: ArchiveChannel;
  /** 표시 문구는 언제나 원문이다(§15.4.2). */
  tactic: string;
  /** 묶기 키 — `tacticCategory ?? tactic`. 표시에 쓰지 않는다. */
  groupKey: string;
  correctAction: string;
};

export type ArchiveSummary = {
  items: ArchiveMomentItem[];
  /** 챌린지 제외 후 남은 본인 리포트 수 — 빈 상태 A(이력 없음)/B(안 속음) 구분에 쓴다(UX-030 States). */
  ownedReportCount: number;
  /** AC-069 2차 방어로 걸러 낸 리포트 수(관측용 — 정상 경로에서는 항상 0이다). */
  excludedChallengeReportCount: number;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

function formatDateLabel(date: Date | null): string {
  return date ? DATE_FORMATTER.format(date) : "";
}

/**
 * 묶기 키 — `tacticCategory ?? tactic`(§15.4.2 하위호환 규칙). 카테고리 값(snake_case)과 원문
 * 라벨이 우연히 같아지는 일이 없도록 접두사를 붙인다.
 *
 * `other`는 "어느 카테고리에도 안 맞음"이라는 뜻이므로 하나로 뭉치지 않고 원문 라벨로 되돌린다 —
 * 서로 무관한 수법들을 한 묶음으로 보여주면 "이 수법에 N번 넘어갔습니다"가 거짓이 된다.
 */
function resolveGroupKey(moment: ArchiveMomentSource): string {
  const category = moment.tacticCategory?.trim();
  if (category && category.length > 0 && category !== "other") return `category:${category}`;
  return `label:${moment.tactic}`;
}

/**
 * 리포트 페이지를 "속은 순간" 항목으로 평탄화한다(AC-068 — 한 세션에서 3번 속았으면 항목 3개).
 *
 * ⚠️ AC-069(협상 대상 아님) — `challengeId`가 있는 리포트는 **여기서 통째로 제외**된다. 1차 방어는
 * 쿼리 자체(본인 uid만, §15.4.3)이고 이건 2차 방어다. 사용자1이 사용자2(익명 수신자)의 실패
 * 이력을 보는 경로를 어떤 형태로도 만들지 않는다(AC-043/AC-055 결과 열람 제한 우회 금지).
 */
export function summarizeArchive(reports: ArchiveReportSource[]): ArchiveSummary {
  const owned = reports.filter((report) => !report.challengeId);
  const items: ArchiveMomentItem[] = [];

  for (const report of owned) {
    const dateLabel = formatDateLabel(report.createdAt);
    report.deceivedMoments.forEach((moment, momentIndex) => {
      items.push({
        key: `${report.reportId}#${momentIndex}`,
        reportId: report.reportId,
        sessionId: report.sessionId,
        momentIndex,
        turnIndex: moment.turnIndex,
        createdAtMs: report.createdAt ? report.createdAt.getTime() : null,
        dateLabel,
        timeLabel: moment.timeLabel,
        scenarioId: report.scenarioId,
        // 부재="voice"(하위호환 — Database.md Migration Policy, 기존 세션은 필드 부재만으로 보이스).
        channel: report.channel ?? "voice",
        tactic: moment.tactic,
        groupKey: resolveGroupKey(moment),
        correctAction: moment.correctAction,
      });
    });
  }

  return {
    items,
    ownedReportCount: owned.length,
    excludedChallengeReportCount: reports.length - owned.length,
  };
}

export type ArchiveGroup = {
  key: string;
  /** 그룹 헤더에 보이는 문구 — 묶음 안에서 **가장 최근** 항목의 `tactic` 원문(§15.4.2 "표시는 원문"). */
  label: string;
  /** 같은 묶음에 들어갔지만 표기가 다른 원문 라벨들(없으면 빈 배열) — 묶임을 숨기지 않기 위해 노출한다. */
  otherLabels: string[];
  count: number;
  items: ArchiveMomentItem[];
};

/**
 * "수법별로 묶기"(UX-030 Grouped) — 같은 수법에 몇 번 넘어갔는지가 드러나게 묶는다.
 * 입력 순서(최신순)를 그룹 안에서 그대로 유지하고, 그룹은 **반복 횟수 많은 순 → 최근 순**으로 낸다
 * (반복 인지가 이 화면의 핵심 가치, D-45).
 */
export function groupArchiveItemsByTactic(items: ArchiveMomentItem[]): ArchiveGroup[] {
  const buckets = new Map<string, ArchiveMomentItem[]>();
  for (const item of items) {
    const bucket = buckets.get(item.groupKey);
    if (bucket) bucket.push(item);
    else buckets.set(item.groupKey, [item]);
  }

  const groups: ArchiveGroup[] = [...buckets.entries()].map(([key, bucketItems]) => {
    const labels = bucketItems.map((item) => item.tactic);
    const label = labels[0];
    return {
      key,
      label,
      otherLabels: [...new Set(labels.filter((candidate) => candidate !== label))],
      count: bucketItems.length,
      items: bucketItems,
    };
  });

  return groups.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return (b.items[0].createdAtMs ?? 0) - (a.items[0].createdAtMs ?? 0);
  });
}
