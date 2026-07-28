import { callCallable } from "./callable";
import type {
  GenerateReportRequest,
  GenerateReportResponse,
} from "./types";

/**
 * Callable 실호출 — API.md `generateReport` 1:1 (Track A, T9, UX-008, AC-008/AC-009/AC-026).
 * T2 단계 더미 응답(Architecture.md §4 스텁 관례)을 T9에서 실호출로 교체했다(createSession.ts/
 * endSession.ts/synthesizeDeepvoice.ts와 동일 패턴).
 */
export async function generateReport(
  request: GenerateReportRequest,
): Promise<GenerateReportResponse> {
  return callCallable<GenerateReportRequest, GenerateReportResponse>("generateReport", request);
}
