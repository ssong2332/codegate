# Claude Code Starter Kit

A production-ready Starter Kit for Claude Code projects: 6 specialized subagents, a documented agent contract, and a full project-documentation template set.

## Features
- ✅ 6 Specialized Subagents (planner, architect, implementer, reviewer, quality-assurance, docs)
- ✅ CLAUDE.md
- ✅ AGENTS.md (Agent Contract: Authority, Input/Output, Ownership, Document Priority)
- ✅ PRD Workflow
- ✅ Architecture Workflow
- ✅ Decision Log
- ✅ ADR
- ✅ Definition of Done
- ✅ Git Workflow
- ✅ Prompt Rules

## Quick Start
1. Use this repository as a GitHub Template.
2. Clone your new repository.
3. Open Claude Code.
4. Ask:
   ```
   planner 에이전트로 요구사항 정리해줘
   ```

> After cloning, replace this README with your own project's README (`## Overview` / `## Getting Started` / the Documentation table below are a good starting shape). Fill in the `{{placeholders}}` in `CLAUDE.md`. Do **not** carry over this kit's root `CHANGELOG.md` — your project starts from the blank `docs/CHANGELOG.md` instead. Full agent invocation guide: `docs/PromptRules.md`.

## Stack (T2 스캐폴딩 — docs/Architecture.md 확정)
Next.js (App Router, TypeScript, Tailwind, 정적 export) + Firebase(Auth Google Provider /
Cloud Functions 2nd gen / Firestore / Storage) + ElevenLabs + LLM(Claude|Gemini 어댑터).
배포: **Firebase Hosting**(Functions/Firestore/Storage rules와 `firebase deploy` 하나로 통합
배포하기 위해 T2에서 택함 — docs/Architecture.md §1 "T2 스캐폴딩에서 팀 편의로 택1").

## Getting Started

> **프로토타입 단계 안내(사용자 결정, 2026-07-21):** 지금은 실제 Firebase 콘솔 프로젝트 없이
> **로컬 Firebase 에뮬레이터**로 개발한다. 아래 1~3단계(사전 준비 → 설치 → 로컬 개발 서버)만
> 따라 하면 실 Firebase 계정 없이 로컬에서 바로 돌려볼 수 있다. "Firebase 프로젝트 연결"(4단계)과
> "배포"(5단계)는 **실제 배포/데모 준비 시점에만** 필요하다.

### 1. 사전 준비
- Node.js 20+ (권장, `functions/package.json`의 `engines.node` 기준)
- `npm install -g firebase-tools` (또는 `npx firebase-tools` 사용) — 에뮬레이터 실행에 필요
- Java(OpenJDK 11+) — Firestore/Storage 에뮬레이터 구동에 필요
- Firebase 프로젝트는 **로컬 개발 단계에서는 불필요**(3단계 참조). 실 프로젝트는 배포/데모
  준비 시점에만 필요 — 아래 "4. Firebase 프로젝트 연결" 참조.

### 2. 설치
```
npm install
npm --prefix functions install
```
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

### 4. Firebase 프로젝트 연결 (실제 배포/데모 준비 시점에만 필요, 최초 1회, 수동)
로컬 개발에는 필요 없다 — 실 Firebase 콘솔 프로젝트로 배포하거나 실제 Google OAuth 로그인을
데모해야 할 때만 아래를 수행한다. Firebase 콘솔에서 실제 프로젝트를 생성한 뒤:
```
firebase login
firebase use --add   # 생성한 프로젝트 ID를 선택하고 .firebaserc의 "default" 별칭에 연결
```
`.firebaserc`의 `YOUR_FIREBASE_PROJECT_ID` placeholder는 실제 프로젝트 ID로 자동 갱신된다
(또는 직접 수정). Firebase 콘솔에서 Authentication(Google Provider)·Firestore·Storage를
활성화해야 한다(CLI로 프로젝트 자체를 생성할 수는 없음). 이때 `.env`도 에뮬레이터용 데모 값에서
실제 프로젝트 설정값으로 교체한다.

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
| `ELEVENLABS_API_KEY` | ElevenLabs Instant Voice Cloning + TTS API 키(docs/API.md Conventions) |
| `LLM_API_KEY` | 사기범 역할극/리포트 생성용 LLM API 키 |
| `LLM_PROVIDER` | `claude` 또는 `gemini` (DECISIONS #11 어댑터 선택) |
| `FALLBACK_VOICE_ID` | 클론/합성 타임아웃 시 폴백용 사전 준비 voiceId(OQ-U3, DECISIONS #9) |

프로덕션 배포 시에는 `functions/.env` 파일 대신 `firebase functions:secrets:set <NAME>`로
시크릿을 설정하는 것을 권장한다(파일을 배포 서버에 올리지 않음).

이 값들이 없으면(특히 `ELEVENLABS_API_KEY`) 음성 클론(T1)은 착수할 수 없다 — 그동안은
T19 목업(Mock TTS)으로 개발을 진행한다(docs/PRD.md v0.6 변경 요약 참조). 새 환경변수를
도입할 때는 해당 `.env.example`과 이 표를 함께 갱신한다(CLAUDE.md 규칙).

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
