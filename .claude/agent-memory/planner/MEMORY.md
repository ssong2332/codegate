# Planner Memory Index

- [AC 번호 예약 금지](project_ac_number_reservation.md) — 예약 번호는 반드시 소진된다(5회) · 소진 경로는 행·브랜치명·커밋 트레일러 3종
- [AC·완료 증거 작성 형식](project_ac_verifiability.md) — 판정 불가 문장 금지, 역방향 확인·before/after 수치 필수, 추적성 갭 처리 절차
- [편집만 하고 커밋 금지](feedback_edit_only_handoff.md) — 브랜치·커밋은 오케스트레이터 몫, 신규 행은 append만, 집행 패스는 재검토 금지
- [AC 문면 수정의 소급 영향](project_ac_amendment_retroactivity.md) — 실질 판정은 안 뒤집혀도 제출된 증거가 무효가 된다, 그래서 신설이 기본
- [후속 결함과 게이트 fixture 충돌](project_followup_fixture_collision.md) — 신고 발화가 선행 게이트의 "정상 샘플"로 박혀 있는지 등재 전 grep
- [사용자의 범위 좁히기 정정](feedback_user_scope_narrowing.md) — "그건 A에서 말한 거고 B는 아니야"는 새 요구가 아니라 범위 정정, 제외 범위와 담당 태스크를 명시
- [셸 없이 실측하는 법](project_no_shell_measurement.md) — base·커밋메시지는 `.git`·COMMIT_EDITMSG 직접 판독, ff 구간 해시 부재 ≠ 미병합, Glob 타임아웃 지도
- [점유된 행은 통째로 회피](feedback_row_ownership_conflict.md) — 브랜치명에 걸린 행·merged 행은 포인터 한 줄도 금지, todo 행만 append, 편집 후 열 수 8 재검증
- [지시문 전제 반증](project_premise_falsification.md) — "구조적으로 불가능"도 grep해 보라, "없다"가 아니라 "약하다"면 해결 방향이 통째로 바뀐다
- [워크트리 편집 격리](project_worktree_edit_isolation.md) — main 체크아웃은 읽기만 되고 편집은 거부된다, 워크트리 사본의 base 동일성을 먼저 증명하라
- [리뷰 판정 기록처](reference_codereview_log.md) — docs/CodeReview.md가 유일한 reviewer·QA 기록이나 항상 뒤처진다, PR 번호는 검증 불가
- [선례 인용은 라벨로 재grep](project_precedent_citation_drift.md) — "T116의 P1" 인용이 실제로는 T115였다, 한 칸 어긋난 선례가 근거를 통째로 무효화한다
- [판정표 확장 절차](project_rule_table_extension.md) — 적용 결과를 닫아 서술한 표엔 섞지 말고 분리, 강등 선례 보존용 방어 행 필수
- [수치 정정 규칙](project_baseline_correction.md) — 현재형 기준선만 고치고 과거 기록은 보존, 정정 전 전수 grep(부분 정정이 반복 실패 양식)
