# 통화 진단 요약 로그 (`[call-diag]`) — "말 인식 0회" 원인 찾기

2026-11-06 · 브랜치 `claude/card-incoming-mic-diag` · 서버 `functions/src/realtime/callDiag.ts` · 클라 `src/lib/realtime/callDiagSummary.ts`

## 금지 · 한계
- 숫자와 상태값만 기록한다. 음성, 대사, 개인 정보, 기기 식별자는 넣지 않는다. 허용 키 밖의 값이 하나라도 오면 요약 전체를 버린다.
- 외부 호출은 없다. Firestore 읽기 · 쓰기도 없다. 이미 횟수가 정해진 두 호출에 실어 보낸다.
  - **레그 끝**: `submitRealtimeTranscript`, `at="leg"`
  - **세션 끝**: `endSession`, `at="end"`
- Firestore 규칙 · 인덱스 변경은 없다.
- **주기적 기록은 하지 않는다.** 레그 끝과 세션 끝에만 남는다. 그래서 탭을 강제 종료하는 등 종료 화면에 닿지 못한 통화는 `end` 줄이 없다.
- `?audiodebug=1` 없이도 기록된다.

## 로그 찾기 (Cloud Logging · 로그 탐색기)
```
jsonPayload.message="[call-diag] 통화 진단 요약"
```
세션 하나만 보려면 필터에 다음을 덧붙인다.
```
AND jsonPayload.sessionId="<세션 id>"
```
`jsonPayload.at`은 `leg` 또는 `end`이고, 레그 끝 줄에는 `jsonPayload.legIndex`가 함께 남는다.

## 판정표
| 모양 | 원인 후보 |
|---|---|
| `rt="permission-denied"` · `mode="fallback"` | 마이크 거부 |
| `micSent` ≈ 0 · `track`≠`live` 또는 `inState`≠`running` | 마이크 프레임이 아예 안 나감 |
| `micDropEcho` ≫ `micSent` · `outState`≠`running` | 반이중 게이트가 안 열림 |
| `micDropMute` ≫ 0 | 음소거 |
| `micSent` ≫ 0 · `asr` = 0 · `micPeakDb` 매우 낮음 | 서버가 못 들음(무음 · 너무 작음) |
| `micSent` ≫ 0 · `asr` = 0 · `micPeakDb` 정상 | 원인 미정 — 서버 쪽 전사 확인 |

## 필드
- **횟수(0 ~ 10,000,000 정수)**
  - `micSent` · `micDropEcho` · `micDropMute`: 보낸 프레임 · 에코 게이트로 버린 프레임 · 음소거로 버린 프레임
  - `asr`: 입력 전사 조각 수
  - `rx`: 받은 오디오 조각 수
  - `unheard` · `interrupts` · `liveResumes`
- **`micPeakDb`**: 보낸 프레임의 최대 진폭(dBFS 정수). 보낸 프레임이 없으면 null.
- **`outState` · `inState`**: 오디오 컨텍스트 상태
- **`track`**: `live` · `ended` · `none`
- **`trackMuted` · `trackEnabled`**
- **`rt`**: 실시간 연결 상태
- **`mode`**: `undecided` · `realtime` · `fallback`

횟수는 `realtime.start`가 불릴 때 0으로 돌아간다. 그래서 레그 끝 줄은 그 레그의 값이다.
