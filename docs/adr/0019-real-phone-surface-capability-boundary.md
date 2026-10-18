# ADR-0019: 실폰형 표면 — 플랫폼 능력 경계에 맞춘 출력·자산·스킨 공유 모델

- Status: proposed
- Date: 2026-10-18
- Owner: architect
- DECISIONS.md entry: #122 · #123

## Context
제품 오너가 통화(UX-014)·통화 중 문자(UX-027)·메신저 문자형(UX-022)·이체 랜딩(UX-023)을 "실제 폰처럼" 만들라고 지시했고, 사용자 결정(2026-10-18, UX D-96~D-102)이 정확 모사 · 스킨별 벨소리/진동 · 수화부↔스피커 실제 전환(불가 시 음량 대체) · 자동 기종 감지 · 가짜 주소 · OS 자산은 라이선스 확인 후 사용을 요구했다. 웹앱은 출력 경로·진동·자동재생·기종 식별·OS 자산에서 브라우저와 라이선스가 허용하는 범위만 쓸 수 있고, 그 범위가 플랫폼마다 다르다(`docs/Architecture.md` §73.2). 동시에 세션 중 표식 0(T187 · PR #291)과 기존 소스 스캔 게이트(G80 · G138 · G436~G449 등)가 파일 단위로 묶여 있어, 구조를 잘못 나누면 게이트가 조용히 우회된다.

## Decision
**플랫폼이 보장하는 능력만으로 실폰 재현을 구성한다 — 출력은 음량 전환(Android 확정 · iOS는 실기 프로브 뒤 선택적 추가), 자산은 OS 파일 0(시스템 글꼴 · 자체 SVG · Web Audio 합성), 스킨은 감지 규칙표 v2 + 단일 해석 함수를 모든 기기 재현 표면이 공유하고, in-call 랜딩은 문자함 대화상자 안의 뷰로 넣는다.**

| Option | Pros | Cons |
|---|---|---|
| 능력 경계 모델(이 결정) ✅ | Android·iOS·데스크톱 모두에서 버튼이 실제로 무언가를 바꾼다(P-37 R-6) · 새 의존성·환경변수 0 · 라이선스 위반 0 · 게이트 앵커 파일 유지 | Android의 "스피커 모드"는 실제 스피커 전환이 아니라 음량 차이다(사용자 보고 필요) · OS 글꼴은 데스크톱에서 다르게 보인다 · iOS 벨은 세션 직전 탭이 없으면 무음일 수 있다 |
| 실제 출력 전환 우선(`setSinkId`/Audio Session) | 실제 폰과 같은 동작 | Android에 API 없음(MDN BCD `chrome_android: false`) · iOS도 수화부/스피커 선택 근거 0(WebKit 184141 NEW) — 대부분의 기기에서 동작하지 않는 버튼이 된다 |
| OS 자산 파일 사용(SF Pro·SF Symbols·OS 벨소리) | 시각·청각 정확도 최대 | Apple 글꼴 라이선스가 웹 임베드·재배포 금지를 명문화 · 다른 자산은 재배포 허락 근거 0 · User의 accepted risk는 "모사"이지 계약 위반이 아니다 |
| 오픈 아이콘 세트 의존성(Lucide ISC · Material Symbols Apache-2.0) | 제작 비용 감소 | 라이선스 고지 의무 · 실폰 형태 재현은 어차피 자체 조정 필요 — 자체 SVG가 막힐 때만 허용(§73.3 A-7) |
| 랜딩을 별도 대화상자로 유지 | 기존 구조 무변경 | `aria-modal` 2겹 · 키 트랩이 뒤에 깔린 패널을 돈다 · D-94 숨김 마운트가 별도 상태 관리 필요 |

## Consequences
- Positive: D-102(벨 직전 고지)와 세션 중 칩 제거가 보류돼도 나머지 전부가 독립 구현된다(§73.12 (4)) · 접근성 하한이 대비 자동 계산 게이트(G456)로 정밀 재현 뒤에도 유지된다 · 문자함/랜딩의 단일 대화상자 구조가 G26 원칙을 in-call 경로에도 성립시킨다.
- Negative / accepted trade-offs: D-98은 Android에서 "실제 전환"을 충족하지 못한다(대체 — 사용자 보고 OQ-A94) · iOS 텍스트 폴백 경로는 음량 제어 불가(칸 비활성 — OQ-A97) · 실기 측정 전 수치는 UX 근사값 · 삼성 인터넷 강제 다크는 막을 수 없다.
- Follow-ups required: 실기 프로브 P-1~P-6(§73.17 · 기기·담당 OQ-A98) · iOS 실제 전환 성립 시 별 커밋(§73.3 S-3) · OQ-U64/OQ-U66 해제 후 T190-6b/T190-8 · `docs/Database.md`에 `linkAddress` 등재 · planner T190 행 등재. User 승인 시 Status → accepted(DECISIONS 새 행).

---
*Copy this file to `NNNN-slug.md` (numbering starts at 0001, never reuse numbers). Accepted ADRs are immutable — to change course, write a new ADR that supersedes this one.*
