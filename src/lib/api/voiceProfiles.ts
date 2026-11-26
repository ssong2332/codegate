import { callCallable } from "./callable";
import type {
  DeleteVoiceProfileRequest,
  DeleteVoiceProfileResponse,
  SaveVoiceProfileRequest,
  SaveVoiceProfileResponse,
} from "./types";

/** §144 — 보내기 녹음을 목소리 프로필로 저장(동의 · 기간 · 이름). 서버가 3개 상한 · 사전 세션 폐기까지 한다. */
export async function saveVoiceProfile(request: SaveVoiceProfileRequest): Promise<SaveVoiceProfileResponse> {
  return callCallable<SaveVoiceProfileRequest, SaveVoiceProfileResponse>("saveVoiceProfile", request);
}

/** §144 — 프로필 즉시 삭제. 그 목소리로 만든 챌린지도 함께 폐기된다(링크 무효). */
export async function deleteVoiceProfile(request: DeleteVoiceProfileRequest): Promise<DeleteVoiceProfileResponse> {
  return callCallable<DeleteVoiceProfileRequest, DeleteVoiceProfileResponse>("deleteVoiceProfile", request);
}
