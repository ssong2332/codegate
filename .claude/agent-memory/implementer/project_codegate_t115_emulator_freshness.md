---
name: codegate-t115-emulator-freshness
description: T115 에뮬레이터 신선도 — /backends가 로드된 디렉터리·트리거 목록을 그대로 준다는 발견, 자동 재로드 안 함 실측, mtime 대신 내용 해시를 쓴 이유
metadata:
  type: project
---

T115(실행 중인 에뮬레이터가 낡은 코드를 물어도 신호가 없다)에서 얻은, 코드만 읽어서는 안 나오는 것들.

## 1. ⭐ `GET http://127.0.0.1:<functionsPort>/backends` 가 정답지다
Firebase Functions 에뮬레이터가 이미 노출하는 엔드포인트인데 이 저장소에서 아무도 안 쓰고 있었다.
응답에 **`backends[].directory`(에뮬레이터가 실제로 읽은 functions 절대경로)** 와
**`functionTriggers[].entryPoint`(실제로 로드된 함수 전체 목록)** 이 들어 있다.
⇒ *"무엇이 떠 있는가"* 의 절반을 **런타임 산출물을 건드리지 않고** 알 수 있다(배포 경로 무관).

대조로, 에뮬레이터 **hub**(`:4400/emulators`)는 포트만 준다 — *"떠 있다"* 밖에 못 답한다.
`Win32_Process`의 CommandLine에도 cwd가 없다(`--config`만 있거나 그마저 없다).

**How to apply:** 다음에 "지금 도는 게 뭐냐"를 물으면 hub나 netstat이 아니라 `/backends`부터 쳐라.

## 2. E항 실측 결론: **자동 재로드하지 않는다**
에뮬레이터를 띄운 채 응답 문자열 변경 → `npm --prefix functions run build`(lib **통째 삭제·재생성**)
→ 재기동 없이 33초 뒤 재호출 = **옛 문자열 그대로, 경고 로그 0건.** lib에는 새 문자열이 있었다(grep 1건).
`i functions: Watching "<dir>" for Cloud Functions` 로그가 뜨지만 **그 감시는 코드 재로드를 뜻하지 않는다** — 이 줄을 보고 "재로드된다"고 추정하면 틀린다.

### 1-1. ⚠️ 워커 스코프 — 부모 기동 시각은 **보수적 기준선이 아니다**(reviewer 수정 중 실측)
코드를 붙들고 있는 것은 부모가 아니라 `functionsEmulatorRuntime` **워커**이고, 워커는 **첫 요청 때** 뜬다.
그래서 재로드 여부가 **워커 상태에 따라 갈린다**:
- 워커 없음(냉) → 다음 호출이 **현재** lib을 로드한다(= 새 코드가 나온다).
- 워커 살아 있음(온) → 그 워커가 문 버전에 **고정**된다(= 옛 코드가 계속 나온다, 신호 0건).

⇒ ⓐ기동 → ⓑ빌드X → ⓒ첫 호출(워커가 X 고정) → ⓓ되돌려 빌드 순서가 되면 **부모 기동 시각 기준선으로는
`FRESH`인데 워커는 X를 서빙한다.** 실측: 부모 56888(04:49:35Z, hash b32587476ebf) / 워커 65372
(spawn 04:51:52.859Z, 직전 빌드 04:51:52.687Z hash 801e97fc1cd1) → 판정 `FRESH`, 응답 `T115-STALE-PROBE...`.

**How to apply:** 이 저장소에서 "에뮬레이터가 새 코드를 물었나"를 **한 번 호출해 보고 판단하지 마라** —
냉/온에 따라 반대 결과가 나온다. 닫는 방법 2가지는 `emulatorFreshnessCli.ts` 머리말에 적어 뒀다
(부모∪워커 spawn 시각으로 기준선 확장 / OS 조회 없이 기동 이후 기록에 다른 해시가 있으면 `UNKNOWN`).
함수 **목록**만은 부모 기동 시각에 고정된다(축 ③은 영향 없음).

## 3. mtime 대신 **lib 내용 해시**를 쓴 이유(오탐 = 장치의 죽음)
`npm --prefix functions test`가 lib를 매번 지웠다 다시 만든다. mtime만 보면 **내용이 같아도** 매번
"낡았다"가 뜬다 → 경고가 상시가 되면 다음 사람이 장치를 끈다(§24.4가 같은 논리로 기각한 축).
그래서 `build`·`test`의 `tsc` **직후**에 `{at, hash}` 한 줄을 남기고, *에뮬레이터 기동 시각 이전 마지막 기록*의
해시와 현재 해시를 대조한다. 실측으로 확인: lib를 두 번 더 삭제·재생성해도 내용이 같으면 `FRESH` 복귀.

⚠️ **해시 범위를 좁히는 것까지가 한 세트다**(reviewer Major). 처음엔 `lib` 아래 **모든** `.js`를 셌는데,
거기엔 컴파일된 테스트와 도구 자신이 들어가 **테스트 파일만 고쳐도 `STALE-CODE`가 떴다** — 오탐을
피하려고 해시를 도입해 놓고 다른 문에서 같은 오탐을 들여온 꼴이다. **"무엇을 대조하는가"를 바꿀 때는
"그 대조 대상이 판정 주체가 실제로 읽는 것인가"를 같이 물어라.** export 그래프 추적은 어긋나면 *진짜
변경을 놓치는* 반대 방향 고장이라, 도달 불가가 명백한 갈래만 이름으로 빼는 최소안을 골랐다.

기록 위치는 **OS 임시 디렉터리**다 — `lib` 안은 `clean-lib.mjs`가 지우고, `functions/` 안에 두면
`firebase.json`의 배포 ignore 목록을 건드려야 한다(배포 경로 변경 = architect 판정 대상).

## 4. 판정 심각도에서 `UNKNOWN` > `NOT-RUNNING`
안 떠 있으면 낡은 것에 물릴 수 없지만, **모르는 채로 검증을 시작**하는 쪽이 위험하다.
그래서 값이 하나라도 없으면 `FRESH`가 아니라 `UNKNOWN`을 내고, 그 순서를 테스트로 못박았다.

## 5. 격리 에뮬레이터 정리 함정(이번에 실제로 걸림)
`Stop-Process`로 부모(firebase.js)만 죽이면 **Firestore java 프로세스가 포트를 계속 잡는다.**
다음 기동이 `Could not start Firestore Emulator, port taken`으로 죽는다 — 부모 kill 뒤
`netstat`로 firestore 포트를 다시 확인하고 java PID도 따로 죽여라.

관련: [[codegate-t98-thinking-regression]](공유 에뮬레이터는 워크트리 lib을 못 집는다 — 이번에
`OTHER-TREE` 판정으로 **기계가 말해 주게** 만들었다), [[codegate-t101-clean-lib]], [[codegate-t104-situational-landings]]
