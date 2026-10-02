---
name: project-codegate-t181-challenge-completion
description: T181 챌린지 완료 전이(C1~C6) — 서버 전이 리터럴을 루트 테스트가 소스에서 읽는 연결 증거, 트랜잭션 전용 가짜 Firestore + 무조건 쓰기 대조군, 같은 태스크 안에서 내 소스 스캔이 다음 커밋에 깨진 함정, placeholder .env로 verify:build 위험 해소
metadata:
  type: project
---

T181(2026-10-02, `feat/T181-challenge-completion`, 커밋 C1~C6 + 상태 커밋, 미push · 배포 0)에서 코드만 읽어서는 안 나오는 것.

**Why:** 결함 원인이 "클라 테스트가 서버가 만들지 않는 값을 fixture로 썼다"(설계 공백 → 구현 공백)였다. 같은 부류를 다시 만들지 않는 검증 형태가 핵심 산출물이었다.

**How to apply:** 상태값 · 리터럴이 서버 → 클라로 건너가는 변경, Firestore 조건부 쓰기, 같은 태스크에서 여러 커밋이 한 파일을 건드릴 때.

1. ⭐ **서버→클라 연결 증거(G428)**: 루트 테스트가 `readFileSync("functions/src/…")`로 `export const X = "…"` 리터럴을 정규식으로 뽑아(못 찾으면 실패) 클라 매퍼에 넣는다. 테스트 안에 그 값을 손으로 쓰지 않는다. A/B 프로브 2종(값 변경 · export 이름 변경)이 둘 다 빨개지는 것까지 확인해야 "조용한 건너뜀 없음"이 증명된다.
2. ⭐ **가짜 Firestore 레시피**: `collection().doc()` · `runTransaction(fn)` · `tx.get` · `tx.update`만 흉내 내고 `ref.update`/`ref.set`은 throw → "트랜잭션 안에서만 쓴다"를 기계로 건다. 경쟁(신고 · 폐기 · 완료가 먼저 커밋)은 `commitUnconditional()`로 다른 쓰기 지점의 무조건 커밋을 모사하고, **옛 무조건 쓰기를 같은 순서에 넣은 대조군**이 덮어쓰는 것을 `t.diagnostic`으로 나란히 출력해야 시나리오에 판별력이 있다.
3. ⚠️ **내 소스 스캔이 같은 태스크 다음 커밋에서 깨졌다**: C5에서 페이지 import 목록을 정확 일치 정규식으로 고정했더니 C6이 이름 1개를 더해 실패. 이후 커밋이 같은 import를 늘릴 예정이면 처음부터 "필요한 이름 포함" 비교(`namesIn`)로 써라. 보고에는 "기존 저장소 테스트 아님 · 내 테스트"로 구분해 적었다.
4. ⭐ **architect가 걱정한 H-1 ② `verify:build` FAIL 위험은 실측으로 해소 가능**: 루트 `.env`를 `.env.example`(플레이스홀더 6개)로 임시 생성 → `npm run build` 29/29 정적 생성 → `npm run verify:build` PASS(`signInAnonymously` 식별자는 압축본에 없다). 끝나면 `.env` · `out` · `.next` 삭제. [[codegate-t128-auth-invalidation]] · [[codegate-t116-render-gate]]과 같은 기법.
5. dry-run(`--project voicefishing-ff47f`)은 `functions/.env`에 defineString 4키만 넣고 1회차 통과(T147과 같다). 시크릿 키는 넣지 않았다.
6. 페이지 catch의 동작은 순수 함수로 내려(재조회 주입 `resolveConsentFailureView`) 단위 테스트 + 소스 스캔 이중으로 고정했다 — [[feedback-unobservable-behavior-gates]] 적용.
7. 조정자가 중도 지시: 진리표의 결함 동작 칸(T184 — 링크 만료 뒤 consented/in_progress 차단)은 **동작을 바꾸지 말고 "현행 동작 고정 — T184에서 변경 예정" 주석**을 테스트 칸과 소스에 달았다. 설계 표가 결함을 고정하는 경우의 처리 선례.

관련: [[project-codegate-t37-user2-access]](동의 게이트 원본) · [[codegate-t147-node22-runtime]](dry-run .env)
