---
name: project-codegate-s62-verify-offer-log-invariant
description: PR #236 리뷰 후속 — deliverVerifyOffer [§59.11] 로그의 예외 경로 누락 수정 + 소스 스캔 테스트 7종. 로그 전용 "error" 상태값 패턴의 전례.
metadata:
  type: project
---

**배경**: PR #236(§62.6 D-5)이 reviewer APPROVED를 받았지만 Major 2건 지적. `functions/src/verifyIntercept/index.ts`의 `logOfferOutcome` 헬퍼가 "콜러블 1회 호출당 로그 1건"을 주장했지만, 정의 이후 두 예외 경로(model_tool/announce 분기의 scammerTurns 유효성 실패 throw · `plan.persist` 블록의 `resolveAnchorScammerTurn`/`offerRef.create` 실패 throw)에서는 로그 없이 함수가 끝났다.

**수정 패턴 — "로그 전용 error 상태값"**: 응답 계약(`DeliverVerifyOfferStatus`, `docs/API.md`)에 새로운 값을 추가하지 않고, `index.ts` 로컬 타입 `LoggedOfferOutcome = DeliverVerifyOfferStatus | "error"`을 만들어 `logOfferOutcome`의 파라미터 타입만 확장했다. 두 예외 지점(throw 직전 / `catch` 블록에서 로그 후 rethrow)에서 `logOfferOutcome("error", reason)`을 호출. `status === "error"`일 때만 `logger.error`, 나머지는 기존 `logger.info`로 라우팅. **왜 이 형태**: "응답을 만들지 않는 경로는 응답 계약에 새 값을 심을 필요가 없다 — 로그 스키마와 응답 스키마는 독립"이라는 판단. §62.10 정본(게이트 순서·재검증 5종·plan/response 계산·Firestore 스키마)을 손대지 않고도 Major #1을 닫을 수 있었던 근거.

**테스트 — 소스 스캔 7종, 핸들러 직접 실행/모킹 0건**: 이 디렉터리(`functions/src/verifyIntercept/__tests__/`)에 이미 전례가 있다 — `deliverVerifyOfferGateOrdering.test.ts:1-2`가 "onCall 핸들러는 Firestore/시크릿 의존이라 유닛 계층에서 직접 관측할 수 없다"고 명시하고 소스 스캔으로 게이트 순서를 고정한다. 저장소 전체(`functions/src/**/*.test.ts`)를 훑어도 `onCall(...).run(request)`나 `getFirestore` 목킹으로 콜러블을 직접 호출하는 테스트가 **단 1건도 없다** — 이것이 이번에도 "logger.info를 스파이해서 실행 검증"(reviewer 원문 요청)이 아니라 소스 스캔을 택한 근거. 새 테스트 `deliverVerifyOfferLogInvariant.test.ts` 7종:
1. `logOfferOutcome(` 호출 지점이 정의 이후 정확히 4곳(무효 scammerTurns·too_early·persist 실패·최종)
2. 두 예외 경로에서 로그가 throw보다 **먼저** 실행되는 정규식 매칭
3. too_early/최종 반환에서 로그와 응답이 **같은 리터럴/변수**(`status`)를 공유 — 값이 두 곳에서 따로 계산되지 않음을 구조적으로 증명(런타임 실행 없이도 전 실행 경로에 대해 참)
4. 심각도 라우팅(`status==="error"` → `logger.error`) 형태 고정

**검증**: `npm --prefix functions run build` 통과, `npm --prefix functions test` **761 pass / 0 fail**(신규 7종 포함), `npm --prefix functions run lint` 클린. `git diff --stat` = `index.ts` + 신규 테스트 파일 1개뿐(docs/** 무접촉, PR #237과 충돌 없음).

관련: [T129 다중 랜딩 트립와이어](project_codegate_t129_tripwire.md), [§59 커밋 D reviewer REJECT 수정](project_codegate_s59_critical_verify_announce_race.md) — 둘 다 "실행 불가 지점은 소스 스캔"의 같은 판단 계열.
