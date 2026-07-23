import { httpsCallable } from "firebase/functions";
import { functionsClient } from "@/lib/firebase";
import type { UpdateMessengerSkinRequest, UpdateMessengerSkinResponse } from "./types";

/**
 * Callable 실호출 — 메신저 채팅(UX-022)의 스킨 감지/수동 전환 결과를 세션 문서에 지속한다
 * (P-16 "리포트·새로고침·수동 전환 지속을 위해 세션 문서에 기록", T29). 스킨은 프레젠테이션
 * 전용이라 실패해도 화면의 로컬 스킨 상태 자체는 그대로 유지된다(비차단 — 기존 P-4 패턴과 동일,
 * 호출부는 실패를 조용히 흡수하고 다음 새로고침에서 재감지로 폴백한다).
 */
export async function updateMessengerSkin(
  request: UpdateMessengerSkinRequest,
): Promise<UpdateMessengerSkinResponse> {
  const callable = httpsCallable<UpdateMessengerSkinRequest, UpdateMessengerSkinResponse>(
    functionsClient,
    "updateMessengerSkin",
  );
  const { data } = await callable(request);
  return data;
}
