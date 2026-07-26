import { httpsCallable } from "firebase/functions";
import { functionsClient } from "@/lib/firebase";
import type { DeliverVerifyOfferRequest, DeliverVerifyOfferResponse } from "./types";

/**
 * Callable 실호출 — `deliverVerifyOffer` 1:1 (T83, UX-031/UF-011, ADR-0007 재적용).
 *
 * 통화 중 사기범 턴이 카탈로그의 가용 게이트에 도달했을 때 클라가 부른다. 서버가 시나리오 소속·
 * 난이도·프로바이더를 **전부 재검증**한 뒤 `sessions/{sid}/verifyIntercept/{offerId}` 문서를 쓰고,
 * 캐릭터가 "직접 확인해 보시라"고 권하게 하는 1줄 지시를 돌려준다.
 * **응답은 렌더 소스가 아니다** — 창구명·번호는 그 컬렉션 구독으로만 화면에 들어온다.
 */
export async function deliverVerifyOffer(
  request: DeliverVerifyOfferRequest,
): Promise<DeliverVerifyOfferResponse> {
  const callable = httpsCallable<DeliverVerifyOfferRequest, DeliverVerifyOfferResponse>(
    functionsClient,
    "deliverVerifyOffer",
  );
  const { data } = await callable(request);
  return data;
}
