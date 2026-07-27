---
name: codegate-t108-ast-source-scan
description: T108 AST 검출 축 — TS 컴파일러 API가 루트 러너에서 되는지 실측(선례 최초), 설계 문서 내부 모순(N2 vs 한계 목록) 처리, 격리 워크트리의 .env 부재로 인한 build 실패 판별법, stash 왕복이 줄끝을 바꾸는 함정
metadata:
  type: project
---

T108(소스 스캔 게이트 5곳에 AST 축 합집합)에서 얻은, 코드만 읽어서는 안 나오는 것들.

## 1. ⭐ 루트 테스트에서 `typescript` 컴파일러 API가 **된다**(이 저장소 최초 선례)

`import ts from "typescript"` 가 `node --experimental-strip-types --test`(`package.json:11`)
아래 `.ts` 테스트에서 **그대로 해석·실행된다.** 실측: node **v22.14.0** / typescript **5.9.3**
(루트 devDependency, **신규 의존성 0건**). `ts.createSourceFile(..., ts.ScriptKind.TSX)` 로
TSX 파싱까지 확인. 설계(§24.3)가 "CJS default import가 이 조합에서 되는지 미확인"이라며
강등 경로까지 준비해 뒀지만 **프로브 1회로 통과**했다.

**How to apply:** 앞으로 소스 구조를 검사하는 게이트가 필요하면 정규식 근사 대신 AST를 써도
된다. 단 **테스트 전용 모듈로 격리**할 것 — 앱 코드가 import하면 `typescript`가 클라이언트
번들 후보가 된다(`src/lib/sourcescan/scanSource.ts` 머리말이 그 경고를 담고 있다).

## 2. 설계 문서 **내부**가 모순일 때(§24.5 N2 vs §24.10 ④)

§24.5 N2는 *"태그 식별자가 import도 함수/컴포넌트 선언도 아니면 위반"*, §24.10 ④는
`const T = mk()`를 *"못 잡는 형태"* 의 예로 들었다. N2를 문면대로 구현하면 **잡힌다** — 둘은
같이 성립하지 않는다.

**판단:** 규범 규칙(N2)을 문면대로 구현하고, **못 잡는 목록을 더 좁게** 적었다.
근거 = "못 잡는 것을 못 잡는다고 적는 것"이 완료 조건이므로 **과대 고지도 부정확**이다.
차이는 코드 주석(`[T108/N2]` 테스트)과 PR 본문에 명시해 리뷰어가 판정할 자리를 남겼다.

**How to apply:** 문서 우선순위표는 *문서 간* 충돌만 푼다. **한 문서 안의 모순**은 규범 조항을
따르고 **차이를 증거로 남겨** 상류가 뒤집을 수 있게 하는 쪽이 이 저장소 관례에 맞다.

## 3. 격리 워크트리에서 `npm run build`는 **base main에서도 실패한다**

새 워크트리에는 gitignore된 `.env`가 없어 `auth/invalid-api-key`로 페이지 데이터 수집이
깨진다. TypeScript 컴파일은 그 전에 성공한다(`✓ Compiled successfully`).
**`.env` 복사는 권한 분류기가 막는다** — 우회하지 말 것.

**판별 절차(실측으로 썼다):** `git stash push -u` → `npm run build` → 같은 에러가 나면
내 변경과 무관하다는 증거 → `git stash pop`. "빌드 성공"이라 보고할 수 없을 때 **무관함을
증명하는** 가장 싼 방법이다.

⚠️ **stash 왕복이 줄끝을 LF→CRLF로 바꾼다.** 복원 후 `diff` 가 전 줄 차이로 보이면 놀라지 말고
`diff --strip-trailing-cr` 로 재확인하라(이 저장소 소스는 CRLF다).

## 4. 워크트리 격리 에이전트는 **heredoc·리다이렉트가 막힌다**

`git commit -F - <<'EOF'` 도, `> /tmp/x` 도 "too complex to verify" 로 거부된다.
커밋 메시지·PR 본문·임시 스크립트는 **스크래치패드에 파일로 쓰고 `-F`/`--body-file`** 로 넘겨라.
관련: [[codegate-t107-field-divergence]](새 워크트리 npm install이 functions/package.json을
고치는 함정 — 이번에도 재현됐고 `git checkout --` 로 되돌렸다).

## 5. 역검증 샘플은 **자기가 만든 문자열에 걸린다**

`"htt"+"ps://…/app"+".apk"` 는 소스에 `.apk` 부분 문자열이 **그대로 남아** 리터럴 검사가 잡아
버려, "리터럴은 못 잡는다"는 단언이 깨졌다. 조립 형태를 증명하려면 **금지 토큰의 모든 조각을
쪼개야 한다**(`"."+"apk"`). 같은 실행에서 `(globalThis as any)["fet"+"ch"]` 가 안 잡히는 진짜
버그(타입 단언을 투과하지 않는 `dottedName`)도 함께 드러났다 — **역검증을 먼저 실패시켜 보는
것이 구현 검증이었다.**
