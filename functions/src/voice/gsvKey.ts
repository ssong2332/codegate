// §143.8 — 합성 서비스 토큰 키 판독. ⛔ 이 파일을 가져오는 콜러블은 `secrets: [GSV_TOKEN_KEY]`를 선언해야 한다(secretDeclarationGate).
import { GSV_TOKEN_KEY } from "../shared/config";

export function gsvKey(): string {
  try {
    const k = GSV_TOKEN_KEY.value() ?? "";
    return k.startsWith("YOUR_") ? "" : k;
  } catch {
    return "";
  }
}
