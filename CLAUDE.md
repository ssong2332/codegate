# CLAUDE.md — Project Rules
## Project Startup Behavior

When a project is opened and no explicit user task is provided:

1. Analyze the repository structure.
2. Detect existing project documentation (PRD.md, Architecture.md, Tasks.md, README.md, etc.).
3. Determine the current project phase.
4. Suggest the single most logical next step instead of asking a generic question.

Priority:
- If `PRD.md` is missing, suggest generating it.
- Else if `Architecture.md` is missing, suggest generating it from the PRD.
- Else if `Tasks.md` is missing, suggest generating implementation tasks.
- Else recommend the highest-priority incomplete task from `Tasks.md`.

Do not respond only with "What would you like help with?".
Be proactive and guide the workflow based on the current repository state.

---

## Environment Variables

### Secrets Management

- Never hardcode API keys, passwords, tokens, database credentials, or any other secrets in source code.
- Store all sensitive configuration in a `.env` file.
- Commit only `.env.example` with placeholder values.
- Ensure `.env` is listed in `.gitignore` and is never committed.
- When introducing a new environment variable, update both `.env.example` and the README configuration section.
- If required environment variables are missing, clearly inform the user instead of guessing or using placeholder secrets.
- Never print or expose secret values in logs, documentation, examples, generated code, or commit messages.

### Configuration

Before generating code:

- Check whether the required environment variables already exist.
- If a required variable is missing, instruct the user to add it to `.env` and update `.env.example`.
- Never invent API keys, tokens, passwords, secrets, or credentials.
- Use sensible placeholder names such as `YOUR_API_KEY`, `YOUR_SECRET`, or `DATABASE_URL` in examples.

---

## Documentation Maintenance

When introducing a new dependency, configuration option, environment variable, or setup step:

- Update `README.md` accordingly.
- Keep installation and configuration instructions synchronized with the current project state.
- Ensure new contributors can set up the project using only the README and `.env.example`.
## Prohibitions (override all other rules)
- No success reports without evidence (file:line, log, number).
- No unrequested modifications, refactoring, or deletions.
- No silent workarounds — report the blocker and get approval first.
- No guesses stated as facts — mark them as estimates and say how to verify.

## Project Overview
- Name: {{project-name}}
- Goal: {{one line}}
- Stack: {{fill in after docs/Architecture.md is approved}}

## Verified Commands
Record commands verbatim after the first success. Reuse without modification; if a change is needed, state what and why first.

> ⚠️ **npm 스크립트를 거치지 않고 직접 명령을 치지 말 것.** `npx tsc` 같은 직접 실행은
> `functions/lib`의 스테일 컴파일 산출물을 지우는 단계를 건너뛰어 **테스트 수치를 조용히 오염시킨다**
> (T101 / `docs/Architecture.md` §20.7 (1) — 실측으로 확인된 유일한 잔여 구멍이며 이 표가 그 완화 수단이다).
> 이 오염으로 2026-07-26~27 세션에서 **테스트 수 오보가 3회** 발생했다.

> ⛔ **`npm --prefix <dir> install` 을 쓰지 말 것.** 이 형태에서만 `package.json`에
> `"fraud-vaccine-web": "file:.."` 의존성이 주입된다 — **T130에서 원인이 확정됐다**
> (`npm --prefix functions install` **3/3 오염** vs `cd functions && npm install` **0/3** ·
> 루트 `npm install` **0/3**). 저장소 밖 워크트리에서도 나므로 조상 디렉터리 문제가 아니다.
> ⇒ **필요하면 `cd functions && npm install`** 로 쓴다.
> ⚠️ 위 표의 `--prefix` 명령들(`test`·`run build`·`run lint`)은 **오염시키지 않는다**(실측) —
> **`install` 형태만** 문제다. `.githooks/pre-commit` 트립와이어가 오염된 커밋을 거부하지만,
> **`--no-verify`·`core.hooksPath` 미설정으로 뚫린다**(T130 잔여 한계).

> ⛔ **같은 체크아웃에서 `npm test` / `npm --prefix functions test` 를 동시에 두 번 이상 돌리지 말 것.**
> 이 스크립트는 매번 `clean-lib` → `tsc` 를 하므로, **한 실행이 `lib/`를 지우는 동안 다른 실행이 그것을 읽어**
> `MODULE_NOT_FOUND` 가 무더기로 난다 — **테스트 파일 자체가 실행 중 사라진다.**
> 2026-07-29 실측: 동시 실행 시 **437 tests / 13 fail**(제품 결함 아님) vs 단독 실행 **616 / 0**.
> ⇒ **동시에 검증할 때는 에이전트마다 격리 워크트리를 강제**하라(지시문으로 *"워크트리를 만들어라"* 라고
> 쓰는 것만으로는 안 막힌다 — 실제로 안 만들고 메인에서 돌린 사례가 있다).

| Purpose | Command | Verified on |
|---|---|---|
| Build (functions) | `npm --prefix functions run build` | 2026-07-27 |
| Test (functions) | `npm --prefix functions test` | 2026-10-22 — **1606 pass / 0 fail** (§99 화면 꺼짐 통화 복구 실측, 브랜치 `claude/call-screen-off-mic-a55f8e` = main `57a7f81` + §99 · functions 변경 0건) · 2026-10-21 — **1606 pass / 0 fail** (§98 검찰 고급 실측, 브랜치 `claude/prosecution-advanced-depth-662cef` = #362 head `d4492fe`(main `112b372` 포함) 병합 트리 + T129 (b) + §98 · 신규 `prosecutionWalletFlow.test.ts` 5건 · G159 (b) 생존 1건) · 2026-10-21 — **1600 pass / 0 fail** (§96 주소창 스크롤 · 목록 토글 실측, 브랜치 `claude/viewport-scroll-and-toc-737f69` = #360 head `b69c009` 병합 트리 + §96 · functions 변경 0건) · 2026-10-21 — **1600 pass / 0 fail** (§95 카톡형 키보드 · 입력 중 · 머리줄 + 웨일 다크 안내 실측, 브랜치 `claude/kakao-keyboard-header-typing-05cb51` = main `eacf9af` + 변경 · functions 변경 0건) · 2026-10-21 — **1600 pass / 0 fail** (§94 실측, 브랜치 `claude/kakao-chat-ux-and-dark-lock-437c6b` = #357 head `7cf9735`(#356 포함) 병합 트리 + §94 · functions 변경 0건) · 2026-10-21 — **1600 pass / 0 fail** (§93 카드 대상 확대 실측, 브랜치 `claude/persona-card-expand-targets-390036` = #356 head `cde5466` 병합 트리 + 변경 · 신규 `personaCardExpansion.test.ts` 6건 외) · 2026-10-21 — **1590 pass / 0 fail** (§92 시나리오 목록 정리 실측, 브랜치 `claude/advanced-scenarios-consolidation-ffb3ae` = main `f5af50a` 병합 트리 + §92 · 신규 `catalogConsolidation.test.ts` 13건) · 2026-10-21 — **1577 pass / 0 fail** (강제 다크·폭 수정 실측, 브랜치 `claude/fix-force-dark-and-difficulty-width-53d55c` = main `7dcabcf` 병합 트리 · 이 브랜치 functions 변경 0건) · 2026-10-21 — **1498 pass / 0 fail** (보안 헤더·법적 고지 실측, 브랜치 `claude/site-security-headers-og-legal-67badb` = main `d9fc87f` + 변경 · functions 변경 0건) · 2026-10-21 — **1487 pass / 0 fail** (§91 실측, 브랜치 `claude/institution-advanced-flow-fix-3edb5f` = main `676eeb3` + §91 · 신규 `institutionAdvancedFlow.test.ts` 16건 + `personaBlock.test.ts` 1건 · 새로 `cd functions && npm install`한 워크트리) · 2026-10-20 — **1468 pass / 0 fail** (§90 실측, 브랜치 `claude/live-human-speech-style-3a77a4` = main `6a312b8` + §90 · 신규 `liveSpeechStyle.test.ts` 8건) · 2026-10-20 — **1460 pass / 0 fail** (§88 실측, 브랜치 `claude/persona-card-user-input-504a63` = main `78bdb8a` + §88, 새로 `cd functions && npm install`한 워크트리) · 2026-10-18 — **944 pass / 0 fail** (T189 실측, main `191ff7d` 병합 트리 `fix/T189-report-unknown-tactics`, functions 변경 0건 — main 단독 944/0과 동일) · 2026-10-17 — **913 pass / 0 fail** (T188 실측, main `dcd2726` 병합 트리, 신규 15건) · 2026-10-17 — **898 pass / 0 fail** (T186 실측, 병합 커밋 `35d7061` = main `6bc0432` + T186, 신규 3건) · 2026-10-17 — **895 pass / 0 fail** (T185 QA 실측, 브랜치 `fix/T185-anonymous-route-exit` — functions 소스 = main `086287a`와 동일. 이전 기준 2026-10-01 858/0 · 2026-09-30 843/0) |
| Test (root) | `npm test` | 2026-10-22 — **948 pass / 0 fail** (§99 실측, 같은 브랜치 · 신규 `backgroundCall.test.ts` 20건 · `screenWakeLock.test.ts` 5건) · 2026-10-21 — **923 pass / 0 fail** (§98 실측, 같은 병합 트리 · `mockScreenTimelineCopy.test.ts` T129 (b) +1) · 2026-10-21 — **913 pass / 0 fail** (§96 실측, 같은 병합 트리 = #360 898 + 신규 `pageToc.test.ts` 10건 · `viewportUnits.test.ts` 5건) · 2026-10-21 — **898 pass / 0 fail** (§95 실측, 같은 브랜치 · 신규 `keyboardViewport.test.ts` 6건 · `webDarkNotice.test.ts` 3건 · `replyChoreography.test.ts` 재작성 9건) · 2026-10-21 — **879 pass / 0 fail** (§94 실측, 같은 병합 트리 · 신규 `replyChoreography.test.ts` 8건 · `themeDiagnostics.test.ts` 5건) · 2026-10-21 — **866 pass / 0 fail** (§93 실측, 같은 병합 트리(#356 + §93) · 신규 2건) · 2026-10-21 — **864 pass / 0 fail** (§92 실측, 같은 병합 트리 · 신규 4건) · 2026-10-21 — **860 pass / 0 fail** (같은 병합 트리 · `cssGuards.test.ts` +4 · G456 `landing.inputText` +1) · 2026-10-21 — **845 pass / 0 fail** (보안 헤더·법적 고지 실측 + 링크 보류 #204, 같은 브랜치 · 신규 `legalContent.test.ts` 6건 · `hosting-security-headers.test.mjs` 5건) · 2026-10-21 — **821 pass / 0 fail** (§91 실측, 같은 브랜치 · 루트 변경 0건) · 2026-10-20 — **815 pass / 0 fail** (§90 실측, 같은 브랜치 · 루트 변경 0건) · 2026-10-20 — **796 pass / 0 fail** (§88 실측, 같은 브랜치 · 신규 `personaCardInput.test.ts` 6건 · `personaCard.test.ts` +2) · 2026-10-18 — **492 pass / 0 fail** (T189 실측, main `191ff7d` 병합 트리, 신규 `reportTacticsCopy.test.ts` 13건 — main 단독 479/0) · 2026-10-17 — **446 pass / 0 fail** (T188 실측, main `dcd2726` 병합 트리, 루트 변경 0건) · 2026-10-17 — **446 pass / 0 fail** (T186 실측, 병합 커밋 `35d7061` = main `6bc0432` + T186, 신규 4건) · 2026-10-17 — **442 pass / 0 fail** (T185 QA 실측, 브랜치 `fix/T185-anonymous-route-exit` — 신규 `anonymousScope.test.ts` 10건 포함. 이전 기준 2026-10-01 419/0 · 2026-09-30 418/0) |
| Build (root) | `npm run build` | 2026-07-27 — 통과 (main `1157d7d`). ⚠️ **`.env`가 있는 트리에서만 통과한다** — 격리 워크트리처럼 `.env`가 없으면 TS 컴파일은 성공한 뒤 정적 생성 단계에서 `auth/invalid-api-key`로 실패한다. 이것은 코드 결함이 아니다(T108에서 base main 대조로 실측 확인) |
| Lint (functions) | `npm --prefix functions run lint` | 2026-07-27 |
| Clean (functions) | `npm --prefix functions run clean` | 2026-07-27 — 멱등 |
| Deploy dry-run (functions) | `firebase deploy --only functions --dry-run` | 2026-09-30 — `Dry run complete!` (main `d96c0e4`). ⚠️ **`functions/.env`가 있는 트리에서만 통과한다**(없으면 defineString 파라미터 누락으로 실패). ⚠️ 새 빌드 직후 첫 실행이 `User code failed to load ... Timeout after 10000`(discovery 10초)으로 자주 실패하고 같은 명령 재시도로 통과한다 — **2회 연속** 실패할 때만 `FUNCTIONS_DISCOVERY_TIMEOUT=30` 설정(OQ-A83, DECISIONS #107) |
| Deploy (functions, 일부) | `firebase deploy --only functions:<이름1>,functions:<이름2>` | 2026-09-30 — `functions:getBeginnerBriefing` 카나리 성공(T147). discovery 타임아웃 주의는 위와 같다 |
| Deploy (functions, 전체) | `firebase deploy --only functions` | 2026-09-30 — 26개 성공, 전부 `nodejs22`(T147). 2026-10-01 — 26/26 업데이트 재확인(T176, 1회차 discovery 타임아웃 → 재실행 성공). ⛔ 익명 게이트(T176)처럼 **여러 함수가 함께 바뀌어야 안전한 변경은 일부 배포 금지**(§68.10). ⛔ **Firestore 쿼리(`where`/`orderBy` 조합)가 바뀐 배포는 아래 인덱스 배포를 별도로 반드시 실행할 것**(§66 배포 직후 `createSession` 전체 장애의 원인) · 2026-10-17 — 26/26 `Successful update operation` · `Deploy complete!`(T186, main `a9cca63`, **새로 `cd functions && npm install`한 격리 워크트리**). ⚠️ 이 환경에서는 discovery 타임아웃이 10초·10초·30초(`FUNCTIONS_DISCOVERY_TIMEOUT=30`) 연속 3회 실패했고 **`FUNCTIONS_DISCOVERY_TIMEOUT=120 firebase deploy --only functions`로 성공**했다. 로컬 재현: `functions.yaml` 응답 15초 → 재측정 8초(첫 로드만 느림 — 원인은 새 `node_modules`의 콜드 로드로 추정, 미확정) |
| Deploy (hosting) | `npm run build` 후 `firebase deploy --only hosting` | 2026-10-17 — `release complete` · `Deploy complete!`(main `d1f7e26`, 메인 체크아웃 — `.env` 필요). ⚠️ **화면과 서버가 함께 바뀐 변경(예: 3.8 Live 전환 #280)은 Hosting → Functions 순서로 둘 다 배포할 것** — 2026-10-17 Functions만 먼저 배포돼(07:53 UTC) 새 서버 + 옛 화면 조합이 Hosting 재배포 전까지 라이브에 있었다. 마지막 Hosting 배포 시각 확인: `firebase hosting:channel:list` |
| Deploy (Firestore indexes) | `firebase deploy --only firestore:indexes` | §66 긴급 복구 때 성공(인수인계 기록). 라이브 인덱스 확인은 `firebase firestore:indexes` — 2026-09-30 선언 3 = 라이브 3 |
| Deploy (hosting) | `firebase deploy --only hosting --project voicefishing-ff47f` | 2026-10-17 — `Deploy complete!`(T185, 브랜치 `fix/T185-anonymous-route-exit` = main `086287a` + 수정). ⚠️ 직전에 `npm run build`(운영 값 = `.env.production`) → `npm run verify:build` 통과 산출물(`out/`)이어야 한다. 복사한 env 파일은 배포 뒤 지운다(아래 ⛔ 참고) · 2026-10-17 — `release complete` · `Deploy complete!`(T186, main `a9cca63`). ⛔ **메인 체크아웃의 `.env`는 에뮬레이터용(`demo-test`)이다 — 복사하지 말 것.** 운영 빌드는 메인 체크아웃의 **`.env.production`만** 워크트리로 복사하고, `.next`·`out`을 지운 뒤 빌드한다(같은 날 `.env`로 빌드·배포해 라이브 로그인이 약 40분 장애 — 상위 세션 보고). 배포 직전 `grep -rho 'projectId:"[^"]*"' out/_next/static \| sort -u` = `voicefishing-ff47f` 하나 · `grep -rl demo-test out \| wc -l` = 0 확인. 라이브 확인은 `?nocache=1`(HTML `max-age=3600`) |
| Runtime check (live) | `firebase functions:list` | 2026-09-30 — 26개, Runtime 열로 `nodejs22` 확인 |
| Probe (시나리오 소요 시간 · 실 키) | `npm --prefix functions run build` 후 `node scripts/duration-probe.mjs --secret <메인 체크아웃 functions/.secret.local> --key-var GEMINI_API_KEY2 --out <스크래치 폴더> --only <id:level,...> --tag <흐름>` (§98 옵션: `--variant fv-xxxx` 변형 고정 · `--responder refuse-coin` 코인 단계 거절) | 2026-10-21 — 16세션 · 429 0회(§98 — 이번 요청 범위로 사전 승인, 20세션 이내) · 2026-10-21 — 29세션 · 429 0회(메인 승인 "30세션 이내"). ⛔ **실 키 과금 — 매번 메인 승인 필요.** 병렬 흐름은 `--out`을 같게 두면 `STOP-429` 파일로 함께 멈춘다. 결과 분석은 `docs/research/scenario-catalog-review-2026-10.md` §5 |
| Smoke (에뮬레이터 · 챌린지 받는 분 정보 §88) | `npm --prefix functions run build` 후 에뮬레이터(auth·firestore·functions · `demo-test`)가 떠 있는 상태에서 `node scripts/emulator-persona-challenge-smoke.mjs --out <파일>` (`--scenario <id>`로 대상 4종 중 선택, 기본 `card-company-impersonation`) | 2026-10-21 — **185/185 PASS × 11 시나리오**(§93 — 챌린지 가능 8종 × 22 · 고급 전용 3종은 자가 세션 파트 E만 × 3, main `7dcabcf` + §92). ⚠️ `functions/.env`가 없는 워크트리는 비밀이 아닌 파라미터(LLM_PROVIDER · FALLBACK_VOICE_*)를 대화형으로 물어 멈춘다 — 임시 `functions/.env.demo-test`(자리표시 값)를 만들고 끝나면 지웠다(이 파일은 gitignore 밖 — 커밋 금지) · 2026-10-20 — **18/18 PASS × 4 시나리오**(card-company · institutional · loan-refinance · courier-customs, main `6156c95`, LLM 키 없음 = Mock). ⚠️ 에뮬레이터 포트 9099/8080/5001 고정 |

## Report Template
```
### 결론: {한 줄 — 됐는가/안 됐는가/얼마나}
| 항목 | 결과 | 이전/기준값 | 근거 (파일:줄, 로그, 수치) |
### 문제/다음 단계: {있으면}
```

## Agent Workflow
- Agent contract (I/O, ownership, priority): AGENTS.md
- How to invoke agents: docs/PromptRules.md
- Completion criteria: docs/DefinitionOfDone.md
- Git rules: docs/GitWorkflow.md


## Change Workflow

Do not restart the entire workflow for every change.

Choose the earliest affected agent.

Examples:

- Documentation only → Docs
- Bug fix → Implementer → Reviewer → QA → Docs
- UI change → UX → Architect → Implementer → Reviewer → QA → Docs
- Feature addition → Planner → UX → Architect → Implementer → Reviewer → QA → Docs
- Architecture change → Architect → Implementer → Reviewer → QA → Docs

Never invoke upstream agents unless the change affects their responsibility.