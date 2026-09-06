// §59.10 커밋 A·B 회귀 그물 — "이 두 커밋은 동작 0 변화"를 소스 스캔으로 고정한다.
//
// ⛔ 이 파일이 지키는 것: 커밋 A(클라 수신 배선)·B(서버 콜러블 증분) 어느 쪽도 도구 **선언**
// (`geminiProvider.ts`의 `tools: []` → 채워진 배열)을 건드리지 않는다는 사실. 도구 선언 자체는
// §59 커밋 C(다음 단계, 이 패스의 범위 밖)의 몫이다 — 여기서 앞당겨지면 `toolConfig.mode=AUTO`도
// `liveTools.ts`도 없이 도구가 활성화돼 §59.3이 경고한 "프롬프트가 도구를 금지한 채로 도구만
// 켜지는" 상태가 될 수 있다(무해하지만 (라)가 켜지지 않는 죽은 상태 — G382의 반대쪽 위험).
//
// ⚠️ **관측 불가 지점 방어**(`feedback_unobservable_behavior_gates`) — `geminiProvider.ts`가
// 실제로 만드는 `LiveConnectConfig`는 런타임에만 조립되고 이 테스트 스위트는 에뮬레이터 없이
// 도는 순수 유닛 계층이라 실행 결과를 직접 볼 수 없다. 그래서 **소스 리터럴**을 스캔해 고정한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";

const GEMINI_PROVIDER_SRC = path.resolve(__dirname, "../../../src/realtime/geminiProvider.ts");

test("[§59.10 A·B 회귀 0] geminiProvider.ts의 tools 선언은 여전히 빈 배열이다", () => {
  const src = readFileSync(GEMINI_PROVIDER_SRC, "utf8");
  assert.match(
    src,
    /tools:\s*\[\]/,
    "tools:[] 리터럴이 사라졌다 — 이 값이 채워지는 것은 §59 커밋 C(도구 점화)의 몫이며 이 패스의 " +
      "범위가 아니다.",
  );
});

test("[§59.10 A·B 회귀 0] geminiProvider.ts에 신규 도구 관련 심볼이 아직 없다", () => {
  const src = readFileSync(GEMINI_PROVIDER_SRC, "utf8");
  for (const forbidden of ["liveTools", "toolDrivenTiming", "functionCallingConfig", "FunctionCallingConfigMode"]) {
    assert.ok(
      !src.includes(forbidden),
      `${forbidden}가 geminiProvider.ts에 등장했다 — 이 심볼은 §59 커밋 C(도구 점화)에서만 들어온다.`,
    );
  }
});
