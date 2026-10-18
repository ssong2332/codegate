---
name: codegate-scammer-speech-safety
description: 2026-10-17 사기범 대사 실존 은행명·5~7문장 버그 수정(미등재) — 출력 필터 2종 신설, 한글 부분문자열 오탐(당신한테→신한), Git Bash sed -i가 CRLF를 지우는 함정
metadata:
  type: project
---

2026-10-17 조정 세션 명세로 구현(커밋은 조정 세션 몫). 신규 `guardrails/realFinancialNames.ts`(실존 은행·카드사명 → OO은행/OO카드)와 `roleplay/replyLength.ts`(문장 수 상한 3)을 sendMessage·openingLine에서 `finalizeScammerReplyText` 앞에 배선. functions 895→923 / root 432 유지.

**Why:** 라이브에서 모델이 "OO"을 빈칸으로 읽고 실존 은행명을 채웠고, CONVERSATION_STYLE "1~3문장"을 5~7문장으로 어겼다. 문면 강화는 T167과 겹쳐 런타임 상한으로 처리.

**How to apply:**
- 짧은 한글 브랜드명 정규식은 일반 낱말 안에 박힌다 — `신한`은 "당신한테·자신한테·확신한"에 걸린다. `(?<![가-힣])` 앞 경계 필수(`\b` 금지). 명세 목록을 그대로 쓰라고 해도 이런 건 형태 조정 + 보고.
- "중소기업은행·한국산업은행·한국수출입은행·스탠다드차타드은행"처럼 정식 명칭의 앞/뒤 수식어가 남으면 "중소OO은행"·"OO은행은행"이 된다 — 수식어를 선택 그룹으로 함께 먹는다.
- ⚠️ 이 저장소 작업 파일은 CRLF(autocrlf=true). **Git Bash `sed -i`가 CRLF를 LF로 바꿔 버린다** — 편집 후 `grep -c $'\r'`로 확인하고, 줄 단위 편집은 python `newline=''`로 한다.
- turnInstruction 주입 턴에 상한을 걸면 G343("말하지 않은 예고") 재발 — 상한은 `turnInstruction === undefined`일 때만. 관련: [[codegate-t83-verify-intercept]].
