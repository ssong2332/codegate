---
name: project-codegate-t187-session-markers
description: T187 세션 중 표식 제거 구현에서 설계(§72)가 못 본 3곳 — 콘솔 리터럴, 따옴표 자기 인용, "가상 은행" 허용목록; Windows 셸 편집 함정
metadata:
  type: project
---

T187(2026-10-18, 커밋 c123bf6 · 1afd136 · 7401a7f, Status=review, 배포 0 — OQ-49 법무 전)에서 architect 설계(§72, 셸 없이 작성)와 실측이 갈린 곳 3건:
1. `renderableTextFragments` 축은 호출 맥락을 안 가린다 → messenger의 `console.warn("[T84] 모의 화면…")`이 G437에 걸림. 로그 문자열을 "목업"으로 바꿈(보고).
2. 프롬프트가 메타 규칙을 따옴표로 **자기 인용**한다(`"페이로드는 가상값만 쓴다"`) → 설계 T1(따옴표=대사 층)대로면 오탐. "따옴표 밖 본문에 글자 그대로 있는 인용구 = 메타" 규칙 추가.
3. 허용목록 4행으로는 `가상 은행의 이름이다`(무해화 메타)가 T2에 걸림 → 5행째 추가. 둘 다 lib JS를 직접 고쳐 A/B로 필요성 실증.

**Why:** 셸 없는 설계자의 "0건" 표는 문면 전수 실측이 아니다 — 첫 실행에서 반드시 hit 목록을 뽑아 본다.
**How to apply:** 낱말 게이트 신설 시 먼저 probe로 전 hit을 컨텍스트와 함께 출력하고, 설계 밖 처리는 보고에 근거와 함께 올린다. 편집은 Edit 도구 또는 `perl -pi`(CRLF 보존) — `sed -i`는 CRLF를 지우고, Windows python heredoc은 한글이 cp949로 깨진다. [[project-codegate-s50-live-reports-6]]
