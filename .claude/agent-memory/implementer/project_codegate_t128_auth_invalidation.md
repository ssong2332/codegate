---
name: codegate-t128-auth-invalidation
description: T128 인증 무효화 — Auth 에뮬레이터에서 자동 signOut을 보려면 delete가 아니라 disable, 훼손 토큰 하네스, react-hooks lint 2연타, .env 더미로 build 무결성 증명
metadata:
  type: project
---

T128(인증 무효화 취급, PR #155, `feat/T128-auth-invalidation`)에서 얻은 **재사용 가능한** 함정·레시피.

**Why:** 이 태스크는 "라이브로 관측할 수 있는가"가 설계 분기(§34.7 강등표)를 갈랐고, 그 관측을
얻는 데 든 시행착오가 저장소·문서 어디에도 남지 않는 종류였다.
**How to apply:** Firebase Auth 무효화·토큰 만료를 다시 다루거나, 루트(Next) 쪽에 훅을 새로 만들 때.

---

### ⭐ Auth 에뮬레이터에서 **SDK 자동 signOut**을 관측하는 법 — delete가 아니라 disable

`node_modules/@firebase/auth`는 `auth/user-disabled`·`auth/user-token-expired` **2개 코드에서만**
스스로 `signOut()`한다. 그런데 에뮬레이터에서:

| 관리자 호출(`Authorization: Bearer owner`) | `getIdToken(true)` 결과 | 자동 signOut |
|---|---|---|
| `POST /identitytoolkit.googleapis.com/v1/projects/{p}/accounts:delete` `{localId}` | `auth/invalid-refresh-token` | **안 난다** |
| `POST .../accounts:update` `{localId, disableUser:true}` | `auth/user-disabled` | **난다**(`currentUser=null`, `onAuthStateChanged(null)`) |

⇒ "계정 삭제 = USER_NOT_FOUND = 자동 로그아웃"이라는 **문서상 예측은 에뮬레이터에서 성립하지 않았다**.
자동 signOut을 증거로 남겨야 하면 **disable을 써라.** 삭제 경로로 나온 결과를 프로덕션 등가로
보고하면 안 된다.

⛔ **공유 에뮬레이터에서 `DELETE /emulator/v1/projects/{p}/accounts`(전체 말소)를 쓰지 마라** —
다른 에이전트 세션을 통째로 날린다. 위 관리자 엔드포인트로 **내가 만든 uid 1개만** 건드리고,
콜러블도 쓰기 없는 것(`listMyChallenges`)으로 고른다.

### 토큰이 **조용히 죽는** 경로를 Node에서 재현하는 법

브라우저 저장소를 건드릴 필요 없이 SDK 내부 객체를 직접 손대면 된다:

```js
user.stsTokenManager.refreshToken = "CORRUPTED";
user.stsTokenManager.expirationTime = Date.now() - 1000;
await user.getIdToken(true);   // → auth/invalid-refresh-token, signOut 없음
```
이후 콜러블은 `@firebase/functions`가 토큰 획득 실패를 삼키고 **무토큰으로 보내기 때문에** 서버가
`functions/unauthenticated`로 거절한다. 이 조합이 "감지 지점이 실제로 발화한다"를 증명하는
가장 싼 레시피다. `firebase` 클라 SDK는 루트 `node_modules`에 있고 Node에서 그대로 돈다.

### 루트(Next 16 / eslint-config-next 16)의 react-hooks 규칙 2연타

새 훅을 쓰면 거의 확실히 둘 다 맞는다:
1. `react-hooks/refs` — **렌더 중 `ref.current` 읽기 금지.** 판정에 쓰는 값은 ref가 아니라 state여야 한다.
2. `react-hooks/set-state-in-effect` — **effect 본문에서 setState 금지.**

둘을 동시에 피하는 방법은 React 공식의 *"렌더 중 state 조정"* 패턴이다:
```ts
const currentUid = user?.uid ?? null;
const [seenUid, setSeenUid] = useState(currentUid);
if (seenUid !== currentUid) { setSeenUid(currentUid); /* 여기서 파생 state 갱신 */ }
```
lint가 통과하고, effect 한 바퀴가 줄어든다.

### 루트 `npm run build`가 `.env` 없어서 죽을 때 — 더미 `.env`로 무결성을 증명하라

격리 워크트리엔 `.env`가 없어 TS 컴파일 성공 후 정적 생성에서 `auth/invalid-api-key`로 죽는다
(CLAUDE.md에 기록된 알려진 비결함). **base 재빌드 대조 대신** 더미 값 6개짜리 `.env`를 만들면
빌드가 끝까지 통과한다 — `.env`는 `.gitignore`에 있어 커밋되지 않는다. 이게 "내 코드 때문이
아니다"를 훨씬 싸게 증명한다. 부수 효과로 **전 라우트 목록**이 빌드 출력에 찍힌다.

### `src/components/`에 `.tsx`를 추가하면 무해화 인벤토리 테스트가 깨진다

`src/components/harmlessnessScreens.test.ts`의 `CLIENT_SCREEN_INVENTORY`에 등재해야 한다
(모의 사기 표면이면 `true`, 아니면 `false` + 사유 주석). 실패가 아니라 **장치가 작동한 것**이다.

### 자기 주석·자기 테스트가 소스 스캔에 걸리는 재발

금지 심볼(`onIdTokenChanged` 등)을 전수 스캔하는 테스트를 새로 쓸 때, **그 심볼을 설명하는
테스트 파일 자신**이 걸린다. 스캔에서 `*.test.ts(x)`를 제외하되 제품 코드는 전수로 둔다.
(이 저장소에서 최소 3번째 재발 — [[codegate-t83-verify-intercept]], [[codegate-t86-harmlessness-guards]])

### 24개 래퍼 기계적 교체는 스크립트로

`src/lib/api/`의 콜러블 래퍼 24개는 **완전히 동일한 4줄 형태**였다(예외 1건: `listMyChallenges`는
인자가 없고 `{}`를 넘긴다). 정규식 치환 스크립트로 23/24가 한 번에 끝났고, 순 **-73줄**이 됐다.
실패한 1건을 손으로 고치는 편이 정규식을 일반화하는 것보다 싸다.
