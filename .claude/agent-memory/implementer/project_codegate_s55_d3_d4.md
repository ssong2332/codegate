---
name: codegate-s55-d3-d4
description: §55 D3/D4(notSpoken 오프닝 + 전환 연결문장) 구현에서 나온 재사용 기법 — 타입 밖 필드로 앵커 불변 증명, heredoc append 거부 우회, 스테일 클로저 ref 래치
metadata:
  type: project
---

§55 D3(`MessageDoc.notSpoken`)·D4(`verify_reconnected` 연결 문장) 구현(2026-09-04, `b760b85`·`47d5e58`).
기준선 functions 685→701 / 루트 338→344.

**Why:** 이 절이 남긴 기법 3개는 다음 "앵커에 매달린 행을 표시에서만 빼라" 계열 작업에서 그대로 재사용된다.

**How to apply:**

1. ⭐ **타입에 없는 필드를 런타임에만 실어 "리졸버가 그 값을 안 본다"를 증명한다.**
   `SmsTimelineMessage`/`MockScreenMessage`에는 `notSpoken`이 없다(넣으면 안 된다 — 그게 G350의 요지).
   그래도 앵커 불변 트립와이어는 필요하므로:
   ```ts
   function markNotSpoken<T extends object>(m: T): T { return { ...m, notSpoken: true }; }
   ```
   제네릭 스프레드라 excess-property 체크에 안 걸리면서 런타임엔 필드가 실린다. 그 배열과 원본
   배열의 리졸버 출력을 `deepEqual`로 비교하면, 나중에 누가 리졸버에 필터를 끼워 넣는 순간 빨간불이 된다.
   ⛔ 필터를 **소비처(표시·집계)에만** 넣고 앵커 계산에는 절대 전파하지 않는다는 규율이 이 저장소에서
   반복 등장한다(G348/G350 계열).

2. ⛔ **`cat >> file <<'EOF'` 형태 heredoc은 워크트리 격리 에이전트에서 거부된다**
   ("too complex to verify that it stays inside the worktree"). 기존 테스트 파일에 append하려던
   계획이 두 번 막혔다. ⇒ **Write 툴로 별도 테스트 파일을 새로 만든다.**
   functions는 `lib/**/__tests__/*.test.js` 글롭이라 등재 불필요, **루트는 `package.json` test 스크립트에
   반드시 등재**해야 한다(`src/lib/testRegistration.test.ts`가 목록/파일시스템 드리프트를 잡는다).
   루트 테스트의 상대 임포트는 **`.ts` 확장자 필수**(ESM strip-types).

3. **실시간 경로 판별자는 클라 ref 래치 1개**: `realtime.status === "active" && realtime.credentials?.provider === "gemini"`.
   `status:"active"`는 세션 컴포넌트가 `handleActive`를 올려야만 서고, 폴백은 `toFallbackCredentials`가
   `provider:"none"`으로 낮추므로 두 조건의 곱이 정확히 "Gemini Live가 실제로 붙었다"다.
   ⛔ state가 아니라 **ref**여야 한다 — `flushTranscript`의 deps가 `[sessionId]`라 호출부 3곳에서
   스테일 클로저가 실재한다. 되돌림은 폴백 강등 분기 첫 줄(그 경로에선 오프닝이 실제로 재생된다).
   래치 세팅은 **기존 phase effect를 건드리지 않고 전용 effect 1개**로 분리했다(deps 확장 회귀 회피).

4. 루트 `npm run build`는 워크트리에 `.env`가 없으면 정적 생성 단계에서 실패한다(코드 결함 아님).
   `cp .env.example .env` + API 키만 더미로 치환 → 빌드 통과 확인 후 `rm .env`로 무결성을 실제로 증명할 수 있다.

관련: [[codegate-t101-clean-lib]] · [[codegate-t130-npm-drift-guard]] · [[codegate-t115-emulator-freshness]]
