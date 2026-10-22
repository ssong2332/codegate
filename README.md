# 안 당해본 사기는 못 막는다 — AI 금융사기 백신

AI 사기범과 실제 전화·문자처럼 대화하며 보이스피싱·메신저피싱을 **미리 당해 보는** 훈련 웹앱이다.
사람들은 사기를 지식으로는 알아도 실제 상황의 압박(권위·긴급·공포·가족애)을 겪어 본 적이 없어 막상 당한다.
약화된 실전 공격에 안전하게 노출시키고 "어디서·언제 속았는지" 짚어 주는 예방접종(inoculation)형 서비스다.

- 라이브: https://voicefishing-ff47f.web.app (Google 로그인)
- 요구사항 정본: [docs/PRD.md](docs/PRD.md) · 설계 정본: [docs/Architecture.md](docs/Architecture.md)

## 무엇을 하나

| 기능 | 내용 |
|---|---|
| 실시간 음성 통화 훈련 | 걸려 오는 전화를 받으면 AI 사기범(기관 사칭·대출 빙자·환급금 등)이 실시간 음성으로 대화한다. 화면은 실제 휴대폰 수신·통화 화면처럼 보인다 |
| 통화 중 문자·가짜 이체 화면 | 통화 도중 인증번호·링크 문자가 오고, 링크를 누르면 가짜 기관·이체 화면이 열린다(입력값은 어디에도 전송되지 않는다) |
| 메신저피싱 훈련 | 카카오톡형·문자형 대화로 접근하고, 의심하면 전화로 넘어오는 채널 간 에스컬레이션을 재현한다 |
| 난이도 | 초급·중급·고급에 따라 압박 강도와 수법이 달라진다 |
| 취약점 리포트 | 대화가 끝나면 몇 초 시점에 어떤 수법에 속았는지, 어떤 신호를 놓쳤는지 짚어 준다. 대화를 되짚는 다시보기 해설도 있다 |
| 지인 챌린지(딥보이스) | 내 목소리를 복제해 지인에게 딥보이스 사기 체험을 보낸다. 사전 동의·정체 공개·음성 유출 차단이 전제다 |

## 동작 방식

```
브라우저(Next.js 정적 페이지)
  ├─ 실시간 음성: Gemini Live(gemini-3.8-live) — 서버가 프롬프트를 고정한 단기 토큰만 발급
  ├─ 사기범 대사: Cloud Functions → claude-sonnet-5-5 → (실패·5초 초과) gemini-3.5-flash-lite → (429·5xx·시간 초과) Groq
  ├─ 그 밖의 텍스트(되감기 판정 등): gemini-3.1-flash-lite → (503) gemini-3.5-flash-lite → Groq
  │              모두 실패하면 규칙 기반 목업으로 강등(대화는 끊기지 않는다)
  ├─ 딥보이스: ElevenLabs(목소리 클론·Agents)
  └─ 저장·인증: Firebase Auth(Google·익명) / Firestore / Storage
결과 리포트: 대화 전사를 서버에서 규칙 기반으로 판정(functions/src/report/)
```

- 사기범 프롬프트는 서버에서만 조립되고 브라우저로 내려가지 않는다(ADR-0004).
- 세션 중에는 '모의' 표식을 두지 않고, 시작 전 고지와 세션 후 정체 공개로 안전을 보장한다(T187).
- 실존 은행명 대신 "OO은행" 같은 가상 명칭을 쓴다.

## Stack (T2 스캐폴딩 — docs/Architecture.md 확정)
Next.js (App Router, TypeScript, Tailwind, 정적 export) + Firebase(Auth Google Provider /
Cloud Functions 2nd gen / Firestore / Storage) + ElevenLabs + LLM(Claude|Gemini 어댑터).
배포: **Firebase Hosting**(Functions/Firestore/Storage rules와 `firebase deploy` 하나로 통합
배포하기 위해 T2에서 택함 — docs/Architecture.md §1 "T2 스캐폴딩에서 팀 편의로 택1").

디자인 토큰(시안 A "공공 안심형" — docs/Architecture.md §89): 사이트 색의 원천은 `src/lib/design/siteTokens.ts`이고
`src/app/globals.css`가 같은 값을 CSS 변수 · Tailwind 유틸리티(`bg-page` · `text-ink` · `bg-brand` …)로 노출한다(G630이 일치를 검사).
글꼴은 외부 CDN에서 불러온다(설치 단계 없음): 함렛 · IBM Plex Sans KR = Google Fonts, Pretendard = jsdelivr(훈련 화면).
CDN이 막힌 환경에서는 시스템 글꼴로 대신 보인다(`display=swap`).

## Getting Started

> **프로토타입 단계 안내(사용자 결정, 2026-07-21):** 지금은 실제 Firebase 콘솔 프로젝트 없이
> **로컬 Firebase 에뮬레이터**로 개발한다. 아래 1~3단계(사전 준비 → 설치 → 로컬 개발 서버)만
> 따라 하면 실 Firebase 계정 없이 로컬에서 바로 돌려볼 수 있다. "Firebase 프로젝트 연결"(4단계)과
> "배포"(5단계)는 **실제 배포/데모 준비 시점에만** 필요하다.

### 1. 사전 준비
- Node.js 22 — `functions/package.json`의 `engines.node`(배포 런타임)와 같은 메이저. 로컬 테스트는 루트 22.6+·functions 21+ 필요
- `npm install -g firebase-tools` (또는 `npx firebase-tools` 사용) — 에뮬레이터 실행에 필요
- Java(OpenJDK 11+) — Firestore/Storage 에뮬레이터 구동에 필요
- Firebase 프로젝트는 **로컬 개발 단계에서는 불필요**(3단계 참조). 실 프로젝트는 배포/데모
  준비 시점에만 필요 — 아래 "4. Firebase 프로젝트 연결" 참조.

### 2. 설치
```
npm install
cd functions && npm install && cd ..
```
⛔ `npm --prefix functions install`은 쓰지 않는다 — 이 형태에서만 `functions/package.json`에 잘못된 로컬
의존성이 주입된다(T130, CLAUDE.md Verified Commands).
`.env`/`functions/.env`가 없다면 아래 "Configuration"의 값(로컬 에뮬레이터용 데모 값)으로
채운다.

### 3. 로컬 개발 서버 (에뮬레이터 기준)
두 터미널에서 각각 실행한다.
```
firebase emulators:start   # Auth(9099)/Firestore(8080)/Storage(9199)/Functions(5001)
npm run dev                 # Next.js 개발 서버
```
`src/lib/firebase/emulator.ts`의 `useEmulator` 플래그가 `process.env.NODE_ENV !== "production"`일
때 자동으로 켜져서, 클라이언트의 Auth/Firestore/Storage/Functions 호출이 모두 로컬 에뮬레이터로
연결된다(별도 설정 불필요). `npm run build`(프로덕션 빌드)에서는 이 플래그가 꺼져 에뮬레이터
연결 코드가 완전히 제거된다.

#### 3-1. 에뮬레이터가 지금 어떤 코드를 물고 있는지 확인 (T115)
에뮬레이터는 **기동 시점의 `functions/lib`를 1회 로드**한다. 그 뒤 `npm --prefix functions run build`나
`npm --prefix functions test`로 `lib`가 바뀌어도 **아무 경고 없이 옛 코드로 계속 응답한다**(감시·자동
재로드 없음 — 실측). 포트가 응답한다는 사실만으로는 *무엇이* 떠 있는지 알 수 없으므로, 라이브 검증을
시작하기 전에 다음을 돌린다.
```
npm --prefix functions run build        # lib 최신화 + 빌드 기록 남기기
npm --prefix functions run emu:check    # 다른 포트면 -- --port 5711
```
로드된 디렉터리·함수 목록·기동 시각을 표로 찍고 `FRESH` / `STALE-CODE` / `STALE-BUILD` /
`STALE-EXPORTS` / `OTHER-TREE`(다른 트리에서 기동됨) / `UNKNOWN` / `NOT-RUNNING` 중 하나로 판정한다
(`FRESH`·`NOT-RUNNING`만 종료 코드 0). **판정에 필요한 값이 없으면 "괜찮다"가 아니라 `UNKNOWN`을 낸다.**
`STALE-*`가 뜨면 에뮬레이터를 **재기동**해야 반영된다.

### 4. Firebase 프로젝트 연결 (실제 배포/데모 준비 시점에만 필요, 최초 1회, 수동)
로컬 개발에는 필요 없다 — 실 Firebase 콘솔 프로젝트로 배포하거나 실제 Google OAuth 로그인을
데모해야 할 때만 아래를 수행한다. Firebase 콘솔에서 실제 프로젝트를 생성한 뒤:
```
firebase login
firebase use --add   # 생성한 프로젝트 ID를 선택하고 .firebaserc의 "default" 별칭에 연결
```
`.firebaserc`의 `YOUR_FIREBASE_PROJECT_ID` placeholder는 실제 프로젝트 ID로 자동 갱신된다
(또는 직접 수정). Firebase 콘솔에서 Authentication(**Google Provider + Anonymous Provider**)·
Firestore·Storage를 활성화해야 한다(CLI로 프로젝트 자체를 생성할 수는 없음). **Anonymous
Provider**는 2인 소셜 챌린지(T37, `/challenge/join`)에서 사용자2가 로그인 없이 링크만으로
체험을 시작할 때 내부적으로 쓰인다(§14.7/ADR-0006 — 사용자에게는 로그인 UI가 전혀 보이지
않는다). 에뮬레이터 환경(Auth Emulator)은 프로바이더 활성화 없이도 동작하므로 로컬 개발에는
영향이 없다 — 실 프로젝트 배포 시에만 필요한 단계다. 이때 `.env`도 에뮬레이터용 데모 값에서
실제 프로젝트 설정값으로 교체한다. ⛔ **단 Anonymous Provider는 서버 익명 게이트(T176,
`docs/Architecture.md` §68)가 들어간 Functions를 전체 배포(`firebase deploy --only functions`)한
뒤에만 켠다** — 먼저 켜면 누구나 새 익명 uid로 자가 훈련·챌린지 생성 경로(LLM 호출)를 쓸 수 있고,
되돌릴 때도 **익명을 먼저 끈 뒤** 코드를 revert한다(T177 순서).

### 5. 배포 (실제 배포/데모 준비 시점에만)
```
npm run build          # Next.js 정적 export → out/
firebase deploy        # Hosting + Functions + Firestore/Storage rules
```

## Configuration

이 프로젝트는 **두 개**의 `.env` 파일을 쓴다. 클라이언트(Next.js)와 서버(Cloud Functions)의
시크릿 노출 범위가 다르기 때문이다(절대 섞지 않는다 — docs/Architecture.md §8).

### 클라이언트 — 루트 `.env` (git-ignored)
```
cp .env.example .env
```
| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Web SDK 설정값(Firebase 콘솔 > 프로젝트 설정 > 내 앱) |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth 도메인 |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase 프로젝트 ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Storage 버킷 |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | FCM 발신자 ID(Firebase 웹앱 설정 일부) |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase 웹앱 ID |

`NEXT_PUBLIC_*` 값은 Firebase Web SDK 공개 설정값으로 실제 접근 제어는 `firestore.rules`/
`storage.rules`가 담당한다(비밀키 아님). 그래도 프로젝트마다 값이 다르므로 `.env`로 관리한다.

**로컬 에뮬레이터 개발 단계에서는 실제 Firebase 프로젝트 값이 필요 없다.** `NEXT_PUBLIC_FIREBASE_PROJECT_ID`에
Firebase 공식 컨벤션인 `demo-`로 시작하는 값(예: `demo-test` — "이 ID는 실제 클라우드 리소스에
닿지 않는다"는 의미)을 쓰고, `NEXT_PUBLIC_FIREBASE_API_KEY`는 `AIzaSy...` 형태(약 39자)의
형식만 맞는 더미 문자열을 쓰면 된다(실제 키일 필요 없음 — `getAuth()`가 형식만 검증하기 때문).
이 데모 값들은 `useEmulator`가 켜져 있는 한(3단계) 로컬 에뮬레이터만 바라본다.

### 서버 — `functions/.env` (git-ignored, 절대 클라 번들에 포함 금지)
```
cp functions/.env.example functions/.env
```
| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | **무료** 실시간 음성 통화(Gemini Live, generic 3종) + **텍스트 대화(사기범 역할극) LLM**(DECISIONS #29) — 아래 설명 참조 |
| `GEMINI_API_KEY2` | (선택) 1번 키가 일일 할당량을 소진했을 때 넘어갈 **2번 키** — 아래 "키 순환" 참조. ⚠️ **반드시 다른 GCP 프로젝트의 키여야 한다** |
| `GROQ_API_KEY` | (선택) 텍스트 대사 생성 **3차 예비**(Groq `openai/gpt-oss-120b`) — 아래 "3차 예비 Groq" 참조. 키는 **하나만**. 로컬은 `functions/.secret.local` 권장 |
| `CLAUDE_API_KEY` | (선택) **사기범 대사 1차** LLM(Claude `claude-sonnet-5-5`) — 아래 "사기범 대사 1차 Claude" 참조. 없으면 사기범 대사도 Gemini 체인. 로컬은 `functions/.secret.local` 권장 |
| `ELEVENLABS_API_KEY` | ElevenLabs Instant Voice Cloning + TTS + Agents(실시간 통화) API 키 |
| `ELEVENLABS_AGENT_IDS` | 실시간 음성 통화용 `scenarioId:agentId` 매핑(쉼표 구분) — 아래 설명 참조 |
| `LLM_API_KEY` | 사기범 역할극/리포트 생성용 LLM API 키 |
| `LLM_PROVIDER` | `claude` 또는 `gemini` (DECISIONS #11 어댑터 선택) |
| `FALLBACK_VOICE_ID` | 클론/합성 타임아웃 시 폴백용 사전 준비 voiceId(OQ-U3, DECISIONS #9) |

프로덕션 배포 시에는 `functions/.env` 파일 대신 `firebase functions:secrets:set <NAME>`로
시크릿을 설정하는 것을 권장한다(파일을 배포 서버에 올리지 않음).

#### 실시간 음성 통화 설정

훈련 통화는 **speech-to-speech 실시간 대화**로 동작한다. 두 경로가 있고, 서버가 시나리오에 따라
자동으로 고른다(`functions/src/realtime/provider.ts`):

| 경로 | 비용 | 본인 목소리 클론 | 적용 시나리오 |
|---|---|---|---|
| **Gemini Live** | 무료 티어 가능 | ❌ 고정 프리셋 음성만 | generic 3종(기관사칭·대출·환급금) |
| **ElevenLabs Agents** | 유료 | ✅ 가능 | 전체(clone 2종은 이 경로에서만 성립) |

Gemini Live 경로의 모델은 `gemini-3.8-live`다(`functions/src/realtime/geminiProvider.ts`의 `GEMINI_LIVE_MODEL`,
2026-10-17 전환 — 이전 `gemini-2.5-flash-native-audio-preview-12-2025`는 2026-11-17 종료 예정). 근거와 주의점은
`docs/Architecture.md` §71 · ADR-0017에 있다. ⚠️ 이 상수만 바꾸지 말 것 — 도구 선언의 `behavior: BLOCKING`과
클라 보류 큐(`src/lib/realtime/clientTurnQueue.ts`)가 함께 있어야 한다. 배포는 Hosting → Functions 순서다.

- **지연 로그**: 실시간 통화 중 브라우저 콘솔에 `[gemini-latency]` 줄이 남는다(production 포함). 모델 턴마다
  "앵커(발화 끝·보낸 텍스트) → 첫 오디오" ms와 도구 대기 ms를 숫자로만 적고, 통화 시작 때 준비 구간(setup) 1줄,
  끝날 때 요약 1줄을 남긴다. 실기기는 원격 디버깅(Android `chrome://inspect` · iOS Safari)으로 읽는다.
- **기본 음량**: AI 음성은 게인 0.6으로 재생된다(`src/lib/realtime/outputGain.ts` — 실기기 확인 전 잠정값).

둘 다 없으면 텍스트 폴백으로 자동 강등되고 그 사실이 화면에 표시된다. 즉 키 없이도 전체 흐름을
개발·시연할 수 있다.

##### 무료로 시작하기 (`GEMINI_API_KEY`)

1. [aistudio.google.com](https://aistudio.google.com)에서 API 키 발급(카드 등록 불필요)
2. `functions/.env`에 `GEMINI_API_KEY=발급받은_키` 추가 후 에뮬레이터 재시작

**이 키 하나가 두 가지 경로를 동시에 활성화한다(DECISIONS #29):**
- generic 시나리오 3종(기관사칭·대출·환급금)의 실시간 음성 통화(Gemini Live, 고정 프리셋 음성만).
- **모든 시나리오**(보이스·메신저 공통)의 텍스트 대화(`sendMessage`/`createSession`) — `functions/src/llm/index.ts`의 `getLlmClient()`가 이 키가 있으면 규칙 기반 목업 대신 실제 Gemini로 사기범 캐릭터를 생성한다. 텍스트 생성은 음성과 별도 모델(`GEMINI_TEXT_MODEL` 상수 = 고정 버전 `gemini-3.1-flash-lite`, `functions/src/llm/geminiClient.ts`)을 쓰고 고정 프리셋 음성 제약이 없다 — 클론 시나리오의 채팅/에스컬레이션 전 텍스트 구간도 이 경로를 탄다. ⚠️ 부동 별칭(`gemini-flash-latest` 등)으로 되돌리지 말 것 — 과거 그 별칭이 조용히 재매핑되면서 텍스트 대화가 100% Mock으로 강등되는 장애를 낸 적이 있다(T98/T117, `docs/CHANGELOG.md` 참조). `geminiClient.test.ts`가 `latest`·`preview` 포함 금지를 회귀 게이트로 고정하고 있다. (2026-09-05 갱신 — 이전 값 `gemini-3.6-flash`는 **모델 자체의 서빙 지연**으로 최소 요청조차 47초가 걸려 텍스트 경로가 다시 100% Mock 강등됐다. 교체 근거 프로브 표는 `geminiClient.ts`의 상수 주석에 있다.)

키가 없으면 음성은 텍스트 폴백으로, 텍스트 대화는 규칙 기반 목업(`MockLlmClient`)으로 강등된다 —
즉 키 없이도 전체 흐름을 개발·시연할 수 있다. 시스템 프롬프트는 서버가 조립·고정해서 전달하므로
(음성: `liveConnectConstraints`로 단기 토큰에 고정, 텍스트: 서버 조립 후 클라로 전송한 적 없음)
브라우저로 내려가지 않고, 클라이언트가 모델·프롬프트·도구를 바꿔치기할 수도 없다(ADR-0004).
실 Gemini가 실패(안전필터 차단·타임아웃 등)해도 그 턴만 조용히 목업으로 강등되고 대화는 끊기지
않는다(`completeWithFallback`, `functions/src/llm/index.ts`).

> ⚠️ 무료 티어는 대화 내용이 구글 모델 학습에 사용된다. 실제 사용자를 대상으로 배포할 때는
> 유료 티어(학습 미사용)로 올릴 것.

##### 일일 할당량 소진 시 키 순환 (`GEMINI_API_KEY2` …)

무료 티어는 **모델·프로젝트당 하루 20호출**이라 훈련 1~2회차만 돌려도 그날의 텍스트 대화가 전부
목업으로 강등된다. 키를 **순서 있는 목록**으로 두면, 1번 키가 **일일 429**를 돌려줄 때 서버가
자동으로 다음 키로 넘어가 계속 진행한다(`functions/src/llm/rotatingClient.ts`).

1. 두 번째 키를 발급한다. ⛔ **반드시 다른 GCP 프로젝트에서 발급해야 한다** — 같은 프로젝트의
   키는 할당량을 공유하므로 순환이 아무 효과가 없는데, **코드는 그것을 감지할 방법이 없다**
   (429가 오기 전까지 두 키를 구분할 수 없다). **운영 규칙으로만 보장된다.**
2. `functions/.env`에 `GEMINI_API_KEY2=발급받은_키`를 추가하고 에뮬레이터를 재시작한다.
3. 3번째 이후 키가 필요하면 `functions/src/shared/config.ts`의 `GEMINI_KEY_SECRETS` 배열에
   슬롯을 한 줄 추가한다(핸들러는 한 곳도 고치지 않는다 — 배열을 스프레드하기 때문이다).
   ⛔ 1번 키를 `GEMINI_API_KEY1`로 개명하지 말 것(배포 시크릿·문서가 기존 이름에 묶여 있다).

**슬롯 이름 규약**: `GEMINI_API_KEY`(1번, 이름 불변) · `GEMINI_API_KEY2` · `GEMINI_API_KEY3` …
값이 없는 슬롯은 조용히 건너뛴다 — **2번 키가 없는 환경의 동작은 키 순환 도입 전과 동일하다.**

넘기는 조건은 **일일 소진(`quotaId`에 `PerDay`)뿐**이다. **분당 제한(`PerMinute`)에는 키를 바꾸지
않는다** — 분당 제한은 같은 키가 잠시 뒤 회복되므로, 거기서 넘기면 멀쩡한 키의 하루치를 조기에
태운다. 분류가 불확실하면(`unknown`) **키를 바꾸지 않는 쪽**이 기본값이다.

> ⚠️ **이것은 할당량 문제의 해결이 아니라 완충이다.** 1일 수요는 약 26호출이고 키 1개의 캡이
> 20이라, 키 2개(캡 40)로도 여유는 14회분뿐이다. 회차를 늘리면 다시 모자란다.

##### 3차 예비 Groq (`GROQ_API_KEY`, 2026-10-18 · `docs/Architecture.md` §75)

텍스트 대사 생성 순서는 **1차 `gemini-3.1-flash-lite` → 2차 `gemini-3.5-flash-lite`(503일 때) → 3차 Groq
`openai/gpt-oss-120b`** 다(`functions/src/llm/groqFallback.ts`·`groqClient.ts`). 실시간 음성(Gemini Live)은 바뀌지 않는다.

- **넘어가는 조건**: Gemini 쪽 최종 오류가 429·5xx이거나, Gemini 단계가 시간 상한을 넘겼을 때만 넘어간다.
  4xx 입력 오류·안전 차단·네트워크 오류에서는 넘어가지 않고 기존처럼 목업으로 강등한다.
- **시간 예산**: 전체 상한(일반 턴 10초 · 첫 턴 20초)은 그대로다. 키가 있으면 Gemini 단계가 3초를 남기고
  끝나야 한다(7초 · 17초). 넘기면 Gemini 요청을 취소하고 Groq를 1회 부른다.
- **개인정보**: 보내기 전에 대화의 이름·생년월일을 가명으로 바꾸고, 전화·주민번호·계좌는 기존 마스킹을
  한 번 더 적용한다. 응답에 가명이 나오면 원래 값으로 되돌려 보여 준다.
- **설정**: [console.groq.com/keys](https://console.groq.com/keys)에서 키를 발급해 `functions/.secret.local`에
  `GROQ_API_KEY=...`를 넣고 에뮬레이터를 재시작한다. 배포 전에는 `firebase functions:secrets:set GROQ_API_KEY`가
  **먼저** 필요하다. 등록하지 않고 배포하면 배포 분석 단계가 값을 요구하며 멈춘다. 키가 없으면 3차만 꺼지고
  `Groq 3차 예비 비활성 — GROQ_API_KEY 없음` 로그가 1줄 남는다.
- **확인**: `sendMessage LLM 응답 단계` 로그의 `servedBy`(`gemini-primary` · `gemini-fallback` · `groq` · `mock`)로
  라이브에서 어느 단계가 응답했는지 본다.

> ⚠️ **한도**: 이 모델의 한도는 분당 30회 · 하루 1,000회 · **분당 8,000토큰** · 하루 20만 토큰이다
> ([공식 한도표](https://console.groq.com/docs/rate-limits) + 이 키의 응답 헤더 실측. 조직 단위로 적용된다).
> 이 서비스의 요청 1건은 약 3,500~4,200토큰이라(2026-10-18 실측) **실제로는 분당 1~2건 · 하루 약 50건**까지만
> 처리된다. 넘치면 Groq가 429를 돌려주고 그 턴은 목업으로 강등된다. Gemini가 오래 장애일 때의 대체재가 아니라
> 짧은 순간 장애를 메우는 완충이다.

##### 사기범 대사 1차 Claude (`CLAUDE_API_KEY`, 2026-10-22 · `docs/Architecture.md` §103)

사기범 대사(메신저 답장 · 오프닝 첫마디)는 **1차 `claude-sonnet-5-5` → 2차 `gemini-3.5-flash-lite` → 3차 Groq → 목업** 순서다
(`functions/src/llm/claudeClient.ts` · `claudeFallback.ts`). 되감기 판정처럼 용도가 다른 호출은 위 Gemini 체인 그대로다.

- **넘어가는 조건**: Claude가 실패하면(오류 종류 무관) · 거절하면 · 쓸 수 없는 대사를 내면 · 5초(첫 턴 15초) 안에 끝나지 않으면 2차로 1회 넘어간다.
- **시간 예산**: 전체 상한(10초 · 20초)은 그대로다. Claude 5초 → Gemini 2차에 2초 이상 → Groq 3초.
- **개인정보**: Groq와 같이 이름·생년월일을 가명으로 바꿔 보내고 응답에서 되돌린다.
- **비용**: 실측 세션당 약 $0.20(약 11호출 · 한국어 프롬프트 약 4,500토큰/호출) — 하루 50세션이면 월 약 $300.
- **설정**: 로컬은 `functions/.secret.local`에 `CLAUDE_API_KEY=...`. 배포 전에는 `firebase functions:secrets:set CLAUDE_API_KEY`가
  **먼저** 필요하다(등록하지 않고 배포하면 배포 분석 단계가 값을 요구하며 멈춘다). 키가 없으면
  `Claude 1차 비활성 — CLAUDE_API_KEY 없음` 로그 1줄과 함께 사기범 대사도 Gemini 체인을 쓴다.
- **확인**: `sendMessage LLM 응답 단계` 로그의 `servedBy`가 `claude-primary`면 1차가 답한 것이다.

> 어느 키로 넘어갔는지는 **서버 로그에만** 남는다(`geminiKeySlot`·`geminiKeyIndex`·`quotaClass`).
> ⛔ 키 값은 로그·응답·리포트 어디에도 기록하지 않는다.

##### 본인 목소리 클론까지 (`ELEVENLABS_AGENT_IDS`)

clone 시나리오(가족 납치·손주 사칭)는 참가자 본인 목소리로 걸려오는 것이 핵심이라 ElevenLabs가
필요하다. 저지연 한국어 대화를 위해 에이전트 설정에서 `language=ko`와 저지연 모델(Flash 계열)을
선택하고, Security 탭에서 `voice_id`·`language` 오버라이드를 허용한다(허용하지 않으면 클론
목소리가 반영되지 않는다).

시나리오별로 에이전트를 하나씩 만들고 매핑을 넣는다:

```
ELEVENLABS_AGENT_IDS=family-accident-deepvoice:agent_xxx,tax-refund-scam:agent_yyy
```

**페르소나 프롬프트는 에이전트 쪽에 저장한다**(ADR-0004). ElevenLabs 오버라이드는 클라이언트가
보내는 값이라, 프롬프트를 오버라이드로 넘기면 브라우저에 민감 프롬프트가 노출되기 때문이다.
서버는 서명 URL만 발급하고, 클라가 보내는 오버라이드는 민감하지 않은 `voice_id`/`language`뿐이다.
각 에이전트에 넣을 프롬프트 원문은 `functions/src/scenarios/*.prompt.ts`를
`roleplay/promptAssembly.buildSystemPrompt()`로 조립해 그대로 붙여넣는다(손으로 다시 쓰면
드리프트가 난다).

새 환경변수를 도입할 때는 해당 `.env.example`과 이 표를 함께 갱신한다(CLAUDE.md 규칙).

## Documentation
| Document | Purpose |
|---|---|
| [AGENTS.md](AGENTS.md) | Agent contract: I/O, ownership, priority |
| [docs/PRD.md](docs/PRD.md) | Requirements and MVP scope |
| [docs/UX.md](docs/UX.md) | Screen catalog and interaction patterns |
| [docs/Architecture.md](docs/Architecture.md) | System design |
| [docs/API.md](docs/API.md) | Cloud Functions callable contracts |
| [docs/Database.md](docs/Database.md) | Firestore/Storage schema and security rules |
| [docs/Tasks.md](docs/Tasks.md) | Implementation tasks and status |
| [docs/CodingRules.md](docs/CodingRules.md) | Coding standards |
| [docs/GitWorkflow.md](docs/GitWorkflow.md) | Branch/commit/PR rules |
| [docs/DefinitionOfDone.md](docs/DefinitionOfDone.md) | Completion criteria |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decision log (details in docs/adr/) |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Release history |
