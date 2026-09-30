---
name: cloud-functions-runtime-lifecycle
description: Cloud Functions Node 런타임 폐기일 정본 URL, Firebase CLI의 engines 해석 규칙, CLI 표와 GCP 표의 어긋남, discovery 타임아웃 기전
metadata:
  type: reference
---

- **폐기일 정본**: https://docs.cloud.google.com/functions/docs/runtime-support (구 `cloud.google.com/...`는 301). 2026-09-24 기준 nodejs20 2026-10-30 · nodejs22 2027-10-31(예고 2027-04-30) · nodejs24 2028-10-31(**Run functions만**, 1st gen 없음). 폐기 후엔 배포 불가 + *"may be disabled"*.
- **Firebase CLI 런타임 표**(`firebase-tools` `src/deploy/functions/runtimes/supported/types.ts`)는 nodejs22 폐기를 **2028-10-31로 1년 늦게** 적는다(2026-09-30 확인) ⇒ CLI 경고를 다음 상향 트리거로 믿지 말 것.
- **engines 해석**: CLI가 `nodejs${engines.node}`를 그대로 런타임 ID로 쓴다 ⇒ 값은 맨 숫자(`"22"`)만. `firebase.json` `runtime`이 있으면 그것이 우선.
- **락파일 v3 루트 `packages[""]`에 engines가 미러된다** — package.json만 고치면 두 파일이 어긋난다.
- **"User code failed to load… Timeout after 10000"** = 로컬 discovery 단계(기본 10초, `FUNCTIONS_DISCOVERY_TIMEOUT` 초 단위로 연장). 배포 런타임과 무관, 리소스 변경 전에 실패하므로 재시도 안전.
- firebase-admin 14.0.0(2026-06-08)이 Node 18·20 지원 제외(engines `>=22`).
- 이 저장소 적용: `docs/Architecture.md` §67 (T147). 관련: [[version-pin-needs-a-baseline]]
