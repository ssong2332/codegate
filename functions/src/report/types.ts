// report 모듈 요청/응답 타입 — src/lib/api/types.ts(클라 계약)와 1:1 대응(API.md).
export type GenerateReportRequest = { sessionId: string };
export type GenerateReportResponse = { reportId: string };
