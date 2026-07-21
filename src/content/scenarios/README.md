# src/content/scenarios

시나리오 콘텐츠(대본·메타) — Track C, T6, AC-001/AC-002. (T2 스캐폴딩은 이 폴더만 확보했고, T6에서
실제 콘텐츠를 채웠다.)

## 이 폴더에 있는 것 (공개 메타만)
- `familyAccidentDeepvoice.ts` — 시나리오 `scenarios/{scenarioId}` 공개 메타(title, fraudType,
  estimatedDuration, difficulty, deepvoiceLines). Firestore `scenarios/` 컬렉션은 클라 read
  허용(공개)이라 여기 둔다.
- `index.ts` — 카탈로그(`scenarios: Record<scenarioId, ScenarioDoc>`).

## 여기 없는 것 (민감 프롬프트는 functions/에 있다)
사기범 페르소나·약화된 수법·인젝션 방어 프리앰블(`scenarioPrompts/{scenarioId}`, ADR-0004)은
**여기 두지 않는다.** Architecture.md §3의 "Client(src/)는 시스템 프롬프트/페르소나를 절대
보유하지 않는다"는 레이어 경계를 소스 위치로도 지키기 위해, 민감 프롬프트는
`functions/src/scenarios/`(Cloud Functions 전용, 클라 번들에 포함 안 됨)에 별도로 둔다:
- `functions/src/scenarios/familyAccidentDeepvoice.prompt.ts` — personaPrompt/weakenedTactics/guardrailPreamble
- `functions/src/scenarios/index.ts` — `SCENARIO_PROMPTS` 맵(T7 역할극 엔진이 소비)

## Firestore 시딩
`functions/src/scenarios/seed.ts`(firebase-admin)가 위 공개 메타 + 민감 프롬프트를 각각
`scenarios/{id}`·`scenarioPrompts/{id}`에 주입한다. 실행:
```
cd functions
npm run build
npm run seed:scenarios
```
사전 조건: `firebase login` + `firebase use --add`로 실제 Firebase 프로젝트가 `.firebaserc`에
연결되어 있어야 한다(README.md 루트 "Firebase 프로젝트 연결" 참조). 미연결 상태면 실패한다 —
프로젝트 연결 후 재실행하면 된다.

## 알려진 절충 (T6 프로토타입 범위)
`src/`(Next.js)와 `functions/`(Cloud Functions)는 별도 TS 빌드 루트라 타입/데이터를 직접
import로 공유할 수 없다. 공개 메타(제목·유형·소요시간·난이도·대사)는 민감정보가 아니므로
`functions/src/scenarios/publicMeta.ts`에 값을 미러링해 시딩 스크립트가 단독으로 동작하게
했다 — 두 사본은 `functions/src/scenarios/__tests__/scenarios.test.ts`가 텍스트 비교로 드리프트를
검사한다. 새 시나리오가 늘어나면 워크스페이스/경로 별칭 도입을 architect에게 제안할 것.
