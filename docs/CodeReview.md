# Code Review Log — codegate (AI 금융사기 백신)

Owner: docs agent (proxy record only — see "왜 docs가 이 파일을 만드는가" below). 이 문서는 **신규 파일**이다 — 이전에는 저장소 어디에도 리뷰 결과가 남는 곳이 없었다.

## 왜 이 파일이 지금까지 없었는가 (구조적 문제)

`AGENTS.md:8`(Prohibitions) — *"reviewer, quality-assurance: never modify any file. Output is a report only."* `AGENTS.md` Agent Contract Table(`:48-49`)도 reviewer/quality-assurance의 "May modify" 칸을 **"Nothing"** 으로 못박는다. 즉 **reviewer/QA는 규정상 자기 판정을 저장소에 남길 수 없다** — 판정은 PR 리뷰·코멘트로만 존재하고, 그 PR이 머지·정리되면(또는 다음 세션이 그 대화를 못 보면) **판정 자체가 영구히 사라진다.**

이 파일은 그 갭을 메우기 위해 **docs가 대신 등재**한다(`AGENTS.md`의 docs 산출물 목록에 이 파일이 명시돼 있지는 않지만, 오케스트레이터 지시로 이번에 신설했다 — README.md/CHANGELOG.md와 달리 이 파일의 소유권은 `AGENTS.md`에 아직 정식 등재돼 있지 않다). **⚠️ docs는 reviewer가 아니다** — 아래 각 행은 docs가 직접 diff를 읽고 내린 판정이 아니라, **오케스트레이터가 보관한 PR 리뷰/코멘트 요약을 그대로 옮겨 적은 인용값**이다. 원문 전문은 각 PR의 GitHub 리뷰/코멘트에 있으며 `gh pr view <번호> --json comments`로 확인할 수 있다(docs는 이번 세션에 `gh`·git log 실행 수단이 없어 원문을 직접 대조하지 못했다).

**미해결 메타 이슈**: `AGENTS.md`는 User 소유라 docs가 편집할 수 없고, `docs/UpdateRequests.md`의 Owning Agent는 planner/ux-design/architect 셋뿐이라 이 갭(reviewer가 자기 기록을 못 남기는 구조) 자체를 그 표에 등재할 수 없다 — 등재하면 셋 중 누구도 처리할 권한이 없는 행을 만드는 것이 된다. 이 문제는 **User(오케스트레이터)에게 직접 보고**한다: `AGENTS.md`에 이 파일(`docs/CodeReview.md`)의 소유권과 등재 규칙을 정식으로 추가할지 판단이 필요하다.

## Rules (docs가 임시로 정한 잠정 규칙 — User 확정 전까지)
- 행은 docs가 추가한다. reviewer/QA 자신은 쓰지 않는다(위 구조적 이유).
- 과거 행은 재작성하지 않는다(append-only) — `docs/UpdateRequests.md`와 동일한 관례를 따른다.
- 모든 행은 "인용값"임을 전제한다 — docs가 diff를 직접 대조해 검증한 것이 아니다.

## Log — 2026-07-28~29 리뷰/QA (PR #149~#158)

| # | PR | 대상 | 유형 | 판정 | 핵심 근거 (인용값) |
|---|---|---|---|---|---|
| 1 | #149 | T129 다중 랜딩 트립와이어 | reviewer | **APPROVED** | Critical 0 · Major 0. 금지 3파일(카탈로그·판정 함수·마커 파서) 변경 0줄. 실패 메시지가 "숫자를 고치지 말고 (b)를 선행 커밋으로"를 담아 다음 작업자가 트립와이어를 오해하지 않게 함. |
| 2 | #150 | T131 §31·§32 버전 정합 | reviewer | **APPROVED** | reviewer가 Major 2건(줄번호 정확성 관련)을 제기했으나, **오케스트레이터가 반증** — reviewer가 브랜치가 아니라 base를 읽어 줄번호가 정확히 -5 오프셋이었던 것으로 확인됨. |
| 3 | #152 | T130 매니페스트 트립와이어 | reviewer | **APPROVED** | Major 2건(① postinstall 종료코드 비대칭, ② OQ-A25 사용자 승인 기록 공백) 제기 → 반영 완료 확인 후 승인. |
| 4 | #152 | 〃 (QA) | quality-assurance | **GO** | ⭐ **`core.hooksPath`가 절대 경로라 병합 전에는 어느 워크트리에서도 신규 pre-commit 블록이 걸리지 않음**을 실측 — "병합 자체가 곧 해결 수단"이라는 구조적 사실을 QA가 실측으로 확인. |
| 5 | #153 | §37 키 페일오버 설계 (docs/gemini-key-failover-design) | reviewer | **APPROVED** | Major 1건: `PerMinute` 문자열 분류가 실측이 아니라 유추인데 그 사실을 알리는 딱지가 없었음 → 반영. |
| 6 | #155 | T128 인증 무효화(재로그인 유도) | reviewer | **APPROVED** | `hadUser` 조건 분기가 AC-027 원문과 부합함을 확인. OQ-A23(사용자가 "솔직히 끝났다고 알리고 처음부터" 선택) 승인 기록이 실재함을 확인. |
| 7 | #155 | 〃 (QA) | quality-assurance | **GO** | 역검증 재현 — 정상 상태 27개 라우트 완주 시 무효화 배너 **0회** 발화(과잉 로그아웃 없음)를 확인. |
| 8 | #156 | T132 Gemini 키 페일오버 구현 | reviewer | **APPROVED** | ⭐ reviewer가 게이트를 직접 훼손해 봄으로써 "`fetch` 호출 2회만 확인하면(키가 바뀌었는지 확인 안 하면) 거짓 통과할 수 있다"를 실증 — 그 결과 `x-goog-api-key` 헤더 불일치 단언(증거 ①ⓒ)이 필수로 요구됨. |
| 9 | #156 | 〃 (QA) | quality-assurance | **조건부 GO** | 증거 ①ⓒ(키 헤더 불일치 확인)가 약 15% 간헐 실패 → 조사 결과 원인은 **공유 워크트리 빌드 오염**(오케스트레이터 운용 실수)으로 추정됨 — 코드 결함이 아니라는 판정이나 재발 방지책은 별도. |
| 10 | #157 | §38 확인창구 전환 순서 (설계 문서) | reviewer | **CHANGES_REQUESTED → 반영 후 재승인** | Major 1건: 같은 문장이 재사용되는 지점을 놓침 — 전수 grep 결과 reviewer가 지목한 2곳이 아니라 실제로는 **3곳**이었음 → 반영 후 승인. |
| 11 | #158 | AC-081 + T136·T137 | reviewer | **APPROVED** | Major 1건: AC 문면 안에 인용된 코드 문구가 이미 스테일(다른 값으로 바뀐 뒤) → 심볼명 + 문구 원문 + 줄번호 3종을 병기하는 방식으로 정정. |

## 참고 — docs가 대조한 다른 문서와의 정합성 (docs 자체 실측)

- T128(`docs/Tasks.md` 해당 행)의 Status 열은 이 등재 시점에도 **`review — reviewer·QA 대기`**로만 남아 있어, 위 #155 행의 APPROVED/GO 판정을 반영하지 못한다 — `docs/UpdateRequests.md`에 별도 등재(아래 참조).
- T129(같은 파일 해당 행)도 Status 열이 **`review`**로만 남아 있어 #149 APPROVED를 반영하지 못한다.
- T130도 Status 열이 **`review`**로만 남아 있어 #152 APPROVED·QA GO를 반영하지 못한다.
- T131은 Status 열이 여전히 **`todo — 등재만 완료`**로 남아 있어 #150 APPROVED와 더 크게 어긋난다(review조차 아닌 todo).
- T132도 Status 열이 **`review`**로만 남아 있어 #156 APPROVED·QA 조건부 GO를 반영하지 못한다.
- T136·T137은 Status 열이 여전히 **`todo — 등재만 완료(planner, 2026-07-29). 착수 전.`**으로 남아 있어, #158이 이 둘을 구현·승인된 것으로 서술하는 것과 정면으로 모순된다.

이 정합성 문제들은 `docs/Tasks.md` 소유자인 planner 소관이라 docs가 직접 고치지 않고 `docs/UpdateRequests.md`에 등재했다.
