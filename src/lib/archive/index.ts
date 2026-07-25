// 실패 아카이브(UX-030 / UF-010, T74, AC-068/AC-069) 공개 표면.
export {
  summarizeArchive,
  groupArchiveItemsByTactic,
  type ArchiveChannel,
  type ArchiveGroup,
  type ArchiveMomentItem,
  type ArchiveMomentSource,
  type ArchiveReportSource,
  type ArchiveSummary,
} from "./buildArchiveItems";
export { fetchArchiveReportPage, ARCHIVE_PAGE_SIZE, type ArchivePage } from "./fetchArchivePage";
export {
  resolveRetrainTarget,
  type RetrainScenarioMeta,
  type RetrainTarget,
  type RetrainTrainingType,
} from "./retrainTarget";
