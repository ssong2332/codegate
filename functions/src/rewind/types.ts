// rewind 모듈 요청/응답 타입 — src/lib/api/types.ts(클라 계약)와 1:1 대응(API.md judgeRewindAnswer).
import type { RewindJudgedBy, RewindVerdict } from "./judge";

export type JudgeRewindAnswerRequest = {
  reportId: string;
  /** 리포트 deceivedMoments 배열의 인덱스(그 순간 하나를 지목). */
  momentIndex: number;
  /** 사용자가 다시 답한 문장(≤500자, 빈 문자열 거부). */
  answerText: string;
};

export type JudgeRewindAnswerResponse = {
  verdict: RewindVerdict;
  reason: string;
  /** 판정 불가(unclear)여도 반드시 채워 반환한다(학습 최소 보장, ADR-0008). */
  correctAction: string;
  judgedBy: RewindJudgedBy;
};
